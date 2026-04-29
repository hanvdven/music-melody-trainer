import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import './styles/ChordGrid.css';
import { generateAllScaleChords } from '../../theory/chordGenerator';
import { ChordNotationIcon } from '../common/CustomIcons';
import { resolveNotePitch } from '../../audio/playSound';
import { getNoteIndex } from '../../theory/musicUtils';
import generateAllNotesArray from '../../theory/allNotesArray';

const ALL_NOTES_ARR = generateAllNotesArray();
const stripOct = (s) => s ? String(s).replace(/\d+$/, '') : '?';

// ── Grid layout ───────────────────────────────────────────────────────────────
const GRID = [
    [3, 6, 2, 5, 1, 4, 7],
    [1, 4, 7, 3, 6, 2, 5],
    [6, 2, 5, 1, 4, 7, 3],
    [4, 7, 3, 6, 2, 5, 1],
    [2, 5, 1, 4, 7, 3, 6],
];

// Color band 1 = pink (tonic area), 5 = dark pink, 2–4 gradient in between
const COLOR_BAND = [
    [3, 5, 5, 5, 5, 5, 5],
    [2, 2, 2, 2, 4, 4, 4],
    [1, 1, 1, 1, 1, 1, 1],
    [4, 4, 4, 2, 2, 2, 2],
    [5, 5, 5, 5, 5, 5, 3],
];

// ── Normal-mode sizes (buttons a bit bigger) ──────────────────────────────────
const CELL = 60;
const GAP = 5;
const GRID_W = 7 * CELL + 6 * GAP;   // 450
const GRID_H = 5 * CELL + 4 * GAP;   // 320

// ── Advanced-mode sizes ───────────────────────────────────────────────────────
// Horizontal: 7 between-cols (one left of every main col) + 7 main cols
const BETWEEN_W = 52;   // width of each between-col
const ADV_GAP = 4;    // horizontal gap between any two adjacent elements
const ADV_SMALL_VGAP = 4;    // gap between top/bottom stacked cells in between-col
const ADV_SMALL_H = (CELL - ADV_SMALL_VGAP) / 2;  // 28 – each stacked cell height
// Step = distance from between-col bci left edge to between-col (bci+1) left edge
const ADV_STEP = BETWEEN_W + ADV_GAP + CELL + ADV_GAP;  // 120
const ADV_MAIN_OFFSET = BETWEEN_W + ADV_GAP;                   // 56 – main-col x offset

// Vertical: between-row slots (4 gaps between 5 rows)
const ADV_VGAP = 4;    // gap above / below between-row slot
const ADV_VROW_H = ADV_SMALL_H;   // 28 – between-row slot height
const ADV_VROW_STEP = CELL + ADV_VGAP + ADV_VROW_H + ADV_VGAP;  // 96

// Grid dimensions in advanced mode
const ADV_GRID_W = ADV_MAIN_OFFSET + 6 * ADV_STEP + CELL;  // 56+720+60 = 836
const ADV_GRID_H = 4 * ADV_VROW_STEP + CELL;               // 384+60 = 444

