import React from 'react';
import NonLinearCarousel from './NonLinearCarousel';
import { EXERCISES } from '../../../exercises/exerciseIndex';

// ── In-staff EXERCISE selector (#266, epic #245, Han 2026-07-02) ─────────────
//
// A NonLinearCarousel of the exercise registry rendered on the treble staff —
// same primitive and card conventions as the instrument/colour setters (§6d:
// no bespoke carousel, no copied falloff constants). Selecting an exercise
// (tap or drag-settle) fires onSelectExercise, which App uses to apply the
// exercise config AND switch the bottom view to the songs tab (Han: "opens the
// songs on the bottom view and an exercise selector on the top view").
//
// The active exercise's DESCRIPTION renders below the carousel in the same
// caption style as the instrument setter's kit caption (fontSize 9,
// --text-secondary). §3a hit boxes are drawn inside NonLinearCarousel.

// Vertical geometry relative to the host staff's top line — mirrors the
// instrument setter's card layout (name ON the staff, caption below it).
const TITLE_DY = 22;   // exercise title baseline, on the staff
const CAPTION_DY = 52; // description baseline, below the staff
const HIT_TOP = -8;    // hit surface top relative to staff top
const HIT_H = 56;      // hit surface height
const BASE = 78;       // per-item slot stride at full scale (titles are wide)

const ExerciseStaffOverlay = ({
    startX,
    endX,
    trebleStart,
    bassStart,
    isTrebleVisible,
    activeExerciseId,
    onSelectExercise,
    onSettingsInteraction,
    debugMode = false,
}) => {
    // Host the carousel on the top VISIBLE staff (treble normally; bass when
    // the treble staff is hidden) — same fallback the other setters use.
    const staffStart = isTrebleVisible ? trebleStart : bassStart;
    const centerX = (startX + endX) / 2;

    const activeIndex = Math.max(0, EXERCISES.findIndex(e => e.id === activeExerciseId));
    const activeExercise = EXERCISES[activeIndex];

    // Card = title text only (SVG-native, no foreignObject — it doesn't
    // composite with the morph group opacity; see InstrumentStaffOverlay).
    // Active card: bold CAPS + glow, same highlight convention as the other setters.
    const renderItem = (item, i) => {
        const active = i === activeIndex;
        const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
        return (
            <g style={{
                pointerEvents: 'none',
                filter: active ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})` : 'none',
            }}>
                <text
                    x={0} y={staffStart + TITLE_DY} textAnchor="middle" fontSize={11}
                    fontFamily="sans-serif" fontWeight={active ? 'bold' : 'normal'} fill={color}>
                    {active ? item.title.toUpperCase() : item.title}
                </text>
            </g>
        );
    };

    return (
        <g className="exercise-overlay">
            <NonLinearCarousel
                items={EXERCISES}
                activeIndex={activeIndex}
                renderItem={renderItem}
                centerX={centerX}
                y={staffStart + HIT_TOP}
                baseWidth={BASE}
                height={HIT_H}
                visibleHalf={2}
                onSelect={(item) => {
                    onSettingsInteraction?.();
                    onSelectExercise?.(item);
                }}
                debugMode={debugMode}
            />
            {/* Active exercise description — caption below the staff, matching the
                instrument setter's kit caption style. */}
            {activeExercise && (
                <text
                    x={centerX} y={staffStart + CAPTION_DY}
                    textAnchor="middle" fontSize={9} fontFamily="sans-serif"
                    fill="var(--text-secondary, #888)" style={{ pointerEvents: 'none' }}>
                    {activeExercise.description}
                </text>
            )}
        </g>
    );
};

export default ExerciseStaffOverlay;
