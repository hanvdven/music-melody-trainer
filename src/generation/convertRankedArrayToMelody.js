import generateAllNotesArray from '../theory/allNotesArray';
import logger from '../utils/logger';
import { getRelativeNoteName } from '../theory/convertToDisplayNotes';
import { getNoteSemitone, noteToMidi } from '../theory/noteUtils';
import { TICKS_PER_WHOLE } from '../constants/timing.js';

/**
 * Convert a ranked array of note "importance" into an actual melody sequence.
 * Respects:
 * - slot priority (top / high / low / null)
 * - chord progression & roots
 * - ARP logic (scale/chord/chromatic)
 * - uniform, emphasize roots, weighted rules
 * - percussion handling
 */
import { findBestSlot } from './proximityUtils.js';

const SOURCE_HIERARCHY = {
    'chromatic': 'scale',
    'scale': 'chord',
    'chord': 'root',
    'root': 'root',
    'all': 'root'
};

const getLesserOrderSource = (source) => {
    const s = (source || 'scale').toLowerCase();
    return SOURCE_HIERARCHY[s] || 'root';
};

const convertRankedArrayToMelody = (
    rankedArray,
    tonic,
    scale,              // pre-ranged scale notes
    notesPerMeasure,
    numMeasures,
    randomizationNotes,  // 'scale', 'chord', 'root', 'chromatic', 'kick_snare', etc
    chordProgression,    // array of chord objects per measure
    range = null,
    randomizationRule = 'uniform',
    timeSignature = null,   // [numerator, denominator] — needed for offset-based chord lookup
    rhythmicGrouping = null, // beat-group decomposition ([3,2] etc) — needed by arp_group
    maxLeap = 12             // reused as semitone span for arp_var / arp_group; null = full pool range
) => {
    logger.debug('convertRanked', 'start', {
        rule: randomizationRule, source: randomizationNotes,
        slots: rankedArray.length, numMeasures, notesPerMeasure, maxLeap,
    });

    // =========================================================================
    // 0. PREPARE NOTE POOL
    // =========================================================================
    // wm (mid woodblock) and cb (cowbell) were missing — added for parity with PERC_POOLS.all in generateBackbeat.js
    const percussionIDs = ['k', 's', 'sg', 'sr', 'hh', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc', 'wh', 'wm', 'wl', 'cb'];
    // Pitched notes only — percussion sources ('kick_snare', 'all', 'claves', 'metronome')
    // return their own hard-coded ID arrays from getPool and never use this pool.
    const fullAvailablePool = (() => {
        const allNotes = generateAllNotesArray();
        if (!range) return allNotes;

        const findNoteIdx = (note) => allNotes.findIndex(n => n === (note?.replace(/#/g, '♯').replace(/b/g, '♭') || ''));
        let startIdx = findNoteIdx(range.min), endIdx = findNoteIdx(range.max);
        if (startIdx === -1) startIdx = 0;
        if (endIdx === -1) endIdx = allNotes.length - 1;

        return allNotes.slice(startIdx, endIdx + 1).map(n => getRelativeNoteName(n, tonic));
    })();

    // Normalize chordProgression (handle Melody object or Array)
    // chordProgression.displayNotes = Chord[] (for note selection logic)
    // chordProgression.notes        = string[][] (audio only — do NOT use for chord lookup)
    const progressionArray = chordProgression?.displayNotes
        ?? chordProgression?.notes   // legacy fallback (pre-refactor objects)
        ?? chordProgression;         // raw array fallback

    // if (!progressionArray || progressionArray.length === 0) { ... } log removed.

    const generatedMelody = [...rankedArray];
    const numberOfSlotsPerMeasure = rankedArray.length / numMeasures;

    // =========================================================================
    // 1. HELPER FUNCTIONS
    // =========================================================================
    // Pitch-class identity uses getNoteSemitone (0-11) — single source of truth
    // in noteUtils.js handles all enharmonic spellings including double accidentals.

    // Pitch values used ONLY relatively within generation (every comparison
    // subtracts two values from this same function, so the base cancels) — the
    // result never escapes to an external C4=60 MIDI or to playback. Hence the
    // historical C4=48 base (oct*12, i.e. 12 LOWER than canonical) is INTENTIONAL
    // and preserved verbatim via base:-12 (Han 2026-06-19). Consolidated onto the
    // canonical noteUtils.noteToMidi parser so accidental handling is shared, but
    // the −12 base, the -1 unparseable fallback, and the percussion-→0 special
    // case stay HERE so every number this returns is byte-identical to the old
    // local single-accidental implementation.
    const getNoteValue = (note) => {
        if (percussionIDs.includes(note)) return 0;
        return noteToMidi(note, { fallback: -1, base: -12 });
    };

    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const getChordNotesInRange = (chord) => {
        if (!chord) return [];
        const chordSemis = chord.notes?.map(getNoteSemitone) || [];
        return fullAvailablePool.filter(n => chordSemis.includes(getNoteSemitone(n)));
    };

    const getRootNotesInRange = (chord) => {
        if (!chord) return [];
        const rootSemi = getNoteSemitone(chord.root);
        return fullAvailablePool.filter(n => getNoteSemitone(n) === rootSemi);
    };

    const KICK_SNARE_CHORD = { root: 'k', notes: ['k', 's', 'hh'] };
    const CLAVES_CHORD = { root: 'wh', notes: ['wh', 'wl'] };
    // Pre-build offset-sorted chord event list for O(n) lookup when offsets are available.
    // This is needed for passing chords, whose offsets are non-uniform and cannot be
    // recovered by a simple index-ratio mapping.
    const chordOffsetEvents = (() => {
        const offsets = chordProgression?.offsets;
        if (!offsets || !timeSignature) return null;
        const events = [];
        for (let i = 0; i < offsets.length; i++) {
            if (offsets[i] !== null && progressionArray[i] != null) {
                events.push({ offset: offsets[i], chord: progressionArray[i] });
            }
        }
        events.sort((a, b) => a.offset - b.offset);
        return events.length > 0 ? events : null;
    })();

    // Ticks per ranked-array slot — used only when chordOffsetEvents is available.
    // slotsPerMeasure = rankedArray.length / numMeasures.
    // measureTicks = TICKS_PER_WHOLE * ts[0] / ts[1].
    const ticksPerSlot = chordOffsetEvents && timeSignature
        ? (TICKS_PER_WHOLE * timeSignature[0] / timeSignature[1]) / (rankedArray.length / numMeasures)
        : 0;

    const getActiveChord = (measureIdx, randNotes, slotIndex) => {
        const s = (typeof randNotes === 'string') ? (randNotes || '').toLowerCase() : '';
        if (s === 'kick_snare') return KICK_SNARE_CHORD;
        if (s === 'claves') return CLAVES_CHORD;

        // Offset-based lookup: find the last chord event whose offset ≤ slot's tick offset.
        // Required when passing chords are present (non-uniform chord offsets), because an
        // index-ratio calculation would map slots to wrong chord indices.
        if (chordOffsetEvents) {
            const slotOffset = slotIndex * ticksPerSlot;
            let chord = null;
            for (const ev of chordOffsetEvents) {
                if (ev.offset <= slotOffset) chord = ev.chord;
                else break;
            }
            return chord;
        }

        // Fallback: index-ratio lookup for legacy sparse arrays (no .offsets available)
        if (progressionArray && progressionArray.length > numMeasures) {
            const chordSlots = progressionArray.length;
            const melodySlots = rankedArray.length;
            const ratio = chordSlots / melodySlots;
            const chordIdx = Math.floor(slotIndex * ratio);
            let chord = null;
            for (let i = chordIdx; i >= 0; i--) {
                if (progressionArray[i]) { chord = progressionArray[i]; break; }
            }
            if (!chord) {
                for (let i = chordIdx + 1; i < chordSlots; i++) {
                    if (progressionArray[i]) { chord = progressionArray[i]; break; }
                }
            }
            return chord;
        }

        // Fallback for dense array (1 chord per measure)
        return progressionArray?.[measureIdx];
    };

    const getPool = (source, chord) => {
        const s = (source || 'scale').toLowerCase();
        if (s === 'root') return getRootNotesInRange(chord);
        if (s === 'chord') return getChordNotesInRange(chord);
        if (s === 'scale') return scale; // This is the PRE-RANGED scale from MelodyGenerator
        if (s === 'chromatic') return scale; // For now, chromatic also respects the ranged scale
        if (s === 'kick_snare') return ['k', 's', 'hh'];
        if (s === 'claves') return ['wh', 'wm', 'wl'];
        if (s === 'all') return percussionIDs;
        if (s === 'metronome') return ['wh', 'wm', 'wl'];
        return scale;
    };

    // =========================================================================
    // 2. PRIORITY ASSIGNMENT
    // =========================================================================
    const allSlots = rankedArray.map((rank, idx) => {
        let priority = null;
        if (typeof rank === 'number') {
            const totalNotes = numMeasures * notesPerMeasure;

            if (rank >= totalNotes) {
                priority = null;
            } else if (rank < numMeasures) {
                priority = 'top';
            } else if (rank < totalNotes / 2) { // Logic for High/Low relative to remaining?
                // Actually, existing logic:
                // rank < numMeasures * notesPerMeasure / 2 -> High
                // rank < numMeasures * notesPerMeasure -> Low

                // If notesPerMeasure < 1 (e.g. 0.5, total=2), rank < 2.
                // rank 0, 1. 
                // rank < 4 (numMeasures) is true for both. So both are TOP.

                // We want to KEEP them as Top if they are main beats?
                // But we must stop at totalNotes.

                priority = 'top';
            } else if (rank < (numMeasures * notesPerMeasure) * 0.75) {
                priority = 'high';
            } else {
                priority = 'low';
            }

            // Simplified and Corrected Logic:
            if (rank >= totalNotes) {
                priority = null;
            } else if (rank < numMeasures) {
                priority = 'top';
            } else if (rank < numMeasures + (totalNotes - numMeasures) / 2) {
                priority = 'high';
            } else {
                priority = 'low';
            }
        }
        return { index: idx, rank, priority };
    });

    const activeSlotsSet = new Set(allSlots.filter(s => s.priority !== null).map(s => s.index));

    logger.debug('convertRanked', 'active slots', {
        active: activeSlotsSet.size, total: rankedArray.length,
        top: allSlots.filter(s => s.priority === 'top').length,
        high: allSlots.filter(s => s.priority === 'high').length,
        low: allSlots.filter(s => s.priority === 'low').length,
    });

    // =========================================================================
    // 2.5 ARP_VAR / ARP_GROUP — sequence-level backwards-planning arpeggio
    // =========================================================================
    // These rules operate on all active slots at once (not slot-by-slot), so
    // they pre-compute the full melody and return early before the main loop.
    //
    // Core concepts (see docs/architecture.md §27):
    //   L       = landing note; always the LAST note of a line.
    //   line    = contiguous run of active slots that ends at L.
    //   direction = 'up' (notes ascend toward L) | 'down' (notes descend toward L).
    //   backwards planning = walks OPPOSITE to direction, starting from L.
    //   span    = 12-semitone window around L; boundary modes: kaats (bounce) / spring (jump).

    const rule = (randomizationRule || 'uniform').toLowerCase();

    logger.debug('convertRanked', `rule=${rule}`, {
        pool: typeof randomizationNotes === 'string' ? randomizationNotes : 'custom',
        scaleSize: scale?.length ?? 0, activeSlots: activeSlotsSet.size,
    });

    // Shared backwards-planning helper used by arp_var, arp_group, and walking_bass.
    // Returns the line in TIME ORDER: [approach1, ..., approachN, L].
    // direction='up'  → L is at top of span; planning walks DOWN from L.
    // direction='down'→ L is at bottom of span; planning walks UP from L.
    // boundaryMode: 'kaats' reverses planning direction; 'spring' shifts span by one octave.
    // maxLeap (outer scope) caps the span; null = full pool range.
    // spanLowOverride/spanHighOverride: when provided, used directly instead of
    // deriving from direction (arp_group passes a random span containing L per
    // Han's spec — see §27.5b).
    const buildArpLine = (lineLength, L, direction, boundaryMode, pool, spanLowOverride = null, spanHighOverride = null) => {
        const sorted = pool
            .map(n => ({ note: n, val: getNoteValue(n) }))
            .filter(x => x.val >= 0)
            .sort((a, b) => a.val - b.val);
        if (sorted.length === 0) return Array(lineLength).fill(L);

        const n = lineLength - 1;
        if (n === 0) return [L];

        const lVal = getNoteValue(L);
        const effectiveSpan = maxLeap ?? (sorted[sorted.length - 1].val - sorted[0].val + 1);
        let spanLow  = spanLowOverride !== null ? spanLowOverride : (direction === 'up' ? lVal - effectiveSpan : lVal);
        let spanHigh = spanHighOverride !== null ? spanHighOverride : (direction === 'up' ? lVal : lVal + effectiveSpan);
        let planStep = direction === 'up' ? -1 : 1;
        let currentVal = lVal;

        const inSpan   = (lo, hi) => sorted.filter(x => x.val >= lo && x.val <= hi);
        const stepFrom = (val, step, lo, hi) => {
            const notes = inSpan(lo, hi);
            if (step === -1) { const c = notes.filter(x => x.val < val); return c.length > 0 ? c[c.length - 1] : null; }
            const c = notes.filter(x => x.val > val);
            return c.length > 0 ? c[0] : null;
        };

        const approaches = [];
        for (let k = 0; k < n; k++) {
            let next = stepFrom(currentVal, planStep, spanLow, spanHigh);
            if (!next) {
                if (boundaryMode === 'kaats') {
                    planStep = -planStep;
                    next = stepFrom(currentVal, planStep, spanLow, spanHigh);
                } else {
                    const shift = planStep === -1 ? -effectiveSpan : effectiveSpan;
                    spanLow += shift; spanHigh += shift;
                    const newNotes = inSpan(spanLow, spanHigh);
                    if (newNotes.length > 0)
                        next = planStep === -1 ? newNotes[newNotes.length - 1] : newNotes[0];
                }
            }
            if (!next) {
                const allCands = planStep === -1
                    ? sorted.filter(x => x.val < currentVal)
                    : sorted.filter(x => x.val > currentVal);
                next = allCands.length > 0
                    ? (planStep === -1 ? allCands[allCands.length - 1] : allCands[0])
                    : sorted[Math.floor(Math.random() * sorted.length)];
            }
            approaches.push(next.note);
            currentVal = next.val;
        }
        approaches.reverse();
        approaches.push(L);
        return approaches;
    };

    if (rule === 'arp_var' || rule === 'arp_group') {
        const arpSource = (typeof randomizationNotes === 'string')
            ? (randomizationNotes || 'scale').toLowerCase()
            : 'custom_pool';

        // Choose the landing note for a line based on the pool and chord:
        //   chord/root pool → root of chord; scale pool → random chord tone; otherwise random.
        const chooseLandingNote = (pool, chord) => {
            if (!pool.length) return null;
            if (arpSource === 'chord' || arpSource === 'root') {
                const roots = getRootNotesInRange(chord);
                const validRoots = roots.filter(n => pool.includes(n));
                if (validRoots.length > 0) return pickRandom(validRoots);
            }
            if (arpSource === 'scale') {
                const chordTones = getChordNotesInRange(chord);
                const candidates = chordTones.filter(n => pool.includes(n));
                if (candidates.length > 0) return pickRandom(candidates);
            }
            return pickRandom(pool);
        };

        // Assign pitches to a list of slot indices using one arp line.
        const fillLine = (slotIndices, melody, volumes) => {
            if (slotIndices.length === 0) return;
            const lastSlot = slotIndices[slotIndices.length - 1];
            const measureIdx = Math.floor(lastSlot / numberOfSlotsPerMeasure);
            const chord = getActiveChord(measureIdx, randomizationNotes, lastSlot);
            const pool = getPool(arpSource, chord);
            if (!pool.length) return;

            const L = chooseLandingNote(pool, chord);
            if (!L) return;

            const direction = Math.random() < 0.5 ? 'up' : 'down';
            const boundaryMode = Math.random() < 0.5 ? 'kaats' : 'spring';
            const pitches = buildArpLine(slotIndices.length, L, direction, boundaryMode, pool);

            slotIndices.forEach((idx, i) => {
                melody[idx] = pitches[i] ?? L;
                // L (last note) gets downbeat volume; approach notes get slightly softer.
                volumes[idx] = i === slotIndices.length - 1 ? 0.9 : 0.7;
            });
        };

        const arpMelody = new Array(generatedMelody.length).fill(null);
        const arpVolumes = new Array(generatedMelody.length).fill(null);

        if (rule === 'arp_var') {
            // Lines = contiguous runs of active slots separated by inactive slots.
            // L = last active slot in each run; line boundary at longest empty gap on tie.
            let currentLine = [];
            const flush = () => { fillLine(currentLine, arpMelody, arpVolumes); currentLine = []; };

            for (let i = 0; i <= allSlots.length; i++) {
                const isActive = i < allSlots.length && allSlots[i].priority !== null;
                if (isActive) {
                    currentLine.push(i);
                } else if (currentLine.length > 0) {
                    flush();
                }
            }

        } else {
            // arp_group — NEW spec (Han 2026-05-22, §27.5a/b/c in docs/architecture.md).
            //
            // Stage 1: line decomposition by rank-walking. Every slot in the
            //          smallestNoteDenom grid gets a rank — actives from the
            //          rhythm engine, inactives a PLACEHOLDER (max value).
            //          Walking ranks ascending, assign L to the slot unless it
            //          is already 'n' (overwritten by an earlier fill). Then
            //          fill the GROUP BEFORE (previous beat group in time, per
            //          rhythmicGrouping) with 'n', overwriting any L's there
            //          (those L's become approach notes of a longer line).
            //          Stop conditions:
            //            (a) all slots are tagged (L or n), or
            //            (b) the next-lowest rank is tied across multiple slots
            //                → tie-break: pick the slot whose group-before fill
            //                creates the longest empty stretch, then STOP.
            //
            // Stage 2: per-line backwards-plan with a RANDOM span containing L
            //          (Han's answer to "span sliding" 2026-05-26) — span width
            //          = maxLeap semitones, positioned randomly within the
            //          instrument range so L falls inside. The existing
            //          buildArpLine handles boundary modes (kaats / spring).

            const grouping = rhythmicGrouping ?? (timeSignature ? [timeSignature[0]] : [4]);
            const slotsPerBeat = numberOfSlotsPerMeasure / (timeSignature?.[0] ?? 4);

            // Build [start, end) group ranges in slot space across all measures.
            const groups = [];
            for (let m = 0; m < numMeasures; m++) {
                const measureStart = m * numberOfSlotsPerMeasure;
                let beatCursor = 0;
                for (const groupBeats of grouping) {
                    const gs = measureStart + Math.round(beatCursor * slotsPerBeat);
                    const ge = measureStart + Math.round((beatCursor + groupBeats) * slotsPerBeat);
                    groups.push([gs, ge]);
                    beatCursor += groupBeats;
                }
            }

            // Stage 1 — rank walk.
            const PLACEHOLDER = Number.MAX_SAFE_INTEGER;
            const ranks = allSlots.map(s => s.priority ?? PLACEHOLDER);
            const tags = new Array(allSlots.length).fill(null); // 'L' | 'n' | null

            const groupIdxOf = (slotIdx) => {
                for (let g = 0; g < groups.length; g++) {
                    if (slotIdx >= groups[g][0] && slotIdx < groups[g][1]) return g;
                }
                return -1;
            };
            const fillGroupBefore = (slotIdx) => {
                const g = groupIdxOf(slotIdx);
                if (g <= 0) return; // first group has no predecessor
                const [s, e] = groups[g - 1];
                for (let i = s; i < e; i++) tags[i] = 'n';
            };
            const groupBeforeUntaggedCount = (slotIdx) => {
                const g = groupIdxOf(slotIdx);
                if (g <= 0) return 0;
                const [s, e] = groups[g - 1];
                let c = 0;
                for (let i = s; i < e; i++) if (tags[i] === null) c++;
                return c;
            };

            // Indices sorted by rank ascending, stable on slot index for determinism.
            const slotsByRank = Array.from({ length: allSlots.length }, (_, i) => i)
                .sort((a, b) => ranks[a] - ranks[b] || a - b);

            let i = 0;
            while (i < slotsByRank.length) {
                if (!tags.includes(null)) break; // all tagged

                const curRank = ranks[slotsByRank[i]];
                let j = i;
                while (j < slotsByRank.length && ranks[slotsByRank[j]] === curRank) j++;
                // Filter out slots already tagged (a previous fill marked them 'n').
                const tied = slotsByRank.slice(i, j).filter(s => tags[s] === null);

                if (tied.length === 0) {
                    i = j;
                    continue;
                }

                if (tied.length > 1) {
                    // Tie-break: pick slot whose group-before fill creates the
                    // longest empty stretch. Stops Stage 1 afterwards.
                    let bestSlot = tied[0];
                    let bestCount = groupBeforeUntaggedCount(bestSlot);
                    for (let k = 1; k < tied.length; k++) {
                        const c = groupBeforeUntaggedCount(tied[k]);
                        if (c > bestCount) { bestSlot = tied[k]; bestCount = c; }
                    }
                    if (tags[bestSlot] !== 'n') tags[bestSlot] = 'L';
                    fillGroupBefore(bestSlot);
                    break;
                }

                // Unique rank — process it.
                const slotIdx = tied[0];
                if (tags[slotIdx] !== 'n') tags[slotIdx] = 'L';
                fillGroupBefore(slotIdx);
                i = j;
            }

            // Decompose tags into lines: each contiguous run of tagged slots
            // ending in 'L' is one line. Trailing n's without an L are dropped
            // (no landing note → not a valid arp line).
            const lines = [];
            let currentLine = [];
            for (let s = 0; s < tags.length; s++) {
                if (tags[s] === null) continue;
                currentLine.push(s);
                if (tags[s] === 'L') {
                    lines.push(currentLine);
                    currentLine = [];
                }
            }

            // Stage 2 — fill each line with backwards-planned notes.
            // Span: random, maxLeap wide, contains L, clamped to range.
            const span = maxLeap ?? 12;
            const rangeMinVal = range?.min ? getNoteValue(range.min) : null;
            const rangeMaxVal = range?.max ? getNoteValue(range.max) : null;

            const fillArpGroupLine = (slotIndices) => {
                if (slotIndices.length === 0) return;
                const lastSlot = slotIndices[slotIndices.length - 1];
                const measureIdx = Math.floor(lastSlot / numberOfSlotsPerMeasure);
                const chord = getActiveChord(measureIdx, randomizationNotes, lastSlot);
                const pool = getPool(arpSource, chord);
                if (!pool.length) return;
                const L = chooseLandingNote(pool, chord);
                if (!L) return;

                const direction = Math.random() < 0.5 ? 'up' : 'down';
                const boundaryMode = Math.random() < 0.5 ? 'kaats' : 'spring';

                // Random span containing L, maxLeap wide, clamped to range.
                // spanLow must be in [max(rangeMin, L − span + 1), min(rangeMax − span + 1, L)].
                // If range is narrower than the span, clamp to range entirely.
                const lVal = getNoteValue(L);
                let spanLow, spanHigh;
                if (rangeMinVal === null || rangeMaxVal === null) {
                    // No range constraint — use the legacy edge-of-span behaviour.
                    spanLow = null; spanHigh = null;
                } else {
                    const lo = Math.max(rangeMinVal, lVal - span + 1);
                    const hi = Math.min(rangeMaxVal - span + 1, lVal);
                    if (lo > hi) {
                        // Range narrower than span — clamp entirely to range.
                        spanLow = rangeMinVal;
                        spanHigh = rangeMaxVal;
                    } else {
                        spanLow = lo + Math.floor(Math.random() * (hi - lo + 1));
                        spanHigh = spanLow + span - 1;
                    }
                }

                const pitches = buildArpLine(
                    slotIndices.length, L, direction, boundaryMode, pool,
                    spanLow, spanHigh,
                );
                slotIndices.forEach((idx, k) => {
                    arpMelody[idx] = pitches[k] ?? L;
                    arpVolumes[idx] = k === slotIndices.length - 1 ? 0.9 : 0.7;
                });
            };

            for (const line of lines) fillArpGroupLine(line);
        }

        logger.debug('convertRanked', 'arp done', {
            rule, notesPlaced: arpMelody.filter(n => n !== null && n !== 'r').length,
        });

        // Safety: if the entire result is silent, fall back to a random scale note.
        if (!arpMelody.some(n => n !== null && n !== 'r') && scale.length > 0) {
            const firstActive = allSlots.findIndex(s => s.priority !== null);
            if (firstActive >= 0) { arpMelody[firstActive] = scale[0]; arpVolumes[firstActive] = 0.9; }
        }

        return { melody: arpMelody, volumes: arpVolumes };
    }

    // =========================================================================
    // 2.6 WALKING BASS — structured bass line with root pin + approach note
    // =========================================================================
    // Each chord event defines a segment. Within each segment:
    //   • First active slot  → pinned to the root of the current chord.
    //   • Last active slot   → approach note toward the root of the next chord.
    //     Approach character is determined by randomizationNotes (note pool):
    //       'chord'    → nearest chord tone to next root   (power/close approach)
    //       'scale'    → nearest diatonic step to next root (leidtoon approach)
    //       'chromatic'→ exactly ±1 semitone from next root (classic jazz approach)
    //   • Middle slots       → filled via backwards planning (reuses buildArpLine)
    //     moving between the pinned root and the approach note.
    //
    // rhythmVariability drives which slots are active (via ranked array),
    // so variability=0 → quarter notes only; higher → subdivisions/passing notes.
    // maxLeap applies to the middle-fill span (via buildArpLine).

    if (rule === 'walking_bass') {
        const wbSource = (typeof randomizationNotes === 'string')
            ? (randomizationNotes || 'chord').toLowerCase()
            : 'chord';

        const wbMelody  = new Array(generatedMelody.length).fill(null);
        const wbVolumes = new Array(generatedMelody.length).fill(null);

        // Pick candidate closest in pitch to reference note (voice leading).
        const closestNote = (candidates, reference) => {
            if (!candidates.length) return null;
            if (!reference) return candidates[Math.floor(Math.random() * candidates.length)];
            const refVal = getNoteValue(reference);
            return [...candidates].sort((a, b) =>
                Math.abs(getNoteValue(a) - refVal) - Math.abs(getNoteValue(b) - refVal)
            )[0];
        };

        // Approach note toward nextRoot, character set by wbSource:
        //   chromatic → search fullAvailablePool for note exactly ±1 semitone, prefer below.
        //   chord/scale → closest pool note that is NOT nextRoot itself.
        const findApproachNote = (nextRoot, pool, prevNote) => {
            const nextVal = getNoteValue(nextRoot);
            if (wbSource === 'chromatic') {
                const below = fullAvailablePool.filter(n => getNoteValue(n) === nextVal - 1);
                const above = fullAvailablePool.filter(n => getNoteValue(n) === nextVal + 1);
                const cands = below.length > 0 ? below : above; // prefer from below
                return closestNote(cands, prevNote ?? nextRoot) ?? pickRandom(pool) ?? nextRoot;
            }
            // chord or scale: nearest pool note excluding nextRoot pitch class
            const sorted = [...pool]
                .map(n => ({ note: n, val: getNoteValue(n) }))
                .filter(x => x.val >= 0 && x.val !== nextVal)
                .sort((a, b) => Math.abs(a.val - nextVal) - Math.abs(b.val - nextVal));
            return sorted[0]?.note ?? pickRandom(pool) ?? nextRoot;
        };

        // Build chord segments — one per chord event (respects passing chords).
        // Falls back to one segment per measure when no offset data is available.
        const segments = (() => {
            if (chordOffsetEvents && chordOffsetEvents.length > 0 && ticksPerSlot > 0) {
                return chordOffsetEvents.map((ev, i) => {
                    const next = chordOffsetEvents[i + 1];
                    return {
                        chord:     ev.chord,
                        nextChord: chordOffsetEvents[(i + 1) % chordOffsetEvents.length].chord,
                        slotStart: Math.round(ev.offset / ticksPerSlot),
                        slotEnd:   next ? Math.round(next.offset / ticksPerSlot) : rankedArray.length,
                    };
                });
            }
            // Fallback: one segment per measure
            const pLen = Math.max(1, progressionArray?.length ?? 0);
            return Array.from({ length: numMeasures }, (_, m) => ({
                chord:     progressionArray?.[m] ?? null,
                nextChord: progressionArray?.[(m + 1) % pLen] ?? progressionArray?.[0] ?? null,
                slotStart: m * numberOfSlotsPerMeasure,
                slotEnd:   (m + 1) * numberOfSlotsPerMeasure,
            }));
        })();

        // Tonic fallback when no chord progression is active.
        const tonicRoot  = scale.length > 0 ? scale[0] : null;
        const tonicFallback = tonicRoot ? { root: tonicRoot, notes: [tonicRoot] } : null;

        let prevLastNote = null; // tracks last placed note for cross-segment voice leading

        for (const { chord, nextChord, slotStart, slotEnd } of segments) {
            const eff     = chord     ?? tonicFallback;
            const effNext = nextChord ?? tonicFallback ?? eff;
            if (!eff) continue;

            // Collect active slots in this segment
            const activeSlots = [];
            for (let s = Math.max(0, slotStart); s < Math.min(slotEnd, rankedArray.length); s++) {
                if (allSlots[s]?.priority !== null) activeSlots.push(s);
            }
            if (activeSlots.length === 0) continue;

            const pool = getPool(wbSource, eff);
            if (pool.length === 0) continue;

            // ── PIN: first active slot = root of current chord ────────────────
            const roots = getRootNotesInRange(eff);
            const firstNote = closestNote(roots.length > 0 ? roots : pool, prevLastNote)
                ?? pickRandom(pool);
            if (!firstNote) continue;

            wbMelody[activeSlots[0]]  = firstNote;
            wbVolumes[activeSlots[0]] = 0.9; // downbeat always accented

            if (activeSlots.length === 1) { prevLastNote = firstNote; continue; }

            // ── APPROACH: last active slot → next chord root ───────────────────
            const nextRoots = getRootNotesInRange(effNext);
            const nextRoot  = closestNote(nextRoots.length > 0 ? nextRoots : pool, firstNote)
                ?? firstNote;
            const lastNote  = findApproachNote(nextRoot, pool, firstNote);

            wbMelody[activeSlots.at(-1)]  = lastNote;
            wbVolumes[activeSlots.at(-1)] = 0.75; // approach note slightly softer

            // ── FILL: middle slots via backwards planning (reuses buildArpLine) ─
            // buildArpLine plans from L backwards; the approach notes land in time
            // order before lastNote. We drop position 0 (firstNote is already pinned).
            if (activeSlots.length > 2) {
                const midSlots  = activeSlots.slice(1, -1);
                const direction = getNoteValue(lastNote) >= getNoteValue(firstNote) ? 'up' : 'down';
                // lineLength includes lastNote itself; result = [...midNotes, lastNote]
                const pitches   = buildArpLine(midSlots.length + 1, lastNote, direction, 'kaats', pool);
                // pitches[0..n-2] = mid notes, pitches[n-1] = lastNote (already placed)
                midSlots.forEach((slotIdx, k) => {
                    wbMelody[slotIdx]  = pitches[k] ?? lastNote;
                    wbVolumes[slotIdx] = 0.7;
                });
            }

            prevLastNote = lastNote;
        }

        // Safety: silence fallback
        if (!wbMelody.some(n => n !== null && n !== 'r') && scale.length > 0) {
            const firstActive = allSlots.findIndex(s => s.priority !== null);
            if (firstActive >= 0) { wbMelody[firstActive] = scale[0]; wbVolumes[firstActive] = 0.9; }
        }

        logger.debug('convertRanked', 'walking_bass done', {
            placed: wbMelody.filter(n => n !== null).length,
            source: wbSource, segments: segments.length,
        });

        return { melody: wbMelody, volumes: wbVolumes };
    }

    // =========================================================================
    // 3. MELODY GENERATION
    // =========================================================================
    let measureHasNote = Array(numMeasures).fill(false);
    let seqIdx = 0, arpPhaseOffset = 0;
    const generatedVolumes = new Array(generatedMelody.length).fill(null);

    let activeIndices = [];
    if (rule === 'progression') {
        allSlots.forEach(s => {
            if (s && s.priority !== null) activeIndices.push(s.index);
        });
        // Force slot 0 if not present?
        if (!activeIndices.includes(0)) {
            activeIndices.unshift(0);
            // We need to ensure slot 0 has priority if we force it
            const s0 = allSlots.find(s => s.index === 0);
            if (s0) s0.priority = 'top'; // Force priority
        }
        activeIndices.sort((a, b) => a - b);
    }

    // =========================================================================
    // 3.5 PRE-CALCULATE PROXIMITY FOCUS SLOTS (for roots)
    // =========================================================================
    const focusSlotToMeasure = new Map(); // slotIndex -> targetMeasureIdx
    const totalNotesThreshold = numMeasures * notesPerMeasure;

    if (rule === 'emphasize_roots' || rule === 'weighted') {
        const slotsPerMeasure = numberOfSlotsPerMeasure;
        const midPoint = Math.floor(slotsPerMeasure / 2);

        for (let m = 0; m < numMeasures; m++) {
            const measureStart = m * slotsPerMeasure;

            // Focus 1: Downbeat (target = measureStart)
            const windowBeat = {
                start: measureStart - 2,
                end: measureStart + Math.floor(slotsPerMeasure / 4) // Focus first quarter
            };
            const resultBeat = findBestSlot(rankedArray, measureStart, windowBeat, totalNotesThreshold);
            if (resultBeat.index !== -1) {
                focusSlotToMeasure.set(resultBeat.index, m);
            }

            // Focus 2: Backbeat / Midpoint (for 'weighted' only)
            if (rule === 'weighted') {
                const backbeatTarget = measureStart + midPoint;
                const windowBack = {
                    start: backbeatTarget - 2,
                    end: backbeatTarget + Math.floor(slotsPerMeasure / 4)
                };
                const resultBack = findBestSlot(rankedArray, backbeatTarget, windowBack, totalNotesThreshold);
                if (resultBack.index !== -1) {
                    focusSlotToMeasure.set(resultBack.index, m);
                }
            }
        }
    }

    for (let i = 0; i < generatedMelody.length; i++) {
        const slot = allSlots.find(s => s.index === i);

        // Special handling for 'progression': force slot 0 even if priority null (already handled by creating activeIndices)
        // Check if this slot is in activeIndices
        let isActive = slot && slot.priority !== null;
        if (rule === 'progression') {
            isActive = activeIndices.includes(i);
        }

        if (!isActive) {
            generatedMelody[i] = null;
            continue;
        }

        const measureIdx = Math.floor(i / numberOfSlotsPerMeasure);
        const isFocusSlot = focusSlotToMeasure.has(i);
        const focusMeasureIdx = isFocusSlot ? focusSlotToMeasure.get(i) : measureIdx;

        const chord = getActiveChord(focusMeasureIdx, randomizationNotes, i);
        const isFirstActiveThisMeasure = !measureHasNote[measureIdx];
        measureHasNote[measureIdx] = true;

        const source = (typeof randomizationNotes === 'string') ? (randomizationNotes || 'scale').toLowerCase() : 'custom_pool';

        // Handle Chord Objects passed as randomizationNotes
        let isChordPool = Array.isArray(randomizationNotes) && typeof randomizationNotes[0] === 'object';
        let pool = isChordPool ? randomizationNotes : getPool(source, chord);

        if (!pool.length) { generatedMelody[i] = null; continue; }

        let selectedNote = null;

        if (source === 'metronome') {
            // ... existing metronome logic
            if (slot.priority === 'top') {
                selectedNote = 'wh';
            } else if (slot.priority === 'high') {
                selectedNote = 'wm';
            } else {
                selectedNote = 'wl';
            }
        }
        else if (rule === 'progression') {
            // Backward Planning
            // pool is Array of Chords
            // activeIndices contains all slot indices
            // Find current slot's position in activeIndices
            const currentActiveIndex = activeIndices.indexOf(i);
            const totalActive = activeIndices.length;
            const poolLen = pool.length;

            // Algorithm: Last active slot gets Last pool item.
            // dist from end = totalActive - 1 - currentActiveIndex
            // poolIndex = (poolLen - 1 - (dist % poolLen)) % poolLen

            const dist = totalActive - 1 - currentActiveIndex;
            const poolIndex = (poolLen - 1 - (dist % poolLen)) % poolLen;

            selectedNote = pool[poolIndex];
        }
        else if (source === 'kick_snare' || source === 'claves' || source === 'all') {
            selectedNote = pickRandom(pool);
        }
        else if (rule === 'uniform') {
            selectedNote = pickRandom(pool);
        }
        else if (rule === 'emphasize_roots') {
            const roots = getRootNotesInRange(chord);

            if ((isFocusSlot || isFirstActiveThisMeasure) && roots.length > 0) {
                selectedNote = pickRandom(roots);
            } else {
                selectedNote = pickRandom(pool);
            }
        }
        else if (rule === 'weighted') {
            const lowerSource = getLesserOrderSource(source);
            const lowerPool = getPool(lowerSource, chord);

            if (isFocusSlot) {
                // Primary Beat/Backbeat always uses more stable pool
                selectedNote = lowerPool.length > 0 ? pickRandom(lowerPool) : pickRandom(pool);
            } else {
                // Secondary slots: 75/25 distribution
                const roll = Math.random();
                if (roll < 0.25 && lowerPool.length > 0) {
                    selectedNote = pickRandom(lowerPool);
                } else {
                    selectedNote = pickRandom(pool);
                }
            }
        }
        else if (rule === 'arp' || rule === 'arp_up' || rule === 'arp_down') {
            const sortedPool = pool.map(n => ({ note: n, val: getNoteValue(n) }))
                .sort((a, b) => a.val - b.val)
                .map(x => x.note);
            const len = sortedPool.length;
            if (!len) { generatedMelody[i] = null; continue; }

            if (isFirstActiveThisMeasure) arpPhaseOffset = Math.random() < 0.5 ? 0 : len - 1;

            let idx;
            if (rule === 'arp_up') idx = seqIdx % len;
            else if (rule === 'arp_down') idx = (len - 1 - (seqIdx % len)) % len;
            else {
                const cycle = (len - 1) * 2 || 1;
                const pos = (seqIdx + arpPhaseOffset) % cycle;
                idx = pos < len ? pos : cycle - pos;
            }
            selectedNote = sortedPool[idx];
            seqIdx++;
        }

        if (!selectedNote && pool.length > 0) selectedNote = pickRandom(pool);
        if (!selectedNote && scale.length > 0) selectedNote = pickRandom(scale); // Hard fallback to scale
        generatedMelody[i] = selectedNote;

        // Assign Volume based on priority
        if (selectedNote !== null) {
            if (slot.priority === 'top' || slot.priority === 'high') {
                generatedVolumes[i] = 0.9;
            } else {
                generatedVolumes[i] = 0.65;
            }
        }
    }

    // Safety Check: If we generated absolute silence for an active progression, force at least one note.
    const hasValidNote = generatedMelody.some(n => n !== null && n !== 'r');
    if (!hasValidNote && activeSlotsSet.size > 0 && scale.length > 0) {
        logger.warn('convertRankedArrayToMelody', 'Melody generated absolute silence despite active slots. Forcing fallback note.');
        const firstActiveSlot = Array.from(activeSlotsSet)[0];
        generatedMelody[firstActiveSlot] = scale[0];
        generatedVolumes[firstActiveSlot] = 0.9;
    }

    const notesPlaced = generatedMelody.filter(n => n !== null && n !== 'r').length;
    logger.debug('convertRanked', 'done', {
        notesPlaced, totalSlots: generatedMelody.length,
        sample: generatedMelody.slice(0, 8).map(n => n ?? '·'),
    });

    return { melody: generatedMelody, volumes: generatedVolumes };
};

export default convertRankedArrayToMelody;
