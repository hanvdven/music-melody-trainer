import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { noteYMap, getNoteAbsoluteY } from '../renderMelodyNotes';
import { StaffQuarterNote } from '../staffNoteGlyph';
import { melodicNoteColor, getNoteSemitone } from '../../../theory/noteUtils';
import { getNoteValue, naturalsInRange } from '../../../utils/rangeUtils';
import { transposeMelodyBySemitones } from '../../../theory/musicUtils';
import { orderedPercussionPads, PERCUSSION_PRESETS } from '../../../audio/drumKits';
import { TICKS_PER_WHOLE } from '../../../constants/timing';
import { nextNaturalToward, nextNaturalInDir, classifyStep, STEP_MS } from './rangeSlide';

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
 *   melodic — boundary notes --accent-yellow, in-band --text-primary,
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

    // ── Boundary SLIDE animation (Han 2026-05-31) ─────────────────────────────
    // A tap/hold steps the boundary one natural per STEP_MS (0.25 s) toward the
    // target instead of jumping. Each ±1 step reveals/hides exactly ONE context
    // note at the far edge; we animate that note sliding in/out + fading, while
    // the row body scales about the anchored boundary so any re-spacing (and the
    // 8va, which lives inside the body) rides along. See rangeSlide.js.
    const prevExtentRef = React.useRef({});   // per-staff { loIdx, hiIdx, noteWidth }
    const bodyRefs = React.useRef({});        // per-staff <g> scaled about the anchor
    const edgeRefs = React.useRef({});        // per-staff <g> for the entering/leaving note
    const rafRefs = React.useRef({});         // per-staff rAF id
    const stepperRef = React.useRef(null);    // active stepper { staff, which, presets, target, dir, live, pressed, dragged, ticks }
    const stepTimerRef = React.useRef(null);  // setTimeout id for the step cadence
    const downRef = React.useRef(null);       // { x, staff } at pointer-down (drag detection)
    // Latest boundary writer captured in a ref so the timer-driven loop never
    // calls a stale closure across re-renders (§6 spirit).
    const onStepRef = React.useRef(null);
    onStepRef.current = onSetMelodicBoundary;

    const DRAG_THRESHOLD = 8;   // SVG units of movement → it's a drag, not a tap/hold
    // CR-A1 (Han 2026-06-08): a tap on a far note fires a long burst (one natural per
    // STEP_MS). Cap the WHOLE burst at MAX_BURST_MS so distant moves "speed up" — short
    // moves (whose natural total is already < the cap) are untouched. MIN_STEP_MS is a
    // floor so an extreme far tap still renders at least ~1 frame per step.
    const MAX_BURST_MS = 1000;
    const MIN_STEP_MS = 24;

    const stopStepper = () => {
        if (stepTimerRef.current) { clearTimeout(stepTimerRef.current); stepTimerRef.current = null; }
        stepperRef.current = null;
    };
    // One cadence tick: advance the boundary one natural toward the target; once
    // the target is reached, keep extending OUTWARD while still pressed (hold),
    // or stop once released (a tap completes its burst then stops).
    const tick = () => {
        const s = stepperRef.current;
        if (!s || s.dragged) return;
        let next = null;
        if (s.live !== s.target) {
            next = nextNaturalToward(PIANO_NATURALS, s.live, s.target);
        } else if (s.pressed && s.ticks > 0) {
            // Held at the target → keep extending OUTWARD. Advance the target too so
            // the next tick still reads live===target and keeps extending in `dir`
            // instead of stepping back toward the old target (the wobble bug).
            next = nextNaturalInDir(PIANO_NATURALS, s.live, s.dir);
            if (next != null) s.target = next;
            s.stepMs = STEP_MS; // hold-extension runs at the normal cadence, not the burst speed
        }
        s.ticks += 1;
        if (next == null) {
            if (!s.pressed) { stopStepper(); return; }      // released + nothing left → stop
            stepTimerRef.current = setTimeout(tick, STEP_MS); // held at target/edge → idle until release
            return;
        }
        s.live = next;
        onStepRef.current?.(s.staff, next, s.which, s.presets);
        stepTimerRef.current = setTimeout(tick, s.stepMs);  // s.stepMs = burst speed (capped) while approaching target
    };
    const beginStepper = (staff, which, fromMidi, targetMidi, dir, presets) => {
        stopStepper();
        // Per-step duration for THIS burst: distance (in naturals) determines whether we
        // compress. dist ≤ ~4 keeps STEP_MS (total already < MAX_BURST_MS); a far tap
        // shrinks per-step time so dist × stepMs ≈ MAX_BURST_MS (CR-A1).
        const fi = PIANO_NATURALS.indexOf(fromMidi);
        const ti = PIANO_NATURALS.indexOf(targetMidi);
        const dist = (fi >= 0 && ti >= 0) ? Math.abs(ti - fi) : 1;
        const stepMs = dist > 1 ? Math.max(MIN_STEP_MS, Math.min(STEP_MS, MAX_BURST_MS / dist)) : STEP_MS;
        stepperRef.current = { staff, which, presets, target: targetMidi, dir, live: fromMidi, pressed: true, dragged: false, ticks: 0, stepMs };
        tick(); // immediate first step so a single adjacent tap moves at once
    };

    // rAF tween for one staff: body scales s0→1 about anchorX; the edge note
    // translates edgeDx0→edgeDx1 and fades edgeOp0→edgeOp1. Opacity/transform are
    // set via element.style/attr in the rAF callback (never JSX props) per §6.
    const animate = (staff, durMs, { bodyAx, s0, edgeDx0, edgeDx1, edgeOp0, edgeOp1 }) => {
        if (rafRefs.current[staff]) cancelAnimationFrame(rafRefs.current[staff]);
        const body = bodyRefs.current[staff];
        const edge = edgeRefs.current[staff];
        const t0 = performance.now();
        const frame = (now) => {
            // durMs matches the cadence of the step that triggered this tween (burst speed
            // when approaching a far tap target, STEP_MS otherwise) so the glide stays
            // back-to-back continuous instead of lagging behind a compressed burst (CR-A1).
            const p = Math.min(1, (now - t0) / durMs);
            // LINEAR within a step (Han 2026-06-01): a burst chains many steps
            // back-to-back, and per-step ease-out made each step decelerate → a
            // pulsing "chain of discrete shifts". Constant velocity reads as one
            // continuous glide across the whole burst.
            const e = p;
            if (body) {
                const s = s0 + (1 - s0) * e;
                body.setAttribute('transform', `translate(${bodyAx} 0) scale(${s} 1) translate(${-bodyAx} 0)`);
            }
            if (edge) {
                const dx = edgeDx0 + (edgeDx1 - edgeDx0) * e;
                edge.setAttribute('transform', `translate(${dx} 0)`);
                edge.style.opacity = String(edgeOp0 + (edgeOp1 - edgeOp0) * e);
            }
            if (p < 1) { rafRefs.current[staff] = requestAnimationFrame(frame); return; }
            rafRefs.current[staff] = null;
            if (body) body.removeAttribute('transform');
            if (edge) { edge.setAttribute('transform', 'translate(0 0)'); edge.style.opacity = String(edgeOp1); }
        };
        frame(t0);                                          // set initial state pre-paint (no flash)
        rafRefs.current[staff] = requestAnimationFrame(frame);
    };

    // Stop all timers/rAF on unmount.
    React.useEffect(() => () => {
        stopStepper();
        Object.values(rafRefs.current).forEach(id => id && cancelAnimationFrame(id));
    }, []);

    // The visible row is a boundary-relative WINDOW into the full piano (A0..C8),
    // not the clef extent: buildRangeRow centres CONTEXT_NOTES naturals beyond
    // each boundary. During a drag we reuse the WHOLE layout captured at
    // press-time so the window/notes don't shift under the finger. Defined before
    // the early return + the slide effect so both can use it (and so no hook is
    // called conditionally — rules-of-hooks).
    const MEL_AVAIL = endX - PRESET_AREA_WIDTH - startX;
    const getMelodicLayout = (staff, selMin, selMax) => {
        const active = dragRef.current?.staff === staff ? dragRef.current : null;
        return active?.layout ?? buildRangeRow(PIANO_NATURALS, selMin, selMax, MEL_AVAIL);
    };

    // After every render: detect a single ±1 step vs the remembered window and run
    // the slide tween; then remember the current window. Cheap when nothing moved.
    // useLayoutEffect so initial transform/opacity are set before paint (no flash).
    // Must sit BEFORE the early return so it's never called conditionally.
    React.useLayoutEffect(() => {
        if (startX == null || endX == null) return;
        // Disabled (Han 2026-06-12): the ±1 slide tween belonged to the index-based layout; the
        // x(t) layout is continuous (notes glide via re-render), so no body-scale/edge tween.
        return; // eslint-disable-line no-unreachable
        const run = (staff, range, frame) => {
            if (!frame) return;
            const layout = getMelodicLayout(staff, getNoteValue(range?.min), getNoteValue(range?.max));
            if (!layout.entries.length) return;
            const cur = layout.extent;
            const prev = prevExtentRef.current[staff];
            const step = layout.gap ? { kind: 'none' } : classifyStep(prev, cur);
            if (step.kind !== 'none') {
                const nw = layout.noteWidth;
                const enter = step.kind === 'enter';
                animate(staff, stepperRef.current?.stepMs ?? STEP_MS, {
                    bodyAx: step.anchor === 'left' ? startX : (endX - PRESET_AREA_WIDTH),
                    s0: (prev?.noteWidth || nw) / nw,
                    edgeDx0: enter ? step.dir * nw : 0,
                    edgeDx1: enter ? 0 : step.dir * nw,
                    edgeOp0: enter ? 0 : 1,
                    edgeOp1: enter ? 1 : 0,
                });
            }
            prevExtentRef.current[staff] = { loIdx: cur.loIdx, hiIdx: cur.hiIdx, noteWidth: layout.noteWidth };
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
        const oMin = ordinalOf(selMin), oMax = ordinalOf(selMax);
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
            if (concertMidi === selMin || concertMidi === selMax) return 'var(--accent-yellow)';
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

        // Press = start STEPPING the nearest boundary one natural per 0.25 s toward
        // the pressed column (tap = burst that finishes after release; hold = keep
        // extending outward until release). Moving past DRAG_THRESHOLD promotes the
        // gesture to a live drag (today's behaviour): the layout freezes and the
        // boundary follows the finger, re-anchoring on release.
        const onDown = (e) => {
            if (!onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            // Two zones: pick the NEAREST fixed boundary handle (min at Xl, max at Xr). Drag is
            // relative + fixed-sensitivity (see onMove); min/max stay on their fixed x.
            const which = Math.abs(x - Xl) <= Math.abs(x - Xr) ? 'min' : 'max';
            const target = colAt(x);
            const fromMidi = which === 'min' ? selMin : selMax;
            // Tap/hold still steps the zone's boundary toward the pressed column.
            const dir = target > fromMidi ? 1 : (target < fromMidi ? -1 : (which === 'max' ? 1 : -1));
            downRef.current = { x, staff, zone: which, minAtPress: selMin, maxAtPress: selMax };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not all envs */ }
            beginStepper(staff, which, fromMidi, target, dir, frame.presets);
        };
        const onMove = (e) => {
            const d = downRef.current, s = stepperRef.current;
            if (!d || !s || d.staff !== staff || !onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            if (!s.dragged && Math.abs(x - d.x) > DRAG_THRESHOLD) {
                s.dragged = true;                                  // promote to live drag
                if (stepTimerRef.current) { clearTimeout(stepTimerRef.current); stepTimerRef.current = null; }
            }
            if (s.dragged) {
                // Relative drag from the press point (fixed sensitivity — the x(t) layout has no
                // uniform note width). MAX zone: drag-LEFT raises max; MIN zone: drag-LEFT lowers min.
                const steps = Math.round((x - d.x) / rp.DRAG);
                let midi;
                if (d.zone === 'max') {
                    midi = shiftNatural(PIANO_NATURALS, d.maxAtPress, -steps);
                    if (midi <= d.minAtPress) midi = shiftNatural(PIANO_NATURALS, d.minAtPress, 1);
                } else {
                    midi = shiftNatural(PIANO_NATURALS, d.minAtPress, steps);
                    if (midi >= d.maxAtPress) midi = shiftNatural(PIANO_NATURALS, d.maxAtPress, -1);
                }
                s.live = midi;
                onSetMelodicBoundary(staff, midi, d.zone, frame.presets);
            }
        };
        const onUp = () => {
            const s = stepperRef.current;
            if (s?.dragged) { stopStepper(); dragRef.current = null; forceReanchor(); }
            else if (s) { s.pressed = false; if (s.live === s.target) stopStepper(); } // let a burst finish; hold stops now
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

        return (
            <g className={`range-row range-row-${staff}`} key={staff}>
                {/* Notes drawn at their x(t) positions (Han 2026-06-12): min/max at fixed Xl/Xr,
                    context notes on the tanh tails. Out-of-range notes FADE + SHRINK with distance
                    (like the transposition setter); in-range keep natural staff-y, opacity, size. */}
                <g style={{ pointerEvents: 'none' }}>
                    {folded.map(({ n, x, name: wn, y }) => {
                        if (y == null) return null;
                        const inBand = n.midi >= selMin && n.midi <= selMax;
                        const d = inBand ? 0 : (n.midi < selMin ? selMin - n.midi : n.midi - selMax);
                        const opacity = inBand ? 1 : Math.max(0.15, 1 - d * 0.045);
                        const s = inBand ? 1 : Math.max(0.5, 1 - d * 0.05);
                        // data-fly = flyable note tag (useRangeMorph): the range rows stream in
                        // from the right on the morph like the clef/colour overlays (Han 2026-06-15
                        // B3). The OUTER <g> is what the morph translateX-es; the INNER <g> keeps the
                        // per-note scale/opacity transform so the fly translate never clobbers it.
                        return (
                            <g key={n.midi} data-fly="">
                                <g opacity={opacity}
                                    transform={`translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`}>
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
                            <g key={`ott-${gi}`} style={{ pointerEvents: 'none' }}>
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
                    // Active preset = normal colour; passive = lowlight, opacity 1 (Han #14).
                    const color = isActive ? 'var(--text-primary)' : 'var(--text-lowlight)';
                    const hitX = x - BRACKET_TICK - 12, hitY = yTop - 4;
                    const hitW = BRACKET_TICK + 18, hitH = yBottom - yTop + 8;
                    // No text label (Han 2026-05-31 — text clashed with the UI-overhaul
                    // style); presets read as nested brackets, active one highlighted.
                    return (
                        <g key={p.label}
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
                    // Active preset = normal colour; passive = lowlight, opacity 1 (Han #14).
                    const color = isActive ? 'var(--text-primary)' : 'var(--text-lowlight)';
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
