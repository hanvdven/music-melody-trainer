import React from 'react';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { noteYMap, getNoteAbsoluteY, percussionStemUp } from '../renderMelodyNotes';
import { melodicNoteColor } from '../../../theory/noteUtils';
import { getNoteValue, naturalsInRange } from '../../../utils/rangeUtils';
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
// Percussion pads: each pad gets its own box centred on its notehead. The box is
// tall and biased UPWARD (point 3) so it also covers the upward stems.
const PERC_HIT_H = 56;
const PERC_HIT_UP_BIAS = 0.66;   // fraction of the box above the notehead centre
// Reserved right margin holding the preset brackets; also compacts the row.
const PRESET_AREA_WIDTH = 92;
const LOWLIGHT_OPACITY = 0.3;          // dim for melodic out-of-band notes
// Preset-bracket geometry (right margin).
const BRACKET_TICK = 7;
const BRACKET_GAP = 26;

// Full piano white-key naturals — the melodic row windows into this (computed
// once; the window is sliced per render by buildRangeRow).
const PIANO_NATURALS = naturalsInRange(21, 108);

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

const nearestIdx = (notes, midi) => {
    let bi = 0, bd = Infinity;
    notes.forEach((n, i) => { const d = Math.abs(n.midi - midi); if (d < bd) { bd = d; bi = i; } });
    return bi;
};

const fit = (count, avail) => Math.min(MAX_NOTE_WIDTH, avail / Math.max(1, count));

