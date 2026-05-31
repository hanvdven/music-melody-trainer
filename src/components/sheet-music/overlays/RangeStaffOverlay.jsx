import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { noteYMap, getNoteAbsoluteY } from '../renderMelodyNotes';
import { getNoteValue } from '../../../utils/rangeUtils';
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
// The drag hit zone is a parallelogram band of this thickness that FOLLOWS that
// diagonal, instead of one full-height rect per staff — the old rects spanned the
// whole ledger area and overlapped between treble and bass (Han 2026-05-31).
const BAND_H = 34;
// Percussion pads sit at fixed per-pad Ys; each pad gets its own box centred on
// its notehead rather than a full-height column (same overlap fix).
const PERC_HIT_H = 30;
// Reserved right margin holding the preset brackets; also compacts the row.
const PRESET_AREA_WIDTH = 92;
const LOWLIGHT_OPACITY = 0.3;          // dim for melodic out-of-band notes
// Disabled percussion pads use a stronger dim so the active/inactive contrast
// reads clearly at a glance (Han 2026-05-31).
const PERC_DISABLED_OPACITY = 0.12;
// Preset-bracket geometry (right margin).
const BRACKET_TICK = 7;
const BRACKET_GAP = 26;

// Natural pitch classes only — diatonic row (D1).
const PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

const naturalsInRange = (lowMidi, highMidi) => {
    const out = [];
    for (let m = lowMidi; m <= highMidi; m++) {
        const letter = PC_TO_LETTER[((m % 12) + 12) % 12];
        if (!letter) continue;
        out.push({ midi: m, name: `${letter}${Math.floor(m / 12) - 1}` });
    }
    return out;
};

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

// ── Diagonal-ellipsis row layout ────────────────────────────────────────────
// When the natural row is too cramped (would-be noteWidth < MIN_NOTE_WIDTH) we
// COLLAPSE the in-band middle — the notes deep between the two boundaries, which
// are never the drag target — into a diagonal "…" gap, giving the kept edge
// notes more room (Han 2026-05-31). The gap is expressed as dummy slots in
// allOffsets so the existing index-based renderer (renderMelodyNotes:
// x = startX + (indexInAllOffsets - 1)*noteWidth) draws it for free. A drag
// passes its frozen `split` back so the kept notes don't jump under the finger.
export const MIN_NOTE_WIDTH = 13;  // below this (px/SVG units) the row collapses
const EDGE_KEEP = 2;               // in-band notes kept beside each boundary
const GAP_SLOTS = 2;               // dummy slots reserved for the "…" gap
const MIN_COLLAPSE = 3;            // only collapse if ≥ this many middle notes

