// Default values for melody/playback generator settings.
// Used by App.jsx initial state, Sequencer, useMelodyState, and melodyGenerator.

// Sixteenth-note grid resolution used throughout the generation pipeline.
// MelodyGenerator downsamples from this global grid to the local smallestNoteDenom.
// Changing this value requires updating all rhythm-slot arithmetic.
export const GLOBAL_RESOLUTION = 16;

export const DEFAULT_BPM          = 120;
export const DEFAULT_TIME_SIG     = [4, 4];
export const DEFAULT_NUM_MEASURES = 2;
export const DEFAULT_SCALE_TONIC  = 'C4';
export const DEFAULT_SCALE_MODE   = 'Major';

// Volume step values rendered as the volume picker in InstrumentRow.
export const VOLUME_LEVELS = [1.0, 0.8, 0.6, 0.4, 0.2, 0.0];
