import { resolveNotePitch } from './playSound';
import { PERCUSSION_INTERRUPT_GROUP, METRONOME_NOTE_IDS } from './drumKits';

const playMelodies = (
  melodies,
  instruments,
  context,
  bpm,
  scheduledStart = context.currentTime,
  abortControllerRef = null,
  tickRange = null,
  namedInstruments = null,
  customMapping = null,
  trackGains = null
) => {
  // Restore output channel volume on every instrument we're about to play.
  // Sequencer.stop() hard-mutes each instrument's output (setVolume(0)) so
  // smplr's per-voice release envelopes ramp down inaudibly when the user
  // presses Stop — without this, the next playback would schedule notes into
  // a still-muted channel and the user would hear nothing. Idempotent for
  // channels that are already at 100, so it's safe to run on every entry.
  const allInstruments = namedInstruments
    ? Object.values(namedInstruments).filter(Boolean)
    : (instruments || []).filter(Boolean);
  allInstruments.forEach(inst => {
    try { inst.output?.setVolume?.(100); } catch { /* output API absent */ }
  });

  const timeFactor = 5 / bpm;
  const safetyBuffer = 0.05;
  const adjustedStart = Math.max(scheduledStart, context.currentTime + safetyBuffer);

  const queue = [];
  for (let index = 0; index < melodies.length; index++) {
    const melody = melodies[index];
    if (!melody) continue;
    const { notes, durations, offsets } = melody;
    const defaultInstrument = instruments[index];
    if (!defaultInstrument) continue;

    // Fermata hold + cumulative shift (Han 2026-05-29 revision). The note's
    // audio duration is extended by `hold`, AND every subsequent note's audio
    // start time is delayed by the same amount. Han: "de noot moet langer
    // doorklinken, maar de rest van de melodie moet uitgesteld worden". This
    // matches real fermata performance — the held note pushes the next phrase
    // later in time. Visual stays at natural offsets (the renderer is unaware
    // of fermatas other than to draw the glyph above the held note), so the
    // moving-cursor highlight follows audio while the static page shows the
    // natural rhythm.
    const fermataHoldByIdx = new Map();
    const fermataShiftByIdx = new Array(notes.length).fill(0);
    if (melody.fermatas) {
      for (const f of melody.fermatas) {
        if (f && f.noteIndex != null && f.hold > 0) fermataHoldByIdx.set(f.noteIndex, f.hold);
      }
      // Build per-note cumulative shift: the shift at index i is the sum of
      // all fermata holds at indices < i. The fermata note itself sounds at
      // its natural offset+shift (= unshifted by its own hold).
      let shift = 0;
      for (let k = 0; k < notes.length; k++) {
        fermataShiftByIdx[k] = shift;
        const h = fermataHoldByIdx.get(k);
        if (h) shift += h;
      }
    }

    // Identify track name to apply trackGains if provided.
    let trackName = 'treble';
    if (namedInstruments) {
      if (defaultInstrument === namedInstruments.bass) trackName = 'bass';
      else if (defaultInstrument === namedInstruments.percussion) trackName = 'percussion';
      else if (defaultInstrument === namedInstruments.chords) trackName = 'chords';
      else if (defaultInstrument === namedInstruments.metronome) trackName = 'metronome';
    }
    const baseTrackGain = trackGains && trackGains[trackName] !== undefined ? trackGains[trackName] : 1;

    // Skip tracking entirely if gain is exactly 0
    if (baseTrackGain === 0) continue;

    for (let i = 0; i < notes.length; i++) {
      const timestamp = offsets[i];
      if (tickRange && (timestamp < tickRange[0] || timestamp >= tickRange[1])) continue;

      const rawNote = notes[i];
      const items = Array.isArray(rawNote) ? rawNote : [rawNote];

      if (items.length > 0) {
        const relativeTick = tickRange ? timestamp - tickRange[0] : timestamp;
        const strumDelay = 0.02; // 20ms stagger between notes in a chord

        items.forEach((id, pitchIdx) => {
          const pitch = resolveNotePitch(id, customMapping);
          if (pitch === null) return;

          // ROUTING: woodblock/metronome notes (METRONOME_NOTE_IDS) resolve to MIDI numbers and must
          // go to the metronome Soundfont. Fall back to defaultInstrument for tracks like 'claves'.
          const noteInstrument = (namedInstruments && namedInstruments.metronome && METRONOME_NOTE_IDS.has(id))
            ? namedInstruments.metronome
            : defaultInstrument;

          if (!noteInstrument) return;

          const stagger = melody.strummingEnabled ? pitchIdx * strumDelay : 0;
          let gain = (melody.volumes && melody.volumes[i] != null) ? melody.volumes[i] : (melody.gain ?? 1);
          // Apply track round multiplier
          gain = gain * baseTrackGain;
          // Ghost snare plays at 49% of the current track volume (70% baseline, −30%)
          if (id === 'sg') gain = gain * 0.49;

          const interruptGroup = PERCUSSION_INTERRUPT_GROUP[id] ?? null;

          const fermataHold = fermataHoldByIdx.get(i) || 0;
          const fermataShift = fermataShiftByIdx[i] || 0;
          queue.push({
            pitch,
            instrument: noteInstrument,
            // fermataShift delays this note's audio start; for the fermata note
            // itself it's the cumulative shift from earlier fermatas (0 if it's
            // the first), and `+ fermataHold` extends its sounding length.
            time: adjustedStart + (relativeTick + fermataShift) * timeFactor + stagger,
            // Percussion samples play to their natural end; use a large duration so smplr
            // never forces an early cutoff. Choke happens via stopId (see playback loop).
            duration: interruptGroup ? 60 : (durations[i] + fermataHold) * timeFactor,
            gain,
            interruptGroup,
          });
        });
      }
    }
  }

  // 2. Chronological sorting
  queue.sort((a, b) => a.time - b.time);

  // 3. Ultra-fast Scheduling Loop (minimal logic inside)
  const isAborted = () => abortControllerRef?.current?.signal?.aborted;

  if (isAborted()) return 0;

  for (let i = 0; i < queue.length; i++) {
    // Intermittent abort check
    if (i % 20 === 0 && isAborted()) break;

    const item = queue[i];
    const startOpts = {
      note: item.pitch,
      time: item.time,
      duration: item.duration,
    };
    if (item.gain !== undefined) {
      startOpts.gain = item.gain;
      startOpts.velocity = Math.floor(item.gain * 127);
    }
    if (item.interruptGroup) {
      // Choke any previously-playing member of this group at the exact start time,
      // then tag this new note so it can be choked by the next one in the group.
      item.instrument.stop({ stopId: item.interruptGroup, time: item.time });
      startOpts.stopId = item.interruptGroup;
    }
    item.instrument.start(startOpts);
  }

  // Return the end time of the last note + its duration
  // Since queue is sorted by start time, we must check all to find max(end) or just iterate.
  // Actually, queue is sorted by start time. The last starting note isn't necessarily the last ending one (if short).
  // Calculate max end time.
  let maxEndTime = adjustedStart;
  for (const item of queue) {
    // Skip percussion items — their 60 s duration is a synthetic "play to end" sentinel,
    // not a real note length. The Sequencer timing should only reflect melodic notes.
    if (item.interruptGroup) continue;
    if (item.time + item.duration > maxEndTime) {
      maxEndTime = item.time + item.duration;
    }
  }
  return maxEndTime;
};

export default playMelodies;
