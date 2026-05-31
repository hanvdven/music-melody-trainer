import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { noteYMap, getNoteAbsoluteY, percussionStemUp } from '../renderMelodyNotes';
import { melodicNoteColor } from '../../../theory/noteUtils';
import { getNoteValue, naturalsInRange } from '../../../utils/rangeUtils';
import { orderedPercussionPads, PERCUSSION_PRESETS } from '../../../audio/drumKits';
import { TICKS_PER_WHOLE } from '../../../constants/timing';

/**
 * RangeStaffOverlay — in-SVG range selector (sheet/bladmuziek variant).
 *
 * RENDER: the selectable pitches are a synthetic rhythm-less "melody" rendered
 * THROUGH the real note renderer (MelodyNotesLayer / renderMelodyNotes) so we
 * reuse its ledger lines, ottava (8va/8vb/15ma/15vb) shifting and notehead
 * glyphs (CLAUDE.md §6c — never reinvent pitch→Y). Each staff is a horizontal
 * row laid out on a private slot grid (pixelsPerTick=null). Percussion is
 * ordered per instrument family (orderedPercussionPads), variants behind base.
 *
 * COLOUR (theme vars via the renderer's `previewMode` override):
 *   melodic — boundary notes --accent-yellow, in-band --text-primary,
 *             out-of-band --text-dim (dimmed via group opacity).
 *   percussion — enabled --text-primary, disabled --text-dim (dimmed).
 *
 * INTERACTION (Phase 3):
 *   melodic — press/drag along the staff's diagonal hit band moves the nearest
 *             boundary to the column under the pointer and keeps following it
 *             (tap = a zero-distance drag). Pointer capture + SVG-coordinate
 *             mapping make this work for mouse and touch alike. The band is a
 *             parallelogram following the note row so treble/bass don't overlap.
 *   percussion — tap a pad (box centred on its notehead) to toggle it in/out.
 *   presets — tap a right-bracket to apply that preset. Brackets carry NO text
 *             labels (UI-overhaul style); percussion presets are brackets too,
 *             each spanning the Y range of the pads in BASIC/STANDARD/FULL.
 *
 * Writes go through optional callbacks (onSetMelodicBoundary / onApplyMelodicPreset
 * / onTogglePad / onApplyPercussionPreset). Without them the overlay is a static
 * render (used by the smoke test). A "◆ RANGE SELECTOR" indicator marks the mode.
 */

const QUARTER = TICKS_PER_WHOLE / 4;   // quarter-note → filled head + stem, no flag/beam
// The melodic row is a straight diagonal (pitch rises left→right, so Y falls).
// Hit-zone shaping (point 2, Han 2026-05-31): the treble/bass zones are tall with
// a HORIZONTAL outer edge (less diagonal) and a shared diagonal divider as the
// inner edge, so the two zones meet exactly. BAND_COVER is how far the outer edge
// clears the topmost/bottommost notehead (covering the 8va/8vb markers).
const BAND_COVER = 30;
// Percussion pads: each pad gets its own box centred on its notehead. The box is
// tall and biased UPWARD (point 3) so it also covers the upward stems.
const PERC_HIT_H = 56;
const PERC_HIT_UP_BIAS = 0.66;   // fraction of the box above the notehead centre
// Reserved right margin holding the preset brackets; also compacts the row.
const PRESET_AREA_WIDTH = 92;
const LOWLIGHT_OPACITY = 0.3;          // dim for melodic out-of-band notes
// Disabled percussion pads use a stronger dim so the active/inactive contrast
// reads clearly at a glance (Han 2026-05-31).
const PERC_DISABLED_OPACITY = 0.12;
// Preset-bracket geometry (right margin).
const BRACKET_TICK = 7;
const BRACKET_GAP = 26;

// Full piano white-key naturals — the melodic row windows into this (computed
// once; the window is sliced per render by buildRangeRow).
const PIANO_NATURALS = naturalsInRange(21, 108);

