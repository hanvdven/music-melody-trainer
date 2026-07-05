import React from 'react';
import NonLinearCarousel from './NonLinearCarousel';
import { renderCarouselOptionGlyph, renderRepeatGlyph, renderStaffCardGlyph } from './carouselOptionGlyph';
import { EXERCISES, AXES } from '../../../exercises/exerciseIndex';

// ── In-staff EXERCISE setter (#266 rework 3, epic #245, Han 2026-07-03/05) ───
//
// Layout philosophy (Han): the settings must feel INTEGRATED into the sheet
// music — each axis lives where its subject lives in the real layout, like the
// clefs in the transposition setter:
//   · PRESETS  — big staff-height icon cards on the TOP staff (colour-setter
//     height, "plaatje + tekst eronder", ALL CAPS);
//   · MELODY + INPUT — icon cards side-by-side on the SECOND staff;
//   · TEMPO    — compact carousel AT the BPM display position (top-left,
//     BpmControls geometry: value line at trebleStart − 59);
//   · REPEAT   — compact carousel AT the repeat-sign position (top-right,
//     RepeatsControls geometry: baseline trebleStart − 25, right-aligned),
//     BadgeCheck 'until correct' leftmost;
//   · START    — prominent button below the axes (also mirrored in AppHeader).
//
// Everything is the shared NonLinearCarousel primitive with the SHARED card
// glyphs from carouselOptionGlyph (§6d — caps + icon conventions enforced in
// one place). §3a hit boxes come from NonLinearCarousel; START draws its own.

const START_W = 72;
const START_H = 18;

const ExerciseStaffOverlay = ({
    startX,
    endX,
    trebleStart,
    bassStart,
    isTrebleVisible,
    isBassVisible,
    activeExerciseId,
    axes,
    onSelectExercise,
    onAxisChange,
    onStartExercise,
    onSettingsInteraction,
    debugMode = false,
}) => {
    // Preset row hosts on the top VISIBLE staff; the MELODY/INPUT row prefers
    // the bass staff and falls back below the top staff when bass is hidden.
    const topStaff = isTrebleVisible ? trebleStart : bassStart;
    const rowStaff = isBassVisible ? bassStart : topStaff + 70;
    const centerX = (startX + endX) / 2;
    const width = endX - startX;

    const activeIndex = Math.max(0, EXERCISES.findIndex(e => e.id === activeExerciseId));
    const axisIndex = (axis) => Math.max(0, AXES[axis].findIndex(o => o.value === axes?.[axis]));

    const selectAxis = (axis) => (item) => {
        onSettingsInteraction?.();
        onAxisChange?.(axis, item.value);
    };

    // Small caps caption above an icon carousel (axis name) — same style as the
    // instrument setter's category labels.
    const axisCaption = (x, y, label) => (
        <text x={x} y={y} textAnchor="middle" fontSize={7} fontFamily="sans-serif"
            fill="var(--text-secondary, #888)" letterSpacing={1}
            style={{ pointerEvents: 'none' }}>
            {label}
        </text>
    );

    return (
        <g className="exercise-overlay">
            {/* PRESETS — staff-height icon cards on the top staff. */}
            <NonLinearCarousel
                items={EXERCISES}
                activeIndex={activeIndex}
                renderItem={(item, i) => renderStaffCardGlyph(item, i === activeIndex, topStaff)}
                centerX={centerX}
                y={topStaff - 4}
                baseWidth={92}
                height={60}
                visibleHalf={2}
                onSelect={(item) => {
                    onSettingsInteraction?.();
                    onSelectExercise?.(item);
                }}
                debugMode={debugMode}
            />

            {/* TEMPO — at the BPM display (BpmControls: x=25, value line
                trebleStart−59). FIXED/RUBATO next to the ♩= glyph so tempo feels
                like one editable unit with the BPM. */}
            {axisCaption(startX + 45, topStaff - 76, 'TEMPO')}
            <NonLinearCarousel
                items={AXES.tempo}
                activeIndex={axisIndex('tempo')}
                renderItem={(item, i) => renderCarouselOptionGlyph(item, i === axisIndex('tempo'), topStaff - 59)}
                centerX={startX + 45}
                y={topStaff - 71} /* hit-surface top just above the ♩=N value line (−59) */
                baseWidth={44}
                height={16}
                visibleHalf={1}
                onSelect={selectAxis('tempo')}
                debugMode={debugMode}
            />

            {/* REPEAT — at the repeat-sign position (RepeatsControls: baseline
                trebleStart−25, right-aligned at the system edge). BadgeCheck
                'until correct' leftmost; same option list as the PLAYBACK
                repeats carousel (§6c). */}
            {axisCaption(endX - 60, topStaff - 42, 'REPEAT')}
            <NonLinearCarousel
                items={AXES.evaluation}
                activeIndex={axisIndex('evaluation')}
                // Maestro repeat glyphs (#298 rework, Han: numRepeats renders in the
                // sheet's notation font EVERYWHERE — same as RepeatsControls + BPM).
                renderItem={(item, i) => renderRepeatGlyph(item, i === axisIndex('evaluation'), topStaff - 25)}
                centerX={endX - 60}
                y={topStaff - 37}
                baseWidth={28}
                height={16}
                visibleHalf={2}
                onSelect={selectAxis('evaluation')}
                debugMode={debugMode}
            />

            {/* MELODY (left) + INPUT (right) — icon cards on the second staff. */}
            {axisCaption(startX + width * 0.28, rowStaff - 6, 'MELODY')}
            <NonLinearCarousel
                items={AXES.melodyType}
                activeIndex={axisIndex('melodyType')}
                renderItem={(item, i) => renderStaffCardGlyph(item, i === axisIndex('melodyType'), rowStaff, { iconSize: 30 })}
                centerX={startX + width * 0.28}
                y={rowStaff - 2}
                baseWidth={70}
                height={58}
                visibleHalf={1}
                onSelect={selectAxis('melodyType')}
                debugMode={debugMode}
            />
            {axisCaption(startX + width * 0.76, rowStaff - 6, 'INPUT')}
            <NonLinearCarousel
                items={AXES.input}
                activeIndex={axisIndex('input')}
                renderItem={(item, i) => renderStaffCardGlyph(item, i === axisIndex('input'), rowStaff, { iconSize: 30 })}
                centerX={startX + width * 0.76}
                y={rowStaff - 2}
                baseWidth={70}
                height={58}
                visibleHalf={1}
                onSelect={selectAxis('input')}
                debugMode={debugMode}
            />

            {/* START — the prominent one-tap entry point (also in the AppHeader). */}
            <g onClick={() => { onSettingsInteraction?.(); onStartExercise?.(); }}
                style={{ cursor: 'pointer' }}>
                <rect x={centerX - START_W / 2} y={rowStaff + 62} width={START_W} height={START_H}
                    rx={4} fill="var(--accent-yellow, #e0b64d)" />
                <text x={centerX} y={rowStaff + 62 + START_H / 2}
                    textAnchor="middle" dominantBaseline="central" fontSize={10}
                    fontFamily="sans-serif" fontWeight="bold" fill="#1a1a1a" letterSpacing={2}
                    style={{ pointerEvents: 'none' }}>
                    START
                </text>
                {debugMode && (
                    <rect x={centerX - START_W / 2} y={rowStaff + 62} width={START_W} height={START_H}
                        fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
                        style={{ pointerEvents: 'none' }} />
                )}
            </g>
        </g>
    );
};

export default ExerciseStaffOverlay;
