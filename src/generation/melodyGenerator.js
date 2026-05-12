import Melody from '../model/Melody.js';
import logger from '../utils/logger';
import convertRankedArrayToMelody from './convertRankedArrayToMelody.js';
import { generateRankedRhythm } from './generateRankedRhythm.js';
import { generateBackbeat, generateSwing } from './generateBackbeat.js';
import { getNoteIndex } from '../theory/musicUtils.js';
import { TICKS_PER_WHOLE } from '../constants/timing.js';
import { GLOBAL_RESOLUTION } from '../constants/generatorDefaults.js';

const isNoteInRange = (note, range) => {
    if (!range) return true;
    const idx = getNoteIndex(note);
    const minIdx = range.min ? getNoteIndex(range.min) : -Infinity;
    const maxIdx = range.max ? getNoteIndex(range.max) : Infinity;
    return idx !== -1 && idx >= minIdx && idx <= maxIdx;
};

class MelodyGenerator {
    constructor(Scale, numMeasures, timeSignature, InstrumentSettings, chords = [], range = null, runId = null, globalRhythmArray = null) {

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
        this.numMeasures = numMeasures;
        this.timeSignature = timeSignature;
        this.InstrumentSettings = InstrumentSettings;
        this.chords = chords;
        this.range = range; // { min: 'C4', max: 'C5' }
        this.runId = runId;
        this.globalRhythmArray = globalRhythmArray;
    }

