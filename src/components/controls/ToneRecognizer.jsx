import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import usePitchDetector from '../../hooks/usePitchDetector';
import PianoView from './PianoView';
import { findChordDefinition, normalizeIntervals } from '../../theory/chordDefinitions';

import { PC_NAMES } from '../../theory/noteUtils';
import './styles/ToneRecognizer.css';

// Given a sorted list of active pitch classes and a root pc, compute intervals 0..11
function pitchClassesToIntervals(activePCs, rootPc) {
    const intervals = activePCs.map(pc => ((pc - rootPc + 12) % 12)).sort((a, b) => a - b);
    return intervals; // includes 0 (root)
}

// Try each active pitch class as root; pick the one that produces a recognized chord
function recognizeChordFromPCs(activePCs) {
    if (activePCs.length < 2) return null;
    const sorted = [...activePCs].sort((a, b) => a - b);

    let best = null;
    for (const rootPc of sorted) {
        const intervals = pitchClassesToIntervals(sorted, rootPc);
        // normalizeIntervals deduplicates and sorts — gives e.g. [0,4,7] for major triad
        const normalized = normalizeIntervals(intervals);
        const def = findChordDefinition(normalized, null);
        if (def && def.name !== 'TBD') {
            // Prefer exact matches over exotic fallbacks
            if (!best || (def.notation !== 'TBD' && (!best.found || best.def.name === 'TBD'))) {
                best = { def, rootPc, found: true };
            }
        }
        // Even if not recognized, keep first attempt as fallback
        if (!best) {
            best = { def: null, rootPc, found: false };
        }
    }
    return best;
}

// Format chord label from recognition result
function formatChordLabel(result, activePCs) {
    if (!result || !result.def) {
        // Just show pitch classes as individual notes
        return activePCs.length > 0 ? activePCs.map(pc => PC_NAMES[pc]).join('-') : null;
    }
    const root = PC_NAMES[result.rootPc];
    const suffix = result.def.notation ?? '';
    return `${root}${suffix}`;
}

// Determine piano range based on selected source
const SOURCE_RANGES = {
    piano: { min: 'A1', max: 'C8' },
    guitar: { min: 'E2', max: 'E6' },
    voice: { min: 'C2', max: 'C6' },
};

// Convert a note name + octave to the string PianoView expects  (e.g. 'A', 4 → 'A♭4')
// activePitchClasses is a list of semitone indices 0-11
// Active note for PianoView: the detected note + octave or null
function noteToString(noteInfo) {
    if (!noteInfo) return null;
    return `${noteInfo.name}${noteInfo.octave}`;
}

// ─────────────────────────────────────────────────────────────────────────────

