/**
 * Single source of truth for "which instrument channel is the player currently expected to play
 * on" — the app's INPUT MODE.
 *
 * This mapping used to live inline inside `useInputTest.handleToggleInputTest`; extracted here
 * (§6c: one source of truth, no duplicated/drifting copy) during #990 (Han 2026-08-14), which
 * briefly needed the same answer for a channel-wide chorus effect toggle. That approach was
 * superseded the same day by a per-note dedicated wrong-note instrument (see useInstruments.js's
 * `trebleWrongRef` / PianoView.jsx's `wrongNoteInstrument` prop) — this function's only current
 * caller is `useInputTest.js` itself again, its original purpose.
 *
 * The returned value is always one of the five `useInstruments` channel keys, and can be used as
 * a melody-staff key (`setVolume` and similar per-channel APIs).
 *
 * @param {string} activeTab   the app's active tab ('piano' | 'guitar' | 'percussion' | 'chords' | 'generator' | …)
 * @param {string} activeClef  the selected clef when the tab is a keyboard/fretboard ('treble' | 'bass')
 * @returns {'treble'|'bass'|'percussion'|'chords'}
 */
export function resolveActiveInputStaff(activeTab, activeClef) {
    if (activeTab === 'piano' || activeTab === 'guitar') return activeClef || 'treble';
    if (activeTab === 'percussion') return 'percussion';
    if (activeTab === 'chords' || activeTab === 'generator') return 'chords';
    return 'treble';
}

export default resolveActiveInputStaff;
