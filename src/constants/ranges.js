/**
 * Built-in instrument range presets shared between Sequencer, RangeControls,
 * and the SheetMusic clef picker. Single source of truth — do NOT redefine inline.
 */
export const PRESET_RANGES = {
    STANDARD: { treble: { min: 'C4', max: 'E5' }, bass: { min: 'A2', max: 'C4' } },
    // LARGE widened (Han 2026-06-01): treble C4–A5, bass E2–C4.
    LARGE:    { treble: { min: 'C4', max: 'A5' }, bass: { min: 'E2', max: 'C4' } },
    FULL:     { treble: { min: 'A3', max: 'C6' }, bass: { min: 'C2', max: 'E4' } },
};
