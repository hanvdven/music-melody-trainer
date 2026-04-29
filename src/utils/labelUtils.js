/**
 * Centralized utility for converting randomization rules and play style constants
 * into human-readable labels for the UI.
 */

// Re-export from the single source of truth so callers don't need to change imports.
export { getProgressionLabel } from '../theory/progressionDefinitions.js';

/**
 * Labels for the source of notes (e.g. Treble/Bass rules)
 */
export const getNoteSourceLabel = (val) => {
    const mappings = {
        'root': 'Root',
        'chord': 'Chord',
        'scale': 'Scale',
        'chromatic': 'Chromatic',
        'claves': 'Claves',
        'kick_snare': 'Kick/Snare',
        'all': 'All Perc.',
    };
    return mappings[val] || val;
};

/**
 * Labels for the playback/rhythmical rules
 */
export const getPlayStyleLabel = (val) => {
    const mappings = {
        'uniform': 'Uniform',
        'emphasize_roots': 'Roots',
        'weighted': 'Weighted',
        'balanced': 'Balanced',
        'arp_up': 'Arp Up',
        'arp_down': 'Arp Down',
        'arp': 'Arp (Bounce)',
        'scale-up': 'Scale \u2197',
        'scale': 'Scale',
        'scale-down': 'Scale \u2198',
        'scale-up-down': 'Scale \u2197 \u2198',
        'backbeat': 'Backbeat',
        'swing': 'Jazz Swing',
        'pairedchord': 'Duo Chord',
        'fullchord': 'Full Chord',
        'fixed': 'Fixed',
    };
    return mappings[val] || val;
};

