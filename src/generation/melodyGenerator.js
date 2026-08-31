import Melody from '../model/Melody.js';
import logger from '../utils/logger';
import convertRankedArrayToMelody from './convertRankedArrayToMelody.js';
import { generateRankedRhythm } from './generateRankedRhythm.js';
import { chooseGrouping, generateRhythmicDNA } from './rhythmicPriorities.js';
import { generateBackbeat, generateBackbeat2, generateSwing, generateHh, generateMetronome, filterPercussionByEnabledPads, HH_NOTES_PER_MEASURE_BY_DENOM } from './generateBackbeat.js';
import { getNoteIndex } from '../theory/musicUtils.js';
import { getNoteSemitone } from '../theory/noteUtils.js';
// #435: percussion overlap-hierarchy resolver (drumKits = percussion-pad SSOT, §8) —
// shared with generateBackbeat so multi-pad slots obey ONE set of rules (ho kills hh, …).
import { resolvePercussionChord } from '../audio/drumKits.js';
import { TICKS_PER_WHOLE } from '../constants/timing.js';
import { GLOBAL_RESOLUTION } from '../constants/generatorDefaults.js';

const isNoteInRange = (note, range) => {
    if (!range) return true;
    const idx = getNoteIndex(note);
    const minIdx = range.min ? getNoteIndex(range.min) : -Infinity;
    const maxIdx = range.max ? getNoteIndex(range.max) : Infinity;
    return idx !== -1 && idx >= minIdx && idx <= maxIdx;
};

// Hard rule for ALL melody generation (Han 2026-08-26, "de lengte van een noot mag geen twee
// groepsgrenzen passeren... nog een regel: en nooit 2 maatgrenzen (ongeacht de smallest note
// denum)"): without this, a run of consecutive null (inactive) slots after a note lets that note's
// duration extend indefinitely — `Melody.fromFlattenedNotes` just keeps incrementing the active
// note's duration for every following null. In call-response and high-variability random levels this
// produced notes that "never end". A note may extend AT MOST through the end of the immediately-next
// rhythmic group (never a second group boundary), and never past the end of the immediately-next
// MEASURE (never a second measure boundary) — whichever cap is stricter.
//
// "Groups" here are recomputed at the melody's own GENERATION SLOT resolution
// (`chooseGrouping(timeSignature[0] * slotsPerBeat)`), NOT the coarser beat-level `rhythmicGrouping`
// already computed for rhythmic-DNA ranking (generateBaseMelody's own `rhythmicGrouping`) — confirmed
// against Han's own worked example: 4/4 at smallestNoteDenom=8 groups the measure as eighth-note
// slots {3,3,2} (`chooseGrouping(8)`), NOT a proportional {4,4} split of the beat-level {2,2} grouping.
// Reuses `chooseGrouping`/`decomposeToGroupSizes` (already imported) — no new hardcoded table (§6c).
// Applies UNCONDITIONALLY to every instrument type, never gated behind `insertBeatRests` — this is a
// pipeline-wide invariant (§6b), not a per-instrument setting.
//
// Only REAL notes are capped (a token that is `null`, `'r'`, or already a rest is left alone) — once a
// note's extension is cut short by inserting an explicit rest here, that rest is free to keep
// extending via further nulls uncapped (a long REST isn't the reported problem; a long NOTE is).
export const capNoteLengthAtGroupBoundaries = (melodyArray, numMeasures, timeSignature, smallestNoteDenom) => {
    const numMeasureSlots = melodyArray.length / numMeasures;
    const slotsPerBeat = Math.max(smallestNoteDenom || timeSignature[1], timeSignature[1]) / timeSignature[1];
    const capGrouping = chooseGrouping(timeSignature[0] * slotsPerBeat);

    // Cumulative END-of-group slot offsets within one measure, e.g. [3,6,8] for groups [3,3,2].
    const groupEnds = [];
    let acc = 0;
    for (const size of capGrouping) { acc += size; groupEnds.push(acc); }

    const result = melodyArray.slice();
    let i = 0;
    while (i < result.length) {
        const note = result[i];
        if (note == null || note === 'r') { i++; continue; }

        const measureIndex = Math.floor(i / numMeasureSlots);
        const posInMeasure = i % numMeasureSlots;
        // Which group (within the measure) does this note START in?
        const groupIdx = groupEnds.findIndex((end) => posInMeasure < end);
        // End of the group immediately AFTER the starting group — wraps into the next measure's
        // first group when the note starts in the LAST group of its own measure (matches Han's own
        // [2,3] example, where the note starts in the 3-group of measure 1 and may extend through
        // the entirety of measure 2's first 2-group).
        const nextGroupEndInMeasure = groupEnds[groupIdx + 1] ?? (numMeasureSlots + groupEnds[0]);
        const groupCapAbsolute = measureIndex * numMeasureSlots + nextGroupEndInMeasure;
        const measureCapAbsolute = (measureIndex + 2) * numMeasureSlots; // never a 2nd measure boundary
        const maxEndSlot = Math.min(groupCapAbsolute, measureCapAbsolute);

        let j = i + 1;
        while (j < result.length && result[j] == null && j < maxEndSlot) j++;
        if (j < result.length && result[j] == null) {
            // The next null slot would cross the cap — terminate this note's extension here.
            result[j] = 'r';
        }
        i = j;
    }
    return result;
};

