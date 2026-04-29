/**
 * Difficulty Calculator
 *
 * Assigns a numeric difficulty score to the current generator settings.
 * Edit WEIGHTS / SCORES below to tune the model without touching the logic.
 *
 * Scores are designed so that each sub-dimension is roughly 0–10 at normal
 * settings, giving a total of 0–40 and a multiplier of 0–10.
 *
 *   total      = harmonic + melodic + rhythmic + song
 *   multiplier = total / 4
 */

// ─── CONFIGURABLE CONSTANTS ────────────────────────────────────────────────

/** Harmonic weights */
const HARMONIC = {
  perTonicAccidental:  1,    // each ♯/♭ in the tonic note itself
  perKeyAccidental:    1,    // each sharp/flat in the key signature (abs value)
  perHalfStep:         1,    // each semitone interval in the scale
  perWholeStep:        0.5,  // each whole-tone interval in the scale
};

/**
 * Harmonic: family complexity bonus.
 * Keys match scale.family values from scaleDefinitions in scaleHandler.js.
 * 'Simple' wraps Diatonic Major/Minor — same notes, simpler label → 0.
 * Sub-diatonic scales (Pentatonic, Hexatonic, Tritonic) get 0.
 */
const FAMILY_SCORE = {
  Simple:              0,
  Pentatonic:          0,
  Hexatonic:           0,
  Tritonic:            0,
  Diatonic:            1,
  Melodic:             2,
  'Harmonic Minor':    2,
  'Harmonic Major':    2,
  Supertonic:          2,
  'Other Heptatonic':  3,
  'Double Harmonic':   3,
};

/** Melodic: base score per notePool value */
const NOTE_POOL_SCORE = {
  root:       1,
  chord:      3,
  scale:      5,
  chromatic:  10,
  // percussion pools — not used for melodic score but listed for completeness
  claves:     1,
  kick_snare: 2,
  all:        5,
};

/** Melodic: multiplier per randomization rule */
const RANDOMIZATION_MULTIPLIER = {
  uniform:          1.2,
  weighted:         0.8,
  emphasize_roots:  1.0,
  arp_up:           1.0,
  arp_down:         1.0,
  arp:              1.0,
  fixed:            1.0,
};

/** Rhythmic */
const RHYTHMIC = {
  // variability: trebleSettings.rhythmVariability is 0–100; divide by 10 → 0–10.
  variabilityFactor: 0.1,

  // Notes-per-measure: raw value, capped at notesPerMeasureMax.
  notesPerMeasureMax: 10,
};

