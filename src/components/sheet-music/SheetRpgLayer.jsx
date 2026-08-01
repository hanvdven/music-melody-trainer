import React, { useState, useEffect, useMemo, useRef } from 'react';
import CharacterDoll, { CROP as DOLL_CROP } from '../character/CharacterDoll';
import { ANIMATIONS, basesFor } from '../../model/characterAssets';
import { loadCharacter } from '../../model/characterProfile';
import { SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_WALK, SLIME_DEATH, SLIME_COLORS } from '../../model/enemyAssets';
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

// #660 Level 2 side-scroll geometry. FRAMES_PER_BEAT = 5 (the frame interval is 12/bpm s → 5 frames/beat).
// The slime "hops": over each 8-frame walk cycle it moves only on Han's frames 3–7 (0-indexed 2–6) — so
// `movingFramesBefore(f)` counts how many moving frames have elapsed, giving the non-linear (hoppy) x.
const FRAMES_PER_BEAT = 5, TICKS_PER_BEAT = 12;
const HITZONE_W = 70;        // width (viewBox units) of the strike zone in front of the hero (startX..+W)
const FADE_FRAMES = 5;       // a missed (escaped) slime fades over this many frames
const movingFramesBefore = (f) => { const c = Math.floor(f / 8); const rem = f - c * 8; return c * 5 + Math.max(0, Math.min(rem - 2, 5)); };

// Ensure the hero has at least a skin so it is never invisible.
function ensureVisible(char) {
    if (char.layers?.skin) return char;
    const s = basesFor('skin', char.gender || 'male')[0]?.variants[0];
    return s ? { ...char, layers: { ...char.layers, skin: { g: s.g, name: s.name } } } : char;
}

