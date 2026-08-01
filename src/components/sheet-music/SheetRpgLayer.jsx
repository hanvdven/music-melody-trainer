import React, { useState, useEffect, useMemo } from 'react';
import CharacterDoll, { CROP as DOLL_CROP } from '../character/CharacterDoll';
import { ANIMATIONS, basesFor } from '../../model/characterAssets';
import { loadCharacter } from '../../model/characterProfile';
import { SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_COLORS } from '../../model/enemyAssets';

// #647 RPG layer on the sheet music — a SEPARATE layer that is AWARE of note positions (Han). Two parts:
//  1. a SLIME under each treble note, on ONE fixed line, aligned to the note's X, coloured by duration
//     (green = quarter, blue = eighth, red = half/whole), facing LEFT, idle-animated;
//  2. the saved custom HERO (the paper-doll from the character creator) standing bottom-LEFT, facing right
//     (into the music), idle-animated — reusing the single CharacterDoll renderer via <foreignObject> (§6d).
//     Clicking the hero opens the character menu (Han: the header button was removed in favour of this).
//
// "For today" (Han): idle only, treble only, current page — NO playback sync yet (that is the later step).
// This is decorative chrome living in the SVG like the old ram mascot, NOT one of the rAF-animated melody
// layers, so the §6 timing invariants do not apply; a plain interval drives the idle frame. State is LOCAL
// so only this layer re-renders each frame, never the whole (heavy) SheetMusic tree.

const IDLE_MS = 160;

// Note tick durations: quarter = 12, eighth = 6, half = 24, whole = 48 (dotted quarter = 18). Han's mapping
// generalised as a formula (§6c): ≥ half → red, quarter-ish → green, shorter → blue.
const slimeColorKey = (d) => (d >= 24 ? 'red' : d >= 12 ? 'green' : 'blue');

// Slime sheet = 8 cols × 3 rows of 32×32 (green/blue/red share the layout). The image is drawn at native
// sheet size and the nested <svg> viewBox crops to the wanted frame's content region.
const SLIME_COLS = 8, SLIME_ROWS = 3;
const SLIME_VIEW_H = 22;   // on-sheet slime height in viewBox units (tunable)
const SLIME_VIEW_W = SLIME_VIEW_H * (SLIME_CROP.w / SLIME_CROP.h);
const HERO_H = 140;        // on-sheet hero height (Han: 2× bigger); tunable

// One idle slime, cropped to its content and mirrored to face LEFT (toward the hero). `frame` cycles the
// idle row. Rendered as a nested <svg> whose viewBox = the frame's crop region → it self-clips to the sprite.
function Slime({ x, y, colorKey, frame }) {
    const url = SLIME_COLORS[colorKey];
    if (!url) return null;
    const col = frame % SLIME_IDLE.frames;
    const ox = -col * SLIME_FRAME.w;                 // shift so frame `col` sits at image-x 0
    const oy = -SLIME_IDLE.row * SLIME_FRAME.h;
    // mirror within the crop window [cx, cx+cw] so the slime faces left
    const flip = `translate(${2 * SLIME_CROP.x + SLIME_CROP.w}, 0) scale(-1, 1)`;
    return (
        <svg x={x} y={y} width={SLIME_VIEW_W} height={SLIME_VIEW_H}
            viewBox={`${SLIME_CROP.x} ${SLIME_CROP.y} ${SLIME_CROP.w} ${SLIME_CROP.h}`}>
            <g transform={flip}>
                <image href={url} x={ox} y={oy} width={SLIME_COLS * SLIME_FRAME.w} height={SLIME_ROWS * SLIME_FRAME.h}
                    style={{ imageRendering: 'pixelated' }} />
            </g>
        </svg>
    );
}

// Ensure the hero has at least a skin so it is never invisible (the creator defaults skin+legs, but a raw
// profile might not have been saved yet).
function ensureVisible(char) {
    if (char.layers?.skin) return char;
    const s = basesFor('skin', char.gender || 'male')[0]?.variants[0];
    return s ? { ...char, layers: { ...char.layers, skin: { g: s.g, name: s.name } } } : char;
}

export default function SheetRpgLayer({
    trebleMelody, startX, pixelsPerTick, allOffsets, noteWidth,
    trebleStart, staffHeight, viewBottom, onOpenCharacter, debugMode = false,
}) {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setFrame((f) => f + 1), IDLE_MS);
        return () => clearInterval(id);
    }, []);

    const idleAnim = ANIMATIONS[0];                 // hero idle (rest, row 0)
    // read the saved character ONCE (not every idle tick — that would JSON.parse localStorage ~6×/s).
    const [savedChar] = useState(loadCharacter);
    const hero = useMemo(() => ensureVisible(savedChar), [savedChar]);

    // SAME positioning as renderMelodyNotes (getTickX): tick-based when pixelsPerTick is set (scroll modes),
    // else index-based via allOffsets + noteWidth (static/pagination — where ppt is null). Kept identical so
    // the slimes never drift from their notes (§6d). NOTE: ppt is null in the normal render, so without the
    // fallback branch the slimes vanished entirely (the whole layer was ppt-gated) — Han "kan de slimes niet
    // zien".
    const getTickX = pixelsPerTick != null
        ? (offset) => startX + offset * pixelsPerTick
        : (offset) => { const idx = allOffsets.indexOf(offset); return idx >= 0 ? startX + (idx - 1) * noteWidth : startX; };

    // slimes sit on one fixed line just below the treble staff, aligned to each note's X (rests skipped).
    const slimeY = trebleStart + staffHeight + 6;
    const slimes = [];
    if (trebleMelody && Array.isArray(trebleMelody.notes)) {
        const { notes, offsets, durations } = trebleMelody;
        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            if (note === 'r' || note === 'c' || note == null) continue;   // rest / spacer / empty → no slime
            slimes.push(
                <Slime key={i} x={getTickX(offsets[i]) - SLIME_VIEW_W / 2 + 3} y={slimeY}
                    colorKey={slimeColorKey(durations[i])} frame={frame} />,
            );
        }
    }

    // hero bottom-LEFT, feet aligned to the bottom of the view (Han). foreignObject sized to the doll so its
    // clickable region ≈ the character. Clicking opens the character menu (§3a: debug hit box in debugMode).
    const dollW = DOLL_CROP.w * (HERO_H / DOLL_CROP.h);
    const heroX = -2;
    const heroY = viewBottom - HERO_H;
    return (
        <g className="rpg-layer" data-rpg-layer="" style={{ pointerEvents: 'none' }}>
            {slimes}
            <foreignObject x={heroX} y={heroY} width={dollW} height={HERO_H} style={{ overflow: 'visible', pointerEvents: 'auto' }}>
                <div xmlns="http://www.w3.org/1999/xhtml" onClick={onOpenCharacter}
                    style={{ cursor: 'pointer' }} title="Open character">
                    <CharacterDoll char={hero} anim={idleAnim} frame={frame} height={HERO_H} />
                </div>
            </foreignObject>
            {debugMode && (
                <rect x={heroX} y={heroY} width={dollW} height={HERO_H}
                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1} style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
}
