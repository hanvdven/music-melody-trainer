/**
 * Built-in instrument range presets shared between Sequencer, RangeControls,
 * and the SheetMusic clef picker. Single source of truth — do NOT redefine inline.
 */
export const PRESET_RANGES = {
    STANDARD: { treble: { min: 'C4', max: 'E5' }, bass: { min: 'A2', max: 'C4' } },
    LARGE:    { treble: { min: 'C4', max: 'G5' }, bass: { min: 'G2', max: 'C4' } },
    FULL:     { treble: { min: 'A3', max: 'C6' }, bass: { min: 'C2', max: 'E4' } },
};
