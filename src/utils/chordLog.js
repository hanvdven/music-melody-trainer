/**
 * chordLog.js
 * Persistent log for unrecognized and TBD chords, backed by localStorage.
 * Entries are deduplicated by root + intervals signature.
 */

const STORAGE_KEY = 'melody_trainer_chord_log';

const load = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

const save = (entries) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // quota exceeded or private mode — silently ignore
    }
};

const signature = (entry) =>
    `${entry.root}|${JSON.stringify(entry.intervals)}|${entry.notation}`;

/**
 * Log a chord that could not be fully recognized.
 * @param {'unrecognized'|'TBD'} kind
 * @param {object} data  - { root, intervals, structure, romanBase, scaleInfo, notation }
 */
export const logChord = (kind, data) => {
    const entry = {
        kind,
        root: data.root,
        intervals: data.intervals,
        structure: data.structure ?? null,
        romanBase: data.romanBase,
        scaleInfo: data.scaleInfo ?? 'Unknown',
        notation: data.notation,
        timestamp: new Date().toISOString(),
    };

    const entries = load();
    const isDuplicate = entries.some(e => signature(e) === signature(entry));
    if (!isDuplicate) {
        entries.push(entry);
        save(entries);
        console.warn(`[chordLog] ${kind} chord:`, entry);
    }
};

/** Return all logged entries. */
export const getChordLog = () => load();

/** Clear the log. */
export const clearChordLog = () => {
    localStorage.removeItem(STORAGE_KEY);
};

/**
 * Download the current log as a JSON file.
 * Call from a button or browser console: import { downloadChordLog } from './utils/chordLog.js'
 */
export const downloadChordLog = () => {
    const entries = load();
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chord_log_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// Also expose on window for quick console access
if (typeof window !== 'undefined') {
    window.chordLog = { get: getChordLog, clear: clearChordLog, download: downloadChordLog };
}
