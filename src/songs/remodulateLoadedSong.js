import { modulateMelody } from '../theory/musicUtils';
import { getRelativeNoteName } from '../theory/convertToDisplayNotes';
import { stripOctave } from '../theory/noteUtils';
import Melody from '../model/Melody';
import Chord from '../model/Chord';

/**
 * Pure re-pitching half of App.jsx's `handleLoadSong` #1153 ("Modulated" / letter g) path — extracted
 * per the SAME rationale as `resolveLoadedSong.js` (ARCHITECTURE_AUDIT.md §4): a testable module beats
 * an inline closure, especially for logic that already caused one real regression (see
 * `remodulateChordMelody` below).
 *
 * Re-pitches one loaded MELODIC Melody's notes from refScale into activeScale, rebuilding display
 * names the same way the app's own manual scale-change effect does — one source of truth for "how to
 * reconstruct display names after modulation". Only valid for a Melody whose `.notes[i]` are single
 * pitch STRINGS (treble/bass) — NOT a chord-shaped Melody, see `remodulateChordMelody`.
 */
export function remodulateMelody(melody, refScale, activeScale) {
    if (!melody) return melody;
    const newNotes = modulateMelody(melody.notes, refScale, activeScale);
    const newDisplay = newNotes.map((n) => {
        if (!n || ['k', 'c', 'b', 'hh', 's', '/'].includes(n)) return n;
        const idx = activeScale.notes.indexOf(n);
        return idx !== -1 ? activeScale.displayNotes[idx] : getRelativeNoteName(n, activeScale.tonic);
    });
    return new Melody(newNotes, melody.durations, melody.offsets, newDisplay);
}

/**
 * Bug fix (Han 2026-08-25 UAT, "G heeft opeens geen akkoorden / baslijn meer"): `remodulateMelody`
 * above assumes a MELODIC Melody — `.notes[i]` a single pitch STRING, `.displayNotes[i]` a single
 * display STRING. A song's `chordMelody` (loadSong.js) has a different shape entirely: `.notes[i]` is
 * an ARRAY of chord-tone pitches, `.displayNotes[i]` is a `Chord` OBJECT (root/type/notes/name — read
 * by ChordLabelsLayer, chordLabelHandler, and the level's own backing-cello generator following chord
 * roots). Running `remodulateMelody` on it fed each chord's pitch ARRAY into `modulateMelody` as if it
 * were one raw note — `getNoteIndex`'s `typeof !== 'string'` guard silently passed every chord tone
 * through UN-modulated — and into `getRelativeNoteName` for `displayNotes`, which has the same guard
 * and returns `''` for every chord. The chord progression's pitches never actually changed key AND its
 * real `Chord` objects were replaced with empty strings, so every downstream reader of
 * `.displayNotes[i].root` / `.type` / `.notes` had nothing to read — exactly "no chords, no bassline"
 * (the level's backing cello follows chord roots).
 *
 * Modulates each chord's root + tones individually through the SAME `modulateMelody` (already proven
 * correct for cross-shape sources like Sakura's "In" pentatonic, §309/§310/#1158) and rebuilds a REAL
 * `Chord` object per entry, using the same root/name-rewrite pattern `Chord.transpose()`/loadSong.js
 * already use. Deliberately NOT `Chord.transposeToScale` (index-position-in-scale-array mapping,
 * model/Chord.js) — that's only valid when the old/new scale's `.notes` arrays are the same length,
 * false here (Pentatonic 6 vs Diatonic 8 entries).
 */
export function remodulateChordMelody(chordMelody, refScale, activeScale) {
    if (!chordMelody) return chordMelody;
    const newDisplayNotes = (chordMelody.displayNotes || []).map((chord) => {
        if (!chord || chord.type === 'nc' || !chord.root) return chord;
        const newRoot = modulateMelody([chord.root], refScale, activeScale)[0];
        const newNotes = modulateMelody(chord.notes, refScale, activeScale);
        const oldRootPC = stripOctave(chord.root);
        const newRootPC = stripOctave(newRoot);
        const newName = chord.name && chord.name.includes(oldRootPC)
            ? chord.name.replace(oldRootPC, newRootPC)
            : chord.name;
        return new Chord(
            newRoot, chord.type, newNotes, newName, newRootPC,
            chord.internalSuffix, chord.roman, [...chord.intervals], [...chord.structure], { ...chord.meta },
        );
    });
    const newNotes = (chordMelody.notes || []).map((notes, i) => newDisplayNotes[i]?.notes ?? notes);
    return new Melody(newNotes, chordMelody.durations, chordMelody.offsets, newDisplayNotes);
}
