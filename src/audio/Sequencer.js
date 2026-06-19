import playMelodies from './playMelodies';
import { TICKS_PER_WHOLE } from '../constants/timing.js';
import { transposeMelodyToScale, transposeMelodyBySemitones, getNoteIndex, modulateMelody, calculateRelativeRange } from '../theory/musicUtils';
import Melody from '../model/Melody';
import MelodyGenerator from '../generation/melodyGenerator';
import {
  randomTonic,
  scaleDefinitions,
  updateScaleWithTonic,
  updateScaleWithMode,
  getBestEnharmonicTonic,
} from '../theory/scaleHandler';
import { getRelativeNoteName } from '../theory/convertToDisplayNotes';

import { generateProgression } from '../theory/chordGenerator';
import { insertPassingChords } from '../generation/passingChords';
import { generateDeterministicRhythm } from '../generation/rhythmicPriorities';
import Chord from '../model/Chord';
import ChordProgression from '../model/ChordProgression';
import Song from '../model/Song';
import { sliceMelodyByMeasure, sliceChordsForMeasure, sliceMelodyByRange } from '../utils/melodySlice';
import { planPaginationSequence, PAGINATION_VARIANTS } from './transitionPlanner';
import logger from '../utils/logger';
import { getChordsWithSlashes } from '../theory/chordLabelHandler';
import { getHarmonyAtDifficulty } from '../utils/harmonyTable';
import { getMelodyAtDifficulty } from '../utils/melodyDifficultyTable';
import { PRESET_RANGES } from '../constants/musicLayout';
import { GLOBAL_RESOLUTION } from '../constants/generatorDefaults';
import { buildAnacrusisRepeatParts, hasAnacrusis } from '../utils/anacrusisRepeat';

class Sequencer {
  constructor(config) {
    this.abortController = null;
    this.isPlaying = false;

    // Hooks / Callbacks
    this.setters = config.setters; // { setTreble, setBass, setPercussion, setVolume, onStop, ... }
    this.refs = config.refs; // { bpmRef, timeSignatureRef, numMeasuresRef, scaleRef, playbackConfigRef }
    this.instruments = config.instruments;
    this.context = config.context;
    this.percussionScale = config.percussionScale;
    this.timeouts = [];
    this.playbackState = null;
    this.scheduledNotes = null;
    this.pregenResult = null; // pre-generated next melody for scroll/wipe advance preview
    // Tracks the animation mode currently applied to the playback loop.
    // When this differs from `animationModeRef.current` at the start of a
    // measure, the inner loop performs a hard reset of all transition refs
    // before adopting the new mode — prevents stale wipe/scroll/pagination
    // state from leaking across a mid-playback mode change (Han 2026-05-28).
    this.activeAnimationMode = null;
  }

