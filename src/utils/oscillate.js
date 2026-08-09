// #685 (Han 2026-08-04, "zorg dat de projectielen een klein beetje 'oscilleren' rond hun centrum... met
// willekeur; met een bereik van 15 units in alle richtingen"): a smooth pseudo-random wobble — two sine
// waves per axis at different (seed-derived) frequencies/phases so EACH thing wobbles independently and
// never looks like a perfect single-frequency sine loop. `seed` gives it a stable, non-synchronized phase
// (e.g. a slime/projectile's own index, or a fixed string for a single UI element). Returns a value in
// roughly [-range, +range].
// #693 (Han 2026-08-04, round 3, "use the same 'oscillation' as the one in the sheet music" for the
// bestiary's archer/wizard projectile portraits): extracted here from SheetRpgLayer.jsx (which re-exports
// it for backward compatibility) so BOTH call sites share the ONE implementation (§6c/§6d) instead of a
// second hand-copied version drifting out of sync.
// #790 (Han 2026-08-09): optional 4th `speed` multiplier on the time input — defaults to 1 so every
// existing 3-arg call site (arrow/projectile/critter wobble) is byte-for-byte unchanged. Lets a slower,
// gentler wobble (companions/flying creatures, see FLYING_HOVER_OSC_* below) share this SAME formula
// instead of a second hand-copied one (§6c).
export function oscillate(seed, tMs, range, speed = 1) {
    const s = typeof seed === 'string' ? seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : seed;
    const p1 = (s * 12.9898) % (2 * Math.PI), p2 = (s * 78.233) % (2 * Math.PI);
    const f1 = 0.0023 + (s % 7) * 0.0006, f2 = 0.0041 + (s % 5) * 0.0004;
    const t = tMs * speed;
    return (Math.sin(t * f1 + p1) * 0.6 + Math.sin(t * f2 + p2) * 0.4) * range;
}

// #790 (Han 2026-08-09, "single source of truth" audit): before this, "flying creature hover" wobble was
// re-derived with a DIFFERENT range at each of 3 call sites (CreatureSprite: 3px, RpgLevelPanel's
// WorldCreature: 4px, PortraitImage's cosmetic wobble: 4×trueScale) — exactly the drift §6c warns about.
// One shared constant pair now used by every "this creature/companion is flying, so it hovers+wobbles"
// call site (CreatureSprite — the canonical renderer, §6d). The arrow/projectile's OWN combat wobble is a
// distinct concept (not a creature anchor) and keeps its own literal range/default speed.
// #790 round 2 (Han: "pas hetzelfde effect toe dat bij pijl en projectiel is toegepast, maar dan trager
// (50%) en met kleinere range (60%)"): derived from the arrow/projectile's own reference wobble —
// `SheetRpgLayer.jsx`'s `PROJECTILE_OSCILLATE_RANGE = 7.5` — rather than an independently-chosen number
// (§6c: a formula against the named reference, not a second guessed constant). Not a live cross-file
// import (oscillate.js sits below SheetRpgLayer.jsx in the dependency graph) — if that reference value ever
// changes, recompute this one too.
export const FLYING_HOVER_OSC_RANGE = 7.5 * 0.6;  // = 4.5px — 60% of the arrow/projectile's own range
export const FLYING_HOVER_OSC_SPEED = 0.5;        // 50% slower than the arrow/projectile's default speed
