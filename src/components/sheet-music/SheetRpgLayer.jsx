import React, { useState, useEffect, useMemo, useRef } from 'react';
import CharacterDoll, { CROP as DOLL_CROP } from '../character/CharacterDoll';
import { ANIMATIONS, basesFor } from '../../model/characterAssets';
import { loadCharacter } from '../../model/characterProfile';
import { SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_WALK, SLIME_DEATH, SLIME_COLORS } from '../../model/enemyAssets';
import { noteToMidi } from '../../theory/noteUtils';
import { getNoteAbsoluteY } from './renderMelodyNotes';
import { QUARTER_GLYPH, NOTE_FONT_SIZE } from './staffNoteGlyph';

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

const IDLE_MS = 160;   // fallback frame interval when bpm is unknown
const ATTACK = ANIMATIONS.find((a) => a.key === 'attack') || ANIMATIONS[0];   // hero attack (row 5, 6 frames)
// On the SHEET the attack uses only the LAST 3 frames of the 6 (Han: the full swing is too long in playback;
// the creator/menu still plays all 6). One attack cycle = 3 attack frames + a 2-frame delay = 5 frames — i.e.
// exactly one beat at the bpm-coupled frame rate below, matching the 5-frame idle loop.
const ATTACK_SHEET_START = 3, ATTACK_SHEET_FRAMES = 3, ATTACK_DELAY = 2;
const ATTACK_CYCLE = ATTACK_SHEET_FRAMES + ATTACK_DELAY;   // 5 frames
// Frame interval coupled to tempo (Han): 12/bpm seconds per frame, so the 5-frame idle loops once per
// quarter-note beat (5 × 12/bpm = 60/bpm s). Faster bpm → faster animation.
const frameMsForBpm = (bpm) => (bpm > 0 ? 12000 / bpm : IDLE_MS);

// colour by note length (Han 2026-08-01: RED = short, BLUE = long; green = the middle). §6c formula.
const slimeColorKey = (d) => (d >= 24 ? 'blue' : d >= 12 ? 'green' : 'red');

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
function Slime({ x, y, colorKey, row, frame, opacity = 1 }) {
    const url = SLIME_COLORS[colorKey];
    if (!url) return null;
    const ox = -frame * SLIME_FRAME.w;
    const oy = -row * SLIME_FRAME.h;
    const flip = `translate(${2 * SLIME_CROP.x + SLIME_CROP.w}, 0) scale(-1, 1)`;   // face left
    return (
        <svg x={x} y={y} width={SLIME_VIEW_W} height={SLIME_VIEW_H} opacity={opacity}
            viewBox={`${SLIME_CROP.x} ${SLIME_CROP.y} ${SLIME_CROP.w} ${SLIME_CROP.h}`}>
            <g transform={flip}>
                <image href={url} x={ox} y={oy} width={SLIME_COLS * SLIME_FRAME.w} height={SLIME_ROWS * SLIME_FRAME.h}
                    style={{ imageRendering: 'pixelated' }} />
            </g>
        </svg>
    );
}

// #660 Level 2 side-scroll geometry. The render interval is decoupled from the sprite frame rate: it ticks
// FAST (INTERVAL_MS ≈ 120fps, Han) so movement is smooth, while each sprite's animation frame is derived from
// ELAPSED TIME ÷ the bpm-coupled frame duration, so the sprites still step at the right musical speed.
// The NOTES move LINEARLY; the SLIMES HOP (Han: a blob must STAND STILL on walk frames 1,2,8 = 0-indexed
// 0,1,7) — so the slime's x follows `movingProgress` (advances only on the moving frames 3–7, smoothly WITHIN
// them thanks to the high fps), while the note above it glides linearly.
const INTERVAL_MS = 8;
const TICKS_PER_BEAT = 12;   // note ticks per quarter-note beat
const HITZONE_W = 70;        // width (viewBox units) of the strike zone in front of the hero (startX..+W)
// complete moving frames in [0, n): moving frames (0-indexed) are 2..6 (= Han's walk frames 3–7).
const movingFramesBefore = (n) => { const c = Math.floor(n / 8); const rem = n - c * 8; return c * 5 + Math.max(0, Math.min(rem - 2, 5)); };
// continuous moving progress at fractional frame `ff`: whole moving frames + the partial of the current frame
// IF it is a moving one (so x advances smoothly during 3–7 and pauses flat during 1,2,8).
const movingProgress = (ff) => {
    const full = Math.floor(ff), frac = ff - full, inCycle = full % 8;
    return movingFramesBefore(full) + (inCycle >= 2 && inCycle <= 6 ? frac : 0);
};

