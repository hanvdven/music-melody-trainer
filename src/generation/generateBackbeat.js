/**
 * generateBackbeat.js
 *
 * Generates percussion patterns driven by the ranked-array DNA pipeline
 * (generateRankedRhythm). The existing DNA naturally encodes beat hierarchy:
 *
 *   beatClass = Math.floor(rank / numMeasures)
 *
 * Two pattern modes, both variable and DNA-driven:
 *
 *   BACKBEAT  — hh+k on downbeats, hh+s on backbeats, hh fill
 *   SWING     — cr/hp/k/s with jazz ride-pattern prefill
 *
 * DNA encodes beat hierarchy. RankedArray shuffles the DNA, proximity search 
 * places primary k/s, and applyVariability adds note-level mutations.
 */

import Melody from '../model/Melody.js';
import { TICKS_PER_WHOLE } from '../constants/timing.js';
import { generateRankedRhythm } from './generateRankedRhythm.js';
import { findBestSlot } from './proximityUtils.js';
import { chooseGrouping, generateRhythmicDNA } from './rhythmicPriorities.js';
// #435: the percussion overlap-hierarchy resolver moved to drumKits.js (percussion-pad SSOT, §8)
// so the voices post-step in melodyGenerator shares it. Behaviour is byte-identical.
import { resolvePercussionChord } from '../audio/drumKits.js';

// ─── Beat-count helpers ─────────────────────────────────────────────────────

/** Tick duration of one slot at the given resolution. 48 ticks = whole note. */
const slotTicks = ([, bottom], smallestNoteDenom) =>
    48 / Math.max(bottom, smallestNoteDenom);

// ─── Note-level variability mutations ────────────────────────────────────────

const RANDOM_POOL = ['k', 's', 'sg', 'hh', 'ho', 'r'];

const applyVariability = (notes, v) => {
    if (v <= 0) return notes;

    return notes.map(slot => {
        if (slot === 'r') return 'r';

        // Full randomisation at extreme variability
        if (v >= 0.95 && Math.random() < (v - 0.95) * 20) {
            return RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
        }

        if (Array.isArray(slot)) {
            let result = [...slot];
            const hasBeat = result.includes('k') || result.includes('s');

            if (result.includes('hh') && Math.random() < v * 0.45)
                result = result.map(n => (n === 'hh' ? 'ho' : n));

            if (hasBeat && result.includes('hh') && !result.includes('sg') && Math.random() < v * 0.25)
                result.push('sg');

            if (!hasBeat && Math.random() < v * 0.30)
                result.push(Math.random() < 0.5 ? 'k' : 'sg');

            return result.length === 1 ? result[0] : result;
        }

        if (typeof slot === 'string') {
            if (slot === 'hh') {
                if (Math.random() < v * 0.45) return 'ho';
                if (Math.random() < v * 0.55) return ['hh', 'sg'];
            }
            if ((slot === 'k' || slot === 's') && Math.random() < v * 0.20)
                return [slot, 'sg'];
        }

        return slot;
    });
};

const PERC_POOLS = {
    'kick_snare': ['k', 's', 'sg', 'hh', 'ho'],
    'claves': ['wh', 'wm', 'wl'],
    'all': ['k', 's', 'sg', 'sr', 'hh', 'ho', 'hp', 'th', 'tm', 'tl', 'cr', 'cc', 'wh', 'wm', 'wl', 'cb']
};

/**
 * Post-process a generated percussion melody, dropping any pad id that is NOT in
 * `enabledPads` (the user's drum-pool selection from the range selector). A slot
 * whose pads are ALL removed becomes a rest ('r'), so offsets/durations — and
 * therefore the rhythm — stay byte-for-byte intact. This is the single point
 * where the pool selection influences generation, applied uniformly to every
 * percussion pattern (backbeat/backbeat2/swing) by the MelodyGenerator.
 *
 * `enabledPads == null` → no filtering (back-compat: every pad allowed). This is
 * intentionally separate from `notePool` (which still selects the STYLE; moving
 * style onto randomizationRule is Phase-5 technical debt per Han 2026-05-30).
 */
