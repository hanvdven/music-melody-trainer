import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { noteYMap, getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { melodicNoteColor, getNoteSemitone } from '../../../theory/noteUtils';
import { getNoteValue, naturalsInRange } from '../../../utils/rangeUtils';
import { transposeMelodyBySemitones } from '../../../theory/musicUtils';
import { orderedPercussionPads, PERCUSSION_PRESETS } from '../../../audio/drumKits';
import { TICKS_PER_WHOLE } from '../../../constants/timing';
import { STEP_MS, easeOutCubic } from './rangeSlide';

/**
 * RangeStaffOverlay — in-SVG range selector (sheet/bladmuziek variant).
 *
 * RENDER: the selectable pitches are a synthetic rhythm-less "melody" rendered
 * THROUGH the real note renderer (MelodyNotesLayer / renderMelodyNotes) so we
 * reuse its ledger lines, ottava (8va/8vb/15ma/15vb) shifting and notehead
 * glyphs (CLAUDE.md §6c — never reinvent pitch→Y). Each staff is a horizontal
 * row laid out on a private slot grid (pixelsPerTick=null). Percussion is
 * ordered per instrument family (orderedPercussionPads), variants behind base.
 *
 * COLOUR (theme vars via the renderer's `previewMode` override):
 *   melodic — boundary notes --range-boundary-highlight (theme-safe white-on-dark,
 *             Han 2026-06-17 R4; was --accent-yellow), in-band --text-primary,
 *             out-of-band --text-dim (dimmed via group opacity).
 *   percussion — enabled --text-primary, disabled --text-dim (dimmed).
 *
 * INTERACTION (Phase 3):
 *   melodic — press/drag along the staff's diagonal hit band moves the nearest
 *             boundary to the column under the pointer and keeps following it
 *             (tap = a zero-distance drag). Pointer capture + SVG-coordinate
 *             mapping make this work for mouse and touch alike. The band is a
 *             parallelogram following the note row so treble/bass don't overlap.
 *   percussion — tap a pad (box centred on its notehead) to toggle it in/out.
 *   presets — tap a right-bracket to apply that preset. Brackets carry NO text
 *             labels (UI-overhaul style); percussion presets are brackets too,
 *             each spanning the Y range of the pads in BASIC/STANDARD/FULL.
 *
 * Writes go through optional callbacks (onSetMelodicBoundary / onApplyMelodicPreset
 * / onTogglePad / onApplyPercussionPreset). Without them the overlay is a static
 * render (used by the smoke test).
 */

const QUARTER = TICKS_PER_WHOLE / 4;   // quarter-note → filled head + stem, no flag/beam
// The melodic row is a straight diagonal (pitch rises left→right, so Y falls).
// Hit-zone shaping (point 2, Han 2026-05-31): the treble/bass zones are tall with
// a HORIZONTAL outer edge (less diagonal) and a shared diagonal divider as the
// inner edge, so the two zones meet exactly. BAND_COVER is how far the outer edge
// clears the topmost/bottommost notehead (covering the 8va/8vb markers).
const BAND_COVER = 30;
// Percussion pads: each pad gets a FULL-HEIGHT clickable column (Han #10) — from
// PERC_HIT_TOP above the staff down PERC_HIT_FULL_H, covering stems + ledger lines.
const PERC_HIT_TOP = 18;
const PERC_HIT_FULL_H = 76;
// Reserved right margin holding the preset brackets; also compacts the row.
const PRESET_AREA_WIDTH = 92;
// Preset-bracket geometry (right margin).
const BRACKET_TICK = 7;
const BRACKET_GAP = 26;

// Full piano white-key naturals — the melodic row windows into this (computed
// once; the window is sliced per render by buildRangeRow).
const PIANO_NATURALS = naturalsInRange(21, 108);
// Natural ORDINAL (white-key index): map x(t) by this, not by MIDI, so every natural is one EVEN
// step apart (Han 2026-06-14). Mapping by MIDI made E–F and B–C — only 1 semitone apart — bunch
// into visible "pairs". Black keys land halfway between their neighbouring naturals.
const NATURAL_ORDINAL = new Map(PIANO_NATURALS.map((n, i) => [n.midi, i]));
const ordinalOf = (midi) => {
    const exact = NATURAL_ORDINAL.get(midi);
    if (exact !== undefined) return exact;
    let lo = -1;
    for (let i = 0; i < PIANO_NATURALS.length && PIANO_NATURALS[i].midi < midi; i++) lo = i;
    return lo + 0.5;   // black key → halfway between the naturals below/above
};

const STATIC_LAYER_PROPS = {
    numAccidentals: 0,
    noteGroupSize: 1,
    measureLengthSlots: 9999,   // one long "measure" → no barline/accidental resets
    scaleNotes: [],
    tonic: '',
    processedChords: [],
    inputTestState: null,
    pixelsPerTick: null,
    startMeasureIndex: 0,
    transpositionSemitones: 0,
    debugMode: false,
    interactive: false,
    courtesyAccidentals: false,
    percussionVoiceSplit: false,
    noteColoringMode: 'none',
};

const mkMelody = (entries) => ({
    notes: entries.map(e => e.name),
    offsets: entries.map(e => e.offset),
    durations: entries.map(() => QUARTER),
    ties: entries.map(() => null),
    triplets: null,
    rhythmicGrouping: null,
});

// Right bracket "]" spanning [yTop, yBottom] at x.
const rightBracketPath = (x, yTop, yBottom, tick) =>
    `M ${x - tick} ${yTop} H ${x} V ${yBottom} H ${x - tick}`;

// Set equality on small arrays (preset-match highlight).
const sameSet = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(x => s.has(x));
};

// ── Range-row layout: boundary-relative window + diagonal ellipsis ──────────
// The row is a two-thumb range slider drawn on the staff. We show a WINDOW that
// always includes CONTEXT_NOTES naturals beyond each boundary (capped to the
// piano), so the view is symmetric by construction (3 below min · min · … · max
// · 3 above max) and the user can always drag a boundary OUTWARD past the old
// ±8va limit — on release the window re-anchors and reveals fresh context, up to
// A0–C8. When the window is still too cramped to fit (noteWidth < MIN_NOTE_WIDTH)
// we COLLAPSE the in-band middle — the notes deep between the boundaries, never
// the drag target — keeping KEEP_IN naturals beside each boundary and drawing a
// diagonal "…" for the elided run (Han 2026-05-31). The gap is expressed as
// dummy slots in allOffsets so the index-based renderer (renderMelodyNotes:
// x = startX + (indexInAllOffsets - 1)*noteWidth) draws it for free.
//
// `notes` is the FULL piano natural list (21..108); the window is sliced here.
// During a drag the caller freezes the whole layout (so notes don't jump under
// the finger); buildRangeRow itself is only called for a fresh, non-drag render.
export const MIN_NOTE_WIDTH = 13;  // below this (px/SVG units) the row collapses
export const MAX_NOTE_WIDTH = 34;  // cap spacing so a small window isn't sparse
export const CONTEXT_NOTES = 3;    // naturals shown beyond each boundary
const KEEP_IN = 3;                 // in-band naturals kept beside each boundary
const GAP_SLOTS = 2;               // dummy slots reserved for the "…" gap
const MIN_COLLAPSE = 3;            // only collapse if ≥ this many middle notes