// ── Component ─────────────────────────────────────────────────────────────────
const ChordGrid = ({
    scale,
    chordProgression,
    chordDisplayMode,
    setChordDisplayMode,
    isPlaying = false,
    liveComplexity,
    context,
    sequencerRef,
}) => {
    const [stableScale, setStableScale] = useState(scale);
    useEffect(() => {
        if (!isPlaying) setStableScale(scale);
    }, [isPlaying, scale]);
    useEffect(() => {
        setStableScale(scale);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chordProgression]);

    const [stableComplexity, setStableComplexity] = useState(
        liveComplexity || chordProgression?.complexity || 'triad'
    );
    useEffect(() => {
        if (!isPlaying) setStableComplexity(liveComplexity || 'triad');
    }, [isPlaying, liveComplexity]);
    useEffect(() => {
        if (chordProgression?.complexity) setStableComplexity(chordProgression.complexity);
    }, [chordProgression]);

    const [advancedMode, setAdvancedMode] = useState(false);
    const [showDom, setShowDom] = useState(true);
    const [showDim, setShowDim] = useState(true);
    const [showTri, setShowTri] = useState(false);
    const [showDiatonicApproach, setShowDiatonicApproach] = useState(false);

    // ── One chord per scale degree (label + click) ────────────────────────────
    const scaleChords = useMemo(() => {
        if (!stableScale) return {};
        try {
            const all = generateAllScaleChords(stableScale, stableComplexity || 'triad');
            const map = {};
            all.forEach((ch, i) => { map[i + 1] = ch; });
            return map;
        } catch { return {}; }
    }, [stableScale, stableComplexity]);

    // ── Secondary chords: V7/x, vii°/x, bII7/x for each degree x ────────────
    const secondaryChords = useMemo(() => {
        if (!advancedMode) return {};
        // Use tonic root as anchor so notes stay in the same octave register
        const tonicNote = scaleChords[1]?.notes?.[0] ?? 'C4';
        const tonicIdx = getNoteIndex(tonicNote);

        const result = {};
        for (let d = 1; d <= 7; d++) {
            const ch = scaleChords[d];
            if (!ch?.notes?.length) continue;

            const rootIdx = getNoteIndex(ch.notes[0]);
            if (rootIdx === -1) continue;

            // Secondary dominant root: 7 semitones above d's root
            // Normalize to same octave as tonic so notes stay in treble range
            let dominantRoot = rootIdx + 7;
            while (dominantRoot >= tonicIdx + 12) dominantRoot -= 12;
            while (dominantRoot < tonicIdx) dominantRoot += 12;

            // Secondary diminished root: 1 semitone below d's root (leading tone)
            const diminishedRoot = rootIdx - 1;

            // Tritone substitution root: 1 semitone above d's root (bII of d)
            let tritoneRoot = rootIdx + 1;
            while (tritoneRoot >= tonicIdx + 12) tritoneRoot -= 12;
            while (tritoneRoot < tonicIdx) tritoneRoot += 12;

            const domNotes = [0, 4, 7, 10].map(s => ALL_NOTES_ARR[dominantRoot + s]).filter(Boolean);
            const dimNotes = [0, 3, 6].map(s => ALL_NOTES_ARR[diminishedRoot + s]).filter(Boolean);
            const triNotes = [0, 4, 7, 10].map(s => ALL_NOTES_ARR[tritoneRoot + s]).filter(Boolean);

            if (domNotes.length >= 3 && dimNotes.length >= 3) {
                result[d] = {
                    dominant: { notes: domNotes, rootName: stripOct(ALL_NOTES_ARR[dominantRoot]) },
                    diminished: { notes: dimNotes, rootName: stripOct(ALL_NOTES_ARR[diminishedRoot]) },
                    tritone: { notes: triNotes, rootName: stripOct(ALL_NOTES_ARR[tritoneRoot]) },
                };
            }
        }
        return result;
    }, [advancedMode, scaleChords]);

    // ── rAF: highlight main chord cells from AudioContext time ────────────────
    const containerRef = useRef(null);

    useEffect(() => {
        const clearHighlights = () => {
            containerRef.current?.querySelectorAll('[data-degree]').forEach(el => {
                el.classList.remove('chord-active', 'chord-next');
            });
        };
        if (!isPlaying || !context || !sequencerRef) { clearHighlights(); return; }

        let rafId, lastKey = '';
        const tick = () => {
            const scheduledChords = sequencerRef.current?.scheduledChords;
            const now = context.currentTime;
            const bpm = sequencerRef.current?.refs?.bpmRef?.current ?? 120;
            const q = 60 / bpm;

            let activeDeg = null, nextDeg = null, activeStart = null, activeDuration = 0;
            if (scheduledChords?.length) {
                const sorted = scheduledChords
                    .filter(c => c.degree != null)
                    .sort((a, b) => a.audioTime - b.audioTime);
                let activeEntry = null, nextEntry = null;
                for (let i = 0; i < sorted.length; i++) {
                    const c = sorted[i];
                    if (now >= c.audioTime && now < c.audioTime + c.duration) {
                        activeEntry = c;
                        for (let j = i + 1; j < sorted.length; j++) {
                            if (sorted[j].audioTime > c.audioTime) { nextEntry = sorted[j]; break; }
                        }
                        break;
                    }
                }
                if (activeEntry) {
                    activeDeg = activeEntry.degree;
                    activeStart = activeEntry.audioTime;
                    activeDuration = activeEntry.duration;
                    nextDeg = nextEntry?.degree ?? null;
                }
            }

            const elapsed = activeStart != null ? now - activeStart : 0;
            const showNextAt = Math.max(0.25 * q, activeDuration - 2 * q);
            const showNext = nextDeg !== null && elapsed >= showNextAt;
            const key = `${activeDeg}:${showNext ? nextDeg : null}`;

            if (key !== lastKey) {
                lastKey = key;
                const fadeIn = (0.25 * q).toFixed(3);
                const fadeNext = (0.50 * q).toFixed(3);
                containerRef.current?.querySelectorAll('[data-degree]').forEach(el => {
                    const deg = parseInt(el.dataset.degree, 10);
                    const isActive = activeDeg !== null && deg === activeDeg;
                    const isNext = !isActive && showNext && nextDeg !== null && deg === nextDeg;
                    el.style.transition = `background ${isNext ? fadeNext : fadeIn}s ease`;
                    el.classList.toggle('chord-active', isActive);
                    el.classList.toggle('chord-next', isNext);
                });
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(rafId); clearHighlights(); };
    }, [isPlaying, context, sequencerRef]);

    // ── Click handlers ────────────────────────────────────────────────────────
    const playNotes = useCallback(async (notes) => {
        if (!context || !sequencerRef?.current || !notes?.length) return;
        if (context.state !== 'running') await context.resume();
        const seq = sequencerRef.current;
        const inst = seq.instruments?.chords;
        if (!inst) return;
        const now = context.currentTime;
        const gain = seq.refs?.playbackConfigRef?.current?.chords ?? 0.8;
        const strum = seq.refs?.instrumentSettingsRef?.current?.chords?.strummingEnabled ?? true;
        notes.forEach((noteStr, idx) => {
            const pitch = resolveNotePitch(noteStr, null);
            if (pitch == null) return;
            inst.start({ note: pitch, time: now + (strum ? idx * 0.02 : 0), duration: 2.0, gain, velocity: Math.floor(gain * 127) });
        });
        // Also play root in bass register
        const bassInst = seq.instruments?.bass;
        if (bassInst && notes[0]) {
            const rootIdx = getNoteIndex(notes[0]);
            if (rootIdx !== -1) {
                // Find the note in bass range (A2=21 to C4=51 relative to A0=0)
                // ALL_NOTES_ARR is indexed from A0; find root in octave 2-3
                let bassIdx = rootIdx;
                // Target range: roughly index 21 (A2) to 51 (C4) in the array
                while (bassIdx > 51) bassIdx -= 12;
                while (bassIdx < 21) bassIdx += 12;
                const bassNote = ALL_NOTES_ARR[bassIdx];
                if (bassNote) {
                    const bassGain = seq.refs?.playbackConfigRef?.current?.bass ?? 0.7;
                    bassInst.start({ note: resolveNotePitch(bassNote, null), time: now, duration: 2.0, gain: bassGain, velocity: Math.floor(bassGain * 127) });
                }
            }
        }
    }, [context, sequencerRef]);

    const handleCellClick = useCallback((degree) => {
        const ch = scaleChords[degree];
        if (ch?.notes?.length) playNotes(ch.notes);
    }, [scaleChords, playNotes]);

    // ── Diatonic approach: one scale step above the lower row's degree ─────────
    // Between upper degree A and lower degree B (B = A − 2 mod 7), approach = A − 1 mod 7
    // e.g. between 3 and 1 → 2;  between 4 and 2 → 3;  between 1 and 6 → 7
    const getDiatonicApproach = (upperDeg) => ((upperDeg - 2 + 7) % 7) + 1;

    // ── Label helpers ─────────────────────────────────────────────────────────
    const getLabel = (degree) => {
        const ch = scaleChords[degree];
        const fallback = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree - 1] ?? '?';
        if (!ch) return { main: fallback, sup: '' };
        const isMinorish = ch.quality === 'minor' || ch.quality === 'diminished' || ch.quality === 'dim';
        if (chordDisplayMode === 'roman') {
            const rawBase = ch.meta?.romanBaseRaw ?? fallback;
            const base = isMinorish ? String(rawBase).toLowerCase() : String(rawBase).toUpperCase();
            return { main: base, sup: (ch.meta?.romanSuffix ?? '').replace(/^-/, '') };
        }
        return {
            main: (ch.internalRoot ?? fallback).replace(/\d+/g, ''),
            sup: (ch.internalSuffix ?? '').replace(/^-/, ''),
        };
    };

    const getDegreeRoman = (degree) => {
        const ch = scaleChords[degree];
        return ch?.meta?.romanBaseRaw ?? (['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree - 1] ?? '?');
    };

    // Render the label inside a secondary cell.
    // compact=true → no /target suffix (used in vertical between-row cells)
    const SecLabel = ({ type, targetDegree, compact = false }) => {
        const sec = secondaryChords[targetDegree];
        if (!sec) return null;
        const isRoman = chordDisplayMode !== 'letters';

        let rootDisplay, suffix;
        if (type === 'dominant') {
            rootDisplay = isRoman ? 'V' : sec.dominant.rootName;
            suffix = '7';
        } else if (type === 'diminished') {
            rootDisplay = isRoman ? 'vii' : sec.diminished.rootName;
            suffix = '°';
        } else {
            rootDisplay = isRoman ? 'bII' : sec.tritone.rootName;
            suffix = '7';
        }

        const targetRoman = getDegreeRoman(targetDegree);

        return (
            <span className="chord-grid-secondary-label">
                {rootDisplay}<sup className="chord-grid-btn-label-sup">{suffix}</sup>
                {/* In roman mode: always show /target. In letter mode: omit /x (not conventional) */}
                {!compact && isRoman && <span className="chord-grid-btn-label-roman">/{targetRoman}</span>}
            </span>
        );
    };


    // ── Derived layout values ─────────────────────────────────────────────────
    const isAdv = advancedMode;

    // Adaptive secondary-cell height: fills CELL height regardless of count
    const visSecCount = (showDom ? 1 : 0) + (showDim ? 1 : 0) + (showTri ? 1 : 0);
    const secCellH = visSecCount > 0
        ? Math.floor((CELL - (visSecCount - 1) * ADV_SMALL_VGAP) / visSecCount)
        : ADV_SMALL_H;

    const gridWidth = isAdv ? ADV_GRID_W : GRID_W;
    const gridHeight = isAdv ? ADV_GRID_H : GRID_H;
    const mainCellX = (ci) => isAdv ? ADV_MAIN_OFFSET + ci * ADV_STEP : ci * (CELL + GAP);
    const mainCellY = (ri) => isAdv ? ri * ADV_VROW_STEP : ri * (CELL + GAP);
    const betColX = (bci) => bci * ADV_STEP;           // between-col x (advanced)
    const vRowY = (ri) => ri * ADV_VROW_STEP + CELL + ADV_VGAP;  // between-row y (advanced)

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="chord-grid-container">
            {/* Header: notation toggle + ADV toggle + (when ADV) dom/dim toggles */}
            <div className="chord-grid-header">
                {/* Notation toggle — cycles between LETTERS and NUMERALS */}
                <button
                    className="tab-button chord-grid-toggle"
                    onClick={() => setChordDisplayMode(m => m === 'letters' ? 'roman' : 'letters')}
                >
                    <ChordNotationIcon mode={chordDisplayMode} size={22} />
                    <span className="tab-label">{chordDisplayMode === 'letters' ? 'LETTERS' : 'NUMERALS'}</span>
                </button>
                {/* ADV toggle */}
                <button
                    className={`tab-button chord-grid-toggle${advancedMode ? ' active' : ''}`}
                    onClick={() => setAdvancedMode(m => !m)}
                >
                    <span className="chord-grid-toggle-symbol">ADV</span>
                    <span className="tab-label">ADVANCED</span>
                </button>
                {/* V7 toggle (advanced only) */}
                {advancedMode && (
                    <button
                        className={`tab-button chord-grid-toggle${showDom ? ' active' : ''}`}
                        onClick={() => setShowDom(m => !m)}
                    >
                        <span className="chord-grid-toggle-symbol">V<sup className="chord-grid-btn-label-sup2">7</sup></span>
                        <span className="tab-label">SECONDARY DOMINANT</span>
                    </button>
                )}
                {/* vii° toggle (advanced only) */}
                {advancedMode && (
                    <button
                        className={`tab-button chord-grid-toggle${showDim ? ' active' : ''}`}
                        onClick={() => setShowDim(m => !m)}
                    >
                        <span className="chord-grid-toggle-symbol">vii<sup className="chord-grid-btn-label-sup2">°</sup></span>
                        <span className="tab-label">SECONDARY DIMINISHED</span>
                    </button>
                )}
                {/* bII7 (tritone sub) toggle (advanced only) */}
                {advancedMode && (
                    <button
                        className={`tab-button chord-grid-toggle${showTri ? ' active' : ''}`}
                        onClick={() => setShowTri(m => !m)}
                    >
                        <span className="chord-grid-toggle-symbol">bII<sup className="chord-grid-btn-label-sup2">7</sup></span>
                        <span className="tab-label">TRITONE</span>
                    </button>
                )}
                {/* Diatonic approach toggle (advanced only) */}
                {advancedMode && (
                    <button
                        className={`tab-button chord-grid-toggle${showDiatonicApproach ? ' active' : ''}`}
                        onClick={() => setShowDiatonicApproach(m => !m)}
                    >
                        <span className="chord-grid-toggle-symbol">→</span>
                        <span className="tab-label">DIATONIC APPROACH</span>
                    </button>
                )}
            </div>
            {/* Grid */}
            <div ref={containerRef} className="chord-grid-main" style={{ width: gridWidth, height: gridHeight }}>
                {/* ── Main chord cells ── */}
                {GRID.map((row, ri) => row.map((degree, ci) => {
                    const band = COLOR_BAND[ri][ci];
                    const { main, sup } = getLabel(degree);
                    return (
                        <div
                            key={`m-${ri}-${ci}`}
                            data-degree={degree} data-band={band}
                            onClick={() => handleCellClick(degree)}
                            className={`chord-grid-cell chord-grid-cell-band-${band}`}
                            style={{ left: mainCellX(ci), top: mainCellY(ri) }}
                        >
                            <span className="chord-grid-cell-label">
                                {main}{sup && <sup className="chord-grid-btn-label-sup3">{sup}</sup>}
                            </span>
                        </div>
                    );
                }))}
                {/* ── Advanced: horizontal between-cols (7 cols, one left of each main col) ── */}
                {isAdv && GRID.map((row, ri) =>
                    Array.from({ length: 7 }, (_, bci) => {
                        const targetDeg = GRID[ri][bci];
                        const sec = secondaryChords[targetDeg];
                        const x = betColX(bci);
                        const y = mainCellY(ri);
                        const secTypes = [
                            showDom ? 'dominant' : null,
                            showDim ? 'diminished' : null,
                            showTri ? 'tritone' : null,
                        ].filter(Boolean);
                        return (
                            <React.Fragment key={`hb-${ri}-${bci}`}>
                                {secTypes.map((type, ti) => (
                                    <div
                                        key={type}
                                        className={`chord-grid-smallcell${!!sec?.[type] ? ' chord-grid-smallcell-active' : ' chord-grid-smallcell-inactive'}`}
                                        style={{ width: BETWEEN_W, height: secCellH, left: x, top: y + ti * (secCellH + ADV_SMALL_VGAP) }}
                                        onClick={() => sec?.[type]?.notes && playNotes(sec[type].notes)}
                                    >
                                        <SecLabel type={type} targetDegree={targetDeg} />
                                    </div>
                                ))}
                            </React.Fragment>
                        );
                    })
                )}
                {/* ── Advanced: diatonic approach notes between rows ── */}
                {isAdv && showDiatonicApproach && Array.from({ length: 4 }, (_, ri) =>
                    GRID[0].map((_, ci) => {
                        const upperDeg = GRID[ri][ci];
                        const approachDeg = getDiatonicApproach(upperDeg);
                        const { main } = getLabel(approachDeg);
                        const x = mainCellX(ci);
                        const y = vRowY(ri);
                        return (
                            <div
                                key={`da-${ri}-${ci}`}
                                className="chord-grid-approach-cell"
                                style={{ width: CELL, height: ADV_VROW_H, left: x, top: y }}
                                onClick={() => handleCellClick(approachDeg)}
                            >
                                <span className="chord-grid-approach-label">{main}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default ChordGrid;