    generateMelody() {
        let tonic = this.tonic;
        let notesPerMeasure = this.InstrumentSettings.notesPerMeasure;
        let numMeasures = this.numMeasures;
        let timeSignature = this.timeSignature;
        let smallestNoteDenom = this.InstrumentSettings.smallestNoteDenom;
        let rhythmVariability = this.InstrumentSettings.rhythmVariability;
        let enableTriplets = this.InstrumentSettings.enableTriplets;
        let randomizationNotes = this.InstrumentSettings.notePool;
        let instrumentType = this.InstrumentSettings.type;
        let randomizationRule = this.InstrumentSettings.randomizationRule;

        if (randomizationRule === 'backbeat') {
            return generateBackbeat(
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

        let deterministicTemplate = null;

        if (this.globalRhythmArray) {
            // Global resolution is 16th notes (GLOBAL_RESOLUTION = 16).
            // Current resolution is defined by smallestNoteDenom (e.g., 8).
            // If global is 16 and local is 8, we sample every 2nd slot.

            const localDenom = smallestNoteDenom;

            if (localDenom <= GLOBAL_RESOLUTION && GLOBAL_RESOLUTION % localDenom === 0) {
                const step = GLOBAL_RESOLUTION / localDenom; // e.g. 16/8 = 2. Sample every 2nd.

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

        const rankedArray = generateRankedRhythm(
            numMeasures,
            timeSignature,
            notesPerMeasure,
            smallestNoteDenom,
            rhythmVariability,
            enableTriplets,
            randomizationNotes,
            deterministicTemplate
        );


        // Pre-calculate allowed notes based on Range
        let effectiveScale = this.scale;
        // ASCII sharps used as pitch-class keys for the range-expansion loop below.
        const ALL_PCS_CALC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        if (this.range) {
            // getNoteIndex returns position in allNotes where A0=0 (9 semitones above C0=0).
            // noteVal = oct*12+i uses chromatic MIDI convention (C0=0). Add 9 to align origins.
            const rawMin = getNoteIndex(this.range.min);
            const rawMax = getNoteIndex(this.range.max);
            const minVal = rawMin >= 0 ? rawMin + 9 : 0;
            const maxVal = rawMax >= 0 ? rawMax + 9 : 108; // 108 = C8 (safe upper bound)

            const expanded = [];

            for (let oct = 0; oct <= 8; oct++) {
                for (let i = 0; i < 12; i++) {
                    const pc = ALL_PCS_CALC[i];
                    const noteVal = oct * 12 + i;

                    if (noteVal >= minVal && noteVal <= maxVal) {
                        const scalePCs = this.scale.map(n => (n.replace(/\d+$/, '')));
                        const normalizedScalePCs = scalePCs.map(n =>
                            n.replace('♭', 'b').replace('♯', '#')
                                .replace('Db', 'C#').replace('Eb', 'D#')
                                .replace('Gb', 'F#').replace('Ab', 'G#')
                                .replace('Bb', 'A#')
                        );

                        if (normalizedScalePCs.includes(pc)) {
                            const matchIndex = normalizedScalePCs.indexOf(pc);
                            const spellPC = scalePCs[matchIndex];
                            expanded.push(`${spellPC}${oct}`);
                        }
                    }
                }
            }

            if (expanded.length > 0) {
                effectiveScale = expanded;
            }
        }

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
            timeSignature  // needed for offset-based chord lookup (passing chords)
        );

        let generatedMelody = rawResult.melody;
        let generatedVolumes = rawResult.volumes;

        // Backward compatibility if convertRankedArrayToMelody returns array (in case of partial hot reload or mixed versions)
        if (Array.isArray(rawResult)) {
            generatedMelody = rawResult;
            generatedVolumes = new Array(generatedMelody.length).fill(null);
        }

        const maxLeap = this.InstrumentSettings.maxLeap ?? null;

        // Melodic leap constraint: replace any note that jumps more than maxLeap semitones from
        // all notes placed within the previous quarter-note window. Uses intersection approach
        // (O(pool × window) linear scan) instead of retries — always terminates.
        // Not applied to fullchord (span constraint below) or chord sequences (progression mode).
        if (maxLeap !== null && instrumentType !== 'fullchord') {
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

        // Full-chord mode: replace each rhythm-active slot with all chord tones at that time offset.
        // The rhythm (which slots are active) comes from the normal generateRankedRhythm pipeline above,
        // so notesPerMeasure, smallestNoteDenom, rhythmVariability, etc. all apply as normal.
        if (instrumentType === 'fullchord' && this.chords) {
            const totalSlots = generatedMelody.length;
            const fcTimeScale = (TICKS_PER_WHOLE * numMeasures / totalSlots) * (timeSignature[0] / timeSignature[1]);

            // Build sorted chord event list.
            // this.chords can be a Melody object (normal path from randomizeAll) or a
            // ChordProgression / raw Chord array (Sequencer.randomizeScaleAndGenerate path).
            const chordEvents = [];
            const measureLength = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);
            if (this.chords.offsets && Array.isArray(this.chords.offsets)) {
                // Melody object: use precise per-slot offsets
                for (let i = 0; i < this.chords.offsets.length; i++) {
                    const evOffset = this.chords.offsets[i];
                    const evNotes = this.chords.notes[i];
                    if (evOffset !== null && Array.isArray(evNotes)) {
                        chordEvents.push({ offset: evOffset, notes: evNotes });
                    }
                }
            } else {
                // ChordProgression object or raw Chord[] array — one chord per measure
                const chordsArray = this.chords.chords || (Array.isArray(this.chords) ? this.chords : []);
                chordsArray.forEach((chord, idx) => {
                    if (chord && Array.isArray(chord.notes) && chord.notes.length > 0) {
                        chordEvents.push({ offset: idx * measureLength, notes: chord.notes });
                    }
                });
            }
            chordEvents.sort((a, b) => a.offset - b.offset);

            const getChordAt = (targetOffset) => {
                let result = null;
                for (const ev of chordEvents) {
                    if (ev.offset <= targetOffset) result = ev.notes;
                    else break;
                }
                return result;
            };

            generatedMelody = generatedMelody.map((note, i) => {
                if (note === null) return null; // inactive (rest) slot
                const chordNotes = getChordAt(i * fcTimeScale);
                if (!chordNotes) return null;
                let kept = this.range ? chordNotes.filter(n => isNoteInRange(n, this.range)) : chordNotes;
                // Chord voicing span: limit semitone distance between lowest and highest note.
                // Find the largest consecutive pitch window that fits within maxLeap.
                if (maxLeap !== null && kept.length > 1) {
                    const sorted = [...kept].sort((a, b) => getNoteIndex(a) - getNoteIndex(b));
                    let best = [sorted[0]];
                    for (let lo = 0; lo < sorted.length; lo++) {
                        for (let hi = sorted.length - 1; hi > lo; hi--) {
                            if (getNoteIndex(sorted[hi]) - getNoteIndex(sorted[lo]) <= maxLeap) {
                                if (hi - lo + 1 > best.length) best = sorted.slice(lo, hi + 1);
                                break;
                            }
                        }
                    }
                    kept = best;
                }
                return kept.length > 0 ? kept : null;
            });

            // Return directly: no scale-context display-note resolution needed for chord arrays
            return Melody.fromFlattenedNotes(generatedMelody, timeSignature, numMeasures, generatedMelody, generatedVolumes, null);
        }

        // Paired-chord mode: each active slot keeps the generated melody note and adds one
        // chord tone within an octave. Falls back to the single note when none qualify.
        if (instrumentType === 'pairedchord' && this.chords) {
            const totalSlots = generatedMelody.length;
            const pcTimeScale = (TICKS_PER_WHOLE * numMeasures / totalSlots) * (timeSignature[0] / timeSignature[1]);

            const chordEvents = [];
            const measureLength = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);
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
            chordEvents.sort((a, b) => a.offset - b.offset);

            const getChordAt = (targetOffset) => {
                let result = null;
                for (const ev of chordEvents) {
                    if (ev.offset <= targetOffset) result = ev.notes;
                    else break;
                }
                return result;
            };

            generatedMelody = generatedMelody.map((note, i) => {
                if (note === null || typeof note !== 'string') return note;
                const chordNotes = getChordAt(i * pcTimeScale);
                if (!chordNotes) return note;
                const melIdx = getNoteIndex(note);
                if (melIdx === -1) return note;
                // Range-filter chord tones, then keep those within maxLeap (or one octave if unlimited)
                const spanLimit = maxLeap !== null ? Math.min(12, maxLeap) : 12;
                const inRange = this.range ? chordNotes.filter(n => isNoteInRange(n, this.range)) : chordNotes;
                const candidates = inRange.filter(n => {
                    const nIdx = getNoteIndex(n);
                    return nIdx !== -1 && n !== note && Math.abs(nIdx - melIdx) <= spanLimit;
                });
                if (candidates.length === 0) return note; // fallback: single note
                const partner = candidates[Math.floor(Math.random() * candidates.length)];
                return [note, partner];
            });

            return Melody.fromFlattenedNotes(generatedMelody, timeSignature, numMeasures, generatedMelody, generatedVolumes, null);
        }

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
                    if (isBeat && note === null && instrumentType === 'percussion') return 'r';
                    return note;
                });
            };

