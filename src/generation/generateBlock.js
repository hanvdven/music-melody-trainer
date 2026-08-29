import Melody from '../model/Melody';
import MelodyGenerator from './melodyGenerator';
import { generateNextSeries } from './generateNextSeries';
import { insertPassingChords } from './passingChords';
import { generateDeterministicRhythm } from './rhythmicPriorities';
import { collapseToCallRests } from './generateLevel9CallResponseBlock';
import { GLOBAL_RESOLUTION } from '../constants/generatorDefaults';
import { TICKS_PER_WHOLE } from '../constants/timing.js';

/**
 * generateBlock — the ONE shared "generate ONE block of content" entry point.
 *
 * WHY THIS EXISTS (#1164 / #1163a, Han 2026-08-29): continuous playback
 * (`Sequencer.randomizeScaleAndGenerate`) and every level (#1165) must build a
 * block of music through the SAME code, not four hand-rolled copies (CLAUDE.md
 * §6c). `randomizeScaleAndGenerate` itself cannot BE that function — it reads ~10
 * `this.refs.*`, calls setters, mutates `this.displayChordProgression`, and
 * randomizes the scale (which a level must never do). So the CLEANLY-PURE inner
 * half of it — the part between "the progression is authored" and
 * "`_measureSpan` measures the result" — is extracted here verbatim:
 *
 *   1. the shared RHYTHM GRID  (`globalTemplate` via `generateDeterministicRhythm`)
 *   2. the rhythmic chord track (`MelodyGenerator` + `insertPassingChords`)
 *   3. the multi-track build    (`generateNextSeries` → treble / bass / percussion)
 *
 * PURE: no React, no `this`, no setters, no module-level mutable state. Everything
 * it needs is an argument; one `{ treble, bass, percussion, chords, ... }` comes
 * out. The Sequencer keeps scale randomization, progression authorship, the
 * `setDisplayChordProgression` side effect, `_measureSpan` and
 * `generatedNumMeasures`; it just delegates 1–3 to this function.
 *
 * ── PER-TRACK SOURCE ROUTING — driven by the EXISTING params, no new knob ──────
 * There is deliberately NO `source: 'generate' | 'fixed' | 'none'` vocabulary here
 * (an earlier plan draft proposed one; Han corrected it 2026-08-29). Routing keys
 * off parameters that ALREADY exist:
 *
 *  • CHORDS — the chord progression strategy key `'song'`
 *    (`src/theory/progressionDefinitions.js`). When `chordStrategy === 'song'` and
 *    a whole-song chord Melody + its measure count are supplied, this block's
 *    chords FOLLOW that progression by `(blockStartMeasure + localMeasure) modulo
 *    songMeasureCount` — a per-measure wrap, not a fresh `generateProgression`.
 *    Absent those args (the Sequencer never passes them) the chord track is built
 *    exactly as `randomizeScaleAndGenerate` built it: rhythmic `MelodyGenerator`
 *    over the given progression + `insertPassingChords`.
 *
 *  • TREBLE / BASS / PERCUSSION — the per-track `InstrumentSettings.randomizationRule
 *    === 'fixed'` (see `docs/architecture.md` §3 step 4e). `generateNextSeries`
 *    already handles the "a reference melody exists → slice/modulate it" half of
 *    that. This module ADDS the other half: when a track is `'fixed'` but has NO
 *    reference (no song loaded), the FIRST block's generated chunk is captured and
 *    REPLAYED verbatim on every later block → an ostinato. The caller threads the
 *    captured chunk back in via `fixedOstinato` (kept out of module state to stay
 *    pure). `randomizationRule !== 'fixed'` → generated fresh per block, unchanged.
 *
 *    NAMING NOTE: this is NOT a "collision" to warn about — `randomizationRule ===
 *    'fixed'` IS the mechanism we consume. It means "do not roll fresh notes for
 *    this track": either from a reference (song) or, now, from block 0's own chunk.
 *
 * ── OPTIONAL `shape: 'call-response'` POST-TRANSFORM ──────────────────────────
 * Applied to the treble track only: `collapseToCallRests` on the first
 * `groupMeasures` (the silent "call"), then the raw material shifted one group
 * later (the playable "response"). Applied to a GENERATED source it reproduces
 * `generateLevel9CallResponseBlock`; applied to a SLICED source it reproduces
 * `sliceSongCallResponseBlock` — the single merged mechanism (CLAUDE.md §6c, no
 * per-instrument branching per §6b). The caller passes `numMeasures ===
 * groupMeasures` for a call-response block; the transform doubles the span.
 *
 * NO PER-INSTRUMENT BRANCHING (CLAUDE.md §6b): the ostinato check is uniform
 * across track names — there is no `if (track === 'bass')` anywhere below. The
 * only asymmetry (which reference field / which scale) already lives inside
 * `generateNextSeries`, where the golden tests guard it.
 *
 * @param {object} args
 * @param {object}  args.activeScale       Resolved Scale (caller already randomized it, if at all).
 * @param {[number,number]} args.timeSignature
 * @param {number}  args.numMeasures       Generation chunk size for THIS block.
 * @param {object|null} args.chordProgression  Abstract ChordProgression, or a rhythmic chord Melody
 *                                          from a previous tick, or null — post progression-authorship.
 * @param {object}  args.seriesArgs        Bundle forwarded to `generateNextSeries` (everything it
 *                                          needs EXCEPT activeScale/numMeasures/timeSignature/
 *                                          chordProgression/globalTemplate, which this fn supplies):
 *                                          { oldTonic, oldMode, oldFamily, oldScaleNotes,
 *                                            oldDisplayScale, randConfig, currentMelodies,
 *                                            instrumentSettings, currentMelodyContext,
 *                                            targetTrebleDifficulty, targetBassDifficulty,
 *                                            percussionScale }.
 * @param {string}  [args.chordStrategy]        `'song'` triggers the modulo-follow chord path.
 * @param {object}  [args.songChords]           Whole-song chord Melody for the `'song'` path.
 * @param {number}  [args.songMeasureCount]     Song length in measures (the modulo).
 * @param {number}  [args.blockStartMeasure=0]  Absolute measure index of this block's first measure.
 * @param {object|null} [args.fixedOstinato]    `{ treble?, bass?, percussion? }` captured from block 0
 *                                              for `'fixed'`-no-reference tracks; null on block 0.
 * @param {'call-response'} [args.shape]        Optional treble post-transform.
 * @param {number}  [args.groupMeasures=1]      Call/response half-length when `shape==='call-response'`.
 * @returns {{ treble, bass, percussion, chordProgression, chords, globalTemplate, rhythmicGrouping,
 *            fixedOstinato, trebleSettings?, bassSettings? }}
 *   `chords` is an alias of `chordProgression` (the rhythmic chord Melody). `fixedOstinato` is the
 *   `{ treble?, bass?, percussion? }` the caller must feed back into the NEXT block's call.
 */
