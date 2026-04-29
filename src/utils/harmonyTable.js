/**
 * Harmony Difficulty Table
 *
 * Pre-computes harmonic difficulty for every (family × mode × tonic) combination,
 * then deduplicates enharmonic equivalents by keeping only the tonic with the
 * fewest key-signature accidentals for each pitch class.
 *
 * Example: C# Ionian (7 sharps) is removed in favour of Db Ionian (5 flats).
 *
 * Usage:
 *   const entry = getHarmonyAtDifficulty(6.5, 0.25);
 *   // entry: { family, modeName, tonic, difficulty } | null
 *
 *   const { min, max } = HARMONY_DIFFICULTY_RANGE;
 */

import { scaleDefinitions, generateNumAccidentals } from '../theory/scaleHandler';
import { getNoteSemitone } from '../theory/noteUtils';
import { calcHarmonicDifficulty } from './difficultyCalculator';

// ─── All tonic spellings to enumerate ────────────────────────────────────────
// Natural notes + both enharmonic spellings for each altered pitch.
// Deduplication (below) removes strictly harder spellings but keeps both when
// they tie — e.g. F# Lydian and Gb Lydian both survive if |acc| is equal.
const TONICS = [
  'C', 'C#', 'Db',
  'D', 'D#', 'Eb',
  'E',
  'F', 'F#', 'Gb',
  'G', 'G#', 'Ab',
  'A', 'A#', 'Bb',
  'B',
];

// ─── Build the raw table ──────────────────────────────────────────────────────

function buildRawTable() {
  const table = [];

  for (const [family, modes] of Object.entries(scaleDefinitions)) {
    for (const mode of modes) {
      for (const tonic of TONICS) {
        const numAccidentals = generateNumAccidentals(tonic, mode.name);

        const fakeScale = {
          displayTonic: tonic,
          family,
          intervals: mode.intervals,
          numAccidentals,
        };

        const { score } = calcHarmonicDifficulty(fakeScale);

        table.push({
          family,
          modeName: mode.name,
          tonic,
          numAccidentals,   // kept for deduplication; also useful for debugging
          difficulty: score,
        });
      }
    }
  }

  return table;
}

// ─── Deduplicate: prefer simplest enharmonic per pitch class ─────────────────
//
// For each (family, modeName, semitone) group, keep only entries whose
// |numAccidentals| is the minimum for that group.
// If two spellings tie (e.g. F# vs Gb), both are kept — giving the randomizer
// variety at the same difficulty level without introducing harder tonics.

function preferSimplestEnharmonic(rawTable) {
  // First pass: find the minimum |numAccidentals| per group.
  const minAbs = new Map(); // key → minimum abs accidentals

  for (const entry of rawTable) {
    const semitone = getNoteSemitone(entry.tonic);
    const key = `${entry.family}|${entry.modeName}|${semitone}`;
    const abs = Math.abs(entry.numAccidentals);
    if (!minAbs.has(key) || abs < minAbs.get(key)) {
      minAbs.set(key, abs);
    }
  }

  // Second pass: keep all entries that match the minimum.
  return rawTable.filter((entry) => {
    const semitone = getNoteSemitone(entry.tonic);
    const key = `${entry.family}|${entry.modeName}|${semitone}`;
    return Math.abs(entry.numAccidentals) === minAbs.get(key);
  });
}

// ─── Lazy table — built on first use or via explicit buildHarmonyTable() ─────
// Building lazily ensures any startup-time changes to scale/chord data are
// captured, and avoids initialization-order surprises in large bundles.

let _harmonyTable = null;
let _harmonyRange = { min: 0, max: 0 };

function getTable() {
  if (!_harmonyTable) buildHarmonyTable();
  return _harmonyTable;
}

/**
 * (Re)builds the harmony table from current scale definitions and difficulty
 * weights.  Call once at app startup; calling again forces a rebuild, which is
 * useful if scale data is updated at runtime.
 */
export function buildHarmonyTable() {
  _harmonyTable = preferSimplestEnharmonic(buildRawTable());
  _harmonyRange = _harmonyTable.reduce(
    (acc, e) => ({ min: Math.min(acc.min, e.difficulty), max: Math.max(acc.max, e.difficulty) }),
    { min: Infinity, max: -Infinity }
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Min and max harmonic difficulty in the full table.
 * Uses property getters so the values stay current after a rebuild.
 */
export const HARMONY_DIFFICULTY_RANGE = {
  get min() { return getTable(), _harmonyRange.min; },
  get max() { return getTable(), _harmonyRange.max; },
};

/**
 * Returns a random table entry whose difficulty is within `tolerance` of `target`,
 * restricted to combinations that satisfy `constraints`.
 *
 * Constraints (all optional):
 *   fixedTonic  — only entries with this tonic spelling (e.g. 'G', 'Bb')
 *   fixedFamily — only entries with this family name
 *   fixedMode   — only entries with this mode name
 *
 * Fallback when nothing is found within tolerance:
 *   Find the maximum difficulty reachable within the constrained pool,
 *   then pick randomly from [maxAvailable - 0.5, maxAvailable].
 *   If the pool itself is empty, returns null (settings unchanged).
 *
 * @param {number} target      - desired harmonic difficulty
 * @param {number} tolerance   - half-width of the acceptable range (default 0.5)
 * @param {{ fixedTonic?, fixedFamily?, fixedMode? }} constraints
 */
export function getHarmonyAtDifficulty(target, tolerance = 0.5, constraints = {}) {
  const { fixedTonic, fixedFamily, fixedMode } = constraints;
  const table = getTable();

  // Apply dimension constraints first.
  const pool = (fixedTonic == null && fixedFamily == null && fixedMode == null)
    ? table
    : table.filter((e) =>
        (fixedTonic  == null || e.tonic    === fixedTonic)  &&
        (fixedFamily == null || e.family   === fixedFamily) &&
        (fixedMode   == null || e.modeName === fixedMode)
      );

  if (pool.length === 0) return null;

  // Primary search: within tolerance of target.
  const candidates = pool.filter((e) => Math.abs(e.difficulty - target) <= tolerance);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Fallback: target is beyond the reachable range.
  // Pick from [maxAvailable - 0.5, maxAvailable] within the constrained pool.
  const maxAvailable = Math.max(...pool.map((e) => e.difficulty));
  const fallback = pool.filter((e) => e.difficulty >= maxAvailable - 0.5);
  if (fallback.length > 0) {
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  return null;
}

