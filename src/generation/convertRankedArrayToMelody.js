import generateAllNotesArray from '../theory/allNotesArray';
import { getRelativeNoteName } from '../theory/convertToDisplayNotes';
import { getNoteSemitone } from '../theory/noteUtils';
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
    runId = 'unknown',
    randomizationRule = 'uniform',
    smallestNoteDenom = 4,
    timeSignature = null    // [numerator, denominator] — needed for offset-based chord lookup
) => {
    // =========================================================================
    // 0. PREPARE NOTE POOL
    // =========================================================================
    const percussionIDs = ['k', 's', 'sg', 'sr', 'hh', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc', 'wh', 'wl'];
    const fullAvailablePool = (() => {
        const allNotes = generateAllNotesArray();
        if (!range) return [...allNotes, ...percussionIDs];

        const findNoteIdx = (note) => allNotes.findIndex(n => n === (note?.replace(/#/g, '♯').replace(/b/g, '♭') || ''));
        let startIdx = findNoteIdx(range.min), endIdx = findNoteIdx(range.max);
        if (startIdx === -1) startIdx = 0;
        if (endIdx === -1) endIdx = allNotes.length - 1;

        const rangedNotes = allNotes.slice(startIdx, endIdx + 1).map(n => getRelativeNoteName(n, tonic));
        return [...rangedNotes, ...percussionIDs];
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

    const getNoteValue = (note) => {
        if (!note) return -1;
        if (percussionIDs.includes(note)) return 0;
        if (typeof note !== 'string') return -1;
        const match = note.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
        if (!match) return -1;
        const oct = parseInt(match[2], 10);
        return oct * 12 + getNoteSemitone(match[1]);
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
        if (s === 'claves') return ['wh', 'wl'];
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

    // =========================================================================
    // 3. MELODY GENERATION
    // =========================================================================
    let measureHasNote = Array(numMeasures).fill(false);
    let seqIdx = 0, arpPhaseOffset = 0;
    const generatedVolumes = new Array(generatedMelody.length).fill(null);

    // Pre-calculate active slots for 'progression' rule
    const rule = (randomizationRule || 'uniform').toLowerCase();

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
        console.warn(`[Generation] Melody generated absolute silence despite active slots. Forcing fallback note.`);
        const firstActiveSlot = Array.from(activeSlotsSet)[0];
        generatedMelody[firstActiveSlot] = scale[0];
        generatedVolumes[firstActiveSlot] = 0.9;
    }

    return { melody: generatedMelody, volumes: generatedVolumes };
};

export default convertRankedArrayToMelody;
