// Tuplet definitions and probability weights.
//
// Formula:  weight = lcm(n, d) × |n − d|
// Rationale: lcm captures how "misaligned" n and d are on the common grid;
// |n − d| captures how far the tuplet deviates from "normal" note count.
// Together they give a numeric measure of rhythmic complexity.
//
// Probability for any tuplet = tripletProbability × TRIPLET_WEIGHT / weight
// so triplets (weight=6) fire at the base rate; rarer tuplets scale down.
//
// Removed from list: {2,3} and {4,6} — "duplet" forms (n<d family) that are
// uncommon and confusing in simple-meter melody notation.
// Added: {9,8} — nonuplet, used by Chopin / Brahms.
//
// n > d → more notes than normal (compressed, standard tuplet direction).
// n < d → fewer notes than normal (stretched; included but very high weight).

const _gcd = (a, b) => (b === 0 ? a : _gcd(b, a % b));
const _lcm = (a, b) => (a / _gcd(a, b)) * b;

// Not exported: only consumed by the TUPLET_DEFS map below (Han 2026-06-19).
const tupletWeight = (n, d) => _lcm(n, d) * Math.abs(n - d);

// Triplet (3:2) is the reference — weight 6 gives the base probability.
export const TRIPLET_WEIGHT = 6;

export const TUPLET_DEFS = [
    { n: 3, d: 2 },  // triplet           weight =   6  ← reference
    { n: 4, d: 3 },  // quadruplet        weight =  12
    { n: 5, d: 4 },  // quintuplet        weight =  20
    { n: 6, d: 4 },  // sextuplet         weight =  24
    { n: 5, d: 3 },  // 5 in 3            weight =  30
    { n: 5, d: 6 },  // 5 in 6 (stretch)  weight =  30
    { n: 6, d: 5 },  // 6 in 5            weight =  30
    { n: 7, d: 6 },  // 7 in 6            weight =  42
    { n: 6, d: 7 },  // 6 in 7 (stretch)  weight =  42
    { n: 6, d: 8 },  // 6 in 8 (stretch)  weight =  48
    { n: 7, d: 8 },  // 7 in 8 (stretch)  weight =  56
    { n: 7, d: 5 },  // 7 in 5            weight =  70
    { n: 5, d: 7 },  // 5 in 7 (stretch)  weight =  70  (very rare)
    { n: 9, d: 8 },  // nonuplet          weight =  72
    { n: 7, d: 4 },  // septuplet         weight =  84
    { n: 5, d: 8 },  // 5 in 8 (stretch)  weight = 120  (extremely rare)
    { n: 7, d: 9 },  // 7 in 9 (stretch)  weight = 126  (extremely rare)
].map(t => ({ ...t, weight: tupletWeight(t.n, t.d) }));

// All defined tuplets whose d-value (ratio denominator) divides the given slot count.
// maxK caps the scale factor: 1 = exact match only (d === slotCount),
//                             2 = also allow slotCount = 2×d (one zoom level up).
// Use maxK=2 only at ≥8th-note resolution (slotsPerBeat > 1); at quarter resolution
// slotCount=2 already gives the correct quarter triplet without scaling.
export const tupletsForSlotCount = (slotCount, maxK = 1) =>
    TUPLET_DEFS.filter(t => slotCount % t.d === 0 && slotCount / t.d <= Math.max(1, maxK));