export function generateBlock({
  activeScale,
  timeSignature,
  numMeasures,
  chordProgression,
  seriesArgs = {},
  chordStrategy,
  songChords,
  songMeasureCount,
  blockStartMeasure = 0,
  fixedOstinato = null,
  shape,
  groupMeasures = 1,
}) {
  const measureLengthTicks = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
  const instrumentSettings = seriesArgs.instrumentSettings || {};
  const chordSettings = instrumentSettings.chords;

  // ── 1. Shared RHYTHM GRID (was Sequencer.js:1386-1396, verbatim) ─────────────
  // We need to match useMelodyState logic
  const measureSlots = (GLOBAL_RESOLUTION * timeSignature[0]) / timeSignature[1];
  const globalTemplate = generateDeterministicRhythm(
    1,
    timeSignature,
    measureSlots,
    'default',
    GLOBAL_RESOLUTION
  );

  // ── 2. Rhythmic chord track ────────────────────────────────────────────────
  // `rhythmicChords` ends as the Melody-shaped chord track for this block
  // (.notes = string[][] for audio, .displayNotes = Chord[] for SheetMusic).
  let rhythmicChords = chordProgression;

  if (chordStrategy === 'song' && songChords && songMeasureCount > 0) {
    // 'song' strategy (progressionDefinitions.js): the chords FOLLOW the loaded
    // song's own progression instead of being (re)generated. Each measure of this
    // block takes song-measure `(blockStartMeasure + localMeasure) mod songLen` —
    // a per-measure wrap so a 2-measure block straddling the song's loop point
    // still gets the right two chords. This is a purpose-built modulo slice, NOT a
    // third general melody slicer (that stays `sliceMelodyByRange`); the ticket
    // asks specifically for the per-measure-modulo follow to be (re)implemented.
    rhythmicChords = sliceSongChordsModulo(
      songChords, measureLengthTicks, numMeasures, blockStartMeasure, songMeasureCount
    );
  } else if (chordProgression && (chordProgression.chords || chordProgression.displayNotes)) {
    // ── (was Sequencer.js:1409-1479, moved verbatim — comments preserved) ──
    // If we have a chord progression (abstract), let's make it rhythmic
    // Only if we actually have chords to play.
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
      // #362: mirrors useMelodyState — chords' own smallest-note setting.
      smallestNoteDenom: chordSettings?.smallestNoteDenom ?? (timeSignature[1] || 4),
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

    rhythmicChords = chordMelody;
  }
  // else: rhythmicChords stays === chordProgression (null, or an already-rhythmic
  // Melody) — same as the old `result.chordProgression = chordProgression` branch.

  // ── 3. Multi-track build (was Sequencer.js:1495-1513) ──────────────────────
  // generateNextSeries stays the pure per-track builder; it already owns the
  // `randomizationRule === 'fixed'` + reference-melody slice/modulate path and the
  // transpose-without-regenerate path. We only forward the args it needs.
  const series = generateNextSeries({
    activeScale,
    numMeasures,
    timeSignature,
    chordProgression: rhythmicChords,
    globalTemplate,
    oldTonic: seriesArgs.oldTonic,
    oldMode: seriesArgs.oldMode,
    oldFamily: seriesArgs.oldFamily,
    oldScaleNotes: seriesArgs.oldScaleNotes,
    oldDisplayScale: seriesArgs.oldDisplayScale,
    randConfig: seriesArgs.randConfig || {},
    currentMelodies: seriesArgs.currentMelodies || {},
    instrumentSettings,
    currentMelodyContext: seriesArgs.currentMelodyContext || {},
    targetTrebleDifficulty: seriesArgs.targetTrebleDifficulty ?? null,
    targetBassDifficulty: seriesArgs.targetBassDifficulty ?? null,
    percussionScale: seriesArgs.percussionScale,
  });

  // ── 3b. `'fixed'`-no-reference ostinato (the one NEW behaviour, #1164) ──────
  // A track whose rule is 'fixed' but which has NO reference material must not be
  // re-rolled each block: generate it ONCE (block 0, done by generateNextSeries
  // above) then replay THAT chunk verbatim on every later block. The caller owns
  // the cross-block memory — it threads block 0's chunk back in as `fixedOstinato`
  // — so this module keeps zero mutable state.
  const ctx = seriesArgs.currentMelodyContext || {};
  const curMel = seriesArgs.currentMelodies || {};
  const hasReference = {
    treble: !!ctx.referenceMelody,
    bass: !!ctx.referenceBassMelody,
    percussion: !!curMel.percussion,
  };
  const outOstinato = {};
  for (const track of ['treble', 'bass', 'percussion']) {
    const isFixed = instrumentSettings[track]?.randomizationRule === 'fixed';
    if (!isFixed || hasReference[track]) continue; // reference path handled in generateNextSeries
    if (fixedOstinato && fixedOstinato[track]) {
      // Later block: discard the fresh generation, replay block 0's chunk. (Cloned
      // so a consumer that mutates a block in place can't corrupt the cache.)
      series[track] = cloneMelodyLike(fixedOstinato[track]);
    }
    // Block 0: `series[track]` is the freshly-generated chunk to remember.
    outOstinato[track] = fixedOstinato?.[track] ?? series[track];
  }

  // ── 3c. Optional call-response shape (treble only) ─────────────────────────
  if (shape === 'call-response' && series.treble) {
    series.treble = applyCallResponseShape(series.treble, groupMeasures, measureLengthTicks);
  }

  const out = {
    treble: series.treble,
    bass: series.bass,
    percussion: series.percussion,
    chordProgression: rhythmicChords,
    chords: rhythmicChords, // alias — same object, friendlier name for level callers
    globalTemplate,
    rhythmicGrouping: rhythmicChords?.rhythmicGrouping ?? globalTemplate,
    fixedOstinato: outOstinato,
  };
  // Surface effective settings ONLY when a difficulty target overrode them —
  // preserves randomizeScaleAndGenerate's old contract (undefined otherwise).
  if (series.trebleSettings) out.trebleSettings = series.trebleSettings;
  if (series.bassSettings) out.bassSettings = series.bassSettings;
  return out;
}

