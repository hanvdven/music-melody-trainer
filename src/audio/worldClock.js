// #922 (Han 2026-08-12, "in het RPG-level is een wereldklok. zorg dat het gesprek begint op de start van
// een maat"): a stable, ALWAYS-ticking beat/measure grid derived purely from `context.currentTime` (which
// starts at 0 the instant the AudioContext is created and only ever increases) plus bpm/timeSignature —
// deliberately NOT anchored to some arbitrary "whenever a toggle was flipped on" moment (that's what
// `useDebugMetronome.js`'s LOCAL click track does, and re-anchoring it every time debug is toggled would
// make its grid drift). This is the one shared "what beat/measure is it right now" primitive (§6c) — reuse
// it anywhere else that question comes up, rather than re-deriving a second grid.
export function secondsPerBeat(bpm) {
    return 60 / (bpm > 0 ? bpm : 120);
}

export function secondsPerMeasure(bpm, timeSignature) {
    const numerator = timeSignature?.[0] || 4;
    return secondsPerBeat(bpm) * numerator;
}

// The AudioContext-time timestamp of the NEXT measure boundary (or right now, if `context.currentTime` is
// already exactly on one).
export function nextMeasureStartTime(context, bpm, timeSignature) {
    const spm = secondsPerMeasure(bpm, timeSignature);
    const now = context.currentTime;
    return Math.ceil(now / spm) * spm;
}

// #922 follow-up (Han 2026-08-12, "start op eerste tel van maat is te streng, start gewoon op eerst
// volgende 'beat' (dus kwartnoot)"): the same grid, one beat granularity instead of a full measure — used
// for the conversation's OWN start (auto-continue between pages still waits for the fuller measure
// boundary, unchanged).
export function nextBeatStartTime(context, bpm) {
    const spb = secondsPerBeat(bpm);
    const now = context.currentTime;
    return Math.ceil(now / spb) * spb;
}