export function filterPercussionByEnabledPads(melody, enabledPads) {
    if (!enabledPads || !Array.isArray(enabledPads)) return melody;
    const allowed = new Set(enabledPads);
    const keep = (id) => allowed.has(id);
    const notes = melody.notes.map(entry => {
        if (entry === 'r' || entry == null) return entry;
        if (Array.isArray(entry)) {
            const kept = entry.filter(keep);
            return kept.length === 0 ? 'r' : (kept.length === 1 ? kept[0] : kept);
        }
        return keep(entry) ? entry : 'r';
    });
    return { ...melody, notes };
}

const SWING_PREFILL = ['cr', null, ['cr', 'hp'], 'cr'];

// #435: `cleanPercussionChord` (the percussion overlap-hierarchy: s>sg>wh>wm>wl>cb,
// cc>cr>ho>hh with "ho kills hh", tl>tm>th) moved VERBATIM to drumKits.js as
// `resolvePercussionChord` — imported above and shared with the voices post-step.

// ─── Core ranked-array-driven percussion generator ──────────────────────────

function generatePercussionFromDNA(
    patternName, timeSignature, numMeasures, smallestNoteDenom,
    dnaVariability, noteVariability, notesPerMeasure = 4, notePool = 'all'
) {
    const v = Math.max(0, Math.min(100, noteVariability)) / 100;

    // Always fill every slot — density is fixed for percussion patterns
    const measureNoteResolution = Math.max(timeSignature[1], smallestNoteDenom);
    const slotsPerMeasure = (measureNoteResolution * timeSignature[0]) / timeSignature[1];

    // dnaVariability controls ranked-array shuffling (0 = deterministic, >0 = shuffled)
    const { rankedArray } = generateRankedRhythm(
        numMeasures,
        timeSignature,
        notesPerMeasure,
        smallestNoteDenom,
        dnaVariability,      // ← rhythm-level variability (shuffles ranks)
        'default',
    );

    let rawNotes = [];
    const totalNotesThreshold = notesPerMeasure * numMeasures;

    if (patternName !== 'backbeat' && patternName !== 'swing') {
        throw new Error(`[generatePercussionFromDNA] Unknown pattern: "${patternName}"`);
    }

    const pool = PERC_POOLS[notePool] || PERC_POOLS.all;

    for (let m = 0; m < numMeasures; m++) {
        const measureStart = m * slotsPerMeasure;
        const midPoint = Math.floor(slotsPerMeasure / 2);

        const window = { start: measureStart, end: measureStart + slotsPerMeasure - 1 };

        let bestK = -1;
        if (notesPerMeasure >= 1) {
            const resultK = findBestSlot(rankedArray, measureStart, window, totalNotesThreshold);
            bestK = resultK.index;
        }

        let bestS = -1;
        if (notesPerMeasure >= 2) {
            const targetS = measureStart + midPoint;
            const resultS = findBestSlot(rankedArray, targetS, window, totalNotesThreshold);
            bestS = resultS.index;
        }

        // Tie-break: if S stole K's spot, K wins the primary spot
        if (bestK === bestS && bestS !== -1) {
            bestS = -1;
        }

        // 2) Assign notes
        for (let i = 0; i < slotsPerMeasure; i++) {
            const globalIdx = measureStart + i;
            const rank = rankedArray[globalIdx];

            // Define base slot sound (HH for backbeat, Ride/Pedal sequence for Swing)
            let baseNotes = [];
            if (patternName === 'swing') {
                const prefill = SWING_PREFILL[i % SWING_PREFILL.length];
                if (prefill) {
                    if (Array.isArray(prefill)) baseNotes.push(...prefill);
                    else baseNotes.push(prefill);
                }
            } else {
                baseNotes.push('hh');
            }

            if (rank === null || rank >= totalNotesThreshold) {
                rawNotes[globalIdx] = baseNotes.length === 1 ? baseNotes[0] : (baseNotes.length === 0 ? 'r' : baseNotes);
                continue;
            }

            let slotNotes = [...baseNotes];

            if (i === bestK) {
                slotNotes.push('k');
            } else if (i === bestS) {
                slotNotes.push('s');
            } else if (notesPerMeasure > 2) {
                // Extra notes from pool if density > 2
                const randNote = pool[Math.floor(Math.random() * pool.length)];
                if (!slotNotes.includes(randNote) && randNote !== 'hh' && randNote !== 'cr') {
                    slotNotes.push(randNote);
                }
            }

            rawNotes[globalIdx] = slotNotes.length === 0 ? 'r' : (slotNotes.length === 1 ? slotNotes[0] : slotNotes);
        }
    }

    // Apply Variability (mutations like hh->ho, ghost snares)
    const mutatedNotes = v > 0 ? applyVariability(rawNotes, v) : rawNotes;

    // Apply General Percussion Hierarchy Cleaning to ALL notes
    const finalNotes = mutatedNotes.map(slot => resolvePercussionChord(slot));

    // Build Melody
    const tickDur = slotTicks(timeSignature, smallestNoteDenom);
    const durations = finalNotes.map(() => tickDur);
    const offsets = finalNotes.map((_, i) => i * tickDur);

    return new Melody(finalNotes, durations, offsets, finalNotes);
}

