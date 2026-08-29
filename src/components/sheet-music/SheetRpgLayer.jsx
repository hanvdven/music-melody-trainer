import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import CharacterDoll, { CROP as DOLL_CROP } from '../character/CharacterDoll';
import { ANIMATIONS, basesFor } from '../../model/characterAssets';
import { loadCharacter } from '../../model/characterProfile';
import { SLIME_FRAME, SLIME_CROP, SLIME_IDLE, SLIME_WALK, SLIME_DEATH, SLIME_COLORS } from '../../model/enemyAssets';
import { SCANNED_CREATURES, findMoveAnim, findIdleAnim, isFlyingAnim, findCreatureVariantByName, findAnim, findCreatureByName } from '../../model/bestiaryAssets';
// #679 (Han 2026-08-03, Level 9: "zet rechts de wizard tegenover de avatar... ipv slimes, gebruik cast 2.
// De wizard schiet dan projectile blue... deze bewegen wél lineair naar voren... voor de projectile death,
// gebruik de eerste 5 frames van static projectiles 5 met een fade out"): the Wizard/projectile enemy pair.
import {
    SLIME_COLS, SLIME_ROWS,
    WIZARD_URL, WIZARD_GREEN_URL, WIZARD_FRAME, WIZARD_COLS, WIZARD_ROWS, WIZARD_CROP, WIZARD_IDLE_CELLS,
    PROJECTILE_URL, PROJECTILE_FRAME, PROJECTILE_CROP, PROJECTILE_COLS, PROJECTILE_ROWS, PROJECTILE_LOOP_FRAMES,
    PROJECTILE_DEATH_URL, PROJECTILE_DEATH_FRAME, PROJECTILE_DEATH_CROP, PROJECTILE_DEATH_COLS,
    PROJECTILE_DEATH_ROWS, PROJECTILE_DEATH, PROJECTILE_DEATH_OPACITY,
    STATIC_PROJECTILE2_URL, STATIC_PROJECTILE2_FRAME, STATIC_PROJECTILE2_CROP, STATIC_PROJECTILE2_COLS,
    STATIC_PROJECTILE2_ROWS, STATIC_PROJECTILE2_LOOP_FRAMES,
    HIT_BURST_URL, HIT_BURST_FRAME, HIT_BURST_CROP, HIT_BURST_COLS, HIT_BURST_ROWS,
    HIT_BURST_TOTAL_FRAMES, HIT_BURST_OPACITY,
} from '../../model/enemyAssets';
import playOneShotSfx, { HIT_ON_WOOD_FILES, DAMAGED_FILES } from '../../audio/playOneShotSfx';
import { DEFAULT_RPG_FX_VOLUME, rpgVolumeMultiplier } from '../../audio/dynamics';
import { noteToMidi } from '../../theory/noteUtils';
import MelodyNotesLayer from './MelodyNotesLayer';
import BarlinesLayer from './BarlinesLayer';
import { computeCallResponseLabel } from '../../utils/repeatNumbering';
import ChordLabelsLayer from './ChordLabelsLayer';
import LyricsLayer from './LyricsLayer';
import { getNoteAbsoluteY } from './renderMelodyNotes';
import { freshTempoAnchor, tempoNormalizedMs } from './tempoScrollAnchor';
import { StaffQuarterNote } from './staffNoteGlyph';
import { gradeHit, GRADE_LABELS, PERFECT_BEATS, TOO_BEATS, MUCH_TOO_BEATS } from '../../levels/gradeHit';
import logger from '../../utils/logger';
import { oscillate, FLYING_HOVER_OSC_RANGE, FLYING_HOVER_OSC_SPEED } from '../../utils/oscillate';
// #1165: moved verbatim (same signature, same 2-measure period) out of the retired
// useLevelMixedStream into the pure per-level block-policy module, so the alternation this
// renders and the alternation the content stream GENERATES can never be two different rules.
import { blockTypeAt } from '../../levels/levelBlockPlan';
import useFrameLoop from '../../hooks/useFrameLoop';

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
// exactly one beat at the bpm-coupled beat length below, matching the 5-frame idle loop.
const ATTACK_SHEET_START = 3, ATTACK_SHEET_FRAMES = 3, ATTACK_DELAY = 2;
const ATTACK_CYCLE = ATTACK_SHEET_FRAMES + ATTACK_DELAY;   // 5 frames
// #923 (Han 2026-08-12, "ik wil dat animatie... in sync zijn met de muziek; maar ook dat ze een 'normale'
// snelheid hebben. bijvoorbeeld 240bpm en 120bpm moet vergelijkbare head bob hebben"): the animation "beat"
// is no longer always a quarter note — at extreme tempos a literal quarter-note beat would be far too fast
// (high bpm) or far too slow (low bpm) to read as a natural idle bob. Instead the NOTE VALUE backing one
// beat scales with the bpm range (Han's exact table), so the perceived loop speed stays roughly constant:
//   <=30bpm: 16th note   <=60bpm: 8th note   <=120bpm: quarter (unchanged default range)
//   <=240bpm: half note  >240bpm: one full measure (uses the level's OWN timeSignature, not a hardcoded 4/4)
// quarterMs is the one true tempo primitive (standard 60000/bpm); every note value is derived from it so
// there is a SINGLE formula, not a lookup table per bpm range (§6c).
// NOTE: this "animation beat" is a SEPARATE concept from the file's own `beatMs` local (literal
// 60000/bpm quarter-note beat used for slime scroll/arrival timing below) — named `animBeatMsForBpm` to
// avoid confusing the two; do not conflate them.
function animBeatMsForBpm(bpm, timeSignature) {
    if (!(bpm > 0)) return IDLE_MS * 5;   // fallback animBeatMs (5 frames × IDLE_MS) when bpm is unknown
    const quarterMs = 60000 / bpm;
    if (bpm <= 30) return quarterMs / 4;                                  // 16th note
    if (bpm <= 60) return quarterMs / 2;                                  // 8th note
    if (bpm <= 120) return quarterMs;                                     // quarter note
    if (bpm <= 240) return quarterMs * 2;                                 // half note
    const [numerator, denominator] = timeSignature || [4, 4];             // measure length
    return quarterMs * numerator * (4 / denominator);
}
// 5 frames per beat (sprite idle/attack loops, unchanged cadence) and 4 "conversation clicks" per beat
// (#922's typewriter engine) both derive from the SAME animBeatMs — one shared primitive, not two
// independently tuned rates that could drift apart (§6c). Exported so #922's conversation engine reuses
// this exact value.
export const FRAMES_PER_BEAT = 5;
export const CLICKS_PER_BEAT = 4;
// Exported (not just used locally) so RpgLevelPanel.jsx's open-world idle-sprite tick (wisp/pet/slime, its
// OWN separate `setInterval` loop — a different render path than this sheet-music layer) reuses the SAME
// formula instead of its previous hardcoded 150ms (§6c/§6d — one cadence formula, not two that can drift).
export const frameMsForBpm = (bpm, timeSignature) => animBeatMsForBpm(bpm, timeSignature) / FRAMES_PER_BEAT;
export const clickMsForBpm = (bpm, timeSignature) => animBeatMsForBpm(bpm, timeSignature) / CLICKS_PER_BEAT;

// colour by note length (Han 2026-08-01: RED = short, BLUE = long; green = the middle). §6c formula.
const slimeColorKey = (d) => (d >= 24 ? 'blue' : d >= 12 ? 'green' : 'red');

const SLIME_VIEW_H = 33;   // on-sheet slime height (Han: +50%); tunable
const SLIME_VIEW_W = SLIME_VIEW_H * (SLIME_CROP.w / SLIME_CROP.h);
const HERO_H = 140;        // on-sheet hero height (Han: 2×); tunable

// #679 Level 9 (Wizard/projectile) geometry — mirrors the Slime/Hero constants above 1:1.
const WIZARD_H = HERO_H;                                    // same scale as the hero it faces (Han: companion-weight)
const WIZARD_VIEW_W = WIZARD_H * (WIZARD_CROP.w / WIZARD_CROP.h);
// #680 (Han 2026-08-03, "zorg dat de projectiles de zelfde schaal hebben als de andere sprites (hero,
// wizard)"): the projectile borrowed the SLIME's tuned target-height (33px) at first, which put it at a
// noticeably different per-pixel zoom (~4x) than the hero/wizard (~2.4-2.7x) standing right next to it — a
// mismatched "zoom level", not a mismatched bounding box. Deriving the SAME zoom factor the wizard already
// uses (WIZARD_H / WIZARD_CROP.h) and applying it to the projectile's OWN crop keeps it small (it's a bolt,
// not a person) but at the same pixel-density as everything else on screen.
// #685 (Han 2026-08-04, "maak de projectiles 1,5x zo klein"): a further correction on top of §680's fix —
// still derived from the wizard's own zoom (not re-hardcoded), just divided down.
const PROJECTILE_SCALE = (WIZARD_H / WIZARD_CROP.h) / 1.5;
const PROJECTILE_VIEW_W = PROJECTILE_CROP.w * PROJECTILE_SCALE;   // only used for the off-screen cull check
const PROJECTILE_VIEW_H = PROJECTILE_CROP.h * PROJECTILE_SCALE;   // used to vertically CENTER it on B4 below
// #685 (Han: "animatie 4x zo snel") — the flight loop's own frame-advance rate, independent of frameMs
// (which stays shared with the hero/slime/wizard idle cadence — only the projectile's loop speeds up).
const PROJECTILE_ANIM_SPEED = 4;
// #825 (Han 2026-08-10, "hit" animation on a successful strike) — sized relative to the slime it plays
// over (same "derive from an existing tuned constant" convention as PROJECTILE_SCALE above, §6c: no new
// hardcoded pixel size). 7 consecutive (randomly-chosen start) frames from HIT_BURST_TOTAL_FRAMES, at
// DOUBLE the shared bpm-coupled frame rate (Han's exact spec).
const HIT_BURST_SCALE = (SLIME_VIEW_H * 1.4) / HIT_BURST_CROP.h;
const HIT_BURST_VIEW_W = HIT_BURST_CROP.w * HIT_BURST_SCALE;
const HIT_BURST_VIEW_H = HIT_BURST_CROP.h * HIT_BURST_SCALE;
const HIT_FRAMES = 7;
const HIT_SFX_VOLUME = 0.6;
// #991 — same volume convention as HIT_SFX_VOLUME (no volume specified in the interview; reusing the
// sibling constant's value is the safe default, trivially tunable later).
const MISS_SFX_VOLUME = 0.6;
// #685 (Han: "oscilleren rond hun centrum ... bereik van 15 units in alle richtingen") — small continuous
// random-looking wobble (2 independent sine waves per axis, per-projectile phase/frequency so they don't
// all wobble in lockstep) layered on top of the projectile's real flight position.
// #693 (Han 2026-08-04, round 3: "maak de projectile oscillation 50% smaller in both directions") — halved.
const PROJECTILE_OSCILLATE_RANGE = 7.5;
// #925 follow-up (Han 2026-08-16, "letters van tekst moeten een heel klein beetje oscilleren
// (individueel), range 2 game pixels"): a much smaller, subtler range than the projectile wobble above —
// a per-letter jitter, not a visible flight-path wobble.
// #925 round 2 (Han: "mag 50% minder groot, en 100% trager"): range halved, speed halved.
const JUDGMENT_LETTER_OSCILLATE_RANGE = 1;
const JUDGMENT_LETTER_OSCILLATE_SPEED = 0.5;
// #661 horizontal nudge for the scrolling staff so a Maestro notehead (drawn at its left edge, head centre
// ≈ +6) sits centred over the slime below it (slime centre = slimeX + SLIME_VIEW_W/2), matching the accepted
// Level-1 note/slime alignment. Applied as a constant x-shift on the whole moving staff group.
const NOTE_STAFF_DX = SLIME_VIEW_W / 2 - 6;
// #661 side-scroll lane fade (Han UAT): the moving notes/barlines fade OUT over the last LANE_FADE_L units
// before the hero (startX) so they vanish softly after being played, and fade IN over the last LANE_FADE_R
// units at the right edge so the incoming 'end' of the score isn't a hard pop. Applied as an SVG mask.
const LANE_FADE_L = 34;   // soft, wide enough that a note's flag/tie fades smoothly (no hard glyph clip)
const LANE_FADE_R = 15;

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
// Perf fix (Han 2026-08-06, "hakkelig beeld"): the parent's `tick` state changes every rAF frame, so
// WITHOUT React.memo every Slime/Critter/Wizard/Projectile/SpawnGlow instance re-renders 60×/sec even
// though most of them recompute the exact same output between ticks (a walk frame only actually changes
// every `frameMs` ≈ 150ms, not every 8ms tick). Memoizing these small, pure, presentational components lets
// React skip re-invoking/diffing the ones whose props didn't change this frame — no visual/behavioural
// change, purely a reconciliation-cost reduction on the level's busiest render path.
// #863 follow-up (Han 2026-08-10): `tick` is no longer React state at all (see its declaration below) — the
// parent re-renders at the much lower `frameTick` (sprite-frame) cadence now, and LIVE entities bypass
// React entirely via the forwardRef imperative handles added below. This memo is still worth keeping: it
// still skips re-invoking entities whose declarative props (colorKey, dying, etc.) didn't change on a
// frameTick-cadence re-render, e.g. when only ONE slime's dying/wiggle state changed among many.
// #863 (Han 2026-08-10, perf fix): ALSO wrapped in forwardRef + useImperativeHandle so a LIVE (on-screen,
// not dying) slime's continuous position/frame can be pushed via direct DOM mutation from the rAF loop
// (see the main loop below) instead of a full React re-render every ~8ms — the same "bypass React for
// hot-path animation" principle CLAUDE.md §6 already mandates for opacity. The declarative x/y/row/frame
// props are UNCHANGED and still drive the initial mount paint (and every non-live render, e.g. the death
// animation, which stays purely declarative) — this is a pure ADDITION of an imperative escape hatch.
const Slime = React.memo(forwardRef(function Slime({ x, y, colorKey, row, frame, opacity = 1 }, ref) {
    const svgRef = useRef(null);
    const imgRef = useRef(null);
    useImperativeHandle(ref, () => ({
        setPosition(nx, ny) {
            if (svgRef.current) { svgRef.current.setAttribute('x', nx); svgRef.current.setAttribute('y', ny); }
        },
        // reuses the EXACT SAME ox/oy formula as the render body below (§6c) — just applied imperatively.
        setFrame(nrow, nframe) {
            if (imgRef.current) {
                imgRef.current.setAttribute('x', -nframe * SLIME_FRAME.w);
                imgRef.current.setAttribute('y', -nrow * SLIME_FRAME.h);
            }
        },
        setOpacity(op) { if (svgRef.current) svgRef.current.setAttribute('opacity', op); },
    }), []);
    const url = SLIME_COLORS[colorKey];
    if (!url) return null;
    const ox = -frame * SLIME_FRAME.w;
    const oy = -row * SLIME_FRAME.h;
    const flip = `translate(${2 * SLIME_CROP.x + SLIME_CROP.w}, 0) scale(-1, 1)`;   // face left
    return (
        <svg ref={svgRef} x={x} y={y} width={SLIME_VIEW_W} height={SLIME_VIEW_H} opacity={opacity}
            viewBox={`${SLIME_CROP.x} ${SLIME_CROP.y} ${SLIME_CROP.w} ${SLIME_CROP.h}`}>
            <g transform={flip}>
                <image ref={imgRef} href={url} x={ox} y={oy} width={SLIME_COLS * SLIME_FRAME.w} height={SLIME_ROWS * SLIME_FRAME.h}
                    style={{ imageRendering: 'pixelated' }} />
            </g>
        </svg>
    );
}));

// #693 round 8 (Han: "zet onder elke rust een squirrel of porcupine of pidgeon of red panda of armadillo of
// blue jay of dragon fly (random) (net als slimes onder rusten)"): one CRITTER sits under each REST slot
// (the exact mirror of a slime sitting under each real note) — classified bestiary creatures (§6d, reused
// via `SCANNED_CREATURES` rather than hand-rolled art), picked randomly per rest. "Red panda" is classified
// in the manifest simply as "Panda" (its base name — verified via the manifest, not guessed).
const CRITTER_NAMES = ['Squirrel', 'Porcupine', 'Pidgeon', 'Panda', 'Armadillo', 'Blue Jay', 'Dragonfly'];
const CRITTER_VARIANTS = CRITTER_NAMES
    .map((name) => SCANNED_CREATURES.find((c) => c.name === name))
    .filter(Boolean)
    .map((c) => c.variants.find((v) => v.variant === 'Plain') || c.variants[0]);
// Same "true size × one shared zoom factor" convention as the RPG Level tab's WorldCreature (§693 round 8) —
// tuned so a critter reads at roughly slime-sized weight next to the staff, not hand-picked per creature.
const CRITTER_SCALE = 2.2;

// #693 round 12 (Han: "als een unit een fly of float animatie heeft gebruik de 64x64 center aligned
// animatie... met lichte oscillatie"): applies automatically whenever the critter's OWN currently-playing
// animation is fly/float (Dragonfly is classified with a 'fly' key) — same `isFlyingAnim`/`oscillate` the
// RPG level's `WorldCreature` uses (§6c), just a small upward lift + wobble on this SVG's own x/y instead
// of a CSS transform (the coordinate system here is the staff's own <svg>, not a DOM box).
// #790 (Han 2026-08-09, SSOT): the wobble RANGE/SPEED are now the SAME shared `FLYING_HOVER_OSC_*`
// constants every other flying-creature call site uses (was its own independently-tuned 3px range — one
// more instance of the drift this ticket fixed everywhere else). Only the hover LIFT stays critter-specific
// (this SVG's own coordinate space, unrelated to the DOM world's ground-line convention).
const CRITTER_HOVER_PX = 14;

// #863 perf fix: the row/col/oscillation math a Critter's render body needs is now factored into a pure
// helper so the imperative `update()` handle below (called from the rAF loop) can reuse the EXACT SAME
// formula (§6c) instead of a second hand-copied version — a real risk here since Critter's "position" is
// not just x/y, it's x/y ALREADY INCLUDING the flying-anim oscillation offset.
// Bug fix (Han 2026-08-18, "the porcupine critter is below the baseline, squirrel too, and the armadillo
// is above it (compared to the slimes)"): `y` (always `slimeY`, the SAME value passed to every critter
// AND every slime) used to be applied as a plain TOP-left anchor, exactly like Slime's own `<svg y={y}>`.
// Slimes all share ONE fixed sprite height (`SLIME_VIEW_H`), so anchoring by top-left also happens to put
// every slime's BOTTOM edge at the same y — but critter variants have DIFFERENT `crop.h` (porcupine/
// squirrel/armadillo/etc. are not the same sprite-sheet cell size), so top-anchoring them at the same y
// left each one's bottom edge (its visual "feet"/ground-contact point) at a DIFFERENT height — some
// hovering above the slimes' ground line, some sunk below it. Fix: anchor by BOTTOM instead — offset
// `drawY` so `drawY + variant.crop.h*scale` always equals `y + SLIME_VIEW_H` (the slimes' own bottom
// edge), the same way real sprites in this file are grounded. `scale` defaults to `CRITTER_SCALE` (the
// Critter component's own default) so existing call sites that don't pass it are unaffected in practice
// (they already use that default) — added as a real parameter, not assumed, so a future differently-
// scaled critter still grounds correctly (§6c: one formula, not a hardcoded constant baked in twice).
function critterDraw(variant, x, y, frame, preferIdle = false, scale = CRITTER_SCALE) {
    // #693 round 11 (Han: "critters gebruiken nog steeds niet de walk/run/fly animatie als ze die hebben"):
    // a critter perpetually scrolls across the staff (it's always "moving" relative to the player, unlike
    // the RPG level's stationary-until-clicked Wisp), so it always prefers its move-type animation — same
    // `findMoveAnim`/`findIdleAnim` helpers `WorldCreature` uses (§6c: one shared lookup, not a hardcoded
    // 'idle'-only read here that silently diverges from the Bestiary's own classification).
    // #871: a stationary decorative NPC (unlike a scrolling critter) passes `preferIdle` so it plays its
    // idle animation instead — same two helpers, just tried in the opposite order.
    const anim = preferIdle ? (findIdleAnim(variant) || findMoveAnim(variant)) : (findMoveAnim(variant) || findIdleAnim(variant));
    // Bug fix (Han 2026-08-10, #863 production crash — "het level werkt uberhaupt niet in build",
    // TypeError: Cannot read properties of undefined (reading 'col')): plain `%` preserves the dividend's
    // sign in JS, so a negative `frame` (possible here because the rAF loop — unlike the old declarative
    // render, which only ever mounted a critter once its own `msSinceSpawn >= 0` — recomputes this EVERY
    // frame from a live `sideScrollX` call and has no equivalent "not yet due" guard) indexed
    // `anim.cells` with a negative number, which is `undefined` in JS, not a wrapped-around positive
    // index. Same non-negative-modulo fix already used for `wizardFrame`/`idleFrame` elsewhere in this
    // file (the "§679 bugfix" comments) — applied here too, plus an `anim.cells.length` guard in case an
    // animation genuinely has zero cells.
    const len = anim.cells.length;
    const cell = len > 0 ? anim.cells[((frame % len) + len) % len] : null;
    const ox = cell ? -cell.col * variant.frame.w : 0, oy = cell ? -cell.row * variant.frame.h : 0;
    let drawX = x, drawY = y + SLIME_VIEW_H - variant.crop.h * scale;   // bottom-anchored — see this fn's own comment
    if (isFlyingAnim(anim, variant)) {
        const seed = variant.crop.x * 31 + variant.crop.y;
        // #1097 (Han 2026-08-22, "critters lijken tragere framerate te hebben dan de hero"): `frame` used
        // to advance at 1/4 the slime/hero idle cadence (an intentional "gentle" slowdown), and this literal
        // was tuned as its compensating multiplier (~4x the real per-frame ms) so the wobble read at the
        // right real-world speed. Now that `frame` advances at the SAME cadence as slime/hero (see the two
        // `gFrame`/`gF` call sites below), the multiplier is divided by the same factor (120/4=30) so this
        // flying-critter hover wobble's speed is unchanged — only the idle-cycle catch-up bug is fixed.
        const tMs = frame * 30;
        drawX += oscillate(seed, tMs, FLYING_HOVER_OSC_RANGE, FLYING_HOVER_OSC_SPEED);
        drawY += oscillate(seed + 1, tMs, FLYING_HOVER_OSC_RANGE, FLYING_HOVER_OSC_SPEED) - CRITTER_HOVER_PX;
    }
    return { ox, oy, drawX, drawY };
}

// #871: `scale`/`preferIdle` are OPTIONAL — every existing call site (scrolling critters) omits them and
// gets the exact prior behaviour (CRITTER_SCALE, move-preferred animation). The decorative-NPC render
// branch below is the only caller that passes them, reusing this component rather than a new renderer.
// #870 (Han 2026-08-11, "de japanese musician niet (want zij kijkt al links) - zij wordt abusievelijk
// gedraaid. Draai terug"): `flip` is also OPTIONAL, defaulting to the prior unconditional-mirror behaviour
// — only the decorative-NPC call site below passes `flip={false}`, and only for her specific name, since
// her raw sprite sheet is drawn already facing left (unlike every other critter this component mirrors).
const Critter = React.memo(forwardRef(function Critter({ x, y, variant, frame, opacity = 1, scale = CRITTER_SCALE, preferIdle = false, flip: shouldFlip = true }, ref) {
    const svgRef = useRef(null);
    const imgRef = useRef(null);
    useImperativeHandle(ref, () => ({
        // #863 perf fix — position AND frame update together (a flying critter's draw position depends on
        // its frame via the oscillation wobble, so they can't be split into separate setPosition/setFrame
        // calls without desyncing them for one rAF tick).
        // #1052 second follow-up (Han 2026-08-18, "critter... idle animation on 'rubato pause'"): optional
        // 5th arg overrides the mount-time `preferIdle` prop per call — the rAF loop passes `true` while
        // gated-frozen (see its own call site) so a scrolling critter switches to its idle animation
        // instead of freezing mid-move-cycle, without needing a React re-render to change `preferIdle`.
        update(nx, ny, nframe, forceIdle) {
            if (!variant) return;
            const { ox, oy, drawX, drawY } = critterDraw(variant, nx, ny, nframe, forceIdle ?? preferIdle, scale);
            if (svgRef.current) { svgRef.current.setAttribute('x', drawX); svgRef.current.setAttribute('y', drawY); }
            if (imgRef.current) { imgRef.current.setAttribute('x', ox); imgRef.current.setAttribute('y', oy); }
        },
    }), [variant, preferIdle, scale]);
    if (!variant) return null;
    const { ox, oy, drawX, drawY } = critterDraw(variant, x, y, frame, preferIdle, scale);
    const viewW = variant.crop.w * scale, viewH = variant.crop.h * scale;
    const flip = shouldFlip ? `translate(${2 * variant.crop.x + variant.crop.w}, 0) scale(-1, 1)` : undefined;   // face left, matches Slime
    return (
        <svg ref={svgRef} x={drawX} y={drawY} width={viewW} height={viewH} opacity={opacity}
            viewBox={`${variant.crop.x} ${variant.crop.y} ${variant.crop.w} ${variant.crop.h}`}>
            <g transform={flip}>
                <image ref={imgRef} href={variant.url} x={ox} y={oy} width={variant.width} height={variant.height}
                    style={{ imageRendering: 'pixelated' }} />
            </g>
        </svg>
    );
}));

// #679 Level 9 — the wizard "boss", static on the RIGHT, mirrored to face LEFT toward the hero (same flip
// convention as Slime). `cells` is either WIZARD_IDLE_CELLS (default) or WIZARD_CAST2_CELLS (one-shot,
// triggered per projectile spawn — see wizardCastFrame below); both are {row,col} lists because Cast2 spans
// a row boundary on this sheet (§6d: cell format copied verbatim from the bestiary's wizardPortraitAnimations()).
// #863 round 2 perf fix: `cells[frame % cells.length]` → ox/oy is the ONE bit of frame math both the
// render body and the imperative `setFrame` handle need (§6c — factored the same way `critterDraw` was).
function wizardCellOffset(cells, frame) {
    // Bug fix (Han 2026-08-10, #863 production crash, same class as `critterDraw`'s fix above): plain `%`
    // preserves sign, so a negative `frame` would index `cells` with a negative number (`undefined` in
    // JS) instead of wrapping. Non-negative modulo, same convention as this file's other "§679 bugfix"
    // comments.
    const len = cells.length;
    const cell = len > 0 ? cells[((frame % len) + len) % len] : null;
    return { ox: cell ? -cell.col * WIZARD_FRAME.w : 0, oy: cell ? -cell.row * WIZARD_FRAME.h : 0 };
}
// #863 round 2: forwardRef so the wizard's idle/cast-sync frame (previously recomputed in the render body
// every `frameTick`) can be pushed every rAF frame instead — the cast-sync math is timing-sensitive
// (Han: "de flits moet exact op de noot landen"), so throttling it to frameTick cadence left it up to one
// sprite-frame (~100-300ms) coarser than the audio it's syncing to. `setCells` is needed (not just
// `setFrame`) because a cast sequence swaps to a DIFFERENT cell array (idle vs single/double/triple) — the
// imperative handle must be able to change which array `ox`/`oy` are computed from, not just the index.
const Wizard = React.memo(forwardRef(function Wizard({ x, y, cells, frame, url = WIZARD_URL }, ref) {
    const imgRef = useRef(null);
    useImperativeHandle(ref, () => ({
        setCells(ncells, nframe) {
            if (!imgRef.current) return;
            const { ox, oy } = wizardCellOffset(ncells, nframe);
            imgRef.current.setAttribute('x', ox);
            imgRef.current.setAttribute('y', oy);
        },
    }), []);
    const { ox, oy } = wizardCellOffset(cells, frame);
    const flip = `translate(${2 * WIZARD_CROP.x + WIZARD_CROP.w}, 0) scale(-1, 1)`;
    return (
        <svg x={x} y={y} width={WIZARD_VIEW_W} height={WIZARD_H}
            viewBox={`${WIZARD_CROP.x} ${WIZARD_CROP.y} ${WIZARD_CROP.w} ${WIZARD_CROP.h}`}>
            <g transform={flip}>
                <image ref={imgRef} href={url} x={ox} y={oy} width={WIZARD_COLS * WIZARD_FRAME.w} height={WIZARD_ROWS * WIZARD_FRAME.h}
                    style={{ imageRendering: 'pixelated' }} />
            </g>
        </svg>
    );
}));