// ── Range-row x(t): the selected min/max sit at FIXED x (X_L / X_R) via a sigmoid ramp; notes
// outside the range ride saturating tanh tails so NO ellipsis is ever needed (Han 2026-06-12).
// t = note MIDI; Tl/Tr = selMin/selMax; Xl/Xr = fixed screen x; Al/Ar = tail amplitude.
// In-range ramp (Han 2026-06-14 #2): x = Xl + (Xr−Xl)·(u + (β/2π)·sin(2πu)), u=(t−Tl)/(Tr−Tl) with
// t = natural ORDINAL (even white-key steps). This is SYMMETRIC and dense in the MIDDLE: its
// derivative 1 + β·cos(2πu) is 1−β at the centre (u=½ → tightest) and 1+β at both edges (loosest),
// so notes pack closest near (Xl+Xr)/2 and stay almost-linear elsewhere (Han: closest near the
// middle, ~linear ≈ (Xr−Xl)/8). β small (<1). g(0)=0, g(½)=½, g(1)=1.
const RANGE_BETA = 0.6;       // in-range middle-bow amount (0..~0.8), tune live (Han 2026-06-16: 0.3→0.6)
const RANGE_TAU = 3;          // tanh tail rate, in naturals (tune live)
const RANGE_XL_FRAC = 0.20;   // min boundary x (fraction of the available width)
const RANGE_XR_FRAC = 0.80;   // max boundary x
const RANGE_CONTEXT = 10;     // semitones of out-of-range context shown each side
const DRAG_PX_PER_STEP = 10;  // relative drag sensitivity: px per natural step (Han 2026-06-16: 6→10)
const rangeX = (t, Tl, Tr, Xl, Xr, Al, Ar, B = RANGE_BETA, TAU = RANGE_TAU) => {
    if (t < Tl) return Xl + Al * Math.tanh((t - Tl) / TAU);
    if (t > Tr) return Xr + Ar * Math.tanh((t - Tr) / TAU);
    if (Tr === Tl) return Xl;
    const u = (t - Tl) / (Tr - Tl);
    return Xl + (Xr - Xl) * (u + (B / (2 * Math.PI)) * Math.sin(2 * Math.PI * u));
};

// Debug-tunable range-layout parameters (Han 2026-06-13): each entry is [key, label, min, max,
// step]. The live values live in component state; the constants above are the defaults.
const RANGE_PARAM_DEFS = [
    ['BETA', 'β mid-bow', 0, 0.8, 0.02],
    ['TAU', 'tanh τ', 1, 12, 0.5],
    ['XL', 'Xl frac', 0.1, 0.45, 0.01],
    ['XR', 'Xr frac', 0.55, 0.9, 0.01],
    ['CONTEXT', 'context', 4, 30, 1],
    ['DRAG', 'drag px', 6, 30, 1],
];
// Ledger-line Ys (every 10 units) between the 5-line staff and a notehead at drawn `y`.
const rangeLedgerYs = (y, staffStart) => {
    const out = [];
    for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);   // above the staff
    for (let g = staffStart + 50; y >= g; g += 10) out.push(g);   // below the staff
    return out;
};

// ── Grouped ottava for the range row (Han 2026-06-14) ───────────────────────
// The 2026-06-12 x(t) rewrite started drawing every range note at its TRUE pitch, so
// out-of-staff context notes sprawled with long ledger stacks and looked clustered.
// Restore the melody/previous-range-setter behaviour: fold each note toward the staff by
// whole octaves, then bracket the CONTIGUOUS runs that share a shift so a GROUP jumps an
// octave together (8va/15ma above, 8vb/15mb below) instead of per-note ledger sprawl.
// READ_PAD = how far above/below the staff a notehead may sit before it folds.
const READ_PAD_TOP = 26, READ_PAD_BOT = 30;          // units beyond the staff edges
const shiftOctaveName = (name, d) => {
    const m = String(name).match(/^(.*?)(-?\d+)$/);   // split pitch-class (incl. accidental) + octave
    return m ? `${m[1]}${parseInt(m[2], 10) + d}` : name;
};
// Fold one note toward the staff; returns the WRITTEN name, its octave `shift`, and drawn `y`.
// shift > 0 = written lower than sounding (8va/15ma above); shift < 0 = written higher (8vb/15mb).
const foldNoteToStaff = (name, staffStart, clef, staff) => {
    let n = name, shift = 0, y = getNoteAbsoluteY(n, staffStart, clef, staff), guard = 0;
    while (y != null && y < staffStart - READ_PAD_TOP && guard++ < 6) {       // too high → 8va
        n = shiftOctaveName(n, -1); shift += 1; y = getNoteAbsoluteY(n, staffStart, clef, staff);
    }
    guard = 0;
    while (y != null && y > staffStart + 40 + READ_PAD_BOT && guard++ < 6) {  // too low → 8vb
        n = shiftOctaveName(n, 1); shift -= 1; y = getNoteAbsoluteY(n, staffStart, clef, staff);
    }
    return { name: n, shift, y };
};
// Maestro-font ottava glyphs — MUST match the melody renderer (renderMelodyNotes getOttavaChar)
// for visual consistency (Han 2026-06-14). Our shift sign is the melody's negated: our shift>0 =
// above (8va/15ma), <0 = below (8vb/15mb).
const OTTAVA_GLYPH = { 1: 'Ã', 2: 'Û', '-1': '×', '-2': '`' };


