import React, { useRef, useReducer, useState, useLayoutEffect } from 'react';
import PianoView from './PianoView';
import { getNoteValue, naturalsInRange, windowNaturals, applyRangeBoundary } from '../../utils/rangeUtils';
import { PRESET_RANGES } from '../../constants/ranges';
import './styles/KeyboardRangeSetter.css';

// ── Keyboard range setter (split layout, context-bound per keyboard) ────────
// Range-edit replaces the playable piano with three stacked pieces (Han
// 2026-05-31):
//   1. Preset BRACKETS (no text, consistent with the sheet-music setter), above
//   2. A COMPACT windowed SELECTOR keyboard — where you choose the range. It
//      windows symmetrically around the current selection (like the sheet row),
//      sized so each white key is ≈ KEY_PX wide (e.g. 300px → 15 keys); the band
//      + handles mark the selection. Tap/drag sets the nearest boundary (white-key
//      snap), the window freezes during a drag and re-anchors on release so 3
//      fresh context keys reappear on each side.
//   3. The REAL playable keyboard, limited to the selected min–max, so you see &
//      hear the actual keys the selection produces.
// All boundary writes go through the shared applyRangeBoundary (CLAUDE.md §6c).
const KEY_PX = 20;                 // target width of one selector white key
const PRESET_LABELS = ['STANDARD', 'LARGE', 'FULL'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const nearestIdx = (win, midi) => {
    let bi = 0, bd = Infinity;
    win.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

// Preset-bracket legend geometry. Six brackets total (G-clef STD/LARGE/FULL +
// F-clef STD/LARGE/FULL), grouped into two vertical bands: treble band on top
// (higher pitch), bass band below — so the bracket's VERTICAL position conveys
// the clef (this replaces the old separate clef-switch row), while its
// HORIZONTAL extent stays aligned to the real key positions.
const PRESET_ROW_H = 15, PRESET_PAD = 5;
export const PRESET_TICK = 9;
const SIZE_RANK = { FULL: 0, LARGE: 1, STANDARD: 2 };   // big-on-top within a clef band
const NUM_PRESET_ROWS = 6;                              // 3 sizes × 2 clefs

// One ⊓ bracket per preset, ALIGNED to the selector's white-key grid (x in
// white-key-index units, 0..win.length) and scaling with it. Each preset carries
// its `clef` ('treble'|'bass'); the clef picks the vertical BAND (treble rows
// 0–2, bass rows 3–5) and the size picks the row within it (FULL on top). A
// preset entirely outside the current window is dropped; partial ones clamp to
// the edge (so brackets can fall partly out of view when the window is centred on
// the OTHER clef — Han 2026-05-31). Pure + tested.
export const buildPresetBracketRows = (presets, selRange, selClef, win) => {
    if (!win?.length) return [];
    const loMidi = win[0].midi, hiMidi = win[win.length - 1].midi;
    return presets
        .map(p => ({ p, lo: getNoteValue(p.min), hi: getNoteValue(p.max) }))
        .filter(({ lo, hi }) => hi >= loMidi && lo <= hiMidi)   // drop fully-outside
        .map(({ p, lo, hi }) => {
            const band = p.clef === 'treble' ? 0 : 3;           // treble band on top
            const row = band + (SIZE_RANK[p.label] ?? 0);
            return {
                p,
                x0: nearestIdx(win, lo),
                x1: nearestIdx(win, hi) + 1,
                yTop: PRESET_PAD + row * PRESET_ROW_H,
                // Active = this exact preset of the staff's CURRENT clef is selected.
                isActive: p.clef === selClef && selRange?.min === p.min && selRange?.max === p.max,
                isCurrentClef: p.clef === selClef,
            };
        });
};
export const presetViewHeight = () => PRESET_PAD * 2 + NUM_PRESET_ROWS * PRESET_ROW_H;

const KeyboardRangeSetter = ({
    scale, instrument, activeClef, settings, setSettings,
    noteColoringMode = 'none', qwertyKeyboardActive = false, onNoteInput = null, debugMode = false,
}) => {
    // Layout frozen during a drag so the selector keys don't shift under the
    // finger; forceReanchor re-renders on release so the window re-centres.
    const dragRef = useRef(null);
    const [, forceReanchor] = useReducer((n) => n + 1, 0);
    const wrapRef = useRef(null);
    const selSvgRef = useRef(null);
    const [width, setWidth] = useState(0);

    // Track the panel width so the selector key count adapts to the screen.
    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        setWidth(el.getBoundingClientRect().width);
        const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const range = settings?.range || { min: 'C4', max: 'E5' };
    const selMin = getNoteValue(range.min);
    const selMax = getNoteValue(range.max);
    // The clef CURRENTLY on this staff (a staff can carry either clef — a high
    // bass line may use treble, etc.). Drives bracket-active + window centring.
    const selClef = activeClef === 'treble' ? 'treble' : 'bass';
    // All SIX presets (both clefs) — each bracket sets that clef AND its range on
    // THIS staff (Han 2026-05-31). `clef` tags which vertical band it lands in.
    const presets = ['treble', 'bass'].flatMap(clef =>
        PRESET_LABELS.map(label => ({ label, clef, ...PRESET_RANGES[label][clef] })));
    // Boundary drags still match against the current clef's presets only (so the
    // rangeMode label stays meaningful for the clef being edited).
    const clefPresets = presets.filter(p => p.clef === selClef);

    // Width-adaptive symmetric window: aim for ~KEY_PX per white key. The window
    // is CENTRED ON THE ACTIVE CLEF'S home note (B4 treble / D3 bass) rather than
    // on the selection, so the six clef-grouped brackets sit at stable, readable
    // key positions; brackets for the other clef may fall partly/fully out of view
    // (Han 2026-05-31). During a drag the frozen window is reused.
    const CLEF_CENTER = selClef === 'treble' ? getNoteValue('B4') : getNoteValue('D3');
    const targetKeys = Math.max(7, Math.floor((width || 300) / KEY_PX));
    const halfSpan = Math.floor(targetKeys / 2);
    const win = dragRef.current?.window
        ?? windowNaturals(CLEF_CENTER, CLEF_CENTER, halfSpan);
    const nWhite = win.length;
    const minIdx = nearestIdx(win, selMin);
    const maxIdx = nearestIdx(win, selMax);

    const setBoundary = (midi, bound) => {
        setSettings(prev => {
            const { range: next, rangeMode } = applyRangeBoundary(prev?.range || range, midi, bound, clefPresets);
            return { ...prev, range: next, rangeMode };
        });
    };
    // A bracket tap sets BOTH the clef and the range on this staff. preferredClef
    // is the per-staff clef field the sheet renderer reads (SheetMusic.jsx).
    const applyPreset = (p) => setSettings(prev => ({
        ...prev, preferredClef: p.clef, range: { min: p.min, max: p.max }, rangeMode: p.label,
    }));

    // SVG white-key index under a clientX, via the selector overlay's bounding rect.
    const idxAt = (clientX) => {
        const r = selSvgRef.current?.getBoundingClientRect();
        if (!r || !r.width) return 0;
        return clamp(Math.floor((clientX - r.left) / (r.width / nWhite)), 0, nWhite - 1);
    };
    const onDown = (e) => {
        const midi = win[idxAt(e.clientX)].midi;
        const which = Math.abs(midi - selMin) <= Math.abs(midi - selMax) ? 'min' : 'max';
        dragRef.current = { boundary: which, window: win };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not all envs */ }
        setBoundary(midi, which);
    };
    const onMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        setBoundary(d.window[idxAt(e.clientX)].midi, d.boundary);
    };
    const onUp = () => { dragRef.current = null; forceReanchor(); };

    // Six preset brackets — clef-grouped (treble band on top), aligned to the
    // selector key grid; big-on-top within each band. See buildPresetBracketRows.
    const bracketRows = buildPresetBracketRows(presets, range, selClef, win);
    const presetViewH = presetViewHeight();

    return (
        <div className="kbd-range-setter" data-settings-keepalive="" ref={wrapRef}>
            {/* 1. Six preset brackets, clef-grouped (treble band on top, bass below).
                Each bracket spans its preset's real key positions and, when tapped,
                sets BOTH the clef and the range on this staff. The current clef's
                band is drawn brighter; the other clef's brackets are dimmer (they
                also drive a clef switch on tap). Replaces the old clef-switch row. */}
            <div className="kbd-range-presets-row">
                <svg viewBox={`0 0 ${nWhite} ${presetViewH}`} preserveAspectRatio="none"
                    style={{ width: '100%', height: '100%', display: 'block' }}>
                    {bracketRows.map(({ p, x0, x1, isActive, isCurrentClef, yTop }) => {
                        const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
                        // Off-clef brackets sit faded so the active clef's three read first.
                        const groupOpacity = isCurrentClef ? 1 : 0.45;
                        return (
                            <g key={`${p.clef}-${p.label}`} style={{ cursor: 'pointer', opacity: groupOpacity }}
                                onClick={() => applyPreset(p)}>
                                <rect x={x0 - 0.3} y={yTop - 2} width={(x1 - x0) + 0.6} height={PRESET_ROW_H}
                                    fill="transparent" />
                                <path d={`M ${x0} ${yTop + PRESET_TICK} V ${yTop} H ${x1} V ${yTop + PRESET_TICK}`}
                                    fill="none" stroke={color} strokeWidth={isActive ? 2 : 1.2}
                                    vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
                                {debugMode && (
                                    <rect x={x0 - 0.3} y={yTop - 2} width={(x1 - x0) + 0.6} height={PRESET_ROW_H}
                                        fill="orange" fillOpacity={0.2} stroke="orange" strokeWidth={0.3}
                                        style={{ pointerEvents: 'none' }} />
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* 2. Compact windowed selector — where you choose the range. */}
            <div className="kbd-range-selector">
                <PianoView
                    scale={scale}
                    trebleInstrument={instrument}
                    activeClef={activeClef}
                    minNote={win[0].name}
                    maxNote={win[nWhite - 1].name}
                    noteColoringMode={noteColoringMode}
                    hideLabels
                />
                <svg ref={selSvgRef} className="kbd-range-overlay"
                    viewBox={`0 0 ${nWhite} 100`} preserveAspectRatio="none"
                    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                    <rect x={minIdx} y={0} width={Math.max(0, maxIdx + 1 - minIdx)} height={100}
                        fill="var(--accent-yellow)" fillOpacity={0.18} style={{ pointerEvents: 'none' }} />
                    <rect x={minIdx - 0.07} y={0} width={0.14} height={100}
                        fill="var(--accent-yellow)" style={{ pointerEvents: 'none' }} />
                    <rect x={maxIdx + 1 - 0.07} y={0} width={0.14} height={100}
                        fill="var(--accent-yellow)" style={{ pointerEvents: 'none' }} />
                    {debugMode && (
                        <rect x={0} y={0} width={nWhite} height={100}
                            fill="orange" fillOpacity={0.18} stroke="orange" strokeWidth={0.05}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </svg>
            </div>

            {/* 3. Real playable keyboard — the impact of the selection. */}
            <div className="kbd-range-real">
                <PianoView
                    scale={scale}
                    trebleInstrument={instrument}
                    activeClef={activeClef}
                    minNote={range.min}
                    maxNote={range.max}
                    noteColoringMode={noteColoringMode}
                    onNoteInput={onNoteInput}
                    qwertyKeyboardActive={qwertyKeyboardActive}
                />
            </div>
        </div>
    );
};

export default KeyboardRangeSetter;
