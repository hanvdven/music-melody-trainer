// Module-singleton hold for the auto weer-cyclus clock (Han 2026-09-01).
//
// RpgLevelPanel unmounts whenever a music LEVEL takes over the screen (App.jsx nulls
// `characterScreen`), which would otherwise reset the weather cycle to a fresh day on every return.
// Han's spec: the cycle FREEZES during a LEVEL and resumes exactly where it left off. So the panel
// saves its `weatherCycle` state here on unmount and reloads it on the next mount. No wall-clock
// catch-up: the panel resets its frame-loop `lastMs` baseline on mount, so the LEVEL's duration is
// simply skipped, not integrated.
//
// This is deliberately NOT persisted to localStorage — freezing only needs to survive an in-session
// unmount, and a full page reload legitimately starts a fresh day.
//
// §374 (#1191): the whole state object is saved/loaded by reference, so `cyclesElapsed` (the moon's
// lunation counter) rides along for free — no migration and no defaulting needed, because no
// differently-shaped state from an older build can ever reach this module singleton.

let saved = null;

export function loadWeatherState() {
    return saved;
}

export function saveWeatherState(state) {
    saved = state;
}