            if (instrumentType === 'percussion') {
                generatedMelodyWithRests = insertRestsAtBeats(generatedMelody, numMeasures, timeSignature);
            } else {
                generatedMelodyWithRests = generatedMelody;
            }
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

        // Tuplet post-processing: each qualifying note has an independent chance of becoming a
        // triplet (3:2), quadruplet (4:3), quintuplet (5:4), and extended rare types.
        // Each candidate has a minVar threshold and probability denominator.
        // Multiple tuplets per measure are possible — no limit.
        // Chord sequences excluded — tuplets only apply to single-note melodies.
        //
        // Tuplet types (slotTicks = TICKS_PER_WHOLE / smallestNoteDenom):
        //   triplet-small (3:2): 3 notes in 2×slotTicks  → visualDuration = slotTicks
        //   triplet-large (3:2): 3 notes in 4×slotTicks  → visualDuration = 2×slotTicks
        //   quadruplet   (4:3): 4 notes in 3×slotTicks  → visualDuration = slotTicks
        //   quintuplet   (5:4): 5 notes in 4×slotTicks  → visualDuration = slotTicks
        //   pentuplet    (5:6): 5 notes in 6×slotTicks  → visualDuration = slotTicks  (compound meter)
        //   sextuplet    (6:4): 6 notes in 4×slotTicks  → visualDuration = slotTicks
        //   sextuplet    (6:5): 6 notes in 5×slotTicks  → visualDuration = slotTicks
        //   septuplet    (7:6): 7 notes in 6×slotTicks  → visualDuration = slotTicks  (compound meter)
        //   septuplet    (7:8): 7 notes in 8×slotTicks  → visualDuration = slotTicks
        //
        // The groupTicks filter naturally restricts compound-meter types (5:6, 7:6) to
        // meters where the group fits (6/8, 9/8, 12/8…); 7:8 requires ≥4/4 in 8th-grid.
        //
        // melody.triplets[i] = null | { id, noteCount, denominator, groupTicks, visualDuration }
        if (rhythmVariability > 0 && !isChordSequence) {
            const slotTicks    = Math.round(TICKS_PER_WHOLE / smallestNoteDenom);
            const measureTicks = TICKS_PER_WHOLE * (timeSignature[0] / timeSignature[1]);

            // polyMultiplier boosts all tuplet probabilities proportionally.
            // 1 = normal; higher values from the global Polyrhythm control make tuplets
            // dramatically more frequent. Capped at 1 so no probability exceeds 100%.
            const polyMult = this.InstrumentSettings.polyMultiplier || 1;

            // Candidates ordered rarest → most common (first successful roll wins per note).
            // minVar: minimum rhythmVariability for the type to be eligible.
            const tupletCandidates = [
                // Extended types — only when variability > 50, very rare
                { noteCount: 7, denominator: 8, groupTicks: 8 * slotTicks, prob: Math.min(1, rhythmVariability / 10000 * polyMult), minVar: 51 },
                { noteCount: 7, denominator: 6, groupTicks: 6 * slotTicks, prob: Math.min(1, rhythmVariability / 10000 * polyMult), minVar: 51 },
                { noteCount: 6, denominator: 5, groupTicks: 5 * slotTicks, prob: Math.min(1, rhythmVariability / 8000  * polyMult), minVar: 51 },
                { noteCount: 6, denominator: 4, groupTicks: 4 * slotTicks, prob: Math.min(1, rhythmVariability / 5000  * polyMult), minVar: 51 },
                { noteCount: 5, denominator: 6, groupTicks: 6 * slotTicks, prob: Math.min(1, rhythmVariability / 8000  * polyMult), minVar: 51 },
                // Standard types — from variability ≥ 30
                { noteCount: 5, denominator: 4, groupTicks: 4 * slotTicks, prob: Math.min(1, rhythmVariability / 2000  * polyMult), minVar: 30 },
                { noteCount: 4, denominator: 3, groupTicks: 3 * slotTicks, prob: Math.min(1, rhythmVariability / 1000  * polyMult), minVar: 30 },
                { noteCount: 3, denominator: 2, groupTicks: 4 * slotTicks, prob: Math.min(1, rhythmVariability / 750   * polyMult), minVar: 30 },
                { noteCount: 3, denominator: 2, groupTicks: 2 * slotTicks, prob: Math.min(1, rhythmVariability / 500   * polyMult), minVar: 30 },
            ].filter(t => t.groupTicks > 0 && t.groupTicks <= measureTicks && rhythmVariability >= t.minVar);

            let groupIdCounter = 0;
            const winners = [];

            for (let i = 0; i < finalMelody.notes.length; i++) {
                const n   = finalMelody.notes[i];
                const dur = finalMelody.durations[i];
                if (n === null || n === 'r') continue;
                for (const t of tupletCandidates) {
                    if (dur === t.groupTicks && Math.random() < t.prob) {
                        groupIdCounter++;
                        winners.push({ i, id: groupIdCounter, ...t });
                        break; // Only one tuplet type per note
                    }
                }
            }

            if (winners.length > 0) {
                // Apply RIGHT-TO-LEFT so earlier candidate indices remain stable.
                let notes        = [...finalMelody.notes];
                let durations    = [...finalMelody.durations];
                let offsets      = [...finalMelody.offsets];
                let displayNotes = [...(finalMelody.displayNotes ?? finalMelody.notes)];
                let volumes      = [...finalMelody.volumes];
                let triplets     = finalMelody.notes.map(() => null);

                const pick = (fallback) => effectiveScale.length > 0
                    ? effectiveScale[Math.floor(Math.random() * effectiveScale.length)]
                    : fallback;

                for (let k = winners.length - 1; k >= 0; k--) {
                    const { i: idx, id, noteCount, denominator, groupTicks } = winners[k];
                    const noteTicks     = Math.round(groupTicks / noteCount);
                    // visualDuration: note value to display (groupTicks / denominator maps to a standard tick count).
                    const visualDuration = Math.round(groupTicks / denominator);

                    const firstNote = notes[idx];
                    const extra     = Array.from({ length: noteCount - 1 }, () => pick(firstNote));
                    const allNotes  = [firstNote, ...extra];
                    const baseOff   = offsets[idx];
                    const vol       = volumes[idx] ?? 0.9;

                    const entry = { id, noteCount, denominator, groupTicks, visualDuration };

                    notes        = [...notes.slice(0, idx),        ...allNotes,                                         ...notes.slice(idx + 1)];
                    durations    = [...durations.slice(0, idx),    ...allNotes.map(() => noteTicks),                    ...durations.slice(idx + 1)];
                    offsets      = [...offsets.slice(0, idx),      ...allNotes.map((_, j) => baseOff + j * noteTicks), ...offsets.slice(idx + 1)];
                    displayNotes = [...displayNotes.slice(0, idx), ...allNotes,                                         ...displayNotes.slice(idx + 1)];
                    volumes      = [...volumes.slice(0, idx),      ...allNotes.map(() => vol),                          ...volumes.slice(idx + 1)];
                    triplets     = [...triplets.slice(0, idx),     ...allNotes.map(() => entry),                        ...triplets.slice(idx + 1)];
                }

                // Drop (noteCount - 1) entries per winner from the tail so length stays consistent.
                const extraTotal = winners.reduce((sum, w) => sum + (w.noteCount - 1), 0);
                const keepN      = notes.length - extraTotal;

                if (keepN > 0) {
                    const tupletMelody = new Melody(
                        notes.slice(0, keepN),
                        durations.slice(0, keepN),
                        offsets.slice(0, keepN),
                        displayNotes.slice(0, keepN),
                        volumes.slice(0, keepN),
                    );
                    tupletMelody.smallestNoteDenom = smallestNoteDenom;
                    tupletMelody.triplets = triplets.slice(0, keepN);
                    return tupletMelody;
                }
            }
            // No qualifying notes won the roll — fall through to return the unmodified melody.
        }

        return finalMelody;
    }
}

export default MelodyGenerator;
