import React from 'react';
import { BadgeCheck } from 'lucide-react';
import NonLinearCarousel from './NonLinearCarousel';
import { EXERCISES, AXES, AXIS_ORDER, AXIS_LABELS } from '../../../exercises/exerciseIndex';

// ── In-staff EXERCISE setter (#266 rework 2, epic #245, Han 2026-07-02) ──────
//
// EVERYTHING here is a NonLinearCarousel (§6d — Han: "Gebruik carousels. Niet
// in lijn met claude.md en style guide!" after the first pass hand-rolled flat
// option rows):
//   1. preset carousel on the top staff — lucide placeholder icon with the
//      ALL-CAPS title below it;
//   2. one carousel PER AXIS (MELODY / INPUT / TEMPO / REPEAT), stacked
//      vertically. The REPEAT carousel reuses the PLAYBACK repeats option list
//      (repsPerMelody) with 'until correct' LEFTMOST, shown as a BadgeCheck
//      icon (star-check does not exist in the installed lucide version — Han
//      approved BadgeCheck);
//   3. a prominent START button (also mirrored in the AppHeader).
//
// All carousel text is ALL CAPS (standing CR). §3a hit boxes come from
// NonLinearCarousel for the carousels and are drawn explicitly for START.

// Vertical geometry relative to the host staff's top line.
const ICON_SIZE = 20;
const ICON_DY = 4;       // preset icon top, on the staff
const TITLE_DY = 36;     // preset ALL-CAPS title baseline, below the icon
const AXES_DY = 52;      // first axis carousel centre-baseline offset
const AXIS_ROW_H = 20;   // per-axis row spacing (carousel needs more than flat text)
const AXIS_HIT_H = 14;   // axis carousel hit-surface height
const START_DY = 138;    // START button top
const START_W = 72;
const START_H = 18;
const PRESET_BASE = 74;  // preset carousel slot stride
const AXIS_BASE = 46;    // axis carousel slot stride (short CAPS labels)

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

    // Preset card = lucide icon (nested <svg> — composites with the morph group
    // opacity, unlike foreignObject) + ALL-CAPS title below. Active card
    // bright + glow, same highlight convention as the instrument setter.
    const renderPreset = (item, i) => {
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

    // Axis option card: ALL-CAPS label, or the BadgeCheck 'until correct' icon
    // for the leftmost REPEAT option. Same active-highlight convention.
    const renderAxisOption = (item, active, rowY) => {
        const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
        return (
            <g style={{
                pointerEvents: 'none',
                color,
                filter: active ? `drop-shadow(0 0 3px ${color})` : 'none',
            }}>
                {item.isUntil ? (
                    <BadgeCheck size={12} x={-6} y={rowY - 10} />
                ) : (
                    <text x={0} y={rowY} textAnchor="middle" fontSize={8}
                        fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'}
                        fill={color} letterSpacing={0.5}>
                        {item.label}
                    </text>
                )}
            </g>
        );
    };

    // Axis carousels centred in the area right of the axis-name column.
    const axisCenterX = startX + 40 + (endX - startX - 40) / 2;

    return (
        <g className="exercise-overlay">
            <NonLinearCarousel
                items={EXERCISES}
                activeIndex={activeIndex}
                renderItem={renderPreset}
                centerX={centerX}
                y={staffStart - 4}
                baseWidth={PRESET_BASE}
                height={TITLE_DY + 8}
                visibleHalf={2}
                onSelect={(item) => {
                    onSettingsInteraction?.();
                    onSelectExercise?.(item);
                }}
                debugMode={debugMode}
            />

            {/* One carousel per axis (§6d — the shared primitive, not bespoke rows). */}
            {AXIS_ORDER.map((axis, rowIdx) => {
                const rowY = staffStart + AXES_DY + rowIdx * AXIS_ROW_H;
                const options = AXES[axis];
                const current = Math.max(0, options.findIndex(o => o.value === axes?.[axis]));
                return (
                    <g key={axis}>
                        <text x={startX + 4} y={rowY} fontSize={7} fontFamily="sans-serif"
                            fill="var(--text-secondary, #888)" letterSpacing={1}
                            style={{ pointerEvents: 'none' }}>
                            {AXIS_LABELS[axis]}
                        </text>
                        <NonLinearCarousel
                            items={options}
                            activeIndex={current}
                            renderItem={(item, i) => renderAxisOption(item, i === current, rowY)}
                            centerX={axisCenterX}
                            y={rowY - AXIS_HIT_H + 4}
                            baseWidth={AXIS_BASE}
                            height={AXIS_HIT_H}
                            visibleHalf={options.length > 4 ? 3 : 1}
                            onSelect={(item) => {
                                onSettingsInteraction?.();
                                onAxisChange?.(axis, item.value);
                            }}
                            debugMode={debugMode}
                        />
                    </g>
                );
            })}

            {/* START — the prominent one-tap entry point (Han 2026-07-02:
                "maak het starten van een oefening prominenter"; also mirrored
                in the AppHeader). */}
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