class MelodyGenerator {
    constructor(Scale, numMeasures, timeSignature, InstrumentSettings, chords = [], range = null, runId = null, globalRhythmArray = null, externalRhythmicGrouping = null) {

        // Guard against Scale.notes being undefined — root cause unclear but defensive
        // coding prevents the runtime crash. Log to aid future diagnosis.
        if (Scale && !Array.isArray(Scale.notes)) {
            logger.warn('MelodyGenerator', 'Scale.notes is not an array — falling back to empty scale.', {
                family: Scale.family, name: Scale.name, tonic: Scale.tonic, notes: Scale.notes
            });
        }
        this.scale = Array.isArray(Scale?.notes) ? Scale.notes : [];
        this.numAccidentals = Scale ? Scale.numAccidentals : 0;
        this.tonic = Scale ? Scale.tonic : null;
        // #435: keep the raw Scale object so the voices post-step can spawn auxiliary
        // generators (the 'var' mode) through the exact same public constructor.
        this.sourceScale = Scale;
        this.numMeasures = numMeasures;
        this.timeSignature = timeSignature;
        this.InstrumentSettings = InstrumentSettings;
        this.chords = chords;
        this.range = range; // { min: 'C4', max: 'C5' }
        this.runId = runId;
        this.globalRhythmArray = globalRhythmArray;
        // When provided by the caller (e.g. useMelodyState shared grouping), skip the
        // internal chooseGrouping() call so all generators in one block share the same grouping.
        this.externalRhythmicGrouping = externalRhythmicGrouping;
    }

    // #435 (Han 2026-07-17): generateMelody is now a thin wrapper — build the base melody
    // through the unchanged pipeline, then apply the shared VOICES post-step (§6b: driven
    // purely by the InstrumentSettings.voices field, identical for every instrument type;
    // it also runs after the percussion early-exit patterns, which the old fullchord/
    // pairedchord type-hijack never could).
    generateMelody() {
        const base = this.generateBaseMelody();
        const voices = this.InstrumentSettings.voices ?? 1;
        if (voices === 1 || voices == null || !base) return base;
        return this.applyVoicing(base, voices);
    }