// Ensure the hero has at least a skin so it is never invisible.
function ensureVisible(char) {
    if (char.layers?.skin) return char;
    const s = basesFor('skin', char.gender || 'male')[0]?.variants[0];
    return s ? { ...char, layers: { ...char.layers, skin: { g: s.g, name: s.name } } } : char;
}

export default function SheetRpgLayer({
    trebleMelody, startX, pixelsPerTick, allOffsets, noteWidth, bpm,
    trebleStart, staffHeight, viewBottom, onOpenCharacter, onSlimesCleared, onHit, onMiss, combatNote,
    sideScroll = false, viewRight = 0, beatsOnScreen = 8, clef = 'treble', debugMode = false,
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
            const nextReal = (from) => { for (let j = from + 1; j < notes.length; j++) if (offsets[j] != null) return j; return -1; };
            const skip = new Set();
            if (ties) for (let i = 0; i < notes.length; i++) if (ties[i] === 'tie') { const c = nextReal(i); if (c >= 0) skip.add(c); }
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                if (note === 'r' || note === 'c' || note == null || skip.has(i)) continue;
                // colour by the TOTAL length across the tie chain (Han: not the first segment) — sum the
                // start's duration + every continuation's.
                let total = durations[i], k = i;
                while (ties && ties[k] === 'tie') { const c = nextReal(k); if (c < 0) break; total += durations[c]; k = c; }
                // `beat` = the note's position in beats (side-scroll spawns/arrives on it). offset in ticks / 12.
                out.push({ key: i, x: getTickX(offsets[i]) - SLIME_VIEW_W / 2 + 3, beat: offsets[i] / TICKS_PER_BEAT, note, colorKey: slimeColorKey(total) });
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trebleMelody, startX, pixelsPerTick, noteWidth, trebleStart, staffHeight]);
    const total = slimeData.length;

    // sprite frame duration (bpm-coupled) + beat length — SEPARATE from the render interval (INTERVAL_MS).
    const frameMs = frameMsForBpm(bpm);
    const beatMs = bpm > 0 ? 60000 / bpm : 750;

    // ── combat state ──────────────────────────────────────────────────────────
    // `tick` counts INTERVAL_MS steps (fast, for smooth movement). Sprite frames = elapsed-ms ÷ frameMs.
    const [tick, setTick] = useState(0);
    const [killedCount, setKilledCount] = useState(0);     // static: killed count; side-scroll: RESOLVED count
    const [dying, setDying] = useState(null);              // { index, startTick, x } — slime playing death
    const [killedSet, setKilledSet] = useState(() => new Set());   // side-scroll: struck slimes (death done → hidden)
    const [heroAttack, setHeroAttack] = useState(null);    // { startTick } — hero playing attack once
    const tickRef = useRef(0);
    const killedRef = useRef(0); killedRef.current = killedCount;
    const dyingRef = useRef(null); dyingRef.current = dying;
    const slimesRef = useRef(slimeData); slimesRef.current = slimeData;
    const clearedRef = useRef(false);
    const heroAttackRef = useRef(null); heroAttackRef.current = heroAttack;
    // hit/miss callbacks via refs so the nonce-keyed note effect always sees the latest (no stale closure).
    const onHitRef = useRef(onHit); onHitRef.current = onHit;
    const onMissRef = useRef(onMiss); onMissRef.current = onMiss;
    const waveStartRef = useRef(0);                        // tick at which the current wave's clock started
    const geomRef = useRef({});                            // geometry read by the effects "at now"
    geomRef.current = { startX, viewRight, beatsOnScreen, sideScroll, beatMs, frameMs };

    // frames elapsed since a start tick (integer sprite frame) and the ms elapsed.
    const framesSince = (startTick, fMs = frameMs) => Math.floor((tick - startTick) * INTERVAL_MS / fMs);

    // #660 side-scroll positions: a slime spawns at its own `beat` and travels to startX over `beatsOnScreen`
    // beats, then keeps going off the left edge if never struck. The NOTE moves LINEARLY (noteX); the SLIME
    // HOPS (slimeX) — pausing on walk frames 1,2,8 — via `movingProgress`. `x` (= slimeX) is what the hit-zone
    // and escape use (you strike the blob, not the glyph).
    const sideScrollX = (beat, atTick) => {
        const { startX: sx, viewRight: vr, beatsOnScreen: bos, beatMs: bMs, frameMs: fMs } = geomRef.current;
        const msSinceSpawn = (atTick - waveStartRef.current) * INTERVAL_MS - beat * bMs;
        const dist = vr - sx;
        const noteX = vr - (msSinceSpawn / (bos * bMs)) * dist;                 // linear
        const totalFrames = Math.round((bos * bMs) / fMs);                     // walk frames over the crossing
        const ff = msSinceSpawn / fMs;                                         // fractional frame since spawn
        const slimeX = vr - movingProgress(Math.max(0, ff)) * (dist / (movingFramesBefore(totalFrames) || 1));
        return { x: slimeX, slimeX, noteX, walkFrame: msSinceSpawn >= 0 ? Math.floor(ff) % SLIME_WALK.frames : 0, spawned: msSinceSpawn >= 0 };
    };

    // one fast interval drives the tick for smooth movement; tickRef lets the note handler read "now".
    useEffect(() => {
        const id = setInterval(() => { tickRef.current += 1; setTick(tickRef.current); }, INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    // reset combat when the melody (its slime notes) changes — a fresh wave; the side-scroll clock restarts.
    const notesKey = slimeData.map((s) => (Array.isArray(s.note) ? s.note.join('+') : s.note)).join('|');
    useEffect(() => {
        setKilledCount(0); setDying(null); setKilledSet(new Set()); clearedRef.current = false;
        waveStartRef.current = tickRef.current;
    }, [notesKey]);

    // a played note (any input) — key ONLY on the nonce so it fires once per note; read live state via refs.
    useEffect(() => {
        if (!combatNote) return;
        const fMs = geomRef.current.frameMs;
        // ANY note → hero attacks once, but not more often than one attack cycle (the 2-frame delay).
        if (!heroAttackRef.current || (tickRef.current - heroAttackRef.current.startTick) * INTERVAL_MS >= ATTACK_CYCLE * fMs) {
            setHeroAttack({ startTick: tickRef.current });
        }
        const k = killedRef.current;
        const s = slimesRef.current[k];
        if (dyingRef.current || !s) return;
        const matches = notesMatch(combatNote.note, s.note);
        if (geomRef.current.sideScroll) {
            // Level 2: a kill only counts when the leftmost slime is in the HIT-ZONE by the hero
            // (startX..startX+HITZONE_W). Too early / a wrong note = miss but does NOT resolve the slime.
            const { x } = sideScrollX(s.beat, tickRef.current);
            const inZone = x >= geomRef.current.startX && x <= geomRef.current.startX + HITZONE_W;
            if (matches && inZone) { setDying({ index: k, startTick: tickRef.current, x }); setKilledCount((c) => c + 1); onHitRef.current?.(); }
            else onMissRef.current?.();
        } else if (matches) {
            setDying({ index: k, startTick: tickRef.current, x: s.x }); onHitRef.current?.();
        } else {
            onMissRef.current?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combatNote?.nonce]);

    // complete the one-shot animations each tick. Side-scroll: a struck slime that finishes its death is
    // hidden (killedSet); a slime that reaches the hero UN-struck is NOT killed (Han) — it just keeps walking
    // off the left edge — but it counts as a miss and lets the next slime become the target.
    useEffect(() => {
        if (dying && framesSince(dying.startTick) >= SLIME_DEATH.frames) {
            if (geomRef.current.sideScroll) setKilledSet((set) => { const n = new Set(set); n.add(dying.index); return n; });
            else setKilledCount((k) => Math.max(k, dying.index + 1));
            setDying(null);
        }
        if (heroAttack && framesSince(heroAttack.startTick) >= ATTACK_CYCLE) setHeroAttack(null);
        if (geomRef.current.sideScroll) {
            const s = slimesRef.current[killedRef.current];
            if (s) { const { x, spawned } = sideScrollX(s.beat, tick); if (spawned && x < geomRef.current.startX) { setKilledCount((c) => c + 1); onMissRef.current?.(); } }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    // wave cleared → regenerate (keyed on killedCount so it fires the moment the last slime is resolved). A
    // slime counts as resolved whether it was struck or walked past (missed), so a side-scroll wave also ends
    // if the player misses them all.
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
    const gFrame = Math.floor(tick * INTERVAL_MS / frameMs);   // ever-increasing sprite frame counter (cyclic use)
    // hero: during the first 3 frames of an attack show the LAST 3 attack frames (3,4,5); else idle loop.
    let heroAnim = idleAnim, heroFrame = gFrame % idleAnim.frames;
    if (heroAttack) {
        const e = framesSince(heroAttack.startTick);
        if (e < ATTACK_SHEET_FRAMES) { heroAnim = ATTACK; heroFrame = ATTACK_SHEET_START + e; }
    }
    // the doll only needs to re-render when its FRAME changes (every frameMs), not every fast tick.
    const heroEl = useMemo(() => (
        <CharacterDoll char={hero} anim={heroAnim} frame={heroFrame} height={HERO_H} />
    ), [hero, heroAnim, heroFrame]);

    // #660 the moving notehead(s) drawn above a side-scrolling slime (§6d: reuse the canonical Maestro glyph +
    // getNoteAbsoluteY). Han: no stem, no colouring — just a plain notehead. A chord renders one head per note.
    const noteHeads = (s, x) => (Array.isArray(s.note) ? s.note : [s.note]).map((n, hi) => {
        const y = getNoteAbsoluteY(n, trebleStart, clef, 'treble');
        return y == null ? null : (
            <text key={hi} x={x + SLIME_VIEW_W / 2 - 6} y={y} fontFamily="Maestro" fontSize={NOTE_FONT_SIZE} fill="var(--text-primary)">{QUARTER_GLYPH}</text>
        );
    });

    return (
        <g className="rpg-layer" data-rpg-layer="" style={{ pointerEvents: 'none' }}>
            {slimeData.map((s, idx) => {
                const isDying = dying && dying.index === idx;
                const deathFrame = isDying ? Math.min(framesSince(dying.startTick), SLIME_DEATH.frames - 1) : 0;
                if (sideScroll) {
                    if (killedSet.has(idx)) return null;                  // struck & death finished
                    if (isDying) return <Slime key={s.key} x={dying.x} y={slimeY} colorKey={s.colorKey} row={SLIME_DEATH.row} frame={deathFrame} />;
                    const p = sideScrollX(s.beat, tick);
                    if (!p.spawned || p.slimeX < -SLIME_VIEW_W) return null;   // not on screen / walked off left
                    return (
                        <g key={s.key}>
                            {noteHeads(s, p.noteX)}
                            <Slime x={p.slimeX} y={slimeY} colorKey={s.colorKey} row={SLIME_WALK.row} frame={p.walkFrame} />
                        </g>
                    );
                }
                // static (Level 1): idle under the note; death in place.
                if (idx < killedCount) return null;
                const row = isDying ? SLIME_DEATH.row : SLIME_IDLE.row;
                const frame = isDying ? deathFrame : gFrame % SLIME_IDLE.frames;
                return <Slime key={s.key} x={s.x} y={slimeY} colorKey={s.colorKey} row={row} frame={frame} />;
            })}
            {/* #660 debug: the hit-zone in front of the hero (kills only register here) */}
            {debugMode && sideScroll && (
                <rect x={startX} y={slimeY} width={HITZONE_W} height={SLIME_VIEW_H}
                    fill="lime" fillOpacity={0.15} stroke="lime" strokeWidth={0.5} style={{ pointerEvents: 'none' }} />
            )}
            <foreignObject x={heroX} y={heroY} width={dollW} height={HERO_H} style={{ overflow: 'visible', pointerEvents: 'auto' }}>
                <div xmlns="http://www.w3.org/1999/xhtml" onClick={onOpenCharacter}
                    style={{ cursor: 'pointer' }} title="Open character">
                    {heroEl}
                </div>
            </foreignObject>
            {debugMode && (
                <rect x={heroX} y={heroY} width={dollW} height={HERO_H}
                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1} style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
}