// ─── Public exports ─────────────────────────────────────────────────────────

/**
 * Generate a variable backbeat pattern (hh/k/s + fills).
 * Variability shuffles the DNA (proximity algorithm) AND mutates notes.
 */
export function generateBackbeat(
    timeSignature, numMeasures,
    smallestNoteDenom = 4, variability = 0,
    notesPerMeasure = 4,
    notePool = 'all'
) {
    return generatePercussionFromDNA('backbeat', timeSignature, numMeasures, smallestNoteDenom, variability, variability, notesPerMeasure, notePool);
}

/**
 * Generate a group-aware backbeat: kick on the downbeat, snares on backbeat group
 * starts (prioritised by DNA rank), hihat on every beat-unit, and optional spillover
 * from the note pool.
 *
 * Key differences from backbeat:
 *  - Grouping is derived from chooseGrouping so irregular meters (5/8, 7/8, …) work.
 *  - findBestSlot window spans the FULL array — a note may slide to an adjacent measure.
 *  - When notesPerMeasure < numGroups only the highest-priority snare slots are filled.
 *  - rhythmicGrouping is attached to the returned Melody for beaming in the renderer.
 */
export function generateBackbeat2(
    timeSignature, numMeasures,
    smallestNoteDenom = 4, variability = 0,
    notesPerMeasure = 4,
    notePool = 'all'
) {
    const v = Math.max(0, Math.min(100, variability)) / 100;
    const pool = PERC_POOLS[notePool] || PERC_POOLS.all;

    const measureNoteResolution = Math.max(timeSignature[1], smallestNoteDenom);
    const slotsPerMeasure = (measureNoteResolution * timeSignature[0]) / timeSignature[1];
    // slotsPerBeat = slots per denominator beat-unit (e.g. 4 for 16th-note resolution in 4/4)
    const slotsPerBeat = measureNoteResolution / timeSignature[1];
    const totalSlots = slotsPerMeasure * numMeasures;
    const totalNotesThreshold = notesPerMeasure * numMeasures;

    // One grouping choice applies to every measure in the block.
    const grouping = chooseGrouping(timeSignature[0]);
    const numGroups = grouping.length;

    // Slot offset within a measure for each group's first beat.
    const groupSlotOffsets = [];
    let beatAcc = 0;
    for (const size of grouping) {
        groupSlotOffsets.push(Math.round(beatAcc * slotsPerBeat));
        beatAcc += size;
    }

    // Build the DNA template from the chosen grouping and apply variability.
    const dnaMeasure = generateRhythmicDNA(grouping, timeSignature, smallestNoteDenom);
    const deterministicTemplate = new Array(numMeasures).fill(null).map(() => [...dnaMeasure]);
    const { rankedArray } = generateRankedRhythm(
        numMeasures, timeSignature, notesPerMeasure, smallestNoteDenom,
        variability, 'default', deterministicTemplate
    );

    // Working copy: null out slots after allocation to prevent reuse.
    const workingRanks = [...rankedArray];
    const fullWindow = { start: 0, end: totalSlots - 1 };

    // rawNotes accumulator — one entry per slot.
    const rawNotes = new Array(totalSlots).fill('r');

    // Merge a note into a slot, stacking with any existing notes.
    const addNote = (slotIdx, note) => {
        const cur = rawNotes[slotIdx];
        if (cur === 'r') {
            rawNotes[slotIdx] = note;
        } else if (Array.isArray(cur)) {
            if (!cur.includes(note)) cur.push(note);
        } else if (cur !== note) {
            rawNotes[slotIdx] = [cur, note];
        }
    };

    // ── 1. Hihat on every slot across all measures ────────────────────────────
    // Step by 1 so the hihat fills every subdivision (= every smallestNoteDenom value),
    // matching the density of backbeat_1. backbeat_2 differs only in WHERE kick and snare
    // land, not in hihat density.
    for (let s = 0; s < totalSlots; s++) {
        rawNotes[s] = 'hh';
    }

    // ── 2. Kick + snares + spillover, per measure ─────────────────────────────
    for (let m = 0; m < numMeasures; m++) {
        const measureStart = m * slotsPerMeasure;
        let budget = notesPerMeasure;

        // Kick on group-0 downbeat (always slot 0 of the measure).
        const kickTarget = measureStart + groupSlotOffsets[0];
        const kickResult = findBestSlot(workingRanks, kickTarget, fullWindow, totalNotesThreshold);
        if (kickResult.index !== -1 && budget > 0) {
            addNote(kickResult.index, 'k');
            workingRanks[kickResult.index] = null;
            budget--;
        }

        // Snares on remaining group downbeats, ordered by DNA rank (ascending = highest priority).
        // When notesPerMeasure < numGroups only the top-priority backbeat groups receive a snare.
        if (numGroups > 1 && budget > 0) {
            const backbeatTargets = groupSlotOffsets.slice(1).map(off => ({
                target: measureStart + off,
                // Use the variability-adjusted rank at the group's ideal slot for priority ordering.
                rank: rankedArray[measureStart + off] ?? Infinity,
            }));
            backbeatTargets.sort((a, b) => a.rank - b.rank);

            for (const bg of backbeatTargets) {
                if (budget <= 0) break;
                const snareResult = findBestSlot(workingRanks, bg.target, fullWindow, totalNotesThreshold);
                if (snareResult.index !== -1) {
                    addNote(snareResult.index, 's');
                    workingRanks[snareResult.index] = null;
                    budget--;
                }
            }
        }

        // Spillover: fill any remaining budget with random pool notes on the best
        // remaining ranked slots within this measure's ideal region.
        while (budget > 0) {
            const spillResult = findBestSlot(workingRanks, measureStart, fullWindow, totalNotesThreshold);
            if (spillResult.index === -1) break;
            const randNote = pool[Math.floor(Math.random() * pool.length)];
            addNote(spillResult.index, randNote);
            workingRanks[spillResult.index] = null;
            budget--;
        }
    }

    // ── 3. Apply note-level variability mutations ─────────────────────────────
    const mutatedNotes = v > 0 ? applyVariability(rawNotes, v) : rawNotes;

    // ── 4. Clean percussion hierarchy collisions ──────────────────────────────
    const finalNotes = mutatedNotes.map(slot => resolvePercussionChord(slot));

    const tickDur = slotTicks(timeSignature, smallestNoteDenom);
    const durations = finalNotes.map(() => tickDur);
    const offsets = finalNotes.map((_, i) => i * tickDur);

    const melody = new Melody(finalNotes, durations, offsets, finalNotes);
    // Attach grouping so the sheet-music renderer can draw correct beam spans.
    melody.rhythmicGrouping = grouping;
    melody.rhythmicDNA = dnaMeasure;
    return melody;
}