    generateBaseMelody() {
        let tonic = this.tonic;
        let notesPerMeasure = this.InstrumentSettings.notesPerMeasure;
        let numMeasures = this.numMeasures;
        let timeSignature = this.timeSignature;
        let smallestNoteDenom = this.InstrumentSettings.smallestNoteDenom;
        let rhythmVariability = this.InstrumentSettings.rhythmVariability;
        let randomizationNotes = this.InstrumentSettings.notePool;
        let instrumentType = this.InstrumentSettings.type;
        let randomizationRule = this.InstrumentSettings.randomizationRule;
        // Whether to fill empty on-beat slots with explicit rests (step 4f). Previously
        // keyed off instrumentType === 'percussion'; now a settings field so the pipeline
        // is identical for all instrument types (CLAUDE.md §6b).
        let insertBeatRests = this.InstrumentSettings.insertBeatRests;

        logger.debug('MelodyGen', 'start', {
            instrumentType, tonic, numMeasures, timeSignature,
            notesPerMeasure, smallestNoteDenom, rhythmVariability,
            polyMultiplier: this.InstrumentSettings.polyMultiplier,
            rule: randomizationRule, pool: randomizationNotes,
        });

        if (randomizationRule === 'backbeat') {
            return generateBackbeat(
                timeSignature, numMeasures,
                smallestNoteDenom || 4,
                rhythmVariability || 0,
                notesPerMeasure,
                randomizationNotes
            );
        }
        if (randomizationRule === 'backbeat_2') {
            return generateBackbeat2(
                timeSignature, numMeasures,
                smallestNoteDenom || 4,
                rhythmVariability || 0,
                notesPerMeasure,
                randomizationNotes
            );
        }
        if (randomizationRule === 'swing') {
            return generateSwing(
                timeSignature, numMeasures,
                smallestNoteDenom || 8,
                rhythmVariability || 0,
                notesPerMeasure,
                randomizationNotes
            );
        }
        if (randomizationRule === 'hh') {
            // #1091 (Han 2026-08-19, round 2): every slot is always active (hi-hat base layer), so
            // unlike the other percussion patterns `notesPerMeasure` here means an exact per-measure
            // SUBSTITUTION COUNT, not a note-onset budget — see generateHh's own doc comment.
            return generateHh(
                timeSignature, numMeasures,
                smallestNoteDenom || 8,
                notesPerMeasure || HH_NOTES_PER_MEASURE_BY_DENOM[smallestNoteDenom || 8]
            );
        }
        if (randomizationRule === 'metronome') {
            // wh/wm/wl woodblock clicks driven by the shared grouping; no randomisation.
            const grouping = this.externalRhythmicGrouping ?? chooseGrouping(timeSignature[0]);
            return generateMetronome(timeSignature, numMeasures, grouping);
        }

        // Use the externally supplied grouping when all generators in one block should share the
        // same beat hierarchy. Falls back to a fresh random choice when none is provided.
        const rhythmicGrouping = this.externalRhythmicGrouping ?? chooseGrouping(timeSignature[0]);

        let deterministicTemplate = null;

        if (this.globalRhythmArray) {
            // Global resolution is 16th notes (GLOBAL_RESOLUTION = 16).
            // Use effectiveDenom = max(smallestNoteDenom, timeSignature[1]) so that bass
            // (smallestNoteDenom=2 in 4/4 or 5/4) samples at the beat grid, not the half-note
            // grid. Without this guard, step = 16/2 = 8 produces only 3 slots in 5/4 instead of 5.
            const localDenom = Math.max(smallestNoteDenom, timeSignature[1]);

            if (localDenom <= GLOBAL_RESOLUTION && GLOBAL_RESOLUTION % localDenom === 0) {
                const step = GLOBAL_RESOLUTION / localDenom; // e.g. 16/4 = 4. Sample every 4th.

                // globalRhythmArray is Array<Array<number|null>> (measures of slots)
                // We need to map this to the local resolution.

                // Downsample the single global measure
                const sourceMeasure = this.globalRhythmArray[0];
                const localMeasureSlots = [];
                for (let i = 0; i < sourceMeasure.length; i += step) {
                    localMeasureSlots.push(sourceMeasure[i]);
                }

                // Replicate for all measures
                deterministicTemplate = new Array(numMeasures).fill(null).map(() => [...localMeasureSlots]);



            } else {
                logger.warn('melodyGenerator', `Incompatible resolutions: Global ${GLOBAL_RESOLUTION}, Local ${localDenom}. Fallback to local.`);
            }
        }

        // Build the DNA template from the chosen grouping when no external template overrides it.
        // generateRhythmicDNA guards slotsPerBeat >= 1 internally via Math.max(smallestNoteDenom, denominator),
        // so callers can pass the raw instrument smallestNoteDenom without workarounds.
        // dnaMeasureForDebug is attached to the melody so SheetMusic can display it in debug mode.
        let dnaMeasureForDebug = null;
        if (!deterministicTemplate) {
            dnaMeasureForDebug = generateRhythmicDNA(rhythmicGrouping, timeSignature, smallestNoteDenom);
            deterministicTemplate = new Array(numMeasures).fill(null).map(() => [...dnaMeasureForDebug]);
        }

        logger.debug('MelodyGen', 'DNA+rhythm done', {
            grouping: rhythmicGrouping, dnaSample: dnaMeasureForDebug?.slice(0, 8),
        });

        const { rankedArray, tupletGroups } = generateRankedRhythm(
            numMeasures,
            timeSignature,
            notesPerMeasure,
            smallestNoteDenom,
            rhythmVariability,
            randomizationNotes,
            deterministicTemplate,
            this.InstrumentSettings.polyMultiplier || 1,
            rhythmicGrouping,
        );


        logger.debug('MelodyGen', 'rankedArray ready', {
            totalSlots: rankedArray.length,
            activeSlots: rankedArray.filter(v => v !== null).length,
            tupletGroupsCount: tupletGroups.length,
        });

        // Pre-calculate allowed notes based on Range (shared with the voices post-step, #435).
        const effectiveScale = this.computeEffectiveScale();

        // randomizationRule must be a string. Log the unexpected type to aid root-cause
        // diagnosis; then default to 'uniform' so generation can continue.
        if (typeof randomizationRule !== 'string') {
            logger.warn('MelodyGenerator', 'randomizationRule is not a string — defaulting to uniform', {
                type: typeof randomizationRule, value: randomizationRule, instrumentType,
            });
            randomizationRule = 'uniform';
        }

        const maxLeap = this.InstrumentSettings.maxLeap ?? null;

        const rawResult = convertRankedArrayToMelody(
            rankedArray,
            tonic,
            effectiveScale,
            notesPerMeasure,
            numMeasures,
            randomizationNotes, // = notePool
            this.chords,
            this.range,
            randomizationRule,
            timeSignature,     // needed for offset-based chord lookup (passing chords)
            rhythmicGrouping,  // needed by arp_group for beat-group line boundaries
            maxLeap            // doubles as arp span for arp_var / arp_group
        );

        let generatedMelody = rawResult.melody;
        let generatedVolumes = rawResult.volumes;

        // Backward compatibility if convertRankedArrayToMelody returns array (in case of partial hot reload or mixed versions)
        if (Array.isArray(rawResult)) {
            generatedMelody = rawResult;
            generatedVolumes = new Array(generatedMelody.length).fill(null);
        }

        // Melodic leap constraint: replace any note that jumps more than maxLeap semitones from
        // all notes placed within the previous quarter-note window. Uses intersection approach
        // (O(pool × window) linear scan) instead of retries — always terminates.
        // Not applied to chord sequences (progression mode).
        if (maxLeap !== null) {
            // Quarter-note window in slots: smallestNoteDenom=8 → 2 slots, =16 → 4 slots, =4 → 1 slot.
            const slotsPerQuarter = Math.max(1, Math.round(smallestNoteDenom / 4));
            const placed = []; // { slotIndex, noteIdx }

            for (let i = 0; i < generatedMelody.length; i++) {
                const note = generatedMelody[i];
                if (note === null || note === 'r' || typeof note !== 'string') continue;
                const noteIdx = getNoteIndex(note);
                if (noteIdx === -1) continue; // percussion IDs and unrecognised notes

                const refNotes = placed
                    .filter(p => p.slotIndex >= i - slotsPerQuarter)
                    .map(p => p.noteIdx);

                if (refNotes.length === 0) {
                    placed.push({ slotIndex: i, noteIdx });
                    continue;
                }

                if (refNotes.every(r => Math.abs(noteIdx - r) <= maxLeap)) {
                    placed.push({ slotIndex: i, noteIdx });
                    continue;
                }

                // Intersection: scale notes reachable from ALL reference notes within maxLeap
                const allowed = effectiveScale.filter(c => {
                    const cIdx = getNoteIndex(c);
                    return cIdx !== -1 && refNotes.every(r => Math.abs(cIdx - r) <= maxLeap);
                });

                let replacement;
                if (allowed.length > 0) {
                    replacement = allowed[Math.floor(Math.random() * allowed.length)];
                } else {
                    // Fallback: nearest note in effectiveScale (min distance to any ref)
                    let minDist = Infinity;
                    replacement = effectiveScale[0] || note;
                    for (const c of effectiveScale) {
                        const cIdx = getNoteIndex(c);
                        if (cIdx === -1) continue;
                        const d = Math.min(...refNotes.map(r => Math.abs(cIdx - r)));
                        if (d < minDist) { minDist = d; replacement = c; }
                    }
                }

                generatedMelody[i] = replacement;
                placed.push({ slotIndex: i, noteIdx: getNoteIndex(replacement) });
            }
        }

        // #435: the fullchord/pairedchord early-exit blocks (reached by hijacking the settings
        // `type`) were REPLACED by the shared voices post-step (applyVoicing below) — their
        // chord-event lookup lives on as this.buildChordLookup(), the §6c shared helper.

        let generatedMelodyWithRests;
        let displayMelody;

        // Detect if we generated Chords (Objects) or Notes (Strings)
        const isChordSequence = generatedMelody.some(item => item && typeof item === 'object' && item.notes);

        if (isChordSequence) {
            // Processing for Chord Progression
            // generatedMelody contains Chord objects (or nulls).
            // .notes  = string[][] for polyphonic audio playback   e.g. [['C4','E4','G4'], null, ...]
            // .displayNotes = Chord[] for SheetMusic label rendering
            generatedMelodyWithRests = generatedMelody.map(chord =>
                chord ? chord.notes : null  // flatten Chord → string[] e.g. ['C4','E4','G4']
            );
            displayMelody = generatedMelody; // full Chord objects → goes into Melody.displayNotes
        } else {
            // Standard Note Processing
            const insertRestsAtBeats = (melodyArray, numMeasures, timeSignature) => {
                const numMeasureSlots = melodyArray.length / numMeasures;
                const numBeatSlots = (numMeasureSlots / timeSignature[0]) * (timeSignature[1] / 4);

                return melodyArray.map((note, index) => {
                    const isBeat = (index % numMeasureSlots) % numBeatSlots === 0;
                    if (isBeat && note === null && insertBeatRests) return 'r';
                    return note;
                });
            };

            if (insertBeatRests) {
                generatedMelodyWithRests = insertRestsAtBeats(generatedMelody, numMeasures, timeSignature);
            } else {
                generatedMelodyWithRests = generatedMelody;
            }

            // Hard rule for ALL melody generation (Han 2026-08-26) — see capNoteLengthAtGroupBoundaries's
            // own comment. Runs unconditionally, after insertBeatRests, so it only needs to catch
            // extensions that survive past whatever beat-level rests were already inserted above.
            generatedMelodyWithRests = capNoteLengthAtGroupBoundaries(
                generatedMelodyWithRests, numMeasures, timeSignature, smallestNoteDenom,
            );
        }

        const finalMelody = Melody.fromFlattenedNotes(
            generatedMelodyWithRests,
            timeSignature,
            numMeasures,
            isChordSequence ? displayMelody : null,
            generatedVolumes, // Pass volumes to Melody constructor
            {
                notes: this.scale,
                displayNotes: this.displayNotes,
                tonic: this.tonic
            }
        );

        // melody.triplets[i] = null | { id, noteCount, denominator, groupTicks, visualDuration }
        logger.debug('MelodyGen', 'notes assigned', {
            notes: generatedMelody.filter(n => n !== null && n !== 'r').length,
            totalSlots: generatedMelody.length,
            sample: generatedMelody.slice(0, 8).map(n => n ?? '·'),
        });

        if (tupletGroups.length > 0 && !isChordSequence) {
            // timeScale: ticks per slot — same formula used by Melody.fromFlattenedNotes.
            const timeScale = (TICKS_PER_WHOLE * numMeasures / finalMelody.notes.length)
                * (timeSignature[0] / timeSignature[1]);

            // Build winner list from pre-determined tupletGroups (right-to-left order
            // keeps earlier indices stable during array splicing).
            const sortedGroups = [...tupletGroups].sort((a, b) => b.slotStart - a.slotStart);
            const activeWinners = sortedGroups.filter(tg => {
                const note = finalMelody.notes[tg.slotStart];
                return note !== null && note !== 'r';
            });

            logger.debug('MelodyGen', 'tuplet expansion', {
                total: tupletGroups.length, active: activeWinners.length,
                winners: activeWinners.map(g => `s${g.slotStart} ${g.n}:${g.slotCount}`),
            });

            if (activeWinners.length > 0) {
                let notes        = [...finalMelody.notes];
                let durations    = [...finalMelody.durations];
                let offsets      = [...finalMelody.offsets];
                let displayNotes = [...(finalMelody.displayNotes ?? finalMelody.notes)];
                let volumes      = [...finalMelody.volumes];
                let triplets     = finalMelody.notes.map(() => null);
                let groupIdCounter = 0;

                const pick = (fallback) => effectiveScale.length > 0
                    ? effectiveScale[Math.floor(Math.random() * effectiveScale.length)]
                    : fallback;

                for (const tg of activeWinners) {
                    const idx        = tg.slotStart;
                    const noteCount  = tg.n;
                    const slotCount  = tg.slotCount;   // number of replaced slots
                    const groupTicks = slotCount * timeScale;
                    // Use floor so last note absorbs rounding remainder, keeping total exact.
                    const noteTicks     = Math.floor(groupTicks / noteCount);
                    const lastNoteTicks = groupTicks - (noteCount - 1) * noteTicks;
                    // visualDuration = duration of one undivided note in the n:d ratio.
                    // tg.d is the denominator from TUPLET_DEFS (e.g. 2 for 3:2 triplet).
                    // (slotCount / tg.d) gives how many slots that reference note spans.
                    const visualDuration = Math.round((slotCount / tg.d) * timeScale);
                    groupIdCounter++;
                    const id = groupIdCounter;

                    const firstNote = notes[idx];
                    const baseOff   = offsets[idx];

                    // Generate n-1 extra notes with the same maxLeap constraint as the main pass.
                    const extra = [];
                    for (let j = 0; j < noteCount - 1; j++) {
                        const curOff = baseOff + (j + 1) * noteTicks;
                        if (maxLeap === null) {
                            extra.push(pick(firstNote));
                            continue;
                        }
                        const refIdxs = [];
                        if (curOff - baseOff <= 24) {
                            const fi = getNoteIndex(firstNote);
                            if (fi !== -1) refIdxs.push(fi);
                        }
                        for (let ej = 0; ej < j; ej++) {
                            const eOff = baseOff + (ej + 1) * noteTicks;
                            if (curOff - eOff <= 24) {
                                const ei = getNoteIndex(extra[ej]);
                                if (ei !== -1) refIdxs.push(ei);
                            }
                        }
                        if (refIdxs.length === 0) {
                            extra.push(pick(firstNote));
                            continue;
                        }
                        const allowed = effectiveScale.filter(c => {
                            const ci = getNoteIndex(c);
                            return ci !== -1 && refIdxs.every(r => Math.abs(ci - r) <= maxLeap);
                        });
                        if (allowed.length > 0) {
                            extra.push(allowed[Math.floor(Math.random() * allowed.length)]);
                        } else {
                            const prevIdx = getNoteIndex(j === 0 ? firstNote : extra[j - 1]);
                            let minDist = Infinity;
                            let nearest = pick(firstNote);
                            for (const c of effectiveScale) {
                                const ci = getNoteIndex(c);
                                if (ci === -1) continue;
                                const d = Math.abs(ci - prevIdx);
                                if (d < minDist) { minDist = d; nearest = c; }
                            }
                            extra.push(nearest);
                        }
                    }
                    const allNotes = [firstNote, ...extra];
                    const vol      = volumes[idx] ?? 0.9;
                    // denominator = tg.d (the ratio denominator from TUPLET_DEFS, e.g. 2 for 3:2).
                    // Using slotCount here was wrong when k>1 (e.g. 3:2 on 4 eighth slots
                    // produced label "3 : 4" instead of "3 : 2").
                    const entry    = { id, noteCount, denominator: tg.d, groupTicks, visualDuration };

                    // Replace the start note AND its slotCount-1 continuation nulls with n sub-notes.
                    notes        = [...notes.slice(0, idx),        ...allNotes,                                                                 ...notes.slice(idx + slotCount)];
                    durations    = [...durations.slice(0, idx),    ...allNotes.map((_, j) => j === noteCount - 1 ? lastNoteTicks : noteTicks),   ...durations.slice(idx + slotCount)];
                    offsets      = [...offsets.slice(0, idx),      ...allNotes.map((_, j) => baseOff + j * noteTicks),                           ...offsets.slice(idx + slotCount)];
                    displayNotes = [...displayNotes.slice(0, idx), ...allNotes,                                                                 ...displayNotes.slice(idx + slotCount)];
                    volumes      = [...volumes.slice(0, idx),      ...allNotes.map(() => vol),                                                   ...volumes.slice(idx + slotCount)];
                    triplets     = [...triplets.slice(0, idx),     ...allNotes.map(() => entry),                                                 ...triplets.slice(idx + slotCount)];
                }

                const tupletMelody = new Melody(notes, durations, offsets, displayNotes, volumes);
                tupletMelody.smallestNoteDenom = smallestNoteDenom;
                tupletMelody.triplets          = triplets;
                tupletMelody.rhythmicGrouping  = rhythmicGrouping;
                tupletMelody.rhythmicDNA       = dnaMeasureForDebug;

                logger.debug('MelodyGen', 'done (with tuplets)', {
                    finalNotes: notes.length, tupletsExpanded: activeWinners.length,
                });
                return tupletMelody;
            }
        }

        finalMelody.rhythmicGrouping = rhythmicGrouping;
        finalMelody.rhythmicDNA = dnaMeasureForDebug;

        logger.debug('MelodyGen', 'done (no tuplets)', {
            finalNotes: finalMelody.notes.length,
        });
        return finalMelody;
    }