const nearestIdx = (notes, midi) => {
    let bi = 0, bd = Infinity;
    notes.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

export const buildRangeRow = (notes, selMin, selMax, avail, frozenSplit = null) => {
    const N = notes.length;
    const linear = () => ({
        collapsed: false,
        noteWidth: avail / Math.max(1, N),
        entries: notes.map((n, i) => ({ name: n.name, midi: n.midi, offset: i + 1 })),
        allOffsets: Array.from({ length: N + 1 }, (_, i) => i),
        colMidi: notes.map(n => n.midi),
        gap: null, split: null,
    });
    if (N === 0 || avail / N >= MIN_NOTE_WIDTH) return linear();

    let lowEnd, highStart;
    if (frozenSplit) {
        ({ lowEnd, highStart } = frozenSplit);
    } else {
        const iLo = nearestIdx(notes, Math.min(selMin, selMax));
        const iHi = nearestIdx(notes, Math.max(selMin, selMax));
        lowEnd = Math.min(iLo + EDGE_KEEP, N - 1);
        highStart = Math.max(iHi - EDGE_KEEP, 0);
    }
    if (highStart - lowEnd - 1 < MIN_COLLAPSE) return linear();

    const low = notes.slice(0, lowEnd + 1);
    const high = notes.slice(highStart);
    const total = low.length + GAP_SLOTS + high.length;
    const noteWidth = avail / total;

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
        collapsed: true, noteWidth, entries, colMidi,
        allOffsets: Array.from({ length: total + 1 }, (_, i) => i),
        // x relative to startX of the last-low and first-high note centres.
        gap: {
            lowName: low[low.length - 1].name, highName: high[0].name,
            x0: (low.length - 1) * noteWidth, x1: highBase * noteWidth,
        },
        split: { lowEnd, highStart },
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
}) => {
    // Active boundary being dragged: { staff, boundary:'min'|'max' } | null.
    const dragRef = React.useRef(null);

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

    // ── Melodic staff (treble/bass) ──────────────────────────────────────────
    const melodicStaff = (staff, staffStart, clef, range, frame) => {
        if (!frame) return null;
        // Extent comes pre-computed (clef-aware, incl. ±octave headroom) from
        // SheetMusic.computeRangeFrame; here we just clamp to the hard bounds.
        const rowLow = Math.max(21, getNoteValue(frame.rowLow));
        const rowHigh = Math.min(108, getNoteValue(frame.rowHigh));
        const notes = naturalsInRange(rowLow, rowHigh);
        const N = notes.length;
        if (!N) return null;

        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);
        const avail = endX - PRESET_AREA_WIDTH - startX;

        // Cramped rows collapse their in-band middle into a diagonal "…". During a
        // drag we reuse the split captured at press-time so notes don't jump.
        const frozen = (dragRef.current?.staff === staff) ? dragRef.current.split : null;
        const { noteWidth, entries, allOffsets, colMidi, gap } = buildRangeRow(notes, selMin, selMax, avail, frozen);

        // Column → midi under an SVG x (handles the collapsed gap via colMidi).
        const colAt = (x) => colMidi[Math.max(0, Math.min(colMidi.length - 1, Math.round((x - startX) / noteWidth)))];

        const out = [], inBand = [], boundary = [];
        entries.forEach((e) => {
            if (e.midi === selMin || e.midi === selMax) boundary.push(e);
            else if (e.midi > selMin && e.midi < selMax) inBand.push(e);
            else out.push(e);
        });

        const colorLayers = [
            { key: 'out', color: 'var(--text-dim)', opacity: LOWLIGHT_OPACITY, entries: out },
            { key: 'in', color: 'var(--text-primary)', opacity: 1, entries: inBand },
            { key: 'bound', color: 'var(--accent-yellow)', opacity: 1, entries: boundary },
        ];

        // Press = begin dragging the boundary nearest the pressed column, and
        // move it there immediately (so a plain tap also sets it). The current
        // collapse `split` is frozen on the drag so the layout stays put.
        const onDown = (e) => {
            if (!onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            const midi = colAt(x);
            const which = Math.abs(midi - selMin) <= Math.abs(midi - selMax) ? 'min' : 'max';
            // Freeze the current collapse split for the duration of the drag.
            dragRef.current = { staff, boundary: which, split: buildRangeRow(notes, selMin, selMax, avail).split };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not all envs */ }
            onSetMelodicBoundary(staff, midi, which, frame.presets);
        };
        const onMove = (e) => {
            const d = dragRef.current;
            if (!d || d.staff !== staff || !onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            onSetMelodicBoundary(staff, colAt(x), d.boundary, frame.presets);
        };
        const onUp = () => { dragRef.current = null; };

        // Parallelogram band following the diagonal note row, from the first kept
        // note (left, high Y) to the last (right, low Y). yLeft/yRight from the
        // real pitch→Y map; the slant keeps treble and bass zones from overlapping.
        const first = entries[0], last = entries[entries.length - 1];
        const yLeft = getNoteAbsoluteY(first.name, staffStart, clef, staff);
        const yRight = getNoteAbsoluteY(last.name, staffStart, clef, staff);
        const xL = startX + (first.offset - 1) * noteWidth - noteWidth / 2;
        const xR = startX + (last.offset - 1) * noteWidth + noteWidth / 2;
        const bandPoints = [
            `${xL},${yLeft - BAND_H / 2}`, `${xR},${yRight - BAND_H / 2}`,
            `${xR},${yRight + BAND_H / 2}`, `${xL},${yLeft + BAND_H / 2}`,
        ].join(' ');

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
                {/* Diagonal hit band following the note row: a parallelogram from
                    the lowest note (left, high Y) to the highest (right, low Y).
                    Pointer-capture + colAt() map any x to the target column, so a
                    tap or drag along the slant moves the nearest boundary. The
                    slant keeps the treble and bass zones from overlapping. */}
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
                    const hy = (cy ?? percussionStart) - PERC_HIT_H / 2;
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

    return (
        <g className="range-overlay" onClick={(e) => e.stopPropagation()}>
            {modeIndicator()}
            {isTrebleVisible && melodicStaff('treble', trebleStart, clefTreble, trebleRange, trebleFrame)}
            {isBassVisible && melodicStaff('bass', bassStart, clefBass, bassRange, bassFrame)}
            {isTrebleVisible && melodicPresetBrackets('treble', trebleStart, clefTreble, trebleRange, trebleFrame)}
            {isBassVisible && melodicPresetBrackets('bass', bassStart, clefBass, bassRange, bassFrame)}
            {isPercussionVisible && percussionStaffRow()}
            {isPercussionVisible && percussionPresets()}
        </g>
    );
};

export default RangeStaffOverlay;