  async start(initialMelodies, once = false, initialMeasureIndex = 0, repeatForever = false) {
    if (this.isPlaying) {
      return;
    }
    this.isPlaying = true;
    this.abortController = new AbortController();
    // Channel-volume restoration after stop() hard-mute lives in playMelodies
    // so every entry path (sequencer, scale preview, one-shot) restores audibly
    // without each caller having to remember.
    // Capture the controller for this session. When stop() is called and a new start()
    // immediately follows, this.abortController is replaced. Using a local const ensures
    // this session's loop always checks its OWN controller, not the new session's.
    const sessionController = this.abortController;

    let { treble, bass, percussion, chordProgression } = initialMelodies;

    let currentTS = [...this.refs.timeSignatureRef.current];
    let currentMetronome = this.refs.metronomeRef.current;

    // ── Anacrusis REPEAT (arch §40) ────────────────────────────────────────────
    // In any LOOPING mode a pickup song must loop its BODY (the measures after the
    // pickup bar) with the pickup merged into the last bar, and sound the leading pickup
    // exactly ONCE. Replaying the padded m0 each loop would re-insert a full dead bar
    // between the merged pickup (end of the last bar) and the downbeat it leads into.
    // Gated to LOOPING playback (= !once: repeat OR continuous; Han 2026-06-15) + a treble
    // carrying a real pickup, so once-mode and non-pickup songs are untouched. The detection is
    // the SHARED `hasAnacrusis` predicate (anacrusisRepeat.js) — the SAME one App.jsx's
    // label-suppression + render body-merge gate on, so audio and render never disagree (item 4).
    // For continuous mode this fires only for the FIRST (loaded) series; later series are
    // regenerated with no pickup, so hasAnacrusis is false there and nothing is merged.
    const ml = (TICKS_PER_WHOLE * currentTS[0]) / currentTS[1];
    let anacrusisIntro = null;          // { melodies, instruments, pickupStart, measureLen } | null
    let anacrusisBodyMeasures = null;
    if (!once && hasAnacrusis(treble, ml)) {
      const trebleParts = buildAnacrusisRepeatParts(treble, ml);
      if (trebleParts.hasAnacrusis) {
        const pickupStart = treble.offsets[0];
        // Convert a util body-part (plain object, offsets already rebased to 0) back into a Melody.
        // `fermatas` are absolute song ticks on the ORIGINAL padded melody → shift by -ml and drop
        // any that fell inside the removed pickup bar (the util leaves fermatas untouched).
        const toBody = (orig, part) => {
          if (!part) return null;
          const m = new Melody(
            [...part.notes], [...part.durations], [...part.offsets],
            part.displayNotes ? [...part.displayNotes] : undefined
          );
          if (part.lyrics) m.lyrics = [...part.lyrics];
          if (orig?.rhythmicGrouping) m.rhythmicGrouping = orig.rhythmicGrouping;
          if (Array.isArray(orig?.fermatas)) {
            m.fermatas = orig.fermatas.map(f => ({ ...f, tick: f.tick - ml })).filter(f => f.tick >= 0);
          }
          return m;
        };

        const parts = {
          bass: bass?.offsets?.length ? buildAnacrusisRepeatParts(bass, ml) : null,
          percussion: percussion?.offsets?.length ? buildAnacrusisRepeatParts(percussion, ml) : null,
          chords: chordProgression?.offsets?.length ? buildAnacrusisRepeatParts(chordProgression, ml) : null,
        };

        // Capture the one-time intro (pickup) from the ORIGINAL tracks BEFORE overwriting them.
        // The intro is scheduled via playMelodies with tickRange = [pickupStart, ml] so only the
        // pickup notes sound; only tracks that actually have a pickup note contribute.
        const introMelodies = [];
        const introInstruments = [];
        if (trebleParts.intro) { introMelodies.push(treble); introInstruments.push(this.instruments.treble); }
        if (parts.bass?.intro) { introMelodies.push(bass); introInstruments.push(this.instruments.bass); }
        if (parts.percussion?.intro) { introMelodies.push(percussion); introInstruments.push(this.instruments.percussion); }
        if (parts.chords?.intro && chordProgression?.notes) { introMelodies.push(chordProgression); introInstruments.push(this.instruments.chords); }
        anacrusisIntro = { melodies: introMelodies, instruments: introInstruments, pickupStart, measureLen: ml };

        // Swap each track to its merged body. Chords/bass with no pickup still rebase via loopMerged
        // (=== loopClean for them, straddlers clipped), so they stay aligned with the shortened loop.
        treble = toBody(treble, trebleParts.loopMerged);
        if (parts.bass) bass = toBody(bass, parts.bass.loopMerged);
        if (parts.percussion) percussion = toBody(percussion, parts.percussion.loopMerged);
        if (parts.chords && chordProgression?.notes) {
          const cBody = toBody(chordProgression, parts.chords.loopMerged);
          cBody.type = chordProgression.type;
          cBody.complexity = chordProgression.complexity;
          cBody.modality = chordProgression.modality;
          chordProgression = cBody;
        }
        anacrusisBodyMeasures = trebleParts.bodyMeasures;
      }
    }

    let currentNumMeasures = once ? Math.max(
      this._measureSpan(treble, currentTS),
      this._measureSpan(bass, currentTS),
      this._measureSpan(percussion, currentTS),
      this._measureSpan(chordProgression, currentTS)
    ) : this.refs.numMeasuresRef.current;

    if (currentNumMeasures === 0) currentNumMeasures = this.refs.numMeasuresRef.current;

    // Anacrusis repeat shortens the loop to the body (the pickup bar is removed and played once).
    if (anacrusisBodyMeasures != null) {
      currentNumMeasures = anacrusisBodyMeasures;
    }

    // If a harmony difficulty target is active, regenerate initial melodies so that
    // the first round obeys the target (subsequent rounds go through randomizeScaleAndGenerate).
    // Skipped in once/play-once mode — that plays the current melody as-is with no randomization.
    if (!once && this.refs.targetHarmonicDifficultyRef?.current != null) {
      const firstResult = this.randomizeScaleAndGenerate(
        currentNumMeasures, currentTS, { treble, bass, percussion, chordProgression }
      );
      treble = firstResult.treble || treble;
      bass = firstResult.bass || bass;
      percussion = firstResult.percussion || percussion;
      chordProgression = firstResult.chordProgression || chordProgression;
      this.applyResultToSetters(firstResult, { initialLoad: true });
      if (firstResult.generatedNumMeasures) {
        currentNumMeasures = firstResult.generatedNumMeasures;
      }
    }

    // Metronome must follow the SONG actually being played, not the stale value left in
    // state. (1) Regenerate it for the current meter + measure count so a loaded song (e.g.
    // HBD in 3/4) doesn't click on the leftover 4/4 default that was never refreshed on
    // song-load. (2) Attach the active fermatas so the click grid is HELD through a fermata
    // in lockstep with the melody/chords (Han 2026-06-15 M1: "keep the hold, sync the rest").
    // playMelodies shifts a track only when it carries `.fermatas`; the metronome never did,
    // so its clicks ran on the un-shifted grid and drifted ~1.5 beats after the [name] hold.
    // (The continuous-generation path re-derives the metronome per round at its own site,
    // line ~851, where generated melodies carry no fermatas — nothing to sync there.)
    currentMetronome = Melody.updateMetronome(
      currentTS, currentNumMeasures,
      this.refs.instrumentSettingsRef.current.metronome?.smallestNoteDenom || 4
    );
    if (Array.isArray(treble?.fermatas) && treble.fermatas.length) {
      currentMetronome.fermatas = treble.fermatas.map(f => ({ ...f }));
    }

    // Initialize displayChordProgression for App state / sheet-music labels.
    // Must be done unconditionally — previous session's value may be stale.
    // chordProgressionRef lags React async state, so use initialMelodies directly.
    {
      const cp = chordProgression;
      // rhythmic Melody → displayNotes = Chord[]; abstract ChordProgression → chords = Chord[]
      const displayChords = cp?.displayNotes?.length
        ? cp.displayNotes
        : cp?.chords?.length ? cp.chords : null;
      if (displayChords) {
        this.displayChordProgression = new ChordProgression(
          displayChords,
          cp.complexity || 'triad',
          cp.type || 'modal-random',
          cp.modality || 'modal',
        );
        this.displayChordProgression.totalMeasures = currentNumMeasures;
        this.setters.setDisplayChordProgression?.(this.displayChordProgression);
      }
    }

    // If chordProgression is abstract (no .offsets), generate a rhythmic version so
    // schedChords is populated from measure 0 onward.
    if (!once && !chordProgression?.offsets) {
      const chords = chordProgression?.chords?.length ? chordProgression.chords
        : chordProgression?.displayNotes?.length ? chordProgression.displayNotes : null;
      if (chords) {
        const ts = currentTS;
        const chordSettings = this.refs.instrumentSettingsRef?.current?.chords;
        const activeScale = this.refs.scaleRef.current;
        const measureSlots = (GLOBAL_RESOLUTION * ts[0]) / ts[1];
        const globalTemplate = generateDeterministicRhythm(1, ts, measureSlots, 'default', GLOBAL_RESOLUTION);
        const chordGen = new MelodyGenerator(
          activeScale, currentNumMeasures, ts,
          {
            notesPerMeasure: chordSettings?.chordCount || 1,
            smallestNoteDenom: ts[1] || 4,
            rhythmVariability: chordSettings?.rhythmVariability || 0,
            enableTriplets: false,
            notePool: chords,
            playStyle: 'chord',
            type: 'progression',
            randomizationRule: 'progression',
          },
          null, null, Date.now().toString(), globalTemplate
        );
        const chordMelody = chordGen.generateMelody();
        chordMelody.type = chordProgression?.type;
        chordMelody.complexity = chordProgression?.complexity;
        chordMelody.modality = chordProgression?.modality;
        chordProgression = chordMelody;
      }
    }

    let nextStartTime = this.context.currentTime + 0.1;

    // Anacrusis repeat: sound the leading pickup ONCE as a lead-in, then begin the loop on the
    // downbeat. tickRange = [pickupStart, ml] means only the pickup notes play; advancing
    // nextStartTime by the pickup span lands the loop's first downbeat right after the pickup.
    if (anacrusisIntro && anacrusisIntro.melodies.length > 0) {
      const introBpm = this.refs.bpmRef.current;
      const introTf = 5 / introBpm;
      playMelodies(
        anacrusisIntro.melodies, anacrusisIntro.instruments, this.context, introBpm,
        nextStartTime, { current: sessionController },
        [anacrusisIntro.pickupStart, anacrusisIntro.measureLen],
        this.instruments,
        this.refs.percussionCustomMappingRef?.current ?? null,
        null
      );
      nextStartTime += (anacrusisIntro.measureLen - anacrusisIntro.pickupStart) * introTf;
    }

    this.melodyCount = 0;
    let iteration = 0;
    this.globalMeasureIndex = initialMeasureIndex;
    this.isOnceMode = once;
    // Repeat mode: loop the same melody indefinitely without regenerating.
    // The outer while stays alive (isOnceMode=false, totalMelodies=-1); after each
    // repsPerMelody passes the block below resets iteration without incrementing melodyCount.
    this.isRepeatMode = repeatForever;
    // Repeat-numbering origin for INDEFINITE repeats (repsPerMelody === -1). In indefinite mode the
    // BarlinesLayer suffix must GROW UNBOUNDED (maat 1 on pass 7 = "1.7", pass 1000 = "1.1000"), so
    // blockPlayStart — the value computeRepeatPass subtracts from startMeasureIndex — must be PINNED to
    // the session's first body play-start and NOT refreshed on each per-pass re-arm (which is what pins
    // the suffix at 1 in finite mode). null until the first indefinite arm sets it; reset per session
    // because start() rebuilds all playback state. Finite mode never reads this (it keeps refreshing).
    this.repeatNumberingOrigin = null;
    this.song = Song.empty();
    this.songVersion = 0;
    this.scheduledMeasures = [];
    this.scheduledChords = [];
    // Reset visual state immediately so SheetMusic clears stale content from a prior session
    if (this.setters.setCurrentMeasureIndex) this.setters.setCurrentMeasureIndex(0);

    try {
      while (
        this.isPlaying &&
        (!this.isOnceMode || this.melodyCount < 1) &&
        (this.refs.playbackConfigRef.current.totalMelodies === -1 ||
          this.melodyCount < this.refs.playbackConfigRef.current.totalMelodies)
      ) {
        if (sessionController.signal.aborted) break;

        const measureLengthTicks = (TICKS_PER_WHOLE * currentTS[0]) / currentTS[1];

        // Capture repsPerMelody once per repeat iteration
        let repsPerMelody = this.isOnceMode ? 1 : this.refs.playbackConfigRef.current.repsPerMelody;

        // iteration 0, 2, 4… → "odd rounds" (Round 1); iteration 1, 3, 5… → "even rounds" (Round 2)
        const isOddRound = iteration % 2 === 0;
        const wipeRoundBatched = (this.refs.animationModeRef?.current === 'wipe');
        if (this.setters.setIsOddRound && !wipeRoundBatched) {
          // Schedule isOddRound update to happen at nextStartTime.
          // In wipe mode this is folded into the m===0 batched callback below
          // (alongside setStartMeasureIndex + setNextLayer(null)) so all three
          // commit in one React render — preventing a 1-frame flash where the
          // wipe mask clears while the old round's visibility config is still
          // active. Same pattern as the red-wipe series-boundary batch ~L739.
          const scheduleTime = Math.max(0, (nextStartTime - this.context.currentTime) * 1000);
          this.scheduleTimeout(() => {
            if (this.isPlaying) this.setters.setIsOddRound(isOddRound);
          }, scheduleTime);
        }

        // Removed master volume fader setVolume calls to allow natural sample decay across measure boundaries.
        // Per-track volumes are now passed directly into playMelodies.

        const startM = (iteration === 0 && this.melodyCount === 0) ? (initialMeasureIndex % currentNumMeasures) : 0;

        // ── Pagination scheduler: one-shot arming for the whole sequence block ──
        // The new pagination architecture replaces the per-measure animation refs
        // (paginationFadeRef, setNextLayer('block-flip')/('yellow')/('red')) with a
        // single planner-driven event stream. Arm at iteration === 0 of each new
        // sequence block; the scheduler schedules transitionRef + setNextLayer +
        // setStartMeasureIndex + applyResult for every visual/repeat/series flip.
        //
        // The inner-loop and outer-loop pagination paths below are gated to skip
        // their work when the scheduler is active.
        const sequenceMode = this.refs.animationModeRef?.current ?? 'pagination';
        if (iteration === 0 && sequenceMode === 'pagination') {
          const variant = this.refs.paginationVariantRef?.current ?? 'mid';
          const blocksRaw = this.refs.musicalBlocksRef?.current || [currentNumMeasures];
          const sumBlocks = blocksRaw.reduce((a, b) => a + b, 0);
          // Defensive: if musicalBlocks doesn't sum to currentNumMeasures (stale ref
          // after numMeasures change), fall back to a single block.
          const blocks = sumBlocks === currentNumMeasures ? blocksRaw : [currentNumMeasures];
          const tf = 5 / this.refs.bpmRef.current;
          const baseAudioTime = nextStartTime - startM * measureLengthTicks * tf;
          this._armPaginationSequence({
            baseAudioTime,
            sequenceStartGlobalMeasure: this.globalMeasureIndex - startM,
            plan: {
              numMeasures: currentNumMeasures,
              repsPerMelody: Math.max(1, repsPerMelody),
              measureLengthTicks,
              musicalBlocks: blocks,
            },
            variant,
            currentMelodies: { treble, bass, percussion, chordProgression },
            startSkipTick: startM * measureLengthTicks,
          });
        }

        for (let m = startM; m < currentNumMeasures; m++) {
          const currentBpm = this.refs.bpmRef.current;
          const activeConfig = isOddRound
            ? this.refs.playbackConfigRef.current.oddRounds
            : this.refs.playbackConfigRef.current.evenRounds;

          const timeFactor = 5 / currentBpm;
          const measureDuration = measureLengthTicks * timeFactor;

          // User requested lookahead of exactly one half note (120/bpm seconds)
          const lookahead = 120 / currentBpm;

          // Fade-in fires at lookahead before the measure; fade-out fires at the
          // last quarter note of the previous measure (one beat before the transition).
          const quarterNote = 12 * timeFactor; // seconds

          const visibilityTrigger = (visible) => visible ? nextStartTime - lookahead : nextStartTime - quarterNote;

          // Display-state changes (showNotes, startMeasureIndex, nextLayer) fire at
          // wipeStateClearTime = nextStartTime (start of this iteration = animation end)
          // so content never changes mid-animation.
          const iterMode = this.refs.animationModeRef?.current ?? 'pagination';
          const wipeStateClearTime = nextStartTime; // start of this iteration = animation end

          // Schedule Sheet Music Visibility Update
          if (this.setters.setShowNotes) {
            const notesVisible = !!activeConfig.notes;
            // Non-wipe: use lookahead/quarterNote so notes fade in/out at the right time.
            // Wipe: fire at animation-end so visibility never changes mid-wipe.
            const showNotesTime = iterMode === 'wipe' ? wipeStateClearTime : visibilityTrigger(notesVisible);
            const scheduleTime = Math.max(0, (showNotesTime - this.context.currentTime) * 1000);
            this.scheduleTimeout(() => { this.setters.setShowNotes(notesVisible); }, scheduleTime);
          }

          // All modes now use Song-based rendering with absolute globalMeasureIndex for
          // data-measure-index, so schedMeasureIndex = globalMeasureIndex in all modes.

          // At the start of each iteration, build Song slices and update startMeasureIndex
          // so the fallback rendering shows the correct global measure numbers.
          if (m === 0) {
            const tonic = this.refs.scaleRef.current?.tonic ?? null;
            const numAccidentals = this.refs.scaleRef.current?.numAccidentals ?? 0;
            const slices = this._buildIterationSlices(
              treble, bass, percussion, chordProgression, currentMetronome,
              currentNumMeasures, measureLengthTicks, currentTS,
              tonic, numAccidentals, isOddRound, this.globalMeasureIndex, this.melodyCount, iteration
            );
            this.song.appendMeasures(slices);
            if (this.setters.setSong) this.setters.setSong(this.song, ++this.songVersion);
            // setStartMeasureIndex and setNextLayer(null): both fire at wipeStateClearTime in
            // wipe mode (= nextStartTime + 0.2m) so the content never changes mid-animation.
            // In non-wipe modes they fire at nextStartTime as before.
            //
            // Pagination mode skips this: the planner-driven scheduler armed at sequence-block
            // start owns setStartMeasureIndex + setNextLayer for the whole block. Setting them
            // here would race with the scheduler's lang-variant overshoot (clears overlay too
            // early — before fadeEnd).
            if (iterMode !== 'pagination') {
              const startIdx = this.globalMeasureIndex;
              // +25ms buffer: setTimeout(fn,0) fires before the next requestAnimationFrame, so
              // without the buffer setNextLayer(null) triggers useLayoutEffect while the rAF
              // crossfade animation is still in progress (e.g. old at 70% faded). useLayoutEffect
              // clears style.opacity, snapping old from 0.7 → 1 — a visible brightness pop.
              // 25ms ≈ 1.5 rAF frames at 60 fps, enough for the animation to reach completion.
              const iterStateMs = Math.max(25, (wipeStateClearTime - this.context.currentTime) * 1000 + 25);
              const oddRoundForBatch = isOddRound;
              this.scheduleTimeout(() => {
                // All three in one callback so React 18 automatic batching merges them
                // into a single render. Without this batch, setIsOddRound's separate
                // setTimeout (~25ms earlier) committed a render where the OLD wipe-role
                // group still had the previous round's visibility — and when the
                // mask-clear render finally landed 25ms later, the user saw 1 frame of
                // that stale content peeking through. wipeTransitionRef is cleared by
                // the useLayoutEffect in useSheetMusicTransitions after the commit.
                if (this.setters.setStartMeasureIndex) this.setters.setStartMeasureIndex(startIdx);
                if (this.setters.setNextLayer) this.setters.setNextLayer(null);
                if (wipeRoundBatched && this.setters.setIsOddRound) {
                  this.setters.setIsOddRound(oddRoundForBatch);
                }
              }, iterStateMs);
            }
          }

          // Per-measure: record when this measure's audio starts so the rAF loop
          // can drive setCurrentMeasureIndex from the AudioContext clock instead of
          // a setTimeout (which drifts 10-50ms and causes highlight flicker).
          {
            const gIdx = this.globalMeasureIndex;
            const audioNow = this.context.currentTime;
            // Prune entries more than 2 s in the past to keep the array small.
            this.scheduledMeasures = this.scheduledMeasures
              .filter(sched => audioNow < sched.audioTime + 2)
              .concat({ audioTime: nextStartTime, globalMeasureIndex: gIdx });

            // Trigger onMeasureStart setter if present
            if (this.setters.onMeasureStart) {
              const scheduleTime = Math.max(0, (nextStartTime - audioNow) * 1000);
              this.scheduleTimeout(() => {
                if (this.isPlaying) this.setters.onMeasureStart(gIdx);
              }, scheduleTime);
            }
          }

          // Visual-block flip within a sequence block (pagination only):
          //   Owned by _armPaginationSequence — see armed events at sequence-block start.
          //   The scheduler handles fade timing, content swap, and overlay rendering for
          //   ALL three boundary kinds (visual-flip / repeat-flip / series-flip) uniformly.

          // Schedule Chord Label Visibility Update
          if (this.setters.setShowChordLabels) {
            const chordsVisible = isOddRound
              ? !!(this.refs.showChordsOddRoundsRef?.current ?? true)
              : !!(this.refs.showChordsEvenRoundsRef?.current ?? true);
            const scheduleTime = Math.max(0, (visibilityTrigger(chordsVisible) - this.context.currentTime) * 1000);
            this.scheduleTimeout(() => { this.setters.setShowChordLabels(chordsVisible); }, scheduleTime);
          }


          const melodiesToPlay = [];
          const instrumentsToPlay = [];
          const liveSettings = this.refs.instrumentSettingsRef.current;

          if (activeConfig.treble > 0 && treble) {
            melodiesToPlay.push({ ...treble, strummingEnabled: liveSettings?.treble?.strummingEnabled });
            instrumentsToPlay.push(this.instruments.treble);
          }
          if (activeConfig.bass > 0 && bass) {
            melodiesToPlay.push({ ...bass, strummingEnabled: liveSettings?.bass?.strummingEnabled });
            instrumentsToPlay.push(this.instruments.bass);
          }
          if (activeConfig.percussion > 0 && percussion) {
            melodiesToPlay.push({ ...percussion, strummingEnabled: liveSettings?.percussion?.strummingEnabled });
            instrumentsToPlay.push(this.instruments.percussion);
          }

          if (activeConfig.chords > 0 && chordProgression) {
            // chordProgression is a Melody object where .notes = string[][] (ready for audio)
            // and .displayNotes = Chord[] (for SheetMusic labels).
            // Read chordSettings fresh from ref — NOT from randomizeScaleAndGenerate's scope
            const liveChordSettings = this.refs.instrumentSettingsRef.current?.chords;
            // chordDisplayMode==='off' (chord-selector X) fully disables chord audio.
            const chordsDisabled = this.refs.chordsDisabledRef?.current === true;
            const chordVolume = chordsDisabled ? 0 : activeConfig.chords;
            if (chordVolume > 0 && chordProgression.notes && chordProgression.offsets && chordProgression.notes.length > 0) {
              const chordMelodyWithGain = {
                ...chordProgression,
                strummingEnabled: liveChordSettings?.strummingEnabled
              };
              melodiesToPlay.push(chordMelodyWithGain);
              instrumentsToPlay.push(this.instruments.chords);
            }
          }

          if (activeConfig.metronome > 0 && currentMetronome) {
            melodiesToPlay.push({ ...currentMetronome, strummingEnabled: liveSettings?.metronome?.strummingEnabled });
            instrumentsToPlay.push(this.instruments.metronome);
          }

          if (melodiesToPlay.length > 0) {
            playMelodies(
              melodiesToPlay,
              instrumentsToPlay,
              this.context,
              currentBpm,
              nextStartTime,
              { current: sessionController },
              [m * measureLengthTicks, (m + 1) * measureLengthTicks],
              this.instruments,
              this.refs.percussionCustomMappingRef?.current ?? null,
              {
                treble: activeConfig.treble,
                bass: activeConfig.bass,
                percussion: activeConfig.percussion,
                chords: activeConfig.chords,
                metronome: activeConfig.metronome
              }
            );
          }

          this.playbackState = {
            measureStartTime: nextStartTime,
            timeFactor,
            measureLengthTicks,
            measureIndex: m,
          };

          // Precompute exact audio timestamps for each note so the rAF loop
          // can compare context.currentTime directly — no rounding via Math.floor.
          // Fermata-aware (Han 2026-05-29 round 17): if a melody carries
          // song-level fermatas {tick, hold}, the cumulative shift up to each
          // note's offset is added to the audio time, and any note that sits
          // AT a fermata tick gets its duration extended by hold. This keeps
          // scheduledNotes aligned with what playMelodies actually scheduled,
          // so the moving-cursor highlight pauses on the fermata note for the
          // full hold instead of racing ahead on natural time.
          const schedNotes = [];
          // All modes use Song-based rendering: DOM data-measure-index = Song's measure.measureIndex
          // = globalMeasureIndex. schedNotes must match.
          const schedMeasureIndex = this.globalMeasureIndex;
          for (const [mel, melName] of [[treble, 'treble'], [bass, 'bass'], [percussion, 'percussion']]) {
            if (!mel?.offsets) continue;
            const fermataEvents = Array.isArray(mel.fermatas)
              ? mel.fermatas.filter(f => f && typeof f.tick === 'number' && typeof f.hold === 'number' && f.hold > 0)
              : [];
            for (let i = 0; i < mel.offsets.length; i++) {
              const slot = mel.offsets[i];
              if (slot >= m * measureLengthTicks && slot < (m + 1) * measureLengthTicks) {
                let shift = 0;
                let extraHold = 0;
                for (const f of fermataEvents) {
                  if (slot > f.tick) shift += f.hold;
                  if (slot === f.tick) extraHold += f.hold;
                }
                schedNotes.push({
                  audioTime: nextStartTime + (slot - m * measureLengthTicks + shift) * timeFactor,
                  duration: (mel.durations[i] + extraHold) * timeFactor,
                  slot,
                  mel: melName,
                  measureIndex: schedMeasureIndex,
                  localSlot: slot - m * measureLengthTicks,
                });
              }
            }
          }
          // Also precompute chord timestamps for sheet-music and chord-grid highlighting.
          // `degree` is embedded so the ChordGrid rAF needs no React state at all —
          // same pattern as scheduledNotes for note-active highlighting.
          const schedChords = this.buildScheduledChords(
            chordProgression, m, measureLengthTicks, nextStartTime, measureDuration, timeFactor, schedMeasureIndex
          );

          // Append to existing notes/chords rather than replacing: entries from the
          // previous measure that are still within their audio window are kept so
          // the rAF loop can highlight them across the lookahead boundary.
          // Fully-expired entries are pruned here to keep the array small.
          const audioNow = this.context.currentTime;
          const stillActive = (this.scheduledNotes || []).filter(n => audioNow < n.audioTime + n.duration);
          this.scheduledNotes = [...stillActive, ...schedNotes];
          const stillActiveChords = (this.scheduledChords || []).filter(c => audioNow < c.audioTime + c.duration);
          this.scheduledChords = [...stillActiveChords, ...schedChords];
          const isLastRepNow = repsPerMelody !== -1 && iteration === repsPerMelody - 1;
          const isLastMeasureNow = (currentNumMeasures - m) === 1;
          const isPenultimateMeasure = (currentNumMeasures - m) === 2;
          const skipSleep = isLastRepNow && isLastMeasureNow;

          const mode = this.refs.animationModeRef?.current ?? 'pagination';

          // Mid-playback animation-mode change: when the user toggles mode
          // (e.g. scroll → wipe) during playback, the new mode's render path
          // would otherwise be driven by the previous mode's transition refs,
          // producing broken / glitchy animations (Han 2026-05-28: "wipe is
          // terug gebroken"). At the start of each measure, detect the change
          // and HARD RESET: clear every transition ref + overlay state so the
          // next iteration starts from a clean slate. The user accepts a brief
          // visual reset at the boundary as the cost of the mode switch.
          if (this.activeAnimationMode !== mode) {
            if (this.refs.wipeTransitionRef) this.refs.wipeTransitionRef.current = null;
            if (this.refs.scrollTransitionRef) this.refs.scrollTransitionRef.current = null;
            if (this.refs.transitionRef) this.refs.transitionRef.current = null;
            if (this.refs.paginationFadeRef) this.refs.paginationFadeRef.current = null;
            if (this.setters.setNextLayer) this.setters.setNextLayer(null);
            if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(null);
            this.activeAnimationMode = mode;
          }

          // === Continuous scroll bookkeeping (per measure) ============================
          // Maintains scrollTransitionRef = { startTime, startPageFraction, secondsPerPage }.
          // rAF reads this and computes
          //   pageFraction(now) = startPageFraction + (now - startTime) / secondsPerPage
          //   tx(now) = (0.25 - pageFraction) * pageWidth   (0.25 = playhead position)
          // so the currently-playing note always sits at the 25% playhead (audio/visual sync,
          // no offset — unlike the previous +0.75m linger).
          //
          // The anchor stays continuous across reps AND series transitions:
          //  - BPM change at this measure boundary T: snap secondsPerPage, keep tx continuous
          //    by setting startTime=T and startPageFraction=pageFraction(T) under the old rate.
          //    Mirrors the audio side, which also picks up the new BPM on the next measure.
          //  - Page boundary (end of one iteration = start of the next): in the same setTimeout
          //    that swaps melody state (applyResult for series, or a no-op for repeats),
          //    decrement startPageFraction by 1. The just-swapped content's first note (DOM x
          //    moves from +pageWidth to 0 across the swap) lands at the same visual position —
          //    invisible swap.
          if (!this.isOnceMode && mode === 'scroll' && this.refs.scrollTransitionRef) {
            const T = nextStartTime;
            const newSecondsPerPage = currentNumMeasures * measureDuration;
            const cur = this.refs.scrollTransitionRef.current;
            if (!cur) {
              // Intro delay (Han 2026-05-28): keep notes still for the first 0.25
              // measures of playback so the listener can take in the first few notes
              // before the scroll engages. introDelaySeconds is consumed by the rAF
              // (see useSheetMusicHighlight scroll formula) and is a one-shot — once
              // wall-clock elapsed exceeds it the formula behaves normally.
              this.refs.scrollTransitionRef.current = {
                startTime: T,
                startPageFraction: 0,
                secondsPerPage: newSecondsPerPage,
                introDelaySeconds: 0.25 * newSecondsPerPage,
              };
            } else if (cur.secondsPerPage !== newSecondsPerPage) {
              const elapsed = Math.max(0, T - cur.startTime);
              const fractionAtT = cur.startPageFraction + elapsed / cur.secondsPerPage;
              this.refs.scrollTransitionRef.current = {
                startTime: T,
                startPageFraction: fractionAtT,
                secondsPerPage: newSecondsPerPage,
                // Preserve introDelaySeconds across BPM re-tunes. If the previous anchor
                // had one, keep it (already-elapsed time still counts against it).
                introDelaySeconds: cur.introDelaySeconds ?? 0,
              };
            }
            // Populate the right-side overlay at the start of each iteration so the ribbon
            // is never empty to the right of the playhead. 'yellow' = same-melody copy.
            // The penultimate-measure pregen below upgrades this to 'red' (new-melody preview).
            //
            // Publish iter index so SheetMusic knows how many reps remain in the series.
            // Used by scroll-mode per-panel content selection (current-series panels render
            // currentMelody, next-series panels render previewMelody).
            //
            // Tier 1.1 (2026-05-28, Bug 3 frame-flash fix): both setters MUST go in the
            // same scheduleTimeout callback. Two scheduleTimeout calls at identical
            // setLayerDelay are queued as separate macrotasks; React 18 auto-batching
            // only batches setters within the SAME callback. Separate callbacks can
            // commit in two paints, producing one frame where nextLayer='yellow' but
            // iterInCurrentSeries still holds the previous value — the K-panel scroll
            // overlay then renders the wrong offsets that frame (visible as a flash).
            if (m === 0) {
              const iterToSet = iteration;
              // Tier 1.1+ (Han 2026-05-28, residual 1-frame flit fix): when this m=0
              // is the START of the LAST rep in a multi-measure scroll-mode series,
              // pregen the next-series melody NOW (synchronous) and bundle
              // setNextLayer('red') + setPreviewMelody into the SAME callback as
              // the yellow + iter setter. Without this bundling there was a 1-frame
              // window between the yellow+iter render and the separate red+preview
              // render where right-side panels (filtered to i <= itersRemaining = 0)
              // showed no content — visible as a flash.
              const isLastRepStartForScrollPregen =
                !this.isOnceMode &&
                (this.refs.animationModeRef?.current ?? 'pagination') === 'scroll' &&
                isLastRepNow &&
                currentNumMeasures >= 2;
              let pregenForBatch = null;
              if (isLastRepStartForScrollPregen) {
                // Pregen synchronously. Cost (~10-50ms) happens here, BEFORE we
                // recompute setLayerDelay so the timeout still fires at audio time T.
                // Result is held on `this` so the outer-loop poll (line ~660) finds
                // it instead of generating again. applyResult clears pregenResult.
                pregenForBatch = this.randomizeScaleAndGenerate(
                  this.refs.numMeasuresRef.current,
                  this.refs.timeSignatureRef.current,
                  { treble, bass, percussion }
                );
                this.pregenResult = pregenForBatch;
              }
              const setLayerDelay = Math.max(0, (T - this.context.currentTime) * 1000);
              this.scheduleTimeout(() => {
                if (isLastRepStartForScrollPregen && pregenForBatch) {
                  if (this.setters.setNextLayer) this.setters.setNextLayer('red');
                  if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(pregenForBatch);
                } else {
                  if (this.setters.setNextLayer) this.setters.setNextLayer('yellow');
                }
                if (this.setters.setIterInCurrentSeries) this.setters.setIterInCurrentSeries(iterToSet);
              }, setLayerDelay);
            }
            // Repeat-boundary decrement: schedule startPageFraction-=1 at the END of this
            // iteration for non-last reps. The series-boundary applyResult callback handles
            // the decrement for the last rep — see "Apply result at block end" below.
            if (m === 0 && !isLastRepNow) {
              const T_swap = T + newSecondsPerPage;
              const swapDelay = Math.max(0, (T_swap - this.context.currentTime) * 1000);
              this.scheduleTimeout(() => {
                const c = this.refs.scrollTransitionRef?.current;
                if (c) c.startPageFraction -= 1;
              }, swapDelay);
            }
          }

          // Yellow overlay for wipe-mode mid-series repeat boundaries.
          // (Scroll's overlay is handled by the continuous-scroll block above.)
          if (!this.isOnceMode && !isLastRepNow) {
            if (mode === 'wipe' && isLastMeasureNow) {
              // Wipe-mode repeat-flip yellow overlay: 0.5 measures before block end.
              // (Pagination's repeat-flip is owned by _armPaginationSequence.)
              const yellowAudioTime = nextStartTime + 0.5 * measureDuration;
              const transitionEnd = nextStartTime + measureDuration; // = block end
              if (this.refs.wipeTransitionRef) {
                // Set ref immediately — rAF clamps p=0 until yellowAudioTime, so no visual jump.
                this.refs.wipeTransitionRef.current = { startTime: yellowAudioTime, endTime: transitionEnd };
              }
              // Trigger React ~100ms early so new content is in DOM before mask sweep.
              const setLayerMs = Math.max(0, (yellowAudioTime - this.context.currentTime) * 1000 - 100);
              this.scheduleTimeout(() => {
                if (this.setters.setNextLayer) this.setters.setNextLayer('yellow');
              }, setLayerMs);
            }
          }

          // Scroll: pregen + setNextLayer('red') + setPreviewMelody at the START of the
          // LAST rep (m=0 of last rep) is now BUNDLED INTO the m=0 setLayer+iter
          // timeout above (Han 2026-05-28 residual flit fix). Previously this lived
          // in a separate scheduleTimeout firing at the same delay, which React
          // committed in a separate render — that 1-frame window had iter=LAST and
          // previewMelody=null, so right-side panels (filtered to i > itersRemaining = 0)
          // were empty. Bundling eliminates the gap. See line ~510.
          //
          // For currentNumMeasures === 1 (one-measure melody): the N=1 special-case in
          // the outer loop (around line ~720) schedules setNextLayer('red') +
          // setPreviewMelody at boundary − 0.25 m. Multi-measure case is covered above.

          if (!skipSleep) {
            const sleepUntil = nextStartTime + measureDuration - lookahead;
            while (this.context.currentTime < sleepUntil) {
              if (sessionController.signal.aborted) break;
              await new Promise((r) => setTimeout(r, 10));
            }
          }
          if (sessionController.signal.aborted) break;

          nextStartTime += measureDuration;
          this.globalMeasureIndex++;
        }

        if (sessionController.signal.aborted) break;

        // Iteration-wide fermata extension (Han 2026-05-29 round 17). The
        // inner loop advances nextStartTime by measureDuration per measure (=
        // natural iteration duration). Fermata events delay subsequent notes
        // inside the iteration via playMelodies' internal shift logic, but the
        // OUTER iteration boundary stayed at the natural time — so the next
        // iteration's m=0 would start while the previous iteration's last
        // note (extended by the fermata hold) was still ringing into the
        // future. Sum the song-level fermata holds and push nextStartTime
        // forward so iteration 2 begins at the actual audio-end of iteration 1.
        const trebleFermatas = Array.isArray(treble?.fermatas) ? treble.fermatas : [];
        const totalIterationFermataHold = trebleFermatas.reduce(
          (acc, f) => acc + (f?.hold > 0 ? f.hold : 0), 0
        );
        if (totalIterationFermataHold > 0) {
          // `timeFactor` from the m===0 block above is out of scope here (it lives
          // in the per-measure loop body); recompute it from the same bpm ref using
          // the canonical 5/bpm seconds-per-tick convention used throughout. Without
          // this the line threw a ReferenceError whenever a fermata song repeated.
          const iterTimeFactor = 5 / this.refs.bpmRef.current;
          nextStartTime += totalIterationFermataHold * iterTimeFactor;
        }

        iteration++;

        if (repsPerMelody !== -1 && iteration >= repsPerMelody) {
          iteration = 0; // Reset for next cycle (repeat mode) or next melody (normal mode)

          if (this.isRepeatMode) {
            // Repeat-forever: keep playing the same melody. melodyCount stays 0 so the
            // outer while never exits due to totalMelodies. No regeneration happens.
          } else {
          this.melodyCount++;

          if (this.isOnceMode && this.melodyCount >= 1) {
            break;
          }

          if (
            this.refs.playbackConfigRef.current.totalMelodies === -1 ||
            this.melodyCount < this.refs.playbackConfigRef.current.totalMelodies
          ) {
            // Sync with latest manual changes if available
            if (this.refs.melodiesRef && this.refs.melodiesRef.current) {
              const current = this.refs.melodiesRef.current;
              if (current.treble) treble = current.treble;
              if (current.bass) bass = current.bass;
              if (current.percussion) percussion = current.percussion;
              if (current.chordProgression) chordProgression = current.chordProgression;
            }

            // USE LATEST state for generation!
            currentTS = this.refs.timeSignatureRef.current;

            // Pagination mode: AWAIT the scheduler's JIT generation rather than
            // racing it. The JIT setTimeout fires at boundary - genLead × measure
            // duration. The outer loop reads pregenResult at boundary - lookahead.
            // For snel (genLead=0.5m) at 4/4 the two deadlines coincide; for
            // larger time-sig denominators (3/4, 6/8) or low BPMs the outer loop
            // can FIRE FIRST, generating a fresh melody that diverges from what
            // the scheduler's arm callback will read for the overlay preview.
            // Result: overlay shows melody Y while audio plays melody X — a
            // visible mismatch that looks like "the overlay still shows the
            // current melody".
            //
            // Wait up to 250ms (50 × 5ms polls). The JIT deadline is well within
            // this window for all variants; if it hasn't fired, something is
            // wrong and we fall back to inline generation below.
            const seqMode = this.refs.animationModeRef?.current ?? 'pagination';
            if (seqMode === 'pagination' && !this.pregenResult && !this.isOnceMode) {
              for (let i = 0; i < 50 && !this.pregenResult && this.isPlaying; i++) {
                if (sessionController.signal.aborted) break;
                await new Promise(r => setTimeout(r, 5));
              }
            }

            // If still null (await timed out, or non-pagination mode), generate
            // fresh and STORE in pregenResult so the scheduler's arm callback
            // reads the SAME melody. This matters for the 'snel' variant where
            // the arm callback fires AFTER the outer code runs (arm at
            // atTick − 0.7s vs outer at atTick − lookahead = atTick − 1s at
            // 120 BPM 4/4). With the old code outer cleared pregenResult,
            // then arm found null and sync-generated a DIFFERENT random
            // melody — the overlay showed melody Y while the audio applied
            // melody X. Bug reported by Han 2026-05-25 / 2026-05-26.
            if (!this.pregenResult) {
              this.pregenResult = this.randomizeScaleAndGenerate(this.refs.numMeasuresRef.current, currentTS, {
                treble,
                bass,
                percussion,
              });
            }
            const result = this.pregenResult;
            // Do NOT clear pregenResult here. The applyResult closure clears
            // it AFTER the React commit (= after arm has had its chance to
            // read it). Cleared too early → arm sees null → sync-fallback
            // generates a different melody → preview/applied mismatch.

            currentNumMeasures = result.generatedNumMeasures || this.refs.numMeasuresRef.current;
            currentTS = [...this.refs.timeSignatureRef.current];
            currentMetronome = Melody.updateMetronome(
              currentTS,
              currentNumMeasures,
              this.refs.instrumentSettingsRef.current.metronome?.smallestNoteDenom || 4
            );

            treble = result.treble;
            bass = result.bass;
            percussion = result.percussion;
            chordProgression = result.chordProgression;

            const nextFirstRoundVisible = !!(this.refs.playbackConfigRef.current.oddRounds?.notes);
            const seriesStartMeasureIndex = this.globalMeasureIndex;

            // wipeTransitionRef is intentionally NOT cleared here: the useLayoutEffect in
            // App.jsx clears it (and removes the mask) synchronously after React commits the
            // new melody, preventing a 1-frame flash of the old melody.
            // Pagination scheduler owns the preview/fade lifecycle for its mode.
            // For the LANG variant (fade overshoots 0.25m past the boundary) the
            // applyResult must KEEP the overlay alive — the scheduler's separate
            // fadeEnd timeout will clear it later. For snel/mid (no overshoot)
            // applyResult clears the overlay in the same batch as the melody
            // refs, so the swap is atomic in one React render.
            const isPaginationOuter = (this.refs.animationModeRef?.current ?? 'pagination') === 'pagination';
            const outerVariantSpec = isPaginationOuter
              ? (PAGINATION_VARIANTS[this.refs.paginationVariantRef?.current ?? 'mid'] ?? PAGINATION_VARIANTS.mid)
              : null;
            const outerHasOvershoot = !!(outerVariantSpec && outerVariantSpec.fadeOvershootMeasures > 0);
            const applyResult = () => {
              this.applyResultToSetters(result, {
                seriesStartMeasureIndex,
                skipFadeCleanup: outerHasOvershoot,
              });
              // For snel/mid pagination: clear transitionRef in the same task so
              // the rAF stops writing inline opacity once React commits. The
              // setNextLayer(null) + setPreviewMelody(null) part is already
              // handled by applyResultToSetters when skipFadeCleanup is false.
              if (isPaginationOuter && !outerHasOvershoot && this.refs.transitionRef) {
                this.refs.transitionRef.current = null;
              }
              // Clear pregenResult AFTER the React commit (= after both the
              // outer-loop's read above AND the scheduler arm's read). The
              // NEXT block's JIT will generate fresh once its timeout fires
              // — pregenResult must be null by then so the JIT's
              // `if (this.pregenResult) return;` guard doesn't skip it.
              this.pregenResult = null;
            };

            // Schedule red preview overlay and apply result.
            if (!this.isOnceMode) {
              const previewMode = this.refs.animationModeRef?.current ?? 'pagination';
              const lastBpm = this.refs.bpmRef.current;
              const lastMeasureDuration = measureLengthTicks * (5 / lastBpm);

              if (previewMode === 'wipe') {
                // Set preview melody immediately so it is available when the wipe starts.
                // Include startMeasureIndex so the red overlay renders the correct measure numbers.
                if (this.setters.setPreviewMelody) this.setters.setPreviewMelody({ ...result, startMeasureIndex: seriesStartMeasureIndex });
                // Fire wipe animation 0.5m before block end, matching the yellow overlay timing.
                const wipeStart = nextStartTime - 0.5 * lastMeasureDuration;
                const wipeEnd   = nextStartTime; // animation ends at block end
                // Set ref immediately — rAF clamps p=0 until wipeStart arrives, so no visual jump.
                if (this.refs.wipeTransitionRef) {
                  this.refs.wipeTransitionRef.current = { startTime: wipeStart, endTime: wipeEnd };
                }
                // Trigger React render ~200ms before wipeStart so new content is in DOM and
                // hidden (via useLayoutEffect HIDDEN mask) before the sweep begins.
                const setLayerMs = Math.max(0, (wipeStart - this.context.currentTime) * 1000 - 200);
                this.scheduleTimeout(() => {
                  if (this.setters.setNextLayer) this.setters.setNextLayer('red');
                }, setLayerMs);
              } else if (previewMode === 'pagination') {
                // Owned by _armPaginationSequence — no preview scheduling here.
              } else if (previewMode === 'scroll' && currentNumMeasures === 1) {
                // Single-measure scroll: inner loop pregen (isPenultimateMeasure) never fires,
                // so handle here. Trigger setNextLayer('red') 0.25m before series boundary so
                // the red overlay (with pregen melody) is in the DOM before the page-boundary
                // swap. The continuous-scroll bookkeeping in the inner loop already maintains
                // scrollTransitionRef — no manual {startTime,endTime} writes needed.
                const redTriggerTime = nextStartTime - 0.25 * lastMeasureDuration;
                const redDelay = Math.max(0, (redTriggerTime - this.context.currentTime) * 1000);
                this.scheduleTimeout(() => {
                  if (this.setters.setNextLayer) this.setters.setNextLayer('red');
                  if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(result);
                }, redDelay);
              }
              // Multi-measure scroll: inner loop already set setNextLayer + scrollTransitionRef
              // at the correct audio time; nothing to do here.

              // Apply result at series boundary. For scroll mode the swap is audio/visual sync'd
              // at exactly nextStartTime: the just-pregen'd melody's first note (audio) plays
              // at T_series, and the red overlay (DOM x=+pageWidth) has visually reached the
              // 25% playhead at the same moment. The applyResult swap re-renders main with the
              // new melody (DOM x=0) — startPageFraction-=1 in the same callback offsets the
              // scroll formula by exactly one page so the new main first note stays at the
              // playhead. Invisible swap.
              const newSeriesStart = nextStartTime;
              const applyTime = nextStartTime;
              const scheduleTime = Math.max(0, (applyTime - this.context.currentTime) * 1000);
              this.scheduleTimeout(() => {
                if (this.setters.clearActiveHighlight) this.setters.clearActiveHighlight();
                if (this.scheduledNotes) {
                  this.scheduledNotes = this.scheduledNotes.filter(n => n.audioTime >= newSeriesStart);
                }
                applyResult();
                // Scroll-mode: shift the scroll anchor by exactly one page so that the new
                // main's first note (now at DOM x=0) lands at the same visual position the
                // overlay's first note (DOM x=+pageWidth) occupied just before the swap.
                if (previewMode === 'scroll' && this.refs.scrollTransitionRef?.current) {
                  this.refs.scrollTransitionRef.current.startPageFraction -= 1;
                  // The overlay was 'red' (showing previewMelody = the now-applied new melody).
                  // After the swap, the same melody is in main and previewMelody is stale —
                  // demote nextLayer to 'yellow' (same-melody copy) and clear previewMelody so
                  // the next iteration's m=0 yellow setter is idempotent.
                  if (this.setters.setNextLayer) this.setters.setNextLayer('yellow');
                  if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(null);
                }
                if (this.setters.setShowNotes) this.setters.setShowNotes(nextFirstRoundVisible);
                // Batch setIsOddRound(true) in the same callback as applyResult so it
                // commits in the same React 18 batch as melody refs + startMeasureIndex.
                // The inner-loop's separate setIsOddRound(true) fires moments later
                // (same audio time, but a separate setTimeout = a separate render)
                // which would otherwise create a 1-frame window where the preview
                // overlay still uses the OLD round's visibility config — visible as
                // a brief flicker when notes appear/disappear across round changes.
                if (this.setters.setIsOddRound) this.setters.setIsOddRound(true);
                // Reset iter-in-series counter so scroll-mode per-panel selection sees
                // iter 0 of the new series — all right-side panels go back to current
                // (= the just-applied melody) until the new series's last-rep pregen.
                if (this.setters.setIterInCurrentSeries) this.setters.setIterInCurrentSeries(0);
              }, scheduleTime);
            } else {
              // Once mode: apply result immediately (no preview needed).
              const newSeriesStart = nextStartTime;
              const scheduleTime = Math.max(0, (nextStartTime - this.context.currentTime) * 1000);
              this.scheduleTimeout(() => {
                if (this.setters.clearActiveHighlight) this.setters.clearActiveHighlight();
                if (this.scheduledNotes) {
                  this.scheduledNotes = this.scheduledNotes.filter(n => n.audioTime >= newSeriesStart);
                }
                applyResult();
                if (this.setters.setIsOddRound) this.setters.setIsOddRound(true);
                if (this.setters.setShowNotes) this.setters.setShowNotes(nextFirstRoundVisible);
              }, scheduleTime);
            }
          }
          } // end !isRepeatMode
        }
      }

      // Once mode: the last measure used skipSleep so the loop exited immediately after
      // scheduling. Wait for all scheduled audio to finish before stop() cancels instruments.
      if (this.isOnceMode && !sessionController.signal.aborted) {
        while (this.context.currentTime < nextStartTime) {
          if (sessionController.signal.aborted) break;
          await new Promise(r => setTimeout(r, 50));
        }
      }
    } finally {
      // Only stop if this session is still the active one. If a new start() was called
      // while this loop was sleeping, this.abortController has been replaced — calling
      // stop() here would cancel the new session's audio and reset its state.
      if (this.isPlaying && this.abortController === sessionController) {
        this.stop();
      }
    }
  }