    // ── #435: shared helpers for the VOICES post-step ────────────────────────────────────────────

    /**
     * The scale filtered to the instrument's configured range (step 4d). Extracted from
     * generateBaseMelody so applyVoicing draws its extra simultaneous notes from the SAME
     * candidate pool the base melody used (§6c — one pool computation, not two).
     */
    computeEffectiveScale() {
        let effectiveScale = this.scale;

        if (this.range) {
            // Map each scale pitch-class (0-11, chromatic C=0) to its spelling, via the
            // canonical getNoteSemitone (§6 invariant) — replaces a local ASCII pitch-class
            // table + .replace() enharmonic chain that only handled single accidentals.
            // First spelling wins (matches the old indexOf semantics); scales don't repeat PCs.
            const scalePCSpelling = new Map();
            for (const n of this.scale) {
                const pc = getNoteSemitone(n);
                if (!scalePCSpelling.has(pc)) scalePCSpelling.set(pc, n.replace(/\d+$/, ''));
            }

            // getNoteIndex returns position in allNotes where A0=0 (9 semitones above C0=0).
            // noteVal = oct*12+i uses chromatic MIDI convention (C0=0). Add 9 to align origins.
            const rawMin = getNoteIndex(this.range.min);
            const rawMax = getNoteIndex(this.range.max);
            const minVal = rawMin >= 0 ? rawMin + 9 : 0;
            const maxVal = rawMax >= 0 ? rawMax + 9 : 108; // 108 = C8 (safe upper bound)

            const expanded = [];

            for (let oct = 0; oct <= 8; oct++) {
                for (let i = 0; i < 12; i++) {
                    const noteVal = oct * 12 + i; // i is the chromatic pitch-class
                    if (noteVal >= minVal && noteVal <= maxVal && scalePCSpelling.has(i)) {
                        expanded.push(`${scalePCSpelling.get(i)}${oct}`);
                    }
                }
            }

            if (expanded.length > 0) {
                effectiveScale = expanded;
            }
        }
        return effectiveScale;
    }