/**
 * Generate a woodblock metronome pattern driven by the shared rhythmicGrouping.
 *
 *   wh (woodblock hi)  — measure downbeat (beat index 0)
 *   wm (woodblock mid) — other group downbeats (beat indices from grouping)
 *   wl (woodblock lo)  — all remaining beats
 *
 * One click per denominator-unit beat per measure. No randomisation; variability
 * is intentionally zero for the metronome.
 */
export function generateMetronome(timeSignature, numMeasures, rhythmicGrouping) {
    const [numerator, denominator] = timeSignature;

    // Beat positions (0-indexed within measure) that open a group, excluding beat 0
    // (which is always wh — the measure downbeat).
    const innerGroupStarts = new Set();
    let acc = 0;
    for (let i = 0; i < rhythmicGrouping.length - 1; i++) {
        acc += rhythmicGrouping[i];
        innerGroupStarts.add(acc);
    }

    const ticksPerBeat = TICKS_PER_WHOLE / denominator;
    const notes = [];
    for (let m = 0; m < numMeasures; m++) {
        for (let b = 0; b < numerator; b++) {
            if (b === 0) notes.push('wh');
            else if (innerGroupStarts.has(b)) notes.push('wm');
            else notes.push('wl');
        }
    }

    const durations = notes.map(() => ticksPerBeat);
    const offsets   = notes.map((_, i) => i * ticksPerBeat);

    const melody = new Melody(notes, durations, offsets, notes);
    // Attach grouping so sheet-music renderer can draw correct beam spans.
    melody.rhythmicGrouping = rhythmicGrouping;
    return melody;
}