  _buildIterationSlices(
    treble, bass, percussion, chordProgression, metronome,
    numMeasures, measureLengthTicks, ts, tonic, numAccidentals,
    isOddRound, globalMeasureStart, cycle, iteration
  ) {
    const tSlices = treble ? sliceMelodyByMeasure(treble, measureLengthTicks, numMeasures) : Array(numMeasures).fill(null);
    const bSlices = bass ? sliceMelodyByMeasure(bass, measureLengthTicks, numMeasures) : Array(numMeasures).fill(null);
    const pSlices = percussion ? sliceMelodyByMeasure(percussion, measureLengthTicks, numMeasures) : Array(numMeasures).fill(null);
    const mSlices = metronome ? sliceMelodyByMeasure(metronome, measureLengthTicks, numMeasures) : Array(numMeasures).fill(null);
    const cSlices = (chordProgression && chordProgression.notes) ? sliceMelodyByMeasure(chordProgression, measureLengthTicks, numMeasures) : Array(numMeasures).fill(null);
    const rawChords = getChordsWithSlashes(chordProgression, numMeasures, ts);
    return Array.from({ length: numMeasures }, (_, m) => ({
      measureIndex: globalMeasureStart + m,
      timeSignature: ts,
      measureLengthTicks,
      treble: tSlices[m],
      bass: bSlices[m],
      percussion: pSlices[m],
      metronome: mSlices[m],
      chordMelody: cSlices[m],
      chords: sliceChordsForMeasure(rawChords, m, measureLengthTicks),
      tonic,
      numAccidentals,
      display: isOddRound ? 'notes' : 'hidden',
      metadata: { cycle, repeatBlock: iteration, iteration, isOddRound },
    }));
  }