    /**
     * Offset-based chord lookup for the voices step. Mirrors the event-list building the old
     * fullchord/pairedchord blocks each duplicated inline: this.chords can be a Melody object
     * (offsets + string[] notes), a ChordProgression, or a raw Chord[] (one chord per measure).
     * Returns (offsetTicks) => string[] | null, or null when no chord data is available.
     */
    buildChordLookup() {
        if (!this.chords) return null;
        const chordEvents = [];
        const measureLength = TICKS_PER_WHOLE * (this.timeSignature[0] / this.timeSignature[1]);
        if (this.chords.offsets && Array.isArray(this.chords.offsets)) {
            for (let i = 0; i < this.chords.offsets.length; i++) {
                const evOffset = this.chords.offsets[i];
                const evNotes = this.chords.notes[i];
                if (evOffset !== null && Array.isArray(evNotes)) {
                    chordEvents.push({ offset: evOffset, notes: evNotes });
                }
            }
        } else {
            const chordsArray = this.chords.chords || (Array.isArray(this.chords) ? this.chords : []);
            chordsArray.forEach((chord, idx) => {
                if (chord && Array.isArray(chord.notes) && chord.notes.length > 0) {
                    chordEvents.push({ offset: idx * measureLength, notes: chord.notes });
                }
            });
        }
        if (chordEvents.length === 0) return null;
        chordEvents.sort((a, b) => a.offset - b.offset);
        return (targetOffset) => {
            let result = null;
            for (const ev of chordEvents) {
                if (ev.offset <= targetOffset) result = ev.notes;
                else break;
            }
            return result;
        };
    }

