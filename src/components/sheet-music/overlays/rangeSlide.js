// Pure helpers for the sheet range overlay's boundary SLIDE animation.
//
// Two concerns, both pure & tested:
//   1. nextNaturalToward — the stepper's "advance one natural toward a target"
//      primitive (used for tap-burst + hold-repeat). Boundaries always snap to
//      naturals (D1), so stepping is just index ±1 along the naturals list.
//   2. classifyStep — given the PREVIOUS and CURRENT visible-window extents
//      (indices into the same naturals list), decide whether the change is a
//      single ±1 slide and, if so, which edge note enters/leaves and which side
//      stays anchored. Anything that isn't a clean single step → { kind:'none' }
//      so the overlay snaps instantly (presets, drag-release, big jumps).

// Index of the natural whose midi exactly matches `midi` (boundaries are always
// naturals), else the nearest — defensive, mirrors the overlay's nearestIdx.
const idxOfMidi = (naturals, midi) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < naturals.length; i++) {
        const d = Math.abs(naturals[i].midi - midi);
        if (d < bd) { bd = d; bi = i; }
    }
    return bi;
};

// The next natural's midi one step from `fromMidi` toward `toMidi`, or null when
// already at the target or at the end of the naturals list (piano edge).
export const nextNaturalToward = (naturals, fromMidi, toMidi) => {
    if (!naturals.length || fromMidi === toMidi) return null;
    const fromIdx = idxOfMidi(naturals, fromMidi);
    const dir = toMidi > fromMidi ? 1 : -1;
    const next = naturals[fromIdx + dir];
    return next ? next.midi : null;
};

// The natural one step OUTWARD in `dir` (+1 up / -1 down) from `fromMidi`, or
// null at the piano edge. Used by press-and-hold to keep extending a boundary
// past the pressed point while held.
export const nextNaturalInDir = (naturals, fromMidi, dir) => {
    if (!naturals.length) return null;
    const next = naturals[idxOfMidi(naturals, fromMidi) + dir];
    return next ? next.midi : null;
};

// Classify a window change. `prev`/`cur` are { loIdx, hiIdx } into the SAME
// naturals list. Returns one of:
//   { kind:'enter', edgeIdx, anchor:'left'|'right', dir:+1|-1 }  — one note revealed
//   { kind:'leave', edgeIdx, anchor:'left'|'right', dir:+1|-1 }  — one note hidden
//   { kind:'none' }                                              — snap, no animation
// `edgeIdx` indexes the naturals list: the ENTERING note (cur) for 'enter', the
// LEAVING note (prev) for 'leave'. anchor = the side that stays put.
export const classifyStep = (prev, cur) => {
    if (!prev || !cur) return { kind: 'none' };
    const dLo = cur.loIdx - prev.loIdx;
    const dHi = cur.hiIdx - prev.hiIdx;
    // Extend the high (right) boundary: right edge grows by one, left anchored.
    if (dLo === 0 && dHi === 1) return { kind: 'enter', edgeIdx: cur.hiIdx, anchor: 'left', dir: 1 };
    // Extend the low (left) boundary: left edge grows by one, right anchored.
    if (dLo === -1 && dHi === 0) return { kind: 'enter', edgeIdx: cur.loIdx, anchor: 'right', dir: -1 };
    // Shrink from the right: right edge loses one, left anchored.
    if (dLo === 0 && dHi === -1) return { kind: 'leave', edgeIdx: prev.hiIdx, anchor: 'left', dir: 1 };
    // Shrink from the left: left edge loses one, right anchored.
    if (dLo === 1 && dHi === 0) return { kind: 'leave', edgeIdx: prev.loIdx, anchor: 'right', dir: -1 };
    return { kind: 'none' };
};

export const STEP_MS = 250;            // 0.25 s per note (constant, chained)
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