const STATIC_LAYER_PROPS = {
    numAccidentals: 0,
    noteGroupSize: 1,
    measureLengthSlots: 9999,   // one long "measure" → no barline/accidental resets
    scaleNotes: [],
    tonic: '',
    processedChords: [],
    inputTestState: null,
    pixelsPerTick: null,
    startMeasureIndex: 0,
    transpositionSemitones: 0,
    debugMode: false,
    interactive: false,
    courtesyAccidentals: false,
    percussionVoiceSplit: false,
    noteColoringMode: 'none',
};

const mkMelody = (entries) => ({
    notes: entries.map(e => e.name),
    offsets: entries.map(e => e.offset),
    durations: entries.map(() => QUARTER),
    ties: entries.map(() => null),
    triplets: null,
    rhythmicGrouping: null,
});

// Right bracket "]" spanning [yTop, yBottom] at x.
const rightBracketPath = (x, yTop, yBottom, tick) =>
    `M ${x - tick} ${yTop} H ${x} V ${yBottom} H ${x - tick}`;

// Set equality on small arrays (preset-match highlight).
const sameSet = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(x => s.has(x));
};

// ── Range-row layout: boundary-relative window + diagonal ellipsis ──────────
// The row is a two-thumb range slider drawn on the staff. We show a WINDOW that
// always includes CONTEXT_NOTES naturals beyond each boundary (capped to the
// piano), so the view is symmetric by construction (3 below min · min · … · max
// · 3 above max) and the user can always drag a boundary OUTWARD past the old
// ±8va limit — on release the window re-anchors and reveals fresh context, up to
// A0–C8. When the window is still too cramped to fit (noteWidth < MIN_NOTE_WIDTH)
// we COLLAPSE the in-band middle — the notes deep between the boundaries, never
// the drag target — keeping KEEP_IN naturals beside each boundary and drawing a
// diagonal "…" for the elided run (Han 2026-05-31). The gap is expressed as
// dummy slots in allOffsets so the index-based renderer (renderMelodyNotes:
// x = startX + (indexInAllOffsets - 1)*noteWidth) draws it for free.
//
// `notes` is the FULL piano natural list (21..108); the window is sliced here.
// During a drag the caller freezes the whole layout (so notes don't jump under
// the finger); buildRangeRow itself is only called for a fresh, non-drag render.
export const MIN_NOTE_WIDTH = 13;  // below this (px/SVG units) the row collapses
export const MAX_NOTE_WIDTH = 34;  // cap spacing so a small window isn't sparse
export const CONTEXT_NOTES = 3;    // naturals shown beyond each boundary
const KEEP_IN = 3;                 // in-band naturals kept beside each boundary
const GAP_SLOTS = 2;               // dummy slots reserved for the "…" gap
const MIN_COLLAPSE = 3;            // only collapse if ≥ this many middle notes

