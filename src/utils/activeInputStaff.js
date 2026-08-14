/**
 * Single source of truth for "which instrument channel is the player currently expected to play
 * on" — the app's INPUT MODE.
 *
 * This mapping used to live inline inside `useInputTest.handleToggleInputTest`. #990 (Han
 * 2026-08-14) needs the exact same answer in a second place (which channel the chorus effect
 * applies to: "chorus moet klinken op welk kanaal ook maar de input-mode van het huidige level
 * is — treble-level → treble, bass-level → bass, percussie-level → percussie ook"), so per
 * CLAUDE.md §6c it is derived from the existing logic here rather than duplicated with a second,
 * silently-drifting copy.
 *
 * The returned value is always one of the five `useInstruments` channel keys, so it can be fed
 * straight to `setVolume` / `setChorusStrength` as well as used as a melody-staff key.
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