/**
 * Per-measure modulo slice of a whole-song chord Melody — the `'song'` strategy's
 * "follow the progression" behaviour. Each of the block's `numMeasures` measures
 * takes song-measure `(blockStartMeasure + localMeasure) mod songMeasureCount`,
 * with offsets re-based to 0 at the block start. Not a general melody slicer —
 * `sliceMelodyByRange` stays that; this exists only for the wrap-around follow.
 */
function sliceSongChordsModulo(songChords, measureLengthTicks, numMeasures, blockStartMeasure, songMeasureCount) {
  const notes = [];
  const durations = [];
  const offsets = [];
  const displayNotes = [];
  const srcDisplay = songChords.displayNotes || songChords.notes;
  for (let local = 0; local < numMeasures; local++) {
    const srcMeasure = (((blockStartMeasure + local) % songMeasureCount) + songMeasureCount) % songMeasureCount;
    const lo = srcMeasure * measureLengthTicks;
    const hi = lo + measureLengthTicks;
    for (let i = 0; i < songChords.offsets.length; i++) {
      const o = songChords.offsets[i];
      if (o == null || o < lo || o >= hi) continue;
      notes.push(songChords.notes[i]);
      durations.push(songChords.durations[i]);
      offsets.push(local * measureLengthTicks + (o - lo));
      displayNotes.push(srcDisplay[i]);
    }
  }
  const m = new Melody(notes, durations, offsets, displayNotes);
  m.rhythmicGrouping = songChords.rhythmicGrouping ?? null;
  // Carry the chord metadata SheetMusic / the sequencer read off a rhythmic chord track.
  m.type = songChords.type;
  m.complexity = songChords.complexity;
  m.modality = songChords.modality;
  return m;
}

