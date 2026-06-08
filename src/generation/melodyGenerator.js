import Melody from '../model/Melody.js';
import logger from '../utils/logger';
import convertRankedArrayToMelody from './convertRankedArrayToMelody.js';
import { generateRankedRhythm } from './generateRankedRhythm.js';
import { chooseGrouping, generateRhythmicDNA } from './rhythmicPriorities.js';
import { generateBackbeat, generateBackbeat2, generateSwing, generateMetronome, filterPercussionByEnabledPads } from './generateBackbeat.js';
import { getNoteIndex } from '../theory/musicUtils.js';
import { getNoteSemitone } from '../theory/noteUtils.js';
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

    generateMelody() {
        let tonic = this.tonic;
        let notesPerMeasure = this.InstrumentSettings.notesPerMeasure;
        let numMeasures = this.numMeasures;
        let timeSignature = this.timeSignature;
        let smallestNoteDenom = this.InstrumentSettings.smallestNoteDenom;
        let rhythmVariability = this.InstrumentSettings.rhythmVariability;
        let randomizationNotes = this.InstrumentSettings.notePool;
        let instrumentType = this.InstrumentSettings.type;
        let randomizationRule = this.InstrumentSettings.randomizationRule;

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

        // Pre-calculate allowed notes based on Range
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
}

export default MelodyGenerator;
