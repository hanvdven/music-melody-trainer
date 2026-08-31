import { describe, it, expect } from 'vitest';
import { scaleKeyDisplayPC } from '../scaleKeyLabel';

// C major — the reference for the app's canonical black-key spelling (generateAllNotesArray:
// C D♭ D E♭ E F F♯ G A♭ A B♭ B — a MIX: F♯ is sharp, the rest flats).
const cMajor = {
    tonic: 'C4',
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
    displayNotes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
};

// A flat key (F major): the note between G and A is spelled A♭, and C stays C.
const fMajor = {
    tonic: 'F4',
    notes: ['F4', 'G4', 'A4', 'A♯4', 'C5', 'D5', 'E5'],
    displayNotes: ['F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5'],
};

// A sharp key (D major): the note between G and A is spelled G♯.
const dMajor = {
    tonic: 'D4',
    notes: ['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5'],
    displayNotes: ['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5'],
};

describe('scaleKeyDisplayPC', () => {
    it('uses the scale’s own spelling for in-scale notes', () => {
        expect(scaleKeyDisplayPC('A♯4', fMajor)).toBe('B♭');
        expect(scaleKeyDisplayPC('C5', fMajor)).toBe('C');
    });

    it('matches PianoView in C major: F♯ (not G♭), rest flats', () => {
        expect(scaleKeyDisplayPC('F♯4', cMajor)).toBe('F♯');
        expect(scaleKeyDisplayPC('D♭4', cMajor)).toBe('D♭');
        expect(scaleKeyDisplayPC('A♭4', cMajor)).toBe('A♭');
    });

    it('respells the canonical black key per key signature (flat leaves it, sharp flips it)', () => {
        expect(scaleKeyDisplayPC('A♭4', fMajor)).toBe('A♭');   // flat key: stays A♭
        expect(scaleKeyDisplayPC('A♭4', dMajor)).toBe('G♯');   // sharp key: → G♯
        expect(scaleKeyDisplayPC('F♯4', dMajor)).toBe('F♯');   // in-scale for D major
    });

    it('drops the octave and tolerates a missing scale', () => {
        expect(scaleKeyDisplayPC('C4', null)).toBe('C');
        expect(/\d/.test(scaleKeyDisplayPC('A♭4', dMajor))).toBe(false);
    });
});