const nearestIdx = (notes, midi) => {
    let bi = 0, bd = Infinity;
    notes.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

// Shift a midi by `n` NATURAL steps along `notes` (clamped). Used by the two-zone drag
// (Han #5) to move a boundary relative to where it was at press-time.
const shiftNatural = (notes, midi, n) => {
    const i = Math.max(0, Math.min(notes.length - 1, nearestIdx(notes, midi) + n));
    return notes[i].midi;
};

// Spread the notes across the FULL available width: divide evenly with no upper
// cap, so a small selection's notes fan out instead of bunching at the left (Han
// 2026-06-01). The window grows only modestly (capped via MAX_CONTEXT below) to
// avoid the diagonal row climbing into the neighbouring staff.
const fit = (count, avail) => avail / Math.max(1, count);
const MAX_CONTEXT = 5;   // hard cap on naturals added beyond each boundary

export const buildRangeRow = (notes, selMin, selMax, avail) => {
    const M = notes.length;
    if (M === 0) return { collapsed: false, noteWidth: avail, entries: [], allOffsets: [0], colMidi: [], gap: null, extent: { loIdx: 0, hiIdx: 0 } };

    const iMin = nearestIdx(notes, Math.min(selMin, selMax));
    const iMax = nearestIdx(notes, Math.max(selMin, selMax));
    // Boundary-relative window: CONTEXT_NOTES beyond each boundary, grown a little
    // toward filling the width but CAPPED at MAX_CONTEXT so the diagonal row never
    // climbs into the adjacent staff (the bass-too-high bug, Han 2026-06-01 #4).
    // Remaining width is absorbed by wider note spacing (fit has no upper cap).
    const inBand = (iMax - iMin) + 1;
    const wantTotal = Math.max(inBand + 2 * CONTEXT_NOTES, Math.floor(avail / MAX_NOTE_WIDTH));
    const context = Math.min(MAX_CONTEXT, Math.max(CONTEXT_NOTES, Math.ceil((wantTotal - inBand) / 2)));
    const loIdx = Math.max(0, iMin - context);
    const hiIdx = Math.min(M - 1, iMax + context);
    const win = notes.slice(loIdx, hiIdx + 1);
    const W = win.length;
    const extent = { loIdx, hiIdx };

    const linear = () => ({
        collapsed: false,
        noteWidth: fit(W, avail),
        entries: win.map((n, i) => ({ name: n.name, midi: n.midi, offset: i + 1 })),
        allOffsets: Array.from({ length: W + 1 }, (_, i) => i),
        colMidi: win.map(n => n.midi),
        gap: null, extent,
    });
    if (avail / W >= MIN_NOTE_WIDTH) return linear();

    // Keep KEEP_IN naturals inside each boundary; collapse the deep middle.
    const rMin = iMin - loIdx, rMax = iMax - loIdx;
    const lowEnd = Math.min(rMin + KEEP_IN, W - 1);
    const highStart = Math.max(rMax - KEEP_IN, 0);
    if (highStart - lowEnd - 1 < MIN_COLLAPSE) return linear();

    const low = win.slice(0, lowEnd + 1);
    const high = win.slice(highStart);
    const total = low.length + GAP_SLOTS + high.length;
    const noteWidth = fit(total, avail);

    const entries = [];
    low.forEach((n, i) => entries.push({ name: n.name, midi: n.midi, offset: i + 1 }));
    const highBase = low.length + GAP_SLOTS; // first high note offset = highBase + 1
    high.forEach((n, i) => entries.push({ name: n.name, midi: n.midi, offset: highBase + i + 1 }));

    // slot s (x = startX + s*noteWidth) → nearest kept note's midi; gap slots snap
    // to the adjacent cluster edge so a stray tap on the "…" still does something.
    const colMidi = [];
    for (let s = 0; s < total; s++) {
        const e = entries.find(en => en.offset === s + 1);
        colMidi.push(e ? e.midi : (s + 1 <= low.length ? low[low.length - 1].midi : high[0].midi));
    }

    return {
        collapsed: true, noteWidth, entries, colMidi, extent,
        allOffsets: Array.from({ length: total + 1 }, (_, i) => i),
        // x relative to startX of the last-low and first-high note centres.
        gap: {
            lowName: low[low.length - 1].name, highName: high[0].name,
            x0: (low.length - 1) * noteWidth, x1: highBase * noteWidth,
        },
    };
};

const RangeStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    // Clef-aware frames from SheetMusic.computeRangeFrame: { rowLow, rowHigh,
    // presets:[{label,min,max}] }. The selectable extent + presets follow the
    // CLEF shown on the staff, not the staff slot (Han 2026-05-31).
    trebleFrame, bassFrame,
    trebleRange, bassRange,
    enabledPads,
    // Display-only transposition per melodic staff (same value the SHEET passes to its
    // MelodyNotesLayer). The note POSITIONS stay at concert pitch (Han 2026-06-07: "de
    // hoogte op de notenbalk is correct") — only the chromatone/scale COLOURING must
    // account for transposition, exactly as the sheet colours by the TRANSPOSED note
    // name (renderMelodyNotes transposes names before colouring). 0 = no shift.
    trebleTrans = 0, bassTrans = 0,
    onSetMelodicBoundary, onApplyMelodicPreset, onTogglePad, onApplyPercussionPreset,
    timeSignature, theme, debugMode = false,
    // Coloring props (point 1): the in-band/selected notes follow the same note
    // coloring as the rendered sheet music; boundary + out-of-band keep flat colors.
    noteColoringMode = 'none', scaleNotes = [], tonic = '', activeChord = null,
}) => {
    // Active boundary being dragged: { staff, boundary, layout } | null. The layout
    // is frozen for the drag so notes don't jump; on release we force a re-render
    // so the window re-anchors and 3 fresh context notes reappear on each side
    // (Han 2026-05-31) — clearing the ref alone wouldn't re-render.
    const dragRef = React.useRef(null);
    const [, forceReanchor] = React.useReducer((n) => n + 1, 0);
    // Live (debug-tunable) range-layout params; defaults from the module constants.
    const [rp, setRp] = React.useState({
        BETA: RANGE_BETA, TAU: RANGE_TAU, XL: RANGE_XL_FRAC, XR: RANGE_XR_FRAC,
        CONTEXT: RANGE_CONTEXT, DRAG: DRAG_PX_PER_STEP,
    });

    const downRef = React.useRef(null);       // { x, staff } at pointer-down (drag detection)
    // Latest boundary writer captured in a ref so the timer-driven loop never
    // calls a stale closure across re-renders (§6 spirit).
    const onStepRef = React.useRef(null);
    onStepRef.current = onSetMelodicBoundary;

    // ── Continuous TAP slide (Han 2026-06-16) ─────────────────────────────────
    // Replaces the per-natural stepper for a TAP-to-set: the x(t) layout is
    // already continuous in the boundary ORDINALS (rangeX's Tl/Tr are the moved
    // boundary's ordinal — see melodicStaff), so we glide a FRACTIONAL ordinal
    // from the boundary's current value to the tapped target over a short eased
    // duration and re-render each frame. Notes slide smoothly because rxFor reads
    // the fractional ordinal; we commit the INTEGER target to app state exactly
    // ONCE at the end (snap), avoiding one React re-render per natural (the choppy
    // discrete jumps Han reported). Mirrors TranspositionSetter's animOffset glide.
    //
    // slideRef holds, per staff: the live fractional ordinal + the tween/hold
    // plan. A ref (not state) so the rAF loop reads the latest values without a
    // stale closure and a render isn't forced per field write (§6); the visible
    // re-render is driven explicitly by forceReanchor() once per frame.
    //   which        — 'min' | 'max' (which boundary the gesture owns)
    //   ord          — live fractional ordinal of the moved boundary (drives rxFor; only
    //                  moves off targetOrd during HOLD-EXTEND now — see R1 note below)
    //   targetOrd    — integer ordinal committed on press
    //   t0,holdDelayMs — press time + grace before a sustained press promotes to hold-extend
    //   pressed      — pointer still down? (true → may hold-extend past target)
    //   holdExtending — true once the hold glide started (gates the R1 cascade off)
    //   dir          — +1/-1 outward direction for hold-extend
    //   targetMidi   — integer midi committed on press
    //
    // R1 REVISION (Han 2026-06-17): the original design eased a FRACTIONAL ordinal
    // fromOrd→targetOrd so the row re-spaced as ONE continuous all-at-once glide. Han
    // found that "cumbersome"; the per-note staggered cascade (runRangeCascade) now owns
    // the tap re-layout instead, so beginSlide COMMITS the target immediately and this
    // slide record only survives to drive HOLD-EXTEND. The fromOrd / duration-tween
    // fields are therefore gone; ord stays pinned at targetOrd until a hold begins.
    const slideRef = React.useRef({});        // per-staff slide/hold-extend state
    const slideRafRef = React.useRef({});      // per-staff rAF id for the slide
    // Hold-extend speed once a held tap has reached its target: ordinals/second.
    // One natural per STEP_MS (250 ms) matches the old stepper's hold cadence but
    // reads as a smooth continuous glide because we advance a fractional ordinal.
    const HOLD_ORD_PER_SEC = 1000 / STEP_MS;
    const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

    // ── Per-note staggered re-layout CASCADE (R1, Han 2026-06-17) ──────────────
    // After a range commits (the boundary settles on a new min/max), the whole row
    // re-spaces. Moving every note to its new x AT ONCE "feels cumbersome" (Han);
    // instead the notes should arrive in QUICK SUCCESSION — a short left→right
    // staggered glide (the flyInCascade feel, but brief). We drive this purely on
    // the DOM: each note's outer <g data-range-midi> is translateX-ed FROM its old
    // x (recorded last render) TO its committed new x (this render), each delayed by
    // its target-x order so the leftmost note lands first. §6: every per-frame
    // transform is written via element.style in the rAF — NEVER through JSX props —
    // and the inline transform is cleared at the end so the committed render owns the
    // final position. The single commit-to-state already happened (selMin/selMax are
    // the new values); this cascade is pure visual choreography over that committed
    // layout, so it never touches app state and never fights the drag/tap tween.
    const noteXRef = React.useRef({});         // per-staff Map(midi → target screen x) committed BEFORE this render
    const cascadeXMapPending = React.useRef({});  // per-staff Map(midi → x) written DURING the current render
    const cascadeRafRef = React.useRef({});    // per-staff rAF id for the cascade
    const cascadeKeyRef = React.useRef({});    // per-staff last committed `${selMin}:${selMax}` (change detector)
    const rowGroupRefs = React.useRef({});     // per-staff <g.range-row> DOM node (to find note <g>s)
    // Cascade timing — adopt the TRANSPOSITION carousel's glide feel (Han 2026-06-18):
    // each note eases out over CASCADE_ELEM_MS (~280 ms, matching TranspositionSetter's
    // DURATION) with easeOutCubic, NOT the old 220 ms smoothstep — so a settling note
    // reads as the same smooth glide as the transposition carousel. The left→right
    // stagger Han previously asked for is KEPT (CASCADE_STAGGER_MS): the leftmost note
    // starts at 0 and the rightmost at CASCADE_STAGGER_MS, so the row still arrives in
    // "quick succession" but each individual note glides exactly like the carousel
    // instead of the snappier smoothstep. Whole row settles in STAGGER + ELEM (~400 ms).
    const CASCADE_ELEM_MS = 280;
    const CASCADE_STAGGER_MS = 120;
    // easeOutCubic — the SAME easing the transposition carousel uses (rangeSlide.js /
    // TranspositionSetter.jsx: 1 − (1−p)³). Single source of truth so the two animations
    // can't drift (CLAUDE.md §6d).
    const cascadeEase = easeOutCubic;

    const stopCascade = (staff) => {
        if (cascadeRafRef.current[staff]) { cancelAnimationFrame(cascadeRafRef.current[staff]); cascadeRafRef.current[staff] = null; }
    };
    // Run ONE left→right staggered cascade for `staff`. `moves` is an array of
    // { el, fromX, toX } — the note's outer <g>, its OLD screen x, and its NEW screen
    // x. We translateX each el from (fromX−toX) → 0, staggered by toX rank, easing
    // each over CASCADE_ELEM_MS. Inline transforms are cleared on completion so the
    // committed render (which already places the note AT toX) owns the final position.
    const runRangeCascade = (staff, moves) => {
        stopCascade(staff);
        // ONE rAF driver per staff at a time (Han 2026-06-18). The cascade is the sole
        // driver that WRITES note transforms here. A grace-window slide rAF may still be
        // alive (beginSlide armed it on the same tap that triggered this cascade), but
        // during its grace window slideFrame writes NOTHING — it only keeps its rAF alive
        // so a sustained press can promote to hold-extend. So the two never write the same
        // element in the same frame: cascade owns the transform until it completes, and if
        // the press is held the cascade is already done (or suppressed via the layout
        // effect's holdExtending guard) before hold-extend starts moving notes. We must NOT
        // stopSlide() here — that would destroy the hold-extend the user may be arming.
        if (!moves.length) return;
        const xs = moves.map(m => m.toX);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const span = (maxX - minX) || 1;
        // Per-note start delay by target-x order: leftmost (rank 0) starts immediately,
        // rightmost at CASCADE_STAGGER_MS — the "quick succession" left→right wave.
        const delayOf = (toX) => ((toX - minX) / span) * CASCADE_STAGGER_MS;
        // Initial offset set before paint (no flash): each note sits at its OLD x. Because
        // runRangeCascade is called from a useLayoutEffect, this write lands BEFORE paint,
        // so the first painted frame already shows the OLD geometry — no stale-read jump
        // (Han 2026-06-18 (c): read/seed geometry after the layout flush that measured it).
        for (const m of moves) m.el.style.transform = `translateX(${m.fromX - m.toX}px)`;
        const total = CASCADE_STAGGER_MS + CASCADE_ELEM_MS;
        const t0 = performance.now();
        const frame = (now) => {
            const t = now - t0;
            for (const m of moves) {
                const p = cascadeEase(Math.max(0, Math.min(1, (t - delayOf(m.toX)) / CASCADE_ELEM_MS)));
                const dx = (m.fromX - m.toX) * (1 - p);
                m.el.style.transform = dx === 0 ? '' : `translateX(${dx}px)`;
            }
            if (t < total) { cascadeRafRef.current[staff] = requestAnimationFrame(frame); return; }
            cascadeRafRef.current[staff] = null;
            for (const m of moves) m.el.style.transform = '';   // committed render owns the final x
        };
        // ONE rAF loop only (Han 2026-06-18): the previous code called frame(t0)
        // synchronously AND scheduled a rAF, spawning TWO concurrent loops that both wrote
        // each note's transform every frame — a self-race that jittered the glide. The
        // initial offset is already seeded above (before paint), so we just start a single
        // rAF; the first frame() runs next tick and animates from there.
        cascadeRafRef.current[staff] = requestAnimationFrame(frame);
    };

    const stopSlide = (staff) => {
        if (slideRafRef.current[staff]) { cancelAnimationFrame(slideRafRef.current[staff]); slideRafRef.current[staff] = null; }
        slideRef.current[staff] = null;
    };
    // One rAF frame of the slide for `staff`.
    //
    // R1 (Han 2026-06-17): a TAP no longer eases the boundary ordinal fromOrd→targetOrd
    // as one continuous all-at-once row re-space — that "felt cumbersome". Instead the
    // tap COMMITS the target immediately (beginSlide) and the per-note staggered CASCADE
    // (runRangeCascade) animates the re-layout left→right. So `slideFrame` only runs
    // while the tap is still HELD past its target: the HOLD-EXTEND continuous outward
    // glide, which we DO want smooth (and which suppresses the cascade via holdExtending).
    // A quick tap (release before the next frame) never enters the hold branch — the
    // immediate commit + cascade is the whole animation. Single commit-to-state still
    // holds: beginSlide commits the target once; hold-extend commits each crossing.
    const slideFrame = (staff) => (now) => {
        const s = slideRef.current[staff];
        if (!s) return;
        // GRACE window after the immediate commit: while still within s.holdDelayMs of
        // the press we do nothing but keep the rAF alive (the R1 cascade is animating
        // the tap). Only a sustained press past the grace promotes to hold-extend, so a
        // quick tap+release never glides — it just commits + cascades (Han 2026-06-17).
        if (now < s.t0 + s.holdDelayMs) {
            slideRafRef.current[staff] = requestAnimationFrame(slideFrame(staff));
            return;
        }
        if (s.pressed) {
            s.holdExtending = true;   // gate the R1 cascade off while the hold glides
            // HOLD-extend: keep gliding outward past the target until release. We
            // advance the fractional ordinal at a steady velocity (dt since the
            // last frame), so a long hold reads as one continuous outward slide.
            // First hold frame: pin to the exact integer target (the tween ended a
            // hair short of it) so the outward extension starts from a clean value.
            if (s.lastNow == null) s.ord = s.targetOrd;
            const last = s.lastNow ?? now;
            s.lastNow = now;
            const nextOrd = s.ord + s.dir * HOLD_ORD_PER_SEC * ((now - last) / 1000);
            const maxOrd = PIANO_NATURALS.length - 1;
            s.ord = Math.max(0, Math.min(maxOrd, nextOrd));
            // Commit each whole-natural crossing so app state follows the hold
            // outward (the boundary really moves), keyed off the integer ordinal.
            const intOrd = Math.round(s.ord);
            if (intOrd !== s.committedOrd) {
                s.committedOrd = intOrd;
                const midi = PIANO_NATURALS[intOrd]?.midi;
                if (midi != null) onStepRef.current?.(staff, midi, s.which, s.presets);
            }
            forceReanchor();
            if (s.ord <= 0 || s.ord >= maxOrd) { stopSlide(staff); return; }  // piano edge → stop
            slideRafRef.current[staff] = requestAnimationFrame(slideFrame(staff));
            return;
        }
        // Released before the grace promoted to hold-extend: the immediate commit in
        // beginSlide already set the final state and the cascade animated it, so just
        // tear down the slide record. (committedOrd === targetOrd already.)
        stopSlide(staff);
        forceReanchor();   // ensure a clean render at the committed integer state
    };
    // Begin a tap of `staff`'s `which` boundary to `targetMidi`. R1 (Han 2026-06-17):
    // we COMMIT the integer target IMMEDIATELY so the row re-renders at its final
    // positions and the per-note staggered cascade (driven by the committed-key change
    // in the layout effect below) animates the left→right re-layout. We then keep a
    // slide record alive purely to support HOLD-EXTEND: if the press is sustained past
    // holdDelayMs, slideFrame glides the boundary outward continuously (suppressing the
    // cascade). dir = outward direction for that hold-extend. holdDelayMs ~= a short
    // grace so a quick tap never glides. The tween that used to ease the ordinal is gone.
    const HOLD_DELAY_MS = 260;
    const beginSlide = (staff, which, fromMidi, targetMidi, dir, presets) => {
        stopSlide(staff);
        const targetOrd = ordinalOf(targetMidi);
        // Immediate single commit to app state → cascade animates the re-layout.
        onStepRef.current?.(staff, targetMidi, which, presets);
        slideRef.current[staff] = {
            which, presets, dir, targetOrd, ord: targetOrd,
            targetMidi, committedOrd: targetOrd, holdExtending: false,
            t0: performance.now(), holdDelayMs: HOLD_DELAY_MS, pressed: true, lastNow: null,
        };
        slideRafRef.current[staff] = requestAnimationFrame(slideFrame(staff));
    };

    const DRAG_THRESHOLD = 8;   // SVG units of movement → it's a drag, not a tap/hold

    // Stop all timers/rAF on unmount.
    React.useEffect(() => () => {
        Object.values(slideRafRef.current).forEach(id => id && cancelAnimationFrame(id));
        Object.values(cascadeRafRef.current).forEach(id => id && cancelAnimationFrame(id));
    }, []);

    const MEL_AVAIL = endX - PRESET_AREA_WIDTH - startX;

    // ── R1/R2 per-note re-layout cascade trigger (Han 2026-06-17) ──────────────
    // After every render we (a) snapshot this render's note x-map and (b) detect a
    // COMMITTED boundary change for each melodic staff. On a change we run the
    // staggered cascade from the PREVIOUS positions (noteXRef) to the NEW ones
    // (cascadeXMapPending). This fires for BOTH the in-overlay tap (beginSlide commits
    // immediately) AND the keyboard (KeyboardRangeSetter writes the same settings.range
    // the overlay reads as trebleRange/bassRange → R2), so the keyboard and the staff
    // share ONE animation. We SKIP it while a live drag or a hold-extend owns the row
    // (those follow the finger / glide continuously — a stagger would fight them).
    // useLayoutEffect so the per-note initial offset is set before paint (no flash).
    React.useLayoutEffect(() => {
        if (startX == null || endX == null) return;
        const run = (staff, range, frame) => {
            if (!frame) return;
            const selMin = getNoteValue(range?.min);
            const selMax = getNoteValue(range?.max);
            const key = `${selMin}:${selMax}`;
            const prevKey = cascadeKeyRef.current[staff];
            const prevXMap = noteXRef.current[staff];
            const newXMap = cascadeXMapPending.current[staff];
            cascadeKeyRef.current[staff] = key;
            if (newXMap) noteXRef.current[staff] = newXMap;   // becomes "prev" for the next change
            if (prevKey === undefined || prevKey === key) return;   // first render / no change
            // A live drag or hold-extend owns the visual motion → no cascade.
            if (dragRef.current?.staff === staff) return;
            if (slideRef.current[staff]?.holdExtending) return;
            if (!prevXMap || !newXMap) return;
            const group = rowGroupRefs.current[staff];
            if (!group) return;
            // Build the per-note moves: each note that exists in BOTH maps with a real
            // position change, paired with its outer <g data-range-midi> DOM node.
            const moves = [];
            group.querySelectorAll('[data-range-midi]').forEach((el) => {
                const midi = Number(el.getAttribute('data-range-midi'));
                const toX = newXMap.get(midi);
                const fromX = prevXMap.get(midi);
                if (toX == null || fromX == null) return;
                if (Math.abs(toX - fromX) < 0.5) return;   // unmoved → nothing to animate
                moves.push({ el, fromX, toX });
            });
            runRangeCascade(staff, moves);
        };
        if (isTrebleVisible) run('treble', trebleRange, trebleFrame);
        if (isBassVisible) run('bass', bassRange, bassFrame);
    });

    if (startX == null || endX == null) return null;

    // Screen → SVG x (robust for mouse + touch; handles the viewBox scale).
    const svgX = (e) => {
        const svg = e.currentTarget?.ownerSVGElement;
        if (!svg?.getScreenCTM) return null;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
        return loc.x;
    };
    // Screen → SVG y (same transform as svgX) — used by the boundary drag's VERTICAL axis
    // (Han 2026-06-16: drag up/down also moves the boundary, up = raise pitch).
    const svgY = (e) => {
        const svg = e.currentTarget?.ownerSVGElement;
        if (!svg?.getScreenCTM) return null;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
        return loc.y;
    };
    // ── Melodic staff (treble/bass) ──────────────────────────────────────────
    // `divider` (shared edge between the treble & bass zones) is `{ dL, dR }` (Y at
    // the row's left/right ends) when both melodic staves are visible, else null.
    const melodicStaff = (staff, staffStart, clef, range, frame, divider) => {
        if (!frame) return null;
        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);

        // x(t) layout (Han 2026-06-12): min/max at FIXED x; out-of-range notes on tanh tails →
        // no window/ellipsis. Xl/Xr fixed; Al/Ar saturate the tails within the available width.
        const Xl = startX + MEL_AVAIL * rp.XL;
        const Xr = startX + MEL_AVAIL * rp.XR;
        const Al = (Xl - startX) * 0.92;
        const Ar = (endX - PRESET_AREA_WIDTH - Xr) * 0.92;
        // Map by natural ordinal (even white-key steps), not MIDI, so naturals are evenly spaced.
        // During a TAP slide the moved boundary's ordinal is the live FRACTIONAL value from the
        // tween (slideRef.ord), so rangeX positions every note at the in-between layout for this
        // frame → the notes glide smoothly toward the target instead of jumping per natural. The
        // committed boundary midi (selMin/selMax) still drives in-band/colour classification, so
        // notes keep their identity while the spacing slides (Han 2026-06-16).
        const slide = slideRef.current[staff];
        const oMin = slide?.which === 'min' ? slide.ord : ordinalOf(selMin);
        const oMax = slide?.which === 'max' ? slide.ord : ordinalOf(selMax);
        const rxFor = (midi) => rangeX(ordinalOf(midi), oMin, oMax, Xl, Xr, Al, Ar, rp.BETA, rp.TAU);
        // Visible naturals: the selection ± rp.CONTEXT semitones of saturating context.
        const winNotes = PIANO_NATURALS.filter(n => n.midi >= selMin - rp.CONTEXT && n.midi <= selMax + rp.CONTEXT);
        if (!winNotes.length) return null;

        // Nearest visible natural under an SVG x, using the x(t) positions.
        const colAt = (x) => {
            let best = winNotes[0].midi, bd = Infinity;
            for (const n of winNotes) { const d = Math.abs(rxFor(n.midi) - x); if (d < bd) { bd = d; best = n.midi; } }
            return best;
        };

        // Transposed display (BUG-N6): render each natural at its WRITTEN position + WRITTEN colour,
        // but key the boundary/in-band split off the CONCERT midi (selMin/selMax are concert).
        const trans = staff === 'treble' ? trebleTrans : bassTrans;
        const concertNames = winNotes.map(n => n.name);
        const writtenNames = trans !== 0 ? transposeMelodyBySemitones(concertNames, trans) : concertNames;
        const writtenByConcert = new Map(winNotes.map((n, i) => [n.name, writtenNames[i]]));
        const writtenName = (concertNm) => writtenByConcert.get(concertNm) ?? concertNm;
        const colorFor = (concertMidi, writtenNm) => {
            // Boundary notes use the theme-safe range-boundary-highlight (white on dark
            // themes) for chromatone visibility — NOT --accent-yellow (Han 2026-06-17 R4).
            if (concertMidi === selMin || concertMidi === selMax) return 'var(--range-boundary-highlight)';
            if (concertMidi > selMin && concertMidi < selMax) {
                const base = melodicNoteColor(writtenNm, { noteColoringMode, tonic, scaleNotes, theme });
                if (base) return base;
                if (noteColoringMode === 'chords' && activeChord?.notes?.length) {
                    const pc = ((concertMidi % 12) + 12) % 12;
                    if (activeChord.notes.some(cn => getNoteSemitone(cn) === pc)) {
                        const mix = theme === 'light' ? 'black' : 'white';
                        return `color-mix(in srgb, var(--chromatone-${getNoteSemitone(activeChord.root)}), ${mix} 30%)`;
                    }
                }
                return 'var(--text-primary)';
            }
            return 'var(--range-lowlight)';
        };

        // Press = start a continuous SLIDE of the nearest boundary toward the
        // pressed column (tap = the row glides to the target then commits once;
        // hold = the slide reaches the target then keeps extending outward until
        // release). Moving past DRAG_THRESHOLD promotes the gesture to a live drag
        // (today's behaviour): the boundary follows the finger relative to the
        // press point, re-anchoring on release. `dragged` lives in downRef so the
        // drag and the slide tween never read each other's state.
        const onDown = (e) => {
            if (!onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            // Two zones: pick the NEAREST fixed boundary handle (min at Xl, max at Xr). Drag is
            // relative + fixed-sensitivity (see onMove); min/max stay on their fixed x.
            const which = Math.abs(x - Xl) <= Math.abs(x - Xr) ? 'min' : 'max';
            const target = colAt(x);
            const fromMidi = which === 'min' ? selMin : selMax;
            // Outward direction for hold-extend once the slide reaches the target.
            const dir = target > fromMidi ? 1 : (target < fromMidi ? -1 : (which === 'max' ? 1 : -1));
            downRef.current = { x, y: svgY(e), staff, zone: which, minAtPress: selMin, maxAtPress: selMax, dragged: false };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not all envs */ }
            beginSlide(staff, which, fromMidi, target, dir, frame.presets);
        };
        const onMove = (e) => {
            const d = downRef.current;
            if (!d || d.staff !== staff || !onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            const y = svgY(e) ?? d.y;
            if (!d.dragged && Math.hypot(x - d.x, y - d.y) > DRAG_THRESHOLD) {
                d.dragged = true;                                  // promote to live drag (any direction)
                stopSlide(staff);                                  // the tween cedes to the finger
            }
            if (d.dragged) {
                // Relative drag from the press point (fixed sensitivity — the x(t) layout has no
                // uniform note width). BOTH axes move the picked boundary (Han 2026-06-16): we sum a
                // unified "RAISE the boundary by N naturals" from horizontal + vertical drag. Up
                // (y decreases) always RAISES; horizontal keeps its per-zone sense (MAX: drag-LEFT
                // raises max; MIN: drag-RIGHT raises min), so a diagonal drag combines naturally.
                const stepsX = (x - d.x) / rp.DRAG;                // +ve = rightward
                const stepsY = (d.y - y) / rp.DRAG;                // +ve = upward (raise)
                const hRaise = d.zone === 'max' ? -stepsX : stepsX; // map horizontal → raise amount
                const raise = Math.round(hRaise + stepsY);          // total naturals to raise the boundary
                let midi;
                if (d.zone === 'max') {
                    midi = shiftNatural(PIANO_NATURALS, d.maxAtPress, raise);
                    if (midi <= d.minAtPress) midi = shiftNatural(PIANO_NATURALS, d.minAtPress, 1);
                } else {
                    midi = shiftNatural(PIANO_NATURALS, d.minAtPress, raise);
                    if (midi >= d.maxAtPress) midi = shiftNatural(PIANO_NATURALS, d.maxAtPress, -1);
                }
                onSetMelodicBoundary(staff, midi, d.zone, frame.presets);
            }
        };
        const onUp = () => {
            const d = downRef.current;
            const s = slideRef.current[staff];
            if (d?.dragged) { dragRef.current = null; forceReanchor(); }   // drag already committed live
            // tap: the commit + cascade already happened on press; clear pressed so the
            // slide won't promote to hold-extend. If it never started extending, tear the
            // idle slide record down now (no lingering grace-window rAF).
            else if (s) { s.pressed = false; if (!s.holdExtending) stopSlide(staff); }
            downRef.current = null;
        };

        // Hit band (point 2): a tall quad covering the note row + its 8va/8vb.
        // yLeft/yRight = the row's first (lowest) / last (highest) note Y. Common
        // left/right x so the treble & bass inner edges align exactly.
        // Band extent follows the WRITTEN (transposed) noteheads (Han BUG-N6).
        const yLeft = getNoteAbsoluteY(writtenName(winNotes[0].name), staffStart, clef, staff);
        const yRight = getNoteAbsoluteY(writtenName(winNotes[winNotes.length - 1].name), staffStart, clef, staff);
        const xL = startX;
        const xR = endX - PRESET_AREA_WIDTH;
        // The OUTER edge is horizontal (less diagonal — point 2) at the row's
        // topmost/bottommost note ± BAND_COVER, so it clears the highest/lowest
        // noteheads AND their 8va/8vb markers (ottava only ever shifts notes toward
        // the staff, never past the raw extreme). The INNER edge is the shared
        // divider so the treble & bass zones meet exactly. Solo → cover both sides.
        const topY = Math.min(yLeft, yRight) - BAND_COVER;
        const botY = Math.max(yLeft, yRight) + BAND_COVER;
        let bandPoints;
        if (divider) {
            bandPoints = (staff === 'treble'
                ? [`${xL},${topY}`, `${xR},${topY}`, `${xR},${divider.dR}`, `${xL},${divider.dL}`]
                : [`${xL},${divider.dL}`, `${xR},${divider.dR}`, `${xR},${botY}`, `${xL},${botY}`]
            ).join(' ');
        } else {
            bandPoints = [`${xL},${topY}`, `${xR},${topY}`, `${xR},${botY}`, `${xL},${botY}`].join(' ');
        }

        // Grouped ottava: fold EVERY note toward the staff — in-range notes included (Han
        // 2026-06-15 B4). This REVERSES the 2026-06-14 #2 rule that pinned in-range notes to
        // true pitch (shift 0, never fold): a wide selection (e.g. >2 octaves) then sprawled
        // its high/low in-range notes into long ledger stacks. Now a contiguous in-range run
        // that climbs past the staff folds by whole octaves and gets ONE 8va/8vb bracket, the
        // same as the melody renderer and the out-of-range context notes.
        const folded = winNotes.map((n) => {
            const x = rxFor(n.midi);
            const wn = writtenName(n.name);
            return { n, x, ...foldNoteToStaff(wn, staffStart, clef, staff) };
        });
        const ottavaGroups = [];
        folded.forEach((f, i) => {
            if (f.shift === 0 || f.y == null) return;
            const prev = ottavaGroups[ottavaGroups.length - 1];
            if (prev && prev.shift === f.shift && prev.lastIdx === i - 1) {
                prev.x1 = f.x; prev.lastIdx = i; prev.yExtreme = f.shift > 0 ? Math.min(prev.yExtreme, f.y) : Math.max(prev.yExtreme, f.y);
            } else {
                ottavaGroups.push({ shift: f.shift, x0: f.x, x1: f.x, lastIdx: i, yExtreme: f.y });
            }
        });

        // Record this render's target screen x per visible note (midi → x) so the
        // staggered re-layout cascade (R1) can translate each note FROM its old x.
        // Written every render; the layout effect reads it AFTER comparing against the
        // previous map (snapshotted there before this one overwrites it).
        const xMap = new Map();
        folded.forEach(({ n, x, y }) => { if (y != null) xMap.set(n.midi, x); });
        cascadeXMapPending.current[staff] = xMap;

        return (
            <g className={`range-row range-row-${staff}`} key={staff}
                ref={(el) => { rowGroupRefs.current[staff] = el; }}>
                {/* Notes drawn at their x(t) positions (Han 2026-06-12): min/max at fixed Xl/Xr,
                    context notes on the tanh tails. Out-of-range notes FADE + SHRINK with distance
                    (like the transposition setter); in-range keep natural staff-y, opacity, size. */}
                <g style={{ pointerEvents: 'none' }}>
                    {folded.map(({ n, x, name: wn, y }) => {
                        if (y == null) return null;
                        const inBand = n.midi >= selMin && n.midi <= selMax;
                        const d = inBand ? 0 : (n.midi < selMin ? selMin - n.midi : n.midi - selMax);
                        const opacity = inBand ? 1 : Math.max(0.15, 1 - d * 0.045);
                        // In-range notes SHRINK toward the MIDDLE of the range (Han 2026-06-16):
                        // 100% at the boundaries → ~50% at the exact middle, symmetric + eased.
                        // Position by NATURAL ORDINAL (even white-key steps) so the curve is smooth;
                        // uMid = 0 at the middle … 1 at either boundary. Out-of-range context notes
                        // keep their fade + shrink-with-distance. Heads/stems/ledgers scale together
                        // (the scale() wraps the whole StaffQuarterNote).
                        const oSpan = ordinalOf(selMax) - ordinalOf(selMin);
                        const uMid = oSpan > 0 ? Math.abs((ordinalOf(n.midi) - ordinalOf(selMin)) / oSpan - 0.5) * 2 : 1;
                        const s = inBand ? (0.5 + 0.5 * easeInOut(uMid)) : Math.max(0.5, 1 - d * 0.05);
                        // data-fly = flyable note tag (useRangeMorph): the range rows stream in
                        // from the right on the morph like the clef/colour overlays (Han 2026-06-15
                        // B3). The OUTER <g> is what the morph translateX-es; the INNER <g> keeps the
                        // per-note scale/opacity transform so the fly translate never clobbers it.
                        // The two ACTIVE boundary notes (concert min/max) LIGHT UP like a
                        // played note (Han 2026-06-18: "the active edges should get a note
                        // highlight"). We reuse the MAIN staff's canonical active-note look —
                        // the `#note-glow-subtle` SVG filter (App.css `.note-active` →
                        // filter:url(#note-glow-subtle); defined in SheetMusic.jsx <defs>, the
                        // same SVG this overlay renders into). NO new glow is invented (§6d).
                        // The head is already a FILLED Maestro glyph in the boundary-highlight
                        // colour (colorFor), so the filter makes it read as a lit/active head
                        // rather than a mere coloured outline. Theme-safe via the existing
                        // --range-boundary-highlight var (white on dark / dark on light).
                        const isBoundary = n.midi === selMin || n.midi === selMax;
                        return (
                            <g key={n.midi} data-fly="" data-range-midi={n.midi}>
                                <g opacity={opacity}
                                    transform={`translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`}
                                    style={isBoundary ? { filter: 'url(#note-glow-subtle)' } : undefined}>
                                    <StaffQuarterNote x={x} positionY={y} staffYStart={staffStart}
                                        ledgerYs={rangeLedgerYs(y, staffStart)} color={colorFor(n.midi, wn)} />
                                </g>
                            </g>
                        );
                    })}
                    {/* Ottava brackets — one per contiguous run that folded by the same octave.
                        Above the group for 8va/15ma (shift>0), below for 8vb/15mb (shift<0). */}
                    {ottavaGroups.map((g, gi) => {
                        // Same geometry as the melody renderer: Maestro glyph at markerY (outside the
                        // staff, clear of the group's extreme notehead), dashed line + end hook.
                        const above = g.shift > 0;
                        const markerY = above
                            ? Math.min(staffStart - 18, g.yExtreme - 18)
                            : Math.max(staffStart + 58, g.yExtreme + 18);
                        const lineY = markerY - 8;
                        const hookYEnd = (above ? markerY + 8 : markerY - 8) - 8;
                        return (
                            <g key={`ott-${gi}`} data-fly="" style={{ pointerEvents: 'none' }}>
                                <text x={g.x0} y={markerY} fontSize={30} fontFamily="Maestro"
                                    fill="var(--text-primary)">{OTTAVA_GLYPH[g.shift]}</text>
                                {g.x1 > g.x0 && (
                                    <>
                                        <line x1={g.x0 + 22} y1={lineY} x2={g.x1 + 12} y2={lineY}
                                            stroke="var(--text-primary)" strokeWidth={1} strokeDasharray="4,3" />
                                        <line x1={g.x1 + 12} y1={lineY} x2={g.x1 + 12} y2={hookYEnd}
                                            stroke="var(--text-primary)" strokeWidth={1} />
                                    </>
                                )}
                            </g>
                        );
                    })}
                </g>
                {/* Hit band covering the note row + 8va/8vb. Pointer-capture +
                    colAt() map any x to the target column, so a tap or drag anywhere
                    in the zone moves the nearest boundary. Treble & bass zones meet
                    exactly on the shared divider so neither overlaps the other. */}
                {onSetMelodicBoundary && (
                    <polygon points={bandPoints}
                        fill="transparent"
                        style={{ cursor: 'ew-resize', touchAction: 'none' }}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                    />
                )}
                {/* Debug: visualise the diagonal hit band (CLAUDE.md §3a). */}
                {debugMode && (
                    <polygon points={bandPoints}
                        fill="orange" fillOpacity={0.22} stroke="orange" strokeWidth={1}
                        style={{ pointerEvents: 'none' }}
                    />
                )}
            </g>
        );
    };

    // ── Melodic preset brackets (right margin, clickable) ─────────────────────
    const melodicPresetBrackets = (staff, staffStart, clef, range, frame) => {
        if (!frame) return null;
        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);
        const presetX0 = endX - PRESET_AREA_WIDTH + BRACKET_TICK + 4;
        // Shrink the gap so EVERY preset fits the reserved area — vocal has 6 brackets,
        // which overflowed at the fixed 26 (Han #12, 2026-06-03).
        const gap = frame.presets.length > 1
            ? Math.min(BRACKET_GAP, (PRESET_AREA_WIDTH - BRACKET_TICK - 8) / (frame.presets.length - 1))
            : 0;
        return (
            <g className={`range-presets range-presets-${staff}`}>
                {frame.presets.map((p, i) => {
                    const yTop = getNoteAbsoluteY(p.max, staffStart, clef, staff);
                    const yBottom = getNoteAbsoluteY(p.min, staffStart, clef, staff);
                    if (yTop == null || yBottom == null) return null;
                    const x = presetX0 + i * gap;
                    const isActive = getNoteValue(p.min) === selMin && getNoteValue(p.max) === selMax;
                    // SELECTED preset bracket = the range-boundary highlight (white on dark),
                    // matching the boundary noteheads (Han 2026-06-17 R4: "make the selected
                    // bracket white also"); passive = lowlight, opacity 1 (Han #14).
                    const color = isActive ? 'var(--range-boundary-highlight)' : 'var(--text-lowlight)';
                    const hitX = x - BRACKET_TICK - 12, hitY = yTop - 4;
                    const hitW = BRACKET_TICK + 18, hitH = yBottom - yTop + 8;
                    // No text label (Han 2026-05-31 — text clashed with the UI-overhaul
                    // style); presets read as nested brackets, active one highlighted.
                    return (
                        <g key={p.label} data-fly=""
                            style={{ cursor: onApplyMelodicPreset ? 'pointer' : 'default' }}
                            onClick={onApplyMelodicPreset ? () => onApplyMelodicPreset(staff, p) : undefined}>
                            {/* invisible wide hit target around the thin bracket */}
                            <rect x={hitX} y={hitY} width={hitW} height={hitH} fill="transparent" />
                            {/* Debug: visualise the preset hit box (CLAUDE.md §3a). */}
                            {debugMode && (
                                <rect x={hitX} y={hitY} width={hitW} height={hitH}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                            <path d={rightBracketPath(x, yTop, yBottom, BRACKET_TICK)}
                                fill="none" stroke={color} strokeWidth={isActive ? 1.6 : 1}
                                style={{ pointerEvents: 'none' }} />
                        </g>
                    );
                })}
            </g>
        );
    };

    // ── Percussion row (tap a pad to toggle the pool) ─────────────────────────
    const percussionStaffRow = () => {
        const ids = orderedPercussionPads().filter(id => noteYMap[id] != null);
        const M = ids.length;
        if (!M) return null;
        const noteWidth = (endX - PRESET_AREA_WIDTH - startX) / M;
        const allOffsets = Array.from({ length: M + 1 }, (_, i) => i);
        const isEnabled = (id) => !Array.isArray(enabledPads) || enabledPads.includes(id);

        const enabledEntries = [], disabledEntries = [];
        ids.forEach((id, i) => {
            (isEnabled(id) ? enabledEntries : disabledEntries).push({ name: id, offset: i + 1 });
        });

        // Deselected pads are dimmed by COLOUR, not opacity (Han 2026-06-01):
        // opacity fading made multi-stroke glyphs (ghost snare's parens, rim slash,
        // open-hihat 'o') hard to read as on/off. A flat lowlight grey at full
        // opacity keeps the glyph crisp while clearly reading as deselected.
        const layers = [
            { key: 'off', color: 'var(--range-lowlight)', opacity: 1, entries: disabledEntries },
            { key: 'on', color: 'var(--text-primary)', opacity: 1, entries: enabledEntries },
        ];

        return (
            <g className="range-row range-row-percussion" key="percussion">
                {layers.map(layer => layer.entries.length > 0 && (
                    <g key={layer.key} style={{ opacity: layer.opacity, pointerEvents: 'none' }}>
                        <MelodyNotesLayer
                            {...STATIC_LAYER_PROPS}
                            melody={mkMelody(layer.entries)}
                            staff="percussion"
                            staffYStart={percussionStart}
                            clef={null}
                            startX={startX}
                            noteWidth={noteWidth}
                            allOffsets={allOffsets}
                            timeSignature={timeSignature}
                            theme={theme}
                            previewMode={layer.color}
                        />
                    </g>
                ))}
                {/* Per-pad hit boxes → toggle. FULL-HEIGHT columns (Han #10): each box
                    spans from just above the percussion staff down past it, so the whole
                    vertical strip for a pad is clickable (covers stems + ledger lines).
                    Per-pad columns side by side, so they don't overlap horizontally. */}
                {onTogglePad && ids.map((id, i) => {
                    const hx = startX + i * noteWidth - noteWidth / 2;
                    const hy = percussionStart - PERC_HIT_TOP;   // just above the staff
                    const hh = PERC_HIT_FULL_H;                  // down to below the staff
                    return (
                        <g key={`hit-${id}`}>
                            <rect x={hx} y={hy} width={noteWidth} height={hh}
                                fill="transparent" style={{ cursor: 'pointer' }}
                                onClick={() => onTogglePad(id)} />
                            {debugMode && (
                                <rect x={hx} y={hy} width={noteWidth} height={hh}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                        </g>
                    );
                })}
            </g>
        );
    };

    // ── Percussion preset brackets (right margin, clickable) ──────────────────
    // Brackets instead of text labels (Han 2026-05-31), matching the melodic side
    // until a better percussion-pool UI exists. Each bracket spans the Y range of
    // the pads in that preset (lowest→highest notehead).
    const percussionPresets = () => {
        const modes = ['BASIC', 'STANDARD', 'FULL'];
        const presetX0 = endX - PRESET_AREA_WIDTH + BRACKET_TICK + 4;
        return (
            <g className="range-presets range-presets-percussion">
                {modes.map((mode, i) => {
                    const ys = PERCUSSION_PRESETS[mode]
                        .filter(id => noteYMap[id] != null)
                        .map(id => getNoteAbsoluteY(id, percussionStart, null, 'percussion'))
                        .filter(y => y != null);
                    if (!ys.length) return null;
                    const yTop = Math.min(...ys), yBottom = Math.max(...ys);
                    const x = presetX0 + i * BRACKET_GAP;
                    const isActive = sameSet(enabledPads, PERCUSSION_PRESETS[mode]);
                    // SELECTED pool bracket = the range-boundary highlight (white on dark),
                    // matching the melodic selected bracket (Han 2026-06-17 R4); passive =
                    // lowlight, opacity 1 (Han #14).
                    const color = isActive ? 'var(--range-boundary-highlight)' : 'var(--text-lowlight)';
                    const hitX = x - BRACKET_TICK - 12, hitY = yTop - 4;
                    const hitW = BRACKET_TICK + 18, hitH = yBottom - yTop + 8;
                    return (
                        <g key={mode}
                            style={{ cursor: onApplyPercussionPreset ? 'pointer' : 'default' }}
                            onClick={onApplyPercussionPreset ? () => onApplyPercussionPreset(mode) : undefined}>
                            <rect x={hitX} y={hitY} width={hitW} height={hitH} fill="transparent" />
                            {debugMode && (
                                <rect x={hitX} y={hitY} width={hitW} height={hitH}
                                    fill="orange" fillOpacity={0.25} stroke="orange" strokeWidth={1}
                                    style={{ pointerEvents: 'none' }} />
                            )}
                            <path d={rightBracketPath(x, yTop, yBottom, BRACKET_TICK)}
                                fill="none" stroke={color} strokeWidth={isActive ? 1.6 : 1}
                                style={{ pointerEvents: 'none' }} />
                        </g>
                    );
                })}
            </g>
        );
    };

    // Shared divider between the treble & bass hit zones: the midpoint of the two
    // note rows at the left/right ends, so the zones meet exactly (point 2). Null
    // unless both melodic staves are visible.
    // Shared divider between the treble & bass hit zones. Previously the midpoint of
    // the two NOTE ROWS, but those move with the selection — a high bass range pulled
    // the divider (and the bass zone's top edge) up into the treble staff, causing the
    // overlap Han saw (#9). Anchor it to the STAVES instead: the fixed midpoint
    // between the treble staff bottom and the bass staff top, so the zones always meet
    // in the gap between the staves regardless of where the notes sit.
    const STAFF_H = 40;
    const dividerY = (trebleStart + STAFF_H + bassStart) / 2;
    // Slightly DIAGONAL (Han #10): the note rows ascend left→right, so a gently
    // downward-left → upward-right divider follows them while staying anchored to the
    // staff gap (no overlap). ±6 units of slope across the row width.
    const DIVIDER_SLOPE = 6;
    const divider = (isTrebleVisible && trebleFrame && isBassVisible && bassFrame)
        ? { dL: dividerY + DIVIDER_SLOPE, dR: dividerY - DIVIDER_SLOPE }
        : null;

    return (
        <g className="range-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && melodicStaff('treble', trebleStart, clefTreble, trebleRange, trebleFrame, divider)}
            {isBassVisible && melodicStaff('bass', bassStart, clefBass, bassRange, bassFrame, divider)}
            {isTrebleVisible && melodicPresetBrackets('treble', trebleStart, clefTreble, trebleRange, trebleFrame)}
            {isBassVisible && melodicPresetBrackets('bass', bassStart, clefBass, bassRange, bassFrame)}
            {isPercussionVisible && percussionStaffRow()}
            {isPercussionVisible && percussionPresets()}
            {/* Debug-only live tuner for the x(t) range-layout params (Han 2026-06-13). */}
            {debugMode && (
                <foreignObject x={startX} y={2} width={236} height={158}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{
                        font: '10px monospace', color: 'var(--text-primary)',
                        background: 'rgba(0,0,0,0.72)', padding: '4px 6px', borderRadius: 4,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: 2 }}>
                            <span>range x(t)</span>
                            <button style={{ font: '9px monospace', cursor: 'pointer' }}
                                onClick={() => setRp({
                                    BETA: RANGE_BETA, TAU: RANGE_TAU, XL: RANGE_XL_FRAC,
                                    XR: RANGE_XR_FRAC, CONTEXT: RANGE_CONTEXT, DRAG: DRAG_PX_PER_STEP,
                                })}>reset</button>
                        </div>
                        {RANGE_PARAM_DEFS.map(([key, label, min, max, step]) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 52 }}>{label}</span>
                                <input type="range" min={min} max={max} step={step} value={rp[key]}
                                    onChange={(e) => setRp(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                                    style={{ flex: 1, minWidth: 0 }} />
                                <span style={{ width: 30, textAlign: 'right' }}>{rp[key]}</span>
                            </div>
                        ))}
                    </div>
                </foreignObject>
            )}
        </g>
    );
};

export default RangeStaffOverlay;
