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
 *   melodic — press/drag anywhere on a staff row moves the nearest boundary to
 *             the column under the pointer and keeps following it (tap = a
 *             zero-distance drag). Pointer capture + SVG-coordinate mapping make
 *             this work for mouse and touch alike.
 *   percussion — tap a pad to toggle it in/out of the drum pool.
 *   presets — tap a melodic right-bracket to apply that range preset; tap a
 *             percussion preset label (BASIC/STANDARD/FULL) to apply that pool.
 *
 * Writes go through optional callbacks (onSetMelodicBoundary / onApplyMelodicPreset
 * / onTogglePad / onApplyPercussionPreset). Without them the overlay is a static
 * render (used by the smoke test). A "◆ RANGE SELECTOR" indicator marks the mode.
 */

const QUARTER = TICKS_PER_WHOLE / 4;   // quarter-note → filled head + stem, no flag/beam
const STAFF_HEIGHT = 40;               // 5 lines × 10 units (matches SheetMusic)
const HIT_PAD_Y = 55;                  // vertical padding of the per-row hit zone (covers ledger area)
// Reserved right margin holding the preset brackets/labels; also compacts the row.
const PRESET_AREA_WIDTH = 92;
const LOWLIGHT_OPACITY = 0.3;          // dim for melodic out-of-band notes
// Disabled percussion pads use a stronger dim so the active/inactive contrast
// reads clearly at a glance (Han 2026-05-31).
const PERC_DISABLED_OPACITY = 0.12;
// Preset-bracket geometry (right margin).
const BRACKET_TICK = 7;
const BRACKET_GAP = 26;
const BRACKET_LABEL_SIZE = 9;

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
        // Extent = exactly the clef's widest preset (no ±octave padding, which
        // previously made treble dip to A2 and overlap the bass staff). Clamped
        // to the app's hard bounds.
        const rowLow = Math.max(21, getNoteValue(frame.rowLow));
        const rowHigh = Math.min(108, getNoteValue(frame.rowHigh));
        const notes = naturalsInRange(rowLow, rowHigh);
        const N = notes.length;
        if (!N) return null;

        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);
        const noteWidth = (endX - PRESET_AREA_WIDTH - startX) / N;
        const allOffsets = Array.from({ length: N + 1 }, (_, i) => i);

        // Column index under an SVG x-coordinate (note i sits at startX+i*noteWidth).
        const colAt = (x) => Math.max(0, Math.min(N - 1, Math.round((x - startX) / noteWidth)));

        const out = [], inBand = [], boundary = [];
        notes.forEach((n, i) => {
            const entry = { name: n.name, offset: i + 1, midi: n.midi };
            if (n.midi === selMin || n.midi === selMax) boundary.push(entry);
            else if (n.midi > selMin && n.midi < selMax) inBand.push(entry);
            else out.push(entry);
        });

        const colorLayers = [
            { key: 'out', color: 'var(--text-dim)', opacity: LOWLIGHT_OPACITY, entries: out },
            { key: 'in', color: 'var(--text-primary)', opacity: 1, entries: inBand },
            { key: 'bound', color: 'var(--accent-yellow)', opacity: 1, entries: boundary },
        ];

        // Press = begin dragging the boundary nearest the pressed column, and
        // move it there immediately (so a plain tap also sets it).
        const onDown = (e) => {
            if (!onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            const midi = notes[colAt(x)].midi;
            const which = Math.abs(midi - selMin) <= Math.abs(midi - selMax) ? 'min' : 'max';
            dragRef.current = { staff, boundary: which };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not all envs */ }
            onSetMelodicBoundary(staff, midi, which, frame.presets);
        };
        const onMove = (e) => {
            const d = dragRef.current;
            if (!d || d.staff !== staff || !onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            onSetMelodicBoundary(staff, notes[colAt(x)].midi, d.boundary, frame.presets);
        };
        const onUp = () => { dragRef.current = null; };

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
                {/* Transparent hit zone spanning the row; pointer drag moves the
                    nearest boundary. One rect (not per-note) keeps it simple and
                    the coordinate mapping handles which column is targeted. */}
                {onSetMelodicBoundary && (
                    <rect
                        x={startX - noteWidth / 2}
                        y={staffStart - HIT_PAD_Y}
                        width={N * noteWidth}
                        height={STAFF_HEIGHT + 2 * HIT_PAD_Y}
                        fill="transparent"
                        style={{ cursor: 'ew-resize', touchAction: 'none' }}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                    />
                )}
                {/* Debug: visualise the drag hit zone (CLAUDE.md §3a). */}
                {debugMode && (
                    <rect
                        x={startX - noteWidth / 2}
                        y={staffStart - HIT_PAD_Y}
                        width={N * noteWidth}
                        height={STAFF_HEIGHT + 2 * HIT_PAD_Y}
                        fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
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
                    const midY = (yTop + yBottom) / 2;
                    const hitX = x - BRACKET_TICK - 12, hitY = yTop - 4;
                    const hitW = BRACKET_TICK + 18, hitH = yBottom - yTop + 8;
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
                            <text x={x - BRACKET_TICK - 2} y={midY}
                                fill={color} fontSize={BRACKET_LABEL_SIZE}
                                fontFamily="Georgia, serif" textAnchor="end"
                                dominantBaseline="middle"
                                transform={`rotate(-90 ${x - BRACKET_TICK - 2} ${midY})`}
                                style={{ pointerEvents: 'none' }}>
                                {p.label}
                            </text>
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
                {/* Per-pad transparent hit rects → toggle (+ debug box, §3a). */}
                {onTogglePad && ids.map((id, i) => {
                    const hx = startX + i * noteWidth - noteWidth / 2;
                    const hy = percussionStart - HIT_PAD_Y;
                    const hh = STAFF_HEIGHT + 2 * HIT_PAD_Y;
                    return (
                        <g key={`hit-${id}`}>
                            <rect x={hx} y={hy} width={noteWidth} height={hh}
                                fill="transparent" style={{ cursor: 'pointer' }}
                                onClick={() => onTogglePad(id)} />
                            {debugMode && (
                                <rect x={hx} y={hy} width={noteWidth} height={hh}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                        </g>
                    );
                })}
            </g>
        );
    };

    // ── Percussion preset labels (right margin, clickable) ────────────────────
    const percussionPresets = () => {
        const modes = ['BASIC', 'STANDARD', 'FULL'];
        const x = endX - PRESET_AREA_WIDTH + 10;
        const rowH = 13;
        return (
            <g className="range-presets range-presets-percussion">
                {modes.map((mode, i) => {
                    const isActive = sameSet(enabledPads, PERCUSSION_PRESETS[mode]);
                    const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
                    const y = percussionStart + 4 + i * rowH;
                    const hx = x - 2, hy = y - rowH + 3, hw = PRESET_AREA_WIDTH - 12, hh = rowH;
                    return (
                        <g key={mode}
                            style={{ cursor: onApplyPercussionPreset ? 'pointer' : 'default' }}
                            onClick={onApplyPercussionPreset ? () => onApplyPercussionPreset(mode) : undefined}>
                            <rect x={hx} y={hy} width={hw} height={hh} fill="transparent" />
                            {debugMode && (
                                <rect x={hx} y={hy} width={hw} height={hh}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                            <text x={x} y={y} fill={color}
                                fontSize={BRACKET_LABEL_SIZE} fontFamily="Georgia, serif"
                                style={{ pointerEvents: 'none' }}>
                                {mode}
                            </text>
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
