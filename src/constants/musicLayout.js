// Preset note ranges used by the clef picker and Sequencer range logic.
// Single source of truth — was duplicated in Sequencer.js and SheetMusic.jsx.
export const PRESET_RANGES = {
  STANDARD: { treble: { min: 'C4', max: 'E5' }, bass: { min: 'A2', max: 'C4' } },
  LARGE:    { treble: { min: 'C4', max: 'G5' }, bass: { min: 'G2', max: 'C4' } },
  FULL:     { treble: { min: 'A3', max: 'C6' }, bass: { min: 'C2', max: 'E4' } },
};

// Sheet-music layout constants used when computing idealVisibleMeasures.
export const APPROX_HEADER_WIDTH   = 70;  // px reserved for clef/key/time-sig
export const APPROX_PX_PER_MEASURE = 120; // approximate px per measure at default zoom

// CSS grid-template-columns strings shared between InstrumentRow and PlaybackSettings.
export const GRID_GENERATOR  = '12% 18% 12% 22% 12% 12% 12%';
export const GRID_VISIBILITY = '12% 22% 22% 22% 22%';