const nearestIdx = (notes, midi) => {
    let bi = 0, bd = Infinity;
    notes.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

const fit = (count, avail) => Math.min(MAX_NOTE_WIDTH, avail / Math.max(1, count));

export const buildRangeRow = (notes, selMin, selMax, avail) => {
    const M = notes.length;
    if (M === 0) return { collapsed: false, noteWidth: avail, entries: [], allOffsets: [0], colMidi: [], gap: null, extent: { loIdx: 0, hiIdx: 0 } };

    const iMin = nearestIdx(notes, Math.min(selMin, selMax));
    const iMax = nearestIdx(notes, Math.max(selMin, selMax));
    // Boundary-relative window: CONTEXT_NOTES beyond each boundary, capped to piano.
    const loIdx = Math.max(0, iMin - CONTEXT_NOTES);
    const hiIdx = Math.min(M - 1, iMax + CONTEXT_NOTES);
    const win = notes.slice(loIdx, hiIdx + 1);
    const W = win.length;
    const extent = { loIdx, hiIdx };

    const linear = () => ({
        collapsed: false,
        noteWidth: fit(W, avail),
        entries: win.map((n, i) => ({ name: n.name, midi: n.midi, offset: i + 1 })),
        allOffsets: Array.from({ length: W + 1 }, (_, i) => i),
        colMidi: win.map(n => n.midi),
        gap: null, extent,
    });
    if (avail / W >= MIN_NOTE_WIDTH) return linear();

    // Keep KEEP_IN naturals inside each boundary; collapse the deep middle.
    const rMin = iMin - loIdx, rMax = iMax - loIdx;
    const lowEnd = Math.min(rMin + KEEP_IN, W - 1);
    const highStart = Math.max(rMax - KEEP_IN, 0);
    if (highStart - lowEnd - 1 < MIN_COLLAPSE) return linear();

    const low = win.slice(0, lowEnd + 1);
    const high = win.slice(highStart);
    const total = low.length + GAP_SLOTS + high.length;
    const noteWidth = fit(total, avail);

    const entries = [];
    low.forEach((n, i) => entries.push({ name: n.name, midi: n.midi, offset: i + 1 }));
    const highBase = low.length + GAP_SLOTS; // first high note offset = highBase + 1
    high.forEach((n, i) => entries.push({ name: n.name, midi: n.midi, offset: highBase + i + 1 }));

    // slot s (x = startX + s*noteWidth) → nearest kept note's midi; gap slots snap
    // to the adjacent cluster edge so a stray tap on the "…" still does something.
    const colMidi = [];
    for (let s = 0; s < total; s++) {
        const e = entries.find(en => en.offset === s + 1);
        colMidi.push(e ? e.midi : (s + 1 <= low.length ? low[low.length - 1].midi : high[0].midi));
    }

    return {
        collapsed: true, noteWidth, entries, colMidi, extent,
        allOffsets: Array.from({ length: total + 1 }, (_, i) => i),
        // x relative to startX of the last-low and first-high note centres.
        gap: {
            lowName: low[low.length - 1].name, highName: high[0].name,
            x0: (low.length - 1) * noteWidth, x1: highBase * noteWidth,
        },
    };
};

const RangeStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    // Clef-aware frames from SheetMusic.computeRangeFrame: { rowLow, rowHigh,
    // presets:[{label,min,max}] }. The selectable extent + presets follow the
    // CLEF shown on the staff, not the staff slot (Han 2026-05-31).
    trebleFrame, bassFrame,
    trebleRange, bassRange,
    enabledPads,
    onSetMelodicBoundary, onApplyMelodicPreset, onTogglePad, onApplyPercussionPreset,
    timeSignature, theme, debugMode = false,
    // Coloring props (point 1): the in-band/selected notes follow the same note
    // coloring as the rendered sheet music; boundary + out-of-band keep flat colors.
    noteColoringMode = 'none', scaleNotes = [], tonic = '',
}) => {
    // Active boundary being dragged: { staff, boundary, layout } | null. The layout
    // is frozen for the drag so notes don't jump; on release we force a re-render
    // so the window re-anchors and 3 fresh context notes reappear on each side
    // (Han 2026-05-31) — clearing the ref alone wouldn't re-render.
    const dragRef = React.useRef(null);
    const [, forceReanchor] = React.useReducer((n) => n + 1, 0);

    if (startX == null || endX == null) return null;

    // Screen → SVG x (robust for mouse + touch; handles the viewBox scale).
    const svgX = (e) => {
        const svg = e.currentTarget?.ownerSVGElement;
        if (!svg?.getScreenCTM) return null;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
        return loc.x;
    };

    // The visible row is a boundary-relative WINDOW into the full piano (A0..C8),
    // not the clef extent: buildRangeRow centres CONTEXT_NOTES naturals beyond
    // each boundary. During a drag we reuse the WHOLE layout captured at
    // press-time so the window/notes don't shift under the finger.
    const MEL_AVAIL = endX - PRESET_AREA_WIDTH - startX;
    const getMelodicLayout = (staff, selMin, selMax) => {
        const active = dragRef.current?.staff === staff ? dragRef.current : null;
        return active?.layout ?? buildRangeRow(PIANO_NATURALS, selMin, selMax, MEL_AVAIL);
    };
    // Note-row Y at the row's left/right ends (lowest note left, highest right),
    // used to derive the shared divider between the treble and bass hit zones.
    const melodicEnds = (staff, staffStart, clef, range) => {
        const { entries } = getMelodicLayout(staff, getNoteValue(range?.min), getNoteValue(range?.max));
        if (!entries.length) return null;
        return {
            yL: getNoteAbsoluteY(entries[0].name, staffStart, clef, staff),
            yR: getNoteAbsoluteY(entries[entries.length - 1].name, staffStart, clef, staff),
        };
    };

    // ── Melodic staff (treble/bass) ──────────────────────────────────────────
    // `divider` (shared edge between the treble & bass zones) is `{ dL, dR }` (Y at
    // the row's left/right ends) when both melodic staves are visible, else null.
    const melodicStaff = (staff, staffStart, clef, range, frame, divider) => {
        if (!frame) return null;
        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);

        const layout = getMelodicLayout(staff, selMin, selMax);
        const { noteWidth, entries, allOffsets, colMidi, gap } = layout;
        if (!entries.length) return null;

        // Column → midi under an SVG x (handles the collapsed gap via colMidi).
        const colAt = (x) => colMidi[Math.max(0, Math.min(colMidi.length - 1, Math.round((x - startX) / noteWidth)))];

        const out = [], inBand = [], boundary = [];
        entries.forEach((e) => {
            if (e.midi === selMin || e.midi === selMax) boundary.push(e);
            else if (e.midi > selMin && e.midi < selMax) inBand.push(e);
            else out.push(e);
        });

        // Selected (in-band) notes follow the live note coloring (point 1): group
        // them by their melodic color and render one layer per color (the proven
        // previewMode=<color> path). Modes that don't color noteheads fall back to
        // the default text color. Boundary stays yellow (drag handles); out dimmed.
        const inByColor = new Map();
        inBand.forEach((e) => {
            const c = melodicNoteColor(e.name, { noteColoringMode, tonic, scaleNotes, theme }) ?? 'var(--text-primary)';
            if (!inByColor.has(c)) inByColor.set(c, []);
            inByColor.get(c).push(e);
        });
        const colorLayers = [
            { key: 'out', color: 'var(--text-dim)', opacity: LOWLIGHT_OPACITY, entries: out },
            ...[...inByColor.entries()].map(([c, es], i) => ({ key: `in-${i}`, color: c, opacity: 1, entries: es })),
            { key: 'bound', color: 'var(--accent-yellow)', opacity: 1, entries: boundary },
        ];

        // Press = begin dragging the boundary nearest the pressed column, and
        // move it there immediately (so a plain tap also sets it). Freeze the
        // current layout for the duration of the drag so notes stay put.
        const onDown = (e) => {
            if (!onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            const midi = colAt(x);
            const which = Math.abs(midi - selMin) <= Math.abs(midi - selMax) ? 'min' : 'max';
            dragRef.current = { staff, boundary: which, layout };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not all envs */ }
            onSetMelodicBoundary(staff, midi, which, frame.presets);
        };
        const onMove = (e) => {
            const d = dragRef.current;
            if (!d || d.staff !== staff || !onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            onSetMelodicBoundary(staff, colAt(x), d.boundary, frame.presets);
        };
        const onUp = () => { dragRef.current = null; forceReanchor(); };

        // Hit band (point 2): a tall quad covering the note row + its 8va/8vb.
        // yLeft/yRight = the row's first (lowest) / last (highest) note Y. Common
        // left/right x so the treble & bass inner edges align exactly.
        const yLeft = getNoteAbsoluteY(entries[0].name, staffStart, clef, staff);
        const yRight = getNoteAbsoluteY(entries[entries.length - 1].name, staffStart, clef, staff);
        const xL = startX;
        const xR = endX - PRESET_AREA_WIDTH;
        // The OUTER edge is horizontal (less diagonal — point 2) at the row's
        // topmost/bottommost note ± BAND_COVER, so it clears the highest/lowest
        // noteheads AND their 8va/8vb markers (ottava only ever shifts notes toward
        // the staff, never past the raw extreme). The INNER edge is the shared
        // divider so the treble & bass zones meet exactly. Solo → cover both sides.
        const topY = Math.min(yLeft, yRight) - BAND_COVER;
        const botY = Math.max(yLeft, yRight) + BAND_COVER;
        let bandPoints;
        if (divider) {
            bandPoints = (staff === 'treble'
                ? [`${xL},${topY}`, `${xR},${topY}`, `${xR},${divider.dR}`, `${xL},${divider.dL}`]
                : [`${xL},${divider.dL}`, `${xR},${divider.dR}`, `${xR},${botY}`, `${xL},${botY}`]
            ).join(' ');
        } else {
            bandPoints = [`${xL},${topY}`, `${xR},${topY}`, `${xR},${botY}`, `${xL},${botY}`].join(' ');
        }

        return (
            <g className={`range-row range-row-${staff}`} key={staff}>
                {colorLayers.map(layer => layer.entries.length > 0 && (
                    <g key={layer.key} style={{ opacity: layer.opacity, pointerEvents: 'none' }}>
                        <MelodyNotesLayer
                            {...STATIC_LAYER_PROPS}
                            melody={mkMelody(layer.entries)}
                            staff={staff}
                            staffYStart={staffStart}
                            clef={clef}
                            startX={startX}
                            noteWidth={noteWidth}
                            allOffsets={allOffsets}
                            timeSignature={timeSignature}
                            theme={theme}
                            previewMode={layer.color}
                        />
                    </g>
                ))}
                {/* Hit band covering the note row + 8va/8vb. Pointer-capture +
                    colAt() map any x to the target column, so a tap or drag anywhere
                    in the zone moves the nearest boundary. Treble & bass zones meet
                    exactly on the shared divider so neither overlaps the other. */}
                {onSetMelodicBoundary && (
                    <polygon points={bandPoints}
                        fill="transparent"
                        style={{ cursor: 'ew-resize', touchAction: 'none' }}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                    />
                )}
                {/* Diagonal "…" marking the collapsed in-band middle: 3 dots
                    interpolated along the slant between the last-low and first-high
                    kept notes, so the ellipsis follows the row's diagonal. */}
                {gap && [0.3, 0.5, 0.7].map((t, k) => {
                    const yLo = getNoteAbsoluteY(gap.lowName, staffStart, clef, staff);
                    const yHi = getNoteAbsoluteY(gap.highName, staffStart, clef, staff);
                    return (
                        <circle key={`ell-${k}`}
                            cx={startX + gap.x0 + (gap.x1 - gap.x0) * t}
                            cy={yLo + (yHi - yLo) * t}
                            r={1.6} fill="var(--text-dim)"
                            style={{ pointerEvents: 'none' }} />
                    );
                })}
                {/* Debug: visualise the diagonal hit band (CLAUDE.md §3a). */}
                {debugMode && (
                    <polygon points={bandPoints}
                        fill="orange" fillOpacity={0.22} stroke="orange" strokeWidth={1}
                        style={{ pointerEvents: 'none' }}
                    />
                )}
            </g>
        );
    };

    // ── Melodic preset brackets (right margin, clickable) ─────────────────────
    const melodicPresetBrackets = (staff, staffStart, clef, range, frame) => {
        if (!frame) return null;
        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);
        const presetX0 = endX - PRESET_AREA_WIDTH + BRACKET_TICK + 4;
        return (
            <g className={`range-presets range-presets-${staff}`}>
                {frame.presets.map((p, i) => {
                    const yTop = getNoteAbsoluteY(p.max, staffStart, clef, staff);
                    const yBottom = getNoteAbsoluteY(p.min, staffStart, clef, staff);
                    if (yTop == null || yBottom == null) return null;
                    const x = presetX0 + i * BRACKET_GAP;
                    const isActive = getNoteValue(p.min) === selMin && getNoteValue(p.max) === selMax;
                    const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
                    const hitX = x - BRACKET_TICK - 12, hitY = yTop - 4;
                    const hitW = BRACKET_TICK + 18, hitH = yBottom - yTop + 8;
                    // No text label (Han 2026-05-31 — text clashed with the UI-overhaul
                    // style); presets read as nested brackets, active one highlighted.
                    return (
                        <g key={p.label}
                            style={{ cursor: onApplyMelodicPreset ? 'pointer' : 'default' }}
                            onClick={onApplyMelodicPreset ? () => onApplyMelodicPreset(staff, p) : undefined}>
                            {/* invisible wide hit target around the thin bracket */}
                            <rect x={hitX} y={hitY} width={hitW} height={hitH} fill="transparent" />
                            {/* Debug: visualise the preset hit box (CLAUDE.md §3a). */}
                            {debugMode && (
                                <rect x={hitX} y={hitY} width={hitW} height={hitH}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                            <path d={rightBracketPath(x, yTop, yBottom, BRACKET_TICK)}
                                fill="none" stroke={color} strokeWidth={isActive ? 1.6 : 1}
                                style={{ pointerEvents: 'none' }} />
                        </g>
                    );
                })}
            </g>
        );
    };

    // ── Percussion row (tap a pad to toggle the pool) ─────────────────────────
    const percussionStaffRow = () => {
        const ids = orderedPercussionPads().filter(id => noteYMap[id] != null);
        const M = ids.length;
        if (!M) return null;
        const noteWidth = (endX - PRESET_AREA_WIDTH - startX) / M;
        const allOffsets = Array.from({ length: M + 1 }, (_, i) => i);
        const isEnabled = (id) => !Array.isArray(enabledPads) || enabledPads.includes(id);

        const enabledEntries = [], disabledEntries = [];
        ids.forEach((id, i) => {
            (isEnabled(id) ? enabledEntries : disabledEntries).push({ name: id, offset: i + 1 });
        });

        const layers = [
            { key: 'off', color: 'var(--text-dim)', opacity: PERC_DISABLED_OPACITY, entries: disabledEntries },
            { key: 'on', color: 'var(--text-primary)', opacity: 1, entries: enabledEntries },
        ];

        return (
            <g className="range-row range-row-percussion" key="percussion">
                {layers.map(layer => layer.entries.length > 0 && (
                    <g key={layer.key} style={{ opacity: layer.opacity, pointerEvents: 'none' }}>
                        <MelodyNotesLayer
                            {...STATIC_LAYER_PROPS}
                            melody={mkMelody(layer.entries)}
                            staff="percussion"
                            staffYStart={percussionStart}
                            clef={null}
                            startX={startX}
                            noteWidth={noteWidth}
                            allOffsets={allOffsets}
                            timeSignature={timeSignature}
                            theme={theme}
                            previewMode={layer.color}
                        />
                    </g>
                ))}
                {/* Per-pad hit boxes → toggle. Each box is centred on its pad's
                    notehead Y (not a full-height column) so pads don't pile into
                    one overlapping block (+ debug box, §3a). */}
                {onTogglePad && ids.map((id, i) => {
                    const cy = getNoteAbsoluteY(id, percussionStart, null, 'percussion');
                    const hx = startX + i * noteWidth - noteWidth / 2;
                    // Bias the box toward the stem so it covers it (point 3): up for
                    // stem-up pads, down for stem-down pads.
                    const bias = percussionStemUp(id) ? PERC_HIT_UP_BIAS : (1 - PERC_HIT_UP_BIAS);
                    const hy = (cy ?? percussionStart) - PERC_HIT_H * bias;
                    return (
                        <g key={`hit-${id}`}>
                            <rect x={hx} y={hy} width={noteWidth} height={PERC_HIT_H}
                                fill="transparent" style={{ cursor: 'pointer' }}
                                onClick={() => onTogglePad(id)} />
                            {debugMode && (
                                <rect x={hx} y={hy} width={noteWidth} height={PERC_HIT_H}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                        </g>
                    );
                })}
            </g>
        );
    };

    // ── Percussion preset brackets (right margin, clickable) ──────────────────
    // Brackets instead of text labels (Han 2026-05-31), matching the melodic side
    // until a better percussion-pool UI exists. Each bracket spans the Y range of
    // the pads in that preset (lowest→highest notehead).
    const percussionPresets = () => {
        const modes = ['BASIC', 'STANDARD', 'FULL'];
        const presetX0 = endX - PRESET_AREA_WIDTH + BRACKET_TICK + 4;
        return (
            <g className="range-presets range-presets-percussion">
                {modes.map((mode, i) => {
                    const ys = PERCUSSION_PRESETS[mode]
                        .filter(id => noteYMap[id] != null)
                        .map(id => getNoteAbsoluteY(id, percussionStart, null, 'percussion'))
                        .filter(y => y != null);
                    if (!ys.length) return null;
                    const yTop = Math.min(...ys), yBottom = Math.max(...ys);
                    const x = presetX0 + i * BRACKET_GAP;
                    const isActive = sameSet(enabledPads, PERCUSSION_PRESETS[mode]);
                    const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
                    const hitX = x - BRACKET_TICK - 12, hitY = yTop - 4;
                    const hitW = BRACKET_TICK + 18, hitH = yBottom - yTop + 8;
                    return (
                        <g key={mode}
                            style={{ cursor: onApplyPercussionPreset ? 'pointer' : 'default' }}
                            onClick={onApplyPercussionPreset ? () => onApplyPercussionPreset(mode) : undefined}>
                            <rect x={hitX} y={hitY} width={hitW} height={hitH} fill="transparent" />
                            {debugMode && (
                                <rect x={hitX} y={hitY} width={hitW} height={hitH}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                            <path d={rightBracketPath(x, yTop, yBottom, BRACKET_TICK)}
                                fill="none" stroke={color} strokeWidth={isActive ? 1.6 : 1}
                                style={{ pointerEvents: 'none' }} />
                        </g>
                    );
                })}
            </g>
        );
    };

    // Clear "you are in range-selector mode" indicator (Han 2026-05-30).
    const modeIndicator = () => (
        <g className="range-mode-indicator" style={{ pointerEvents: 'none' }}>
            <text x={startX} y={trebleStart - 30}
                fill="var(--accent-yellow)" fontSize={12}
                fontFamily="Georgia, serif" fontWeight="bold" letterSpacing="1">
                ◆ RANGE SELECTOR
            </text>
        </g>
    );

    // Shared divider between the treble & bass hit zones: the midpoint of the two
    // note rows at the left/right ends, so the zones meet exactly (point 2). Null
    // unless both melodic staves are visible.
    const tEnds = isTrebleVisible && trebleFrame ? melodicEnds('treble', trebleStart, clefTreble, trebleRange) : null;
    const bEnds = isBassVisible && bassFrame ? melodicEnds('bass', bassStart, clefBass, bassRange) : null;
    const divider = (tEnds && bEnds)
        ? { dL: (tEnds.yL + bEnds.yL) / 2, dR: (tEnds.yR + bEnds.yR) / 2 }
        : null;

    return (
        <g className="range-overlay" onClick={(e) => e.stopPropagation()}>
            {modeIndicator()}
            {isTrebleVisible && melodicStaff('treble', trebleStart, clefTreble, trebleRange, trebleFrame, divider)}
            {isBassVisible && melodicStaff('bass', bassStart, clefBass, bassRange, bassFrame, divider)}
            {isTrebleVisible && melodicPresetBrackets('treble', trebleStart, clefTreble, trebleRange, trebleFrame)}
            {isBassVisible && melodicPresetBrackets('bass', bassStart, clefBass, bassRange, bassFrame)}
            {isPercussionVisible && percussionStaffRow()}
            {isPercussionVisible && percussionPresets()}
        </g>
    );
};

export default RangeStaffOverlay;
