import { useState, useRef, useEffect, useCallback } from 'react';
import { getCanonicalNote, normalizeNoteChars } from '../theory/noteUtils';

/**
 * useInputTest — manages all Input Test Mode state and logic.
 *
 * Dependencies injected from App:
 *   - sequencerRef, melodiesRef, chordProgressionRef, tsRef  (refs)
 *   - context                                                 (AudioContext)
 *   - isPlayingContinuously, handleStopAllPlayback,
 *     handlePlayContinuously                                  (playback)
 *   - randomizeAll, playbackConfig                            (generation)
 *   - activeTab, activeClef                                   (UI state)
 */
const useInputTest = ({
    sequencerRef,
    melodiesRef,
    chordProgressionRef,
    tsRef,
    context,
    isPlayingContinuously,
    randomizeAll,
    playbackConfig,
    activeTab,
    activeClef,
    onNoteCorrect,  // optional: (note, durationTicks) => void — schedule stop after note duration
    onNoteWrong,    // optional: (note) => void — stop note immediately on wrong tap
}) => {
    // ── State ────────────────────────────────────────────────────────────────
    const [isInputTestMode, setIsInputTestMode] = useState(false);
    const [inputTestState, setInputTestState] = useState({
        activeIndex: -1, status: 'waiting', activeStaff: 'treble', chordHits: [],
    });
    // 'none' | 'note' | 'live'
    const [inputTestSubMode, setInputTestSubMode] = useState('none');

    // ── Refs (for use inside callbacks/rAF without stale closures) ───────────
    const isInputTestModeRef = useRef(false);
    const inputTestStateRef = useRef(inputTestState);
    const inputTestSubModeRef = useRef('none');
    const liveTrackerRafRef = useRef(null);
    const stabilityTimerRef = useRef(null);
    const lastInputNoteRef = useRef(null);
    const isTapRef = useRef(false);
    const errorTimeoutRef = useRef(null);

    useEffect(() => { isInputTestModeRef.current = isInputTestMode; }, [isInputTestMode]);
    useEffect(() => { inputTestStateRef.current = inputTestState; }, [inputTestState]);
    useEffect(() => { inputTestSubModeRef.current = inputTestSubMode; }, [inputTestSubMode]);

    // ── Live tracker rAF loop ────────────────────────────────────────────────
    useEffect(() => {
        if (!isInputTestMode || inputTestSubMode !== 'live' || !isPlayingContinuously || !context) {
            if (liveTrackerRafRef.current) {
                cancelAnimationFrame(liveTrackerRafRef.current);
                liveTrackerRafRef.current = null;
            }
            return;
        }

        let lastTrackedIndex = -1;

        const liveTick = () => {
            liveTrackerRafRef.current = requestAnimationFrame(liveTick);

            const notes = sequencerRef.current?.scheduledNotes;
            if (!notes || notes.length === 0) return;

            const state = inputTestStateRef.current;
            if (!state || state.activeIndex === -1) return;

            const targetStaff = state.activeStaff || 'treble';
            const melody = melodiesRef.current?.[targetStaff];
            if (!melody?.notes || !melody?.offsets) return;

            const now = context.currentTime;

            // Find the scheduled note currently sounding on the target staff
            let currentLocalSlot = null;
            let currentMeasureIndex = null;
            for (const n of notes) {
                if (n.mel !== targetStaff) continue;
                if (now >= n.audioTime && now < n.audioTime + n.duration) {
                    currentLocalSlot = n.localSlot;
                    currentMeasureIndex = n.measureIndex;
                    break;
                }
            }

            if (currentLocalSlot == null) return;

            // Compute measureLengthTicks — prefer live playbackState, fallback to tsRef
            const measureLengthTicks = sequencerRef.current?.playbackState?.measureLengthTicks
                ?? ((48 * (tsRef.current?.[0] ?? 4)) / (tsRef.current?.[1] ?? 4));

            // Map globalMeasureIndex → local measure index (wraps after numMeasures)
            const maxOffset = melody.offsets.reduce((a, b) => Math.max(a, b ?? 0), 0);
            const numMeasures = Math.ceil((maxOffset + 1) / measureLengthTicks);
            const localMeasure = currentMeasureIndex % Math.max(1, numMeasures);
            const targetAbsoluteOffset = localMeasure * measureLengthTicks + currentLocalSlot;

            const ties = melody.ties || [];
            let matchIdx = -1;

            // Primary: exact absolute offset match
            for (let i = 0; i < melody.notes.length; i++) {
                const offset = melody.offsets[i];
                if (offset === null) continue;
                if (offset !== targetAbsoluteOffset) continue;
                const n = melody.notes[i];
                if (!n || n === 'r') continue;
                if (i > 0 && ties[i - 1] === 'tie') continue;
                matchIdx = i;
                break;
            }

            // Fallback: match by localSlot (offset within measure)
            if (matchIdx === -1) {
                for (let i = 0; i < melody.notes.length; i++) {
                    const offset = melody.offsets[i];
                    if (offset === null) continue;
                    if (offset % measureLengthTicks !== currentLocalSlot) continue;
                    const n = melody.notes[i];
                    if (!n || n === 'r') continue;
                    if (i > 0 && ties[i - 1] === 'tie') continue;
                    matchIdx = i;
                }
            }

            if (matchIdx !== -1 && matchIdx !== lastTrackedIndex) {
                lastTrackedIndex = matchIdx;
                setInputTestState(prev => {
                    if (prev.activeIndex === matchIdx) return prev;
                    return { ...prev, activeIndex: matchIdx, status: 'waiting', chordHits: [], wrongNote: null };
                });
            }
        };

        liveTrackerRafRef.current = requestAnimationFrame(liveTick);
        return () => {
            if (liveTrackerRafRef.current) {
                cancelAnimationFrame(liveTrackerRafRef.current);
                liveTrackerRafRef.current = null;
            }
        };
    }, [isInputTestMode, inputTestSubMode, isPlayingContinuously, context]);

    // ── Toggle ───────────────────────────────────────────────────────────────
    const handleToggleInputTest = useCallback(() => {
        if (isInputTestMode) {
            setIsInputTestMode(false);
            setInputTestState({ activeIndex: -1, status: 'waiting', activeStaff: 'treble', chordHits: [], successes: [], score: 0, correctNotes: 0, totalNotes: 0 });
        } else {
            setIsInputTestMode(true);
            const currentMelodies = melodiesRef.current;
            const currentChords = chordProgressionRef.current;

            let targetStaff = 'treble';
            if (activeTab === 'piano' || activeTab === 'guitar') targetStaff = activeClef;
            else if (activeTab === 'percussion') targetStaff = 'percussion';
            else if (activeTab === 'chords' || activeTab === 'generator') targetStaff = 'chords';

            let firstValidIdx = -1;
            if (targetStaff === 'chords') {
                const progression = currentChords || [];
                firstValidIdx = progression.findIndex(c => c && c.chord && c.chord.notes && c.chord.notes.length > 0);
            } else {
                const notes = currentMelodies?.[targetStaff]?.notes || [];
                const ties = currentMelodies?.[targetStaff]?.ties || [];
                firstValidIdx = notes.findIndex((n, i) => n && n !== 'r' && (i === 0 || ties[i - 1] !== 'tie'));
            }

            setInputTestState({ activeIndex: firstValidIdx !== -1 ? firstValidIdx : -1, status: 'waiting', activeStaff: targetStaff, chordHits: [], successes: [], score: 0, correctNotes: 0, totalNotes: 0 });
        }
    }, [isInputTestMode, activeTab, activeClef]);

    // ── Note evaluation ──────────────────────────────────────────────────────
    // Canonicalize a note (any spelling, ASCII or Unicode) to the form used by
    // allNotesArray (D♭, E♭, F♯, A♭, B♭). normalizeNoteChars first promotes ASCII
    // accidentals to Unicode, then getCanonicalNote applies CANONICAL_MAP.
    const getCan = useCallback((n) => getCanonicalNote(normalizeNoteChars(n)), []);

    const handleInputTestNoteCore = useCallback((playedNote, isTap = false) => {
        if (!isInputTestModeRef.current || inputTestStateRef.current.activeIndex === -1) return;
        const currentStatus = inputTestStateRef.current.status;
        if (currentStatus !== 'waiting' && currentStatus !== 'error') return;

        const currentState = inputTestStateRef.current;
        const activeStaff = currentState.activeStaff || 'treble';

        const advanceToNext = (isSuccess, addedScore = 0, addedCorrect = 0, addedTotal = 0) => {
            const nextSuccesses = isSuccess ? [...(currentState.successes || []), currentState.activeIndex] : (currentState.successes || []);

            if (isSuccess) {
                const recordedIdx = currentState.activeIndex;
                setTimeout(() => {
                    if (!isInputTestModeRef.current) return;
                    setInputTestState(prev => {
                        if (!prev.successes?.includes(recordedIdx)) return prev;
                        return { ...prev, successes: prev.successes.filter(idx => idx !== recordedIdx) };
                    });
                }, 1000);
            }

            let nextIdx = -1;
            if (activeStaff === 'chords') {
                const progression = chordProgressionRef.current || [];
                for (let i = currentState.activeIndex + 1; i < progression.length; i++) {
                    const c = progression[i];
                    if (c && c.chord && c.chord.notes && c.chord.notes.length > 0) { nextIdx = i; break; }
                }
            } else {
                const targetMelody = melodiesRef.current?.[activeStaff]?.notes || [];
                const ties = melodiesRef.current?.[activeStaff]?.ties || [];
                for (let i = currentState.activeIndex + 1; i < targetMelody.length; i++) {
                    const n = targetMelody[i];
                    if (n && n !== 'r' && ties[i - 1] !== 'tie') { nextIdx = i; break; }
                }
            }

            if (nextIdx !== -1) {
                setInputTestState(prev => ({
                    ...prev,
                    activeIndex: nextIdx,
                    status: 'waiting',
                    activeStaff,
                    chordHits: [],
                    successes: nextSuccesses,
                    score: prev.score + addedScore,
                    correctNotes: prev.correctNotes + addedCorrect,
                    totalNotes: prev.totalNotes + addedTotal,
                }));
            } else {
                const regenerated = randomizeAll(playbackConfig.randomize);
                let firstIdx = -1;
                if (activeStaff === 'chords') {
                    const prog = regenerated?.chordProgression || [];
                    firstIdx = prog.findIndex(c => c && c.chord && c.chord.notes && c.chord.notes.length > 0);
                } else {
                    const newNotes = regenerated?.[activeStaff]?.notes || [];
                    const newTies = regenerated?.[activeStaff]?.ties || [];
                    firstIdx = newNotes.findIndex((n, i) => n && n !== 'r' && (i === 0 || newTies[i - 1] !== 'tie'));
                }
                setInputTestState(prev => ({
                    ...prev,
                    activeIndex: firstIdx !== -1 ? firstIdx : -1,
                    status: 'waiting',
                    activeStaff,
                    chordHits: [],
                    successes: [],
                    score: prev.score + addedScore,
                    correctNotes: prev.correctNotes + addedCorrect,
                    totalNotes: prev.totalNotes + addedTotal,
                }));
            }
        };

        const triggerError = (errorNote) => {
            if (isTap && onNoteWrong && errorNote) onNoteWrong(errorNote);
            setInputTestState(prev => ({ ...prev, status: 'error', score: prev.score - 1, totalNotes: prev.totalNotes + 1, chordHits: [], wrongNote: errorNote || null }));
            clearTimeout(errorTimeoutRef.current);
            errorTimeoutRef.current = setTimeout(() => {
                if (!isInputTestModeRef.current) return;
                if (inputTestStateRef.current.activeIndex === currentState.activeIndex && inputTestStateRef.current.status === 'error') {
                    setInputTestState(prev => ({ ...prev, status: 'waiting' }));
                }
            }, 1000);
        };

        // During error state, only accept the correct note to recover — wrong notes are ignored
        if (currentStatus === 'error') {
            const targetMelody = melodiesRef.current?.[activeStaff]?.notes;
            const targetNoteRaw = targetMelody?.[currentState.activeIndex];
            const playedCan = getCan(playedNote);
            const isCorrect = targetNoteRaw && (
                Array.isArray(targetNoteRaw)
                    ? targetNoteRaw.map(getCan).includes(playedCan)
                    : getCan(targetNoteRaw) === playedCan
            );
            if (!isCorrect) return;
            clearTimeout(errorTimeoutRef.current);
            if (isTap && onNoteCorrect) {
                const dur = melodiesRef.current?.[activeStaff]?.durations?.[currentState.activeIndex];
                onNoteCorrect(playedNote, dur || 12);
            }
            advanceToNext(true, 0, 0, 0); // no extra score — already penalised
            return;
        }

        // Helper: register a hit in a multi-note chord target (melody array or chord-staff)
        const registerChordHit = (targetNotes, dur) => {
            const playedCan = getCan(playedNote);
            if (!targetNotes.includes(playedCan)) return; // wrong note — ignore silently
            const newHits = [...(currentState.chordHits || [])];
            if (newHits.includes(playedCan)) return; // already hit this note
            newHits.push(playedCan);
            if (isTap && onNoteCorrect) onNoteCorrect(playedNote, dur || 12);
            if (newHits.length >= targetNotes.length) {
                advanceToNext(true, 1, 1, 1);
            } else {
                setInputTestState(prev => ({
                    ...prev, chordHits: newHits,
                    score: prev.score + 1, correctNotes: prev.correctNotes + 1, totalNotes: prev.totalNotes + 1,
                }));
            }
        };

        if (activeStaff === 'chords') {
            const targetChord = chordProgressionRef.current?.[currentState.activeIndex]?.chord;
            if (!targetChord || !targetChord.notes) return;
            registerChordHit(targetChord.notes.map(getCan), 12);
        } else {
            const targetMelody = melodiesRef.current?.[activeStaff]?.notes;
            if (!targetMelody) return;
            const targetNoteRaw = targetMelody[currentState.activeIndex];
            if (!targetNoteRaw) return;

            if (activeStaff === 'percussion') {
                if (playedNote === targetNoteRaw) advanceToNext(true, 1, 1, 1);
                else triggerError(playedNote);
            } else {
                if (Array.isArray(targetNoteRaw)) {
                    const dur = melodiesRef.current?.[activeStaff]?.durations?.[currentState.activeIndex];
                    registerChordHit(targetNoteRaw.map(getCan), dur);
                } else if (getCan(playedNote) === getCan(targetNoteRaw)) {
                    if (isTap && onNoteCorrect) {
                        const dur = melodiesRef.current?.[activeStaff]?.durations?.[currentState.activeIndex];
                        onNoteCorrect(playedNote, dur || 12);
                    }
                    advanceToNext(true, 1, 1, 1);
                } else {
                    triggerError(playedNote);
                }
            }
        }
    }, [randomizeAll, playbackConfig.randomize, getCan]);

    const handleInputTestNote = useCallback((playedNote, isTap = false) => {
        const st = inputTestStateRef.current.status;
        if (!isInputTestModeRef.current || (st !== 'waiting' && st !== 'error') || inputTestStateRef.current.activeIndex === -1) return;
        if (inputTestSubModeRef.current === 'none') return;

        // For chord targets (multi-note), bypass stability timer — each note must register immediately
        const currentState = inputTestStateRef.current;
        const activeStaff = currentState.activeStaff || 'treble';
        const isChordTarget = activeStaff === 'chords' ||
            Array.isArray(melodiesRef.current?.[activeStaff]?.notes?.[currentState.activeIndex]);

        if (isChordTarget) {
            handleInputTestNoteCore(playedNote, isTap);
            return;
        }

        if (lastInputNoteRef.current !== playedNote) {
            lastInputNoteRef.current = playedNote;
            isTapRef.current = isTap;
            clearTimeout(stabilityTimerRef.current);
            stabilityTimerRef.current = setTimeout(() => {
                lastInputNoteRef.current = null;
                handleInputTestNoteCore(playedNote, isTapRef.current);
            }, 250);
            return;
        }

        clearTimeout(stabilityTimerRef.current);
        lastInputNoteRef.current = null;
        handleInputTestNoteCore(playedNote, isTap);
    }, [handleInputTestNoteCore]);

    return {
        isInputTestMode, setIsInputTestMode,
        inputTestState, setInputTestState,
        inputTestSubMode, setInputTestSubMode,
        isInputTestModeRef, inputTestStateRef, inputTestSubModeRef,
        handleToggleInputTest,
        handleInputTestNote,
    };
};

export default useInputTest;
