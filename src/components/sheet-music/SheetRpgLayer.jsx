import React, { useState, useEffect, useMemo, useRef } from 'react';
import CharacterDoll, { CROP as DOLL_CROP } from '../character/CharacterDoll';
import { ANIMATIONS, basesFor } from '../../model/characterAssets';
import { loadCharacter } from '../../model/characterProfile';
import { SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_DEATH, SLIME_COLORS } from '../../model/enemyAssets';
import { noteToMidi } from '../../theory/noteUtils';

// #647 RPG layer on the sheet music — a SEPARATE layer that is AWARE of note positions (Han). Two parts:
//  1. a SLIME under each treble note, aligned to the note's X, coloured by duration (green = quarter,
//     blue = eighth, red = half/whole), facing LEFT, idle-animated;
//  2. the saved custom HERO (paper-doll) bottom-LEFT, facing right, idle — reusing CharacterDoll via
//     <foreignObject> (§6d). Clicking the hero opens the character menu.
//
// COMBAT (Han): every note the player plays (any input — piano/QWERTY/mic; all funnel through App's note
// handler) makes the hero play its ATTACK animation ONCE. If the note matches the LEFTMOST living slime by
// EXACT pitch+octave (noteToMidi), that slime plays its DEATH animation and is removed. When ALL slimes are
// dead, `onSlimesCleared` fires (App regenerates the melody → fresh slimes). Always on; own light matcher.
//
// This is decorative/game chrome living in the SVG, NOT an rAF melody layer, so §6 timing invariants do not
// apply; a plain interval drives frames. State is LOCAL so only this layer re-renders per tick.

const IDLE_MS = 160;
const ATTACK = ANIMATIONS.find((a) => a.key === 'attack') || ANIMATIONS[0];   // hero attack (row 5, 6 frames)

const slimeColorKey = (d) => (d >= 24 ? 'red' : d >= 12 ? 'green' : 'blue');   // §6c formula (see interview)

const SLIME_COLS = 8, SLIME_ROWS = 3;
const SLIME_VIEW_H = 33;   // on-sheet slime height (Han: +50%); tunable
const SLIME_VIEW_W = SLIME_VIEW_H * (SLIME_CROP.w / SLIME_CROP.h);
const HERO_H = 140;        // on-sheet hero height (Han: 2×); tunable

// EXACT pitch+octave match (Han): compare by MIDI so enharmonic spellings of the same piano key match. A
// chord (array) matches if any of its notes matches.
const notesMatch = (played, target) => {
    if (played == null || target == null) return false;
    const pm = noteToMidi(played);
    if (pm == null) return false;
    if (Array.isArray(target)) return target.some((t) => noteToMidi(t) === pm);
    return noteToMidi(target) === pm;
};

