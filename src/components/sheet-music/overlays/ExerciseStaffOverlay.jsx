import React from 'react';
import { CarouselField } from '../CarouselFieldItem';
import { renderRepeatGlyph, MiniRepeatSign } from './carouselOptionGlyph';
import { LeftFanCarousel } from './fanCarousels';
import { EXERCISES, AXES } from '../../../exercises/exerciseIndex';
import { useProfile } from '../../../contexts/ProfileContext';

// ── In-staff EXERCISE setter — CONSISTENT with the other setters (#560, Han 2026-07-25) ──────────
//
// REDESIGN (audit #559 F2): the exercise setter used its own axis-positional layout (preset cards on
// the top staff, melody/input side-by-side, tempo top-left, repeat top-right, a START button). Han:
// make it "zo consistent mogelijk met de andere tabs; dus zelfde soort carousels". So it is now the
// SAME shape as the generation/colour setters — one hidden tap-to-open `CarouselField` PER STAFF
// (with the shared veil + single-open), stacked:
//   · row 1 (treble)      → PRESET      (the 6 exercises)
//   · row 2 (bass)        → MELODY TYPE (AXES.melodyType)
//   · row 3 (percussion)  → INPUT TYPE  (AXES.input)
// and TEMPO + REPEAT sit on the chords band EXACTLY like the PLAYBACK setter's measures/repeats fans
// (compact vertical `LeftFanCarousel`). The START button is GONE — it lives in the header (Han).
//
// Item content: the exercise/axis items already carry a lucide `.Icon` + `.title`/`.label`, so
// `CarouselField`'s shared `makeRenderItem` renders them (icon on top, caps label below) — the SAME
// path the generation melody-type carousel uses (§6d). No hand-rolled card glyph.

// Shared sizing (mirrors the generation setter's named consts, §6d).
const BASE = 70, ICON = 30, ICON_DY = -19, LABEL_DY = 38, LABEL_FS = 11, BRACKET_DY = -32;
const HIT_TOP = -30, HIT_H = 60, HEADER_DY = -31;   // header at rowCenterY−31 = staffStart−11