/**
 * Collapse the first `groupMeasures` of `src` to per-measure rests (the "call"),
 * then append `src`'s raw material shifted one group later (the "response"). This
 * is `generateLevel9CallResponseBlock`'s tail and `sliceSongCallResponseBlock`'s
 * tail, verbatim — one transform for both, applied to whichever source produced
 * the material.
 */
function applyCallResponseShape(src, groupMeasures, measureLengthTicks) {
  const notes = src.notes;
  const durations = src.durations;
  const offsets = src.offsets;
  const displayNotes = src.displayNotes || src.notes;

  const call = collapseToCallRests(notes, durations, offsets, displayNotes, measureLengthTicks);
  const shift = groupMeasures * measureLengthTicks;
  const responseOffsets = offsets.map((o) => (o == null ? o : o + shift));

  const out = new Melody(
    [...call.notes, ...notes],
    [...call.durations, ...durations],
    [...call.offsets, ...responseOffsets],
    [...call.displayNotes, ...displayNotes],
  );
  out.rhythmicGrouping = src.rhythmicGrouping ?? null;
  return out;
}

/** Shallow value-copy of a Melody-shaped object into a fresh Melody instance. */
function cloneMelodyLike(m) {
  if (!m) return m;
  const c = new Melody(
    [...m.notes],
    [...m.durations],
    [...m.offsets],
    m.displayNotes ? [...m.displayNotes] : [...m.notes],
  );
  if (m.rhythmicGrouping != null) c.rhythmicGrouping = m.rhythmicGrouping;
  if (m.rhythmicDNA != null) c.rhythmicDNA = m.rhythmicDNA;
  if (Array.isArray(m.ties)) c.ties = [...m.ties];
  if (Array.isArray(m.volumes)) c.volumes = [...m.volumes];
  if (Array.isArray(m.velocities)) c.velocities = [...m.velocities];
  if (Array.isArray(m.triplets)) c.triplets = m.triplets.map((t) => t ?? null);
  return c;
}

export default generateBlock;
