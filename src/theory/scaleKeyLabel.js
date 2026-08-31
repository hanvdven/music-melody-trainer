import { getRelativeNoteName } from './convertToDisplayNotes';

// Single source of truth for the scale-aware note letter shown on a piano key (CLAUDE.md §6c/§6d —
// WorldPiano must not hand-roll a second copy of PianoView's labelling). Given a physical note and the
// app's `scale` object, return the display PITCH CLASS spelled for the current key/mode:
//   - in-scale notes use the scale's own preferred spelling (`scale.displayNotes`), so e.g. the
//     black key between G and A shows "A♭" in a flat key and "G♯" in a sharp key;
//   - out-of-scale notes (a chromatic key the current mode doesn't use) fall back to the
//     tonic-relative spelling, the same fallback PianoView.getNoteLabel uses.
// `scale` shape: { notes: string[] (chromatic PCs in the window, may carry octaves),
//                  displayNotes: string[] (preferred spelling, index-aligned to `notes`),
//                  tonic: string }.
export function scaleKeyDisplayPC(note, scale) {
    const notePC = String(note).replace(/-?\d+$/, '');
    if (scale && Array.isArray(scale.notes) && Array.isArray(scale.displayNotes)) {
        const idx = scale.notes.findIndex((s) => String(s).replace(/-?\d+$/, '') === notePC);
        if (idx !== -1 && scale.displayNotes[idx]) {
            return String(scale.displayNotes[idx]).replace(/-?\d+$/, '');
        }
    }
    return getRelativeNoteName(String(note), scale?.tonic || 'C4').replace(/-?\d+$/, '');
}