/** Song difficulty */
const SONG = {
  // BPM component: sqrt((bpm - bpmReference) / bpmDivisor), capped 0–10.
  bpmReference: 80,
  bpmDivisor:   5,
  bpmMax:       10,
  staticBase:   1,
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

/**
 * Counts accidental symbols in a note name such as "F♯4" or "B♭♭3".
 * 𝄪 (double sharp) and 𝄫 (double flat) each count as 2.
 */
function countTonicAccidentals(displayTonic = '') {
  let count = 0;
  for (const ch of displayTonic) {
    if (ch === '𝄪' || ch === '𝄫') count += 2;
    else if (ch === '♯' || ch === '♭') count += 1;
  }
  return count;
}

// ─── SUB-SCORES ────────────────────────────────────────────────────────────

/**
 * Harmonic difficulty.
 * Inputs: the active Scale object.
 * Returns: { score, breakdown }
 */
export function calcHarmonicDifficulty(scale) {
  if (!scale) return { score: 0, breakdown: { tonicAcc: 0, keyAcc: 0, family: '–', familyScore: 0, halfSteps: 0, wholeSteps: 0 } };

  const tonicAcc    = countTonicAccidentals(scale.displayTonic || scale.tonic || '');
  const keyAcc      = Math.abs(scale.numAccidentals ?? 0);
  const family      = scale.family || 'Diatonic';
  const familyScore = FAMILY_SCORE[family] ?? 1;
  const intervals   = scale.intervals || [];
  const halfSteps   = intervals.filter(i => i === 1).length;
  const wholeSteps  = intervals.filter(i => i === 2).length;

  const score =
    tonicAcc    * HARMONIC.perTonicAccidental +
    keyAcc      * HARMONIC.perKeyAccidental   +
    familyScore +
    halfSteps   * HARMONIC.perHalfStep        +
    wholeSteps  * HARMONIC.perWholeStep;

  return { score, breakdown: { tonicAcc, keyAcc, family, familyScore, halfSteps, wholeSteps } };
}

/**
 * Melodic difficulty.
 * Inputs: trebleSettings (InstrumentSettings for the treble track).
 * Returns: { score, breakdown }
 */
export function calcMelodicDifficulty(trebleSettings) {
  if (!trebleSettings) return { score: 0, breakdown: { notePool: 'scale', poolScore: 0, randRule: 'uniform', randMult: 1 } };

  const notePool  = trebleSettings.notePool || 'scale';
  const randRule  = trebleSettings.randomizationRule || 'uniform';

  const poolScore = NOTE_POOL_SCORE[notePool] ?? 5;
  const randMult  = RANDOMIZATION_MULTIPLIER[randRule] ?? 1.0;
  const score     = poolScore * randMult;

  return { score, breakdown: { notePool, poolScore, randRule, randMult } };
}

/**
 * Rhythmic difficulty.
 * Inputs: trebleSettings.
 * Returns: { score, breakdown }
 */
export function calcRhythmicDifficulty(trebleSettings) {
  if (!trebleSettings) return { score: 0, breakdown: { variability: 0, varScore: 0, notesPerMeasure: 0, notesScore: 0 } };

  const variability = trebleSettings.rhythmVariability ?? 0;  // 0–100
  const varScore    = variability * RHYTHMIC.variabilityFactor; // → 0–10

  const notesPerMeasure = trebleSettings.notesPerMeasure ?? 0;
  const notesScore      = Math.min(RHYTHMIC.notesPerMeasureMax, notesPerMeasure);

  const score = varScore + notesScore;

  return { score, breakdown: { variability, varScore, notesPerMeasure, notesScore } };
}

/**
 * Song difficulty.
 * Inputs: bpm (number), playbackConfig.
 * Returns: { score, breakdown }
 */
export function calcSongDifficulty(bpm = 120 /*, playbackConfig */) {
  const bpmRaw   = Math.max(0, (bpm - SONG.bpmReference) / SONG.bpmDivisor);
  const bpmScore = Math.min(SONG.bpmMax, Math.sqrt(bpmRaw));
  const score    = SONG.staticBase + bpmScore;
  return { score, breakdown: { static: SONG.staticBase, bpm, bpmScore } };
}

// ─── COMBINED ──────────────────────────────────────────────────────────────

/**
 * Full difficulty calculation.
 *
 * @param {Scale}             scale          - active Scale object
 * @param {InstrumentSettings} trebleSettings - treble instrument settings
 * @param {number}            bpm            - beats per minute
 * @param {object}            playbackConfig - playback config (for future song score)
 * @returns {{ harmonic, melodic, rhythmic, song, total, multiplier, details }}
 */
export function calcDifficulty(scale, trebleSettings, bpm, playbackConfig) {
  const harmonic = calcHarmonicDifficulty(scale);
  const melodic  = calcMelodicDifficulty(trebleSettings);
  const rhythmic = calcRhythmicDifficulty(trebleSettings);
  const song     = calcSongDifficulty(bpm, playbackConfig);

  const total      = harmonic.score + melodic.score + rhythmic.score + song.score;
  const multiplier = total / 4;

  return {
    harmonic,
    melodic,
    rhythmic,
    song,
    total,
    multiplier,
  };
}
