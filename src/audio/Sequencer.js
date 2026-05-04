import playMelodies from './playMelodies';
import { TICKS_PER_WHOLE } from '../constants/timing.js';
import { transposeMelodyToScale, transposeMelodyBySemitones, getNoteIndex, modulateMelody, calculateRelativeRange } from '../theory/musicUtils';
import Melody from '../model/Melody';
import MelodyGenerator from '../generation/melodyGenerator';
import {
  randomTonic,
  randomMode,
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
import { sliceMelodyByMeasure, sliceChordsForMeasure } from '../utils/melodySlice';
import { getChordsWithSlashes } from '../theory/chordLabelHandler';
import { getHarmonyAtDifficulty } from '../utils/harmonyTable';
import { getMelodyAtDifficulty } from '../utils/melodyDifficultyTable';
import { PRESET_RANGES } from '../constants/musicLayout';
import { GLOBAL_RESOLUTION } from '../constants/generatorDefaults';

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
  }

  async start(initialMelodies, once = false, initialMeasureIndex = 0) {
    if (this.isPlaying) {
      return;
    }
    this.isPlaying = true;
    this.abortController = new AbortController();
    // Capture the controller for this session. When stop() is called and a new start()
    // immediately follows, this.abortController is replaced. Using a local const ensures
    // this session's loop always checks its OWN controller, not the new session's.
    const sessionController = this.abortController;

    let { treble, bass, percussion, chordProgression } = initialMelodies;

    let currentTS = [...this.refs.timeSignatureRef.current];
    let currentMetronome = this.refs.metronomeRef.current;

    let currentNumMeasures = once ? Math.max(
      this._measureSpan(treble, currentTS),
      this._measureSpan(bass, currentTS),
      this._measureSpan(percussion, currentTS),
      this._measureSpan(chordProgression, currentTS)
    ) : this.refs.numMeasuresRef.current;

    if (currentNumMeasures === 0) currentNumMeasures = this.refs.numMeasuresRef.current;

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
    this.melodyCount = 0;
    let iteration = 0;
    this.globalMeasureIndex = initialMeasureIndex;
    this.isOnceMode = once;
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
        if (this.setters.setIsOddRound) {
          // Schedule isOddRound update to happen at nextStartTime
          const scheduleTime = Math.max(0, (nextStartTime - this.context.currentTime) * 1000);
          this.scheduleTimeout(() => {
            if (this.isPlaying) this.setters.setIsOddRound(isOddRound);
          }, scheduleTime);
        }

        // Removed master volume fader setVolume calls to allow natural sample decay across measure boundaries.
        // Per-track volumes are now passed directly into playMelodies.

        const startM = (iteration === 0 && this.melodyCount === 0) ? (initialMeasureIndex % currentNumMeasures) : 0;
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
            const startIdx = this.globalMeasureIndex;
            const iterStateMs = Math.max(0, (wipeStateClearTime - this.context.currentTime) * 1000);
            this.scheduleTimeout(() => {
              // Both in one callback so React 18 automatic batching merges them into a single render.
              // wipeTransitionRef cleared by useLayoutEffect in App.jsx after React commits.
              if (this.setters.setStartMeasureIndex) this.setters.setStartMeasureIndex(startIdx);
              if (this.setters.setNextLayer) this.setters.setNextLayer(null);
            }, iterStateMs);
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

          // Pagination: Pre-emptive "page turn" fires 0.5 measures before a block end.
          // Uses a fade-out → hard-cut → CSS-fade-in so the jump in startMeasureIndex is hidden:
          //   [T+0.25m, T+0.5m]  rAF fades old block OUT  (fadeOutOnly — no overlay rendered)
          //   T+0.5m             React batches setStartMeasureIndex + setNextLayer(null) → single render;
          //                      useLayoutEffect detects 'block-flip' pending → triggers CSS fade-in
          //   [T+0.5m, T+0.65m] CSS animation fades new block content IN
          const blocks = this.refs.musicalBlocksRef?.current || [currentNumMeasures];
          if (iterMode === 'pagination') {
            let blockStart = 0;
            for (let b = 0; b < blocks.length; b++) {
              // If the measure coming AFTER this one (m+1) starts a new block,
              // we trigger the animated flip centred on T+0.5m.
              if (m + 1 === blockStart && blockStart < currentNumMeasures) {
                const flipTime = nextStartTime + 0.5 * measureDuration;
                const fadeStart = nextStartTime + 0.25 * measureDuration;
                const newStartIdx = this.globalMeasureIndex + 1;

                // Arm the rAF fade-out immediately. rAF clamps elapsed < 0 until fadeStart,
                // so there is no visual change before that point.
                if (this.refs.paginationFadeRef) {
                  this.refs.paginationFadeRef.current = {
                    startTime: fadeStart,
                    totalEnd: flipTime,
                    fadeOutOnly: true, // no overlay to fade in
                  };
                }

                // Arm the block-flip marker ~50ms before the fade begins so useLayoutEffect
                // can set the data-block-flip-pending attribute on the old group before the
                // rAF opacity animation starts.
                const armMs = Math.max(0, (fadeStart - this.context.currentTime) * 1000 - 50);
                this.scheduleTimeout(() => {
                  if (this.isPlaying && this.setters.setNextLayer) {
                    this.setters.setNextLayer('block-flip');
                  }
                }, armMs);

                // At flipTime: swap content + trigger cleanup in ONE callback so React 18
                // automatic batching merges both into a single render. The useLayoutEffect
                // on nextLayer→null detects the pending block-flip and adds the CSS fade-in.
                this.scheduleTimeout(() => {
                  if (!this.isPlaying) return;
                  if (this.setters.setStartMeasureIndex) this.setters.setStartMeasureIndex(newStartIdx);
                  if (this.setters.setNextLayer) this.setters.setNextLayer(null);
                }, Math.max(0, (flipTime - this.context.currentTime) * 1000));
                break;
              }
              blockStart += blocks[b];
            }
          }

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
            const chordVolume = activeConfig.chords;
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
          const schedNotes = [];
          // All modes use Song-based rendering: DOM data-measure-index = Song's measure.measureIndex
          // = globalMeasureIndex. schedNotes must match.
          const schedMeasureIndex = this.globalMeasureIndex;
          for (const [mel, melName] of [[treble, 'treble'], [bass, 'bass'], [percussion, 'percussion']]) {
            if (!mel?.offsets) continue;
            for (let i = 0; i < mel.offsets.length; i++) {
              const slot = mel.offsets[i];
              if (slot >= m * measureLengthTicks && slot < (m + 1) * measureLengthTicks) {
                schedNotes.push({
                  audioTime: nextStartTime + (slot - m * measureLengthTicks) * timeFactor,
                  duration: mel.durations[i] * timeFactor,
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

          // Multi-measure scroll: start the full-page scroll at m=0 of the last rep.
          // The scroll runs for exactly numMeasures * measureDuration so one full page width
          // is traversed at constant speed.
          // Pending-queue: if an old animation is still active, queue the new timing instead
          // of overwriting it — overwriting causes a snap from ~90% to 0 on the next rAF frame.
          // The rAF loop will apply the pending timing atomically when the old animation ends.
          if (!this.isOnceMode && mode === 'scroll' && isLastRepNow && m === 0 && currentNumMeasures >= 2) {
            const newScrollTiming = {
              // +0.75m offset: animation starts 0.75m into the repeat (0.5m later than before),
              // so the first note sits at the 25% playhead for most of the first measure before
              // the scroll begins. Ends at N+0.75m so active note stays at 25% through the last measure.
              startTime: nextStartTime + 0.75 * measureDuration,
              endTime: nextStartTime + (currentNumMeasures + 0.75) * measureDuration,
            };
            // Show same-melody overlay from the start so the right side of the screen is
            // never empty during the scroll. The penultimate-measure code replaces it with
            // the pre-generated next melody ('red') when it becomes available.
            const msFromNow = Math.max(0, (nextStartTime - this.context.currentTime) * 1000);
            this.scheduleTimeout(() => {
              if (this.setters.setNextLayer) this.setters.setNextLayer('yellow');
            }, msFromNow);
            if (this.refs.scrollTransitionRef) {
              if (!this.refs.scrollTransitionRef.current) {
                // No active animation — set directly. rAF clamps p=0 until startTime.
                this.refs.scrollTransitionRef.current = newScrollTiming;
              } else if (this.refs.pendingScrollTransitionRef) {
                // Active animation in progress — queue so it takes over on completion.
                this.refs.pendingScrollTransitionRef.current = newScrollTiming;
              }
            }
          }

          // Yellow overlay: mid-series repeat boundaries.
          if (!this.isOnceMode && !isLastRepNow) {
            if (mode === 'scroll' && m === 0) {
              // Scroll: at the start of each non-last rep, begin a full-block scroll so the
              // playhead stays consistent across all reps. Duration = numMeasures * measureDuration.
              // +0.75m offset (0.5m later than before) so the first note stays at the 25% playhead
              // for most of measure 1 before the scroll starts moving.
              const scrollStart = nextStartTime + 0.75 * measureDuration;
              const scrollEnd = nextStartTime + (currentNumMeasures + 0.75) * measureDuration;
              const msFromNow = Math.max(0, (scrollStart - this.context.currentTime) * 1000);
              this.scheduleTimeout(() => {
                if (this.setters.setNextLayer) this.setters.setNextLayer('yellow');
                if (this.refs.scrollTransitionRef) {
                  if (!this.refs.scrollTransitionRef.current) {
                    this.refs.scrollTransitionRef.current = { startTime: scrollStart, endTime: scrollEnd };
                  } else if (this.refs.pendingScrollTransitionRef) {
                    this.refs.pendingScrollTransitionRef.current = { startTime: scrollStart, endTime: scrollEnd };
                  }
                }
              }, msFromNow);
            } else if (mode !== 'scroll' && isLastMeasureNow) {
              // Wipe: 0.5 measures before block end; pagination: 0.25 measures before block end.
              const yellowFraction = mode === 'wipe' ? 0.5 : 0.25;
              const yellowAudioTime = nextStartTime + (1 - yellowFraction) * measureDuration;
              const transitionEnd = nextStartTime + measureDuration; // = block end
              if (mode === 'wipe' && this.refs.wipeTransitionRef) {
                // Set ref immediately — rAF clamps p=0 until yellowAudioTime, so no visual jump.
                this.refs.wipeTransitionRef.current = { startTime: yellowAudioTime, endTime: transitionEnd };
              }
              // Wipe: trigger React ~100ms early so new content is in DOM before mask sweep.
              // Pagination: trigger React ~50ms early so element is in DOM before rAF startTime.
              const reactEarlyMs = mode === 'wipe' ? 100 : 50;
              const setLayerMs = Math.max(0, (yellowAudioTime - this.context.currentTime) * 1000 - reactEarlyMs);
              if (mode === 'pagination' && this.refs.paginationFadeRef) {
                this.refs.paginationFadeRef.current = { startTime: yellowAudioTime, totalEnd: transitionEnd };
              }
              this.scheduleTimeout(() => {
                if (this.setters.setNextLayer) this.setters.setNextLayer('yellow');
              }, setLayerMs);
            }
          }

          // Scroll: 2 measures before series boundary — pregen and fade in the next melody.
          // The scroll is already running (started at m=0 of last rep above).
          // The new content fades in on the right side via scrollPreviewFadeIn CSS animation.
          if (!this.isOnceMode && mode === 'scroll' && isLastRepNow && isPenultimateMeasure && currentNumMeasures >= 2) {
            const fadeInDelay = Math.max(0, (nextStartTime - this.context.currentTime) * 1000);
            this.scheduleTimeout(() => {
              // Pregen first so content is available when React renders the overlay.
              const pregenResult = this.randomizeScaleAndGenerate(
                this.refs.numMeasuresRef.current,
                this.refs.timeSignatureRef.current,
                { treble, bass, percussion }
              );
              this.pregenResult = pregenResult;
              // setNextLayer + setPreviewMelody batch into one React render;
              // overlay mounts with opacity:0 and fades in via scrollPreviewFadeIn.
              if (this.setters.setNextLayer) this.setters.setNextLayer('red');
              if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(pregenResult);
            }, fadeInDelay);
          }

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

        iteration++;

        if (repsPerMelody !== -1 && iteration >= repsPerMelody) {
          this.melodyCount++;
          iteration = 0; // Reset for next melody

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

            // Use pre-generated result (scroll mode fires this earlier) or generate now.
            const result = this.pregenResult ?? this.randomizeScaleAndGenerate(this.refs.numMeasuresRef.current, currentTS, {
              treble,
              bass,
              percussion,
            });
            this.pregenResult = null;

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
            const applyResult = () => this.applyResultToSetters(result, { seriesStartMeasureIndex });

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
              } else if (previewMode !== 'scroll') {
                // Pagination: crossfade 0.25 measures before block end.
                const previewStart = nextStartTime - 0.25 * lastMeasureDuration;
                // Set fade ref immediately so rAF is ready; trigger React 50ms early for DOM presence.
                if (this.refs.paginationFadeRef) {
                  this.refs.paginationFadeRef.current = { startTime: previewStart, totalEnd: nextStartTime };
                }
                const previewDelay = Math.max(0, (previewStart - this.context.currentTime) * 1000 - 50);
                this.scheduleTimeout(() => {
                  if (this.setters.setNextLayer) this.setters.setNextLayer('red');
                  if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(result);
                }, previewDelay);
              } else if (currentNumMeasures === 1) {
                // Single-measure scroll: inner loop pregen (isPenultimateMeasure) never fires,
                // so handle here. Outer loop runs ~lookahead ahead of block end, so
                // scrollStart - currentTime ≈ lookahead (positive), firing at the correct audio time.
                // +0.75m offset (0.5m later than before): animation starts 0.25m before block end
                // and ends 0.75m after block end, so the old melody scrolls fully past the
                // 25% playhead before the new content takes over.
                const scrollStart = nextStartTime - 0.25 * lastMeasureDuration;
                const scrollEnd = nextStartTime + 0.75 * lastMeasureDuration;
                const scrollPreviewDelay = Math.max(0, (scrollStart - this.context.currentTime) * 1000);
                this.scheduleTimeout(() => {
                  // Animation ref first — layer starts moving before React re-renders.
                  if (this.refs.scrollTransitionRef) {
                    this.refs.scrollTransitionRef.current = { startTime: scrollStart, endTime: scrollEnd };
                  }
                  if (this.setters.setNextLayer) this.setters.setNextLayer('red');
                  if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(result);
                }, scrollPreviewDelay);
              }
              // Multi-measure scroll: inner loop already set setNextLayer + scrollTransitionRef
              // at the correct audio time; nothing to do here.

              // Apply result at block end for wipe/pagination; +0.75m for scroll so the
              // old melody fully scrolls past the 25% playhead before content is replaced
              // (scroll animation ends at +0.75m after the series boundary).
              const newSeriesStart = nextStartTime;
              const applyTime = previewMode === 'scroll'
                ? nextStartTime + 0.75 * lastMeasureDuration
                : nextStartTime;
              const scheduleTime = Math.max(0, (applyTime - this.context.currentTime) * 1000);
              this.scheduleTimeout(() => {
                if (this.setters.clearActiveHighlight) this.setters.clearActiveHighlight();
                if (this.scheduledNotes) {
                  this.scheduledNotes = this.scheduledNotes.filter(n => n.audioTime >= newSeriesStart);
                }
                applyResult();
                if (this.setters.setShowNotes) this.setters.setShowNotes(nextFirstRoundVisible);
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
                if (this.setters.setShowNotes) this.setters.setShowNotes(nextFirstRoundVisible);
              }, scheduleTime);
            }
          }
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
          // this.setters.setScale(activeScale); // REMOVED
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
      const existingStrategy = (currentProgression.type && currentProgression.type !== 'tonic-tonic-tonic')
        ? currentProgression.type : null;

      if (shouldGenerateNew && uiStrategy) {
        const complexity = this.refs.playbackConfigRef.current.chordComplexity || currentProgression.complexity || 'triad';
        const density = chordSettings?.chordCount || 1;
        const passingMode = chordSettings?.passingChords ?? 'none';
        // Match useMelodyState: when passing chords are on, exactly 1 structural chord per
        // measure is used. insertPassingChords fills the remaining slots.
        const structuralDensity = passingMode !== 'none' ? 1 : density;
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
      const seqPassingMode = chordSettings?.passingChords ?? 'none';
      const seqChordCount = chordSettings?.chordCount || 1;
      // Must match useMelodyState: exactly 1 structural chord per measure when passing is on.
      // Previously used Math.ceil(chordCount/2) which mismatched useMelodyState and (for
      // chordCount > 2) caused the notePool to be sized wrong.
      const seqStructuralCount = seqPassingMode !== 'none' ? 1 : seqChordCount;

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
      if (seqPassingMode !== 'none') {
        const complexity = chordProgression.complexity || chordSettings?.complexity || 'triad';
        const firstChord = chordMelody.displayNotes?.find(c => c !== null) ?? null;
        chordMelody = insertPassingChords(chordMelody, activeScale, timeSignature, complexity, seqPassingMode, seqChordCount, firstChord);
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
    for (let i = 0; i < chordProgression.offsets.length; i++) {
      const slot = chordProgression.offsets[i];
      if (slot >= m * measureLengthTicks && slot < (m + 1) * measureLengthTicks) {
        // Read degree directly from displayNotes[i] — always matches the current
        // chord melody, never one block behind like the old displayChordProgression lookup.
        const chord = chordProgression.displayNotes?.[i];
        const romanBase = chord?.meta?.romanBaseRaw ?? '';
        const degree = _RDEG[String(romanBase).toUpperCase()] ?? null;
        schedChords.push({
          audioTime: nextStartTime + (slot - m * measureLengthTicks) * timeFactor,
          duration: chordProgression.durations[i] * timeFactor,
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
  applyResultToSetters(result, { initialLoad = false, seriesStartMeasureIndex = null } = {}) {
    if (!initialLoad && this.setters.hideOldGroup) this.setters.hideOldGroup();
    if (result.tonic) this.setters.setTonic(result.tonic);
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
      if (this.setters.setNextLayer) this.setters.setNextLayer(null);
      if (this.setters.setPreviewMelody) this.setters.setPreviewMelody(null);
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

    try { this.instruments.treble?.stop(); } catch (e) { }
    try { this.instruments.bass?.stop(); } catch (e) { }
    try { this.instruments.chords?.stop(); } catch (e) { }
    // percussion and metronome were missing here — they must be stopped too or
    // their scheduled audio continues playing after the user presses Stop.
    try { this.instruments.percussion?.stop(); } catch (e) { }
    try { this.instruments.metronome?.stop(); } catch (e) { }

    this.playbackState = null;
    this.scheduledNotes = null;
    this.scheduledChords = [];
    this.scheduledMeasures = [];
    if (this.setters.onStop) this.setters.onStop();
  }
}

export default Sequencer;