  randomizeScaleAndGenerate(numMeasures, timeSignature, currentMelodies = {}) {
    let activeScale = this.refs.scaleRef.current;
    const oldScaleNotes = activeScale.notes;
    const oldDisplayScale = activeScale.displayNotes;
    const oldTonic = activeScale.tonic;
    const oldMode = activeScale.name;
    const oldFamily = activeScale.family;

    const randConfig = this.refs.playbackConfigRef.current.randomize || {};

    const result = {
      scale: null,   // only set when scale is actually changed by randomization
      tonic: null,
      treble: null,
      bass: null,
      percussion: null,
      chordProgression: null
    };

    const currentProgression = this.refs.chordProgressionRef?.current || ChordProgression.default();

    // ── Harmony-difficulty-driven randomization ───────────────────────────────
    // When a target harmonic difficulty is active, use the harmony table to pick
    // (family, mode, tonic) instead of the normal independent random branches.
    const targetHarmony = this.refs.targetHarmonicDifficultyRef?.current;
    if (targetHarmony != null && (randConfig.tonic || randConfig.mode || randConfig.family !== false)) {
      const constraints = {
        fixedTonic: !randConfig.tonic ? activeScale.displayTonic?.replace(/\d+$/, '') ?? activeScale.tonic.replace(/\d+$/, '') : null,
        fixedFamily: randConfig.family === false ? activeScale.family : null,
        fixedMode: (randConfig.family === false && !randConfig.mode) ? activeScale.name : null,
      };
      const entry = getHarmonyAtDifficulty(targetHarmony, 0.5, constraints);
      if (entry) {
        if (randConfig.family !== false || randConfig.mode) {
          activeScale = updateScaleWithMode({
            currentScale: activeScale,
            newFamily: entry.family,
            newMode: entry.modeName,
          });
          result.scale = activeScale;
        }
        if (randConfig.tonic) {
          // Always use octave 4 as base to prevent tonic from climbing across rounds
          // (reusing the current octave caused B4→C♭5→C♭6 drift via getBestEnharmonicTonic's octave-bump rule).
          const newTonic = getBestEnharmonicTonic(entry.tonic + '4', activeScale.name);
          activeScale = updateScaleWithTonic({
            currentScale: activeScale,
            newTonic,
            rangeUp: activeScale.rangeUp,
            rangeDown: activeScale.rangeDown,
          });
          result.tonic = newTonic;
          result.scale = activeScale;
        }
      }
    } else {
      // Normal independent randomization (no harmony-difficulty target active).
      if (randConfig.tonic) {
        const newTonic = getBestEnharmonicTonic(randomTonic(), activeScale.name);
        result.tonic = newTonic;
        activeScale = updateScaleWithTonic({
          currentScale: activeScale,
          newTonic,
          rangeUp: activeScale.rangeUp,
          rangeDown: activeScale.rangeDown,
        });
        result.scale = activeScale;
      }

      if (randConfig.family) {
        let potentialFamilies = Object.keys(scaleDefinitions);
        if (randConfig.family === 'hepta') {
          potentialFamilies = [
            'Diatonic',
            'Melodic',
            'Harmonic Minor',
            'Harmonic Major',
            'Double Harmonic',
            'Other Heptatonic',
          ];
        }
        const newFamily = potentialFamilies[Math.floor(Math.random() * potentialFamilies.length)];
        const modesInFamily = scaleDefinitions[newFamily];
        const modeDef = modesInFamily[Math.floor(Math.random() * modesInFamily.length)];
        const newMode = modeDef.index
          ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
          : modeDef.wheelName || modeDef.name;
        activeScale = updateScaleWithMode({
          currentScale: activeScale,
          newFamily,
          newMode,
          rangeUp: activeScale.rangeUp,
          rangeDown: activeScale.rangeDown,
        });
        result.scale = activeScale;
      } else if (randConfig.mode) {
        const modesInFamily = scaleDefinitions[activeScale.family] || [];
        if (modesInFamily.length > 0) {
          const modeDef = modesInFamily[Math.floor(Math.random() * modesInFamily.length)];
          const newMode = modeDef.index
            ? `${modeDef.index}. ${modeDef.wheelName || modeDef.name}`
            : modeDef.wheelName || modeDef.name;
          activeScale = updateScaleWithMode({
            currentScale: activeScale,
            newFamily: activeScale.family,
            newMode,
            rangeUp: activeScale.rangeUp,
            rangeDown: activeScale.rangeDown,
          });
          result.scale = activeScale;
        }
      }

      // Re-normalize tonic for the final mode (avoids excess accidentals when both tonic and
      // mode/family are randomized together — tonic was chosen against the old mode above).
      if (randConfig.tonic && (randConfig.family || randConfig.mode)) {
        const betterTonic = getBestEnharmonicTonic(activeScale.tonic, activeScale.name);
        if (betterTonic !== activeScale.tonic) {
          activeScale = updateScaleWithTonic({
            currentScale: activeScale,
            newTonic: betterTonic,
            rangeUp: activeScale.rangeUp,
            rangeDown: activeScale.rangeDown,
          });
          result.tonic = betterTonic;
          result.scale = activeScale;
        }
      }
    }

    // Generate chords FIRST if needed (to support root - random)
    const instrumentSettings = this.refs.instrumentSettingsRef.current;
    const chordSettings = instrumentSettings.chords;

    let chordProgression = currentProgression;
    if (this.setters.generateChords) {
      // The Dice toggle (randConfig.chords) determines IF we generate a new progression.
      // The strategy for that generation comes from the UI (chordSettings.strategy).
      const shouldGenerateNew = !!randConfig.chords;
      const uiStrategy = chordSettings?.strategy || 'modal-random';

      if (shouldGenerateNew && uiStrategy) {
        const complexity = this.refs.playbackConfigRef.current.chordComplexity || currentProgression.complexity || 'triad';
        const density = chordSettings?.chordCount || 1;
        const enabledPassingTypes = chordSettings?.passingChordTypes ?? [];
        // Match useMelodyState: when passing chords are on, exactly 1 structural chord per
        // measure is used. insertPassingChords fills the remaining slots.
        const structuralDensity = enabledPassingTypes.length > 0 ? 1 : density;
        let progressionLength = Math.ceil(numMeasures * structuralDensity);
        // Add +4 chord buffer for random strategies
        if (['modal-random', 'inter-modal-random', 'extra-modal-random'].includes(uiStrategy)) {
          progressionLength += 4;
        }
        const chordsArr = generateProgression(activeScale, progressionLength, uiStrategy, complexity);

        // Determine modality
        let modality = 'modal';
        if (uiStrategy === 'inter-modal-random') modality = 'intra-modal';
        else if (uiStrategy === 'extra-modal-random') modality = 'extra-modal';

        chordProgression = new ChordProgression(chordsArr, complexity, uiStrategy, modality);
        chordProgression.totalMeasures = numMeasures;
        this.displayChordProgression = chordProgression; // immediate ref — no React render delay
        this.setters.setDisplayChordProgression?.(chordProgression);
      } else {
        // ... (Transposition logic remains)
        // we MUST transpose the old chords to the new key to avoid mismatch.
        const scaleChanged = activeScale.tonic !== oldTonic || activeScale.name !== oldMode || activeScale.family !== oldFamily;

        if (scaleChanged && chordProgression && chordProgression.chords && chordProgression.chords.length > 0) {
          // Transpose existing chords
          const newChords = chordProgression.chords.map(chord => {
            if (chord instanceof Chord) {
              return chord.transposeToScale(oldScaleNotes, activeScale.notes);
            }

            // Legacy object fallback
            // 1. Transpose Root
            const newRootArr = transposeMelodyToScale([chord.root], oldScaleNotes, activeScale.notes);
            const newRoot = newRootArr[0];

            // 2. Transpose Notes
            const newNotes = transposeMelodyToScale(chord.notes, oldScaleNotes, activeScale.notes);

            return {
              ...chord,
              root: newRoot,
              notes: newNotes
            };
          });
          chordProgression = new ChordProgression(newChords, currentProgression.complexity, currentProgression.type, currentProgression.modality);
          chordProgression.totalMeasures = currentProgression.totalMeasures ?? numMeasures;
          this.displayChordProgression = chordProgression;
          this.setters.setDisplayChordProgression?.(chordProgression);
        }
      }
    }

    // 2. Generate Global Rhythm DNA (NEW STEP)
    // We need to match useMelodyState logic
    const measureSlots = (GLOBAL_RESOLUTION * timeSignature[0]) / timeSignature[1];

    const globalTemplate = generateDeterministicRhythm(
      1,
      timeSignature,
      measureSlots,
      'default',
      GLOBAL_RESOLUTION
    );

    // Always ensure displayChordProgression is set — it may be null on the first call
    // when no randomization is active and the scale hasn't changed (neither branch fires above).
    // Must happen before chordProgression becomes chordMelody (Melody, not ChordProgression).
    if (!this.displayChordProgression && chordProgression?.chords?.length) {
      this.displayChordProgression = chordProgression;
      if (!this.displayChordProgression.totalMeasures) {
        this.displayChordProgression.totalMeasures = numMeasures;
      }
      this.setters.setDisplayChordProgression?.(chordProgression);
    }

    // 3. Generate Rhythmic Chords using MelodyGenerator

    // If we have a chord progression (abstract), let's make it rhythmic
    // Only if we actually have chords to play.
    if (chordProgression && (chordProgression.chords || chordProgression.displayNotes)) {
      const seqEnabledPassingTypes = chordSettings?.passingChordTypes ?? [];
      const seqChordCount = chordSettings?.chordCount || 1;
      // Must match useMelodyState: exactly 1 structural chord per measure when passing is on.
      // Previously used Math.ceil(chordCount/2) which mismatched useMelodyState and (for
      // chordCount > 2) caused the notePool to be sized wrong.
      const seqStructuralCount = seqEnabledPassingTypes.length > 0 ? 1 : seqChordCount;

      // notePool resolution — must yield a clean (passing-free) structural progression.
      //   .chords      : abstract ChordProgression (fresh generation this tick, or transposed) — clean.
      //   .displayNotes: Melody from a previous tick (after insertPassingChords ran) — MIXED.
      //                  Filter out chords with meta.isPassing=true so the recovered structural
      //                  pool matches what useMelodyState's original abstract progression looked like.
      //                  Without this filter, already-inserted passing chords would be treated as
      //                  structural slots and then insertPassingChords below would add MORE passing
      //                  chords on top, doubling the per-measure count.
      const rawNotePool = chordProgression.chords || chordProgression.displayNotes;
      const notePool = chordProgression.chords
        ? rawNotePool
        : rawNotePool?.filter(c => c && !c.meta?.isPassing);

      const chordGenSettings = {
        notesPerMeasure: seqStructuralCount,
        smallestNoteDenom: timeSignature[1] || 4,
        rhythmVariability: chordSettings?.rhythmVariability || 0,
        enableTriplets: false,
        notePool, // Always Chord[]
        playStyle: 'chord',
        type: 'progression',
        randomizationRule: 'progression'
      };

      const chordGen = new MelodyGenerator(
        activeScale,
        numMeasures,
        timeSignature,
        chordGenSettings,
        null, // No chords needed *as context* for chord generation itself
        null, // Range irrelevant
        Date.now().toString(),
        globalTemplate
      );

      let chordMelody = chordGen.generateMelody();

      // Insert passing chords — mirrors useMelodyState. Without this, subsequent sequence
      // blocks generated here in the Sequencer would lack passing chords.
      // seqChordCount is passed so insertPassingChords derives passingProbability internally.
      if (seqEnabledPassingTypes.length > 0) {
        const complexity = chordProgression.complexity || chordSettings?.complexity || 'triad';
        const firstChord = chordMelody.displayNotes?.find(c => c !== null) ?? null;
        chordMelody = insertPassingChords(chordMelody, activeScale, timeSignature, complexity, seqEnabledPassingTypes, seqChordCount, firstChord);
      }

      // Now chordMelody IS the rhythmic progression.
      // .notes = string[][] for audio, .displayNotes = Chord[] for SheetMusic.
      chordMelody.type = chordProgression.type;
      chordMelody.complexity = chordProgression.complexity;
      chordMelody.modality = chordProgression.modality;

      // Update local var for subsequent melody generation
      chordProgression = chordMelody;
      result.chordProgression = chordMelody;
    } else {
      result.chordProgression = chordProgression;
    }

    // Now chordProgression is a Melody object (rhythmic).
    // MelodyGenerator for Treble/Bass handles this by looking at .notes properly.

    let newTreble, newBass, newPercussion;

    if (randConfig.melody === false) {
      // Determine if only tonic changed (same mode and family)
      const onlyTonicChanged =
        activeScale.name === oldMode &&
        activeScale.family === oldFamily &&
        activeScale.tonic !== oldTonic;

      // Transpose
      if (currentMelodies.treble) {
        let transposedNotes, transposedDisplay;

        if (onlyTonicChanged) {
          const semitoneDiff = getNoteIndex(activeScale.tonic) - getNoteIndex(oldTonic);
          transposedNotes = transposeMelodyBySemitones(currentMelodies.treble.notes, semitoneDiff);
          transposedDisplay = transposedNotes.map((n) => {
            if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
            const idx = activeScale.notes.indexOf(n);
            if (idx !== -1) return activeScale.displayNotes[idx];
            return getRelativeNoteName(n, activeScale.tonic);
          });
        } else {
          transposedNotes = transposeMelodyToScale(
            currentMelodies.treble.notes,
            oldScaleNotes,
            activeScale.notes
          );
          const currentDisplay = currentMelodies.treble.displayNotes || currentMelodies.treble.notes;
          transposedDisplay = transposeMelodyToScale(
            currentDisplay,
            oldDisplayScale,
            activeScale.displayNotes
          );
        }

        newTreble = new Melody(
          transposedNotes,
          currentMelodies.treble.durations,
          currentMelodies.treble.offsets,
          transposedDisplay
        );
      } else {
        newTreble = null;
      }

      if (currentMelodies.bass) {
        const lowerOctave = (note) => {
          const match = note.match(/([^0-9]+)(\d+)/);
          if (!match) return note;
          return match[1] + (parseInt(match[2]) - 1);
        };

        let transposedNotes, transposedDisplay;

        if (onlyTonicChanged) {
          const semitoneDiff = getNoteIndex(activeScale.tonic) - getNoteIndex(oldTonic);
          transposedNotes = transposeMelodyBySemitones(currentMelodies.bass.notes, semitoneDiff);
          const bassDisplayScale = activeScale.displayNotes.map(lowerOctave);
          const bassNotes = activeScale.notes.map(lowerOctave);
          const bassTonic = lowerOctave(activeScale.tonic);

          transposedDisplay = transposedNotes.map((n) => {
            if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
            const idx = bassNotes.indexOf(n);
            if (idx !== -1) return bassDisplayScale[idx];
            return getRelativeNoteName(n, bassTonic);
          });
        } else {
          const oldBassNotes = oldScaleNotes.map(lowerOctave);
          const oldBassDisplay = oldDisplayScale.map(lowerOctave);
          const newBassNotes = activeScale.notes.map(lowerOctave);
          const newBassDisplay = activeScale.displayNotes.map(lowerOctave);
          transposedNotes = transposeMelodyToScale(
            currentMelodies.bass.notes,
            oldBassNotes,
            newBassNotes
          );
          const currentDisplay = currentMelodies.bass.displayNotes || currentMelodies.bass.notes;
          transposedDisplay = transposeMelodyToScale(
            currentDisplay,
            oldBassDisplay,
            newBassDisplay
          );
        }

        newBass = new Melody(
          transposedNotes,
          currentMelodies.bass.durations,
          currentMelodies.bass.offsets,
          transposedDisplay
        );
      } else {
        newBass = null;
      }
      newPercussion = currentMelodies.percussion;
      result.treble = newTreble;
      result.bass = newBass;
      result.percussion = newPercussion;
    } else {
      const instrumentSettings = this.refs.instrumentSettingsRef.current;
      const currentMelodyContext = this.refs.melodiesRef?.current || {};
      const refScale = currentMelodyContext.referenceScale || activeScale;

      // ── Treble difficulty-driven settings override ───────────────────────
      const targetMelodyDifficulty = this.refs.targetTrebleDifficultyRef?.current;
      let effectiveTrebleSettings = instrumentSettings.treble;
      if (targetMelodyDifficulty != null) {
        const melodyEntry = getMelodyAtDifficulty(targetMelodyDifficulty, 0.5);
        if (melodyEntry) {
          const clefKey = instrumentSettings.treble?.preferredClef === 'bass' ? 'bass' : 'treble';
          const presetRange = PRESET_RANGES[melodyEntry.rangeMode]?.[clefKey];
          effectiveTrebleSettings = {
            ...instrumentSettings.treble,
            notesPerMeasure: melodyEntry.notesPerMeasure,
            smallestNoteDenom: melodyEntry.smallestNoteDenom,
            rhythmVariability: melodyEntry.rhythmVariability,
            notePool: melodyEntry.notePool,
            randomizationRule: melodyEntry.randomizationRule,
            rangeMode: melodyEntry.rangeMode,
            ...(presetRange ? { range: presetRange } : {}),
          };
          result.trebleSettings = effectiveTrebleSettings;
        }
      }

      // ── Bass difficulty-driven settings override ──────────────────────────
      const targetBassDiff = this.refs.targetBassDifficultyRef?.current;
      let effectiveBassSettings = instrumentSettings.bass;
      if (targetBassDiff != null) {
        const bassEntry = getMelodyAtDifficulty(targetBassDiff, 0.5);
        if (bassEntry) {
          const presetRange = PRESET_RANGES[bassEntry.rangeMode]?.['bass'];
          effectiveBassSettings = {
            ...instrumentSettings.bass,
            notesPerMeasure: bassEntry.notesPerMeasure,
            smallestNoteDenom: bassEntry.smallestNoteDenom,
            rhythmVariability: bassEntry.rhythmVariability,
            notePool: bassEntry.notePool,
            randomizationRule: bassEntry.randomizationRule,
            rangeMode: bassEntry.rangeMode,
            ...(presetRange ? { range: presetRange } : {}),
          };
          result.bassSettings = effectiveBassSettings;
        }
      }

      // If tonic changed (due to randomization above), recalculate relative ranges so melody
      // generation uses the correct range for the NEW tonic — not the stale range from the ref.
      const newTrebleRelRange = calculateRelativeRange('treble', effectiveTrebleSettings.rangeMode, activeScale.tonic);
      if (newTrebleRelRange) effectiveTrebleSettings = { ...effectiveTrebleSettings, range: newTrebleRelRange };
      const newBassRelRange = calculateRelativeRange('bass', effectiveBassSettings.rangeMode, activeScale.tonic);
      if (newBassRelRange) effectiveBassSettings = { ...effectiveBassSettings, range: newBassRelRange };

      // Treble
      if (effectiveTrebleSettings.randomizationRule === 'fixed' && currentMelodyContext.referenceMelody) {
        // ... fixed logic ... (omitted matching for brevity, keeping existing)
        const modulatedNotes = modulateMelody(currentMelodyContext.referenceMelody.notes, refScale, activeScale);
        const displayNotes = modulatedNotes.map(n => {
          if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
          const idx = activeScale.notes.indexOf(n);
          if (idx !== -1) return activeScale.displayNotes[idx];
          return getRelativeNoteName(n, activeScale.tonic);
        });
        newTreble = new Melody(modulatedNotes, currentMelodyContext.referenceMelody.durations, currentMelodyContext.referenceMelody.offsets, displayNotes);
      } else {
        newTreble = new MelodyGenerator(
          activeScale,
          numMeasures,
          timeSignature,
          effectiveTrebleSettings,
          chordProgression, // PASS THE FULL MELODY OBJECT
          effectiveTrebleSettings.range,
          Date.now(),
          globalTemplate // Pass Global Rhythm!
        ).generateMelody();
      }

      // Bass
      if (effectiveBassSettings.randomizationRule === 'fixed' && currentMelodyContext.referenceBassMelody) {
        // ... fixed logic ...
        const targetBassSc = activeScale.generateBassScale();
        const refBassSc = refScale.generateBassScale();
        const modulatedNotes = modulateMelody(currentMelodyContext.referenceBassMelody.notes, refBassSc, targetBassSc);
        const displayNotes = modulatedNotes.map(n => {
          if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
          const idx = targetBassSc.notes.indexOf(n);
          if (idx !== -1) return targetBassSc.displayNotes[idx];
          return getRelativeNoteName(n, targetBassSc.tonic);
        });
        newBass = new Melody(modulatedNotes, currentMelodyContext.referenceBassMelody.durations, currentMelodyContext.referenceBassMelody.offsets, displayNotes);
      } else {
        newBass = new MelodyGenerator(
          activeScale.generateBassScale(),
          numMeasures,
          timeSignature,
          effectiveBassSettings,
          chordProgression, // PASS THE FULL MELODY OBJECT
          effectiveBassSettings.range,
          Date.now(),
          globalTemplate // Pass Global Rhythm!
        ).generateMelody();
      }

      // Percussion
      if (instrumentSettings.percussion.randomizationRule === 'fixed' && currentMelodies.percussion) {
        newPercussion = currentMelodies.percussion;
      } else {
        newPercussion = new MelodyGenerator(
          this.percussionScale,
          numMeasures,
          timeSignature,
          instrumentSettings.percussion,
          chordProgression, // PASS THE FULL MELODY OBJECT
          null,
          Date.now(),
          globalTemplate // Pass Global Rhythm!
        ).generateMelody();
      }

      result.treble = newTreble;
      result.bass = newBass;
      result.percussion = newPercussion;
    }

    // Calculate the TRUE measure span of the generated tracks so the sequencer loop
    // stays tied to actual content even if the UI 'num measures' slider changes.
    const maxContentSpan = Math.max(
      this._measureSpan(result.treble, timeSignature),
      this._measureSpan(result.bass, timeSignature),
      this._measureSpan(result.percussion, timeSignature),
      this._measureSpan(result.chordProgression, timeSignature)
    );

    result.generatedNumMeasures = maxContentSpan > 0 ? maxContentSpan : numMeasures;

    return result;
  }

