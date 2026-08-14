import { useState, useEffect, useRef } from 'react';
import { Soundfont, Reverb, DrumMachine, Sampler, getDrumMachineNames } from 'smplr';
import InstrumentSettings from '../model/InstrumentSettings';
import { LOCAL_PERCUSSION_BUFFERS } from '../audio/drumKits';
import { createMelodicInstrument } from '../audio/localInstruments';
import { createChorus } from '../audio/chorusEffect';
import { createTremolo } from '../audio/tremoloEffect';
import logger from '../utils/logger';

const VALID_DRUM_KITS = new Set(getDrumMachineNames());

const useInstruments = (context) => {
  // Settings
  const [trebleSettings, setTrebleSettings] = useState(
    InstrumentSettings.defaultTrebleInstrumentSettings()
  );
  const [bassSettings, setBassSettings] = useState(
    InstrumentSettings.defaultBassInstrumentSettings()
  );
  const [percussionSettings, setPercussionSettings] = useState(
    InstrumentSettings.defaultPercussionInstrumentSettings()
  );
  const [metronomeSettings, setMetronomeSettings] = useState(
    InstrumentSettings.defaultMetronomeInstrumentSettings()
  );
  const [chordSettings, setChordSettings] = useState(
    InstrumentSettings.defaultChordInstrumentSettings()
  );

  // Track the loaded slug per type so we can skip recreation when nothing changed
  const slugsRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  const instancesRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  const manualInstancesRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  const fadersRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  // #990: one chorus unit per instance (main = fader-routed, manual = direct), per type. Attached
  // UNIFORMLY to all five types — no `if (type === ...)` branch in shared wiring (§9c check 5).
  // Silent at rest (strength 0), so the always-on units cost ~30 idle oscillators/delays, which is
  // nothing next to the reverb AudioWorklets and the WebGL foliage loop already running.
  const chorusRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });
  // #990 follow-up: tremolo is an INSERT (not a send like chorus — see tremoloEffect.js's doc
  // comment for why), so it lives on the PERSISTENT per-type channel infrastructure (created once
  // alongside the fader, never torn down on an instrument swap), not per-instrument like chorus.
  // `main` sits after the fader, `manual` is the stable destination every manual instrument
  // instance connects to instead of context.destination directly.
  const tremoloRef = useRef({ treble: null, bass: null, percussion: null, metronome: null, chords: null });

  const [treble, setTreble] = useState(null);
  const [bass, setBass] = useState(null);
  const [percussion, setPercussion] = useState(null);
  const [metronome, setMetronome] = useState(null);
  const [chords, setChords] = useState(null);

  const [manualTreble, setManualTreble] = useState(null);
  const [manualBass, setManualBass] = useState(null);
  const [manualPercussion, setManualPercussion] = useState(null);
  const [manualMetronome, setManualMetronome] = useState(null);

  // #663 (Han 2026-08-03 bug: "cello niet hoorbaar"): the instrument SLOT (`bass`/etc. state
  // above) and the SETTINGS (`bassSettings.instrument`) update in DIFFERENT React commits —
  // `setBassSettings('cello')` commits first; `updateInstrument` below reacts to that in ITS
  // OWN effect and only THEN calls `setBass(newInst)`, one commit later. A caller gating on
  // `bassSettings.instrument === 'cello'` can catch the FIRST commit, where `bass` is still the
  // PREVIOUS (stale) instrument — exactly the race that silently scheduled Level 2's cello
  // through the wrong/old instrument. `loadedSlug` is written in the SAME effect, SAME
  // synchronous call, right where the instance setter fires — so `loadedSlug.bass === 'cello'`
  // is only ever true in the SAME commit where `bass` is truly the rebuilt cello instance.
  const [loadedSlug, setLoadedSlug] = useState({ treble: null, bass: null, percussion: null, metronome: null, chords: null });

  useEffect(() => {
    if (!context) return;

    // Initialize faders + tremolo inserts if they don't exist
    ['treble', 'bass', 'percussion', 'metronome', 'chords'].forEach(type => {
      if (!tremoloRef.current[type]) {
        tremoloRef.current[type] = {
          main: createTremolo(context, { destination: context.destination }),
          manual: createTremolo(context, { destination: context.destination }),
        };
      }
      if (!fadersRef.current[type]) {
        const gain = context.createGain();
        gain.connect(tremoloRef.current[type].main.input); // fader -> tremolo insert -> destination
        fadersRef.current[type] = gain;
      }
    });

    // Helper to only recreate if slug changes
    const updateInstrument = (type, settings, setter, manualSetter = null, Effect = null, effectMix = 0) => {
      if (slugsRef.current[type] === settings.instrument) return; // Already loaded

      // #4 (Han): after switching instruments many times no sound was heard. The old instance was
      // only .stop()'d, so its output channel — including the Reverb AudioWorklet added below via
      // addEffect — stayed connected to the fader, and its scheduler kept running. Every switch
      // leaked those nodes; enough of them clog the AudioContext graph until nothing is audible.
      // smplr's disconnect() ("Stop all voices, disconnect the output channel, and stop the
      // scheduler") tears the old instance down fully before we replace it.
      const current = instancesRef.current[type];
      const currentManual = manualInstancesRef.current[type];
      if (current) { try { current.disconnect(); } catch { /* may already be gone */ } }
      if (currentManual) { try { currentManual.disconnect(); } catch { /* may already be gone */ } }
      // #990: the chorus units are added to those channels via addEffect, so they are part of the
      // very same "#4" leak — tear them down in the same place, not later.
      const currentChorus = chorusRef.current[type];
      if (currentChorus) {
        try { currentChorus.main?.disconnect(); } catch { /* may already be gone */ }
        try { currentChorus.manual?.disconnect(); } catch { /* may already be gone */ }
        chorusRef.current[type] = null;
      }

      let newInst, newManualInst;
      try {
        const dest = fadersRef.current[type];
        // Manual (click/QWERTY) instances route through the type's persistent manual-tremolo
        // insert instead of straight to context.destination — see tremoloRef above.
        const manualDest = tremoloRef.current[type].manual.input;
        if (type === 'percussion') {
          const isGMKit = ['standard', 'electronic', 'jazz'].includes(settings.instrument);
          const isLocalKit = settings.instrument === 'FreePats Percussion';

          if (isLocalKit) {
            const percSamplerOpts = { destination: dest, buffers: LOCAL_PERCUSSION_BUFFERS, detune: 0, decayTime: 0.3, lpfCutoffHz: 20000 };
            newInst = new Sampler(context, percSamplerOpts);
            newManualInst = new Sampler(context, { ...percSamplerOpts, destination: manualDest });
          } else if (isGMKit) {
            newInst = new Soundfont(context, { instrument: settings.instrument, destination: dest, disableScheduler: true });
            newManualInst = new Soundfont(context, { instrument: settings.instrument, destination: manualDest, disableScheduler: true });
          } else {
            if (!VALID_DRUM_KITS.has(settings.instrument)) {
              logger.warn('useInstruments', `Invalid drum kit: "${settings.instrument}".`);
              return;
            }
            newInst = new DrumMachine(context, { instrument: settings.instrument, destination: dest, disableScheduler: true });
            newManualInst = new DrumMachine(context, { instrument: settings.instrument, destination: manualDest, disableScheduler: true });
          }
        } else {
          // #955: local sample first (offline-capable), CDN Soundfont fallback for any slug not
          // covered by the extracted set — same decision createMelodicInstrument makes for every
          // other one-off melodic instance in the app (App.jsx's timpani/cello/wizard-preview,
          // playInstrumentPreview.js, useConversationInstruments.js, useWorldAmbientMusic.js).
          newInst = createMelodicInstrument(context, settings.instrument, { destination: dest });
          newManualInst = createMelodicInstrument(context, settings.instrument, { destination: manualDest });
        }
      } catch (e) {
        logger.error('useInstruments', 'E011-INSTRUMENT-CREATE', e, { instrument: settings.instrument });
        return;
      }

      if (Effect) {
        newInst.output.addEffect('reverb', new Effect(context), effectMix);
        newManualInst.output.addEffect('reverb', new Effect(context), effectMix);
      }

      // #990 chorus: attached for EVERY type (Han: the effect must be available on whichever
      // channel is the level's current input mode — treble level → treble, bass level → bass,
      // percussion level → percussion — so it cannot be hardcoded to the melodic channels).
      // The send mix is a CONSTANT 1; the audible amount is controlled inside the unit via
      // setStrength (smplr's sendEffect writes gain.value directly = an audible step/click).
      // Both units route their wet path through the SAME destination the dry signal uses
      // (fader for main, tremolo insert for manual) so per-instrument volume AND the tremolo
      // insert both apply to the chorused signal too — chorus=1 + tremolo=0.7 on a wrong note
      // must be audible together, not chorus bypassing the tremolo insert.
      const mainChorus = createChorus(context, { destination: fadersRef.current[type] });
      const manualChorus = createChorus(context, { destination: tremoloRef.current[type].manual.input });
      newInst.output.addEffect('chorus', mainChorus, 1);
      newManualInst.output.addEffect('chorus', manualChorus, 1);
      chorusRef.current[type] = { main: mainChorus, manual: manualChorus };

      slugsRef.current[type] = settings.instrument;
      instancesRef.current[type] = newInst;
      manualInstancesRef.current[type] = newManualInst;
      setter(newInst);
      if (manualSetter) manualSetter(newManualInst);
      setLoadedSlug((prev) => ({ ...prev, [type]: settings.instrument }));
    };

    updateInstrument('treble', trebleSettings, setTreble, setManualTreble, Reverb, 0.1);
    updateInstrument('bass', bassSettings, setBass, setManualBass);
    updateInstrument('percussion', percussionSettings, setPercussion, setManualPercussion);
    updateInstrument('chords', chordSettings, setChords, null, Reverb, 0.15);
    updateInstrument('metronome', metronomeSettings, setMetronome, setManualMetronome);

  // Only the instrument name (`.instrument`) is a dep — intentionally narrow to avoid
  // re-creating smplr instances on every settings change (e.g. volume, reverb).
  // ESLint flags the full objects (bassSettings etc.) but the full objects are not needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context,
    trebleSettings.instrument,
    bassSettings.instrument,
    percussionSettings.instrument,
    metronomeSettings.instrument,
    chordSettings.instrument
  ]);

  const setVolume = (type, volume, time = null) => {
    const fader = fadersRef.current[type];
    if (fader && context) {
      const targetTime = time || context.currentTime;
      // Smooth transition to avoid clicks
      fader.gain.setTargetAtTime(volume, targetTime, 0.05);
    }
  };

  /**
   * #990: set the chorus amount (0…1) on one instrument channel. Deliberately the same
   * imperative shape as `setVolume` above — this file owns instrument output wiring, and audio
   * params are written straight to the Web Audio graph, never routed through React state.
   * Applies to BOTH the fader-routed instance (sequencer, MIDI) and the manual instance
   * (PianoView clicks, QWERTY), so every way of producing a note sounds identical.
   */
  const setChorusStrength = (type, strength, rampSec = 0.03) => {
    const unit = chorusRef.current[type];
    if (!unit) return;
    unit.main?.setStrength(strength, { rampSec });
    unit.manual?.setStrength(strength, { rampSec });
  };

  /**
   * #990 follow-up: set the tremolo depth (0…1) on one channel. Same imperative shape as
   * setChorusStrength/setVolume above. Unlike chorus, the tremolo units are on the PERSISTENT
   * per-type infrastructure (tremoloRef, created once, never torn down on an instrument swap —
   * see the tremoloRef declaration above), so this never has to guard against a mid-swap gap.
   */
  const setTremoloStrength = (type, strength, rampSec = 0.03) => {
    const unit = tremoloRef.current[type];
    if (!unit) return;
    unit.main?.setStrength(strength, { rampSec });
    unit.manual?.setStrength(strength, { rampSec });
  };

  return {
    instruments: { treble, bass, percussion, metronome, chords },
    loadedSlug,
    manualInstruments: { treble: manualTreble, bass: manualBass, percussion: manualPercussion, metronome: manualMetronome },
    settings: {
      treble: [trebleSettings, setTrebleSettings],
      bass: [bassSettings, setBassSettings],
      percussion: [percussionSettings, setPercussionSettings],
      metronome: [metronomeSettings, setMetronomeSettings],
      chords: [chordSettings, setChordSettings],
    },
    setVolume,
    setChorusStrength,
    setTremoloStrength,
  };
};

export default useInstruments;
