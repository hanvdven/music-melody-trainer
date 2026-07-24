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
        // #527 (Han: "now it says melody modal melody melody ... not clear what they mean") — this
        // and 'modal-random' BOTH read 'Melody'. Name each after what it actually does.
        shortLabel: 'Tonic',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        // #527 (Han 2026-07-24): SONG freezes the progression — it reuses the CURRENT progression,
        // which is the loaded song's progression when a song is loaded, else the last generated one.
        // Behaves like the old 'fixed' when no song is loaded. Never regenerates (intercepted in
        // generateChords + Sequencer), so generateProgression is never called with 'song'.
        key: 'song',
        label: 'Song',
        shortLabel: 'Song',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        key: 'modal-random',
        label: 'Modal Random',
        shortLabel: 'Random Modal',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        key: 'inter-modal-random',
        label: 'Modal Song (random)',
        shortLabel: 'Intermodal',
        category: 'random',
        preferredScale: null,
        defaultLength: 4,
    },
    {
        key: 'extra-modal-random',
        label: 'Chromatic Song (random)',
        shortLabel: 'Chromatic',
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
        label: 'Pachelbel (^1-^5-^6-^3-^4-^1-^4-^5)',
        shortLabel: 'Pachelbel',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 8,
        degrees: [1, 5, 6, 3, 4, 1, 4, 5],
    },
    {
        key: 'pop-1-5-6-4',
        label: 'Pop Song (^1-^5-^6-^4)',
        shortLabel: 'Pop Song',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 5, 6, 4],
    },
    {
        key: 'pop-6-4-1-5',
        label: 'Pop Ballad (^6-^4-^1-^5)',
        shortLabel: 'Pop Ballad',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [6, 4, 1, 5],
    },
    {
        key: 'doo-wop',
        label: 'Doo-Wop (^1-^6-^4-^5)',
        shortLabel: 'Doo-Wop',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 6, 4, 5],
    },
    {
        key: 'classical-1-4-5-5',
        label: 'Cadential (^1-^4-^5-^5)',
        shortLabel: 'Cadential',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 4, 5, 5],
    },
    {
        key: 'ii-v-i',
        label: 'Jazz (...^2-^5-^1)',
        shortLabel: 'Jazz Song',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [4, 7, 3, 6, 2, '5d', 1],
    },
    {
        key: 'andalusian',
        label: 'Andalusian Cadence (^1-^7-^6-^5)',
        shortLabel: 'Andalusian Cadence',
        category: 'predetermined',
        preferredScale: 'minor',
        defaultLength: 4,
        degrees: [1, 7, 6, '5d'],
    },
    {
        // #461 (Han #460): the classic 12-bar blues — I·I·I·I | IV·IV·I·I | V·IV·I·V.
        key: '12-bar-blues',
        label: '12-Bar Blues (^1×4 ^4×2 ^1×2 ^5 ^4 ^1 ^5)',
        shortLabel: '12-Bar Blues',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 12,
        degrees: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5],
    },
    {
        key: 'classical-1-4-5-1',
        label: 'Classical Cadence (^1-^4-^5-^1)',
        shortLabel: 'Classical Cadence',
        category: 'predetermined',
        preferredScale: 'major',
        defaultLength: 4,
        degrees: [1, 4, 5, 1],
    },
];

/** Look up a strategy by key. Returns undefined if not found.
 *  Not exported: only consumed by the two label/length helpers below (Han 2026-06-19). */
const getProgressionStrategy = (key) =>
    PROGRESSION_STRATEGIES.find((s) => s.key === key);

/** Human-readable label for a strategy key (falls back to the key itself). */
export const getProgressionLabel = (key) =>
    getProgressionStrategy(key)?.shortLabel ?? key;

/** Default number of chords for a given strategy. */
export const getProgressionDefaultLength = (key) =>
    getProgressionStrategy(key)?.defaultLength ?? 4;

/** All predetermined strategies in definition order. */
export const PREDETERMINED_STRATEGIES = PROGRESSION_STRATEGIES.filter(
    (s) => s.category === 'predetermined'
);
