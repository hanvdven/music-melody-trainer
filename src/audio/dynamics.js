// #922/#924 (Han 2026-08-12, "maak alle muziek, en ook de tekst mf"): ONE shared "mezzo-forte" gain level
// (§6c — no second hand-picked volume constant) used by every RPG-world audio system that should read as a
// moderate, clearly-audible-but-not-maximum dynamic: the conversation typewriter, and the world's generated
// ambient music. Standard mf sits around MIDI velocity 76-84/127; expressed here as the 0-1 gain fraction
// `playSound`/`playMelodies` already take as their own volume parameter.
export const MF_VOLUME = 0.7;

// #992 (Han: 3 new Playback Settings setters — RPG fx volume / RPG music volume / RPG visibility): these
// are the OWN default step each of the two new volume setters is RELATIVE to (see rpgVolumeMultiplier
// below) — derived from the canonical VOL_STEPS dynamics table (§6c), not new hand-picked fractions.
// Deliberately match the pre-existing, already-tuned defaults of the paths each setter now sits on top
// of: LEVEL_BACKING_VOLUME (App.jsx) is mezzo-piano, and the ambient/level-cello paths already default to
// mezzo-forte territory — picking those SAME steps as this ticket's defaults means the day-one multiplier
// is exactly 1.0 (see rpgVolumeMultiplier), so nothing already-tuned changes sound/volume on ship.
import { VOL_STEPS } from '../components/sheet-music/overlays/SettingsOverlay';

export const DEFAULT_RPG_FX_VOLUME = VOL_STEPS.find((s) => s.label === 'mezzo piano').value;    // 0.6 (mp)
export const DEFAULT_RPG_MUSIC_VOLUME = VOL_STEPS.find((s) => s.label === 'mezzo forte').value; // 0.8 (mf)

/**
 * #992 — the multiplier semantics that make the 3 new RPG setters safe additions on top of 3 already-
 * tuned, UNRELATED existing volume paths: relative to the setting's OWN default step, not the raw 0-1
 * VOL_STEPS fraction. At `step === defaultStep` (the shipped default), this always returns exactly 1.0 —
 * i.e. every existing path sounds IDENTICAL to before this ticket until the player actually moves a
 * setter. Moving the setter away from its default scales proportionally (e.g. going from mp to f roughly
 * doubles the multiplier); moving to "silent" (0) mutes.
 * @param {number} step        the setter's currently-selected VOL_STEPS value (0-1)
 * @param {number} defaultStep the setter's own default VOL_STEPS value (DEFAULT_RPG_FX_VOLUME/
 *                              DEFAULT_RPG_MUSIC_VOLUME above) — never the raw 0-1 fraction of another path.
 * @returns {number} a multiplier to apply ON TOP of an existing path's own volume/gain value.
 */
export function rpgVolumeMultiplier(step, defaultStep) {
  if (!defaultStep) return 1; // defensive: a 0 default would make every ratio undefined/Infinity
  return step / defaultStep;
}
