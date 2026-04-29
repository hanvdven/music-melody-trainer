import React from 'react';
import { calcDifficulty, calcHarmonicDifficulty } from '../../utils/difficultyCalculator';
import { MELODY_DIFFICULTY_RANGE, calcTrebleDifficulty } from '../../utils/melodyDifficultyTable';
import { HARMONY_DIFFICULTY_RANGE } from '../../utils/harmonyTable';

// ─── Difficulty Debug Panel ──────────────────────────────────────────────────

const formatScore = (n) => (typeof n === 'number' ? n.toFixed(2) : '–');

const DifficultyRow = ({ label, score, children }) => (
  <div className="dr-row">
    <div className="dr-header">
      <span className="dr-label">{label}</span>
      <span className="dr-score">{formatScore(score)}</span>
    </div>
    {children && <div className="dr-detail">{children}</div>}
  </div>
);

const norm01 = (score, min, max) => max > min ? Math.max(0, Math.min(1, (score - min) / (max - min))) : 0;

export const DifficultyPanel = ({ scale, trebleSettings, bassSettings, bpm, playbackConfig }) => {
  const d = calcDifficulty(scale, trebleSettings, bpm, playbackConfig);
  const { harmonic, song } = d;
  const trebleScore = calcTrebleDifficulty(trebleSettings);
  const harmNorm   = norm01(harmonic.score, HARMONY_DIFFICULTY_RANGE.min, HARMONY_DIFFICULTY_RANGE.max);
  const trebleNorm = norm01(trebleScore, MELODY_DIFFICULTY_RANGE.min, MELODY_DIFFICULTY_RANGE.max);
  const multiplier = harmNorm + trebleNorm;

  return (
    <div className="dp-panel">
      <div className="dp-header">
        <span className="dp-debug-label">Difficulty (debug)</span>
        <div className="dp-multiplier-group">
          <span className="dp-multiplier-text">multiplier <strong className="dp-multiplier-value">{formatScore(multiplier)}</strong></span>
        </div>
      </div>

      <DifficultyRow label="Harmonic" score={harmNorm}>
        raw: {formatScore(harmonic.score)} · tonic acc: {harmonic.breakdown.tonicAcc} · key acc: {harmonic.breakdown.keyAcc} · family: {harmonic.breakdown.family} · half steps: {harmonic.breakdown.halfSteps}
      </DifficultyRow>

      <DifficultyRow label="Treble" score={trebleNorm}>
        raw: {formatScore(trebleScore)}
      </DifficultyRow>

      <DifficultyRow label="Song" score={song.score}>
        bpm: {song.breakdown.bpm} ({formatScore(song.breakdown.bpmScore)})
      </DifficultyRow>
    </div>
  );
};

// ─── Custom Harmonic Difficulty Slider ───────────────────────────────────────

/**
 * Dual-indicator range slider.
 *   • Yellow disc  = target harmonic difficulty (draggable)
 *   • Blue line    = actual harmonic difficulty of the current scale
 */
export const HarmonicSlider = ({ min, max, target, actual, onChange, disabled }) => {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const targetPct = clamp((target - min) / (max - min)) * 100;
  const actualPct = clamp((actual - min) / (max - min)) * 100;
  const disabledClass = disabled ? ' disabled' : '';

  return (
    <div className="hs-container">
      <div className={`hs-track${disabledClass}`} />
      <div className={`hs-fill${disabledClass}`} style={{ width: `${targetPct}%` }} />
      <div className="hs-actual-line" style={{ left: `${actualPct}%` }} />
      <div className={`hs-thumb${disabledClass}`} style={{ left: `${targetPct}%` }} />
      <input
        type="range" min={min} max={max} step={0.5}
        value={target ?? min}
        onChange={onChange}
        disabled={disabled}
        className="hs-input"
      />
    </div>
  );
};
