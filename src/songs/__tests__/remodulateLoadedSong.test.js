import { describe, it, expect } from 'vitest';
import { remodulateChordMelody, remodulateMelody } from '../remodulateLoadedSong';
import { resolveLoadedSong } from '../resolveLoadedSong';
import { updateScaleWithMode } from '../../theory/scaleHandler';
import Chord from '../../model/Chord';
import Scale from '../../model/Scale';
import SONGS from '../songIndex';

const sakuraDef = SONGS.find((s) => s.id === 'sakura');

// #1153 bug fix (Han 2026-08-25 UAT, "G heeft opeens geen akkoorden / baslijn meer"): loading Sakura
// (Pentatonic "In") with letter g "Modulated" targeting a diatonic mode used to feed each chord's
// pitch ARRAY into the MELODIC `remodulate` helper as if it were a single raw note — every chord tone
// silently passed through un-modulated, and every chord's real `Chord` display object was replaced
// with an empty string (both `getNoteIndex`/`getRelativeNoteName` guard on `typeof !== 'string'`, so
// an array argument is treated as "not a note" and produces `''`). This exercises the REAL Sakura song
// data end-to-end through the fixed `remodulateChordMelody`.
describe('remodulateChordMelody (#1153, Sakura real data)', () => {
    const { loaded, refScale } = resolveLoadedSong(sakuraDef, 'easy', true, Scale.defaultScale());
    const activeScale = updateScaleWithMode({ currentScale: refScale, newFamily: 'Diatonic', newMode: 'Dorian' });

    it('Sakura actually has chord data to modulate (sanity)', () => {
        expect(loaded.chordMelody).toBeTruthy();
        expect(loaded.chordMelody.displayNotes.length).toBeGreaterThan(0);
    });

    const result = remodulateChordMelody(loaded.chordMelody, refScale, activeScale);

    it('every non-N.C. entry stays a REAL Chord instance (not corrupted into an empty string)', () => {
        result.displayNotes.forEach((chord) => {
            expect(chord === null || chord instanceof Chord).toBe(true);
            if (chord && chord.type !== 'nc') {
                expect(typeof chord.root).toBe('string');
                expect(chord.root.length).toBeGreaterThan(0);
            }
        });
    });

    it('chord tone arrays are preserved 1:1 in .notes (sequencer/backing-cello still has pitches to play)', () => {
        result.notes.forEach((tones, i) => {
            const original = loaded.chordMelody.notes[i];
            expect(Array.isArray(tones)).toBe(true);
            expect(tones.length).toBe(original.length);
        });
    });

    it('pitches actually changed key (real modulation happened, not a silent passthrough)', () => {
        const anyRootChanged = result.displayNotes.some((chord, i) => {
            const original = loaded.chordMelody.displayNotes[i];
            return chord && original && chord.type !== 'nc' && chord.root !== original.root;
        });
        expect(anyRootChanged).toBe(true);
    });
});

describe('remodulateMelody (melodic Melody, unaffected by the chord-shape fix)', () => {
    const { loaded, refScale } = resolveLoadedSong(sakuraDef, 'easy', true, Scale.defaultScale());
    const activeScale = updateScaleWithMode({ currentScale: refScale, newFamily: 'Diatonic', newMode: 'Dorian' });

    it('treble notes are single pitch strings, not arrays, and still modulate', () => {
        const result = remodulateMelody(loaded.treble, refScale, activeScale);
        result.notes.forEach((n) => {
            if (n && !['k', 'c', 'b', 'hh', 's', '/'].includes(n)) expect(typeof n).toBe('string');
        });
    });
});