export const buildRangeRow = (notes, selMin, selMax, avail) => {
    const M = notes.length;
    if (M === 0) return { collapsed: false, noteWidth: avail, entries: [], allOffsets: [0], colMidi: [], gap: null, extent: { loIdx: 0, hiIdx: 0 } };

    const iMin = nearestIdx(notes, Math.min(selMin, selMax));
    const iMax = nearestIdx(notes, Math.max(selMin, selMax));
    // Boundary-relative window: at least CONTEXT_NOTES beyond each boundary, but
    // GROWN so the row fills the available width at a comfortable spacing rather
    // than bunching capped-width notes at the left (Han 2026-06-01). We pick the
    // context that makes total naturals ≈ avail / MAX_NOTE_WIDTH, split evenly.
    const inBand = (iMax - iMin) + 1;
    const wantTotal = Math.max(inBand + 2 * CONTEXT_NOTES, Math.floor(avail / MAX_NOTE_WIDTH));
    const context = Math.max(CONTEXT_NOTES, Math.ceil((wantTotal - inBand) / 2));
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
    onSetMelodicBoundary, onApplyMelodicPreset, onTogglePad, onApplyPercussionPreset,
    timeSignature, theme, debugMode = false,
    // Coloring props (point 1): the in-band/selected notes follow the same note
    // coloring as the rendered sheet music; boundary + out-of-band keep flat colors.
    noteColoringMode = 'none', scaleNotes = [], tonic = '',
}) => {
    // Active boundary being dragged: { staff, boundary, layout } | null. The layout
    // is frozen for the drag so notes don't jump; on release we force a re-render
    // so the window re-anchors and 3 fresh context notes reappear on each side
    // (Han 2026-05-31) — clearing the ref alone wouldn't re-render.
    const dragRef = React.useRef(null);
    const [, forceReanchor] = React.useReducer((n) => n + 1, 0);

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
        }
        s.ticks += 1;
        if (next == null) {
            if (!s.pressed) { stopStepper(); return; }      // released + nothing left → stop
            stepTimerRef.current = setTimeout(tick, STEP_MS); // held at target/edge → idle until release
            return;
        }
        s.live = next;
        onStepRef.current?.(s.staff, next, s.which, s.presets);
        stepTimerRef.current = setTimeout(tick, STEP_MS);
    };
    const beginStepper = (staff, which, fromMidi, targetMidi, dir, presets) => {
        stopStepper();
        stepperRef.current = { staff, which, presets, target: targetMidi, dir, live: fromMidi, pressed: true, dragged: false, ticks: 0 };
        tick(); // immediate first step so a single adjacent tap moves at once
    };

    // rAF tween for one staff: body scales s0→1 about anchorX; the edge note
    // translates edgeDx0→edgeDx1 and fades edgeOp0→edgeOp1. Opacity/transform are
    // set via element.style/attr in the rAF callback (never JSX props) per §6.
    const animate = (staff, { bodyAx, s0, edgeDx0, edgeDx1, edgeOp0, edgeOp1 }) => {
        if (rafRefs.current[staff]) cancelAnimationFrame(rafRefs.current[staff]);
        const body = bodyRefs.current[staff];
        const edge = edgeRefs.current[staff];
        const t0 = performance.now();
        const frame = (now) => {
            const p = Math.min(1, (now - t0) / STEP_MS);
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
                animate(staff, {
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
    // Note-row Y at the row's left/right ends (lowest note left, highest right),
    // used to derive the shared divider between the treble and bass hit zones.
    const melodicEnds = (staff, staffStart, clef, range) => {
        const { entries } = getMelodicLayout(staff, getNoteValue(range?.min), getNoteValue(range?.max));
        if (!entries.length) return null;
        return {
            yL: getNoteAbsoluteY(entries[0].name, staffStart, clef, staff),
            yR: getNoteAbsoluteY(entries[entries.length - 1].name, staffStart, clef, staff),
        };
    };

    // ── Melodic staff (treble/bass) ──────────────────────────────────────────
    // `divider` (shared edge between the treble & bass zones) is `{ dL, dR }` (Y at
    // the row's left/right ends) when both melodic staves are visible, else null.
    const melodicStaff = (staff, staffStart, clef, range, frame, divider) => {
        if (!frame) return null;
        const selMin = getNoteValue(range?.min);
        const selMax = getNoteValue(range?.max);

        const layout = getMelodicLayout(staff, selMin, selMax);
        const { noteWidth, entries, allOffsets, colMidi, gap } = layout;
        if (!entries.length) return null;

        // Column → midi under an SVG x (handles the collapsed gap via colMidi).
        const colAt = (x) => colMidi[Math.max(0, Math.min(colMidi.length - 1, Math.round((x - startX) / noteWidth)))];

        // Is this render a single ±1 slide vs the previous window? If so, one edge
        // note enters (in `entries`, far context, dim) or leaves (synthesised from
        // the piano list). Collapsed (ellipsis) layouts snap instantly.
        const step = gap ? { kind: 'none' } : classifyStep(prevExtentRef.current[staff], layout.extent);
        const enterMidi = step.kind === 'enter' ? PIANO_NATURALS[step.edgeIdx]?.midi : null;
        let edgeEntry = null, edgeAllOffsets = allOffsets;
        if (step.kind === 'enter') {
            edgeEntry = entries.find(e => e.midi === enterMidi) || null; // far context note, slides in
        } else if (step.kind === 'leave') {
            const n = PIANO_NATURALS[step.edgeIdx];
            const lastOff = allOffsets[allOffsets.length - 1];           // = W (linear layout)
            // The hidden note sits one slot beyond the current edge and slides out.
            const off = step.anchor === 'left' ? lastOff : 0;
            edgeEntry = n ? { name: n.name, midi: n.midi, offset: off } : null;
            if (step.anchor === 'left') edgeAllOffsets = [...allOffsets, lastOff + 1];
        }

        // The whole row is rendered as ONE MelodyNotesLayer (so ottava is computed
        // ONCE — fixes the multi-8va bug §6b) with a PER-NOTE color override:
        //   boundary notes → yellow (drag handles)
        //   in-band notes  → the live melodic coloring (point 1)
        //   out-of-band    → dim
        // The entering note is excluded (it animates in the edge group below).
        const bodyEntries = entries.filter(e => e.midi !== enterMidi);
        const colorFor = (midi, name) => {
            if (midi === selMin || midi === selMax) return 'var(--accent-yellow)';
            if (midi > selMin && midi < selMax)
                return melodicNoteColor(name, { noteColoringMode, tonic, scaleNotes, theme }) ?? 'var(--text-primary)';
            return 'var(--text-dim)';
        };
        // previewColorFn receives a note NAME; map name→midi via the entries we built.
        const midiByName = new Map(bodyEntries.map(e => [e.name, e.midi]));
        const bodyColorFn = (name) => {
            const midi = midiByName.get(name);
            return midi == null ? null : colorFor(midi, name);
        };

        // Press = start STEPPING the nearest boundary one natural per 0.25 s toward
        // the pressed column (tap = burst that finishes after release; hold = keep
        // extending outward until release). Moving past DRAG_THRESHOLD promotes the
        // gesture to a live drag (today's behaviour): the layout freezes and the
        // boundary follows the finger, re-anchoring on release.
        const onDown = (e) => {
            if (!onSetMelodicBoundary) return;
            const x = svgX(e); if (x == null) return;
            const target = colAt(x);
            const which = Math.abs(target - selMin) <= Math.abs(target - selMax) ? 'min' : 'max';
            const fromMidi = which === 'min' ? selMin : selMax;
            // Direction toward the press; pressing ON the boundary → extend outward.
            const dir = target > fromMidi ? 1 : (target < fromMidi ? -1 : (which === 'max' ? 1 : -1));
            downRef.current = { x, staff };
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
                dragRef.current = { staff, boundary: s.which, layout }; // freeze layout
            }
            if (s.dragged) {
                const midi = colAt(x);
                s.live = midi;
                onSetMelodicBoundary(staff, midi, s.which, frame.presets);
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
        const yLeft = getNoteAbsoluteY(entries[0].name, staffStart, clef, staff);
        const yRight = getNoteAbsoluteY(entries[entries.length - 1].name, staffStart, clef, staff);
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

        return (
            <g className={`range-row range-row-${staff}`} key={staff}>
                {/* Body: the stable notes (+ ellipsis). The slide animation scales
                    this group about the anchored boundary; the 8va lives inside it
                    so it rides along. */}
                <g ref={(el) => { bodyRefs.current[staff] = el; }} style={{ pointerEvents: 'none' }}>
                    {bodyEntries.length > 0 && (
                        // ONE layer for the whole row → ottava computed once (§6b).
                        // previewMode='var(--text-primary)' keeps non-coloring modes
                        // readable; previewColorFn paints each head per its band.
                        <MelodyNotesLayer
                            {...STATIC_LAYER_PROPS}
                            melody={mkMelody(bodyEntries)}
                            staff={staff}
                            staffYStart={staffStart}
                            clef={clef}
                            startX={startX}
                            noteWidth={noteWidth}
                            allOffsets={allOffsets}
                            timeSignature={timeSignature}
                            theme={theme}
                            previewMode="var(--text-primary)"
                            previewColorFn={bodyColorFn}
                        />
                    )}
                    {/* Diagonal "…" marking the collapsed in-band middle: 3 dots
                        interpolated along the slant between the last-low and first-high
                        kept notes, so the ellipsis follows the row's diagonal. */}
                    {gap && [0.3, 0.5, 0.7].map((t, k) => {
                        const yLo = getNoteAbsoluteY(gap.lowName, staffStart, clef, staff);
                        const yHi = getNoteAbsoluteY(gap.highName, staffStart, clef, staff);
                        return (
                            <circle key={`ell-${k}`}
                                cx={startX + gap.x0 + (gap.x1 - gap.x0) * t}
                                cy={yLo + (yHi - yLo) * t}
                                r={1.6} fill="var(--text-dim)"
                                style={{ pointerEvents: 'none' }} />
                        );
                    })}
                </g>
                {/* Edge note: the single context note entering (slide+fade in) or
                    leaving (slide+fade out) on a ±1 step. Its outer <g> gets the
                    animated transform/opacity (set via rAF, never JSX — §6); the
                    inner <g> carries the static out-of-band dim. */}
                {edgeEntry && (
                    <g ref={(el) => { edgeRefs.current[staff] = el; }} style={{ pointerEvents: 'none' }}>
                        <g style={{ opacity: LOWLIGHT_OPACITY }}>
                            <MelodyNotesLayer
                                {...STATIC_LAYER_PROPS}
                                melody={mkMelody([edgeEntry])}
                                staff={staff}
                                staffYStart={staffStart}
                                clef={clef}
                                startX={startX}
                                noteWidth={noteWidth}
                                allOffsets={edgeAllOffsets}
                                timeSignature={timeSignature}
                                theme={theme}
                                previewMode="var(--text-dim)"
                            />
                        </g>
                    </g>
                )}
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
        return (
            <g className={`range-presets range-presets-${staff}`}>
                {frame.presets.map((p, i) => {
                    const yTop = getNoteAbsoluteY(p.max, staffStart, clef, staff);
                    const yBottom = getNoteAbsoluteY(p.min, staffStart, clef, staff);
                    if (yTop == null || yBottom == null) return null;
                    const x = presetX0 + i * BRACKET_GAP;
                    const isActive = getNoteValue(p.min) === selMin && getNoteValue(p.max) === selMax;
                    const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
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
            { key: 'off', color: 'var(--text-lowlight)', opacity: 1, entries: disabledEntries },
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
                {/* Per-pad hit boxes → toggle. Each box is centred on its pad's
                    notehead Y (not a full-height column) so pads don't pile into
                    one overlapping block (+ debug box, §3a). */}
                {onTogglePad && ids.map((id, i) => {
                    const cy = getNoteAbsoluteY(id, percussionStart, null, 'percussion');
                    const hx = startX + i * noteWidth - noteWidth / 2;
                    // Bias the box toward the stem so it covers it (point 3): up for
                    // stem-up pads, down for stem-down pads.
                    const bias = percussionStemUp(id) ? PERC_HIT_UP_BIAS : (1 - PERC_HIT_UP_BIAS);
                    const hy = (cy ?? percussionStart) - PERC_HIT_H * bias;
                    return (
                        <g key={`hit-${id}`}>
                            <rect x={hx} y={hy} width={noteWidth} height={PERC_HIT_H}
                                fill="transparent" style={{ cursor: 'pointer' }}
                                onClick={() => onTogglePad(id)} />
                            {debugMode && (
                                <rect x={hx} y={hy} width={noteWidth} height={PERC_HIT_H}
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
                    const color = isActive ? 'var(--accent-yellow)' : 'var(--text-dim)';
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
    const tEnds = isTrebleVisible && trebleFrame ? melodicEnds('treble', trebleStart, clefTreble, trebleRange) : null;
    const bEnds = isBassVisible && bassFrame ? melodicEnds('bass', bassStart, clefBass, bassRange) : null;
    const divider = (tEnds && bEnds)
        ? { dL: (tEnds.yL + bEnds.yL) / 2, dR: (tEnds.yR + bEnds.yR) / 2 }
        : null;

    return (
        <g className="range-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && melodicStaff('treble', trebleStart, clefTreble, trebleRange, trebleFrame, divider)}
            {isBassVisible && melodicStaff('bass', bassStart, clefBass, bassRange, bassFrame, divider)}
            {isTrebleVisible && melodicPresetBrackets('treble', trebleStart, clefTreble, trebleRange, trebleFrame)}
            {isBassVisible && melodicPresetBrackets('bass', bassStart, clefBass, bassRange, bassFrame)}
            {isPercussionVisible && percussionStaffRow()}
            {isPercussionVisible && percussionPresets()}
        </g>
    );
};

export default RangeStaffOverlay;