// #679 Level 9 — one projectile. Cropped/mirrored exactly like Slime, but flight vs. death are TWO different
// sheets/grids (not row-offsets on one sheet like the slime), so `dying` switches both. In flight it cycles
// the full 36-frame loop continuously (Han: "een lange loop") — unlike a slime's hop-and-pause walk, this
// motion is driven entirely by the LINEAR `noteX` at the call site, so the sprite frame here is independent
// of position. On death: the static-projectiles-5 sheet's first 5 frames (row 0), fading -20%/frame (Han).
// #863 perf fix: forwardRef handle — used ONLY for LIVE (non-dying) flight-loop position/frame updates
// from the rAF loop (see point 7 in the ticket). Dying projectiles stay fully React-state/frameTick-driven
// (short-lived, few at a time, not worth ref plumbing — same call as dying Slimes above), so the imperative
// `setFrame` here only needs the non-dying row/col formula (identical to the render body's own `dying ===
// false` branch below, §6c).
const Projectile = React.memo(forwardRef(function Projectile({ x, y, frame, dying = false, opacity = 1 }, ref) {
    const svgRef = useRef(null);
    const imgRef = useRef(null);
    useImperativeHandle(ref, () => ({
        setPosition(nx, ny) {
            if (svgRef.current) { svgRef.current.setAttribute('x', nx); svgRef.current.setAttribute('y', ny); }
        },
        setFrame(nframe) {
            if (imgRef.current) {
                const col = nframe % PROJECTILE_COLS, row = Math.floor(nframe / PROJECTILE_COLS);
                imgRef.current.setAttribute('x', -col * PROJECTILE_FRAME.w);
                imgRef.current.setAttribute('y', -row * PROJECTILE_FRAME.h);
            }
        },
        setOpacity(op) { if (svgRef.current) svgRef.current.setAttribute('opacity', op); },
    }), []);
    const url = dying ? PROJECTILE_DEATH_URL : PROJECTILE_URL;
    const frameSize = dying ? PROJECTILE_DEATH_FRAME : PROJECTILE_FRAME;
    const crop = dying ? PROJECTILE_DEATH_CROP : PROJECTILE_CROP;
    const cols = dying ? PROJECTILE_DEATH_COLS : PROJECTILE_COLS;
    const rows = dying ? PROJECTILE_DEATH_ROWS : PROJECTILE_ROWS;
    const row = dying ? PROJECTILE_DEATH.row : Math.floor(frame / PROJECTILE_COLS);
    const col = dying ? frame : frame % PROJECTILE_COLS;
    const ox = -col * frameSize.w, oy = -row * frameSize.h;
    const viewW = crop.w * PROJECTILE_SCALE, viewH = crop.h * PROJECTILE_SCALE;
    // #686 (Han 2026-08-04, "haal de blauwe gloed weg"): the permanent flight-time blue halo (§685) is
    // removed — see the separate one-shot "spawn glow" flourish below instead, which plays only at the
    // moment the projectile appears.
    // #790 (Han 2026-08-09, UAT: "projectiel van tovenaar in level staat nog verkeerd om. die in de
    // bestiary staat juist. dus pas enkel in het level aan"): this component had picked up a `scale(-1,1)`
    // mirror across several earlier rounds (#693 round 8 reversed #680's "already correct unmirrored" call)
    // — Han's final, authoritative call: the Bestiary's own (unflipped) presentation is correct, so the
    // level must MATCH it, not diverge from it. No mirror here any more.
    return (
        <svg ref={svgRef} x={x} y={y} width={viewW} height={viewH} opacity={opacity}
            viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`}>
            <image ref={imgRef} href={url} x={ox} y={oy} width={cols * frameSize.w} height={rows * frameSize.h}
                style={{ imageRendering: 'pixelated' }} />
        </svg>
    );
}));

// #825 (Han 2026-08-10) — a one-shot "hit" burst played at the strike line on a successful kill.
// `frame` is the ABSOLUTE index (0..HIT_BURST_TOTAL_FRAMES-1) into the flat 5×6 sheet — the caller
// picks a random run of 7 consecutive (wrapping) indices once per hit, not a fixed per-instance cycle
// (Han: no two hits should look identical). Crop/scale/svg-nesting mirrors Projectile exactly (§6d).
// #863 round 2 perf fix: forwardRef so a live (not-yet-finished) hit burst's frame/opacity update every
// rAF frame instead of at throttled `frameTick` cadence — several can be mid-animation simultaneously
// (dyingList's own overlap rationale applies here too), each redrawing an image crop offset.
const HitBurst = React.memo(forwardRef(function HitBurst({ x, y, frame, opacity = 1 }, ref) {
    const svgRef = useRef(null);
    const imgRef = useRef(null);
    useImperativeHandle(ref, () => ({
        setFrame(nframe) {
            if (imgRef.current) {
                const row = Math.floor(nframe / HIT_BURST_COLS), col = nframe % HIT_BURST_COLS;
                imgRef.current.setAttribute('x', -col * HIT_BURST_FRAME.w);
                imgRef.current.setAttribute('y', -row * HIT_BURST_FRAME.h);
            }
        },
        setOpacity(op) { if (svgRef.current) svgRef.current.setAttribute('opacity', op); },
    }), []);
    const row = Math.floor(frame / HIT_BURST_COLS), col = frame % HIT_BURST_COLS;
    const ox = -col * HIT_BURST_FRAME.w, oy = -row * HIT_BURST_FRAME.h;
    return (
        <svg ref={svgRef} x={x - HIT_BURST_VIEW_W / 2} y={y - HIT_BURST_VIEW_H / 2} width={HIT_BURST_VIEW_W} height={HIT_BURST_VIEW_H}
            opacity={opacity} viewBox={`${HIT_BURST_CROP.x} ${HIT_BURST_CROP.y} ${HIT_BURST_CROP.w} ${HIT_BURST_CROP.h}`}
            style={{ pointerEvents: 'none' }}>
            <image ref={imgRef} href={HIT_BURST_URL} x={ox} y={oy} width={HIT_BURST_COLS * HIT_BURST_FRAME.w} height={HIT_BURST_ROWS * HIT_BURST_FRAME.h}
                style={{ imageRendering: 'pixelated' }} />
        </svg>
    );
}));

// Level 11 (Han 2026-08-06, "ik wil 2 maten voor elke switch een staticprojeciles2 (32x32) laten
// toveren door de tovenaar. Die vliegt mee op de maatstreep tussen de majeur en mineur-blokken"): a
// looping (not fading) flourish marking an upcoming Major↔Minor switch, using the SAME linear
// side-scroll flight math (`sideScrollX`) every other moving element here already uses — parameterized
// by the switch boundary's own `beat` rather than a literal barline-layout lookup (§6d: reuse the
// proven flight mechanic instead of reverse-engineering BarlinesLayer's own positioning).
// Bug fix (Han 2026-08-06, "de sprites van toonsoortwissel zijn te klein, houd ze op de oorspronkelijke
// schaal"): `x`/`y` are now the sprite's CENTER (caller centers it on the barline), scaled by the SAME
// `PROJECTILE_SCALE` every other projectile-family sprite here uses (§680 — one shared per-pixel zoom,
// not a second hardcoded/unscaled size).
// #863 perf fix: forwardRef handle for the switch-flourish loop (bucket A — always on-screen while a
// StaticProjectile2 is spawned, so its flight position/loop-frame update every rAF frame).
// module-level (not per-render) since both inputs (crop, PROJECTILE_SCALE) are themselves module constants
// — computing this once avoids a stale-vs-fresh dependency question for the `useImperativeHandle` below.
const STATIC_PROJECTILE2_VIEW_W = STATIC_PROJECTILE2_CROP.w * PROJECTILE_SCALE;
const STATIC_PROJECTILE2_VIEW_H = STATIC_PROJECTILE2_CROP.h * PROJECTILE_SCALE;
const StaticProjectile2 = React.memo(forwardRef(function StaticProjectile2({ x, y, frame }, ref) {
    const crop = STATIC_PROJECTILE2_CROP;
    const viewW = STATIC_PROJECTILE2_VIEW_W, viewH = STATIC_PROJECTILE2_VIEW_H;
    const svgRef = useRef(null);
    const imgRef = useRef(null);
    useImperativeHandle(ref, () => ({
        // `cx`/`cy` are the sprite's CENTER (same convention as the x/y props below). Reads the MODULE-level
        // constants directly (not the local `viewW`/`viewH` aliases above) so this is genuinely dep-free —
        // they're derived from module constants, never from anything render-scoped.
        setCenter(cx, cy) {
            if (svgRef.current) {
                svgRef.current.setAttribute('x', cx - STATIC_PROJECTILE2_VIEW_W / 2);
                svgRef.current.setAttribute('y', cy - STATIC_PROJECTILE2_VIEW_H / 2);
            }
        },
        setFrame(nframe) {
            if (imgRef.current) imgRef.current.setAttribute('x', -(nframe % STATIC_PROJECTILE2_COLS) * STATIC_PROJECTILE2_FRAME.w);
        },
    }), []);
    const col = frame % STATIC_PROJECTILE2_COLS;
    const ox = -col * STATIC_PROJECTILE2_FRAME.w, oy = 0;   // row 0 only, looped
    return (
        <svg ref={svgRef} x={x - viewW / 2} y={y - viewH / 2} width={viewW} height={viewH} viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`}>
            <image ref={imgRef} href={STATIC_PROJECTILE2_URL} x={ox} y={oy}
                width={STATIC_PROJECTILE2_COLS * STATIC_PROJECTILE2_FRAME.w}
                height={STATIC_PROJECTILE2_ROWS * STATIC_PROJECTILE2_FRAME.h}
                style={{ imageRendering: 'pixelated' }} />
        </svg>
    );
}));

// #686 (Han 2026-08-04, "spawn glow": "een gevulde witte cirkel met velle blauwe gloed... fade in en
// groei van radius 0 tot 20... maximum opacity als projectiel er is... fade uit... 2 rpg frames"): a
// one-shot flourish marking the instant a projectile becomes visible — NOT the projectile's own glow
// (removed above), a separate portal-like flash at its appearance point. `age` = frames elapsed since
// the flourish started, in [0, SPAWN_GLOW_FRAMES). The flourish starts 1 frame BEFORE the projectile's
// own visibility trigger (see the spawn-glow effect below) so the grow+fade-in completes exactly as the
// projectile appears (age=1 = peak opacity, "speel dan ook de toon" — the wizard's preview-melody audio
// is scheduled independently in App.jsx off the same measure clock, so it already lands here).
export const SPAWN_GLOW_FRAMES = 2;
// #863 round 2 perf fix: the growT/fadeT/radius/opacity math, factored out so both the render body AND the
// imperative `update()` handle below use the EXACT SAME formula (§6c — same pattern as `critterDraw`).
function spawnGlowDraw(age) {
    const half = SPAWN_GLOW_FRAMES / 2;   // grow+fade-in during the first half, fade-out during the second
    const growT = Math.min(1, age / half);
    const fadeT = Math.max(0, Math.min(1, (age - half) / half));
    return { radius: 20 * growT, opacity: age < half ? growT : 1 - fadeT };
}
const SpawnGlow = React.memo(forwardRef(function SpawnGlow({ x, y, age }, ref) {
    const circleRef = useRef(null);
    useImperativeHandle(ref, () => ({
        update(nage) {
            if (!circleRef.current) return;
            const { radius, opacity } = spawnGlowDraw(nage);
            circleRef.current.setAttribute('r', radius);
            circleRef.current.setAttribute('opacity', opacity);
        },
    }), []);
    const { radius, opacity } = spawnGlowDraw(age);
    if (opacity <= 0) return null;
    return (
        <circle ref={circleRef} cx={x} cy={y} r={radius} fill="#fff" opacity={opacity}
            style={{ filter: 'drop-shadow(0 0 4px #4ab4ff) drop-shadow(0 0 9px #2e8fe0)', pointerEvents: 'none' }} />
    );
}));

// #660 Level 2 side-scroll geometry. The render interval is decoupled from the sprite frame rate: it ticks
// FAST (INTERVAL_MS ≈ 120fps, Han) so movement is smooth, while each sprite's animation frame is derived from
// ELAPSED TIME ÷ the bpm-coupled frame duration, so the sprites still step at the right musical speed.
// The NOTES move LINEARLY; the SLIMES HOP (Han: a blob must STAND STILL on walk frames 1,2,8 = 0-indexed
// 0,1,7) — so the slime's x follows `movingProgress` (advances only on the moving frames 3–7, smoothly WITHIN
// them thanks to the high fps), while the note above it glides linearly.
const INTERVAL_MS = 8;
const TICKS_PER_BEAT = 12;   // note ticks per quarter-note beat
// #863 round 2 perf fix: the raw "elapsed ticks since a start tick, in sprite frames" formula, factored out
// of the component-scoped `framesSince` helper so the main rAF loop can call it directly with an explicit
// `fMs` (sourced fresh from `geomRef.current.frameMs`/`hitFrameMs` every frame) instead of going through
// `framesSince`'s own closure over the render-scoped `frameMs` — that closure is only safe to call from
// code that re-runs every render; the rAF loop's effect is mount-time-only (empty deps), so closing over a
// per-render `frameMs` there would silently go stale if bpm ever changed mid-level (§6c: one formula, two
// call sites, neither one duplicating it).
const framesElapsed = (atTick, startTick, fMs) => Math.floor((atTick - startTick) * INTERVAL_MS / fMs);

// Bug fix (Han 2026-08-10, "render geen rusten of zelfs maten meer nadat het nummer is afgelopen"):
// §179 already clamped slimeData/critterData (the COMBAT entities) to the level's true end
// (trebleFinalBarTick), but the underlying STAFF rendering (notes/rests/barlines) was never clamped —
// it draws whatever `scrollNotation*`/`scrollBarlines` contain, which (per §179's own diagnosis) can
// legitimately extend slightly past `numMeasures` (melodySlice.js's measure padding, resizeMelody's
// whole-rest fill, etc.). These two pure helpers apply the SAME clamp to the staff content, reusing
// the already-computed `trebleFinalBarTick` (§6c — one source of truth for "where does this song end").
//
// `clipMelodyBundle` truncates a `scrollNotation*` bundle's melody arrays (notes/offsets/durations/
// displayNotes/volumes/ties — Melody.js's field set) at the first entry whose OWN tick offset is at or
// past `maxTick`. Truncating (not filtering interior elements) preserves index alignment between the
// parallel arrays and never orphans a tie-continuation slot from the note it continues.
function clipMelodyBundle(bundle, maxTick) {
    if (!bundle || !bundle.melody || !bundle.melody.offsets || !Number.isFinite(maxTick)) return bundle;
    const { notes, offsets, durations, displayNotes, volumes, ties } = bundle.melody;
    let cutIndex = offsets.length;
    for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] != null && offsets[i] >= maxTick) { cutIndex = i; break; }
    }
    if (cutIndex === offsets.length) return bundle; // nothing past the cutoff — unchanged
    return {
        ...bundle,
        melody: {
            ...bundle.melody,
            notes: notes.slice(0, cutIndex),
            offsets: offsets.slice(0, cutIndex),
            durations: durations.slice(0, cutIndex),
            displayNotes: displayNotes ? displayNotes.slice(0, cutIndex) : displayNotes,
            volumes: volumes ? volumes.slice(0, cutIndex) : volumes,
            ties: ties ? ties.slice(0, cutIndex) : ties,
        },
    };
}
// `clipBarlinesBundle` truncates a `scrollBarlines` bundle's `offsets` array (a mix of real tick
// numbers and the string 'm' marking each barline — BarlinesLayer counts 'm' entries ORDINALLY, not by
// tick value, to position each barline) at the (leadInBars + numMeasures)-th 'm' marker — the lead-in
// bars (-1, 0) plus one barline per real measure. Any 'm' beyond that is padding past the song's end.
function clipBarlinesBundle(bundle, leadInBars) {
    if (!bundle || !bundle.offsets) return bundle;
    const maxM = leadInBars + (bundle.numMeasures || 0);
    let mSeen = 0;
    let cutIndex = bundle.offsets.length;
    for (let i = 0; i < bundle.offsets.length; i++) {
        if (bundle.offsets[i] === 'm') {
            mSeen++;
            if (mSeen > maxM) { cutIndex = i; break; }
        }
    }
    if (cutIndex === bundle.offsets.length) return bundle;
    return { ...bundle, offsets: bundle.offsets.slice(0, cutIndex) };
}
const WIGGLE_FRAMES = 7;     // how long the next slime shakes after a wrong/early note (sprite frames)
// Level 11 — a fixed lookahead of Major/Minor switch-boundary indices to render StaticProjectile2 for;
// ones beyond the level's actual length simply never spawn (sideScrollX's own "not yet due" gating).
const SWITCH_LOOKAHEAD = [1, 2, 3, 4, 5, 6, 7, 8];
const JUDGMENT_MS = 900;     // floating judgment label ("perfect" / "wrong note" …) lifetime
// judgment label colour per grading category — green→yellow→orange with distance from perfect; wrong
// note purple; corrected its own (blue) so a corrected note reads as a save, not a fail. #825 (Han
// 2026-08-10): sourced from the shared --judgment-* CSS custom properties (src/styles/App.css) — the
// SAME tokens LevelStatsCharts.jsx's two charts use — instead of an independently hardcoded hex map,
// so a colour means the same thing here and on the level-complete splash (§6d).
const JUDGMENT_COLOR = {
    perfect: 'var(--judgment-perfect)', tooFast: 'var(--judgment-near)', tooSlow: 'var(--judgment-near)',
    muchTooFast: 'var(--judgment-far)', muchTooSlow: 'var(--judgment-far)',
    secondAttemptCorrected: 'var(--judgment-corrected)', wrongNote: 'var(--judgment-wrong)',
    wrongUncorrected: 'var(--judgment-wrong)',
    missed: 'var(--judgment-missed)', extraNote: 'var(--judgment-extra)',
    // #693 round 8: a struck critter — its own colour so it reads distinctly from a generic extra note.
    // Not one of the 7 shared judgment categories (§825), stays a local literal.
    critterKilled: '#c0392b',
};
// #863 round 2 perf fix: factored so both the render body's initial paint AND the rAF loop's per-frame
// update use the EXACT SAME y formula (§6c). `g` is `geomRef.current` (bassStart/staffHeight/trebleStart —
// added there specifically for this).
function judgmentY(g, lane, prog) {
    // #862 (Han 2026-08-10, "ik krijg geen statusberichten... render die ONDER de basbalk, zodat ik die
    // kan onderscheiden van de treblenoten"): a bass judgment anchors BELOW the bass staff (floating
    // further down as it fades) instead of above the treble staff, so it's visually unmistakable from
    // treble feedback at a glance.
    return lane === 'bass' ? g.bassStart + g.staffHeight + 40 + prog * 24 : g.trebleStart - 18 - prog * 24;
}
// complete moving frames in [0, n): moving frames (0-indexed) are 2..6 (= Han's walk frames 3–7).
const movingFramesBefore = (n) => { const c = Math.floor(n / 8); const rem = n - c * 8; return c * 5 + Math.max(0, Math.min(rem - 2, 5)); };
// continuous moving progress at fractional frame `ff`: whole moving frames + the partial of the current frame
// IF it is a moving one (so x advances smoothly during 3–7 and pauses flat during 1,2,8).
const movingProgress = (ff) => {
    const full = Math.floor(ff), frac = ff - full, inCycle = full % 8;
    return movingFramesBefore(full) + (inCycle >= 2 && inCycle <= 6 ? frac : 0);
};

// #693 (Han round 3): moved to `src/utils/oscillate.js` so the bestiary portrait panels can reuse the SAME
// wobble instead of a second hand-copied version — imported below, this local definition is gone.

// Ensure the hero has at least a skin so it is never invisible.
function ensureVisible(char) {
    if (char.layers?.skin) return char;
    const s = basesFor('skin', char.gender || 'male')[0]?.variants[0];
    return s ? { ...char, layers: { ...char.layers, skin: { g: s.g, name: s.name } } } : char;
}

