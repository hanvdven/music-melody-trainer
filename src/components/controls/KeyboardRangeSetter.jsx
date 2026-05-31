import React, { useRef } from 'react';
import PianoView from './PianoView';
import { getNoteValue, windowNaturals, applyRangeBoundary } from '../../utils/rangeUtils';
import { PRESET_RANGES } from '../../constants/ranges';
import './styles/KeyboardRangeSetter.css';

// ── Keyboard range setter (context-bound, per keyboard) ─────────────────────
// The range-edit variant of the keyboard: instead of the plain playable piano,
// it shows a boundary-relative WINDOW (a few white keys beyond each boundary as
// context, shared with the sheet-music setter via windowNaturals), draws a
// translucent band over the selected range with drag handles at the edges, and
// offers preset BUTTONS above. Tap a key or drag a handle to set the nearest
// boundary; both go through the SAME applyRangeBoundary write path as the
// sheet-music setter and the steppers (CLAUDE.md §6c). On release the window
// re-anchors and reveals fresh context, so a boundary can be dragged outward
// past the old ±octave limit (capped to A0–C8).
//
// Geometry: white keys are uniform width (.piano-white is a flex row), so the
// overlay uses a viewBox of `0 0 nWhite 100` (1 unit per white key); pointer x
// maps to a white-key index via the SVG's bounding rect.
const CONTEXT_NOTES = 3;
const PRESET_LABELS = ['STANDARD', 'LARGE', 'FULL'];

const nearestIdx = (win, midi) => {
    let bi = 0, bd = Infinity;
    win.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

const KeyboardRangeSetter = ({
    scale, instrument, activeClef, settings, setSettings,
    noteColoringMode = 'none', qwertyKeyboardActive = false, debugMode = false,
}) => {
    // Whole layout (window + dragged boundary) frozen for the duration of a drag
    // so the keys don't shift under the finger; only the band/handles move.
    const dragRef = useRef(null);
    const svgRef = useRef(null);

    const range = settings?.range || { min: 'C4', max: 'E5' };
    const selMin = getNoteValue(range.min);
    const selMax = getNoteValue(range.max);
    const clefKey = activeClef === 'treble' ? 'treble' : 'bass';
    const presets = PRESET_LABELS.map(label => ({ label, ...PRESET_RANGES[label][clefKey] }));

    const win = dragRef.current?.window ?? windowNaturals(selMin, selMax, CONTEXT_NOTES);
    const nWhite = win.length;
    const minIdx = nearestIdx(win, selMin);
    const maxIdx = nearestIdx(win, selMax);

    const setBoundary = (midi, bound) => {
        setSettings(prev => {
            const { range: next, rangeMode } = applyRangeBoundary(prev?.range || range, midi, bound, presets);
            return { ...prev, range: next, rangeMode };
        });
    };

    // SVG x (white-key units) under a clientX, via the overlay's bounding rect.
    const idxAt = (clientX) => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r || !r.width) return 0;
        return Math.max(0, Math.min(nWhite - 1, Math.floor((clientX - r.left) / (r.width / nWhite))));
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
    const onUp = () => { dragRef.current = null; };

    const applyPreset = (p) => setSettings(prev => ({ ...prev, range: { min: p.min, max: p.max }, rangeMode: p.label }));

    // data-settings-keepalive so taps here don't trip the click-outside that
    // closes range-edit (mirrors the steppers' keepalive, bug #7).
    return (
        <div className="kbd-range-setter" data-settings-keepalive="">
            <div className="kbd-range-presets">
                {presets.map(p => (
                    <button key={p.label} type="button"
                        className={`kbd-range-preset${range.min === p.min && range.max === p.max ? ' is-active' : ''}`}
                        onClick={() => applyPreset(p)}>
                        {p.label}
                    </button>
                ))}
            </div>
            <div className="kbd-range-keyboard">
                <PianoView
                    scale={scale}
                    trebleInstrument={instrument}
                    activeClef={activeClef}
                    minNote={win[0].name}
                    maxNote={win[nWhite - 1].name}
                    noteColoringMode={noteColoringMode}
                    qwertyKeyboardActive={qwertyKeyboardActive}
                />
                <svg ref={svgRef} className="kbd-range-overlay"
                    viewBox={`0 0 ${nWhite} 100`} preserveAspectRatio="none"
                    onPointerDown={onDown} onPointerMove={onMove}
                    onPointerUp={onUp} onPointerCancel={onUp}>
                    {/* Selected-range band over the in-range white keys. */}
                    <rect x={minIdx} y={0} width={Math.max(0, maxIdx + 1 - minIdx)} height={100}
                        fill="var(--accent-yellow)" fillOpacity={0.18} style={{ pointerEvents: 'none' }} />
                    {/* Drag handles at the two band edges. */}
                    <rect x={minIdx - 0.07} y={0} width={0.14} height={100}
                        fill="var(--accent-yellow)" style={{ pointerEvents: 'none' }} />
                    <rect x={maxIdx + 1 - 0.07} y={0} width={0.14} height={100}
                        fill="var(--accent-yellow)" style={{ pointerEvents: 'none' }} />
                    {/* Debug: the hit region is the whole overlay (CLAUDE.md §3a). */}
                    {debugMode && (
                        <rect x={0} y={0} width={nWhite} height={100}
                            fill="orange" fillOpacity={0.18} stroke="orange" strokeWidth={0.05}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </svg>
            </div>
        </div>
    );
};

export default KeyboardRangeSetter;