export default function SheetRpgLayer({
    trebleMelody, startX, pixelsPerTick, allOffsets, noteWidth, bpm,
    trebleStart, staffHeight, viewBottom, onOpenCharacter, onSlimesCleared, onHit, onMiss, combatNote,
    sideScroll = false, viewRight = 0, beatsOnScreen = 8, debugMode = false,
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

    // ── combat state ──────────────────────────────────────────────────────────
    const [tick, setTick] = useState(0);                   // drives all idle/one-shot frame timing
    const [killedCount, setKilledCount] = useState(0);     // leftmost living slime = slimeData[killedCount]
    const [dying, setDying] = useState(null);              // { index, startTick, x } — slime playing death
    const [escaping, setEscaping] = useState(null);        // { index, startTick } — missed slime fading at startX
    const [heroAttack, setHeroAttack] = useState(null);    // { startTick } — hero playing attack once
    const tickRef = useRef(0);
    const killedRef = useRef(0); killedRef.current = killedCount;
    const dyingRef = useRef(null); dyingRef.current = dying;
    const escapingRef = useRef(null); escapingRef.current = escaping;
    const slimesRef = useRef(slimeData); slimesRef.current = slimeData;
    const clearedRef = useRef(false);
    const heroAttackRef = useRef(null); heroAttackRef.current = heroAttack;
    // hit/miss callbacks via refs so the nonce-keyed note effect always sees the latest (no stale closure).
    const onHitRef = useRef(onHit); onHitRef.current = onHit;
    const onMissRef = useRef(onMiss); onMissRef.current = onMiss;
    const waveStartRef = useRef(0);                        // tick at which the current wave's clock started
    const geomRef = useRef({});                            // geometry read by the effects "at now"
    geomRef.current = { startX, viewRight, beatsOnScreen, sideScroll };

    // #660 side-scroll position of a slime: it spawns at its own `beat` and reaches startX `beatsOnScreen`
    // beats later, HOPPING (x only advances on the walk's moving frames). Returns x + the walk frame.
    const sideScrollX = (beat, atTick) => {
        const { startX: sx, viewRight: vr, beatsOnScreen: bos } = geomRef.current;
        const totalFrames = bos * FRAMES_PER_BEAT;
        const framesSince = atTick - waveStartRef.current - beat * FRAMES_PER_BEAT;
        const step = (vr - sx) / (movingFramesBefore(totalFrames) || 1);
        const x = vr - movingFramesBefore(Math.max(0, Math.min(framesSince, totalFrames))) * step;
        return { x, walkFrame: ((framesSince % 8) + 8) % 8, framesSince, totalFrames, spawned: framesSince >= 0 };
    };

    // one interval drives the tick at the tempo-coupled frame rate; tickRef lets the note handler read "now"
    // without being a dep. Re-created when bpm changes so the animation speed follows the tempo.
    useEffect(() => {
        const id = setInterval(() => { tickRef.current += 1; setTick(tickRef.current); }, frameMsForBpm(bpm));
        return () => clearInterval(id);
    }, [bpm]);

    // reset combat when the melody (its slime notes) changes — a fresh wave; the side-scroll clock restarts.
    const notesKey = slimeData.map((s) => (Array.isArray(s.note) ? s.note.join('+') : s.note)).join('|');
    useEffect(() => {
        setKilledCount(0); setDying(null); setEscaping(null); clearedRef.current = false;
        waveStartRef.current = tickRef.current;
    }, [notesKey]);

    // a played note (any input) — key ONLY on the nonce so it fires once per note; read live state via refs.
    useEffect(() => {
        if (!combatNote) return;
        // ANY note → hero attacks once, but not more often than one attack cycle (the 2-frame delay) so rapid
        // notes don't restart a half-played swing (grouping fast notes is a separate ticket).
        if (!heroAttackRef.current || tickRef.current - heroAttackRef.current.startTick >= ATTACK_CYCLE) {
            setHeroAttack({ startTick: tickRef.current });
        }
        const k = killedRef.current;
        const s = slimesRef.current[k];
        if (dyingRef.current || escapingRef.current || !s) return;
        const matches = notesMatch(combatNote.note, s.note);
        if (geomRef.current.sideScroll) {
            // Level 2: a kill only counts when the leftmost slime is in the HIT-ZONE by the hero (too early or
            // a wrong note = miss). The slime dies where it currently is.
            const { x, framesSince, totalFrames } = sideScrollX(s.beat, tickRef.current);
            const inZone = framesSince >= 0 && framesSince < totalFrames && x <= geomRef.current.startX + HITZONE_W;
            if (matches && inZone) { setDying({ index: k, startTick: tickRef.current, x }); onHitRef.current?.(); }
            else onMissRef.current?.();
        } else if (matches) {
            setDying({ index: k, startTick: tickRef.current, x: s.x }); onHitRef.current?.();
        } else {
            onMissRef.current?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combatNote?.nonce]);

    // complete the one-shot animations each tick; in side-scroll, a slime that reaches the hero un-killed
    // ESCAPES (fades) and counts as a miss.
    useEffect(() => {
        if (dying && tick - dying.startTick >= SLIME_DEATH.frames) {
            setKilledCount((k) => Math.max(k, dying.index + 1)); setDying(null);
        }
        if (escaping && tick - escaping.startTick >= FADE_FRAMES) {
            setKilledCount((k) => Math.max(k, escaping.index + 1)); setEscaping(null);
        }
        if (heroAttack && tick - heroAttack.startTick >= ATTACK_CYCLE) setHeroAttack(null);
        if (geomRef.current.sideScroll && !dying && !escaping) {
            const s = slimesRef.current[killedRef.current];
            if (s) { const { framesSince, totalFrames } = sideScrollX(s.beat, tick); if (framesSince >= totalFrames) { setEscaping({ index: killedRef.current, startTick: tick }); onMissRef.current?.(); } }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    // wave cleared → regenerate (keyed on killedCount so it fires the moment the last slime is removed, not a
    // tick later — no dependence on a subsequent interval tick). A slime counts as "gone" whether killed or
    // escaped, so a side-scroll wave also ends if the player misses them all.
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
    // hero: during the first 3 frames of an attack show the LAST 3 attack frames (3,4,5); during the 2-frame
    // delay (and otherwise) show the idle loop.
    let heroAnim = idleAnim, heroFrame = tick % idleAnim.frames;
    if (heroAttack) {
        const e = tick - heroAttack.startTick;
        if (e < ATTACK_SHEET_FRAMES) { heroAnim = ATTACK; heroFrame = ATTACK_SHEET_START + e; }
    }

    return (
        <g className="rpg-layer" data-rpg-layer="" style={{ pointerEvents: 'none' }}>
            {slimeData.map((s, idx) => {
                if (idx < killedCount) return null;                       // already gone (killed or escaped)
                const isDying = dying && dying.index === idx;
                const deathFrame = isDying ? Math.min(tick - dying.startTick, SLIME_DEATH.frames - 1) : 0;
                if (sideScroll) {
                    if (isDying) return <Slime key={s.key} x={dying.x} y={slimeY} colorKey={s.colorKey} row={SLIME_DEATH.row} frame={deathFrame} />;
                    const p = sideScrollX(s.beat, tick);
                    if (!p.spawned) return null;                          // not on screen yet
                    const isEscaping = escaping && escaping.index === idx;
                    const opacity = isEscaping ? Math.max(0, 1 - (tick - escaping.startTick) / FADE_FRAMES) : 1;
                    return <Slime key={s.key} x={p.x} y={slimeY} colorKey={s.colorKey} row={SLIME_WALK.row} frame={p.walkFrame} opacity={opacity} />;
                }
                // static (Level 1): idle under the note; death in place.
                const row = isDying ? SLIME_DEATH.row : SLIME_IDLE.row;
                const frame = isDying ? deathFrame : tick % SLIME_IDLE.frames;
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
