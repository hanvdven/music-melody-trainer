/**
 * Single source of truth for all chord progression strategy definitions.
 *
 * category:
 *   'random'       — generative strategies that pick chords algorithmically each round
 *   'predetermined' — fixed Roman-numeral sequences (same order every time)
 *
 * preferredScale:
 *   'major' | 'minor' | null (null = works in any scale)
 *
 * degrees:
 *   (predetermined only) 1-based scale degrees in order.
 *   The generator loops through these exactly once (or repeats to fill length).
 *
 * defaultLength:
 *   Suggested number of chords. For predetermined progressions this is
 *   the canonical length of the pattern.
 */

export const PROGRESSION_STRATEGIES = [
    // ── RANDOM ────────────────────────────────────────────────────────────────
    {
        key: 'tonic-tonic-tonic',
        label: 'Tonic (I)',
        shortLabel: 'Melody',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        key: 'modal-random',
        label: 'Modal Random',
        shortLabel: 'Melody',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        key: 'inter-modal-random',
        label: 'Modal Song (random)',
        shortLabel: 'Modal Song',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        key: 'extra-modal-random',
        label: 'Chromatic Song (random)',
        shortLabel: 'Chromatic Song',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        key: 'jazz-random',
        label: 'Jazz Random (ii-V-I)',
        shortLabel: 'Jazz Random',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },

    // ── PREDETERMINED ─────────────────────────────────────────────────────────
    {
        key: 'pachelbel',
        label: 'Pachelbel (I-V-vi-III-IV-I-IV-V)',
        shortLabel: 'Pachelbel',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 8,
        degrees: [1, 5, 6, 3, 4, 1, 4, 5],
    },
    {
        key: 'pop-1-5-6-4',
        label: 'Pop Song (I-V-vi-IV)',
        shortLabel: 'Pop Song',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 5, 6, 4],
    },
    {
        key: 'pop-6-4-1-5',
        label: 'Pop Ballad (vi-IV-I-V)',
        shortLabel: 'Pop Ballad',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [6, 4, 1, 5],
    },
    {
        key: 'doo-wop',
        label: 'Doo-Wop (I-vi-IV-V)',
        shortLabel: 'Doo-Wop',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 6, 4, 5],
    },
    {
        key: 'classical-1-4-5-5',
        label: 'Cadential (I-IV-V-V)',
        shortLabel: 'Cadential',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 4, 5, 5],
    },
    {
        key: 'ii-v-i',
        label: 'Jazz (...ii-V-I)',
        shortLabel: 'Jazz Song',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [4, 7, 3, 6, 2, '5d', 1],
    },
    {
        key: 'andalusian',
        label: 'Andalusian Cadence (i-VII-VI-V)',
        shortLabel: 'Andalusian Cadence',
        category: 'predetermined',
        preferredScale: 'minor',
        defaultLength: 4,
        degrees: [1, 7, 6, '5d'],
    },
    {
        key: 'classical-1-4-5-1',
        label: 'Classical Cadence (I-IV-V-I)',
        shortLabel: 'Classical Cadence',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 4, 5, 1],
    },
];

/** Look up a strategy by key. Returns undefined if not found. */
export const getProgressionStrategy = (key) =>
    PROGRESSION_STRATEGIES.find((s) => s.key === key);

/** Human-readable label for a strategy key (falls back to the key itself). */
export const getProgressionLabel = (key) =>
    getProgressionStrategy(key)?.shortLabel ?? key;

/** Degree sequence for a predetermined progression (or null for random ones). */
export const getProgressionDegrees = (key) =>
    getProgressionStrategy(key)?.degrees ?? null;

/** Default number of chords for a given strategy. */
export const getProgressionDefaultLength = (key) =>
    getProgressionStrategy(key)?.defaultLength ?? 4;

/** All predetermined strategies in definition order. */
export const PREDETERMINED_STRATEGIES = PROGRESSION_STRATEGIES.filter(
    (s) => s.category === 'predetermined'
);

/** All random/generative strategies in definition order. */
export const RANDOM_STRATEGIES = PROGRESSION_STRATEGIES.filter(
    (s) => s.category === 'random'
);
