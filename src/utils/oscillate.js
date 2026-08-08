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
export function oscillate(seed, tMs, range) {
    const s = typeof seed === 'string' ? seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : seed;
    const p1 = (s * 12.9898) % (2 * Math.PI), p2 = (s * 78.233) % (2 * Math.PI);
    const f1 = 0.0023 + (s % 7) * 0.0006, f2 = 0.0041 + (s % 5) * 0.0004;
    return (Math.sin(tMs * f1 + p1) * 0.6 + Math.sin(tMs * f2 + p2) * 0.4) * range;
}