export default function SheetRpgLayer({
    // #1096 follow-up (Han 2026-08-21, "als ik een instellingen-overlay open tijdens een actief level,
    // moet het level pauzeren en hervatten waar het gebleven was" — confirmed via interview, NOT unmount):
    // true while the level is active but SheetMusic is showing some OTHER in-staff overlay (RANGE/CLEF/…)
    // on top (see SheetMusic.jsx's `paused={overlayEditMode}` — never true at the same time the level is
    // genuinely done, since `levelResultEditMode` unmounts this component entirely instead, see its own
    // comment there). Freezes the SAME shared clock (`tRawMs`, tick loop below) that gated-freeze already
    // uses — every downstream consumer (slime position, spawn gating, hit/miss judging window,
    // `gatedElapsedMsRef`-driven rubato audio) already reacts to a frozen `tRawMs` correctly, so pausing
    // needs no new freeze machinery, only a second source that can hold it (§6c/§6d: reuse, don't
    // reinvent, see the `externalPauseAccumMsRef` mechanism in the loop below).
    paused = false,
    trebleMelody, startX, pixelsPerTick, allOffsets, noteWidth, bpm, timeSignature,
    trebleStart, staffHeight, viewBottom, onOpenCharacter, onSlimesCleared, onSongEnd, onHit, onMiss, onCritterKilled,
    onEnemyTotal, onCritterTotal, combatNote,
    // #1096 (Han 2026-08-20, rubato cello/timpani note-hold synced to the gate, not a fixed clock): a ref
    // this component writes the CURRENT frozen-aware elapsed ms (`tRawMs` below — real elapsed time since
    // the level's audio anchor, MINUS however long the gate has spent frozen so far) into, every rAF
    // frame — same convention as `hittableNotesRef` (a ref the caller owns, populated imperatively, never
    // React state, since this updates far too often for a re-render). `tRawMs` is ALREADY exactly the
    // "gated virtual clock" this ticket needs — it's the same value driving the visual scroll freeze/
    // resume, just also exposed here so audio triggering (useLevelGatedRubatoAudio.js) can react to it
    // without a second, independent freeze-tracking mechanism (§6c — reuses `gatedPauseAccumMsRef`'s own
    // math, does not duplicate it).
    gatedElapsedMsRef = null,
    // #990 (Han 2026-08-14, RPG-level wrong-note feedback): a ref this component populates with a
    // FUNCTION returning "which note name(s) would currently count as a hit" — the exact same
    // inWindow/next-slime logic the combatNote effect below already uses to judge a played note,
    // just exposed for a SYNCHRONOUS read at note-PRESS time (PianoView.jsx), before the note even
    // starts sounding, instead of only reactively after playSound already played it. A getter
    // function, not a snapshot value — the acceptable-note set changes continuously as slimes
    // scroll through the timing window, unlike a fixed "next expected note" index.
    hittableNotesRef = null,
    // Bug fix (Han 2026-08-10, "de melodie komt helemaal nooit... het is NIET robuust geïmplementeerd"):
    // a watchdog signal for App.jsx — fired ONCE, the instant this component's own tick clock actually
    // unfreezes (see the rAF loop below). App.jsx uses this to detect + self-heal the case where the
    // visual clock never unfreezes at all despite the audio anchor being set (root cause unconfirmed;
    // this is a structural safety net, not a targeted fix for a specific diagnosed cause).
    onFirstTickUnfrozen = null,
    // #862 (Han 2026-08-10, "doe maar meteen - ik wil 15 volledig kunnen testen"): twoHanded levels —
    // the bass melody to spawn bass-slimes from (App.jsx's twoHandedBassMelody, already clipped to
    // start at measure 1) and the hit/miss EVENT useTwoHandedBass emits. Grading itself stays owned by
    // useTwoHandedBass (its per-measure hit/miss determination, already correct/tested) — this component
    // only resolves the matching visual slime off the event, it never re-derives hit/miss itself (§6c).
    bassMelody = null, bassCombatEvent = null,
    sideScroll = false, gatedScroll = false, viewRight = 0, beatsOnScreen = 8, debugMode = false,
    // #867 rework round 4 (Han 2026-08-20, "na maat 2... begint het level te verspringen"): which wave
    // is currently active (App.jsx's `level.wave`) — the combat-driven signal for "a fresh wave truly
    // started", replacing the melody's own note content (which now changes on every JIT background block
    // append for a continuously-generated level and is no longer a reliable "new wave" proxy — see the
    // wave-reset effect's own comment below).
    levelWaveIndex = 0,
    // Bug fix (Han 2026-08-20, "na level 7 blijf ik heel veel MISSED NOTES krijgen, na voltooiing"): lets
    // the wave-reset effect below tell "entering a genuine next wave" (`levelWaveIndex < levelTotalWaves`)
    // apart from "`levelWaveIndex` just incremented one final time because the level itself ended" (
    // `levelWaveIndex === levelTotalWaves`, useLevel.js's `onWaveCleared` always returns `next` even on the
    // clear that ends the level) — see that effect's own comment for why conflating the two wiped
    // already-resolved combat state and caused a burst of spurious MISSED judgments right at level end.
    levelTotalWaves = 0,
    // #992 (Han: 3 new Playback Settings setters — RPG fx volume / RPG music volume / RPG visibility):
    // `rpgFxVolume` is the raw VOL_STEPS value (0-1), converted below into a multiplier relative to its
    // OWN default (DEFAULT_RPG_FX_VOLUME) — never a raw replacement gain (see rpgVolumeMultiplier).
    // `rpgVisibility` is a direct percent (100 or 50, no existing path to preserve) mapped straight to
    // this whole layer's opacity. RPG music volume has no place here — it only touches App.jsx/
    // useWorldAmbientMusic's audio paths, never anything SheetRpgLayer itself renders or plays.
    rpgFxVolume = DEFAULT_RPG_FX_VOLUME, rpgVisibility = 100,
    // #661 side-scroll: the REAL scrolling staff is drawn via the canonical renderers (§6d) instead of
    // hand-rolled glyphs. `scrollNotation` = the treble MelodyNotesLayer prop bundle (heads/rests/colours/
    // beams), `scrollBarlines` = the BarlinesLayer prop bundle (moving barlines + measure numbers). Both are
    // null outside side-scroll. The whole staff is laid out at the scroll spacing (startX = viewRight,
    // pixelsPerTick = scrollPPT) and translated left over time — rigid & LINEAR (Han); slimes hop under it.
    scrollNotation = null, scrollBarlines = null,
    // #871 (Han 2026-08-11 UAT: "akkoorden en lyrics schuiven niet mee met de noten"): chord labels +
    // song lyrics for the scrolling treble staff — same bundle-prop convention as scrollNotation above,
    // null outside side-scroll / when nothing to show. Rendered inside the SAME translated group as the
    // treble noteheads (noteScrollRef below) so they scroll in perfect lockstep for free — no new
    // imperative per-frame update code needed. Purely visual, no combat coupling.
    scrollChords = null, scrollLyrics = null,
    // #661 (Han 2026-08-02, "de 3 lijnen zichtbaar maken"): bass + percussion scroll ALONGSIDE treble, at
    // their own staff Y positions — visual only (no slimes, no combat; their audio is scheduled separately
    // via playMelodies in App.jsx). Same bundle shape as `scrollNotation`, null when not visible.
    bassStart = 0, percussionStart = 0, scrollNotationBass = null, scrollNotationPercussion = null,
    // #661/§88 (Han): the scroll rides the app's robust AudioContext clock (context.currentTime) — the SAME
    // clock the Sequencer schedules on and useSheetMusicHighlight reads — NOT a new performance.now clock. So
    // when the backing (metronome/cello/timpani) plays via the Sequencer, the visuals are locked to audio.
    context = null,
    // §88: the audio-time (seconds) the level's backing was scheduled to start on. When set, the scroll
    // anchors its t=0 to it (elapsed = context.currentTime − scrollStartTime) so a slime reaches the hero at
    // EXACTLY the beat the metronome clicks. null → free-running (first-frame anchor), e.g. Level 1 / tests.
    scrollStartTime = null,
    // #662 (Han 2026-08-02, "avatar... nooit tijdens de settings view actief"): hides only the hero doll
    // (click-to-open-character-menu). Slimes/enemies are gated separately — see `trebleMelody` at the
    // call site in SheetMusic.jsx (null outside a level → slimeData never populates).
    hideHero = false,
    // #679 (Han 2026-08-03, Level 9): "Slime" (default, every other level) or "Wizard" (Level 9's static
    // caster + linear projectiles). Read from the level config (levels.json), never hardcoded here (§6c) —
    // a future enemyType only needs a new branch here, no SheetMusic.jsx/App.jsx change.
    enemyType = 'Slime',
    // #686 (Han 2026-08-04, Level 9 call-response): how many measures ahead of its RESPONSE beat a
    // projectile becomes visible — see PROJECTILE_SPAWN_LEAD_BEATS below for how this interacts with
    // the (unchanged) beatsOnScreen flight span.
    wizardSpawnLeadMeasures = 1,
    // Bug fix (Han 2026-08-25 UAT, "misschien is er een hard code op even/oneven... die werkt voor
    // blokken van 1, maar nu zijn het blokken van 4"): the call/response half of each measure used to be
    // decided by raw (measureIndex+1)%2 parity (`isOddMeasure` below), correct ONLY when a call/response
    // group is exactly 1 measure (letter d / native Level 9-11's own default). For letter e
    // (`callResponseMeasures: 2`) that parity no longer lines up with the actual call/response boundary
    // — see `isOddMeasure`'s own comment for the full derivation. `lvl.callResponseMeasures` (1 for
    // letter d, 2 for letter e — SheetMusic.jsx's own `callResponseGroupMeasures` prop, same source
    // BarlinesLayer's #1155 labeling already reads), null/1 = every level whose call/response group is
    // a single measure (unchanged behaviour).
    callResponseGroupMeasures = null,
    // Level 11 (Han 2026-08-06): a purely decorative, non-combat green wizard shown alongside Slime
    // enemies — see the render block near the real Wizard's own static render for the full rationale.
    decorativeWizard = false,
    // #871 (Han 2026-08-11, "abc music en level namen"): a bestiary creature NAME (levels.json's `npc`
    // field) shown standing decoratively at the wizard's anchor position — see the render block below,
    // right after decorativeWizard's own. Distinct field: `decorativeWizard` stays coupled to Level 11's
    // own key-modulation mechanic, `npc` is the general-purpose mechanism for any level.
    npc = null,
}) {
    // #992 — relative-to-default multiplier applied to every playOneShotSfx() call below (HIT_ON_WOOD/
    // DAMAGED one-shots); == 1.0 at the shipped default (DEFAULT_RPG_FX_VOLUME), so combat sfx sounds
    // identical to before this ticket until the player actually moves the setter.
    const rpgFxVolumeMultiplier = useMemo(
        () => rpgVolumeMultiplier(rpgFxVolume, DEFAULT_RPG_FX_VOLUME),
        [rpgFxVolume],
    );
    const isWizard = enemyType === 'Wizard';
    // Level 10 (Han 2026-08-06, "de noten van de wizardmaten moeten geen slime hebben, maar een
    // projectile krijgen"): a Mixed level shows a STATIC black wizard (like a real Wizard level) but
    // its per-note rendering below is decided PER ITEM (Slime for a Slime-block note, Projectile for a
    // Wizard-block note) via `blockTypeAt` (useLevelMixedStream.js) instead of the single level-wide
    // `isWizard` flag every other branch in this file still uses.
    const isMixed = enemyType === 'Mixed';
    // both happen to be 5 today, but kept as a named derived value (not the Slime constant) so a future
    // change to either death animation's length can never silently desync the other (§6c: no hardcoding).
    const DEATH_FRAMES = (isWizard || isMixed) ? PROJECTILE_DEATH.frames : SLIME_DEATH.frames;
    const idleAnim = ANIMATIONS[0];
    const [savedChar] = useState(loadCharacter);            // read once (not per tick)
    const hero = useMemo(() => ensureVisible(savedChar), [savedChar]);

    // SAME positioning as renderMelodyNotes (getTickX): tick-based when pixelsPerTick is set, else index-based
    // via allOffsets + noteWidth (ppt is null in the normal render — the fallback keeps slimes on their notes).
    const getTickX = pixelsPerTick != null
        ? (offset) => startX + offset * pixelsPerTick
        : (offset) => { const idx = allOffsets.indexOf(offset); return idx >= 0 ? startX + (idx - 1) * noteWidth : startX; };

    // ordered (left→right) slime data for the treble notes (rests/spacers skipped) — the "enemies".
    // #1043 (Han 2026-08-17, "karakter/enemies moeten wat omlaag ... zet die maar op de onderkant van
    // het level (baseline)"): was `trebleStart + staffHeight + 12` — relative to the treble staff, so
    // when the percussion staff is hidden the layout shifts and enemies end up overlapping the key
    // signature. Anchored to `viewBottom` instead, same convention as `heroY`/`wizardY` below —
    // independent of which staves are visible.
    const slimeY = viewBottom - SLIME_VIEW_H;
    // #862 (Han 2026-08-10, "slimes van de basnoten moeten lager staan, transleer ze de staf-afstand"):
    // bass-slimes sit in their OWN lane, translated down by exactly the vertical distance between the
    // two staves — not a separately-tuned offset. Relation preserved after #1043's baseline anchor.
    const bassSlimeY = slimeY + (bassStart - trebleStart);
    // #685 (Han 2026-08-04, "zorg dat de projectielen midden op de notenbalk staat (dus ter hoogte van de
    // b4)"): the projectile no longer rides in the slime lane below the staff — it's vertically CENTERED on
    // B4 (the treble staff's middle line), independent of `slimeY`. Only meaningful when isWizard; harmless
    // to compute unconditionally (getNoteAbsoluteY is cheap, no side effects).
    const projectileCenterY = getNoteAbsoluteY('B4', trebleStart, 'treble', 'treble') - PROJECTILE_VIEW_H / 2;
    // #824 bug fix (Han 2026-08-10, "er verschijnen soms nog rusten (en dus ook animals) na de
    // laatste maat"): the JIT-generated/padded trebleMelody can extend slightly past the level's
    // declared length (ceil-rounded measure padding, block-based generation overshoot) even though
    // the level's TRUE end is `scrollBarlines.numMeasures` — the same value `finalBarTick` below
    // (line ~865) uses to draw the final barline. Slimes/critters must never spawn past that same
    // boundary, so both derive from the identical value rather than trusting trebleMelody's own
    // length (§6c: one source of truth, not two independently-derived "end of song" values).
    const trebleFinalBarTick = sideScroll && scrollBarlines
        ? (scrollBarlines.numMeasures || 0) * (scrollBarlines.measureLengthSlots || 48)
        : Infinity;
    // Bug fix (Han 2026-08-10, "render geen rusten of zelfs maten meer nadat het nummer is
    // afgelopen"): same clamp as slimeData/critterData above, now applied to the actual STAFF
    // rendering (notes/rests/barlines) — see clipMelodyBundle/clipBarlinesBundle's own comments.
    // Memoised so the clamp only recomputes when its own inputs change, not every fast tick.
    const scrollNotationClipped = useMemo(
        () => (sideScroll ? clipMelodyBundle(scrollNotation, trebleFinalBarTick) : scrollNotation),
        [sideScroll, scrollNotation, trebleFinalBarTick]
    );
    const scrollNotationBassClipped = useMemo(
        () => (sideScroll ? clipMelodyBundle(scrollNotationBass, trebleFinalBarTick) : scrollNotationBass),
        [sideScroll, scrollNotationBass, trebleFinalBarTick]
    );
    const scrollNotationPercussionClipped = useMemo(
        () => (sideScroll ? clipMelodyBundle(scrollNotationPercussion, trebleFinalBarTick) : scrollNotationPercussion),
        [sideScroll, scrollNotationPercussion, trebleFinalBarTick]
    );
    // #994: the lead-in is per-level now (was the fixed LEVEL_LEAD_IN_BARS = 2). It is derived from the
    // SAME bundle field the positioning math already uses (`scrollBarlines.leadInTicks`, see
    // barlineStartX below) rather than taken as a separate prop — so a bar COUNT and a tick COUNT here
    // can never disagree, and there is no independent default to silently mask a wiring omission
    // (#889's own follow-up bug was exactly that).
    const leadInBars = useMemo(
        () => (scrollBarlines
            ? Math.round((scrollBarlines.leadInTicks || 0) / (scrollBarlines.measureLengthSlots || 48))
            : 0),
        [scrollBarlines]
    );
    const scrollBarlinesClipped = useMemo(
        () => (sideScroll ? clipBarlinesBundle(scrollBarlines, leadInBars) : scrollBarlines),
        [sideScroll, scrollBarlines, leadInBars]
    );
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
                if (offsets[i] == null || offsets[i] >= trebleFinalBarTick) continue;
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
    }, [trebleMelody, startX, pixelsPerTick, noteWidth, trebleStart, staffHeight, trebleFinalBarTick]);
    const total = slimeData.length;

    // #862 (Han 2026-08-10, twoHanded levels, "ik wil 15 volledig kunnen testen"): mirrors slimeData
    // above but far simpler — `bassMelody` (App.jsx's twoHandedBassMelody) is already exactly one real
    // note per content measure (LEVEL_BASS_SIMPLE's "roots on one, 1 noot per maat"), so no tie-chain
    // logic is needed. `measureIndex` (0-based content measure, matching useTwoHandedBass's own
    // `measureRef` numbering) is how the combat-event effect below finds WHICH bass-slime a hit/miss
    // event belongs to — grading itself stays owned by useTwoHandedBass (§6c), this is purely the
    // matching visual entry.
    const bassSlimeData = useMemo(() => {
        const out = [];
        if (bassMelody && Array.isArray(bassMelody.notes) && scrollBarlinesClipped) {
            const mls = scrollBarlinesClipped.measureLengthSlots || 48;
            const { notes, offsets } = bassMelody;
            for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                if (note === 'r' || note === 'c' || note == null || offsets[i] == null) continue;
                const measureIndex = Math.floor(offsets[i] / mls) - leadInBars;
                out.push({
                    key: i, x: getTickX(offsets[i]) - SLIME_VIEW_W / 2 + 3, beat: offsets[i] / TICKS_PER_BEAT,
                    note, measureIndex, colorKey: slimeColorKey(24),
                });
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bassMelody, scrollBarlinesClipped, leadInBars, startX, pixelsPerTick]);

    // #693 round 8 ("zet onder elke rust een critter... net als slimes onder rusten"): one entry per REST
    // slot (the exact mirror of slimeData above, which skips rests — this only keeps them). A stable
    // (non-random-per-render) creature pick per slot index, so a critter's costume doesn't change on an
    // unrelated re-render while it's still on screen.
    const critterData = useMemo(() => {
        const out = [];
        if (trebleMelody && Array.isArray(trebleMelody.notes) && CRITTER_VARIANTS.length > 0) {
            const { notes, offsets, durations } = trebleMelody;
            for (let i = 0; i < notes.length; i++) {
                if (notes[i] !== 'r' || offsets[i] == null) continue;
                if (offsets[i] >= trebleFinalBarTick) continue;
                const variant = CRITTER_VARIANTS[i % CRITTER_VARIANTS.length];
                // #693 round 9 (Han: "critters staan onder de maatstrepen, niet onder de rusten"): a rest's
                // OWN offset is its START tick — for a Level 9 whole-measure rest that's the SAME tick as
                // the barline, so a critter placed there sits glued to the barline instead of under the
                // rest glyph, which renderMelodyNotes.jsx now CENTERS in the measure (round 7's whole-rest
                // centering). Centering the critter on the rest's own duration (`offset + duration/2`)
                // matches wherever the glyph actually is, whole-measure or partial.
                const centerOffset = offsets[i] + (durations[i] || 0) / 2;
                out.push({ key: i, beat: centerOffset / TICKS_PER_BEAT, variant });
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trebleMelody, trebleFinalBarTick]);

    // #693 round 8 (Han: "enemies vanquished x/n" / "critters saved y/m" — the splash needs a TOTAL
    // denominator, not just the running defeated/killed counts). Reports the current known count upward
    // whenever it changes; for a JIT-streamed melody (Level 9) this grows as blocks arrive and settles at
    // the true total once the melody stops growing — still correct by the time the level actually ends.
    useEffect(() => { onEnemyTotal?.(slimeData.length); }, [slimeData.length, onEnemyTotal]);
    useEffect(() => { onCritterTotal?.(critterData.length); }, [critterData.length, onCritterTotal]);

    // sprite frame duration (bpm-coupled) + beat length — SEPARATE from the render interval (INTERVAL_MS).
    const frameMs = frameMsForBpm(bpm, timeSignature);
    const beatMs = bpm > 0 ? 60000 / bpm : 750;
    // #688 (Han 2026-08-04, Level 9 rework: "de projectiles worden gerendered net zoals de slimes; dus
    // twee maten op voorhand. het verschil is, ze zijn onzichtbaar, tot 1 maat voor ze gespeeld moeten
    // worden"): back to the projectile using the SAME flight span as a slime (`beatsOnScreen`, 2 measures —
    // §686's "the projectile needs its own 1-measure flight span" reasoning no longer applies now that
    // Level 9 is one continuous melody again, not several separately-generated 2-measure waves). Only
    // VISIBILITY is gated — becomes visible `wizardSpawnLeadMeasures` measures before it's due, derived
    // from the real measure length (§6c — never hardcode "4 beats").
    const beatsPerMeasure = scrollBarlines?.measureLengthSlots ? scrollBarlines.measureLengthSlots / TICKS_PER_BEAT : 4;
    const spawnLeadBeats = Math.min(beatsOnScreen, wizardSpawnLeadMeasures * beatsPerMeasure);

    // ── combat state ──────────────────────────────────────────────────────────
    // #863 (Han 2026-08-10, perf fix): the raw INTERVAL_MS-stepped clock used to be a piece of React state
    // (`tick`) updated ~120×/sec, forcing a full render+reconcile of the whole SVG subtree every ~8ms — the
    // actual root cause of the reported jank/bad INP. It is now `tickRef` ONLY (declared below) — a plain
    // ref, mutated every rAF frame but never triggering React. Continuous positions (slimes/critters/
    // projectiles/scroll transforms — "bucket A") are pushed straight to the DOM from the rAF loop via
    // imperative component handles (see Slime/Critter/Projectile/StaticProjectile2 above). Everything else
    // that only needs to react when a SPRITE FRAME actually advances ("bucket B" — hero/wizard idle,
    // dying-animation frames, judgment fade, hit-burst, spawn-glow, wiggle) is driven by `frameTick` below,
    // which only changes (and thus only re-renders React) once per sprite frame (~3–10Hz) instead of every
    // tick (~120Hz) — a legitimate cadence since none of that content is animated faster than a sprite frame
    // to begin with; no visual smoothness is lost, only redundant intermediate re-renders are cut.
    const [frameTick, setFrameTick] = useState(0);
    const lastFrameIndexRef = useRef(-1);   // last sprite-frame index frameTick was set to (dedupe guard)
    // #1050 second follow-up (Han 2026-08-18, "still jitter, exactly the same as before" — reported
    // AFTER the §257/§258 position-freeze fixes, i.e. a genuinely different cause): a real Playwright +
    // Edge CDP profile of Level 1 showed 53% of frames dropped in `npm run dev` (only 0.3% in a
    // production build), with the dominant CPU cost being React's DEV-mode `jsxDEV`/`createElement`
    // overhead — SheetRpgLayer's render body reconstructs its ENTIRE JSX tree (every `.map()` over
    // slimes/critters/judgments/hits/spawnGlows/…) every time `frameTick` changes, and it used to change
    // every sprite-frame boundary (`frameMs` — as low as ~100ms at higher BPM). By the time §258 landed,
    // NOTHING continuously-animated actually needs frameTick to re-render that often any more: every
    // live entity's position AND frame (including walk-vs-idle, `slimeWalkOrIdleFrame`) is already fully
    // imperative. frameTick's only remaining real job is mount/unmount (culling) plus a few still-
    // declarative one-off paths (judgment/hit/spawnGlow mounting, static-mode idle cycling) — none of
    // which need sub-second precision (an entity is on screen for multiple SECONDS before it must
    // mount/unmount). Decoupling the re-render rate from `frameMs` (tempo-dependent) to a fixed, coarse
    // wall-clock throttle cuts render-body invocations several-fold with no visible behavior change.
    const FRAMETICK_THROTTLE_MS = 200;
    const lastFrameTickWallMsRef = useRef(0);
    // #1050 third follow-up (Han 2026-08-18, "the performance sucks... decouple [note scrolling] from
    // the RPG-overlay in terms of framerate" — after the §257/§258/FRAMETICK_THROTTLE fixes still
    // weren't enough): the scroll-transform update (barline/note groups, above) and ALL the RPG combat
    // entity work (slime/critter/dying/judgment/hit/spawnGlow position+frame pushes) run in the SAME
    // rAF callback. Even though the scroll-transform push happens FIRST and is cheap, the browser can't
    // paint the frame until the WHOLE callback returns — so if the entity work is slow, the note
    // position update that already happened moments earlier in the same callback still arrives late.
    // Splitting into two separate requestAnimationFrame chains would NOT fix this by itself (the browser
    // still batches every rAF callback due for a frame before painting) — the fix that actually matters
    // is letting the ENTITY work skip itself on some frames while the clock/scroll-transform NEVER does.
    // `runRpgEntityUpdates` (computed once per frame, just below) gates every entity position/frame push
    // EXCEPT the Wizard's cast-sync scan, which stays per-frame on purpose (Han, #679: "de flits moet
    // exact op de noot landen" — throttling that specific scan previously caused an audible desync bug).
    const RPG_ENTITY_THROTTLE_MS = 33;   // ~30fps ceiling for entities; note scroll itself is never throttled
    const lastRpgEntityUpdateMsRef = useRef(0);
    const [killedCount, setKilledCount] = useState(0);     // static: killed count; side-scroll: RESOLVED count
    // dying is a LIST (Han 2026-08-02): with the ±1/2-beat graded window two kills can overlap one death
    // animation (notes a beat apart, played fast) — a single `dying` slot would swallow the second kill.
    const [dyingList, setDyingList] = useState([]);        // [{ index, startTick, x }] — slimes playing death
    const [killedSet, setKilledSet] = useState(() => new Set());   // side-scroll: struck slimes (death done → hidden)
    // #693 round 8: critters (under rests) hit by an accidental note during the rest — simpler than a
    // slime's kill (no separate death animation), just hidden once struck.
    const [killedCritters, setKilledCritters] = useState(() => new Set());
    // Bug fix (Han 2026-08-21): `startRawMs` (never-frozen raw clock), not `startTick` (the gated clock)
    // — an input-reaction animation must always finish playing even if the gate stays frozen right after
    // it starts (e.g. a wrong attempt while waiting), see `framesSinceRaw`'s own comment for the full story.
    const [heroAttack, setHeroAttack] = useState(null);    // { startRawMs } — hero playing attack once
    const [wiggle, setWiggle] = useState(null);            // { index, startRawMs } — a missed/next slime shaking
    const [judgments, setJudgments] = useState([]);        // [{ id, category, startTick }] floating labels at the strike line
    // #686 Level 9 — one-shot "spawn glow" flourish, fired once per projectile the instant it becomes
    // visible (see the per-tick effect below). `spawnGlowFiredRef` prevents re-firing every tick while a
    // projectile stays visible.
    const [spawnGlows, setSpawnGlows] = useState([]);      // [{ key, startTick, x, y }]
    const spawnGlowFiredRef = useRef(new Set());
    // #825 (Han 2026-08-10) — one-shot "hit" bursts, list-shaped for the SAME overlap reason dyingList
    // is (two kills a beat apart can both be mid-animation at once). `frames` = 7 consecutive (wrapping)
    // sheet indices picked ONCE per hit at spawn time, not re-randomized per render.
    const [hits, setHits] = useState([]);   // [{ id, startTick, x, y, frames: number[7] }]
    const hitIdRef = useRef(0);
    // #862 — bass-slime death state, its OWN index space (separate from dyingList/killedSet above, which
    // index into slimeData/treble). `judgments`/`hits` above are SHARED (a `lane: 'bass'` field on each
    // entry, set by the combat-event effect below, picks the right Y at render time) — no separate
    // bass-judgment/bass-hit arrays needed, just a lane tag.
    const [bassDyingList, setBassDyingList] = useState([]);
    const [bassKilledSet, setBassKilledSet] = useState(() => new Set());
    const tickRef = useRef(0);
    // #863 perf fix — bucket A imperative refs. The 6 scroll-transform `<g>` wrappers (barline/note/rest/
    // real/bass/percussion) get their `transform` attribute pushed every rAF frame instead of recomputing
    // via React state (see the main loop below). The 3 entity ref Maps hold live (on-screen, not dying)
    // Slime/Critter/Projectile imperative handles, keyed by their stable data key, populated via callback
    // refs in the render body's `.map()` calls below; `switchRefsArr` is a plain array (SWITCH_LOOKAHEAD is
    // a fixed-length, fixed-order constant, so no Map/key bookkeeping is needed for it).
    const barlineScrollRef = useRef(null);
    const noteScrollRef = useRef(null);
    const restScrollRef = useRef(null);
    const realScrollRef = useRef(null);
    const bassScrollRef = useRef(null);
    const percussionScrollRef = useRef(null);
    const slimeRefsMap = useRef(new Map());       // key -> { el, kind: 'slime'|'projectile', idx }
    const bassSlimeRefsMap = useRef(new Map());   // key -> { el, idx }
    const critterRefsMap = useRef(new Map());     // key -> { el, idx }
    const switchRefsArr = useRef([]);             // index (into SWITCH_LOOKAHEAD) -> el
    // #863 round 2 — same ref-map pattern extended to "bucket B" content: dying slimes/projectiles, the
    // ghost-note fly-up tween, judgments, hit bursts, and spawn glows. These are short-lived/few-at-a-time
    // (which is why round 1 left them on the throttled `frameTick` path), but Han's follow-up measurement
    // showed enough of them stacking up (multiple simultaneous judgments/hits/dying entries) to still be
    // worth pushing to the rAF loop rather than a React re-render.
    const dyingRefsMap = useRef(new Map());        // key -> { el, kind: 'slime'|'projectile', startTick }
    const ghostNoteRefsMap = useRef(new Map());    // key -> { gEl, staticEl, flyEl, startTick } — the note-fly-up tween
    const bassDyingRefsMap = useRef(new Map());    // key -> { el, startTick } (bass lane, own index space per §862)
    const judgmentRefsMap = useRef(new Map());     // id -> { el, startTick, lane }
    const hitRefsMap = useRef(new Map());          // id -> { el, startTick, frames }
    const spawnGlowRefsMap = useRef(new Map());    // key -> { el, startTick }
    const wizardRef = useRef(null);                // the combat Wizard's imperative handle (isWizard || isMixed)
    const decorativeWizardRef = useRef(null);      // the decorative-only green Wizard's handle (Level 11)
    // #863 — wiggle's shake offset (point 8): recomputed once per render (frameTick cadence, see below)
    // and read fresh every rAF frame by the bucket-A slime-position loop, so a wiggling slime's continuous
    // position update can add it in without wiggle itself needing to be a bucket-A ref-driven thing (it's
    // short-lived and rare — not worth its own imperative plumbing, see point 8 of the ticket).
    const wiggleRef = useRef(null);
    const slimesRef = useRef(slimeData); slimesRef.current = slimeData;
    const bassSlimesRef = useRef(bassSlimeData); bassSlimesRef.current = bassSlimeData;
    const crittersRef = useRef(critterData); crittersRef.current = critterData;
    const killedCrittersRef = useRef(killedCritters); killedCrittersRef.current = killedCritters;
    const clearedRef = useRef(false);
    // side-scroll graded combat bookkeeping (refs, not state — read inside the nonce-keyed effect "at now"):
    // resolved = every slime with a final outcome (killed OR its late window expired); wrongAttempt = slimes
    // that got a wrong-pitch attempt while hittable, so a correction scores 'on second attempt' (Han).
    const resolvedRef = useRef(new Set());
    const wrongAttemptRef = useRef(new Set());
    // #663 (Han 2026-08-03, "te snel achter elkaar noten aansla... tweede noot wordt niet geregistreerd"):
    // static (Level 1) combat's target index used to be `killedCount`, which only advances once a death
    // ANIMATION finishes (see the `finished` effect below) — combined with the old single-slot `dying`
    // gate, a second correct note played before the first slime's death animation finished was silently
    // dropped entirely. Mirrors the side-scroll fix (dyingList became a LIST for the same reason, Han
    // 2026-08-02): resolvedStaticRef marks a slime hit THE MOMENT it's struck (not when its animation
    // finishes), so the next note can immediately target the NEXT unresolved slime while earlier ones are
    // still animating. `killedCount` still only advances on animation-finish — it only drives rendering
    // (`idx < killedCount` hides fully-animated kills) and the wave-cleared check, both fine to lag the
    // animation queue.
    const resolvedStaticRef = useRef(new Set());
    const judgmentIdRef = useRef(0);
    const heroAttackRef = useRef(null); heroAttackRef.current = heroAttack;
    // hit/miss callbacks via refs so the nonce-keyed note effect always sees the latest (no stale closure).
    const onHitRef = useRef(onHit); onHitRef.current = onHit;
    const onMissRef = useRef(onMiss); onMissRef.current = onMiss;
    const onCritterKilledRef = useRef(onCritterKilled); onCritterKilledRef.current = onCritterKilled;
    const onFirstTickUnfrozenRef = useRef(onFirstTickUnfrozen); onFirstTickUnfrozenRef.current = onFirstTickUnfrozen;
    const waveStartRef = useRef(0);                        // tick at which the current wave's clock started
    // #867 rework (Han 2026-08-20, "level 3... loopt vast; nieuwe maten niet fatsoenlijk gegenereerd"):
    // tracks the PREVIOUS `scrollStartTime` seen by the wave-reset effect below, so it can tell "the real
    // anchor just arrived for the FIRST time" (prev was null, now isn't — must reset to 0, see that
    // effect's own #1050-round-6 comment) apart from "a LATER wave started while already anchored" (prev
    // was already non-null — must NOT reset to 0, see waveStartRef's own new comment there).
    const prevScrollStartTimeRef = useRef(null);
    // #1050 follow-up (Han 2026-08-17, "pretty clear and steady 1/12-th note stutter"): the JSX-side
    // `transform` on the scroll `<g>` groups (barlineScrollRef/noteScrollRef/etc., see their declaration
    // near `scrollPx` below) must be a value that's set ONCE per wave and then left alone — never
    // recomputed from the live tick on a later render — or React's reconciliation stomps the rAF loop's
    // smooth imperative position back to a stale snapshot every time this component re-renders (which
    // happens at `frameTick`/sprite-frame cadence, FRAMES_PER_BEAT times per beat — tempo-locked, hence
    // "steady"). Exactly the `opacity`-via-JSX-props bug CLAUDE.md §6 already bans, for `transform`
    // instead. Written once by the wave-reset effect below (the only place `waveStartRef` changes), read
    // (never written) by the render body.
    const frozenScrollPxRef = useRef(0);
    // #1050 second follow-up (Han 2026-08-17, "still a jutter" after the scroll-transform freeze above):
    // the IDENTICAL bug exists one level down, per LIVE entity. Slime/Projectile/Critter/etc. each carry
    // a forwardRef imperative handle (setPosition/setFrame/…) that the rAF loop drives every frame — but
    // their declarative x/y/frame/opacity JSX props (e.g. Slime's own `<svg x={x} y={y}>`) were ALSO
    // recomputed from the live tick on every parent re-render (frameTick cadence) and handed straight
    // down, so React kept re-asserting a stale snapshot onto the exact same attribute the rAF loop was
    // smoothly animating — one snap per entity, per re-render, same as the group transform did.
    // `freezeOnce` pins each entity's declarative props to whatever they were the FIRST time its key was
    // rendered (their true mount moment) and returns that SAME object on every later call for the same
    // key, so React.memo sees unchanged props and never touches the DOM again — 100% of ongoing motion
    // becomes the rAF loop's imperative calls, uninterrupted. Callers MUST delete a key from its cache
    // wherever they delete it from the matching *RefsMap (culled off-screen / killed / dying transition)
    // so a later reused key gets a genuine fresh value instead of a stale leftover.
    const freezeOnce = (cache, key, compute) => {
        let v = cache.get(key);
        if (!v) { v = compute(); cache.set(key, v); }
        return v;
    };
    const frozenSlimePropsRef = useRef(new Map());         // treble slime/projectile — keyed by s.key
    const frozenBassSlimePropsRef = useRef(new Map());
    const frozenCritterPropsRef = useRef(new Map());
    const frozenSwitchPropsRef = useRef(new Map());        // Level 11 switch-flourish — keyed by index i
    // #1052 (Han 2026-08-17, "gated scroll" — Level 1): the scroll clock freezes the INSTANT the earliest
    // still-unresolved slime reaches its own "perfect timing" instant (same delta===0 point the hit-window/
    // expiry logic already use, §6c), and resumes exactly where it left off on a correct hit — no jump.
    // Implemented as a single accumulator subtracted from the RAW (never-frozen) elapsed-since-anchor ms,
    // rather than a second parallel clock: every position/hit-window/wave-elapsed formula in this file
    // already reads `tickRef.current`/`tRawMs`, so freezing THAT one shared value freezes everything
    // downstream for free (including the expiry effect, which simply can never reach its own threshold
    // while frozen — no separate gate needed there).
    const gatedFrozenRef = useRef(false);          // currently waiting for the player to defeat the due note?
    const gatedFreezeStartRawMsRef = useRef(0);    // RAW elapsed-ms-since-anchor at the instant we froze
    const gatedPauseAccumMsRef = useRef(0);        // total RAW ms consumed by freezes so far this wave
    // FR (Han 2026-08-21, "als input <1/16 noot te laat is, kan je dan 'inhalen'?... auditief zou de
    // timpaan geen last hebben van de vertraging"): a near-perfect hit (within `CATCHUP_THRESHOLD_MS`,
    // one sixteenth-note of lateness) still folds its FULL lateness into `gatedPauseAccumMsRef` the
    // instant it resolves (below) — preserving the existing "resume exactly where it froze, zero jump"
    // guarantee this file's own tests already pin down — but THEN this ramp claws that tiny amount back
    // out of the accumulator smoothly over `CATCHUP_RAMP_MS`, so the level's shared clock (and everything
    // reading it: scroll position, `gatedElapsedMsRef` → the rubato cello/timpani hook) ends up almost
    // exactly back on the ORIGINAL fixed-tempo schedule a few hundred ms later, instead of permanently
    // carrying that sliver of lateness forward for the rest of the song. Without this, EVERY near-perfect
    // hit (the common case) compounds into a growing drift away from the notated tempo — Han: "loopt het
    // level alsnog vertraging op". A freeze longer than the threshold (a real, noticeable wait) is
    // deliberately NOT caught up — only truly negligible lateness is invisibly absorbed. `null` when no
    // ramp is in progress; otherwise `{ startRawMs, recoverMs, accumBefore }` (see the resume branch and
    // the main loop's ramp-processing step, both below, for how these three fields are used).
    const catchupRampRef = useRef(null);
    const CATCHUP_RAMP_MS = 220;   // short enough to read as "snappy", long enough to never look like a jump
    const rawTRawMsRef = useRef(0);                // RAW (never-frozen) elapsed-ms-since-anchor, updated every
                                                    // rAF frame — lets effects outside the loop (e.g. the
                                                    // combat-hit effect, on unfreeze) read "now" independent
                                                    // of whether the gated clock is currently frozen.
    const geomRef = useRef({});                            // geometry read by the effects/rAF loop "at now"

    // #1102 (adaptive tempo, Han 2026-08-28): `bpm` — and therefore `beatMs` — can now change MID-LEVEL,
    // which would otherwise re-rate this file's WHOLE elapsed duration retroactively and jump the notes,
    // every slime, and the gated freeze point all at once. `tempoNormalizedMs` (tempoScrollAnchor.js —
    // see that file for the full rationale) is the one shared conversion; this wrapper adds the wave
    // anchor subtraction every call site here needs, so the returned value is still exactly the
    // "milliseconds elapsed since this level's clock started" quantity every formula below already
    // expects — only normalized across tempo changes. Identical to the old expression for a level whose
    // tempo never changes.
    //
    // Reads ONLY refs (never render-scoped values), so the rAF loop's mount-time closure can call it
    // safely — the same rule `sideScrollX` below already follows for the same reason.
    const tempoAnchorRef = useRef(freshTempoAnchor());
    const tempoScrollMs = (rawSinceAnchorMs) => tempoNormalizedMs(
        tempoAnchorRef.current,
        rawSinceAnchorMs - waveStartRef.current * INTERVAL_MS,
        geomRef.current.beatMs,
    );

    // #990: the side-scroll graded-window candidate list — shared by the combatNote effect below
    // (which needs the full {sl, idx, delta} shape for grading/resolution bookkeeping) AND
    // `computeHittableNotes` below (which only needs the note names, for a synchronous external
    // read). One implementation, not two drifting copies (§6c). Reads only *Ref current values, so
    // it is safe to define once and never redefine per render — it always sees "now" when CALLED.
    const computeInWindowCandidates = () => {
        const { beatMs: bMs, beatsOnScreen: bos } = geomRef.current;
        const elapsedMs = tempoScrollMs(tickRef.current * INTERVAL_MS);   // #1102: tempo-normalized
        return slimesRef.current
            .map((sl, idx) => ({ sl, idx, delta: elapsedMs - (sl.beat + bos) * bMs }))
            .filter(({ idx, delta }) => !resolvedRef.current.has(idx) && Math.abs(delta) <= bMs * MUCH_TOO_BEATS);
    };
    // #990 (Han 2026-08-14): "which note(s) would currently count as a hit" — exposed via
    // hittableNotesRef for PianoView.jsx to read synchronously at note-PRESS time, before the note
    // even starts sounding (the combatNote effect below only judges reactively, after the fact).
    const computeHittableNotes = () => {
        if (!geomRef.current.sideScroll) {
            // Non-side-scroll: a single "next" target, the lowest-index not-yet-struck slime — mirrors
            // the else-branch target lookup in the combatNote effect below exactly.
            const k = slimesRef.current.findIndex((_, idx) => !resolvedStaticRef.current.has(idx));
            return k >= 0 ? [slimesRef.current[k].note] : [];
        }
        return computeInWindowCandidates().map(({ sl }) => sl.note);
    };
    if (hittableNotesRef) hittableNotesRef.current = computeHittableNotes;
    // #863 perf fix: `dist`/`slimeY`/`bassSlimeY`/`projectileCenterY`/`beatsPerMeasure` added so the main
    // rAF loop (bucket A — scroll transform + live entity positions) can read the latest per-render-computed
    // geometry without closing over stale render-scoped values (the loop's own effect has an intentionally
    // empty dependency array — one continuous loop, not restarted every render, exactly like `sideScrollX`'s
    // existing use of this same ref for the same reason).
    // Layout fix (Han 2026-08-18, "move the 'perfect timing' a bit to the right (maybe about 5%
    // screenwidth)"): shifts where slimes/notes actually STOP (and therefore where the hero anchors,
    // §261's `heroX = startX`) rightward, WITHOUT touching the raw `startX` PROP itself — SheetMusic.jsx
    // has ~27 OTHER consumers of that prop for completely unrelated static-layout positioning (clef, key
    // signature, etc.) that must stay exactly where they are. `effectiveStartX` is the ONE place this
    // shift is applied; every combat/flight formula in this file derives its stopping point from
    // `geomRef.current.startX`/`.dist` (either directly or via `sideScrollX`'s own `vr - sx` read), so
    // storing the shifted value there — not the raw prop — is sufficient to move noteX/slimeX/heroX/the
    // debug strike-zone bands all together, with nothing left inconsistent.
    const effectiveStartX = sideScroll ? startX + viewRight * 0.05 : startX;
    geomRef.current = {
        startX: effectiveStartX, viewRight, beatsOnScreen, sideScroll, gatedScroll, beatMs, frameMs, isWizard,
        dist: viewRight - effectiveStartX, slimeY, bassSlimeY, projectileCenterY, beatsPerMeasure,
        // #863 round 2: isMixed/spawnLeadBeats added so `computeWizardCast` (below) can run from the rAF
        // loop's mount-time-only closure without stale-closure-capturing these render-scoped values.
        isMixed, spawnLeadBeats,
        // #863 round 2: staff-position inputs `judgmentY`/`hitFrameMs` (below) need for the SAME reason.
        // `DEATH_FRAMES` — the dying-entity rAF-loop update (below) needs it too.
        bassStart, staffHeight, trebleStart, hitFrameMs: frameMs / 2, DEATH_FRAMES,
    };

    // frames elapsed since a start tick (integer sprite frame) and the ms elapsed. #863: reads `tickRef`
    // (always fresh) instead of the removed `tick` state — since this is now only called from render bodies
    // that run at the throttled `frameTick` cadence, reading the ref gives the MOST ACCURATE value available
    // at that lower render frequency (same formula/meaning as before, just a ref instead of a state var —
    // refs and the old `tick` state were kept in lockstep every frame anyway). #863 round 2: now a thin
    // wrapper over the shared `framesElapsed` (see its declaration) so the rAF loop can call the SAME
    // formula directly with a fresh `fMs`, without going through this closure's own (render-scoped) default.
    const framesSince = (startTick, fMs = frameMs) => framesElapsed(tickRef.current, startTick, fMs);
    // Bug fix (Han 2026-08-21, "de animatie 'mid attack' blijft hangen tijdens het wachten op de juiste
    // noot in rubato... ik dacht dat het level was vastgelopen"): `framesSince` above measures against
    // `tickRef.current` — the GATED clock, which holds perfectly still for as long as a gated level is
    // frozen waiting for the correct note. An attack/wiggle animation is a REACTION to an input attempt
    // (right OR wrong) — if it starts while gated and the gate stays frozen (a wrong attempt, or simply a
    // long wait), its own "has this animation cycle finished" check never advances either, so it visibly
    // hangs mid-pose for as long as the freeze lasts, reading exactly like a crashed level. Same bug
    // class §1052's second follow-up already fixed for idle/cosmetic animation (`rawFIdx`, driven off
    // `rawTRawMsRef` — the TRUE, never-frozen clock) — never applied to input-REACTION animations before,
    // since they're event-triggered rather than continuously cycling. `framesSinceRaw` is the same
    // formula against that same never-frozen clock, for exactly this class of animation: something that
    // must always finish playing regardless of whether gameplay itself is currently paused.
    const framesSinceRaw = (startRawMs, fMs = frameMs) => Math.floor((rawTRawMsRef.current - startRawMs) / fMs);

    // #660 side-scroll positions: a slime spawns at its own `beat` and travels to startX over `beatsOnScreen`
    // beats, then keeps going off the left edge if never struck. The NOTE moves LINEARLY (noteX); the SLIME
    // HOPS (slimeX) — pausing on walk frames 1,2,8 — via `movingProgress`. `x` (= slimeX) is what the hit-zone
    // and escape use (you strike the blob, not the glyph).
    // #688: the Wizard's projectile uses the SAME flight span as a slime (`beatsOnScreen`) again — only
    // its RENDER visibility is gated separately (see `spawnLeadBeats` above / the render call site below).
    // #1050 (Han 2026-08-17, "de framerate is niet perfect, het beeld is wat schokkerig... SUPERsmooth"):
    // `rawElapsedMs` is an OPTIONAL third parameter — the un-rounded milliseconds elapsed since the same
    // anchor `atTick` is measured from. When the caller has it (the rAF loop's own per-frame hot path,
    // below), it's used INSTEAD of reconstructing ms from `atTick * INTERVAL_MS`. `atTick` is a tick
    // rounded to the nearest INTERVAL_MS (8ms) — fine for anything that only needs to categorize a
    // discrete moment (hit-detection windows, spawn/visibility gating, initial paint), but real frames
    // arrive ~16.67ms apart, not a clean multiple of 8, so multiplying the ROUNDED tick back out for a
    // CONTINUOUS position made the modeled per-frame time delta unevenly alternate (mostly 16ms, then a
    // 24ms catch-up jump) — a constant, structural velocity jitter in otherwise-linear motion, independent
    // of any other work happening that frame. Discrete/event-driven callers are unaffected: they still
    // pass only `atTick` and get the exact same tick-quantized value as before.
    const sideScrollX = (beat, atTick, rawElapsedMs) => {
        const { startX: sx, viewRight: vr, beatsOnScreen: bos, beatMs: bMs, frameMs: fMs } = geomRef.current;
        // #1102: `tempoScrollMs` also subtracts the wave anchor (`waveStartRef`), so this is the SAME
        // quantity as before for a fixed-tempo level — only tempo-normalized across any change.
        const msSinceSpawn = tempoScrollMs(rawElapsedMs ?? (atTick * INTERVAL_MS)) - beat * bMs;
        const dist = vr - sx;
        const noteX = vr - (msSinceSpawn / (bos * bMs)) * dist;                 // linear
        const totalFrames = Math.round((bos * bMs) / fMs);                     // walk frames over the crossing
        const ff = msSinceSpawn / fMs;                                         // fractional frame since spawn
        const slimeX = vr - movingProgress(Math.max(0, ff)) * (dist / (movingFramesBefore(totalFrames) || 1));
        // #679: `msSinceSpawn`/`ff` exposed (not just the slime-specific walkFrame) so the Wizard/Projectile
        // branch below can derive its OWN frame logic (a continuous loop counter, not a hop cycle) from the
        // same spawn-timing source of truth, instead of duplicating this formula.
        return {
            x: slimeX, slimeX, noteX, msSinceSpawn, ff,
            walkFrame: msSinceSpawn >= 0 ? Math.floor(ff) % SLIME_WALK.frames : 0, spawned: msSinceSpawn >= 0,
        };
    };

    // #1052 (Han 2026-08-17, "gated scroll" — wait indicator): while a gated level is frozen, ALL
    // on-screen slimes switch to their idle/breathing animation instead of mid-walk (Han: "use the idle
    // animation for all slimes" — the idle-vs-walk state itself IS the "waiting for you" cue, no separate
    // glow needed). Idle cycling reads the RAW (never-frozen) clock so slimes visibly keep breathing even
    // though position and the walk cycle itself are frozen. Shared by the rAF loop's imperative pushes AND
    // the JSX mount-time freeze cache below (§6c) — one formula, not two that could drift.
    const slimeWalkOrIdleFrame = (p) => {
        if (gatedFrozenRef.current) {
            const idleFrame = Math.floor(rawTRawMsRef.current / (geomRef.current.frameMs || 1)) % SLIME_IDLE.frames;
            return { row: SLIME_IDLE.row, frame: idleFrame };
        }
        return { row: SLIME_WALK.row, frame: p.walkFrame };
    };

    // A requestAnimationFrame loop drives `tick` — the SAME rAF+AudioContext pattern useSheetMusicHighlight
    // already uses (Han: "in de main app staat al een robuuste audiocontext… zou niet zo veel nieuws moeten
    // gebeuren"). The setInterval version was "hakkelig" (setInterval isn't frame-aligned). `tick` still counts
    // INTERVAL_MS units so every formula below is unchanged, but it's `round(elapsedMs / INTERVAL_MS)` sampled
    // once per frame off `context.currentTime` (the audio clock the Sequencer schedules on) → smooth AND
    // locked to audio. Falls back to performance.now only when there's no AudioContext (tests).
    const clockStartRef = useRef(null);
    const ctxRef = useRef(context); ctxRef.current = context;
    const scrollStartRef = useRef(null); scrollStartRef.current = scrollStartTime != null ? scrollStartTime * 1000 : null;
    // #1096 follow-up (Han 2026-08-21, mid-level overlay pause — see `paused` prop's own comment above):
    // `pausedRef` mirrors the prop into the rAF closure (same convention as `ctxRef` just above — the
    // loop's own effect has an intentionally empty/stable dependency array, so it must read live values
    // through refs, never the bare prop). `externalPauseAccumMsRef` is the running total of real-world ms
    // spent paused so far this level; the loop below subtracts it from the raw elapsed time every frame,
    // which keeps growing at the same rate as real time WHILE paused — the two cancel out, so the
    // resulting elapsed time simply stops advancing for as long as `paused` stays true, then continues
    // from exactly where it left off the instant it goes false again. No separate "freeze point" / resume
    // math needed (unlike the gated-freeze mechanism below, which resumes on a discrete hit event instead
    // of continuously) — this accumulator approach is simpler because pause/resume are just the two edges
    // of one continuously-held boolean.
    const pausedRef = useRef(false); pausedRef.current = paused;
    const externalPauseAccumMsRef = useRef(0);
    const lastFrameNowMsRef = useRef(null);
    const debugLoggedUnfreezeRef = useRef(false);   // TEMP DEBUG (Han 2026-08-06) — log the FIRST unfrozen tick once
    // Reset the "reported once" latch whenever a NEW anchor arrives (a fresh level start or replay) —
    // without this, `debugLoggedUnfreezeRef`/the watchdog signal above would only ever fire for the
    // FIRST level played in the whole app session (this component stays mounted across level changes).
    //
    // Bug fix (#1052, Han 2026-08-17, "na tweede keer level starten gaat het helemaal bad... noten
    // komen nooit"): `clockStartRef` (the FREE-RUNNING fallback anchor, used only while waiting for
    // the real audio anchor — see the loop below) is lazily set ONCE (`== null ? nowMs : ...`) and was
    // NEVER reset anywhere. Since this component "stays mounted across level changes" (same reason
    // debugLoggedUnfreezeRef needs resetting), starting a SECOND level hits a real window where
    // `scrollStartRef.current` is null again (levelAudioStart resets to null on close, only becomes
    // real once the new level's instruments are confirmed ready) — during that window the loop fell
    // back to the STALE clockStartRef from the FIRST level (potentially minutes old), producing a
    // massive, wrong `t` for every timing formula in the file: spawn gating, hit-detection windows,
    // wave-start calculations. Exactly "notes never arrive" / hit-detection logging "EXTRA NOTE
    // (nothing due)" for every real note played. Reset alongside debugLoggedUnfreezeRef — same
    // trigger, same reasoning: a fresh anchor cycle must never inherit anything from the last one.
    //
    // Bug fix (#1159, Han 2026-08-25, "visuele scroll-positie loopt ~1.5 kwartnoot achter op de
    // metronoom... consistent over songs"): `externalPauseAccumMsRef`/`lastFrameNowMsRef` (declared just
    // above) had the EXACT SAME "component stays mounted across level changes" problem `clockStartRef`
    // was fixed for in #1052 — but were never added to this reset effect when #1096's follow-up
    // introduced them. `overlayEditMode` (SheetMusic.jsx's `paused` prop) includes `levelResultEditMode`,
    // true while the level-result screen shows after EVERY level — so `externalPauseAccumMsRef` picks up
    // a chunk of real wall-clock time on every level completion and NEVER gave it back, permanently
    // subtracting more and more from the visual clock (`rawTRawMs = trueRawTRawMs -
    // externalPauseAccumMsRef.current`) of every level played afterward in the same mounted session,
    // while the audio clock (Sequencer/AudioContext) never saw this local subtraction at all — a
    // growing, audio-invisible visual lag. A fresh anchor (new level/replay) must start this accumulator
    // at 0 exactly like `clockStartRef`, for the same reason.
    useEffect(() => {
        debugLoggedUnfreezeRef.current = false; clockStartRef.current = null;
        externalPauseAccumMsRef.current = 0; lastFrameNowMsRef.current = null;
    }, [scrollStartTime]);
    // Perf (#1162, Fase 8): migrated onto the shared `useFrameLoop` ticker (docs/architecture.md §329) —
    // 'critical' priority (must run every frame, drives the audio-locked scroll position). This loop
    // already read EVERY piece of per-tick state through refs (`geomRef`, `ctxRef`, `scrollStartRef`,
    // `pausedRef`, and the many others declared above) rather than plain closure variables — the exact
    // pattern `useFrameLoop` requires — so this migration needed no ref-conversion work (unlike the
    // RpgLevelPanel/useRpgLevelState migrations, which each had one `let`-based tick variable to move to a
    // ref first). The callback still independently reads `ctxRef.current.currentTime` for its own `nowMs`
    // — `useFrameLoop`'s own raw rAF timestamp argument is unused here on purpose, per this hook's own
    // design principle: subsystems locked to the AudioContext clock must keep reading that clock
    // themselves, never substitute the ticker's timestamp for it.
    useFrameLoop(() => {
        {
            // Bug fix (Han 2026-08-06, "slimes komen te laat, niet in sync met de metronoom... soms pas
            // na ~4 maten, niet eens matenaantal"): for a side-scroll level, `scrollStartTime` starts
            // null and only becomes real once the level's instruments are CONFIRMED ready (App.jsx §166's
            // audio-race fix deliberately delays picking `levelAudioStart` until then). Before this fix,
            // the branch below fell back to free-running (anchored to whichever frame this loop first
            // ran) for that ENTIRE waiting window, then the anchor SOURCE SWITCHED the instant
            // `scrollStartTime` arrived — a live jump mid-loop that threw every slime/note's computed
            // position off by exactly however long the wait happened to be (never a whole number of
            // measures — instrument load time is arbitrary — hence "niet eens matenaantal"). Fix: for a
            // side-scroll level, don't advance the clock AT ALL until the real audio anchor exists, so
            // there's no free-running phase to jump away from — `tick` simply stays frozen (no slimes
            // spawn; `trebleMelody` is null anyway until `levelMelodyReady`, see SheetMusic.jsx) during
            // the wait, then starts ticking correctly-anchored from its very first real tick.
            // Bug fix (Han 2026-08-10, round 6 — "het probleem is fundamenteel", confirmed via console
            // log: `waveStartTick` was already 1373 — ~11s of ticks — at the moment the real anchor
            // arrived): this effect has an EMPTY dependency array (`[]`, intentional — ONE continuous
            // rAF loop, not restarted every render), so `loop` is a closure created ONCE at mount. The
            // bare `sideScroll` PARAMETER used to be read directly here — a classic stale-closure bug:
            // it captured whatever `sideScroll` was on the render that MOUNTED this effect, which is
            // very likely `false` (this component mounts before any level is active). Every later
            // render passing `sideScroll={true}` never reached this closure — the freeze branch above
            // was permanently unreachable, so the clock free-ran continuously from mount instead of
            // waiting for `scrollStartTime`. This is also why "first unfrozen tick" never logged (its
            // `if (sideScroll && ...)` guard below was the same dead closure). Fixed by reading
            // `geomRef.current.sideScroll` instead — that ref is reassigned on EVERY render (see its
            // declaration above `sideScrollX`), so the loop always sees the CURRENT value.
            if (geomRef.current.sideScroll && scrollStartRef.current == null) {
                return;
            }
            const ctx = ctxRef.current;
            const nowMs = (ctx && typeof ctx.currentTime === 'number')
                ? ctx.currentTime * 1000
                : (typeof performance !== 'undefined' ? performance.now() : Date.now());
            // When the level provides an audio start time, anchor t=0 there (so the scroll locks to the
            // metronome/backing). Otherwise anchor to the first frame (free-running). tick may be negative
            // before scrollStartTime (during the pre-roll) — slimes just aren't spawned yet.
            const anchor = scrollStartRef.current != null ? scrollStartRef.current
                : (clockStartRef.current == null ? (clockStartRef.current = nowMs) : clockStartRef.current);
            // #1050: the RAW (un-rounded) elapsed ms since `anchor` — never itself frozen, always "real"
            // elapsed time. Kept in a ref so effects outside this loop (e.g. the combat-hit effect, to
            // measure how long a gated freeze lasted) can read "now" independent of gating below.
            const trueRawTRawMs = nowMs - anchor;
            rawTRawMsRef.current = trueRawTRawMs;
            // #1096 follow-up (Han 2026-08-21, mid-level overlay pause — see `paused` prop's own comment):
            // grows in lockstep with real time WHILE paused, so subtracting it below exactly cancels out
            // the real time that passes during a pause — everything from here on (`rawTRawMs`, gameplay
            // `tRawMs`/`tick`, gated-freeze arrival math, spawn/expiry windows, `gatedElapsedMsRef`) sees
            // gameplay simply stop advancing, then resume from precisely where it left off. Deliberately
            // NOT applied to `rawTRawMsRef` above — that ref stays the TRUE unfrozen clock other consumers
            // (idle/cosmetic animation, gated-freeze-duration measurement) already rely on unchanged.
            if (pausedRef.current && lastFrameNowMsRef.current != null) {
                externalPauseAccumMsRef.current += Math.max(0, nowMs - lastFrameNowMsRef.current);
            }
            lastFrameNowMsRef.current = nowMs;
            const rawTRawMs = trueRawTRawMs - externalPauseAccumMsRef.current;
            // #1052 (Han 2026-08-17, "gated scroll"): for a gated level, `tRawMs` (and everything derived
            // from it — position, hit windows, wave-elapsed, expiry) freezes the instant the earliest
            // still-unresolved slime reaches its own arrival instant, and resumes exactly where it froze
            // on a correct hit (`gatedPauseAccumMsRef`, updated in the combat-hit effect's kill branch).
            // Every other formula in this file keeps reading `tRawMs`/`tickRef.current` completely
            // unchanged — freezing this ONE shared value is sufficient (see this refs' own comment above).
            let tRawMs = rawTRawMs;
            const g0 = geomRef.current;
            // FR (Han 2026-08-21, catch-up for near-perfect hits): decay any in-flight ramp BEFORE it
            // feeds into `liveEffMs` below, so this frame already reflects the partially-recovered value
            // — see `catchupRampRef`'s own comment (declared above) for the full mechanism.
            if (catchupRampRef.current) {
                const ramp = catchupRampRef.current;
                // `trueRawTRawMs` (not the pause-adjusted local `rawTRawMs` below) — `ramp.startRawMs` was
                // itself captured from `rawTRawMsRef.current`, the SAME true/unadjusted clock, so this stays
                // internally consistent regardless of whether a mid-level overlay pause (`externalPauseAccumMsRef`)
                // happens to overlap the ramp's short window.
                const rampElapsed = trueRawTRawMs - ramp.startRawMs;
                if (rampElapsed >= CATCHUP_RAMP_MS) {
                    gatedPauseAccumMsRef.current = ramp.accumBefore - ramp.recoverMs;
                    catchupRampRef.current = null;
                } else {
                    const frac = rampElapsed / CATCHUP_RAMP_MS;
                    gatedPauseAccumMsRef.current = ramp.accumBefore - ramp.recoverMs * frac;
                }
            }
            if (g0.gatedScroll && g0.sideScroll && g0.beatMs > 0 && g0.beatsOnScreen > 0) {
                const liveEffMs = rawTRawMs - gatedPauseAccumMsRef.current;
                if (!gatedFrozenRef.current) {
                    // Mirrors the SAME arrival formula the hit-detection window/expiry effect already use
                    // (§6c) — "perfect timing" is delta===0, i.e. the note's full travel time has elapsed.
                    const waveElapsedMs = tempoScrollMs(liveEffMs);   // #1102: tempo-normalized
                    const nextIdx = slimesRef.current.findIndex((_, idx) => !resolvedRef.current.has(idx));
                    const nextSlime = nextIdx >= 0 ? slimesRef.current[nextIdx] : null;
                    if (nextSlime && waveElapsedMs >= (nextSlime.beat + g0.beatsOnScreen) * g0.beatMs) {
                        gatedFrozenRef.current = true;
                        gatedFreezeStartRawMsRef.current = rawTRawMs;
                    }
                }
                tRawMs = gatedFrozenRef.current ? (gatedFreezeStartRawMsRef.current - gatedPauseAccumMsRef.current) : liveEffMs;
            }
            // #1096: imperative ref write (never React state — this runs every rAF frame) so
            // useLevelGatedRubatoAudio.js can trigger cello/timpani off the SAME frozen-aware clock the
            // visual scroll already uses, instead of a fixed AudioContext-time schedule.
            if (gatedElapsedMsRef) gatedElapsedMsRef.current = tRawMs;
            const t = Math.round(tRawMs / INTERVAL_MS);
            // TEMP DEBUG (Han 2026-08-06, "nog steeds niet gelost"): logs the FIRST tick this loop
            // computes once unfrozen — compare `nowMs`/`anchor`/`t` here against App.jsx's "anchor
            // picked" log to see whether the anchor arrived here late, or whether it's correct here but
            // wrong downstream (rendering/positioning). Remove once diagnosed.
            if (geomRef.current.sideScroll && !debugLoggedUnfreezeRef.current) {
                debugLoggedUnfreezeRef.current = true;
                logger.debug('LevelTiming', 'SheetRpgLayer first unfrozen tick', { nowMs, anchor, t, startX, viewRight });
                // Bug fix (Han 2026-08-10, "1 frame de correcte positionering, waarna -1 en 0 plotseling
                // naar rechts springen"): `t` on this VERY FIRST unfrozen frame should be <= 0 — the
                // anchor is picked in the FUTURE (App.jsx's `context.currentTime + 1.0`), so real time
                // should not have reached it yet by the time this frame runs. A POSITIVE `t` here means
                // the render/effect chain took longer than the buffer, and this component just SNAPPED to
                // a "catch up" position instead of counting up smoothly from a negative pre-roll — the
                // exact jump Han reported. Concrete evidence if the 1.0s buffer (App.jsx ~line 1226) is
                // ever insufficient again, instead of another guess.
                if (t > 0) {
                    logger.error('LevelTiming', 'E027-VISUAL-CLOCK-CATCHUP-JUMP', new Error('first unfrozen tick was already past the anchor'), { nowMs, anchor, t });
                }
                onFirstTickUnfrozenRef.current?.();
            }
            tickRef.current = t;

            // #863 (Han 2026-08-10, perf fix) — BUCKET A: continuous position, pushed straight to the DOM
            // every rAF frame, bypassing React entirely (no setState here at all). This is the same
            // "opacity via element.style in the rAF callback, never via JSX props" principle CLAUDE.md §6
            // already mandates, extended to position/transform. `g` is this render's latest geometry
            // (frameMs/beatMs/dist/etc. — see the geomRef.current assignment above sideScrollX).
            const g = geomRef.current;
            // #863 round 2: `fIdx` (the ever-increasing sprite-frame counter) is needed by BOTH the
            // throttled-setState check at the bottom of this loop AND the Wizard idle-frame push below —
            // computed once here, reused by both (§6c).
            const fIdx = Math.floor((t * INTERVAL_MS) / g.frameMs);
            // #1052 second follow-up (Han 2026-08-18, "in rubato mode, all animations are stopped when
            // the note is at 'perfect timing', including... idle animations of critters and character...
            // NO!! We talked about this!!!!"): `frameTick`/`gFrame` (= `rawFIdx`, pushed to React state
            // just below) drives EVERY still-declarative idle animation in the render body — hero, NPC,
            // decorative Wizard, static-mode critters (`gFrame` — see its own declaration further down).
            // It used to derive from `fIdx` (the FROZEN clock `t`), so once gated-frozen, `fIdx` stopped
            // changing and `setFrameTick` simply never fired again — freezing hero/NPC/idle animation
            // right along with gameplay position, exactly the regression Han is calling out (§259 already
            // got this right for SLIMES specifically, via `slimeWalkOrIdleFrame`'s own raw-clock read, but
            // never touched the shared `frameTick` value everything else relies on). `rawFIdx` reads
            // `rawTRawMsRef` (never frozen, see its own declaration) instead — idle-type animation now
            // keeps running through a freeze, matching the same principle: gameplay POSITION freezes,
            // everything cosmetic/idle does not. Wizard's own CAST-SYNC timing is a deliberate exception —
            // it still reads the frozen `t` via `computeWizardCast(t)` below, since a cast must stay tied
            // to the actual (possibly-paused) game clock, not idle-cycle independently of it.
            const rawFIdx = Math.floor(rawTRawMsRef.current / g.frameMs);
            // Bug fix (Han 2026-08-10, #863 production crash — "het level werkt uberhaupt niet in build"):
            // before this refactor, all this per-entity math ran inside React's OWN render, so a thrown
            // error there was (at worst) a React render-time crash, once. Now it runs in a raw rAF
            // callback OUTSIDE React — an uncaught throw here doesn't just skip one bad paint, it escapes
            // the `loop` function entirely, so `requestAnimationFrame(loop)` at the bottom never runs
            // again and the ENTIRE scroll/combat animation freezes forever for the rest of the level. Same
            // failure mode CLAUDE.md's error-code table already documents a fix for (E023-FOLIAGE-DRAW-
            // FRAME, "caught so the render loop always reschedules its next frame instead of permanently
            // dying") — applied here for the identical reason. The actual crash (`critterDraw` indexing a
            // sprite sheet with a negative frame — see its own fix above) is now also fixed at the source;
            // this try/catch is the second, structural layer of defence so a FUTURE edge case in this
            // large imperative surface can't silently brick combat for an entire level again.
            // #1050 third follow-up: computed ONCE per frame, before the try block, so BOTH the
            // sideScroll entity section below AND the dying/judgment/hit/spawnGlow section after it
            // (which run un-nested from each other but must agree on the SAME throttle decision for
            // one consistent frame) read the identical value. The scroll-transform push itself is NOT
            // gated by this — seebelow.
            const runRpgEntityUpdates = nowMs - lastRpgEntityUpdateMsRef.current >= RPG_ENTITY_THROTTLE_MS;
            if (runRpgEntityUpdates) lastRpgEntityUpdateMsRef.current = nowMs;
            try {
            if (g.sideScroll && g.dist > 0 && g.beatMs > 0) {
                // Scroll transform — mirrors the render body's own scrollPx/scrollPPT formula exactly
                // (§6c: same arithmetic, just evaluated here every frame instead of once per React render).
                // #1050: tRawMs (not `t * INTERVAL_MS`) — see sideScrollX's own comment on why the
                // rounded tick must not be reconstructed into a continuous-motion millisecond value.
                // #1050 third follow-up: this push is DELIBERATELY never gated by `runRpgEntityUpdates` —
                // note-scroll smoothness must never depend on how much RPG-entity work happens to be
                // pending this frame (see this section's own top-of-file comment).
                // #1102: tempo-normalized (see `tempoScrollMs`) so a mid-level tempo change alters the
                // forward scroll RATE without ever moving the already-scrolled position.
                const scrollElapsedMs = tempoScrollMs(tRawMs);
                const framePx = (scrollElapsedMs / (g.beatsOnScreen * g.beatMs)) * g.dist;
                const barlineTransform = `translate(${-framePx}, 0)`;
                const noteTransform = `translate(${NOTE_STAFF_DX - framePx}, 0)`;
                if (barlineScrollRef.current) barlineScrollRef.current.setAttribute('transform', barlineTransform);
                if (noteScrollRef.current) noteScrollRef.current.setAttribute('transform', noteTransform);
                if (restScrollRef.current) restScrollRef.current.setAttribute('transform', noteTransform);
                if (realScrollRef.current) realScrollRef.current.setAttribute('transform', noteTransform);
                if (bassScrollRef.current) bassScrollRef.current.setAttribute('transform', noteTransform);
                if (percussionScrollRef.current) percussionScrollRef.current.setAttribute('transform', noteTransform);

                if (runRpgEntityUpdates) {
                // Live slimes/projectiles (treble). Only entities CURRENTLY MOUNTED (i.e. present in the
                // ref map — React's own render-body culling decided that at the last frameTick-cadence
                // render) get updated; a stale/about-to-unmount entry is skipped, not force-updated (see
                // point 7's "IMPORTANT" note in the ticket — an entity that walked off-screen simply stops
                // getting fresh positions for up to one frameTick interval, an acceptable ~100-300ms lag
                // for something already leaving the screen).
                const nowMsForOsc = tRawMs;   // #1050: raw, not `t * INTERVAL_MS` — see sideScrollX's comment
                slimeRefsMap.current.forEach((entry, key) => {
                    const sl = slimesRef.current[entry.idx];
                    if (!sl || sl.key !== key) return;   // stale entry from a just-replaced wave
                    const p = sideScrollX(sl.beat, t, tRawMs);
                    if (entry.kind === 'projectile') {
                        const oscX = oscillate(sl.key, nowMsForOsc, PROJECTILE_OSCILLATE_RANGE);
                        const oscY = oscillate(sl.key + 1000, nowMsForOsc, PROJECTILE_OSCILLATE_RANGE);
                        entry.el.setPosition(p.noteX + oscX, g.projectileCenterY + oscY);
                        entry.el.setFrame(Math.floor(p.ff * PROJECTILE_ANIM_SPEED) % PROJECTILE_LOOP_FRAMES);
                    } else {
                        // point 8: add the (frameTick-cadence-refreshed) wiggle shake for the ONE slime
                        // currently wiggling, exactly as the old declarative `wdx` addition did.
                        const wig = wiggleRef.current;
                        const wdx = wig && wig.index === entry.idx ? wig.wdx : 0;
                        entry.el.setPosition(p.slimeX + wdx, g.slimeY);
                        const wf = slimeWalkOrIdleFrame(p);
                        entry.el.setFrame(wf.row, wf.frame);
                    }
                });
                // Live bass-slimes (Level 15 twoHanded) — same pattern, no wizard/wiggle branch (§862).
                bassSlimeRefsMap.current.forEach((entry, key) => {
                    const sl = bassSlimesRef.current[entry.idx];
                    if (!sl || sl.key !== key) return;
                    const p = sideScrollX(sl.beat, t, tRawMs);
                    entry.el.setPosition(p.slimeX, g.bassSlimeY);
                    const bwf = slimeWalkOrIdleFrame(p);
                    entry.el.setFrame(bwf.row, bwf.frame);
                });
                // Live critters (under rests) — position+frame update together (critterDraw ties them via
                // the flying-anim oscillation, see the Critter component above).
                critterRefsMap.current.forEach((entry, key) => {
                    const c = crittersRef.current[entry.idx];
                    if (!c || c.key !== key) return;
                    const p = sideScrollX(c.beat, t, tRawMs);
                    // #1052 second follow-up: while gated-frozen, force the critter's IDLE animation and
                    // drive its frame from the raw (never-frozen) clock instead of `p.ff` (which is
                    // derived from the frozen `tRawMs` and would otherwise freeze mid-move-cycle) — same
                    // "gameplay position freezes, idle animation doesn't" principle as `slimeWalkOrIdleFrame`.
                    // #1097 (Han 2026-08-22): dropped the `/4` — critter idle now cycles at the SAME cadence
                    // as slime/hero idle instead of an artificially slower one (see `critterDraw`'s own
                    // comment for the compensating `tMs` multiplier that keeps flying-critter wobble speed
                    // unchanged despite `frame` now advancing 4x faster).
                    const gF = gatedFrozenRef.current
                        ? Math.floor(rawTRawMsRef.current / (g.frameMs || 1)) % 1000
                        : Math.floor(p.ff) % 1000;
                    entry.el.update(p.noteX - (c.variant.crop.w * CRITTER_SCALE) / 2, g.slimeY, gF, gatedFrozenRef.current);
                });
                // Level 11 switch-flourish (StaticProjectile2) — fixed SWITCH_LOOKAHEAD array, plain index.
                SWITCH_LOOKAHEAD.forEach((k, i) => {
                    const el = switchRefsArr.current[i];
                    if (!el) return;
                    const switchBeat = k * 2 * g.beatsPerMeasure;
                    const p = sideScrollX(switchBeat, t, tRawMs);
                    el.setCenter(p.noteX, g.projectileCenterY);
                    el.setFrame(Math.floor(p.ff) % STATIC_PROJECTILE2_LOOP_FRAMES);
                });
                }   // runRpgEntityUpdates
            }

            // #863 round 2 (Han 2026-08-10 follow-up: INP still "needs improvement" after round 1) — the
            // SAME imperative-push technique extended to what round 1 left on the throttled `frameTick`
            // React path: dying slime/projectile death frames + the ghost-note fly-up tween, judgment
            // float-up position/opacity, hit-burst frame/opacity, spawn-glow radius/opacity, and the
            // Wizard's idle/cast-sync frame. These are short-lived/few-at-a-time (why round 1 deferred
            // them), but multiple can be simultaneously mid-animation (dyingList/judgments/hits all
            // already documented as lists for exactly this overlap reason), and the cast-sync scan in
            // particular is timing-sensitive enough (Han: "de flits moet exact op de noot landen") that
            // throttling it to frameTick cadence left it up to one sprite-frame coarser than the audio
            // it syncs to. All formulas below are the EXACT SAME ones the render body/effects already use
            // (`framesElapsed`, `PROJECTILE_DEATH_OPACITY`, `judgmentY`, `HIT_BURST_OPACITY`,
            // `spawnGlowDraw` via the SpawnGlow component's own `update()`, `computeWizardCast`) — no
            // reimplementation, only WHERE they're evaluated changes (§6c).
            // #1050 third follow-up: this WHOLE section (dying/ghost/judgment/hit/spawnGlow) is gated on
            // `runRpgEntityUpdates` — EXCEPT the Wizard cast-sync scan below, which stays per-frame on
            // purpose (see this loop's own top comment on why that one specific case is exempt).
            if (runRpgEntityUpdates) {
            dyingRefsMap.current.forEach((entry) => {
                const deathFrame = Math.min(framesElapsed(t, entry.startTick, g.frameMs), g.DEATH_FRAMES - 1);
                if (entry.kind === 'projectile') {
                    entry.el.setFrame(deathFrame);
                    entry.el.setOpacity(PROJECTILE_DEATH_OPACITY[deathFrame] ?? 0.2);
                } else {
                    entry.el.setFrame(SLIME_DEATH.row, deathFrame);
                }
            });
            ghostNoteRefsMap.current.forEach((entry) => {
                const prog = Math.min(1, framesElapsed(t, entry.startTick, g.frameMs) / g.DEATH_FRAMES);
                const up = prog * 46;
                entry.el.setAttribute('transform', `translate(0, ${-up})`);
                entry.el.setAttribute('opacity', 1 - prog);
            });
            bassDyingRefsMap.current.forEach((entry) => {
                const deathFrame = Math.min(framesElapsed(t, entry.startTick, g.frameMs), g.DEATH_FRAMES - 1);
                entry.el.setFrame(SLIME_DEATH.row, deathFrame);
            });
            judgmentRefsMap.current.forEach((entry) => {
                // #925 follow-up: a stub entry (charEls-only, no `el` yet) can theoretically exist for one
                // commit if a <tspan>'s ref callback fires before its parent <text>'s — see liveCharRef's
                // own comment. Guards against that instant rather than assuming a fixed fire order.
                if (!entry.el) return;
                const prog = Math.min(1, ((t - entry.startTick) * INTERVAL_MS) / JUDGMENT_MS);
                entry.el.setAttribute('y', judgmentY(g, entry.lane, prog));
                entry.el.setAttribute('opacity', 1 - prog);
                // #925 follow-up (Han 2026-08-16, "letters van tekst moeten een heel klein beetje
                // oscilleren (individueel), range 2 game pixels"): each character's own <tspan> gets a
                // SEPARATE, independent wobble via a `transform` (not `dy` — `dy` is cumulative across
                // sibling tspans in SVG text layout and would drift subsequent letters instead of nudging
                // each one independently). Same oscillate() every projectile/flying-creature wobble
                // already uses (§6c), seeded by the character's own index within THIS label so neighboring
                // letters don't move in lockstep, and this label's own judgment id so different labels
                // don't sync up either.
                entry.charEls?.forEach((el, i) => {
                    if (!el) return;
                    const dy = oscillate(entry.id * 31 + i, t, JUDGMENT_LETTER_OSCILLATE_RANGE, JUDGMENT_LETTER_OSCILLATE_SPEED);
                    el.setAttribute('transform', `translate(0, ${dy})`);
                });
            });
            hitRefsMap.current.forEach((entry) => {
                const f = Math.min(framesElapsed(t, entry.startTick, g.hitFrameMs), HIT_FRAMES - 1);
                entry.el.setFrame(entry.frames[f]);
                entry.el.setOpacity(HIT_BURST_OPACITY[f]);
            });
            spawnGlowRefsMap.current.forEach((entry) => {
                entry.el.update(framesElapsed(t, entry.startTick, g.frameMs));
            });
            }   // runRpgEntityUpdates
            // Wizard: idle loop uses `rawFIdx` (never-frozen — see its own declaration, keeps idle-cycling
            // through a gated freeze); a combat Wizard additionally re-scans for a cast sequence every
            // frame so the flash lands exactly on the audio cue (see `computeWizardCast`'s own comment) —
            // that scan deliberately keeps reading the frozen `t`, not `rawFIdx`.
            if (wizardRef.current || decorativeWizardRef.current) {
                const idleLenL = WIZARD_IDLE_CELLS.length;
                const idleFrame = ((rawFIdx % idleLenL) + idleLenL) % idleLenL;   // non-negative modulo (§679 bugfix)
                if (wizardRef.current) {
                    const cast = computeWizardCast(t);
                    wizardRef.current.setCells(cast.frame >= 0 ? cast.cells : WIZARD_IDLE_CELLS, cast.frame >= 0 ? cast.frame : idleFrame);
                }
                if (decorativeWizardRef.current) decorativeWizardRef.current.setCells(WIZARD_IDLE_CELLS, idleFrame);
            }
            } catch (err) {
                // See the try's own comment above: this catch is what keeps ONE bad frame (a malformed
                // sprite-sheet lookup, a stale ref, anything unforeseen in this large imperative surface)
                // from permanently freezing the whole level's animation — log it once per occurrence and
                // keep going, exactly like E023-FOLIAGE-DRAW-FRAME does for the WebGL foliage layer.
                logger.error('RpgCombat', 'E028-SHEETRPG-IMPERATIVE-FRAME', err, { t });
            }

            // #863 BUCKET B (round 1): throttle React re-renders instead of firing every rAF tick.
            // #1050 second follow-up: no longer gated on "the sprite frame changed" (frameMs boundary,
            // tempo-dependent) — every continuously-animated thing is imperative now (see this ref's own
            // comment above), so frameTick only needs to fire often enough for mount/unmount and a few
            // one-off declarative paths, which tolerate a fixed, coarse wall-clock cadence regardless of
            // BPM. Still dedupes on `rawFIdx` so an UNCHANGED sprite frame after the throttle window never
            // triggers a redundant identical re-render.
            // #1052 second follow-up: pushes `rawFIdx` (never-frozen), not `fIdx` (the gated clock) — see
            // `rawFIdx`'s own declaration for why: `frameTick` drives hero/NPC/decorative-Wizard idle
            // animation in the render body, which must keep cycling through a gated freeze.
            if (rawFIdx !== lastFrameIndexRef.current && nowMs - lastFrameTickWallMsRef.current >= FRAMETICK_THROTTLE_MS) {
                lastFrameIndexRef.current = rawFIdx;
                lastFrameTickWallMsRef.current = nowMs;
                setFrameTick(rawFIdx);
            }
        }
    }, [], { priority: 'critical' });

    // reset combat when a fresh wave actually starts; the side-scroll clock restarts.
    useEffect(() => {
        // Bug fix (Han 2026-08-20, "na level 7 blijf ik heel veel MISSED NOTES krijgen, na voltooiing"):
        // `levelWaveIndex` also increments ONE LAST TIME when the FINAL wave clears (`useLevel.js`'s
        // `onWaveCleared` always returns `next`, even on the clear that ends the level) — but there is no
        // new wave's content to reset INTO at that point, the level is simply ending. Treating it like any
        // other wave-start wiped `resolvedRef`/`killedSet` for slimes that were ALREADY correctly hit
        // earlier in the level; every one of them then looked freshly "unresolved" with a long-past due
        // time, so the miss-detection loop (below) marked them ALL as MISSED in a burst right as the level
        // finished — reproducible on ANY level (gated or not), not just multi-wave ones, since even a
        // single-wave level's `wave` goes 0→1 exactly once, at completion. Skip the reset entirely when
        // this fire is that terminal, content-less increment.
        if (levelTotalWaves > 0 && levelWaveIndex >= levelTotalWaves) return;
        // Bug fix (Han 2026-08-21, "na voltooiing 80x MISSED" + "2-/4 enemies vanquished" — Level 3):
        // the SAME root cause as the `waveStartRef` fix above, applied to the REST of this reset block.
        // For a GATED level (`gatedScroll`), treble content grows continuously via JIT streaming with
        // ABSOLUTE offsets (never replaced per wave — `wave` there is purely a combat/spawn-gating
        // counter, confirmed via interview to apply uniformly to every gated level, Wizard/Mixed
        // included, not just plain-Slime ones). Wiping `resolvedRef`/`killedSet`/etc. on every
        // non-terminal wave transition made EVERY slime the player already correctly hit earlier in the
        // song look "unresolved" again the instant a later wave began — the very next judging tick found
        // them all long-overdue and marked them ALL missed in one burst (while the ORIGINAL correct hit
        // had already counted as a defeat, producing inflated/inconsistent totals like "2-/4").
        //
        // Regression fix (Han 2026-08-21, follow-up: "na passeren van end of song measure line stopt het
        // level nooit"): the FIRST attempt at this fix skipped the reset block ENTIRELY for a continuing
        // gated wave, including `clearedRef.current = false`. `clearedRef` is a completely different kind
        // of state than `resolvedRef`/`killedSet` — it isn't "has this slime been dealt with" (which
        // genuinely must persist across the whole song), it's "has THIS killedCount-reaches-total crossing
        // ALREADY been reported" (the `onSlimesCleared` → `useLevel.js`'s `onWaveCleared` → `setWave` →
        // eventually `pendingSongEndRef`/`onSongEnd` chain). Leaving it permanently `true` after wave 1's
        // very first clear meant `onSlimesCleared` could NEVER fire again for any later wave — `wave` got
        // stuck forever, `pendingSongEndRef` never got set, and the level could never reach `done`, however
        // far the visual scroll travelled. `killedCount`/`total` (`slimeData.length`) are BOTH already
        // whole-song-cumulative for a JIT-continuous level (never wave-scoped, unlike the old
        // regenerate-per-wave model) — so leaving `killedCount` un-reset alongside `resolvedRef`/`killedSet`
        // and ONLY re-arming `clearedRef` is what correctly lets `onSlimesCleared` fire again the next time
        // cumulative kills catch up to cumulative content, without ever un-resolving an already-handled
        // slime. `killedSet` (like `resolvedRef`) directly gates rendering (`killedSet.has(idx)` hides a
        // struck slime, see its own declaration comment) — resetting it would make already-dead slimes
        // reappear on screen, so it stays un-reset here for exactly the same reason `resolvedRef` does.
        if (gatedScroll && levelWaveIndex > 0) {
            clearedRef.current = false;
        } else {
            setKilledCount(0); setDyingList([]); setKilledSet(new Set()); setJudgments([]); setHits([]); clearedRef.current = false;
            setKilledCritters(new Set());
            setBassDyingList([]); setBassKilledSet(new Set());   // #862 — same fresh-wave reset, bass's own state
            resolvedRef.current = new Set(); wrongAttemptRef.current = new Set(); resolvedStaticRef.current = new Set();
            setSpawnGlows([]); spawnGlowFiredRef.current = new Set();
            // #1050 second follow-up: a fresh wave means every entity key starts over (even if a key STRING
            // happens to be reused) — clear every frozen-props cache so nothing inherits a stale position/
            // frame from the wave that just ended (see `freezeOnce`'s own comment for why these exist).
            frozenSlimePropsRef.current.clear(); frozenBassSlimePropsRef.current.clear();
            frozenCritterPropsRef.current.clear(); frozenSwitchPropsRef.current.clear();
            // #1052: a fresh wave starts fully unfrozen with a clean pause history — the gated freeze/resume
            // bookkeeping must never carry over from the wave that just ended.
            //
            // Bug fix (Han 2026-08-21): kept INSIDE this else-branch — for a continuing gated wave (the
            // branch above), `gatedFrozenRef`/`gatedPauseAccumMsRef` must NOT reset (see this fix's own
            // top-level comment: it could un-freeze an active gate or snap the shared clock mid-song).
            gatedFrozenRef.current = false; gatedPauseAccumMsRef.current = 0;
        }
        // With an audio anchor (scrollStartTime), t=0 IS the scheduled start, so the FIRST anchored wave's
        // clock is 0 regardless of WHEN the melody generated (a few frames later). Free-running mode
        // restarts from the current tick.
        // #688 (Level 9 rework): back to ONE continuous melody/single wave (like every other side-scroll
        // level, §679) — the §686 multi-wave due-time-snapping logic no longer applies (it only existed to
        // compensate for wave content not existing until its own due time; there's only one wave now).
        //
        // Bug fix (Han 2026-08-10, round 6): this effect used to depend on the melody's own note content
        // ONLY (see the eslint-disable below, previously deliberate). If that settled a few ms BEFORE
        // `scrollStartTime` flipped from null to its real value (exactly what the console log showed: this
        // effect fired with `scrollStartTime: null` two ms before "anchor picked"), `waveStartRef.current`
        // got locked to `tickRef.current` — a garbage, possibly large tick value (since the sibling
        // stale-closure bug above meant `tick` had been free-running for seconds) — and this effect never
        // fired again for the SAME melody, so it was never corrected back to 0 once the real anchor
        // arrived. `scrollStartTime` is now in the dependency array so this effect re-runs the instant the
        // real anchor arrives (even without a wave change), always correcting `waveStartRef` to 0 for an
        // anchored wave. Re-running the combat-state resets above (killed count etc.) on that transition is
        // harmless — no real combat could have happened during the pre-anchor free-run.
        //
        // #867 rework round 3/4 (Han 2026-08-20): this effect used to depend on `notesKey` (a hash of the
        // melody's own notes) as its "did a new wave start" signal — correct back when a wave meant "the
        // WHOLE melody was thrown away and replaced" (#688's own "there's only one wave now" assumption).
        // Once treble content instead grows CONTINUOUSLY via JIT one-block-ahead streaming (§263 rework
        // rounds 2-3: Level 9/10, and now any gated procedural level), `notesKey` changes on EVERY
        // background block append — nothing to do with an actual combat wave transition — so this effect
        // was firing (and wiping killedSet/dyingList/judgments/frozen-props/gatedFrozenRef) every time new
        // content silently arrived, not just when a wave was genuinely cleared. Han: "na maat 2 te
        // voltooien begint het level te verspringen" — exactly this. Fixed to depend on `levelWaveIndex`
        // (App.jsx's `level.wave`, the COMBAT-driven counter that only changes on a real `onWaveCleared`)
        // instead — decoupled from how often the underlying melody happens to grow in the background.
        //
        // #1096 follow-up (Han 2026-08-20, "geen well done scherm... lijkt op hoe het level eruit zag
        // voordat je de maten correct aan elkaar hebt geplakt"): round 3/4's OWN fix above — advancing
        // `waveStartRef.current` to `tickRef.current` on every later wave — was itself WRONG once round 3
        // made melody offsets/`slimeData[i].beat` ABSOLUTE (continuously growing from the level's true
        // start, never wave-local any more). `sideScrollX()` and the gate-freeze/song-end detection below
        // compute `elapsed − waveStartRef.current·INTERVAL_MS − beat·beatMs`: with an ABSOLUTE `beat`,
        // that formula is only correct when `waveStartRef` represents the level's TRUE absolute start
        // (0), exactly like it always did pre-#867 — advancing it per wave re-introduces a wave-relative
        // baseline the rest of the arithmetic no longer expects, silently corrupting the cumulative
        // "how far has the final barline travelled" calculation (`onSongEnd` below) enough that it never
        // fires, while per-frame slime positions drift too little to notice by eye. `waveStartRef` was
        // only ever WRONG-BY-DESIGN back when each wave's melody restarted its OWN offsets at 0 (pre-round-
        // 3) — that assumption is gone, so the "advance per wave" behaviour must go with it. Only the
        // FIRST-anchored-wave correction (the actual round-6 race fix) still applies; every LATER wave
        // reset now leaves `waveStartRef` untouched, i.e. permanently 0 for the whole level's duration.
        const isFirstAnchoredWave = scrollStartTime != null && prevScrollStartTimeRef.current == null;
        if (scrollStartTime == null) {
            waveStartRef.current = tickRef.current;   // free-running (pre-anchor) mode — unchanged
        } else if (isFirstAnchoredWave) {
            waveStartRef.current = 0;                 // the level's one true absolute start
        }
        // else: already anchored, a later wave — leave `waveStartRef` exactly as it is (0).
        prevScrollStartTimeRef.current = scrollStartTime;
        // #1050 follow-up: freeze the JSX-side scroll transform's starting value HERE — the only place
        // `waveStartRef` changes — instead of letting the render body recompute it from the live tick on
        // every re-render (see `frozenScrollPxRef`'s own declaration for why that stomps the rAF loop's
        // smooth motion). A fresh wave always starts at this position; the rAF loop takes over completely
        // from the very next frame.
        {
            // #1102: a level (re)start is the one place the tempo anchor must genuinely RESET rather than
            // re-anchor — `waveStartRef` itself just moved, so "beats elapsed so far" is zero again. A
            // LATER wave of an already-anchored level must NOT reset it: `waveStartRef` deliberately stays
            // at the level's true absolute 0 there (see this effect's own #1096 comment), and any tempo
            // change that already happened must keep its accrued beats.
            if (scrollStartTime == null || isFirstAnchoredWave) {
                tempoAnchorRef.current = freshTempoAnchor();
            }
            const g = geomRef.current;
            const scrollElapsedMs = tempoScrollMs(tickRef.current * INTERVAL_MS);
            frozenScrollPxRef.current = g.sideScroll && g.beatMs > 0 ? (scrollElapsedMs / (g.beatsOnScreen * g.beatMs)) * g.dist : 0;
        }
        // TEMP DEBUG (Han 2026-08-10, #824 follow-up round 3, "notes arrive very late"): logs the exact
        // inputs to the flight-time formula the instant the wave (re)starts, so the expected arrival
        // delay (beat=0's own `beatsOnScreen * beatMs`) can be checked directly against what's actually
        // observed in-game, instead of re-deriving it from separate scattered logs. Remove once diagnosed.
        logger.debug('LevelTiming', 'SheetRpgLayer wave (re)start', {
            scrollStartTime, waveStartTick: waveStartRef.current, tickAtReset: tickRef.current,
            firstSlimeBeat: slimeData[0]?.beat, beatsOnScreen, bpm,
            expectedFirstArrivalMs: slimeData[0] != null ? (slimeData[0].beat + beatsOnScreen) * (60000 / bpm) : null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [levelWaveIndex, levelTotalWaves, scrollStartTime]);

    // a played note (any input) — key ONLY on the nonce so it fires once per note; read live state via refs.
    useEffect(() => {
        if (!combatNote) return;
        const fMs = geomRef.current.frameMs;
        // ANY note → hero attacks once, but not more often than one attack cycle (the 2-frame delay).
        // Bug fix (Han 2026-08-21, "mid attack blijft hangen... in rubato"): `startRawMs`/`rawTRawMsRef`
        // (never frozen) instead of `startTick`/`tickRef` (the gated clock) — see `framesSinceRaw`'s own
        // comment for the full rationale.
        if (!heroAttackRef.current || (rawTRawMsRef.current - heroAttackRef.current.startRawMs) >= ATTACK_CYCLE * fMs) {
            setHeroAttack({ startRawMs: rawTRawMsRef.current });
        }
        if (geomRef.current.sideScroll) {
            // Level 2/3 graded hit window (Han 2026-08-02): a note for beat b is due at the strike line at
            // elapsed = (b + beatsOnScreen)·beatMs; the full window is ±1/2 beat (= ±1/8 note) around it,
            // graded by gradeHit (perfect ≤1/32 note, too fast/slow ≤1/16, much too fast/slow ≤1/8). We scan
            // ALL unresolved slimes whose window contains "now" — NOT just the next pointer — because (a) a
            // missed note must not block striking the next incoming one, and (b) after a wrong-pitch attempt
            // the player can still correct within the same window. Earliest matching slime wins (Han's
            // edge-edge case: multiple correct candidates → the earliest).
            // #688 (Level 9 rework): back to the SAME tight beat-window every other side-scroll level uses
            // — the §686 measure-wide window existed only to compensate for the Wizard's own (now-reverted)
            // shorter flight span; with `beatsOnScreen` shared again, arrival timing already matches slimes.
            const { beatMs: bMs, beatsOnScreen: bos } = geomRef.current;
            const elapsedMs = tempoScrollMs(tickRef.current * INTERVAL_MS);   // #1102: tempo-normalized
            const addJudgment = (category) =>
                setJudgments((l) => [...l, { id: judgmentIdRef.current++, category, startTick: tickRef.current }]);
            const inWindow = computeInWindowCandidates(); // #990: shared with hittableNotesRef (§6c)
            const target = inWindow.find(({ sl }) => notesMatch(combatNote.note, sl.note));   // lowest idx = earliest beat
            if (target) {
                // a wrong first attempt on this slime downgrades the kill to 'on second attempt' (½ point,
                // Han interview) regardless of the correction's own timing tier for the CORRECTNESS
                // verdict — but the correction still landed at some point in time, and Han 2026-08-10
                // ("wrong,corrected + too early... moet bovenop de too early staan") wants that timing
                // info kept for the timing-accuracy chart, stacked on top of the matching timing-tier
                // bar. `timingTier` carries gradeHit's OWN category (computed regardless, cheap) so
                // useLevel.js's onHit can bump a `${tier}Corrected` stat alongside the unchanged
                // `secondAttemptCorrected` correctness bump — two facts about the same hit, not a
                // replacement for either.
                // #1052 (Han 2026-08-17, "gated scroll" — grading with no time pressure): a correct hit
                // always grades "Perfect" while gated — this level teaches note recognition, not rhythm
                // (Han interview). Reuses gradeHit's own `{category:'perfect', points:1}` shape verbatim
                // rather than inventing a parallel one (§6c). The wrongAttempt → 'secondAttemptCorrected'
                // demotion stays — it's orthogonal to timing: getting it wrong once still costs the
                // correctness bump even with unlimited time to retry.
                const grade = wrongAttemptRef.current.has(target.idx)
                    ? { category: 'secondAttemptCorrected', points: 0.5, timingTier: geomRef.current.gatedScroll ? 'perfect' : gradeHit(target.delta, bMs).category }
                    : (geomRef.current.gatedScroll ? { category: 'perfect', points: 1 } : gradeHit(target.delta, bMs));
                resolvedRef.current.add(target.idx);
                // #1052: a correct hit while gated-frozen unfreezes the scroll clock, resuming EXACTLY
                // where it froze — the real time just spent frozen is folded into `gatedPauseAccumMsRef`
                // (see its own comment) so the very next rAF frame sees no jump.
                if (geomRef.current.gatedScroll && gatedFrozenRef.current) {
                    const latenessMs = rawTRawMsRef.current - gatedFreezeStartRawMsRef.current;
                    gatedPauseAccumMsRef.current += latenessMs;
                    gatedFrozenRef.current = false;
                    // FR (Han 2026-08-21, catch-up for near-perfect hits — see `catchupRampRef`'s own
                    // comment above for the full rationale): a sixteenth note or less of real lateness
                    // gets smoothly clawed back out of the accumulator over the next `CATCHUP_RAMP_MS`,
                    // instead of permanently carrying it forward. A longer, genuinely noticeable wait is
                    // left exactly as before (full, permanent absorption — this level teaches note
                    // recognition with no time pressure, per §1052's own interview; only truly negligible
                    // lateness is invisible-mended). Any PRIOR ramp still in flight is simply replaced —
                    // one hit's catch-up superseding another's is fine, both are sub-perceptible amounts.
                    if (latenessMs > 0 && latenessMs < bMs / 4) {
                        catchupRampRef.current = {
                            startRawMs: rawTRawMsRef.current,
                            recoverMs: latenessMs,
                            accumBefore: gatedPauseAccumMsRef.current,
                        };
                    }
                }
                const { x } = sideScrollX(target.sl.beat, tickRef.current);
                setDyingList((l) => [...l, { index: target.idx, startTick: tickRef.current, x }]);
                setKilledCount((c) => c + 1);
                addJudgment(grade.category);
                // #825 (Han 2026-08-10, "'hit' animatie start wanneer een noot de hit area gepasseerd
                // is"): a note is only ever resolved here the instant it's struck at the strike line, so
                // this successful-kill branch IS "a note passing the hit area" — a burst of 7 random
                // consecutive frames (wrapping) from HIT_BURST_TOTAL_FRAMES, played once, plus a random
                // "hit on wood" one-shot sfx.
                {
                    const hitStart = Math.floor(Math.random() * HIT_BURST_TOTAL_FRAMES);
                    const frames = Array.from({ length: HIT_FRAMES }, (_, i) => (hitStart + i) % HIT_BURST_TOTAL_FRAMES);
                    setHits((l) => [...l, { id: hitIdRef.current++, startTick: tickRef.current, x: x + SLIME_VIEW_W / 2, y: slimeY, frames }]);
                    // #992 — rpgFxVolumeMultiplier on top of the tuned constant (relative-to-default,
                    // see its own comment above).
                    playOneShotSfx(context, HIT_ON_WOOD_FILES, HIT_SFX_VOLUME * rpgFxVolumeMultiplier);
                }
                // per-event audit trail (Han 2026-08-02 "22 missers — vind uit hoe dat kan"): every combat
                // resolution logs note + delta so a stats mismatch is diagnosable from the console.
                logger.debug('RpgCombat', 'KILL', { note: combatNote.note, slime: target.idx, beat: target.sl.beat, deltaMs: Math.round(target.delta), grade: grade.category });
                onHitRef.current?.({ ...grade, hand: 'treble' });
            } else if (inWindow.length > 0) {
                // Han 2026-08-02 (well-done breakdown): a wrong pitch while a slime WAS hittable is flagged
                // but NOT yet counted as a final stat — its fate (corrected later, or the slime expires
                // still wrong) is only known at RESOLUTION time (see the kill branch above and the expiry
                // effect below), so the stat bump is deferred there. This is what makes "wrong notes within
                // time" and "wrong notes that were corrected" mutually exclusive, distinct categories
                // instead of double-counting every corrected note as both a miss AND a kill.
                wrongAttemptRef.current.add(inWindow[0].idx);
                addJudgment('wrongNote');
                const nearest = inWindow[0];
                logger.debug('RpgCombat', 'WRONG NOTE (pending — corrected or expired later)', {
                    played: combatNote.note, candidatesInWindow: inWindow.length,
                    nearestSlime: { idx: nearest.idx, note: nearest.sl.note, deltaMs: Math.round(nearest.delta) },
                });
                // Bug fix (Han 2026-08-21): `startRawMs` (never-frozen clock) — same fix/rationale as
                // `heroAttack`'s own trigger above, `framesSinceRaw`'s comment has the full explanation.
                setWiggle({ index: nearest.idx, startRawMs: rawTRawMsRef.current });
            } else {
                // #693 round 8 (Han: "als personage een critter slaat kost dat -1/2 punt, die gaat dood"):
                // a note played during silence — BEFORE falling through to the generic "extra note"
                // penalty, check whether a critter's own rest is currently open (same beat-window math as
                // slimesRef.current above, just against crittersRef). If so, this accidental note struck
                // the critter instead — a DISTINCT, lower-severity outcome from generic extraNote.
                const critterInWindow = crittersRef.current
                    .map((cr, idx) => ({ cr, idx, delta: elapsedMs - (cr.beat + bos) * bMs }))
                    .find(({ idx, delta }) => !killedCrittersRef.current.has(idx) && Math.abs(delta) <= bMs * MUCH_TOO_BEATS);
                if (critterInWindow) {
                    setKilledCritters((s) => new Set(s).add(critterInWindow.idx));
                    addJudgment('critterKilled');
                    logger.debug('RpgCombat', 'CRITTER HIT', { played: combatNote.note, critter: critterInWindow.idx });
                    onCritterKilledRef.current?.();
                } else {
                    // Han 2026-08-02: nothing was due AT ALL (no slime in any open window) — a note played
                    // during silence. Distinct from "missed" (a due note never played) and "wrong within time"
                    // (a due note played with the wrong pitch) — its own category, counted immediately (it
                    // isn't tied to any slime's lifecycle, so there is nothing to defer).
                    addJudgment('extraNote');
                    logger.debug('RpgCombat', 'EXTRA NOTE (nothing due)', { played: combatNote.note });
                    onMissRef.current?.('extraNote', 'treble');
                }
            }
        } else {
            // #663: target the lowest-index slime not yet STRUCK (resolvedStaticRef), not `killedRef` —
            // that only advances once a death animation finishes, which is what let a fast second note
            // get dropped while the previous kill was still animating. A wrong note does NOT resolve the
            // target (Han: unchanged — you keep retrying the same slime until you hit it).
            const k = slimesRef.current.findIndex((_, idx) => !resolvedStaticRef.current.has(idx));
            const s = k >= 0 ? slimesRef.current[k] : null;
            if (!s) return;
            if (notesMatch(combatNote.note, s.note)) {
                resolvedStaticRef.current.add(k);
                setDyingList((l) => [...l, { index: k, startTick: tickRef.current, x: s.x }]);
                onHitRef.current?.({ category: null, points: 1, hand: 'treble' });
            } else {
                onMissRef.current?.(undefined, 'treble');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combatNote?.nonce]);

    // #862 (Han 2026-08-10) — resolves the bass-slime matching a useTwoHandedBass hit/miss EVENT.
    // Grading (was it a hit, was it a miss) is NOT re-derived here — useTwoHandedBass already decided
    // that; this only finds the matching visual entry (by `measureIndex`) and plays its animation/
    // judgment/hero-attack, mirroring the combatNote effect above but far simpler (no timing-window scan
    // — useTwoHandedBass's own per-measure grading already resolved WHICH note and WHETHER it was hit).
    useEffect(() => {
        if (!bassCombatEvent) return;
        const idx = bassSlimesRef.current.findIndex((s) => s.measureIndex === bassCombatEvent.measureIndex);
        if (idx < 0) return;
        const bassJudgment = (category) =>
            setJudgments((l) => [...l, { id: judgmentIdRef.current++, category, startTick: tickRef.current, lane: 'bass' }]);
        if (bassCombatEvent.type === 'hit') {
            // ANY note (treble or bass) makes the hero attack — same shared cooldown as combatNote above.
            // Bug fix (Han 2026-08-21): `startRawMs`/never-frozen clock — same fix as the combatNote
            // effect's own trigger above (`framesSinceRaw`'s comment has the full rationale).
            if (!heroAttackRef.current || (rawTRawMsRef.current - heroAttackRef.current.startRawMs) >= ATTACK_CYCLE * geomRef.current.frameMs) {
                setHeroAttack({ startRawMs: rawTRawMsRef.current });
            }
            const s = bassSlimesRef.current[idx];
            const { x } = sideScrollX(s.beat, tickRef.current);
            setBassDyingList((l) => [...l, { index: idx, startTick: tickRef.current, x }]);
            bassJudgment('perfect');
            const hitStart = Math.floor(Math.random() * HIT_BURST_TOTAL_FRAMES);
            const frames = Array.from({ length: HIT_FRAMES }, (_, i) => (hitStart + i) % HIT_BURST_TOTAL_FRAMES);
            setHits((l) => [...l, { id: hitIdRef.current++, startTick: tickRef.current, x: x + SLIME_VIEW_W / 2, y: bassSlimeY, frames }]);
            // #992 — same rpgFxVolumeMultiplier as the treble hit above.
            playOneShotSfx(context, HIT_ON_WOOD_FILES, HIT_SFX_VOLUME * rpgFxVolumeMultiplier);
            logger.debug('RpgCombat', 'BASS KILL', { note: bassCombatEvent.note, bassSlime: idx, measureIndex: bassCombatEvent.measureIndex });
        } else if (bassCombatEvent.type === 'miss') {
            // No death animation / killedSet entry — like a missed treble note, it just keeps flying and
            // scrolls off-screen naturally; only the feedback label is shown.
            bassJudgment('missed');
            playOneShotSfx(context, DAMAGED_FILES, MISS_SFX_VOLUME * rpgFxVolumeMultiplier);
            logger.debug('RpgCombat', 'BASS EXPIRED (missed)', { bassSlime: idx, measureIndex: bassCombatEvent.measureIndex });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bassCombatEvent?.nonce]);

    // complete the one-shot animations each SPRITE FRAME (#863: was every raw tick — see the frameTick
    // comment near its declaration; a sprite frame's worth of headroom, hundreds of ms, is more than
    // enough to still catch every threshold crossing here). Side-scroll: a struck slime that finishes its
    // death is hidden (killedSet); a slime that reaches the hero UN-struck is NOT killed (Han) — it just
    // keeps walking off the left edge — but it counts as a miss and lets the next slime become the target.
    useEffect(() => {
        const finished = dyingList.filter((d) => framesSince(d.startTick) >= DEATH_FRAMES);
        if (finished.length) {
            if (geomRef.current.sideScroll) setKilledSet((set) => { const n = new Set(set); finished.forEach((d) => n.add(d.index)); return n; });
            else setKilledCount((k) => Math.max(k, ...finished.map((d) => d.index + 1)));
            setDyingList((l) => l.filter((d) => framesSince(d.startTick) < DEATH_FRAMES));
        }
        if (heroAttack && framesSinceRaw(heroAttack.startRawMs) >= ATTACK_CYCLE) setHeroAttack(null);
        if (wiggle && framesSinceRaw(wiggle.startRawMs) >= WIGGLE_FRAMES) setWiggle(null);
        // #863: `tick` state is gone — `tickRef.current` is the freshest available value at this
        // (now-throttled) render, same reasoning as `framesSince` above.
        if (judgments.length && judgments.some((j) => (tickRef.current - j.startTick) * INTERVAL_MS > JUDGMENT_MS)) {
            setJudgments((l) => l.filter((j) => (tickRef.current - j.startTick) * INTERVAL_MS <= JUDGMENT_MS));
        }
        // #825 hit bursts play at DOUBLE the shared frame rate (frameMs / 2), so they use their own
        // framesSince call with a halved fMs rather than the shared frameMs every other sprite uses.
        if (hits.length && hits.some((h) => framesSince(h.startTick, frameMs / 2) >= HIT_FRAMES)) {
            setHits((l) => l.filter((h) => framesSince(h.startTick, frameMs / 2) < HIT_FRAMES));
        }
        // #862 — bass-slime death completion, exact mirror of dyingList→killedSet above (own index space).
        const bassFinished = bassDyingList.filter((d) => framesSince(d.startTick) >= DEATH_FRAMES);
        if (bassFinished.length) {
            setBassKilledSet((set) => { const n = new Set(set); bassFinished.forEach((d) => n.add(d.index)); return n; });
            setBassDyingList((l) => l.filter((d) => framesSince(d.startTick) < DEATH_FRAMES));
        }
        // #686 Level 9 — fire the one-shot spawn-glow the instant each projectile becomes visible. Triggers
        // 1 sprite FRAME before the projectile's own visibility gate so the flourish's grow+fade-in (first
        // half of SPAWN_GLOW_FRAMES) completes exactly as the projectile appears (Han: "maximum opacity als
        // projectiel er is").
        if (isWizard || isMixed) {
            const visibleSinceMs = (beatsOnScreen - spawnLeadBeats) * beatMs;
            const glowTriggerMs = visibleSinceMs - frameMs;
            slimesRef.current.forEach((sl) => {
                if (isMixed && blockTypeAt(Math.floor(sl.beat / beatsPerMeasure)) !== 'Wizard') return;
                if (spawnGlowFiredRef.current.has(sl.key)) return;
                const p = sideScrollX(sl.beat, tickRef.current);
                if (p.spawned && p.msSinceSpawn >= glowTriggerMs) {
                    spawnGlowFiredRef.current.add(sl.key);
                    setSpawnGlows((l) => [...l, { key: sl.key, startTick: tickRef.current, x: p.noteX, y: projectileCenterY }]);
                }
            });
            if (spawnGlows.some((g) => framesSince(g.startTick) >= SPAWN_GLOW_FRAMES)) {
                setSpawnGlows((l) => l.filter((g) => framesSince(g.startTick) < SPAWN_GLOW_FRAMES));
            }
        }
        if (geomRef.current.sideScroll) {
            // Resolve an un-struck slime as a miss when its LATE window has fully passed (target + 1/2 beat)
            // — TIME-based, not "x < startX": the blob's left edge passes the hero BEFORE the late window
            // closes, and resolving there would rob the player of the 'much too slow' tier. The blob itself
            // just keeps walking off the left edge (Han: never killed, only missed).
            // #688: back to the same window the hit-matching effect above uses (kept in exact sync so a
            // note can't expire on a different schedule than the one it was gradeable under).
            const { beatMs: bMs, beatsOnScreen: bos } = geomRef.current;
            const elapsedMs = tempoScrollMs(tickRef.current * INTERVAL_MS);   // #1102: tempo-normalized
            slimesRef.current.forEach((sl, idx) => {
                if (resolvedRef.current.has(idx)) return;
                if (elapsedMs > (sl.beat + bos) * bMs + bMs * MUCH_TOO_BEATS) {
                    resolvedRef.current.add(idx);
                    setKilledCount((c) => c + 1);
                    // Han 2026-08-02 (well-done breakdown): the slime's FINAL verdict is only known now —
                    // 'missed' (never attempted at all) vs 'wrongUncorrected' (a wrong-pitch attempt was
                    // made on it earlier — see the wrongAttemptRef branch above — but never fixed in time).
                    const reason = wrongAttemptRef.current.has(idx) ? 'wrongUncorrected' : 'missed';
                    logger.debug('RpgCombat', `EXPIRED (${reason})`, { slime: idx, note: sl.note, beat: sl.beat });
                    // visible feedback for a silent expiry — without a label these misses were invisible and
                    // the splash count looked inexplicable (Han: "22 MISSERS???").
                    // #825 (Han 2026-08-10, "melding: never fixed mag 'onzichtbaar' worden"): the
                    // 'wrongUncorrected' ("never fixed") floating label is suppressed on purpose — the stat
                    // still counts it (onMissRef below, unconditional) so the splash's "wrong within time"
                    // segment is unaffected, only the in-the-moment popup is silenced.
                    if (reason !== 'wrongUncorrected') {
                        setJudgments((l) => [...l, { id: judgmentIdRef.current++, category: reason, startTick: tickRef.current }]);
                        // #991 — damagedN.wav one-shot on an actual 'missed' verdict only (not
                        // 'wrongUncorrected'), same "same moment as the existing missed judgment" gate as
                        // the label above (Han interview: no separate 1/8-note threshold check).
                        // #992 — same rpgFxVolumeMultiplier as the other 3 playOneShotSfx call sites.
                        playOneShotSfx(context, DAMAGED_FILES, MISS_SFX_VOLUME * rpgFxVolumeMultiplier);
                    }
                    onMissRef.current?.(reason, 'treble');
                }
            });
        }
        // #863: was `[tick]` — now `[frameTick]`, the throttled sprite-frame cadence. Every `tick` read
        // inside this body was changed to `tickRef.current` above (always fresh regardless of render
        // cadence), so this effect still catches every threshold crossing, just less often (§ comment
        // at the top of this effect).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameTick]);

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
    // Layout fix (Han 2026-08-18, "move the character to startX, so that the key and accidentals are
    // left of the hero"): was a fixed `-2` (far left, overlapping the clef/key-signature area) —
    // `startX` is the same "perfect timing"/strike-zone anchor slimes and notes travel toward (see
    // `sideScrollX`'s own `vr - dist` math, `strikeX = startX + SLIME_VIEW_W/2` in the debug zone
    // bands), so anchoring the hero there puts him exactly where the action happens, with the
    // clef/key signature (drawn separately, always at the far left) now clearly to his left instead of
    // underneath him.
    // Layout fix (Han 2026-08-18, "switch the position of the 'perfect hit' red line and the hero",
    // then correcting the result: "the hero ended up further to the right, instead of to the left...
    // it's supposed to be left of the line"): the strike line/hit-zone (below, and every other consumer
    // of "the strike position" — debug zone bands, `onSongEnd` detection, judgment-label float-up X) is
    // back at its own mechanically-meaningful position (`+ SLIME_VIEW_W/2` — the exact point a slime's
    // CENTER sits at on arrival, unchanged from before the swap attempt). The hero anchors by his
    // sprite's RIGHT edge instead of his left (`strikeLineX - dollW`), so his WHOLE visual body — not
    // just its left edge — sits at or left of the line regardless of how the sprite's own art is
    // weighted within its bounding box (this is what the earlier small `HERO_NUDGE_LEFT_PX` missed: a
    // left-edge anchor can still LOOK right-of-the-line if the character is drawn toward the right side
    // of a wide box).
    const strikeLineX = effectiveStartX + SLIME_VIEW_W / 2;
    const heroX = strikeLineX - dollW;
    const heroY = viewBottom - HERO_H;
    // #863: `gFrame` IS `frameTick` — both are `floor(elapsedMs / frameMs)`, computed once in the rAF loop
    // (see the `fIdx` comment there) and mirrored into this render-scoped name for readability at call
    // sites below (§6c: one source of truth, not a second inline recomputation of the same formula).
    const gFrame = frameTick;   // ever-increasing sprite frame counter (cyclic use)
    // #863 point 8 — refresh the wiggling slime's shake offset once per (throttled) render, for the bucket-A
    // rAF loop to read (see `wiggleRef` declaration + the loop's `slimeRefsMap.current.forEach` above).
    // Recomputed via the SAME `framesSince`/sine formula the old declarative `wdx` used inline (§6c) — kept
    // narrow on purpose (wiggle is short-lived/rare, not worth its own imperative ref plumbing, per the
    // ticket's point 8 rationale).
    if (wiggle) {
        const wf = framesSinceRaw(wiggle.startRawMs);
        wiggleRef.current = { index: wiggle.index, wdx: wf >= 0 && wf < WIGGLE_FRAMES ? Math.sin(wf * 3.2) * 4 * (1 - wf / WIGGLE_FRAMES) : 0 };
    } else {
        wiggleRef.current = null;
    }
    // hero: during the first 3 frames of an attack show the LAST 3 attack frames (3,4,5); else idle loop.
    let heroAnim = idleAnim, heroFrame = gFrame % idleAnim.frames;
    if (heroAttack) {
        const e = framesSinceRaw(heroAttack.startRawMs);
        if (e < ATTACK_SHEET_FRAMES) { heroAnim = ATTACK; heroFrame = ATTACK_SHEET_START + e; }
    }
    // the doll only needs to re-render when its FRAME changes (every frameMs), not every fast tick.
    const heroEl = useMemo(() => (
        <CharacterDoll char={hero} anim={heroAnim} frame={heroFrame} height={HERO_H} />
    ), [hero, heroAnim, heroFrame]);

    // #693 (Han 2026-08-04, Level 9 UAT round 2, "gebruik alleen de attack animatie wanneer een noot gemaakt
    // wordt... f30 is het moment waarop de flits moet gebeuren. Start de animatie dus 5 frames voor de
    // noot"): the wizard's attack swing is timed so its FLASH frame lands exactly on the note's audible cast
    // moment — the instant the projectile crosses the visibility gate (`spawnLeadBeats` boundary), the SAME
    // moment the wizard-cast audio plays (App.jsx's time-shifted `trebleMelody` schedule, §693). Derived from
    // each note's own `msSinceSpawn` (exposed by `sideScrollX`) minus the visibility-gate offset, so the
    // animation needs no extra state of its own — same "no extra state" pattern the old Cast2 trigger used.
    const wizardX = viewRight - WIZARD_VIEW_W + 2;
    const wizardY = viewBottom - WIZARD_H;
    // #871: resolve the `npc` bestiary name (if any) via the SAME manifest lookup every other creature in
    // this file uses (§6c — no separate hand-copied asset file). Scaled to the wizard's own tuned per-pixel
    // zoom (WIZARD_H / WIZARD_CROP.h) so a decorative NPC reads at the same visual weight as the wizard/hero
    // it stands in for, whatever its native sprite-sheet cell size happens to be.
    const npcVariant = useMemo(() => (npc ? findCreatureByName(npc) : null), [npc]);
    const NPC_SCALE = WIZARD_H / WIZARD_CROP.h;
    // frame-count for the non-negative-modulo wrap below — same idle/move fallback order critterDraw's
    // `preferIdle` path uses, so the wrap length always matches the animation actually drawn.
    const npcIdleLen = npcVariant ? ((findIdleAnim(npcVariant) || findMoveAnim(npcVariant))?.cells.length || 1) : 1;
    // #790 (Han 2026-08-09, SSOT): the song-timed attack cells/flash-indices used to be hardcoded in
    // enemyAssets.js — now read from the SAME "Wizard (Portrait)"/Black bestiary entry the generator writes
    // `song_attack_single/double/triple` onto (§6c), via the shared `findCreatureVariantByName`/`findAnim`
    // helpers (bestiaryAssets.js) every other creature lookup in this file already uses.
    const wizardBlackVariant = useMemo(() => findCreatureVariantByName('Wizard (Portrait)', 'Black'), []);
    const wizardSongAttack = useMemo(() => ({
        single: findAnim(wizardBlackVariant, 'song_attack_single'),
        double: findAnim(wizardBlackVariant, 'song_attack_double'),
        triple: findAnim(wizardBlackVariant, 'song_attack_triple'),
    }), [wizardBlackVariant]);
    // #863 round 2 perf fix: factored into a function (not inlined here) so BOTH this render body's initial
    // paint AND the rAF loop's per-frame update (below) run the EXACT SAME cast-sync scan (§6c) — reads
    // `slimesRef.current`/`geomRef.current` (kept fresh every render, see their declarations above) rather
    // than closing over `slimeData`/props directly, so it stays correct even when called from the rAF
    // loop's mount-time-only effect closure (same reasoning as `sideScrollX` already uses this ref pattern
    // for). Level 10 (Han 2026-08-06, "animaties schieten te kort... er moet een zwarte wizard staan"): the
    // cast-animation sync also runs for a Mixed level's static (black) wizard — but ONLY considers notes
    // whose OWN block is Wizard-type, so the wizard never winds up to cast on a Slime-block note.
    const computeWizardCast = (atTick) => {
        const g = geomRef.current;
        if (!((g.isWizard || g.isMixed) && g.sideScroll)) return { cells: WIZARD_IDLE_CELLS, frame: -1 };
        const visibleGateMs = (g.beatsOnScreen - g.spawnLeadBeats) * g.beatMs;
        const oneBeatLater = (a, b) => a && b && Math.abs(b.beat - a.beat - 1) < 0.01;
        const data = slimesRef.current;
        for (let i = 0; i < data.length; i++) {
            const s = data[i];
            if (g.isMixed && blockTypeAt(Math.floor(s.beat / g.beatsPerMeasure)) !== 'Wizard') continue;
            // Skip the 2nd/3rd note of a run already covered by an EARLIER note's triggered sequence
            // (checked below) — its own single-note check would otherwise also fire and restart the windup.
            if (oneBeatLater(data[i - 1], s)) continue;
            const next = data[i + 1], next2 = data[i + 2];
            // "single/double/triple" — Han's exact frame runs for 1, 2, or 3 consecutive quarter notes.
            const isTriple = oneBeatLater(s, next) && oneBeatLater(next, next2);
            const isDouble = !isTriple && oneBeatLater(s, next);
            const anim = isTriple ? wizardSongAttack.triple : isDouble ? wizardSongAttack.double : wizardSongAttack.single;
            const { cells, flashIndices } = anim;
            const msSinceVisible = sideScrollX(s.beat, atTick).msSinceSpawn - visibleGateMs;
            const frameInSeq = Math.floor(msSinceVisible / g.frameMs) + flashIndices[0];
            if (frameInSeq >= 0 && frameInSeq < cells.length) return { cells, frame: frameInSeq };
        }
        return { cells: WIZARD_IDLE_CELLS, frame: -1 };
    };
    const wizardCast = computeWizardCast(tickRef.current);
    const wizardCells = wizardCast.cells;
    // #679 bugfix: `gFrame` can be NEGATIVE during the pre-roll (tick is negative before scrollStartTime,
    // see the rAF loop comment above) — plain `%` in JS preserves the dividend's sign, so a negative gFrame
    // produced a negative array index into WIZARD_IDLE_CELLS (Slime avoids this because it uses frame/row as
    // a pixel OFFSET, not an array index — Wizard's cross-row-stitched cells format needs the array). Force
    // a non-negative result the same way `((n % m) + m) % m` always does.
    const idleLen = WIZARD_IDLE_CELLS.length;
    const wizardFrame = wizardCast.frame >= 0 ? wizardCast.frame : ((gFrame % idleLen) + idleLen) % idleLen;

    // #661 side-scroll scroll offset. The whole melody is laid out ONCE at the scroll spacing
    // (pixelsPerTick = dist / (beatsOnScreen · TICKS_PER_BEAT), origin = viewRight) and the group is
    // translated left by `scrollPx` every tick — a rigid, LINEAR glide (Han). At elapsed = beatsOnScreen
    // beats a note has travelled the full `dist` (viewRight → startX = the hero). This matches the LINEAR
    // `noteX` the slimes already use (see sideScrollX), so notes and their slimes stay in step.
    const dist = viewRight - effectiveStartX;
    const scrollPPT = sideScroll && dist > 0 ? dist / (beatsOnScreen * TICKS_PER_BEAT) : 0;
    // #863: `tick` state is gone — this is only the INITIAL/first-paint value (used as the JSX
    // `<g>` wrappers' initial `transform` attribute below); every subsequent frame the SAME formula is
    // re-evaluated imperatively in the rAF loop (see the `framePx` computation there) and pushed straight
    // to those `<g>` elements via `barlineScrollRef`/`noteScrollRef`/etc., bypassing React entirely.
    //
    // Bug fix (#1050 follow-up, Han 2026-08-17, "pretty clear and steady 1/12-th note stutter"): this
    // used to recompute from the LIVE `tickRef.current` right here, on every render — but this component
    // re-renders at `frameTick` (sprite-frame) cadence, FRAMES_PER_BEAT times per beat (tempo-locked,
    // hence "steady"). Each such render produced a FRESH `scrollPx`, which React dutifully wrote to the
    // `transform` attribute below — instantly overwriting whatever smooth position the rAF loop had
    // already reached via its own `setAttribute` calls. Same class of bug CLAUDE.md §6 already bans for
    // `opacity` ("React re-renders will overwrite inline style set by rAF"): JSX props and the rAF loop's
    // `setAttribute` both target the same DOM attribute, so JSX must never keep re-asserting a live value.
    // Now reads `frozenScrollPxRef` — written ONCE per wave by the `[levelWaveIndex, scrollStartTime]`
    // effect above (the only place `waveStartRef` changes), untouched by any later frameTick render. Its JSX
    // value therefore never changes after the wave starts, so React never touches this attribute again —
    // the rAF loop owns 100% of the ongoing motion, uninterrupted.
    const scrollPx = frozenScrollPxRef.current;
    // #661 (Han 2026-08-02): end-of-song final barline (thin + thick) at the end of the last measure. Lives in
    // the barline translate group (pure tick boundary, scrolls with the staff). endTick = numMeasures·mls.
    // Same value as `trebleFinalBarTick` above (kept as a separate 0-default variable here since this
    // one feeds arithmetic/JSX conditionals that expect 0, not Infinity, outside side-scroll).
    const finalBarTick = sideScroll && scrollBarlines ? trebleFinalBarTick : 0;
    const finalBarX = viewRight + finalBarTick * scrollPPT;
    const finalBarBottom = (scrollBarlines && scrollBarlines.bottomY != null) ? scrollBarlines.bottomY : viewBottom;

    // #688 (Han 2026-08-04, "end of level splash screen: niet bij laatste noot, maar pas wanneer end of
    // song (laatste maatstreep) de hit zone bereikt"): fires `onSongEnd` once the FINAL barline's rendered
    // X (finalBarX, translated by the same -scrollPx everything else in the scrolling group uses) reaches
    // the strike line — not when the last note/wave resolves, which can be measures earlier. `firedRef`
    // guards against re-firing every tick once past the line; reset on a wave change (#867 rework round 4:
    // was keyed on the melody's own note content, which now changes on every JIT background block append
    // for a continuously-generated level — `levelWaveIndex` is the correct "did combat actually advance"
    // signal instead; harmless either way since `onSongEnd` itself is gated on `pendingSongEndRef`, only
    // ever true for the level's true final wave).
    const songEndFiredRef = useRef(false);
    useEffect(() => { songEndFiredRef.current = false; }, [levelWaveIndex]);
    useEffect(() => {
        if (!sideScroll || finalBarTick <= 0 || songEndFiredRef.current) return;
        // Layout fix (Han 2026-08-18): must use the SAME `strikeLineX` as everything else in this file
        // (see its own declaration comment, "switch the position of the red line and the hero") — using
        // a stale/different position here would fire song-end at the WRONG spot while notes/slimes
        // visually stop somewhere else, a real desync between "the level thinks it's over" and "what's
        // on screen".
        const strikeX = strikeLineX;
        // #863: this effect now only runs at `frameTick` cadence, so the render body's own `scrollPx`
        // (computed once per render, from `tickRef.current` AT render time) is no longer guaranteed fresh
        // by the time this effect body runs — recompute it here inline from `tickRef.current`, using the
        // EXACT SAME formula as the render body's `scrollElapsedMs`/`scrollPx` above (§6c: same arithmetic,
        // just re-evaluated at the freshest possible moment instead of trusting a render-scoped closure).
        const freshScrollElapsedMs = tempoScrollMs(tickRef.current * INTERVAL_MS);   // #1102: tempo-normalized
        const freshScrollPx = beatMs > 0 ? (freshScrollElapsedMs / (beatsOnScreen * beatMs)) * dist : 0;
        if (finalBarX - freshScrollPx <= strikeX) { songEndFiredRef.current = true; onSongEnd?.(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameTick]);

    // #662 (Han 2026-08-03, "bij start van level zie ik onmiddellijk maat -1 en maat 0 in beeld"): a
    // lead-in pattern (timpani/fixed-cello, and the barlines' own synthetic "-1"/"0" entries) has its OWN
    // tick 0 at measure -1's start — a DIFFERENT zero-point than treble/Level-8-bass, whose tick 0 is
    // measure 1's start (the real content). Both kinds of content use the SAME `x = originX + tick·ppt`
    // formula, so giving lead-in content an origin `leadInTicks` earlier than `viewRight` makes its tick 0
    // land exactly `leadInTicks·ppt` (= `dist`, since beatsOnScreen already equals the lead-in span for
    // today's levels) to the LEFT of viewRight — i.e. already at/near the hero at level start (t=0), rather
    // than pinned to the screen's far edge like real content correctly is. Real content (treble, and
    // Level 8's real bass) keeps the plain `viewRight` origin — unchanged, Han confirmed its arrival timing
    // is already correct. This ALSO fixes a latent misalignment: the barlines marking real-content measure
    // boundaries used to sit `leadInTicks·ppt` to the right of their own measure's first note (ordinal
    // barlineCount includes the 2 synthetic entries; the note's own unshifted tick doesn't) — shifting the
    // barline origin by the same `leadInTicks` amount realigns them with their notes too, for any k.
    const leadInTicks = (scrollBarlines && scrollBarlines.leadInTicks) || 0;
    const leadInPx = leadInTicks * scrollPPT;
    const barlineStartX = viewRight - leadInPx;
    const bassStartX = (scrollNotationBass && scrollNotationBass.spansLeadIn) ? viewRight - leadInPx : viewRight;
    const percussionStartX = (scrollNotationPercussion && scrollNotationPercussion.spansLeadIn) ? viewRight - leadInPx : viewRight;

    // The staff CONTENT (heavy: beaming, accidentals, tuplets) is memoised so React.memo on
    // MelodyNotesLayer/BarlinesLayer skips it every fast tick — only the outer translate updates per tick
    // (cheap), exactly like heroEl above. Deps are the (referentially stable across ticks) prop bundles.
    // NOTES and BARLINES are SEPARATE memos so they can be translated independently: notes carry
    // NOTE_STAFF_DX (centre the head over its slime), while barlines sit at the PURE tick boundary — Han
    // (UAT): "maatstreep tussen 2 noten, niet pal voor een notehead". A downbeat note is at boundary+DX, so
    // a barline at boundary sits ~DX units left of it, in the gap between the previous note and the downbeat.
    // #693 (Han 2026-08-04, Level 9 UAT round 3 — "even measures should have no notes, just a whole rest.
    // the odd measures should have invisible quarter notes, and visible rests"): EVEN measures collapse to
    // ONE whole-rest in the CANONICAL `trebleMelody` itself (App.jsx's `restifyOddMeasures`, despite the
    // name now targeting even measures — one-shot/self-correcting at level start); ODD measures are left
    // completely untouched, keeping their own natural mix of real notes AND real rests exactly as generated.
    // That natural mix means the split below is no longer a pure "which measure" choice (round 2) — within
    // an ODD measure, individual REST slots must stay always-visible while individual NOTE slots stay
    // debug-only, so both layers now check the SLOT's own value, not just its measure's parity:
    //  - `noteStaffContentRest`: ODD-measure content as-is (already the collapsed whole-rest, ALWAYS forced
    //    — Han: "de ONEVEN maten hebben altijd een hele rust") PLUS any EVEN-measure slot that is ALREADY a
    //    natural rest — always opacity 1, a rhythm guide the player always sees. EVEN-measure real notes
    //    (the ones to actually play, Han: "de noten om te spelen staan in de EVEN maten") are hidden here,
    //    shown only in the debug layer below.
    //  - `noteStaffContentReal`: ONLY even-measure real NOTES (natural rests are already drawn by the layer
    //    above — showing them again here would double-draw) — wrapped in a debugMode-only opacity.
    //
    // FLAGGED AS PARTIALLY STALE (Han 2026-08-25, found while fixing the odd/even-parity bug below): this
    // paragraph's premise — App.jsx's `restifyOddMeasures` collapsing the call measure at generation time,
    // leaving the response as an untouched "natural mix" — describes the ORIGINAL one-shot Level 9 design.
    // #867's later rework moved the call/response rest-collapse into JIT generation itself
    // (`generateLevel9CallResponseBlock.js`'s `collapseToCallRests`, invoked per-block, no longer a
    // whole-melody post-process) — `restifyOddMeasures` is no longer what produces this data. The DUAL-LAYER
    // split described here (rest-guide always visible, real pitch debug-only) is still exactly what's
    // wanted per Han's 2026-08-25 confirmation (call-response is ear-training — pitches stay hidden in BOTH
    // halves outside debug mode), so this mechanism itself was kept, not removed — only its call/response
    // BOUNDARY determination (`isOddMeasure`, now `isCallMeasure` below) was wrong for `groupMeasures > 1`.
    // Bug fix (Han 2026-08-25 UAT, Level 11/letter e: "het gebeurt altijd, in de oneven maten... die
    // [even/oneven-check] werkt voor blokken van 1, maar nu zijn het blokken van 4"): raw (measureIndex+1)
    // % 2 parity assumes every SINGLE measure alternates call/response — true only when a call/response
    // group is exactly 1 measure. For a 2-measure group (letter e), the cycle is [call,call,response,
    // response] — measure index 2 (1-based "3", the FIRST response measure) is still ODD by raw parity,
    // so the old check misclassified it as "still the call" and let its real pitch pass straight through
    // into the ALWAYS-VISIBLE layer below instead of being suppressed like the rest of the response —
    // happening on EVERY cycle, exactly matching "het gebeurt altijd, in de oneven maten". Fixed by
    // reusing the SAME cycle math `computeCallResponseLabel` already uses for the #1155/#308 labeling
    // fix (§6c — one source of truth for "which half of its cycle is this measure in", not two): `pass`
    // is 1 for the call half, 2 for the response half, for ANY group size. `groupMeasures` falls back to
    // 1 (byte-identical to the old parity check) when the level doesn't set `callResponseMeasures`.
    // Renamed from `isOddMeasure` to `isCallMeasure` — the old name was already misleading before this
    // fix (a "response" measure IS "odd" for any group size but 1), the exact kind of stale-name trap
    // CLAUDE.md flags for `restifyOddMeasures`'s own history ("despite the name now targeting even
    // measures") — name it after what it actually answers instead of repeating that mistake.
    const isCallMeasure = (offset, measureLengthSlots) => computeCallResponseLabel({
        barlineOrdinal: Math.floor(offset / measureLengthSlots),
        groupMeasures: callResponseGroupMeasures ?? 1,
    }).pass === 1;
    // Bug fix (Han 2026-08-06, "level 10: de wizardnoten zijn zichtbaar, die moeten onzichtbaar zijn"):
    // for a Mixed level, only WIZARD-type-block notes get the Level-9 hide/reveal treatment below —
    // Slime-type-block notes (a normal, uncollapsed melody) must stay always visible, unchanged.
    const wizardMeasure = (offset, mls) => (isWizard || (isMixed && blockTypeAt(Math.floor(offset / mls)) === 'Wizard'));
    const noteStaffContentRest = useMemo(() => {
        if (!((isWizard || isMixed) && sideScroll && scrollNotationClipped && scrollNotationClipped.melody)) return null;
        const mls = scrollNotationClipped.measureLengthSlots || 48;
        const { notes, offsets } = scrollNotationClipped.melody;
        const melody = {
            ...scrollNotationClipped.melody,
            notes: notes.map((n, i) => {
                if (n === 'c' || offsets[i] == null) return n;
                if (!wizardMeasure(offsets[i], mls)) return n;  // Slime-block note (Mixed only): always visible
                if (isCallMeasure(offsets[i], mls)) return n;   // call half: already the forced whole-rest
                return n === 'r' ? n : 'c';                     // response half: keep natural rests, hide real notes
            }),
        };
        return (
            <MelodyNotesLayer
                {...scrollNotationClipped} melody={melody} staff="treble" staffYStart={trebleStart} startX={viewRight}
                noteWidth={noteWidth} allOffsets={allOffsets} pixelsPerTick={scrollPPT}
                inputTestState={null} previewMode={false} interactive={false} debugMode={debugMode}
                percussionVoiceSplit={false}
            />
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isWizard, isMixed, sideScroll, scrollNotationClipped, viewRight, noteWidth, allOffsets, scrollPPT, trebleStart, debugMode, callResponseGroupMeasures]);
    const noteStaffContentReal = useMemo(() => {
        if (!((isWizard || isMixed) && sideScroll && scrollNotationClipped && scrollNotationClipped.melody)) return null;
        const mls = scrollNotationClipped.measureLengthSlots || 48;
        const { notes, offsets } = scrollNotationClipped.melody;
        const melody = {
            ...scrollNotationClipped.melody,
            notes: notes.map((n, i) => {
                if (n === 'c' || offsets[i] == null) return n;
                if (!wizardMeasure(offsets[i], mls)) return 'c'; // Slime-block note: already shown in Rest layer
                if (isCallMeasure(offsets[i], mls)) return 'c';  // call half: nothing extra (rest already shown)
                return n === 'r' ? 'c' : n;                      // response half: reveal only the real notes
            }),
        };
        return (
            <MelodyNotesLayer
                {...scrollNotationClipped} melody={melody} staff="treble" staffYStart={trebleStart} startX={viewRight}
                noteWidth={noteWidth} allOffsets={allOffsets} pixelsPerTick={scrollPPT}
                inputTestState={null} previewMode={false} interactive={false} debugMode={debugMode}
                percussionVoiceSplit={false}
            />
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isWizard, isMixed, sideScroll, scrollNotationClipped, viewRight, noteWidth, allOffsets, scrollPPT, trebleStart, debugMode, callResponseGroupMeasures]);
    // non-Wizard/non-Mixed levels keep the original single unmodified layer.
    const noteStaffContent = useMemo(() => {
        if (isWizard || isMixed) return null;
        if (!(sideScroll && scrollNotationClipped && scrollNotationClipped.melody)) return null;
        return (
            <MelodyNotesLayer
                {...scrollNotationClipped} staff="treble" staffYStart={trebleStart} startX={viewRight}
                noteWidth={noteWidth} allOffsets={allOffsets} pixelsPerTick={scrollPPT}
                inputTestState={null} previewMode={false} interactive={false} debugMode={debugMode}
                percussionVoiceSplit={false}
            />
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isWizard, sideScroll, scrollNotationClipped, viewRight, noteWidth, allOffsets, scrollPPT, trebleStart, debugMode]);

    // #871 (Han 2026-08-11 UAT: "akkoorden en lyrics schuiven niet mee met de noten"): chord labels for
    // the scrolling treble staff, rendered inside the SAME translated group as noteStaffContent (below)
    // so they scroll in lockstep for free. ChordLabelsLayer already supports a pixelsPerTick mode (used
    // nowhere else in this file before now) — startX=viewRight/pixelsPerTick=scrollPPT mirrors exactly
    // how noteStaffContent positions MelodyNotesLayer above.
    const chordStaffContent = useMemo(() => {
        if (!(sideScroll && scrollChords)) return null;
        return (
            <ChordLabelsLayer
                {...scrollChords} chords={null}
                offsets={allOffsets} startX={viewRight} noteWidth={noteWidth} pixelsPerTick={scrollPPT}
                trebleStart={trebleStart} debugMode={debugMode} overrideColor={null} inputTestState={null}
            />
        );
    }, [sideScroll, scrollChords, allOffsets, viewRight, noteWidth, scrollPPT, trebleStart, debugMode]);

    // Song lyrics for the scrolling treble staff — LyricsLayer's 'text' variant, now pixelsPerTick-aware
    // (see LyricsLayer.jsx). Same y-offset as the static render (trebleStart + staffHeight + 39).
    const lyricsStaffContent = useMemo(() => {
        if (!(sideScroll && scrollLyrics)) return null;
        return (
            <LyricsLayer
                variant="text" {...scrollLyrics}
                lyricsY={trebleStart + staffHeight + 39}
                offsets={allOffsets} nw={noteWidth} startX={viewRight} pixelsPerTick={scrollPPT}
            />
        );
    }, [sideScroll, scrollLyrics, trebleStart, staffHeight, allOffsets, noteWidth, viewRight, scrollPPT]);

    // #661 (Han 2026-08-02): bass + percussion scroll the SAME way as treble (same scrollPPT/translate, so
    // a beat lines up vertically across all 3 staves) — visual only, no slimes/combat. Separate memos
    // (mirrors noteStaffContent above) so each staff's heavy beaming/accidental work is skipped independently
    // when its own bundle hasn't changed.
    const noteStaffContentBass = useMemo(() => {
        if (!(sideScroll && scrollNotationBassClipped && scrollNotationBassClipped.melody)) return null;
        return (
            <MelodyNotesLayer
                {...scrollNotationBassClipped}
                staff="bass"
                staffYStart={bassStart}
                startX={bassStartX}
                noteWidth={noteWidth}
                allOffsets={allOffsets}
                pixelsPerTick={scrollPPT}
                inputTestState={null}
                previewMode={false}
                interactive={false}
                debugMode={debugMode}
                percussionVoiceSplit={false}
            />
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sideScroll, scrollNotationBassClipped, bassStartX, noteWidth, allOffsets, scrollPPT, bassStart, debugMode]);

    const noteStaffContentPercussion = useMemo(() => {
        if (!(sideScroll && scrollNotationPercussionClipped && scrollNotationPercussionClipped.melody)) return null;
        return (
            <MelodyNotesLayer
                {...scrollNotationPercussionClipped}
                staffYStart={percussionStart}
                startX={percussionStartX}
                noteWidth={noteWidth}
                allOffsets={allOffsets}
                pixelsPerTick={scrollPPT}
                inputTestState={null}
                previewMode={false}
                interactive={false}
                debugMode={debugMode}
            />
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sideScroll, scrollNotationPercussionClipped, percussionStartX, noteWidth, allOffsets, scrollPPT, percussionStart, debugMode]);

    const barlineStaffContent = useMemo(() => {
        if (!(sideScroll && scrollBarlinesClipped)) return null;
        return (
            <BarlinesLayer
                mode="regular"
                {...scrollBarlinesClipped}
                noteWidth={noteWidth}
                startX={barlineStartX}
                pixelsPerTick={scrollPPT}
                isPlaying={false}
                showSettings={false}
                debugMode={debugMode}
                onMeasureNumberClick={undefined}
            />
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sideScroll, scrollBarlinesClipped, barlineStartX, noteWidth, scrollPPT, debugMode]);

    return (
        // #992 (Han: "RPG visibility" setter, 100 or 50%) — direct opacity on the whole layer's static,
        // per-render root group (not touched by the rAF loop itself, so this is safe per CLAUDE.md §6's
        // "never set opacity via JSX on ANIMATED elements" rule — same reasoning already applies to
        // debugMode's opacity on the inner realScrollRef group below).
        <g className="rpg-layer" data-rpg-layer="" style={{ pointerEvents: 'none', opacity: rpgVisibility / 100 }}>
            {/* #661 the REAL scrolling staff (notes/rests/colours/beams + barlines/measure numbers), laid out
                once and translated left every tick. Barlines sit at the pure tick boundary (between notes);
                notes carry NOTE_STAFF_DX to centre over their slimes. A soft mask fades both lane ends. */}
            {sideScroll && dist > 0 && viewRight > 0 && (
                <>
                    <defs>
                        {/* Notes fade OUT at the hero (Han UAT: "mask fade moet bij startx"): opaque up to
                            startX, then a soft LANE_FADE_L-wide fade to transparent just LEFT of it, so a note
                            softly disappears as it passes the hero. Fade IN over the last LANE_FADE_R units at
                            the right edge. */}
                        <linearGradient id="rpgLaneFadeGrad" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={viewRight} y2={0}>
                            <stop offset={0} stopColor="#000" />
                            {/* Layout fix (Han 2026-08-18): `effectiveStartX`, not the raw `startX` prop — the
                                fade must happen AT the shifted strike line, or a note would visibly fade out
                                before reaching the new red line (see `effectiveStartX`'s own comment). */}
                            <stop offset={Math.max(0, (effectiveStartX - LANE_FADE_L) / viewRight)} stopColor="#000" />
                            <stop offset={Math.max(0, Math.min(1, effectiveStartX / viewRight))} stopColor="#fff" />
                            <stop offset={Math.max(0, (viewRight - LANE_FADE_R) / viewRight)} stopColor="#fff" />
                            <stop offset={1} stopColor="#000" />
                        </linearGradient>
                        {/* mask: white = visible, black = transparent. Extends far left so notes only vanish via the
                            gradient (not the mask's own edge). userSpaceOnUse → immune to the inner translates. */}
                        <mask id="rpgLaneFade" maskUnits="userSpaceOnUse" x={-2000} y={0} width={viewRight + 2000} height={Math.max(1, viewBottom)}>
                            <rect x={-2000} y={0} width={viewRight + 2000} height={Math.max(1, viewBottom)} fill="url(#rpgLaneFadeGrad)" />
                        </mask>
                    </defs>
                    {/* #863 perf fix: each translate `<g>` below now carries a ref — the INITIAL `transform`
                        (computed from `tickRef.current`, correct for first paint) is still set declaratively
                        here, but every subsequent frame the SAME translate is pushed via `.setAttribute` from
                        the main rAF loop above (bucket A), bypassing React's render/commit entirely for the
                        by-far-highest-frequency mutation in this whole layer. */}
                    <g mask="url(#rpgLaneFade)">
                        {(barlineStaffContent || finalBarTick > 0) && (
                            <g ref={barlineScrollRef} transform={`translate(${-scrollPx}, 0)`}>
                                {barlineStaffContent}
                                {finalBarTick > 0 && (
                                    <g>
                                        <path d={`M ${finalBarX} ${trebleStart} V ${finalBarBottom}`} stroke="var(--text-primary)" strokeWidth="0.5" />
                                        <path d={`M ${finalBarX + 4} ${trebleStart} V ${finalBarBottom}`} stroke="var(--text-primary)" strokeWidth="2.5" />
                                    </g>
                                )}
                            </g>
                        )}
                        {(noteStaffContent || chordStaffContent || lyricsStaffContent) && (
                            <g ref={noteScrollRef} transform={`translate(${NOTE_STAFF_DX - scrollPx}, 0)`}>
                                {noteStaffContent}
                                {chordStaffContent}
                                {lyricsStaffContent}
                            </g>
                        )}
                        {/* #692 Level 9 — every note: a plain rest (rhythm guide, no pitch), always visible. */}
                        {noteStaffContentRest && <g ref={restScrollRef} transform={`translate(${NOTE_STAFF_DX - scrollPx}, 0)`}>{noteStaffContentRest}</g>}
                        {/* #692 — the REAL notes/rests, visible ONLY in debug mode (Han: "onzichtbaar, maar
                            zichtbaar in debug mode"). */}
                        {noteStaffContentReal && (
                            <g ref={realScrollRef} transform={`translate(${NOTE_STAFF_DX - scrollPx}, 0)`} opacity={debugMode ? 1 : 0} style={{ pointerEvents: 'none' }}>
                                {noteStaffContentReal}
                            </g>
                        )}
                        {/* #661: bass/percussion ride the SAME translate as treble so a beat lines up
                            vertically across all 3 scrolling staves. */}
                        {noteStaffContentBass && <g ref={bassScrollRef} transform={`translate(${NOTE_STAFF_DX - scrollPx}, 0)`}>{noteStaffContentBass}</g>}
                        {noteStaffContentPercussion && <g ref={percussionScrollRef} transform={`translate(${NOTE_STAFF_DX - scrollPx}, 0)`}>{noteStaffContentPercussion}</g>}
                    </g>
                </>
            )}
            {/* #661 (Han 2026-08-02): a RED vertical STRIKE line at exactly where a note sits at the moment it
                must be played (note/slime centre at the hero = startX + SLIME_VIEW_W/2). The hit window is the
                graded ±1/2-beat (= ±1/8 note) TIME window around that moment (gradeHit tiers; combat check),
                so the old spatial band is gone. */}
            {sideScroll && dist > 0 && (
                // Layout fix (Han 2026-08-18, "switch the position of the 'perfect hit' red line and
                // the hero"): THE red strike line itself — `strikeLineX`, see its own declaration comment.
                <line x1={strikeLineX} y1={trebleStart - 8} x2={strikeLineX}
                    y2={Math.max(trebleStart, viewBottom)} stroke="#e63232" strokeWidth={1.5} strokeOpacity={0.85}
                    style={{ pointerEvents: 'none' }} />
            )}
            {slimeData.map((s, idx) => {
                const dyingEntry = dyingList.find((d) => d.index === idx);
                const isDying = !!dyingEntry;
                const deathFrame = isDying ? Math.min(framesSince(dyingEntry.startTick), DEATH_FRAMES - 1) : 0;
                // Level 10 (Han 2026-08-06): per-item enemy type — a Mixed level's note renders as a
                // Projectile when ITS OWN beat falls in a Wizard-type block, Slime otherwise. Every
                // `isWizard` check below this point uses `itemIsWizard` instead, so a real Wizard level
                // (all notes Wizard) and a Slime level (all notes Slime) are both special cases of this
                // same per-item decision.
                const itemIsWizard = isWizard || (isMixed && blockTypeAt(Math.floor(s.beat / beatsPerMeasure)) === 'Wizard');
                // #863 perf fix: a live (on-screen, not dying) entity registers itself in `slimeRefsMap` via
                // this callback ref so the bucket-A rAF loop can push its position/frame every frame without
                // going through React. Any branch below that returns null/switches to a non-live render
                // (killed, dying) must NOT attach this ref — see the explicit `.delete()` calls at those
                // branches, otherwise a stale handle would linger in the map pointing at an unmounted node.
                const liveSlimeRef = (el) => {
                    if (el) slimeRefsMap.current.set(s.key, { el, kind: 'slime', idx });
                    else slimeRefsMap.current.delete(s.key);
                };
                const liveProjectileRef = (el) => {
                    if (el) slimeRefsMap.current.set(s.key, { el, kind: 'projectile', idx });
                    else slimeRefsMap.current.delete(s.key);
                };
                if (sideScroll) {
                    if (killedSet.has(idx)) { slimeRefsMap.current.delete(s.key); return null; }   // struck & death finished
                    if (isDying) {
                        slimeRefsMap.current.delete(s.key);   // dying → no longer a live/ref-driven entity
                        // #863 round 2: registers the death-sprite's imperative handle (frame/opacity only —
                        // position is FROZEN at `dyingEntry.x`, so no per-frame `setPosition` is needed) for
                        // the rAF loop's `dyingRefsMap` pass below.
                        const liveDyingRef = (el) => {
                            if (el) dyingRefsMap.current.set(s.key, { el, kind: itemIsWizard ? 'projectile' : 'slime', startTick: dyingEntry.startTick });
                            else dyingRefsMap.current.delete(s.key);
                        };
                        // Han: in parallel with the enemy's death, the struck NOTE flies UP + fades; a lowlight
                        // GHOST copy stays at its spot ("niet meer spelen"). staffYStart shifts with the note so
                        // the stem direction can't flip mid-flight. (Level 2 = forced quarters, C4–G4: exact.)
                        const note = Array.isArray(s.note) ? s.note[0] : s.note;
                        const ny = getNoteAbsoluteY(note, trebleStart, 'treble', 'treble');
                        // Layout fix (Han 2026-08-18): `effectiveStartX`, matching the shifted strike line —
                        // the struck note's ghost/fly-up must appear where it was actually hit, not the old spot.
                        const nx = effectiveStartX + NOTE_STAFF_DX;
                        const prog = Math.min(1, framesSince(dyingEntry.startTick) / DEATH_FRAMES);
                        const up = prog * 46;
                        // #863 round 2: registers the flying/fading ghost note's WRAPPER `<g>` — the rAF loop
                        // mutates its `transform`/`opacity` directly; `StaffQuarterNote` itself is untouched
                        // (still drawn once, declaratively, at its unshifted `ny`/`trebleStart`) since shifting
                        // BOTH `positionY` and `staffYStart` by the same amount is mathematically identical to
                        // translating the whole glyph by that amount (every internal offset in StaffQuarterNote
                        // is relative to `staffYStart`) — so a `<g transform="translate(0,-up)">` wrapper
                        // reproduces the exact same pixels as the old per-render `ny - up`/`trebleStart - up`
                        // re-render did, without needing StaffQuarterNote to re-render at all.
                        const liveGhostRef = (el) => {
                            if (el) ghostNoteRefsMap.current.set(s.key, { el, startTick: dyingEntry.startTick });
                            else ghostNoteRefsMap.current.delete(s.key);
                        };
                        return (
                            <g key={s.key}>
                                {itemIsWizard
                                    // #679 (Han: "stop met voortbewegen, net als de slimes" + "-20% opacity per
                                    // frame") — frozen at its struck x (dyingEntry.x, same freeze technique the
                                    // slime already uses), stepping the death sheet's 5 frames with the fade table.
                                    // #685: Y is the same B4-centered height it flew at (no oscillation once dead
                                    // — "stop met voortbewegen" applies to the wobble too, not just the x drift).
                                    ? <Projectile ref={liveDyingRef} x={dyingEntry.x} y={projectileCenterY} frame={deathFrame} dying opacity={PROJECTILE_DEATH_OPACITY[deathFrame] ?? 0.2} />
                                    : <Slime ref={liveDyingRef} x={dyingEntry.x} y={slimeY} colorKey={s.colorKey} row={SLIME_DEATH.row} frame={deathFrame} />}
                                {/* #685 (Han: "render de noten zelfs niet") — the flying/ghost note glyphs are
                                    skipped entirely for the Wizard's projectiles; the glow already makes them
                                    unreadable, so they're not drawn instead of drawn-then-hidden. */}
                                {!itemIsWizard && ny != null && (
                                    <>
                                        <StaffQuarterNote x={nx} positionY={ny} staffYStart={trebleStart} color="var(--text-lowlight)" opacity={0.45} />
                                        <g ref={liveGhostRef} transform={`translate(0, ${-up})`} opacity={1 - prog}>
                                            <StaffQuarterNote x={nx} positionY={ny} staffYStart={trebleStart} opacity={1} />
                                        </g>
                                    </>
                                )}
                            </g>
                        );
                    }
                    // Fresh every render — needed for the spawn/off-screen gating checks below, which
                    // genuinely must track "now". #1050 second follow-up: the DECLARATIVE props handed to
                    // Slime/Projectile below are a separate concern — see `freezeOnce`'s own comment.
                    const p = sideScrollX(s.beat, tickRef.current);
                    if (itemIsWizard) {
                        // #679 (Han interview: "zelfde beat-gekoppelde aankomsttijd" + "bewegen wél lineair naar
                        // voren"): reuses the SAME arrival timing as a slime (sideScrollX), but takes the LINEAR
                        // `noteX` instead of the hopping `slimeX` — a genuinely different motion, not a reskin.
                        // The flight sprite cycles its own 36-frame loop continuously (independent of position).
                        // #686 (Han: "zichtbaar op de plek waar het zou zijn 1 maat op voorhand... ongeveer
                        // halverwege de notenbalk"): visibility is gated SEPARATELY from the underlying
                        // spawn/flight math above (unchanged) — the projectile only RENDERS once its
                        // remaining flight time is within `wizardSpawnLeadMeasures`, i.e. it appears already
                        // partway across the lane instead of popping in at the wizard's edge.
                        // #688 (Han: "maak zichtbaar in debug mode") — the early-invisible window is
                        // bypassed entirely in debug mode, so every spawned-but-not-yet-due projectile is
                        // visible for inspection.
                        const visibleSinceMs = (beatsOnScreen - spawnLeadBeats) * beatMs;
                        if (!p.spawned || p.noteX < -PROJECTILE_VIEW_W || (!debugMode && p.msSinceSpawn < visibleSinceMs)) {
                            slimeRefsMap.current.delete(s.key);
                            frozenSlimePropsRef.current.delete(s.key);
                            return null;
                        }
                        // #1050 second follow-up: frozen at first appearance (see `freezeOnce`) — was
                        // recomputed (loopFrame/oscX/oscY) from the live tick on every render before, which
                        // fought the rAF loop's own imperative setPosition/setFrame for this same entity.
                        const live = freezeOnce(frozenSlimePropsRef.current, s.key, () => {
                            // #685 ("animatie 4x zo snel"): loop speed multiplied independently of frameMs.
                            const loopFrame = Math.floor(p.ff * PROJECTILE_ANIM_SPEED) % PROJECTILE_LOOP_FRAMES;
                            // #685 ("oscilleren rond hun centrum... 15 units in alle richtingen"): small wobble
                            // layered on top of the real flight position — `tick * INTERVAL_MS` = elapsed ms, a
                            // smooth continuously-increasing clock (unlike `Date.now()`, stays in sync with the
                            // audio-anchored rAF loop everything else here already uses).
                            const nowMs = tickRef.current * INTERVAL_MS;
                            const oscX = oscillate(s.key, nowMs, PROJECTILE_OSCILLATE_RANGE);
                            const oscY = oscillate(s.key + 1000, nowMs, PROJECTILE_OSCILLATE_RANGE);
                            return { x: p.noteX + oscX, y: projectileCenterY + oscY, frame: loopFrame };
                        });
                        // #863: `ref={liveProjectileRef}` — this is a BUCKET-A live entity; the rAF loop
                        // takes over its position/frame every frame after this initial mount paint.
                        return <Projectile key={s.key} ref={liveProjectileRef} x={live.x} y={live.y} frame={live.frame} />;
                    }
                    if (!p.spawned || p.slimeX < -SLIME_VIEW_W) {
                        slimeRefsMap.current.delete(s.key);
                        frozenSlimePropsRef.current.delete(s.key);
                        return null;   // not on screen / walked off left
                    }
                    // #1050 second follow-up: frozen at first appearance — see `freezeOnce`'s own comment.
                    // The wiggle shake (Han: a wrong/early note WIGGLES the still-next slime) stays fully
                    // live regardless — it's driven by `wiggleRef.current.wdx` in the rAF loop (set from the
                    // render body above, refreshed every render — "point 8"), never by this frozen prop.
                    const live = freezeOnce(frozenSlimePropsRef.current, s.key, () => {
                        const wf = slimeWalkOrIdleFrame(p);
                        return { x: p.slimeX, y: slimeY, row: wf.row, frame: wf.frame };
                    });
                    return <Slime key={s.key} ref={liveSlimeRef} x={live.x} y={live.y} colorKey={s.colorKey} row={live.row} frame={live.frame} />;
                }
                // static (Level 1 style): idle under the note; death in place. Wizard is never non-sideScroll
                // (Level 9's config is sideScroll:true), so this branch stays pure Slime — no isWizard check.
                if (idx < killedCount) return null;
                const row = isDying ? SLIME_DEATH.row : SLIME_IDLE.row;
                const frame = isDying ? deathFrame : gFrame % SLIME_IDLE.frames;
                return <Slime key={s.key} x={s.x} y={slimeY} colorKey={s.colorKey} row={row} frame={frame} />;
            })}
            {/* #862 (Han 2026-08-10, twoHanded levels) — bass-slimes, own lane at bassSlimeY. Simpler than
                the treble render above: no Wizard/Mixed/wiggle branches (Level 15 is plain Slime; a wrong
                bass attempt doesn't wiggle — useTwoHandedBass allows retrying any time within the measure). */}
            {sideScroll && bassSlimeData.map((s, idx) => {
                if (bassKilledSet.has(idx)) { bassSlimeRefsMap.current.delete(s.key); return null; }
                const dyingEntry = bassDyingList.find((d) => d.index === idx);
                if (dyingEntry) {
                    bassSlimeRefsMap.current.delete(s.key);   // dying → no longer live/ref-driven
                    const deathFrame = Math.min(framesSince(dyingEntry.startTick), DEATH_FRAMES - 1);
                    // #863 round 2: frame-only imperative registration (position frozen, same as treble above).
                    const liveBassDyingRef = (el) => {
                        if (el) bassDyingRefsMap.current.set(`bass-${s.key}`, { el, startTick: dyingEntry.startTick });
                        else bassDyingRefsMap.current.delete(`bass-${s.key}`);
                    };
                    return <Slime key={`bass-${s.key}`} ref={liveBassDyingRef} x={dyingEntry.x} y={bassSlimeY} colorKey={s.colorKey} row={SLIME_DEATH.row} frame={deathFrame} />;
                }
                const p = sideScrollX(s.beat, tickRef.current);   // fresh — needed for the gating check below
                if (!p.spawned || p.slimeX < -SLIME_VIEW_W) {
                    bassSlimeRefsMap.current.delete(s.key);
                    frozenBassSlimePropsRef.current.delete(s.key);
                    return null;
                }
                const liveBassSlimeRef = (el) => {
                    if (el) bassSlimeRefsMap.current.set(s.key, { el, idx });
                    else bassSlimeRefsMap.current.delete(s.key);
                };
                // #1050 second follow-up: frozen at first appearance — see `freezeOnce`'s own comment.
                const live = freezeOnce(frozenBassSlimePropsRef.current, s.key, () => {
                    const wf = slimeWalkOrIdleFrame(p);
                    return { x: p.slimeX, y: bassSlimeY, row: wf.row, frame: wf.frame };
                });
                return <Slime key={`bass-${s.key}`} ref={liveBassSlimeRef} x={live.x} y={live.y} colorKey={s.colorKey} row={live.row} frame={live.frame} />;
            })}
            {/* #693 round 8 — critters under rests, exact mirror of the slime render above but simpler: no
                death animation, just hidden once struck (killedCritters). Same sideScrollX/spawn gating so
                they scroll in lockstep with everything else. */}
            {sideScroll && critterData.map((c, idx) => {
                if (killedCritters.has(idx)) { critterRefsMap.current.delete(c.key); return null; }
                const p = sideScrollX(c.beat, tickRef.current);   // fresh — needed for the gating check below
                if (!p.spawned || p.noteX < -SLIME_VIEW_W || (!debugMode && p.msSinceSpawn < 0)) {
                    critterRefsMap.current.delete(c.key);
                    frozenCritterPropsRef.current.delete(c.key);
                    return null;
                }
                const liveCritterRef = (el) => {
                    if (el) critterRefsMap.current.set(c.key, { el, idx });
                    else critterRefsMap.current.delete(c.key);
                };
                // #1050 second follow-up: frozen at first appearance — see `freezeOnce`'s own comment.
                const live = freezeOnce(frozenCritterPropsRef.current, c.key, () => {
                    // #1097 (Han 2026-08-22): same cadence as slime/hero idle now, not an artificial 1/4 rate
                    // — see the imperative hot-path update above for the matching change + rationale.
                    const gFrame = Math.floor(p.ff) % 1000;
                    return { x: p.noteX - (c.variant.crop.w * CRITTER_SCALE) / 2, y: slimeY, frame: gFrame };
                });
                return <Critter key={c.key} ref={liveCritterRef} x={live.x} y={live.y} variant={c.variant} frame={live.frame} />;
            })}
            {/* Graded timing zones next to the red strike line (Han 2026-08-02, debug-only for now — Han may
                place assets here later). Replaces the old #660 spatial hit-zone rect (kills are TIME-window
                based since #661). Widths derive from the SAME window constants gradeHit grades with (§6c):
                px-per-beat = dist/beatsOnScreen, so half-width(tier) = (dist/bos)·tierBeats. Green = perfect
                (±1/32 note), yellow = too fast/slow (±1/16), orange = much too fast/slow (±1/8). */}
            {debugMode && sideScroll && dist > 0 && (() => {
                const strikeX = strikeLineX;
                const pxPerBeat = dist / beatsOnScreen;
                const zoneY = trebleStart - 8, zoneH = Math.max(trebleStart, viewBottom) - zoneY;
                const band = (halfBeats, color) => (
                    <rect key={color} x={strikeX - halfBeats * pxPerBeat} y={zoneY} width={2 * halfBeats * pxPerBeat}
                        height={zoneH} fill={color} fillOpacity={0.13} stroke={color} strokeWidth={0.5}
                        strokeOpacity={0.5} style={{ pointerEvents: 'none' }} />
                );
                return [band(MUCH_TOO_BEATS, '#e07818'), band(TOO_BEATS, '#d4a800'), band(PERFECT_BEATS, '#2eb84d')];
            })()}
            {/* floating judgment labels ("perfect" / "too slow" / "wrong note" … — Han: 'zeg dan wrong note').
                Spawn at the strike line, float up and fade out over JUDGMENT_MS. Explicit TEXT font (same
                Georgia stack the measure numbers use — see BarlinesLayer) because the surrounding SVG
                otherwise cascades the Maestro NOTATION font onto plain words (Han 2026-08-02: 3× groter,
                standaard font). */}
            {sideScroll && judgments.map((j) => {
                const prog = Math.min(1, ((tickRef.current - j.startTick) * INTERVAL_MS) / JUDGMENT_MS);
                const y = judgmentY(geomRef.current, j.lane, prog);
                // #863 round 2: registers this judgment's live `<text>` node so the rAF loop can push
                // fresh y/opacity every frame instead of waiting for the next `frameTick` re-render.
                const liveJudgmentRef = (el) => {
                    if (el) {
                        const existing = judgmentRefsMap.current.get(j.id);
                        judgmentRefsMap.current.set(j.id, { el, startTick: j.startTick, lane: j.lane, id: j.id, charEls: existing?.charEls || [] });
                    } else {
                        judgmentRefsMap.current.delete(j.id);
                    }
                };
                // #925 follow-up: one <tspan> per character so the rAF loop above can nudge each letter
                // independently (see its own comment) — `liveCharRef` collects them onto the SAME map
                // entry `liveJudgmentRef` creates, keyed by character index, not a second separate map.
                // Creates a stub entry if it doesn't exist yet — React doesn't guarantee whether a child
                // tspan's ref or the parent text's ref fires first, so either callback may run first.
                const label = GRADE_LABELS[j.category] || j.category;
                const liveCharRef = (i) => (el) => {
                    let entry = judgmentRefsMap.current.get(j.id);
                    if (!entry) { entry = { charEls: [] }; judgmentRefsMap.current.set(j.id, entry); }
                    entry.charEls[i] = el;
                };
                return (
                    // Layout fix (Han 2026-08-18): `strikeLineX` — judgment labels float up from the
                    // (now-swapped) strike line position.
                    <text key={j.id} ref={liveJudgmentRef} x={strikeLineX + 10} y={y}
                        fill={JUDGMENT_COLOR[j.category] || 'var(--text-primary)'} opacity={1 - prog}
                        fontSize="36" fontWeight="700" fontFamily="Georgia, 'Times New Roman', serif"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {label.split('').map((ch, i) => (
                            <tspan key={i} ref={liveCharRef(i)}>{ch === ' ' ? ' ' : ch}</tspan>
                        ))}
                    </text>
                );
            })}
            {/* #825 "hit" bursts — 7-frame fade in/hold/fade out, double the shared sprite fps. */}
            {sideScroll && hits.map((h) => {
                const f = framesSince(h.startTick, frameMs / 2);
                const frameIdx = h.frames[Math.min(f, HIT_FRAMES - 1)];
                const opacity = HIT_BURST_OPACITY[Math.min(f, HIT_FRAMES - 1)];
                // #863 round 2: registers this hit burst's imperative handle for the rAF loop.
                const liveHitRef = (el) => {
                    if (el) hitRefsMap.current.set(h.id, { el, startTick: h.startTick, frames: h.frames });
                    else hitRefsMap.current.delete(h.id);
                };
                return <HitBurst key={h.id} ref={liveHitRef} x={h.x} y={h.y} frame={frameIdx} opacity={opacity} />;
            })}
            {/* #686 spawn-glow flourishes — rendered AFTER the Projectiles above (so the flash sits IN
                FRONT of a projectile it coincides with) but BEFORE the Wizard below (so it renders
                BEHIND the wizard sprite — Han: "achter de wizard, en voor het projectiel"). */}
            {(isWizard || isMixed) && spawnGlows.map((g) => {
                // #863 round 2: registers this spawn-glow's imperative handle for the rAF loop.
                const liveSpawnGlowRef = (el) => {
                    if (el) spawnGlowRefsMap.current.set(g.key, { el, startTick: g.startTick });
                    else spawnGlowRefsMap.current.delete(g.key);
                };
                return <SpawnGlow key={g.key} ref={liveSpawnGlowRef} x={g.x} y={g.y} age={framesSince(g.startTick)} />;
            })}
            {/* #679 Level 9 — the wizard, static on the right, facing the hero. Purely decorative/non-
                interactive (no onClick, so no §3a debug hit-box is needed — nothing here is clickable).
                Level 10 (Han 2026-08-06, "er moet een zwarte wizard staan"): a Mixed level shows the SAME
                static wizard, black-tinted via CSS `brightness`/`saturate` (§6d: reuse the canonical
                Wizard renderer + the hue-rotate/filter approach already used for Level 11's green
                variant, rather than new art) — its cast animation is the SAME `wizardCells`/`wizardFrame`
                computed above, now gated on Wizard-type NOTES specifically instead of the whole level. */}
            {(isWizard || isMixed) && sideScroll && (
                <Wizard ref={wizardRef} x={wizardX} y={wizardY} cells={wizardCells} frame={wizardFrame} />
            )}
            {/* Level 11 (Han 2026-08-06, "slimes, er staat een groene wizard. die doet elke 2 maten een
                spell en wisselt dan van toonladder"): a PURELY DECORATIVE wizard, same sprite/position as
                the real combat Wizard but a REAL pre-drawn green sprite sheet (WIZARD_GREEN_URL — Han:
                "de sprites van de wizards zijn herkleurde sprites; in de bestiary/portraits staan al
                kleurvarianten... gebruik die", replacing the earlier CSS hue-rotate approximation) — idle-
                only, no combat/grading coupling, no attack-frame choreography synced to the melody (the
                real scale-swap mechanic IS implemented, in useLevelKeyModulationStream.js). `!isWizard`
                guard: never doubles up with a real combat Wizard. */}
            {!isWizard && sideScroll && decorativeWizard && (
                <Wizard ref={decorativeWizardRef} x={wizardX} y={wizardY} cells={WIZARD_IDLE_CELLS}
                    // Bug fix (crash: "Cannot read properties of undefined (reading 'col')"): `gFrame` can
                    // be NEGATIVE during the pre-roll (tick negative before scrollStartTime) — plain `%`
                    // then indexes WIZARD_IDLE_CELLS with a negative number (undefined in JS), same failure
                    // mode the combat wizard's own `wizardFrame` already guards against above (§679 bugfix)
                    // but this decorative one bypassed. Same non-negative-modulo fix.
                    frame={((gFrame % WIZARD_IDLE_CELLS.length) + WIZARD_IDLE_CELLS.length) % WIZARD_IDLE_CELLS.length}
                    url={WIZARD_GREEN_URL} />
            )}
            {/* Level 11 follow-up (Han 2026-08-06, "ik wil 2 maten voor elke switch een staticprojeciles2
                (32x32) laten toveren door de tovenaar. Die vliegt mee op de maatstreep tussen de majeur
                en mineur-blokken"): one looping StaticProjectile2 per upcoming Major↔Minor switch
                boundary (every 2 measures — the SAME chunkMeasures useLevelKeyModulationStream.js fixes
                at 2, Han's own spec for both Level 10 and 11). Uses the plain `sideScrollX` linear flight
                (no extra lead-time gate needed): `beatsOnScreen` already defaults to 8 beats = 2
                measures, so a note/flourish naturally becomes visible ~2 measures before its own beat —
                exactly the timing asked for, for free. A fixed small lookahead of switch indices is
                rendered; ones beyond the level's actual length simply never spawn (harmless). */}
            {!isWizard && sideScroll && decorativeWizard && SWITCH_LOOKAHEAD.map((k, i) => {
                const switchBeat = k * 2 * beatsPerMeasure;
                const p = sideScrollX(switchBeat, tickRef.current);   // fresh — needed for the gating check below
                if (!p.spawned || p.noteX < -STATIC_PROJECTILE2_CROP.w) {
                    switchRefsArr.current[i] = null;
                    frozenSwitchPropsRef.current.delete(i);
                    return null;
                }
                // #863: bucket-A live entity — `switchRefsArr` (a plain array, SWITCH_LOOKAHEAD is fixed
                // and ordered) is walked every rAF frame by the main loop above to update position/frame.
                // #1050 second follow-up: frozen at first appearance — see `freezeOnce`'s own comment.
                const live = freezeOnce(frozenSwitchPropsRef.current, i, () => (
                    { x: p.noteX, y: projectileCenterY, frame: Math.floor(p.ff) % STATIC_PROJECTILE2_LOOP_FRAMES }
                ));
                return (
                    <StaticProjectile2 key={`switch-${k}`} ref={(el) => { switchRefsArr.current[i] = el; }}
                        x={live.x} y={live.y} frame={live.frame} />
                );
            })}
            {/* #871 (Han 2026-08-11, "abc music en level namen"): a decorative NPC (levels.json's `npc`
                bestiary-name field) standing at the same right-edge anchor the wizard uses, sized to the
                wizard's own tuned scale. Reuses the existing `Critter` renderer (§6c) with `preferIdle` so
                it plays its idle animation. Purely visual: no ref registration in the rAF entity buckets,
                no click handler, no combat/grading coupling. `!isWizard && !isMixed` guard: never doubles
                up with a combat wizard, same guard shape decorativeWizard uses above. */}
            {!isWizard && !isMixed && sideScroll && npcVariant && (
                <Critter x={viewRight - npcVariant.crop.w * NPC_SCALE + 2} y={viewBottom - npcVariant.crop.h * NPC_SCALE}
                    variant={npcVariant} scale={NPC_SCALE} preferIdle flip={npc !== 'Japanese Musician'}
                    frame={((gFrame % npcIdleLen) + npcIdleLen) % npcIdleLen} />
            )}
            {!hideHero && (
                <foreignObject x={heroX} y={heroY} width={dollW} height={HERO_H} style={{ overflow: 'visible', pointerEvents: 'auto' }}>
                    <div xmlns="http://www.w3.org/1999/xhtml" onClick={onOpenCharacter}
                        style={{ cursor: 'pointer' }} title="Open character">
                        {heroEl}
                    </div>
                </foreignObject>
            )}
            {!hideHero && debugMode && (
                <rect x={heroX} y={heroY} width={dollW} height={HERO_H}
                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1} style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
}
