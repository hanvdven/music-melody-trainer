// #922 (Han 2026-08-12, "in het RPG-level is een wereldklok. zorg dat het gesprek begint op de start van
// een maat"): a stable, ALWAYS-ticking beat/measure grid derived purely from `context.currentTime` (which
// starts at 0 the instant the AudioContext is created and only ever increases) plus bpm/timeSignature —
// deliberately NOT anchored to some arbitrary "whenever a toggle was flipped on" moment (that WAS
// `useDebugMetronome.js`'s old LOCAL click track, and re-anchoring it every time debug was toggled made its
// grid drift — Han caught this: "de world metronome begint precies wanneer ik op start druk, dat vind ik
// verdacht"). This is the one shared "what beat/measure is it right now" primitive (§6c) — reuse it
// anywhere else that question comes up, rather than re-deriving a second grid.
//
// #924 round 4 (Han: "alles op een klok geldt ook voor de tekst, en de toggleable wereldmetronoom" + "Is
// die uberhaupt hetzelfde tempo..?"): the RPG-world tab's OWN fixed tempo — every open-world audio system
// (ambient music, bird songs, the debug metronome toggle, the wisp/slime conversation typewriter) uses
// THIS bpm/timeSignature, never the app's live song/practice bpm (which varies per level and has nothing
// to do with the open world). Only the POST-COMBAT conversation (App.jsx's levelResultDialogue) is the
// deliberate exception — it stays on the just-played level's own bpm, since it's contextually still "that
// song's world".
export const WORLD_BPM = 100;
export const WORLD_TIME_SIGNATURE = [4, 4];

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