  /**
   * Build scheduled chord entries for one measure, extending each chord's highlight window
   * to fill until the next chord starts (prevents flicker when durations don't tile perfectly).
   * Returns an array of { audioTime, duration, measureIndex, localSlot, degree } objects.
   *
   * @param {object} chordProgression - Melody-like object with .offsets/.durations/.displayNotes
   * @param {number} m               - Current measure index within the series (0-based)
   * @param {number} measureLengthTicks - Ticks per measure
   * @param {number} nextStartTime   - AudioContext time at the start of this measure
   * @param {number} measureDuration - Duration of one measure in seconds
   * @param {number} timeFactor      - Seconds per tick (beatDuration / ticksPerBeat)
   * @param {number} schedMeasureIndex - Global measure index for rAF highlight matching
   */
  buildScheduledChords(chordProgression, m, measureLengthTicks, nextStartTime, measureDuration, timeFactor, schedMeasureIndex) {
    const schedChords = [];
    if (!chordProgression?.offsets) return schedChords;

    const _RDEG = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7 };
    // Fermata-aware (Han 2026-05-29 round 17): mirror the schedNotes treatment
    // so chord highlights also pause on the fermata chord and shift on later
    // chords. The chord progression carries the same song-level fermatas array.
    const fermataEvents = Array.isArray(chordProgression.fermatas)
      ? chordProgression.fermatas.filter(f => f && typeof f.tick === 'number' && typeof f.hold === 'number' && f.hold > 0)
      : [];
    for (let i = 0; i < chordProgression.offsets.length; i++) {
      const slot = chordProgression.offsets[i];
      if (slot >= m * measureLengthTicks && slot < (m + 1) * measureLengthTicks) {
        // Read degree directly from displayNotes[i] — always matches the current
        // chord melody, never one block behind like the old displayChordProgression lookup.
        const chord = chordProgression.displayNotes?.[i];
        const romanBase = chord?.meta?.romanBaseRaw ?? '';
        const degree = _RDEG[String(romanBase).toUpperCase()] ?? null;
        let shift = 0;
        let extraHold = 0;
        for (const f of fermataEvents) {
          if (slot > f.tick) shift += f.hold;
          if (slot === f.tick) extraHold += f.hold;
        }
        schedChords.push({
          audioTime: nextStartTime + (slot - m * measureLengthTicks + shift) * timeFactor,
          duration: (chordProgression.durations[i] + extraHold) * timeFactor,
          measureIndex: schedMeasureIndex,
          localSlot: slot - m * measureLengthTicks,
          degree,
        });
      }
    }