const ToneRecognizer = ({ context, scale, noteColoringMode, onNoteInput, inputTestSubMode, activeTab }) => {
    const [detectionMode, setDetectionMode] = useState('note'); // 'note' | 'chord'
    const [source, setSource] = useState('piano'); // 'piano' | 'guitar' | 'voice'

    const {
        isListening,
        detectedNote,
        detectedHz,
        centsOff,
        activePitchClasses,
        error,
        startListening,
        stopListening,
    } = usePitchDetector(context, detectionMode);

    const handleToggleListen = useCallback(async () => {
        if (isListening) {
            stopListening();
        } else {
            await startListening();
        }
    }, [isListening, startListening, stopListening]);

    // Auto-start listening if in inputTestSubMode === 'live'
    useEffect(() => {
        if (inputTestSubMode === 'live' && !isListening && !error) {
            startListening();
        }
    }, [inputTestSubMode, isListening, startListening, error]);

    // Feed mic-detected notes into input test (onNoteInput).
    // We track the last sent note string to avoid flooding handleInputTestNote
    // at 60fps — we send once when the note first appears, then once more
    // (to satisfy the 250ms stability check) when it's confirmed.
    const lastMicNoteRef = React.useRef(null);
    const micFireCountRef = React.useRef(0);
    React.useEffect(() => {
        if (!onNoteInput || !isListening || detectionMode !== 'note') return;
        if (!detectedNote) {
            // Silence — reset tracking
            lastMicNoteRef.current = null;
            micFireCountRef.current = 0;
            return;
        }
        const noteStr = `${detectedNote.name}${detectedNote.octave}`;
        if (noteStr !== lastMicNoteRef.current) {
            // New note appeared — reset and send first ping
            lastMicNoteRef.current = noteStr;
            micFireCountRef.current = 1;
            onNoteInput(noteStr);
        } else if (micFireCountRef.current === 1) {
            // Same note still being held — send second ping to satisfy the stability check
            micFireCountRef.current = 2;
            onNoteInput(noteStr);
        }
        // After 2 pings we stop until the note changes
    }, [detectedNote, isListening, detectionMode, onNoteInput]);

    // Chord recognition from pitch classes
    const chordInfo = useMemo(() => {
        if (detectionMode !== 'chord' || activePitchClasses.length < 2) return null;
        return recognizeChordFromPCs(activePitchClasses);
    }, [detectionMode, activePitchClasses]);

    // Active note string for PianoView (single note mode)
    const activeNoteStr = detectionMode === 'note' ? noteToString(detectedNote) : null;

    const range = SOURCE_RANGES[source];

    // Cents bar: +50 = sharp (right), -50 = flat (left). Bar width 200px, center = 100px.
    const centsFrac = (centsOff + 50) / 100; // 0…1

    // Chord label from recognition result
    const chordLabel = useMemo(() => {
        if (detectionMode !== 'chord') return null;
        if (activePitchClasses.length === 1) return PC_NAMES[activePitchClasses[0]];
        return formatChordLabel(chordInfo, activePitchClasses);
    }, [detectionMode, chordInfo, activePitchClasses]);

    return (
        <div className="tr-root">
            {/* ── TOP CONTROLS ────────────────────────────────────────────── */}
            <div className="tr-controls">
                {/* Start/Stop button */}
                <button
                    onClick={handleToggleListen}
                    className={`tr-listen-btn${isListening ? ' active' : ''}`}
                >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                    {isListening ? 'STOP' : 'LISTEN'}
                </button>

                {/* Mode toggle: Note / Chord */}
                <div className="tr-toggle-group">
                    {['note', 'chord'].map(m => (
                        <button
                            key={m}
                            onClick={() => setDetectionMode(m)}
                            className={`tr-mode-btn${detectionMode === m ? ' active' : ''}`}
                        >
                            {m === 'note' ? 'NOTE' : 'CHORD'}
                        </button>
                    ))}
                </div>

                {/* Source selector */}
                <div className="tr-toggle-group">
                    {['piano', 'guitar', 'voice'].map(s => (
                        <button
                            key={s}
                            onClick={() => setSource(s)}
                            className={`tr-source-btn${source === s ? ' active' : ''}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── ERROR ────────────────────────────────────────────────────── */}
            {error && <div className="tr-error">{error}</div>}

            {/* ── RESULT DISPLAY ──────────────────────────────────────────── */}
            <div className="tr-result">
                {/* Big note / chord name */}
                {isListening ? (
                    <>
                        {detectionMode === 'note' ? (
                            detectedNote ? (
                                <div className="tr-note-row">
                                    <span className="tr-note-name">{detectedNote.name}</span>
                                    <sub className="tr-note-oct">{detectedNote.octave}</sub>
                                    <span className="tr-note-hz">{detectedHz} Hz</span>
                                </div>
                            ) : (
                                <span className="tr-listening">— listening —</span>
                            )
                        ) : (
                            // Chord mode
                            chordLabel ? (
                                <div className="tr-chord-col">
                                    <span className="tr-chord-name">{chordLabel}</span>
                                    {activePitchClasses.length > 0 && (
                                        <span className="tr-chord-pcs">
                                            {activePitchClasses.map(pc => PC_NAMES[pc]).join(' · ')}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <span className="tr-listening">— listening —</span>
                            )
                        )}

                        {/* Cents bar (note mode only) */}
                        {detectionMode === 'note' && detectedNote && (
                            <div className="tr-cents-row">
                                <span className="tr-cents-label tr-cents-label-right">FLAT</span>
                                <div className="tr-cents-track">
                                    <div className="tr-cents-center" />
                                    <div
                                        className="tr-cents-needle"
                                        style={{
                                            left: `${centsFrac * 100}%`,
                                            background: Math.abs(centsOff) < 10
                                                ? '#2ecc71'
                                                : Math.abs(centsOff) < 25
                                                    ? 'var(--accent-yellow)'
                                                    : '#e74c3c',
                                        }}
                                    />
                                </div>
                                <span className="tr-cents-label">SHARP</span>
                                <span className="tr-cents-value">
                                    {centsOff > 0 ? `+${centsOff}` : centsOff}¢
                                </span>
                            </div>
                        )}
                    </>
                ) : (
                    <span className="tr-idle">Press LISTEN to start microphone</span>
                )}
            </div>

            {/* ── PIANO VIEW ──────────────────────────────────────────────── */}
            <div className="tr-piano">
                <PianoView
                    scale={scale}
                    trebleInstrument={null}
                    minNote={range.min}
                    maxNote={range.max}
                    noteColoringMode={noteColoringMode}
                    activeNote={activeNoteStr}
                    activePitchClasses={detectionMode === 'chord' ? activePitchClasses : null}
                    onNoteInput={onNoteInput}
                    isHighlightActive={true}
                />
            </div>
        </div>
    );
};

export default ToneRecognizer;
