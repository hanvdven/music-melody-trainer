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
const MIN_CONTEXT = 2;             // min naturals beyond each boundary
const PRESET_LABELS = ['STANDARD', 'LARGE', 'FULL'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const nearestIdx = (win, midi) => {
    let bi = 0, bd = Infinity;
    win.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

// Preset-bracket legend geometry.
const PRESET_ROW_H = 22, PRESET_PAD = 6;
export const PRESET_TICK = 13;

// One ⊓ bracket per preset, ALIGNED to the selector's white-key grid (x in
// white-key-index units, 0..win.length) and scaling with it. Widest preset on
// top (Han 2026-05-31). Presets that fall entirely outside the current window are
// hidden (the window will reveal them as the selection moves). Pure + tested.
export const buildPresetBracketRows = (presets, selRange, win) => {
    if (!win?.length) return [];
    const loMidi = win[0].midi, hiMidi = win[win.length - 1].midi;
    return presets
        .map(p => ({ p, lo: getNoteValue(p.min), hi: getNoteValue(p.max) }))
        .filter(({ lo, hi }) => hi >= loMidi && lo <= hiMidi)   // hide fully-outside
        .sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))          // widest first → big on top
        .map(({ p, lo, hi }, k) => ({
            p,
            x0: nearestIdx(win, lo),
            x1: nearestIdx(win, hi) + 1,
            yTop: PRESET_PAD + k * PRESET_ROW_H,
            isActive: selRange?.min === p.min && selRange?.max === p.max,
        }));
};
export const presetViewHeight = (n) => PRESET_PAD * 2 + n * PRESET_ROW_H;

const KeyboardRangeSetter = ({
    scale, instrument, activeClef, settings, setSettings,
    noteColoringMode = 'none', qwertyKeyboardActive = false, onNoteInput = null, debugMode = false,
    // When provided, render treble/bass clef-switch brackets above the keyboard
    // so the user can switch the clef being edited from here (piano tab only).
    onSwitchClef = null,
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
    const clefKey = activeClef === 'treble' ? 'treble' : 'bass';
    const presets = PRESET_LABELS.map(label => ({ label, ...PRESET_RANGES[label][clefKey] }));

    // Width-adaptive symmetric window: aim for ~KEY_PX per white key, with the
    // selection centred and equal context beyond each boundary.
    const targetKeys = Math.max(7, Math.floor((width || 300) / KEY_PX));
    const inBand = naturalsInRange(Math.min(selMin, selMax), Math.max(selMin, selMax)).length;
    const context = Math.max(MIN_CONTEXT, Math.floor((targetKeys - inBand) / 2));
    const win = dragRef.current?.window ?? windowNaturals(selMin, selMax, context);
    const nWhite = win.length;
    const minIdx = nearestIdx(win, selMin);
    const maxIdx = nearestIdx(win, selMax);

    const setBoundary = (midi, bound) => {
        setSettings(prev => {
            const { range: next, rangeMode } = applyRangeBoundary(prev?.range || range, midi, bound, presets);
            return { ...prev, range: next, rangeMode };
        });
    };
    const applyPreset = (p) => setSettings(prev => ({ ...prev, range: { min: p.min, max: p.max }, rangeMode: p.label }));

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

    // Preset brackets — aligned to the selector key grid, big-on-top, hidden when
    // fully outside the window. See buildPresetBracketRows.
    const bracketRows = buildPresetBracketRows(presets, range, win);
    const presetViewH = presetViewHeight(presets.length);

    return (
        <div className="kbd-range-setter" data-settings-keepalive="" ref={wrapRef}>
            {/* 0. Clef-switch brackets (piano tab only): treble on top, bass below
                — position conveys the clef (high vs low); tap switches which clef
                you're editing. Active clef highlighted. */}
            {onSwitchClef && (
                <div className="kbd-range-clefs">
                    <svg viewBox="0 0 100 56" preserveAspectRatio="none"
                        style={{ width: '100%', height: '100%', display: 'block' }}>
                        {[{ clef: 'treble', yTop: 8 }, { clef: 'bass', yTop: 32 }].map(({ clef, yTop }) => {
                            const active = activeClef === clef;
                            const color = active ? 'var(--accent-yellow)' : 'var(--text-dim)';
                            return (
                                <g key={clef} style={{ cursor: 'pointer' }} onClick={() => onSwitchClef(clef)}>
                                    <rect x={22} y={yTop - 4} width={56} height={22} fill="transparent" />
                                    <path d={`M 25 ${yTop + 14} V ${yTop} H 75 V ${yTop + 14}`}
                                        fill="none" stroke={color} strokeWidth={active ? 2.4 : 1.2}
                                        vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
                                    {debugMode && (
                                        <rect x={22} y={yTop - 4} width={56} height={22}
                                            fill="orange" fillOpacity={0.2} stroke="orange" strokeWidth={0.3}
                                            style={{ pointerEvents: 'none' }} />
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>
            )}
            {/* 1. Preset brackets — aligned to the selector keys, big-on-top. */}
            <div className="kbd-range-presets-row">
                <svg viewBox={`0 0 ${nWhite} ${presetViewH}`} preserveAspectRatio="none"
                    style={{ width: '100%', height: '100%', display: 'block' }}>
                    {bracketRows.map(({ p, x0, x1, isActive, yTop }) => {
                        const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
                        return (
                            <g key={p.label} style={{ cursor: 'pointer' }} onClick={() => applyPreset(p)}>
                                <rect x={x0 - 0.3} y={yTop - 3} width={(x1 - x0) + 0.6} height={PRESET_ROW_H}
                                    fill="transparent" />
                                <path d={`M ${x0} ${yTop + PRESET_TICK} V ${yTop} H ${x1} V ${yTop + PRESET_TICK}`}
                                    fill="none" stroke={color} strokeWidth={isActive ? 2 : 1.2}
                                    vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
                                {debugMode && (
                                    <rect x={x0 - 0.3} y={yTop - 3} width={(x1 - x0) + 0.6} height={PRESET_ROW_H}
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