    // Extend each chord's highlight window to fill until the next chord starts
    // (or until the measure ends for the last chord). This prevents flicker when
    // chord durations don't perfectly tile the measure (e.g. with rhythmVariability).
    const measureEnd = nextStartTime + measureDuration;
    for (let k = 0; k < schedChords.length; k++) {
      const effectiveEnd = k + 1 < schedChords.length
        ? schedChords[k + 1].audioTime
        : measureEnd;
      if (effectiveEnd > schedChords[k].audioTime + schedChords[k].duration) {
        schedChords[k] = { ...schedChords[k], duration: effectiveEnd - schedChords[k].audioTime };
      }
    }
    return schedChords;
  }

  /**
   * Schedule a one-shot callback and track its ID for cancellation in stop().
   * Auto-removes the ID from this.timeouts when the callback fires, preventing
   * unbounded array growth during long playback sessions.
   */
  scheduleTimeout(fn, delayMs) {
    const id = setTimeout(() => {
      const idx = this.timeouts.indexOf(id);
      if (idx !== -1) this.timeouts.splice(idx, 1);
      fn();
    }, delayMs);
    this.timeouts.push(id);
  }

  /**
   * Push a generation result's fields to React setters.
   * initialLoad=true  → always update reference melodies (called once at session start).
   * initialLoad=false → respect 'fixed' rule; also clears the preview overlay.
   */
  applyResultToSetters(result, { initialLoad = false, seriesStartMeasureIndex = null, skipFadeCleanup = false } = {}) {
    if (!initialLoad && this.setters.hideOldGroup) this.setters.hideOldGroup();
    // Pass isManualOverride=true: the Sequencer has already applied getBestEnharmonicTonic
    // when building result.tonic. Letting setTonic re-apply it with a potentially stale
    // selectedMode from React state would cause enharmonic flips (e.g. B4 ↔ C♭5).
    if (result.tonic) this.setters.setTonic(result.tonic, true);
    if (result.scale) {
      this.setters.setScale(result.scale);
      if (this.setters.setReferenceScale) this.setters.setReferenceScale(result.scale);
    }
    const instSettings = this.refs.instrumentSettingsRef.current;
    if (result.treble) {
      this.setters.setTrebleMelody(result.treble);
      const canUpdateRef = initialLoad || instSettings.treble.randomizationRule !== 'fixed';
      if (canUpdateRef && this.setters.setReferenceMelody) this.setters.setReferenceMelody(result.treble);
    }
    if (result.bass) {
      this.setters.setBassMelody(result.bass);
      const canUpdateRef = initialLoad || instSettings.bass.randomizationRule !== 'fixed';
      if (canUpdateRef && this.setters.setReferenceBassMelody) this.setters.setReferenceBassMelody(result.bass);
    }
    if (result.percussion) this.setters.setPercussionMelody(result.percussion);
    if (result.chordProgression && this.setters.setChordProgression) {
      this.setters.setChordProgression(result.chordProgression);
    }
    if (result.trebleSettings && this.setters.setTrebleSettings) this.setters.setTrebleSettings(result.trebleSettings);
    if (result.bassSettings && this.setters.setBassSettings) this.setters.setBassSettings(result.bassSettings);
    if (!initialLoad) {
      if (seriesStartMeasureIndex !== null && this.setters.setStartMeasureIndex) {
        this.setters.setStartMeasureIndex(seriesStartMeasureIndex);
      }
      // Update block display counters for each Sequencer-auto-generated block.
      // historyIndexRef stays at the value set by randomizeAll at play start; melodyCount
      // tracks how many auto-gens have occurred since then (starts at 1 for the first).
      if (seriesStartMeasureIndex !== null) {
        const hir = this.refs.historyIndexRef;
        const nm = this.refs.numMeasuresRef.current;
        if (hir && nm && this.setters.setBlockMeasureStart) {
          this.setters.setBlockMeasureStart((Math.max(0, hir.current) + this.melodyCount) * nm + 1);
        }
        if (this.setters.setBlockPlayStart) {
          this.setters.setBlockPlayStart(seriesStartMeasureIndex);
        }
      }
      // Pagination scheduler calls this with skipFadeCleanup=true: the overlay/preview
      // must stay visible until the fade actually ends (fadeOvershootMeasures past the
      // boundary for the 'lang' variant). The scheduler's own fadeEnd timeout clears them.
      if (!skipFadeCleanup) {
        if (this.setters.setNextLayer) this.setters.setNextLayer(null);
        if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(null);
      }
    }
  }

  /**
   * Build a sliced preview Melody for the pagination overlay.
   *
   * For visual-flip / repeat-flip the source is the currently-playing melody — the
   * preview shows the next page or next repeat at a different localMeasureStart.
   * For series-flip the source is the pre-generated next melody (start at 0).
   *
   * Returns the same shape as `previewMelody` consumed by SheetMusic: an object with
   * treble/bass/percussion/chordProgression melodies plus a startMeasureIndex marker
   * for the barline numbers.
   */
  _buildPaginationPreview(sourceMelodies, measureLengthTicks, numMeasuresToKeep, localStartMeasure, globalStartMeasure, roundKey, blockMeasureStart, blockPlayStart) {
    const sliceOne = (m) => m ? sliceMelodyByRange(m, measureLengthTicks, numMeasuresToKeep, localStartMeasure) : null;
    return {
      treble: sliceOne(sourceMelodies.treble),
      bass: sliceOne(sourceMelodies.bass),
      percussion: sliceOne(sourceMelodies.percussion),
      // chordProgression keeps its own offsets/notes; SheetMusic re-derives display
      // chords from the full progression. Slicing it correctly requires the
      // chordProgression structure which is consumed differently. For now pass the
      // full progression; visual artefact is acceptable for v1 of the redesign and
      // tracked in BACKLOG.
      chordProgression: sourceMelodies.chordProgression ?? null,
      startMeasureIndex: globalStartMeasure,
      // Per-layer visibility lock — SheetMusic reads this for the preview overlay's
      // round config so the visibility never flips mid-fade (notably during the
      // 'lang' variant's 0.25m overshoot when React's isOddRound updates while the
      // overlay is still mounted).
      _roundKey: roundKey,
      // Future block-label state. For series-flip the values reflect the next
      // sequence block (so the preview shows e.g. "3" instead of "1 . 5" before
      // applyResultToSetters fires at the audio boundary). For visual-flip and
      // repeat-flip the values are unchanged.
      _blockMeasureStart: blockMeasureStart ?? null,
      _blockPlayStart: blockPlayStart ?? null,
    };
  }

  /**
   * Schedule all pagination animation events for one sequence block.
   *
   * Called at the start of each sequence block (iteration=0, first measure). Computes
   * boundary timings via the transitionPlanner and arms three timeouts per boundary:
   *
   *   1. (series-flip only) JIT generation at generationDeadlineTick.
   *   2. Fade arm at fadeStart − 50 ms: sets transitionRef, nextLayer='crossfade',
   *      previewMelody to the pre-sliced next-page content.
   *   3. Content swap at boundary.atTick: setStartMeasureIndex; for series-flip also
   *      applyResultToSetters({ skipFadeCleanup: true }) so the React melody refs
   *      point at the new melody but the overlay stays up.
   *   4. Cleanup at fadeEndTick: clear transitionRef + nextLayer + previewMelody.
   *
   * Skipped events whose atTick is in the past (e.g. when starting playback mid-block
   * via initialMeasureIndex) — those have already happened conceptually.
   */
  _armPaginationSequence({ baseAudioTime, sequenceStartGlobalMeasure, plan, variant, currentMelodies, startSkipTick }) {
    const events = planPaginationSequence({ plan, variant });
    const measureLengthTicks = plan.measureLengthTicks;
    const timeFactor = 5 / this.refs.bpmRef.current;
    const tickToTime = (tick) => baseAudioTime + tick * timeFactor;

    // Initial setStartMeasureIndex + isOddRound for this sequence block.
    // The inner loop no longer fires these when iterMode === 'pagination' — the
    // scheduler owns both across the whole block. Batched here in one callback so
    // React commits them in a single render (otherwise startMeasureIndex would
    // update with stale roundKey for one frame → wrong visibility config briefly).
    //
    // IMPORTANT: do NOT call setNextLayer(null) here. The previous block's
    // overlay may still be visible (notably during the 'lang' variant's 0.25m
    // overshoot past the boundary). Clearing nextLayer prematurely would unmount
    // the overlay before the cleanup phase at fadeEnd, causing a visible
    // flash / blank frame. The previous block's scheduler owns nextLayer
    // teardown.
    const initialDelayMs = Math.max(0, (baseAudioTime - this.context.currentTime) * 1000);
    this.scheduleTimeout(() => {
      if (!this.isPlaying) return;
      if (this.setters.setStartMeasureIndex) this.setters.setStartMeasureIndex(sequenceStartGlobalMeasure);
      if (this.setters.setIsOddRound) this.setters.setIsOddRound(true); // iter 0 is always odd

      // ── Repeat-mode block-counter refresh (Fix #3, arch §40 numbering) ────────────────────────
      // The generated continuous path keeps the BarlinesLayer repeat suffix correct by refreshing
      // blockMeasureStart/blockPlayStart at every SERIES boundary inside applyResultToSetters
      // (setBlockPlayStart(seriesStartMeasureIndex)). The loaded-song REPEAT path (isRepeatMode) never
      // calls applyResultToSetters — it short-circuits before the series-flip (no regeneration) — so
      // blockPlayStart was STRANDED at its play-start value while startMeasureIndex kept advancing by
      // bodyMeasures every pass. BarlinesLayer computes the suffix as
      // floor((startMeasureIndex - blockPlayStart) / passSpan) + 1, so with a stranded blockPlayStart
      // the suffix overflowed past repsPerMelody and corrupted at each re-arm (Han saw "11" for "1.5").
      //
      // The repeat path re-arms _armPaginationSequence at the start of every repeat BLOCK (each set of
      // repsPerMelody passes), so THIS callback is the repeat-mode counterpart of a series boundary.
      // Refresh the SAME two counters with the SAME formula applyResultToSetters uses (§6c — reuse the
      // existing bookkeeping, don't invent a new mechanism). For repeat mode melodyCount stays 0 and
      // the song never regenerates, so blockMeasureStart resolves to the loaded song's first measure
      // ((historyIndex + 0) * numMeasures + 1) and blockPlayStart tracks each block's start global
      // index — so the suffix CYCLES 1..repsPerMelody per block, matching the generated path (this is
      // the FINITE repsPerMelody case Han reported: "11" → cycles correctly instead of overflowing).
      //
      // INDEFINITE repeat (repsPerMelody === -1, "repeat one indefinitely"): the suffix must instead
      // GROW UNBOUNDED (maat 1 on pass 7 = "1.7", pass 1000 = "1.1000"; no cap, no reset — Han
      // 2026-06-18). The planner resolves repsPerMelody=-1 to 1 (Math.max(1,-1) at the arm call), so
      // _armPaginationSequence re-arms — and this callback fires — EVERY pass. If we refreshed
      // blockPlayStart to sequenceStartGlobalMeasure here (as finite mode does), it would track
      // startMeasureIndex every pass and pin the suffix at 1. So for indefinite mode we PIN
      // blockPlayStart to a STABLE ORIGIN (the first body play-start of the session, captured on the
      // first arm) and never refresh it again — then computeRepeatPass's
      // floor((startMeasureIndex - origin) / passSpan) + 1 climbs without bound across passes. The
      // re-arm itself still happens (it schedules the next pass's measures); we change only the
      // numbering ORIGIN, not the scheduling (§6: Song stays append-only, indices monotonic). NOTE:
      // blockMeasureStart is refreshed in BOTH modes — it drives the BASE measure number N (1..nm
      // within one pass), which stays correct because melodyCount is pinned at 0 so it resolves to the
      // loaded song's first measure on every pass; only the .repeatNum grows.
      const isIndefiniteRepeat = this.isRepeatMode
        && this.refs.playbackConfigRef.current.repsPerMelody === -1;
      if (this.isRepeatMode) {
        const hir = this.refs.historyIndexRef;
        const nm = this.refs.numMeasuresRef.current;
        if (hir && nm && this.setters.setBlockMeasureStart) {
          this.setters.setBlockMeasureStart((Math.max(0, hir.current) + this.melodyCount) * nm + 1);
        }
        if (this.setters.setBlockPlayStart) {
          if (isIndefiniteRepeat) {
            // Capture the session origin on the FIRST indefinite arm only, then leave it fixed so the
            // suffix grows unbounded. Subsequent re-arms must NOT overwrite it.
            if (this.repeatNumberingOrigin === null) {
              this.repeatNumberingOrigin = sequenceStartGlobalMeasure;
            }
            this.setters.setBlockPlayStart(this.repeatNumberingOrigin);
          } else {
            // FINITE repsPerMelody: refresh per block so the suffix CYCLES 1..repsPerMelody.
            this.setters.setBlockPlayStart(sequenceStartGlobalMeasure);
          }
        }
      }
    }, initialDelayMs);

    // Variant config — same hasOvershoot flag is used by the outer loop's
    // applyResult to decide whether to skip the fade cleanup (lang only) or
    // bundle it into the same render as the melody-refs commit (snel/mid).
    const variantSpec = (typeof variant === 'string' && PAGINATION_VARIANTS[variant]) || PAGINATION_VARIANTS.mid;
    const hasOvershoot = variantSpec.fadeOvershootMeasures > 0;

    for (const { boundary, fade } of events) {
      // Skip boundaries that already happened (mid-block start case).
      if (boundary.atTick <= startSkipTick) continue;

      // Han 2026-05-29: in once-mode ("Play This Melody") the playback ends
      // after the last note. The planner still emits a series-flip event for
      // the final block boundary (it's structural — every block ends with a
      // flip kind); without this guard we'd JIT-generate a new melody,
      // schedule a preview overlay, and animate a crossfade that no one
      // ever sees the resolution of (playback already stopped). Skip those.
      if (this.isOnceMode && boundary.kind === 'series-flip') continue;

      const atTime        = tickToTime(boundary.atTick);
      const fadeStartTime = tickToTime(fade.fadeStartTick);
      const fadeEndTime   = tickToTime(fade.fadeEndTick);
      const deadlineTime  = tickToTime(fade.generationDeadlineTick);

      // measuresFromBase is integer-exact when boundary.atTick is an integer multiple
      // of measureLengthTicks (always true for visual/repeat/series flips).
      const measuresFromBase = Math.round(boundary.atTick / measureLengthTicks);
      const newGlobalStart   = sequenceStartGlobalMeasure + measuresFromBase;
      const newLocalStartM   = boundary.newWindowStartLocal / measureLengthTicks;
      const newSize          = boundary.newWindowSizeMeasures;

      // Round config for the INCOMING block — locked at arm-time so the overlay's
      // visibility never flips mid-fade. iteration % 2 === 0 → oddRounds.
      //   visual-flip   : same iter, same round as the boundary.repeatIndex iter
      //   repeat-flip   : next iter, opposite round
      //   series-flip   : new sequence block iter 0 → always 'oddRounds'
      let incomingRoundKey;
      if (boundary.kind === 'series-flip') {
        incomingRoundKey = 'oddRounds';
      } else if (boundary.kind === 'repeat-flip') {
        const nextIter = boundary.repeatIndex + 1;
        incomingRoundKey = (nextIter % 2 === 0) ? 'oddRounds' : 'evenRounds';
      } else {
        // visual-flip: same iter, same round
        incomingRoundKey = (boundary.repeatIndex % 2 === 0) ? 'oddRounds' : 'evenRounds';
      }

      // Future blockMeasureStart / blockPlayStart for the overlay's barline labels.
      // Mirrors the formula in applyResultToSetters:
      //   blockMeasureStart = (historyIndex + melodyCount) × numMeasures + 1
      //   blockPlayStart    = seriesStartMeasureIndex (only updated on series-flip)
      // For visual/repeat-flip the current values are correct, so pass null and
      // SheetMusic falls back to React state.
      let futureBlockMeasureStart = null;
      let futureBlockPlayStart = null;
      if (boundary.kind === 'series-flip') {
        const hir = Math.max(0, this.refs.historyIndexRef?.current ?? 0);
        const nm = this.refs.numMeasuresRef.current;
        // melodyCount is incremented BEFORE applyResultToSetters runs, so the
        // future value is (current + 1).
        futureBlockMeasureStart = (hir + this.melodyCount + 1) * nm + 1;
        futureBlockPlayStart = newGlobalStart;
      }

      // ── 1. JIT generation (series-flip only) ────────────────────────────
      if (boundary.kind === 'series-flip') {
        const genMs = Math.max(0, (deadlineTime - this.context.currentTime) * 1000);
        this.scheduleTimeout(() => {
          if (!this.isPlaying) return;
          if (this.pregenResult) return; // someone else already produced it
          try {
            this.pregenResult = this.randomizeScaleAndGenerate(
              this.refs.numMeasuresRef.current,
              this.refs.timeSignatureRef.current,
              {
                treble: this.refs.melodiesRef?.current?.treble,
                bass: this.refs.melodiesRef?.current?.bass,
                percussion: this.refs.melodiesRef?.current?.percussion,
              }
            );
          } catch (e) {
            logger.error('Sequencer', 'E020-JIT-GENERATE', e, { variant });
          }
        }, genMs);
      }

      // ── 2. Fade arm: render preview overlay, start crossfade ────────────
      // 200ms lead: React's render+commit can take up to ~100ms on slow devices
      // or under GC pressure. Without sufficient lead the rAF starts animating
      // [data-pagination-new] opacity before the element is in the DOM —
      // querySelector returns null, stageNextCached stays null, and the new
      // layer never animates (only fades in once React commits, sometimes
      // mid-fade → visible flicker / hapering).
      const armMs = Math.max(0, (fadeStartTime - this.context.currentTime) * 1000 - 200);
      this.scheduleTimeout(() => {
        if (!this.isPlaying) return;

        let preview = null;
        if (boundary.kind === 'series-flip') {
          if (!this.pregenResult) {
            // Generation hasn't completed yet — try synchronously now as a fallback.
            try {
              this.pregenResult = this.randomizeScaleAndGenerate(
                this.refs.numMeasuresRef.current,
                this.refs.timeSignatureRef.current,
                {
                  treble: this.refs.melodiesRef?.current?.treble,
                  bass: this.refs.melodiesRef?.current?.bass,
                  percussion: this.refs.melodiesRef?.current?.percussion,
                }
              );
            } catch (e) {
              logger.error('Sequencer', 'E020-JIT-GENERATE', e, { variant, when: 'fallback' });
            }
          }
          if (this.pregenResult) {
            preview = this._buildPaginationPreview(this.pregenResult, measureLengthTicks, Math.min(newSize, this.refs.numMeasuresRef.current), 0, newGlobalStart, incomingRoundKey, futureBlockMeasureStart, futureBlockPlayStart);
          }
        } else {
          preview = this._buildPaginationPreview(currentMelodies, measureLengthTicks, newSize, newLocalStartM, newGlobalStart, incomingRoundKey, futureBlockMeasureStart, futureBlockPlayStart);
        }

        if (this.refs.transitionRef) {
          // Defensive: if scheduler-drift delayed this callback past fadeStartTime
          // (most likely for the 2nd+ series-flip with the 'lang' variant whose
          // armMs is the largest of the variants), the rAF would otherwise compute
          // p=(now-startTime)/dur ≥ 1 on the first frame and skip straight to the
          // end state (= hard cut). Clamp startTime forward so the user still sees
          // a fade. End time keeps the original audio-aligned target so the swap
          // moment doesn't shift.
          const audioNow = this.context.currentTime;
          const startTime = Math.max(fadeStartTime, audioNow);
          const endTime = Math.max(fadeEndTime, startTime + 0.05);
          this.refs.transitionRef.current = {
            kind: 'crossfade',
            startTime,
            endTime,
          };
        }
        // Use 'crossfade' as the nextLayer signal; SheetMusic's render code treats
        // it like the existing 'yellow'/'red' path but always sourced from previewMelody.
        if (this.setters.setNextLayer) this.setters.setNextLayer('crossfade');
        if (preview && this.setters.setPreviewMelody) this.setters.setPreviewMelody(preview);
      }, armMs);

      // ── 3. Audio swap at boundary.atTick ────────────────────────────────
      // For visual-flip / repeat-flip the scheduler owns setStartMeasureIndex —
      // the inner loop skips its m=0 update under pagination, so this is the
      // only writer.
      //
      // For series-flip we DO NOT fire setStartMeasureIndex here: the outer-loop
      // applyResult callback batches setStartMeasureIndex with setTrebleMelody /
      // setBassMelody / setPercussionMelody / setChordProgression into one React
      // render via React 18's automatic batching. Firing setStartMeasureIndex
      // separately would commit the index BEFORE the new melody refs, causing a
      // 1-frame flash of the old melody at the new page (empty / wrong content).
      //
      // For repeat-flip we batch setIsOddRound here too — without it the inner
      // loop's separate setIsOddRound setTimeout fires as a SECOND render after
      // ours, leaving one frame where startMeasureIndex points at the new iter
      // but roundKey is still the old iter's. Visual-flip doesn't change the round.
      //
      // CRITICAL: when there is no overshoot (snel/mid variants), the atTime
      // callback ALSO bundles the fade cleanup — transitionRef=null +
      // setNextLayer=null + setPreviewMelody=null — into the same React batch as
      // setStartMeasureIndex + setIsOddRound. One render, useLayoutEffect fires
      // synchronously, browser paints. Without this bundling the cleanup ran as
      // a separate setTimeout that produced its own render AFTER applyResult's
      // commit, opening a window where:
      //   1. inline opacity from rAF was still ~0 on data-pagination-old
      //   2. React removed the overlay (nextLayer=null)
      //   3. user saw a 1-frame blank (or the previous content's brief flash
      //      depending on visibility/round state at that moment)
      // before useLayoutEffect or the next rAF tick restored CSS-class opacity.
      if (boundary.kind !== 'series-flip') {
        const newIsOddRound = (boundary.kind === 'repeat-flip')
          ? ((boundary.repeatIndex + 1) % 2 === 0)
          : null;
        const atMs = Math.max(0, (atTime - this.context.currentTime) * 1000);
        this.scheduleTimeout(() => {
          if (!this.isPlaying) return;
          if (this.setters.setStartMeasureIndex) this.setters.setStartMeasureIndex(newGlobalStart);
          if (newIsOddRound !== null && this.setters.setIsOddRound) this.setters.setIsOddRound(newIsOddRound);
          // Atomic cleanup for snel/mid (no overshoot): same React batch as the
          // state updates above. For lang the separate fadeEnd timeout below
          // handles cleanup so the overlay stays visible during the overshoot.
          if (!hasOvershoot) {
            if (this.refs.transitionRef) this.refs.transitionRef.current = null;
            if (this.setters.setNextLayer) this.setters.setNextLayer(null);
            if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(null);
          }
        }, atMs);
      }

      // ── 4. Cleanup at fadeEnd (LANG variant only) ───────────────────────
      // For snel/mid the cleanup is bundled into step 3's atTime callback or
      // into the outer-loop applyResult callback (for series-flip). Only lang
      // needs a separate timeout because its fadeEnd is 0.25m PAST the boundary
      // — we want to keep the overlay visible during the overshoot.
      if (hasOvershoot) {
        const cleanMs = Math.max(0, (fadeEndTime - this.context.currentTime) * 1000);
        this.scheduleTimeout(() => {
          if (!this.isPlaying) return;
          if (this.refs.transitionRef) this.refs.transitionRef.current = null;
          if (this.setters.setNextLayer) this.setters.setNextLayer(null);
          if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(null);
        }, cleanMs);
      }
    }
  }

  /** Returns how many measures of content a melody spans (0 if empty). */
  _measureSpan(melody, timeSignature) {
    if (!melody?.offsets?.length) return 0;
    const measureLengthTicks = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
    const validOffsets = melody.offsets.filter(o => o != null);
    if (validOffsets.length === 0) return 0;
    return Math.floor(Math.max(...validOffsets) / measureLengthTicks) + 1;
  }

  stop() {
    this.isPlaying = false;
    if (this.abortController) this.abortController.abort();

    // Clear any pending visibility toggles
    if (this.timeouts) {
      this.timeouts.forEach(id => clearTimeout(id));
      this.timeouts = [];
    }
    if (this.setters.setIsOddRound) this.setters.setIsOddRound(true);

    // Han 2026-05-29: previously we hard-muted each instrument's output
    // channel (setVolume(0)) before calling .stop() so the release envelope
    // played silently — but that left the channels muted afterwards, which
    // killed every subsequent click-to-play (the note got dispatched into a
    // muted channel and the user heard nothing). It also amputated the
    // natural tail of the last melody note when playback ended on its own
    // — a "brute" cutoff Han specifically called out. Now we just call
    // instrument.stop() and let smplr's per-voice release envelope ring
    // naturally (~0.3–1.0s tail). Note: instrument.stop() also prevents
    // new scheduled-but-not-yet-started notes from sounding, so the
    // abortController + this call together honour the "no new notes" intent.
    try { this.instruments.treble?.stop(); } catch { /* instrument may not be started */ }
    try { this.instruments.bass?.stop(); } catch { /* instrument may not be started */ }
    try { this.instruments.chords?.stop(); } catch { /* instrument may not be started */ }
    try { this.instruments.percussion?.stop(); } catch { /* instrument may not be started */ }
    try { this.instruments.metronome?.stop(); } catch { /* instrument may not be started */ }

    this.playbackState = null;
    this.scheduledNotes = null;
    this.scheduledChords = [];
    this.scheduledMeasures = [];
    if (this.setters.onStop) this.setters.onStop();
  }
}

export default Sequencer;
