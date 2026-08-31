import { useEffect, useState } from 'react';
import Melody from '../model/Melody';
import { generateBlock } from '../generation/generateBlock';
import { generateMetronomeChunk } from '../generation/generateMetronomeChunk';
import { doubleMelodyForCallResponse } from '../generation/sliceSongCallResponseBlock';
import { sliceMelodyByRange } from '../utils/melodySlice';
import buildTimpaniPattern from '../utils/timpaniPattern';
import { TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';
import playMelodies from '../audio/playMelodies';
import { outputLatencySeconds } from '../audio/audioOutputLatency';
import {
    blockMeasuresFor, blockTypeForBlock, resolveBlockScale, blockCountFor,
    leadInSpecFor, trackSpecsForLevel, callGroupMeasuresFor,
} from '../levels/levelBlockPlan';

// ═══════════════════════════════════════════════════════════════════════════════════════
// useLevelContentStream — THE one per-block content pipeline for EVERY level (#1165/#1163b,
// Han 2026-08-29). Replaces five separate live mechanisms:
//
//   1. useLevelTrebleStream.js        treble, JIT per block (Wizard + gated procedural),
//                                     the wizard-cast audio, the decorativeWizard Major/Minor
//                                     alternation, the song call-response slice, and #1102's
//                                     decider role.                       → this file
//   2. useLevelBackingStream.js       bass (cello) + metronome, JIT per `leadInBars` chunk,
//                                     chunk 0 = the lead-in.              → this file
//   3. useLevelMixedStream.js         treble for `enemyType: 'Mixed'`, hardcoded 2-measure
//                                     blocks + `blockTypeAt`.             → this file + levelBlockPlan
//   4. useLevelKeyModulationStream.js treble for `decorativeWizard`, hardcoded 2-measure
//                                     Major/Minor alternation.            → this file + levelBlockPlan
//   5. useLevel.js `regenerate()` per wave — the whole-melody-per-wave path every level NOT
//                                     covered by 1-4 used.                → this file
//
// WHY (Han's own framing, #1163): those five had THREE different cadences, TWO different
// length fields (two of them read `numMeasures` where they meant `totalMeasures` — the §299
// bug class, live until this ticket) and no shared rhythm grid, so a level's tracks were never
// generated the way continuous playback generates them. There is now ONE cadence, ONE
// timeline, ONE accumulated audio-time cursor and ONE call into the SAME `generateBlock` the
// Sequencer uses (#1164) — so a level and continuous playback are literally the same pipeline
// (CLAUDE.md §6c), and per-level variation is expressed as DATA in `levelBlockPlan.js`.
//
// ── THE ONE TIMELINE ────────────────────────────────────────────────────────────────────
//   lead-in block   covers content measures [-leadInBars, 0)   (audio anchor: levelAudioStart)
//   block k         covers content measures [k*B, (k+1)*B)     B = blockMeasuresFor(lvl)
// Two tick ORIGINS are preserved exactly as the retired streams had them, because SheetMusic /
// SheetRpgLayer depend on both: the published TREBLE's tick 0 is content measure 0, while the
// published BASS/METRONOME's tick 0 is the FIRST LEAD-IN measure. Do not "unify" them here.
//
// ── "HEARD AT" TIMES (#1186) ────────────────────────────────────────────────────────────────────
// Every audio time in this file (`levelAudioStart`, `contentStartTime`, `blockStartTime`) is the moment
// the material must be HEARD — the same instant the visual clock puts it on the strike line. The
// hardware's own output latency is subtracted at exactly ONE seam, `scheduleInto` below, so nothing
// else in this file has to know about it. See src/audio/audioOutputLatency.js.
//
// ── APPEND-ONLY (CLAUDE.md §6, the level analogue of "Song is append-only") ──────────────
// Every published Melody grows by concatenation at monotonically increasing tick offsets. A
// block that has been published is NEVER rewritten, re-offset or dropped. SheetRpgLayer's
// slime/kill bookkeeping derives from these offsets and would desync the instant that broke.
//
// ── ADAPTIVE TEMPO (#1102) ──────────────────────────────────────────────────────────────
// This stream is the SOLE decider for EVERY level — the classic per-wave decider effect in
// App.jsx is gone with the mechanism it served. With one cadence, `commitIndexFor` is always
// called with `units: [B]`, so Han's "force exact sync" between treble and bass/metronome is
// now STRUCTURAL (they are the same block, generated and scheduled together at one bpm)
// rather than arithmetic. `adaptiveTempo`/`statsRef` are deliberately NOT in this effect's
// dependency array — subscribing to live stats would tear down and rebuild the whole JIT
// schedule on every hit/miss, which is exactly why `useLevel.statsRef` exists.
// ═══════════════════════════════════════════════════════════════════════════════════════
export default function useLevelContentStream({
    active,            // level.active (see App.jsx — ONE activation condition for every level now)
    lvl,               // level.current (already normalized + variant-applied)
    scale,
    timeSignature,
    // The level's per-track settings, as `useLevel.applyConfig` left them. Bundled into the
    // `instrumentSettings` shape `generateNextSeries` expects by `trackSpecsForLevel`.
    trebleSettings,
    bassSettings,
    percussionSettings,
    chordSettings,
    metronomeSettings,
    percussionScale,
    chordProgression,  // the level's once-generated chord Melody (App's `melodies.chordProgression`)
    // The song's OWN loaded melody (App's `melodies.treble`) for a `songId` level — never this
    // hook's own output. `null` for a procedural level, and until the song has finished loading.
    songMelody = null,
    context,
    levelAudioStart,   // audio-time anchor for the FIRST lead-in measure (App.jsx). sideScroll only.
    // Wizard cast preview (Wizard + Mixed levels) — its own dedicated stop-fns ref, never the
    // shared backing one (§6c: never blanket-cancel a schedule that isn't this stream's).
    wizardInstrument = null,
    wizardVolume,
    wizardStopFnsRef,
    // Backing audio (cello + metronome + timpani) — the shared level-backing stop-fns ref.
    bassInstrument,
    metronomeInstrument,
    // #1167: the level's dedicated timpani Soundfont, or `null` when this level has no melodic
    // percussion (App.jsx passes `percussionSettings.melodic ? timpaniRef.current : null`, exactly
    // as it already does for `useLevelGatedRubatoAudio`) — so "does this level get timpani" is ONE
    // decision, made at the call site, never re-derived here.
    timpaniInstrument = null,
    timpaniVolume = 1,
    backingStopFnsRef,
    bassReady,
    metronomeReady,
    levelMelodyReady,
    adaptiveTempo = null,
    statsRef = null,
}) {
    const [treble, setTreble] = useState(() => Melody.defaultTrebleMelody());
    const [bass, setBass] = useState(() => Melody.defaultBassMelody());
    const [metronome, setMetronome] = useState(() => Melody.defaultMetronomeMelody());
    const [percussion, setPercussion] = useState(() => Melody.defaultPercussionMelody());

    // StrictMode double-invokes this effect (mount → cleanup → mount) in development — cleanup
    // must fully undo THIS run's pending timers AND its already-scheduled audio so the second
    // mount can safely redo everything from scratch. (A `startedFor` guard instead of a real
    // cleanup is what caused the original "silence after a couple of measures" bug, §663.)
    useEffect(() => {
        if (!active || !lvl || !context) return;
        const sideScroll = !!lvl.sideScroll;
        // A side-scroll level has a real timeline: its content is generated JIT against the audio
        // anchor and every instrument it schedules against must already exist (never schedule a
        // stale instrument, and never start backing audio ahead of the melody — §663/§166).
        // A STATIC level (101/107/112) has no scroll, no anchor and no scheduled audio at all, so
        // the whole lookahead/scroll machinery below is simply inert for it: it runs through the
        // identical `generateBlock` path, synchronously, and publishes the result.
        if (sideScroll) {
            if (levelAudioStart == null) return;
            if (!bassReady || !metronomeReady) return;
            if (!levelMelodyReady) return;
        }
        // Only a level whose blocks can actually BE Wizard-type needs the cast instrument ready.
        const mayCast = lvl.enemyType === 'Wizard' || lvl.enemyType === 'Mixed';
        if (mayCast && sideScroll && !wizardInstrument) return;
        const specs = trackSpecsForLevel(lvl, {
            trebleSettings, bassSettings, percussionSettings, chordSettings, metronomeSettings,
        });
        // A song-backed level slices the song's own measures; there is nothing to publish until
        // `handleLoadSong` has actually finished (mirrors the wizard-instrument gate above).
        if (specs.songTreble && !songMelody?.notes?.length) return;

        setTreble(Melody.defaultTrebleMelody());
        setBass(Melody.defaultBassMelody());
        setMetronome(Melody.defaultMetronomeMelody());
        setPercussion(Melody.defaultPercussionMelody());

        const startBpm = lvl.bpm || 80;
        const barBeats = timeSignature[0] || 4;
        const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
        // Bug fix (Han 2026-08-06, "de 6/8 maatsoort zorgt dat alles misloopt"): `barSec =
        // (60/bpm) * timeSignature[0]` only works for a QUARTER-note beat (denominator 4) — it
        // silently treated the numerator as if it always counted quarter notes. For 6/8 each of
        // the 6 counted units is an EIGHTH note, so that formula computed literally double the
        // real bar length. Bar duration must derive from `measureLengthTicks` (already
        // denominator-correct) via the timing SSOT `secondsPerTick`.
        // #1102: a FUNCTION of bpm, not one constant for the whole level — an adaptive level's bar
        // duration changes when its tempo does, so each block is placed at `previous block start +
        // its OWN measures × ITS OWN bar duration` (an accumulated cursor). Identical arithmetic
        // for every non-adaptive level, where accumulation and multiplication give the same numbers.
        const barSecAt = (b) => measureLengthTicks * secondsPerTick(b);
        // The LEAD-IN always plays at the level's own starting tempo: no adaptive commit can exist
        // before the first block has been graded.
        const leadInBarSec = barSecAt(startBpm);

        const B = blockMeasuresFor(lvl);
        const { leadInBars, metronomeBars } = leadInSpecFor(lvl);
        const groupMeasures = callGroupMeasuresFor(lvl);
        const totalContentMeasures = lvl.totalMeasures ?? lvl.numMeasures ?? B;
        // §867/§1052: a gated level's content NEVER runs out — the player may stay frozen on one
        // note for an arbitrary real-time duration, so a fixed block count would eventually leave
        // the level with nothing left to generate (the cello simply going silent mid-level).
        const loopForever = !!lvl.gatedScroll;
        // Without a clock there is nothing to stream against, so a static level builds its whole
        // (always finite — `gatedScroll` implies `sideScroll`) content in one synchronous pass.
        const totalBlocks = sideScroll ? blockCountFor(lvl)
            : (Number.isFinite(blockCountFor(lvl)) ? blockCountFor(lvl) : 1);
        const contentStartTime = sideScroll ? levelAudioStart + leadInBars * leadInBarSec : 0;
        // #994 (decision D): a block must EXIST before its notes can enter the right edge of the
        // screen, which happens `visibleMeasures` measures before it sounds — separate from how
        // LONG the block is.
        const lookaheadMeasures = Math.max(B, lvl.visibleMeasures ?? B);
        const runId = `${levelAudioStart ?? lvl.id ?? 'level'}`;

        // ── TIMPANI (#1167, Han 2026-08-29: "Genereer de timpanen en cello gewoon mee met de chunks") ──
        // MOVED HERE from App.jsx's one-shot `playMelodies` call. The history that call carried, kept:
        //   #663 (Han 2026-08-03, "hard code de timpani voor nu"): timpani is the ONE Han-authorized
        //     hardcoded pattern (`utils/timpaniPattern.js`), deliberately NOT routed through
        //     MelodyGenerator — §6c is waived here by explicit instruction, not by omission.
        //   #994 (live Kalinka UAT): *"alle opmaten cello+timpanen"* — timpani sounds through EVERY
        //     lead-in measure; only the metronome is staggered.
        //   #1052 → #867 rework → #1096: a GATED level's timpani is triggered in real time off the
        //     gate's own frozen-aware clock by `useLevelGatedRubatoAudio.js` ("timpaan tel 3, wacht
        //     rustig tot tel 3 komt"), so it is excluded from this fixed schedule — the same exclusion
        //     cello and metronome already carry below, for the same reason.
        // WHY IT MOVED: the one-shot was built once and scheduled for `leadInBars + totalMeasures` at
        // the level's STARTING tempo. §346 called that harmless because it finished before the first
        // adaptive commit; #1166 (numMeasures 8 → 2, so multi-block ramp levels) and #1102's ×3
        // evaluation runway ended that — the pattern now spans ~24 measures while the tempo moves
        // underneath it, i.e. audible timpani-vs-music drift (§354 limitation 1).
        // HOW: the pattern for the WHOLE level is built ONCE from the SAME `buildTimpaniPattern` call
        // App.jsx's notation memo uses (§108 keeps notation and audio argument-identical), then SLICED
        // per block — exactly what `chordContextFor` below already does with the chord progression. The
        // union of the slices IS the one-shot's array, so the notes are byte-identical; only WHEN each
        // block is scheduled (and at which bpm) changes. Slicing the pre-built absolute-tick pattern —
        // rather than rebuilding it per block — is what keeps this correct for a meter whose measure is
        // not a whole number of quarter notes (7/8: the hit grid is uniform across the piece, so
        // measure k's hits do NOT sit at the same in-measure offsets as measure 0's, see #1044).
        // §867 PRESERVED: the pattern stays FINITE. It spans lead-in + the level's own declared
        // content, so a block past the level's end slices to nothing and the timpani falls silent with
        // the music — it can never loop forever, on any level.
        // ALSO PRESERVED (Han 2026-08-10, "die twee mogen nooit onafhankelijk beginnen"): timpani must
        // never start ahead of / independent from the treble melody. It used to need its own explicit
        // `levelMelodyReady` gate in App.jsx for that; here it is structural — this effect returns
        // early until `levelMelodyReady`, so timpani cannot exist before the melody does.
        const timpaniEnabled = !!timpaniInstrument && sideScroll && !lvl.gatedScroll;
        const timpaniPattern = timpaniEnabled
            ? buildTimpaniPattern(leadInBars + totalContentMeasures, timeSignature)
            : null;
        const timpaniSlice = (startMeasure, measures) => {
            if (!timpaniPattern) return null;
            const slice = sliceMelodyByRange(timpaniPattern, measureLengthTicks, measures, startMeasure);
            return slice.notes.length ? slice : null;
        };
        const timpaniGains = { treble: 0, bass: 0, percussion: timpaniVolume, chords: 0, metronome: 0 };

        let growingTreble = new Melody([], [], [], []);
        let growingBass = new Melody([], [], [], []);
        let growingMetronome = new Melody([], [], [], []);
        let growingPercussion = new Melody([], [], [], []);
        // Cross-block memory for a track whose rule is `'fixed'` but which has NO reference
        // material: block 0's generated chunk, replayed verbatim on every later block = an
        // ostinato (#1164). Threaded through the recursion so `generateBlock` stays pure.
        let fixedOstinato = null;

        const timers = [];
        const ownWizardStopFns = [];   // THIS run's scheduled cast StopFns
        const ownBackingStopFns = [];  // THIS run's scheduled cello/metronome StopFns
        // #1186 (Han 2026-08-29, "de noot valt niet EXACT tegelijk met de metronoom klik op de perfect
        // hit mark"): `scheduledStart` is the moment this material must be HEARD — the same instant the
        // visual clock (SheetRpgLayer, whose t=0 IS `levelAudioStart`) puts it on the strike line. A
        // sound only reaches the speakers `outputLatency` AFTER the AudioContext time it is scheduled
        // at, so it must be handed to `playMelodies` exactly that much earlier. See
        // audioOutputLatency.js for the measurement (48 ms in this project's own Chromium) and for why
        // the correction lives here rather than inside `playMelodies` (which is shared with the
        // Sequencer and the world's ambient music, neither of which has a visual clock to match).
        // Read FRESH per call, never captured once: the value changes when the player switches output
        // device mid-level, and this is the same "re-read the live value at the top of each scheduling
        // unit" pattern the per-block bpm read below already uses.
        const scheduleInto = (ref, own, melodies, instruments, scheduledStart, namedInstruments, trackGains, bpm) => {
            const before = ref.current.length;
            playMelodies(
                melodies, instruments, context, bpm, scheduledStart - outputLatencySeconds(context), null, null,
                namedInstruments, null, trackGains, ref,
            );
            for (let i = before; i < ref.current.length; i++) own.push(ref.current[i]);
        };

        // ── The LEAD-IN block ──────────────────────────────────────────────────────────────
        // Deliberately its own step, not block "-1" of the recursion: it is `leadInBars` long
        // (never the content cadence B), it has no treble/chords of its own, and its metronome is
        // trimmed to the last `metronomeBars` measures. Han's rule (live Kalinka UAT, §248):
        // *"alle opmaten cello+timpanen. de tweede helft (round up) + metronoom erbij"* — every
        // lead-in measure carries cello; ONLY the metronome is staggered. There are no silent
        // lead-in measures (see the REJECTED DESIGN note in levels.js).
        const generateLeadIn = () => {
            const leadIn = generateBlock({
                activeScale: scale,
                timeSignature,
                numMeasures: leadInBars,
                // The lead-in has no chord data of its own (no chords exist for negative measures)
                // — it reuses the FIRST content measure's harmony, the same "reuse the nearest real
                // content" principle the retired metronomeLeadIn.js used.
                chordProgression: chordContextFor(0, leadInBars),
                seriesArgs: seriesArgsFor(scale),
            });
            // Only BASS is taken from the lead-in block: the level's treble starts at content
            // measure 0, and the lead-in's percussion is Han's authorized hardcoded timpani pattern
            // (§663) — scheduled just below from `timpaniSlice`, which #1167 moved into this stream
            // from App.jsx's one-shot. Generating the whole block anyway keeps this path branch-free
            // and off the SAME shared rhythm grid as every content block.
            growingBass = appendChunk(growingBass, leadIn.bass, 0);
            setBass(growingBass);
            const metronomeChunk = generateMetronomeChunk({
                timeSignature, measures: metronomeBars, runId: `${runId}-leadin`,
            });
            // The metronome's lead-in chunk starts LATER than bass's — its tick timeline is shifted
            // forward by the same amount, so it never sounds during the first half of the lead-in.
            const metronomeBaseTicks = (leadInBars - metronomeBars) * measureLengthTicks;
            growingMetronome = appendChunk(growingMetronome, metronomeChunk, metronomeBaseTicks);
            setMetronome(growingMetronome);
            if (!sideScroll) return;
            // #1096: a gated level's cello is no longer pre-scheduled at all —
            // `useLevelGatedRubatoAudio.js` triggers it in real time off the gate's own
            // frozen-aware clock. §867 rework: a gated level gets NO metronome ("wel timpanen,
            // geen metronoom") — there is no fixed tempo to click to when the scroll waits for
            // the player. Both tracks' CONTENT is still generated above, only the fixed-schedule
            // AUDIO trigger is skipped, which keeps this function uniform per block.
            if (leadIn.bass?.notes?.length && !lvl.gatedScroll) {
                scheduleInto(backingStopFnsRef, ownBackingStopFns, [leadIn.bass], [bassInstrument],
                    levelAudioStart, { bass: bassInstrument },
                    { treble: 0, bass: 1, percussion: 0, chords: 0, metronome: 0 }, startBpm);
            }
            if (metronomeChunk.notes.length && !lvl.gatedScroll) {
                scheduleInto(backingStopFnsRef, ownBackingStopFns, [metronomeChunk], [metronomeInstrument],
                    levelAudioStart + (leadInBars - metronomeBars) * leadInBarSec, { metronome: metronomeInstrument },
                    { treble: 0, bass: 0, percussion: 0, chords: 0, metronome: 1 }, startBpm);
            }
            // #1167: the lead-in's own timpani measures — the pattern's measures [0, leadInBars),
            // at the level's starting tempo (no adaptive commit can exist before the first block
            // has been graded), on the SAME anchor the lead-in cello uses.
            const leadInTimpani = timpaniSlice(0, leadInBars);
            if (leadInTimpani) {
                scheduleInto(backingStopFnsRef, ownBackingStopFns, [leadInTimpani], [timpaniInstrument],
                    levelAudioStart, { percussion: timpaniInstrument }, timpaniGains, startBpm);
            }
        };

        // The harmonic window a block draws from. For a SONG this is handled inside
        // `generateBlock` by the existing `'song'` progression strategy (a per-measure modulo
        // follow); for a procedural level each block slices its own window out of the level's
        // once-generated progression — byte-identical to what all five retired mechanisms did.
        function chordContextFor(startMeasure, measures) {
            if (specs.chordStrategy === 'song') return null;   // generateBlock follows the song instead
            if (!chordProgression?.notes?.length) return null;
            const slice = sliceMelodyByRange(chordProgression, measureLengthTicks, measures, startMeasure);
            // Carry the chord metadata `insertPassingChords` / SheetMusic read off a chord track —
            // `sliceMelodyByRange` is a generic melody slicer and drops them.
            slice.type = chordProgression.type;
            slice.complexity = chordProgression.complexity;
            slice.modality = chordProgression.modality;
            return slice;
        }

        // The bundle `generateNextSeries` needs. A level passes NONE of the Sequencer's own
        // transpose-path inputs: `randConfig.melody` is never false (a level always generates or
        // replays fixed material, it never transposes a previous tick's melody), there are no
        // difficulty targets, and there is no `currentMelodyContext` reference melody — a song's
        // material reaches the pipeline through `fixedOstinato` instead, so the block gets the
        // song's notes VERBATIM rather than re-spelled through `modulateMelody`.
        function seriesArgsFor(blockScale) {
            return {
                oldTonic: blockScale.tonic,
                oldMode: blockScale.name,
                oldFamily: blockScale.family,
                oldScaleNotes: blockScale.notes,
                oldDisplayScale: blockScale.displayNotes,
                randConfig: { melody: true },
                currentMelodies: {},
                instrumentSettings: specs.instrumentSettings,
                currentMelodyContext: {},
                targetTrebleDifficulty: null,
                targetBassDifficulty: null,
                percussionScale,
            };
        }

        // #1102: `blockStartTime` is THREADED THROUGH the recursion (an accumulated audio-time
        // cursor) instead of being recomputed as `contentStartTime + k * B * barSec` — with a
        // tempo that can change between blocks, block k's start is `block k-1's start + its own
        // measures × ITS OWN bar duration`. Byte-identical placement at a constant tempo.
        const generateAndScheduleBlock = (blockIndex, blockStartTime) => {
            const contentMeasure = blockIndex * B;
            // The tempo THIS block is generated and scheduled at, read FRESH here rather than
            // captured once for the whole effect — the same "re-read the live bpm at the top of
            // each scheduling unit" pattern `Sequencer.scheduleBlock` already uses per measure.
            const bpm = (sideScroll && lvl.adaptive && adaptiveTempo)
                ? adaptiveTempo.bpmForMeasure(contentMeasure, blockStartTime)
                : startBpm;
            const barSec = barSecAt(bpm);
            const type = blockTypeForBlock(lvl, blockIndex);
            const isWizardBlock = type === 'Wizard';
            // A call-response block GENERATES one group and the `'call-response'` transform
            // doubles it into call + response (#1164's contract: pass `numMeasures ===
            // groupMeasures`, the transform spans `2 * groupMeasures` = B).
            const genMeasures = isWizardBlock ? groupMeasures : B;
            const blockScale = resolveBlockScale(lvl, scale, blockIndex);
            // §867 rework: wraps the CHORD LOOKUP back into the level's own declared content range
            // when looping forever, so a short progression never runs dry. This does NOT wrap the
            // block's own tick position or start time (those keep increasing linearly forever) —
            // only which measure of the repeating harmony this block is drawn from. Each block is
            // still freshly randomized, so the harmony loops while the melody never literally repeats.
            const chordWindowStart = loopForever
                ? (blockIndex * B) % Math.max(1, totalContentMeasures)
                : blockIndex * B;
            // A song-backed treble takes THIS block's slice of the song. Deliberately the
            // UNWRAPPED absolute window even for a gated level: past the song's last measure the
            // slice is empty, so a gated song level's treble stops growing at the song's true end
            // (no endless repeat) while its cello keeps flowing for as long as the gate holds.
            const songSlice = (specs.songTreble && songMelody)
                ? sliceMelodyByRange(songMelody, measureLengthTicks, genMeasures, blockIndex * genMeasures)
                : null;

            const block = generateBlock({
                activeScale: blockScale,
                timeSignature,
                numMeasures: genMeasures,
                chordProgression: chordContextFor(chordWindowStart, genMeasures),
                seriesArgs: seriesArgsFor(blockScale),
                ...(specs.chordStrategy === 'song' ? {
                    chordStrategy: 'song',
                    songChords: chordProgression,
                    songMeasureCount: Math.max(1, totalContentMeasures),
                    blockStartMeasure: blockIndex * B,
                } : {}),
                // Fixed material for this block: block 0's remembered chunk for an authored
                // `randomizationRule: 'fixed'` track, with a song level's treble slice layered on
                // top (a DIFFERENT slice per block, so a song plays through instead of looping).
                fixedOstinato: { ...(fixedOstinato || {}), ...(songSlice ? { treble: songSlice } : {}) },
                ...(isWizardBlock ? { shape: 'call-response', groupMeasures } : {}),
            });
            // Remember block 0's chunks for the no-reference ostinato path. The treble entry is
            // overwritten by the next block's own song slice above when a song is loaded.
            fixedOstinato = block.fixedOstinato;

            // A call-response block's ACCOMPANIMENT covers both halves. The chord/harmonic backdrop
            // is not something the player guesses by ear (that is the melody's job) — it is the
            // continuous accompaniment underneath BOTH the call and the response, so the same
            // content is simply repeated for each half. Exactly the rationale (and the exact
            // helper) `doubleMelodyForCallResponse` already carries for a song's chord track.
            if (isWizardBlock) {
                for (const track of ['bass', 'percussion']) {
                    block[track] = doubleMelodyForCallResponse({
                        melody: block[track], groupMeasures, measureLengthTicks, totalMeasures: groupMeasures,
                    });
                }
            }
            // The metronome is generated on its own, NOT through `generateBlock`: it is a
            // deterministic per-beat click track that must stay byte-identical across this
            // restructure (Han's accepted side-effect (a)) — see generateMetronomeChunk.js.
            const metronomeChunk = generateMetronomeChunk({
                timeSignature, measures: B, runId: `${runId}-${blockIndex}`,
            });

            // ── Publish (APPEND-ONLY — see this file's header) ─────────────────────────────
            // Treble/percussion live on the CONTENT tick timeline (tick 0 = content measure 0);
            // bass/metronome on the LEAD-IN timeline (tick 0 = the first lead-in measure). Both
            // origins are exactly what the retired streams published and what SheetMusic reads.
            const contentBaseTicks = blockIndex * B * measureLengthTicks;
            const backingBaseTicks = (leadInBars + blockIndex * B) * measureLengthTicks;
            growingTreble = appendChunk(growingTreble, block.treble, contentBaseTicks);
            setTreble(growingTreble);
            growingPercussion = appendChunk(growingPercussion, block.percussion, contentBaseTicks);
            setPercussion(growingPercussion);
            growingBass = appendChunk(growingBass, block.bass, backingBaseTicks);
            setBass(growingBass);
            growingMetronome = appendChunk(growingMetronome, metronomeChunk, backingBaseTicks);
            setMetronome(growingMetronome);

            if (sideScroll) {
                // Same lead-measure count SheetRpgLayer uses to gate the projectile's visibility
                // (§6c: one derived value, never a separately hardcoded "1 measure" here vs there).
                // Per-block, since it is expressed in this block's own bar duration.
                const leadOffsetSeconds = (lvl.wizardSpawnLeadMeasures ?? 1) * barSec;
                // Only a Wizard-type block has cast-preview audio. The whole block is scheduled
                // shifted EARLIER by leadOffsetSeconds so the cast finishes exactly as the response
                // half begins; the call half's own (silent) rests shift earlier still, which is
                // inaudible and harmless.
                if (isWizardBlock && wizardInstrument) {
                    scheduleInto(wizardStopFnsRef, ownWizardStopFns, [block.treble], [wizardInstrument],
                        blockStartTime - leadOffsetSeconds, null,
                        { treble: wizardVolume, bass: 0, percussion: 0, chords: 0, metronome: 0 }, bpm);
                }
                if (block.bass?.notes?.length && !lvl.gatedScroll) {
                    scheduleInto(backingStopFnsRef, ownBackingStopFns, [block.bass], [bassInstrument],
                        blockStartTime, { bass: bassInstrument },
                        { treble: 0, bass: 1, percussion: 0, chords: 0, metronome: 0 }, bpm);
                }
                if (metronomeChunk.notes.length && !lvl.gatedScroll) {
                    scheduleInto(backingStopFnsRef, ownBackingStopFns, [metronomeChunk], [metronomeInstrument],
                        blockStartTime, { metronome: metronomeInstrument },
                        { treble: 0, bass: 0, percussion: 0, chords: 0, metronome: 1 }, bpm);
                }
                // #1167: THIS block's timpani measures, at THIS block's own tempo, on the same
                // accumulated cursor as its cello and metronome — so the hardcoded pattern tracks an
                // adaptive tempo change instead of drifting away from the music it plays under. The
                // pattern lives on the LEAD-IN tick timeline (its measure 0 is the first lead-in
                // measure), hence the `leadInBars +` in the slice window, exactly like `backingBaseTicks`.
                const blockTimpani = timpaniSlice(leadInBars + blockIndex * B, B);
                if (blockTimpani) {
                    scheduleInto(backingStopFnsRef, ownBackingStopFns, [blockTimpani], [timpaniInstrument],
                        blockStartTime, { percussion: timpaniInstrument }, timpaniGains, bpm);
                }
                // #1102: THIS stream is the sole DECIDER, now for every level — one boundary, one
                // adjustment. `units: [B]` because there IS only one cadence: treble and
                // bass/metronome are the same block, so "force exact sync" is structural.
                if (lvl.adaptive && adaptiveTempo && statsRef) {
                    adaptiveTempo.evaluate({
                        stats: statsRef.current,
                        fromMeasure: (blockIndex + 1) * B,
                        units: [B],
                    });
                }
            }

            const nextIndex = blockIndex + 1;
            if (nextIndex >= totalBlocks) return;
            // No clock to stream against (a static level): build the rest right now.
            if (!sideScroll) { generateAndScheduleBlock(nextIndex, 0); return; }
            // #1102: the accumulated cursor — this block's own start plus its own measures at its
            // own tempo.
            const nextBlockStartTime = blockStartTime + B * barSec;
            if (blockIndex === 0) {
                // Both retired streams generated their first TWO units synchronously (there is no
                // earlier moment to pre-generate from); preserved so the level never starts with a
                // shorter buffer than it has today.
                generateAndScheduleBlock(nextIndex, nextBlockStartTime);
                return;
            }
            // #994 (decision D): the visibility deadline is when this block's first measure enters
            // the right edge of the screen.
            // #693 (Han 2026-08-04, "vanaf maat 4 komt de muziek van de wizard te laat, ongeveer een
            // halve maat"): for a Wizard-type block ALSO take the cast deadline — the next block's
            // cast fires `leadOffsetSeconds` BEFORE its own start, so generating merely "half a
            // measure before the block visually starts" left almost no slack before that cast was
            // due, and `playMelodies`'s own past-time clamp then silently pulled it to "now"
            // (audible as a late, sluggish cast). `Math.min` means generation can only ever move
            // EARLIER than that proven-correct timing, so #693 cannot regress by construction.
            const nextIsWizard = blockTypeForBlock(lvl, nextIndex) === 'Wizard';
            const nextLeadOffset = (lvl.wizardSpawnLeadMeasures ?? 1) * barSec;
            const visibilityDeadline = nextBlockStartTime - lookaheadMeasures * barSec;
            const generateAt = nextIsWizard
                ? Math.min(visibilityDeadline, (nextBlockStartTime - nextLeadOffset) - 0.5 * barSec)
                : visibilityDeadline;
            const delayMs = Math.max(0, (generateAt - context.currentTime) * 1000);
            timers.push(setTimeout(() => generateAndScheduleBlock(nextIndex, nextBlockStartTime), delayMs));
        };

        if (sideScroll) generateLeadIn();
        generateAndScheduleBlock(0, contentStartTime);

        return () => {
            timers.forEach((t) => clearTimeout(t));
            ownWizardStopFns.forEach((fn) => { try { fn(); } catch { /* already stopped */ } });
            ownBackingStopFns.forEach((fn) => { try { fn(); } catch { /* already stopped */ } });
        };
        // `adaptiveTempo`/`statsRef` are deliberately excluded — see this file's header.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, lvl, levelAudioStart, context, scale, timeSignature,
        trebleSettings, bassSettings, percussionSettings, chordSettings, metronomeSettings,
        percussionScale, chordProgression, songMelody,
        wizardInstrument, wizardVolume, wizardStopFnsRef,
        bassInstrument, metronomeInstrument, timpaniInstrument, timpaniVolume, backingStopFnsRef,
        bassReady, metronomeReady, levelMelodyReady]);

    return { treble, bass, metronome, percussion };
}

// Append one block's material to a growing Melody at `baseTicks`. Carries every parallel array
// the retired streams' own `appendBlock`/`appendChunk` carried between them (the treble one
// forwarded `rhythmicGrouping`, the bass one `volumes`/`ties`) — one helper for all four tracks
// now, so no track can silently lose a field the others keep.
function appendChunk(growing, chunk, baseTicks) {
    if (!chunk?.notes?.length) return growing;
    const shiftedOffsets = chunk.offsets.map((o) => (o == null ? o : o + baseTicks));
    const next = new Melody(
        [...growing.notes, ...chunk.notes],
        [...growing.durations, ...chunk.durations],
        [...growing.offsets, ...shiftedOffsets],
        [...(growing.displayNotes || growing.notes), ...(chunk.displayNotes || chunk.notes)],
        [...(growing.volumes || []), ...(chunk.volumes || [])],
    );
    next.ties = [...(growing.ties || []), ...(chunk.ties || [])];
    next.rhythmicGrouping = chunk.rhythmicGrouping ?? growing.rhythmicGrouping ?? null;
    return next;
}