    /**
     * #435 VOICES post-step (Han 2026-07-17) — one shared implementation for every instrument
     * type; all variation flows from InstrumentSettings fields (voices, notePool, maxLeap,
     * enabledPads, percussionChordRules — §6b).
     *
     *  voices 2|3 — every active slot becomes a chord of that many DISTINCT notes. Extras come
     *    from the SAME pool as the base melody (notePool 'chord' → chord tones at that offset,
     *    else the range-filtered scale; unpitched pads → enabledPads), each within maxLeap of the
     *    slot's base note. Candidate FILTERING replaces retry loops (always terminates); when the
     *    pool runs dry the slot simply keeps fewer notes (AC fallback).
     *
     *  voices 'var' — merge three melodies: the base (100%) plus two auxiliaries at 60% / 40%
     *    notesPerMeasure (round, min 1 — Han). Coinciding onsets become chords (exact duplicates
     *    removed); non-coinciding aux notes are KEPT as loose notes (Han interview Q3), splitting
     *    the base note/rest they land inside.
     *
     *  When percussionChordRules is set, every multi-pad slot is cleaned through
     *  resolvePercussionChord (dedup + pad hierarchy: ho kills hh, cc kills cr, …).
     */
    applyVoicing(baseMelody, voices) {
        const settings = this.InstrumentSettings;
        const maxLeap = settings.maxLeap ?? null;
        const effectiveScale = this.computeEffectiveScale();
        const getChordAt = this.buildChordLookup();
        const usePercRules = !!settings.percussionChordRules;

        // Candidate pool for EXTRA simultaneous notes next to `baseNote` at `offsetTicks`.
        const poolFor = (baseNote, offsetTicks) => {
            const baseIdx = getNoteIndex(baseNote);
            if (baseIdx === -1) {
                // Unpitched pad: candidates = the user's enabled pads (no span concept).
                return (settings.enabledPads ?? []).filter(p => p !== baseNote);
            }
            let pool;
            if (settings.notePool === 'chord' && getChordAt) {
                const chordNotes = getChordAt(offsetTicks);
                pool = chordNotes
                    ? chordNotes.filter(n => isNoteInRange(n, this.range))
                    : effectiveScale;
            } else {
                pool = effectiveScale;
            }
            return pool.filter(n => {
                if (n === baseNote) return false;
                const ni = getNoteIndex(n);
                if (ni === -1) return false;
                return maxLeap === null || Math.abs(ni - baseIdx) <= maxLeap;
            });
        };

        // Fisher-Yates pick of `count` distinct candidates.
        const pickDistinct = (pool, count) => {
            const shuffled = [...pool];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, count);
        };