/**
 * Generate a variable swing pattern (cr/hp/k/s + fills).
 */
export function generateSwing(
    timeSignature, numMeasures,
    smallestNoteDenom = 8, variability = 0,
    notesPerMeasure = 4,
    notePool = 'all'
) {
    return generatePercussionFromDNA('swing', timeSignature, numMeasures, smallestNoteDenom, variability, variability, notesPerMeasure, notePool);
}

// #1091 (Han 2026-08-19): the substitution pool for `generateHh` — "randomize dan met note pool:
// ho/hp/r/rb" (rb confirmed by Han as the existing `cr_bell` pad, not a new one). Fixed to the hh type
// itself (not exposed via InstrumentSettings.notePool, unlike PERC_POOLS above) — Han specified this
// exact pool as part of what "hh" IS, not a separate configurable style knob.
const HH_SUBSTITUTION_POOL = ['ho', 'hp', 'r', 'cr_bell'];

// #1091 UAT round 2 (Han 2026-08-19, "I LOF the percussion... every 2 measures randomize percussion,
// randomly select 1,2,4,8,16 as the smallest note denum... set notes per measure to 1,1,2,3,4
// respectively"): the water env-audio caller (useWorldAmbientMusic.js) draws BOTH values from this
// table each block — Han's own explicit density curve, one entry per resolution choice. Not a
// derivable formula (§6c only asks for one when a value CAN be derived; this is Han's own creative
// density choice, dictated verbatim, the same class of "fixed external spec" as GM_PROGRAM above), and
// also the fallback used by melodyGenerator.js's `notesPerMeasure || …` for the practice-mode carousel.
export const HH_NOTES_PER_MEASURE_BY_DENOM = { 1: 1, 2: 1, 4: 2, 8: 3, 16: 4 };

/**
 * A slot's metrical strength within one measure, as a hierarchy of nested beat subdivisions — NOT a
 * numerator-specific lookup table (CLAUDE.md §6c/§6b): purely a function of how many measure-slots
 * fall within one time-signature beat (`slotsPerBeat`), so it works for any numerator/smallestNoteDenom
 * combination, not just 4/4.
 *   slotsPerBeat <= 1 (smallestNoteDenom no finer than the beat, e.g. whole/half/quarter notes in 4/4)
 *     -> every slot 'on' (there is nothing finer to distinguish an off-beat from).
 *   slotsPerBeat === 2 (eighth notes in 4/4) -> classic on-beat / off-beat (the "&") split.
 *   slotsPerBeat === 4 (sixteenth notes in 4/4) -> on-beat / off-beat / off-off-beat (the "e"/"a").
 *   anything finer collapses into the 'off-off' tier rather than inventing a 4th no one asked for.
 */
function hhMetricLevel(slotIndexInMeasure, slotsPerBeat) {
    if (slotsPerBeat <= 1 || !Number.isInteger(slotsPerBeat)) return 'on';
    const withinBeat = slotIndexInMeasure % slotsPerBeat;
    if (withinBeat === 0) return 'on';
    if (slotsPerBeat === 2) return 'off';
    return withinBeat === slotsPerBeat / 2 ? 'off' : 'off-off';
}

