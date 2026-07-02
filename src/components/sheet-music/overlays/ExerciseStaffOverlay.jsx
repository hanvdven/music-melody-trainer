import React from 'react';
import NonLinearCarousel from './NonLinearCarousel';
import { EXERCISES, AXES, AXIS_ORDER, AXIS_LABELS, isAxisOptionEnabled } from '../../../exercises/exerciseIndex';

// ── In-staff EXERCISE setter (#266 rework, epic #245, Han 2026-07-02) ────────
//
// Layout uses the setter's full HEIGHT (Han: "gebruik de hoogte om de
// verschillende assen instelbaar te maken"):
//   1. preset carousel on the top staff — lucide placeholder icon with the
//      ALL-CAPS title below it (Han: "plaatje + tekst eronder", all carousel
//      text all-caps per the standing CR);
//   2. four axis rows (MELODY / INPUT / TEMPO / REPEAT) — tap an option to set
//      that axis; options that the current combination forbids are dimmed
//      (isAxisOptionEnabled, e.g. HEAR × RUBATO);
//   3. a prominent START button — App decides what starting means per the
//      input axis (hear → continuous playback, read/replay → input test).
//
// The carousel is the shared NonLinearCarousel primitive (§6d); each axis
// option and the START button carry §3a debug hit boxes.

// Vertical geometry relative to the host staff's top line.
const ICON_SIZE = 20;
const ICON_DY = 4;      // icon top, on the staff
const TITLE_DY = 36;    // ALL-CAPS title baseline, below the icon
const AXES_DY = 58;     // first axis row baseline
const AXIS_ROW_H = 16;  // per-axis row spacing
const START_DY = 126;   // START button top
const START_W = 72;
const START_H = 18;
const BASE = 74;        // carousel slot stride at full scale

const AXIS_LABEL_FS = 7;   // axis name (left column)
const AXIS_OPTION_FS = 8;  // option labels
const OPTION_HIT_H = 12;   // §3a hit rect height around each option

const ExerciseStaffOverlay = ({
    startX,
    endX,
    trebleStart,
    bassStart,
    isTrebleVisible,
    activeExerciseId,
    axes,
    onSelectExercise,
    onAxisChange,
    onStartExercise,
    onSettingsInteraction,
    debugMode = false,
}) => {
    // Host on the top VISIBLE staff (treble normally; bass when treble hidden).
    const staffStart = isTrebleVisible ? trebleStart : bassStart;
    const centerX = (startX + endX) / 2;

    const activeIndex = Math.max(0, EXERCISES.findIndex(e => e.id === activeExerciseId));

    // Card = lucide icon (nested <svg> — composites with the morph group
    // opacity, unlike foreignObject) + ALL-CAPS title below. Active card
    // bright + glow, same highlight convention as the instrument setter.
    const renderItem = (item, i) => {
        const active = i === activeIndex;
        const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
        const Icon = item.Icon;
        return (
            <g style={{
                pointerEvents: 'none',
                color, // lucide strokes use currentColor
                filter: active ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})` : 'none',
            }}>
                <Icon size={ICON_SIZE} x={-ICON_SIZE / 2} y={staffStart + ICON_DY} />
                <text
                    x={0} y={staffStart + TITLE_DY} textAnchor="middle" fontSize={9}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'} fill={color}
                    letterSpacing={0.5}>
                    {item.title}
                </text>
            </g>
        );
    };

    // Axis option columns spread over the width right of the axis-name column.
    const optionsLeft = startX + 62;
    const optionsRight = endX - 8;

    return (
        <g className="exercise-overlay">
            <NonLinearCarousel
                items={EXERCISES}
                activeIndex={activeIndex}
                renderItem={renderItem}
                centerX={centerX}
                y={staffStart - 4}
                baseWidth={BASE}
                height={TITLE_DY + 8}
                visibleHalf={2}
                onSelect={(item) => {
                    onSettingsInteraction?.();
                    onSelectExercise?.(item);
                }}
                debugMode={debugMode}
            />

            {/* Axis rows — one per AXIS_ORDER entry. */}
            {AXIS_ORDER.map((axis, rowIdx) => {
                const y = staffStart + AXES_DY + rowIdx * AXIS_ROW_H;
                const options = AXES[axis];
                const step = (optionsRight - optionsLeft) / options.length;
                return (
                    <g key={axis}>
                        <text x={startX + 4} y={y} fontSize={AXIS_LABEL_FS} fontFamily="sans-serif"
                            fill="var(--text-secondary, #888)" letterSpacing={1}
                            style={{ pointerEvents: 'none' }}>
                            {AXIS_LABELS[axis]}
                        </text>
                        {options.map((opt, oi) => {
                            const x = optionsLeft + step * (oi + 0.5);
                            const selected = axes?.[axis] === opt.value;
                            const enabled = isAxisOptionEnabled(axes || {}, axis, opt.value);
                            const color = !enabled ? 'var(--text-lowlight)'
                                : selected ? 'var(--text-primary)' : 'var(--text-secondary, #888)';
                            return (
                                <g key={String(opt.value)}
                                    onClick={() => {
                                        if (!enabled) return;
                                        onSettingsInteraction?.();
                                        onAxisChange?.(axis, opt.value);
                                    }}
                                    style={{ cursor: enabled ? 'pointer' : 'default' }}>
                                    {/* transparent hit target — sized to the option slot */}
                                    <rect x={x - step / 2} y={y - OPTION_HIT_H + 3} width={step} height={OPTION_HIT_H}
                                        fill="transparent" />
                                    <text x={x} y={y} textAnchor="middle" fontSize={AXIS_OPTION_FS}
                                        fontFamily="sans-serif" fontWeight={selected ? 'bold' : 'normal'}
                                        fill={color} letterSpacing={0.5}
                                        opacity={enabled ? 1 : 0.35}
                                        style={{ pointerEvents: 'none' }}>
                                        {opt.label}
                                    </text>
                                    {/* selected underline — matches staff-line chrome (0.5 weight) */}
                                    {selected && (
                                        <line x1={x - step / 2 + 6} y1={y + 3} x2={x + step / 2 - 6} y2={y + 3}
                                            stroke="var(--text-primary)" strokeWidth="0.5"
                                            style={{ pointerEvents: 'none' }} />
                                    )}
                                    {debugMode && (
                                        <rect x={x - step / 2} y={y - OPTION_HIT_H + 3} width={step} height={OPTION_HIT_H}
                                            fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
                                            style={{ pointerEvents: 'none' }} />
                                    )}
                                </g>
                            );
                        })}
                    </g>
                );
            })}

            {/* START — the prominent one-tap entry point (Han 2026-07-02:
                "maak het starten van een oefening prominenter"). */}
            <g onClick={() => { onSettingsInteraction?.(); onStartExercise?.(); }}
                style={{ cursor: 'pointer' }}>
                <rect x={centerX - START_W / 2} y={staffStart + START_DY} width={START_W} height={START_H}
                    rx={4} fill="var(--accent-yellow, #e0b64d)" />
                <text x={centerX} y={staffStart + START_DY + START_H / 2}
                    textAnchor="middle" dominantBaseline="central" fontSize={10}
                    fontFamily="sans-serif" fontWeight="bold" fill="#1a1a1a" letterSpacing={2}
                    style={{ pointerEvents: 'none' }}>
                    START
                </text>
                {debugMode && (
                    <rect x={centerX - START_W / 2} y={staffStart + START_DY} width={START_W} height={START_H}
                        fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
                        style={{ pointerEvents: 'none' }} />
                )}
            </g>
        </g>
    );
};

export default ExerciseStaffOverlay;