        const copyMeta = (target, source, tripletsOverride) => {
            target.rhythmicGrouping = source.rhythmicGrouping;
            target.rhythmicDNA = source.rhythmicDNA;
            target.smallestNoteDenom = source.smallestNoteDenom;
            const trip = tripletsOverride !== undefined ? tripletsOverride : source.triplets;
            if (trip) target.triplets = trip;
            return target;
        };

        if (voices === 2 || voices === 3) {
            const notes = baseMelody.notes.map((entry, i) => {
                if (entry == null || entry === 'r') return entry;
                // Percussion patterns can already emit arrays (e.g. ['hh','sg']) — extend those too.
                const have = Array.isArray(entry) ? [...new Set(entry)] : [entry];
                const need = voices - have.length;
                if (need <= 0) return entry;
                const baseNote = have[0];
                const candidates = poolFor(baseNote, baseMelody.offsets[i]).filter(n => !have.includes(n));
                const merged = [...have, ...pickDistinct(candidates, need)];
                const resolved = usePercRules ? resolvePercussionChord(merged) : merged;
                return Array.isArray(resolved) && resolved.length === 1 ? resolved[0] : resolved;
            });
            const voiced = new Melody(notes, [...baseMelody.durations], [...baseMelody.offsets], notes,
                [...(baseMelody.volumes ?? [])]);
            logger.debug('MelodyGen', 'voices fixed applied', { voices, slots: notes.length });
            return copyMeta(voiced, baseMelody);
        }