// One slime, cropped to its content and mirrored to face LEFT. Plays whichever row/frame is passed (idle or
// death). Rendered as a nested <svg> whose viewBox = the frame's crop region → it self-clips to the sprite.
function Slime({ x, y, colorKey, row, frame }) {
    const url = SLIME_COLORS[colorKey];
    if (!url) return null;
    const ox = -frame * SLIME_FRAME.w;
    const oy = -row * SLIME_FRAME.h;
    const flip = `translate(${2 * SLIME_CROP.x + SLIME_CROP.w}, 0) scale(-1, 1)`;   // face left
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

// Ensure the hero has at least a skin so it is never invisible.
function ensureVisible(char) {
    if (char.layers?.skin) return char;
    const s = basesFor('skin', char.gender || 'male')[0]?.variants[0];
    return s ? { ...char, layers: { ...char.layers, skin: { g: s.g, name: s.name } } } : char;
}

export default function SheetRpgLayer({
    trebleMelody, startX, pixelsPerTick, allOffsets, noteWidth,
    trebleStart, staffHeight, viewBottom, onOpenCharacter, onSlimesCleared, combatNote, debugMode = false,
}) {
    const idleAnim = ANIMATIONS[0];
    const [savedChar] = useState(loadCharacter);            // read once (not per tick)
    const hero = useMemo(() => ensureVisible(savedChar), [savedChar]);

    // SAME positioning as renderMelodyNotes (getTickX): tick-based when pixelsPerTick is set, else index-based
    // via allOffsets + noteWidth (ppt is null in the normal render — the fallback keeps slimes on their notes).
    const getTickX = pixelsPerTick != null
        ? (offset) => startX + offset * pixelsPerTick
        : (offset) => { const idx = allOffsets.indexOf(offset); return idx >= 0 ? startX + (idx - 1) * noteWidth : startX; };

    // ordered (left→right) slime data for the treble notes (rests/spacers skipped) — the "enemies".
    const slimeY = trebleStart + staffHeight + 12;   // Han: iets lager
    const slimeData = useMemo(() => {
        const out = [];
        if (trebleMelody && Array.isArray(trebleMelody.notes)) {
            const { notes, offsets, durations, ties } = trebleMelody;
            // A tie (`ties[i] === 'tie'`) joins note i to its CONTINUATION = the next entry with a real
            // offset (same logic renderMelodyNotes uses to draw the tie). Tied noteheads are ONE logical
            // note — e.g. a note split across a barline — so only the FIRST gets a slime (Han); skip every
            // continuation. Chains (A–B–C) fall out naturally: each tie marks its own continuation.
            const skip = new Set();
            if (ties) {
                for (let i = 0; i < notes.length; i++) {
                    if (ties[i] !== 'tie') continue;
                    for (let j = i + 1; j < notes.length; j++) {
                        if (offsets[j] != null) { skip.add(j); break; }
                    }
                }
            }
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                if (note === 'r' || note === 'c' || note == null || skip.has(i)) continue;
                out.push({ key: i, x: getTickX(offsets[i]) - SLIME_VIEW_W / 2 + 3, note, colorKey: slimeColorKey(durations[i]) });
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trebleMelody, startX, pixelsPerTick, noteWidth, trebleStart, staffHeight]);
    const total = slimeData.length;

    // ── combat state ──────────────────────────────────────────────────────────
    const [tick, setTick] = useState(0);                   // drives all idle/one-shot frame timing
    const [killedCount, setKilledCount] = useState(0);     // leftmost living slime = slimeData[killedCount]
    const [dying, setDying] = useState(null);              // { index, startTick } — slime playing death
    const [heroAttack, setHeroAttack] = useState(null);    // { startTick } — hero playing attack once
    const tickRef = useRef(0);
    const killedRef = useRef(0); killedRef.current = killedCount;
    const dyingRef = useRef(null); dyingRef.current = dying;
    const slimesRef = useRef(slimeData); slimesRef.current = slimeData;
    const clearedRef = useRef(false);

    // one interval drives the tick; tickRef lets the note handler read "now" without being a dep.
    useEffect(() => {
        const id = setInterval(() => { tickRef.current += 1; setTick(tickRef.current); }, IDLE_MS);
        return () => clearInterval(id);
    }, []);

    // reset combat when the melody (its slime notes) changes — a fresh wave of slimes.
    const notesKey = slimeData.map((s) => (Array.isArray(s.note) ? s.note.join('+') : s.note)).join('|');
    useEffect(() => { setKilledCount(0); setDying(null); clearedRef.current = false; }, [notesKey]);

    // a played note (any input) — key ONLY on the nonce so it fires once per note; read live state via refs.
    useEffect(() => {
        if (!combatNote) return;
        setHeroAttack({ startTick: tickRef.current });     // ANY note → hero attacks once
        const k = killedRef.current;
        if (!dyingRef.current && k < slimesRef.current.length && notesMatch(combatNote.note, slimesRef.current[k].note)) {
            setDying({ index: k, startTick: tickRef.current });   // match the LEFTMOST slime → it dies
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combatNote?.nonce]);

    // complete the one-shot animations (runs each tick with fresh state): a finished death removes the slime
    // (advances killedCount); a finished attack returns the hero to idle.
    useEffect(() => {
        if (dying && tick - dying.startTick >= SLIME_DEATH.frames) {
            setKilledCount((k) => Math.max(k, dying.index + 1));
            setDying(null);
        }
        if (heroAttack && tick - heroAttack.startTick >= ATTACK.frames) setHeroAttack(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    // wave cleared → regenerate (keyed on killedCount so it fires the moment the last slime is removed, not a
    // tick later — no dependence on a subsequent interval tick).
    useEffect(() => {
        if (total > 0 && killedCount >= total && !clearedRef.current) {
            clearedRef.current = true;
            onSlimesCleared?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [killedCount, total]);

    // ── render ────────────────────────────────────────────────────────────────
    const dollW = DOLL_CROP.w * (HERO_H / DOLL_CROP.h);
    const heroX = -2;
    const heroY = viewBottom - HERO_H;
    const heroAnim = heroAttack ? ATTACK : idleAnim;
    const heroFrame = heroAttack
        ? Math.min(tick - heroAttack.startTick, ATTACK.frames - 1)
        : tick % idleAnim.frames;

    return (
        <g className="rpg-layer" data-rpg-layer="" style={{ pointerEvents: 'none' }}>
            {slimeData.map((s, idx) => {
                if (idx < killedCount) return null;                       // already dead → gone
                const isDying = dying && dying.index === idx;
                const row = isDying ? SLIME_DEATH.row : SLIME_IDLE.row;
                const frame = isDying
                    ? Math.min(tick - dying.startTick, SLIME_DEATH.frames - 1)
                    : tick % SLIME_IDLE.frames;
                return <Slime key={s.key} x={s.x} y={slimeY} colorKey={s.colorKey} row={row} frame={frame} />;
            })}
            <foreignObject x={heroX} y={heroY} width={dollW} height={HERO_H} style={{ overflow: 'visible', pointerEvents: 'auto' }}>
                <div xmlns="http://www.w3.org/1999/xhtml" onClick={onOpenCharacter}
                    style={{ cursor: 'pointer' }} title="Open character">
                    <CharacterDoll char={hero} anim={heroAnim} frame={heroFrame} height={HERO_H} />
                </div>
            </foreignObject>
            {debugMode && (
                <rect x={heroX} y={heroY} width={dollW} height={HERO_H}
                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1} style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
}