const ExerciseStaffOverlay = ({
    startX,
    endX,
    systemEndX,
    trebleStart,
    bassStart,
    percussionStart,
    isTrebleVisible,
    isBassVisible,
    isPercussionVisible,
    activeExerciseId,
    axes,
    onSelectExercise,
    onAxisChange,
    onSettingsInteraction,
    debugMode = false,
}) => {
    // #268: persistent per-exercise progress (runs / melodies) from the profile — shown under the
    // active PRESET carousel.
    const { exerciseProgress } = useProfile();
    // Single-open coordination across the three carousels (mirrors the generation setter).
    const [activeFieldId, setActiveFieldId] = React.useState(null);
    if (startX == null || endX == null) return null;

    const axisIndex = (axis) => Math.max(0, AXES[axis].findIndex(o => o.value === axes?.[axis]));
    const selectAxis = (axis) => (item) => { onSettingsInteraction?.(); onAxisChange?.(axis, item.value); };
    const fireInteraction = () => onSettingsInteraction?.();

    // The three stacked staff rows. Preset uses the top VISIBLE staff; melody/input fall back below it
    // when their staff is hidden, so the three carousels never collapse onto each other.
    const topStaff = isTrebleVisible ? trebleStart : bassStart;
    const bassRow = isBassVisible ? bassStart : (topStaff + 100);
    const percRow = isPercussionVisible ? percussionStart : (bassRow + 100);

    const presetItems = EXERCISES.map(e => ({ value: e.id, label: e.title, Icon: e.Icon }));
    const presetIndex = Math.max(0, EXERCISES.findIndex(e => e.id === activeExerciseId));

    // Row descriptors. NB: unlike the generation setter we do NOT reorder the active field to the end
    // (Han 2026-07-25: "de carousels ... interageren precies anders ... klik - pak, sleep"). Each row
    // sits on its OWN staff, far from the others, so an open carousel's localized veil never overlaps a
    // neighbouring row — the active-last reorder (needed only when boxes overlap) is unnecessary here,
    // and skipping it keeps the DOM node stable across the first press so press-and-hold-drag works in
    // ONE gesture (no reveal-tap first).
    const rows = [
        {
            id: 'preset', header: 'preset', staffStart: topStaff, items: presetItems, activeIndex: presetIndex,
            onSelect: (item) => { fireInteraction(); onSelectExercise?.(EXERCISES.find(e => e.id === item.value)); },
        },
        {
            id: 'melody', header: 'melody type', staffStart: bassRow, items: AXES.melodyType,
            activeIndex: axisIndex('melodyType'), onSelect: selectAxis('melodyType'),
        },
        {
            id: 'input', header: 'input type', staffStart: percRow, items: AXES.input,
            activeIndex: axisIndex('input'), onSelect: selectAxis('input'),
        },
    ];
    const cells = rows.map(r => ({ r, cx: (startX + endX) / 2 }));

    // TEMPO + REPEAT on the chords band, EXACTLY like the playback setter (compact LeftFanCarousel).
    const CHORD_ROW_Y = trebleStart - 64;
    const fanX = (frac) => startX + frac * ((systemEndX ?? endX) - startX);

    return (
        <g className="exercise-overlay">
            {cells.map(({ r, cx }) => (
                <CarouselField
                    key={r.id}
                    items={r.items}
                    activeIndex={r.activeIndex}
                    onSelect={r.onSelect}
                    centerX={cx}
                    rowCenterY={r.staffStart + 20}
                    baseWidth={BASE}
                    hitTop={HIT_TOP}
                    hitHeight={HIT_H}
                    iconSize={ICON}
                    iconDy={ICON_DY}
                    labelDy={LABEL_DY}
                    labelFontSize={LABEL_FS}
                    bracketDy={BRACKET_DY}
                    headerDy={HEADER_DY}
                    labelAbove={r.header}
                    staffLineYs={[-20, -10, 0, 10, 20].map(d => r.staffStart + 20 + d)}
                    staffX0={startX}
                    staffX1={endX}
                    fieldId={r.id}
                    activeFieldId={activeFieldId}
                    onActivate={setActiveFieldId}
                    visibleHalf={2}
                    hidden
                    debugMode={debugMode}
                />
            ))}

            {/* #268: persistent progress for the ACTIVE preset, just under its value label. */}
            {(() => {
                const prog = exerciseProgress?.[EXERCISES[presetIndex]?.id];
                if (!prog || (!prog.runs && !prog.melodies)) return null;
                return (
                    <text x={(startX + endX) / 2} y={topStaff + 72} textAnchor="middle" fontSize={8}
                        fontFamily="sans-serif" letterSpacing={0.5}
                        fill="var(--text-secondary, #888)" style={{ pointerEvents: 'none' }}>
                        {`RUNS ${prog.runs} · MELODIES ${prog.melodies}`}
                    </text>
                );
            })()}

            {/* TEMPO — playback-style compact fan on the chords band (measures position): the
                fixed/rubato mode. The BPM itself is set from the header BpmControls (as in the playback
                setter, which likewise has no inline BPM here) — Han: "precies dezelfde manier als
                playback". */}
            <g transform={`translate(${fanX(0.70)}, ${CHORD_ROW_Y})`}>
                <text x="0" y={-25} fontFamily="serif" fontStyle="italic" fontSize="14"
                    fill="var(--text-secondary)" textAnchor="middle" className="svg-no-interact">tempo</text>
                <LeftFanCarousel
                    cx={0} centerY={-6} items={AXES.tempo}
                    activeIndex={axisIndex('tempo')}
                    /* tempo items carry a Maestro glyph (♩ fixed / fermata rubato), not a text label —
                       render it in Maestro at the fan size, like the playback measures/repeats fans. */
                    renderLabel={(it) => it.maestroGlyph}
                    labelFontFamily="Maestro"
                    activeLabelSize={32}
                    /* #tempo (Han 2026-07-25): tempo scrolls the SAME as every other fan (invert) —
                       consistent tempo scroll direction on all screens. */
                    compact invert fieldLines={[]}
                    onCommit={(i) => selectAxis('tempo')(AXES.tempo[i])}
                    debugMode={debugMode}
                />
            </g>

            {/* REPEAT — identical to the playback setter's repeats fan (renderRepeatGlyph, BadgeCheck
                'until correct' included via AXES.evaluation). */}
            <g transform={`translate(${fanX(0.85)}, ${CHORD_ROW_Y})`}>
                <text x="0" y={-25} fontFamily="serif" fontStyle="italic" fontSize="14"
                    fill="var(--text-secondary)" textAnchor="middle" className="svg-no-interact">repeat</text>
                <LeftFanCarousel
                    cx={0} centerY={-6} items={AXES.evaluation}
                    activeIndex={axisIndex('evaluation')}
                    activeLabelSize={32} compact invert fieldLines={[]}
                    renderNode={(item, { active, size }) => (
                        <g transform={`scale(${size / 32})`}>{renderRepeatGlyph(item, active, 0)}</g>
                    )}
                    onCommit={(i) => selectAxis('evaluation')(AXES.evaluation[i])}
                    debugMode={debugMode}
                />
            </g>
            {axes?.evaluation !== 1 && (
                <MiniRepeatSign x={fanX(0.85) + 108} y={CHORD_ROW_Y - 16} h={24} />
            )}
        </g>
    );
};

export default ExerciseStaffOverlay;