        // voices === 'var' — three-melody merge at 100% / 60% / 40% density (round, min 1: Han).
        const npm = settings.notesPerMeasure || 1;
        const grouping = baseMelody.rhythmicGrouping ?? this.externalRhythmicGrouping ?? null;
        let merged = baseMelody;
        for (const fraction of [0.6, 0.4]) {
            const aux = this.generateAuxMelody(Math.max(1, Math.round(npm * fraction)), grouping);
            if (aux) merged = this.mergeVoice(merged, aux, { maxLeap, effectiveScale, copyMeta });
        }
        if (usePercRules) {
            const resolved = merged.notes.map(n => resolvePercussionChord(n));
            const cleaned = new Melody(resolved, merged.durations, merged.offsets, resolved, merged.volumes);
            merged = copyMeta(cleaned, merged);
        }
        logger.debug('MelodyGen', 'voices var applied', { finalNotes: merged.notes.length });
        return merged;
    }

    /**
     * A reduced-density auxiliary melody for the 'var' mode, produced through the SAME public
     * pipeline (new MelodyGenerator + generateMelody with voices=1 — no recursion). The shared
     * `grouping` keeps all three voices on one beat hierarchy.
     */
    generateAuxMelody(reducedNotesPerMeasure, grouping) {
        const s = this.InstrumentSettings;
        // Prototype-preserving clone so class getters/methods survive; only the density and the
        // voicing-related fields are overridden.
        const auxSettings = Object.assign(Object.create(Object.getPrototypeOf(s)), s);
        auxSettings.notesPerMeasure = reducedNotesPerMeasure;
        auxSettings.voices = 1;             // aux voices are single-note — prevents recursion
        // Suppress tuplets: aux tuplet groups would put notes on off-grid offsets with no
        // triplets metadata after the merge. NB generateRankedRhythm coerces `0 || 1` → 1,
        // so a literal 0 would NOT disable tuplets — use an epsilon instead.
        auxSettings.polyMultiplier = 1e-9;
        auxSettings.insertBeatRests = false; // aux rests would only be skipped by the merge anyway
        const gen = new MelodyGenerator(
            this.sourceScale, this.numMeasures, this.timeSignature, auxSettings,
            this.chords, this.range, this.runId, null, grouping,
        );
        return gen.generateMelody();
    }

    /**
     * Merge one auxiliary voice into the base melody at the Melody level. Both melodies span the
     * same total ticks with CONTIGUOUS entries (offset[i+1] = offset[i] + duration[i] — the
     * fromFlattenedNotes invariant), so every aux onset lands exactly on or inside one base entry:
     *   - same onset, base is a note  → chord (union, exact duplicates removed)
     *   - same onset, base is a rest  → aux note replaces the rest (loose note)
     *   - inside a base entry         → SPLIT: base keeps [start, o), aux note takes [o, end)
     *     (musically: the base note is cut short when the loose note enters — inherent to the
     *     one-track model Han chose with "meenemen als losse noot")
     *   - inside a tuplet group       → skipped (never corrupt the triplets parallel array)
     * Aux notes are span-corrected against the nearest preceding pitched base note (maxLeap):
     * out-of-window notes are substituted from the pool inside the window (nearest as fallback).
     */
    mergeVoice(base, aux, { maxLeap, effectiveScale, copyMeta }) {
        const notes = [...base.notes];
        const durations = [...base.durations];
        const offsets = [...base.offsets];
        const volumes = [...(base.volumes ?? base.notes.map(() => 1))];
        const triplets = base.triplets ? [...base.triplets] : null;

        const firstPitched = (entry) => {
            const arr = Array.isArray(entry) ? entry : [entry];
            for (const n of arr) {
                if (typeof n === 'string' && getNoteIndex(n) !== -1) return n;
            }
            return null;
        };

        // Span-correct `note` against the last sounding pitched base note at/before entry `idx`.
        const correctSpan = (note, idx) => {
            if (typeof note !== 'string' || getNoteIndex(note) === -1) return note; // pads: as-is
            if (maxLeap === null) return note;
            let ref = null;
            for (let i = idx; i >= 0 && ref === null; i--) {
                if (notes[i] != null && notes[i] !== 'r') ref = firstPitched(notes[i]);
            }
            if (ref === null) return note;
            const refIdx = getNoteIndex(ref);
            if (Math.abs(getNoteIndex(note) - refIdx) <= maxLeap) return note;
            const allowed = effectiveScale.filter(c => {
                const ci = getNoteIndex(c);
                return ci !== -1 && Math.abs(ci - refIdx) <= maxLeap;
            });
            if (allowed.length > 0) return allowed[Math.floor(Math.random() * allowed.length)];
            // Fallback: nearest pool note to the reference.
            let best = null, bestDist = Infinity;
            for (const c of effectiveScale) {
                const ci = getNoteIndex(c);
                if (ci === -1) continue;
                const d = Math.abs(ci - refIdx);
                if (d < bestDist) { bestDist = d; best = c; }
            }
            return best; // null when the pool is empty → caller skips the note
        };

        for (let a = 0; a < aux.notes.length; a++) {
            const auxNote = aux.notes[a];
            if (auxNote == null || auxNote === 'r') continue;
            const o = aux.offsets[a];

            // Locate the base entry whose span covers this onset. Null CONTINUATION entries
            // (the flat-slot Melody shape) never match: their offset is null → end computes 0.
            let idx = -1;
            let firstIdx = -1; // first non-null entry — leading nulls before it are a silent GAP
            for (let i = 0; i < offsets.length; i++) {
                if (notes[i] == null && offsets[i] == null) continue;
                if (firstIdx === -1) firstIdx = i;
                const end = offsets[i] + (durations[i] ?? 0);
                if (o >= offsets[i] && o < end) { idx = i; break; }
            }
            if (idx === -1) {
                // A loose note in the LEADING silent gap (before the base's first onset) — kept
                // per Han's "meenemen als losse noot": insert it as a standalone entry running
                // up to the first base onset. Onsets beyond the melody end stay skipped.
                if (firstIdx !== -1 && o < offsets[firstIdx]) {
                    const corrected = correctSpan(firstPitched(auxNote) ?? auxNote, firstIdx);
                    if (corrected != null) {
                        notes.splice(firstIdx, 0, corrected);
                        durations.splice(firstIdx, 0, offsets[firstIdx] - o);
                        offsets.splice(firstIdx, 0, o);
                        volumes.splice(firstIdx, 0, aux.volumes?.[a] ?? 1);
                        if (triplets) triplets.splice(firstIdx, 0, null);
                    }
                }
                continue;
            }
            if (triplets && triplets[idx]) continue;  // never split a tuplet group

            const corrected = correctSpan(firstPitched(auxNote) ?? auxNote, idx);
            if (corrected == null) continue;

            if (offsets[idx] === o) {
                const cur = notes[idx];
                if (cur == null || cur === 'r') {
                    notes[idx] = corrected;   // the loose note fills a rest slot
                } else {
                    // Union with exact-duplicate removal (Han: "exacte dubbele verwijderen").
                    const set = new Set([
                        ...(Array.isArray(cur) ? cur : [cur]),
                        ...(Array.isArray(corrected) ? corrected : [corrected]),
                    ]);
                    const arr = [...set];
                    notes[idx] = arr.length === 1 ? arr[0] : arr;
                }
            } else {
                // Split the covering entry at the aux onset.
                const start = offsets[idx];
                const end = start + durations[idx];
                durations[idx] = o - start;
                notes.splice(idx + 1, 0, corrected);
                durations.splice(idx + 1, 0, end - o);
                offsets.splice(idx + 1, 0, o);
                volumes.splice(idx + 1, 0, aux.volumes?.[a] ?? volumes[idx] ?? 1);
                if (triplets) triplets.splice(idx + 1, 0, null);
            }
        }

        const mergedMelody = new Melody(notes, durations, offsets, notes, volumes);
        return copyMeta(mergedMelody, base, triplets ?? undefined);
    }
}

export default MelodyGenerator;