// Han: on-beat stays velocity 100 (unchanged since round 1); off-beat 80 ("zet hh op tellen 2,4,6,8
// op velocity 80"); off-off-beat 60, new in round 2, "for 16: the off-off beats should have velocity
// 60". A substituted slot always plays at velocity 100 regardless of its metrical level (round 1:
// "als er een ho/hp/r/rb wordt getrokken, gebruik dan gewoon weer velocity 100") — applied separately
// below, after this base assignment.
const HH_VELOCITY_BY_LEVEL = { on: 100, off: 80, 'off-off': 60 };

/**
 * Generate a hi-hat-only percussion pattern (#1091, Han: "elke tel heeft een hh (net als backbeat,
 * maar dan zonder de kick en snare)"). Base layer: closed hi-hat on every slot, velocity per
 * `hhMetricLevel`. Then exactly `notesPerMeasure` DISTINCT, uniformly-random slots PER MEASURE
 * (independently per measure, not per whole block) are substituted with a uniformly-random pick from
 * `HH_SUBSTITUTION_POOL` — round 2 (Han): "randomize de 2 measures according to the same rules (hh +
 * uniform random cymbals). Set notes per measure to 1,1,2,3,4 respectively" — replacing round 1's
 * off-beat-only substitution PROBABILITY with an exact per-measure COUNT, drawn from any slot
 * (on-beat included) rather than off-beat slots only.
 *
 * `smallestNoteDenom` is used LITERALLY here (not floored against the time signature's own
 * denominator the way `generatePercussionFromDNA`'s slot math is) — round 2 needs genuinely
 * COARSER-than-the-beat resolutions (whole/half notes) to produce fewer, not equal, slots per measure.
 * Tick duration is therefore `TICKS_PER_WHOLE / smallestNoteDenom` directly rather than the shared
 * `slotTicks` helper (which assumes at-least-beat resolution, true for backbeat/swing but not here).
 *
 * No kick/snare, no DNA-driven placement (every slot is always active) — unlike `generatePercussionFromDNA`,
 * this pattern doesn't need `generateRankedRhythm`'s slot-priority ranking at all.
 */
export function generateHh(
    timeSignature, numMeasures,
    smallestNoteDenom = 8, notesPerMeasure = HH_NOTES_PER_MEASURE_BY_DENOM[8]
) {
    const [numerator, denominator] = timeSignature;
    const slotsPerMeasure = Math.max(1, Math.round((numerator * smallestNoteDenom) / denominator));
    const slotsPerBeat = slotsPerMeasure / numerator;
    const totalSlots = slotsPerMeasure * numMeasures;

    const rawNotes = new Array(totalSlots).fill('hh');
    const velocities = new Array(totalSlots);
    for (let s = 0; s < totalSlots; s++) {
        velocities[s] = HH_VELOCITY_BY_LEVEL[hhMetricLevel(s % slotsPerMeasure, slotsPerBeat)];
    }

    const substitutionsPerMeasure = Math.max(0, Math.min(notesPerMeasure, slotsPerMeasure));
    for (let m = 0; m < numMeasures; m++) {
        const measureStart = m * slotsPerMeasure;
        const candidates = Array.from({ length: slotsPerMeasure }, (_, i) => measureStart + i);
        for (let picked = 0; picked < substitutionsPerMeasure; picked++) {
            const [slot] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
            rawNotes[slot] = HH_SUBSTITUTION_POOL[Math.floor(Math.random() * HH_SUBSTITUTION_POOL.length)];
            velocities[slot] = 100;
        }
    }

    // Same collision-hierarchy cleanup every percussion generator applies (Han: "gebruik
    // substitutieregels: hh + ho -> ho", already `resolvePercussionChord`'s rule) — a no-op for these
    // single-value slots today, but keeps this generator consistent with backbeat/swing/backbeat_2
    // should a future change ever stack notes within one hh slot.
    const finalNotes = rawNotes.map(slot => resolvePercussionChord(slot));

    const tickDur = TICKS_PER_WHOLE / smallestNoteDenom;
    const durations = finalNotes.map(() => tickDur);
    const offsets = finalNotes.map((_, i) => i * tickDur);

    return new Melody(finalNotes, durations, offsets, finalNotes, undefined, velocities);
}

/**
 * Registry of all available deterministic pattern names.
 */
export const GROOVE_PATTERNS = ['backbeat', 'backbeat_2', 'swing', 'hh'];


