import { describe, it, expect } from 'vitest';
import { resolveLoadedSong } from '../resolveLoadedSong';

// Minimal constructible song definition. Only the fields resolveLoadedSong /
// loadSong actually read are present. A single-note treble track in C major,
// 4/4, written in C so transposition math is easy to reason about.
const songDef = {
    id: 'test-song',
    title: 'Test Song',
    defaultTonic: 'C',
    defaultTempo: 100,
    timeSignature: [4, 4],
    numMeasures: 1,
    generator: { scaleMode: 'Major', scaleFamily: 'diatonic' },
    difficulties: {
        easy: {
            treble: { notes: ['C4'], durations: [48], offsets: [0] },
        },
    },
};

describe('resolveLoadedSong (pure resolver)', () => {
    it('with scale=null and useOriginalTonic=false: targetTonic null, no tonicToSet, no shift', () => {
        const { targetTonic, loaded, refScale, tonicToSet } =
            resolveLoadedSong(songDef, 'easy', false, null);
        // currentTonic is null (no scale) → not equal to 'C' would normally set targetTonic,
        // but loadSong with targetTonic===null applies zero shift and loads the written key.
        expect(targetTonic).toBe(null);
        expect(tonicToSet).toBe(null);
        expect(refScale).toBe(null); // refScale derivation is skipped when scale is null
        expect(loaded.shift).toBe(0);
        expect(loaded.treble.notes).toEqual(['C4']); // unchanged from written key
    });

    it('useOriginalTonic=true with no current tonic reports tonicToSet (octave-suffixed)', () => {
        // currentTonic null (scale=null) differs from the song default 'C' → App must
        // setTonic to the song key. scale=null keeps refScale derivation out of the way so
        // this test exercises only the tonicToSet decision (no real Scale object needed).
        const { targetTonic, tonicToSet } = resolveLoadedSong(songDef, 'easy', true, null);
        // Written-key load: targetTonic stays null; App is told to set the app tonic to C4.
        expect(targetTonic).toBe(null);
        expect(tonicToSet).toBe('C4');
    });

    it('useOriginalTonic=true with the SAME current tonic does not set the tonic', () => {
        // A C-tonic scale matching the song default → no setTonic needed. Only .tonic is read
        // for currentTonic, and refScale derivation no-ops (stripOctave('C4')==='C').
        const scale = { tonic: 'C4', name: 'Major', family: 'diatonic' };
        const { tonicToSet } = resolveLoadedSong(songDef, 'easy', true, scale);
        expect(tonicToSet).toBe(null);
    });

    it('useOriginalTonic=false transposes the song to the current app tonic', () => {
        // Current app tonic G; song written in C. effectiveTonic 'G' matches the scale tonic
        // and mode/family match, so refScale derivation no-ops (no scaleHandler call) — keeping
        // the test free of a real Scale object while still exercising the transpose shift.
        const scale = { tonic: 'G4', name: 'Major', family: 'diatonic' };
        const { targetTonic, tonicToSet, loaded } = resolveLoadedSong(songDef, 'easy', false, scale);
        expect(targetTonic).toBe('G');
        expect(tonicToSet).toBe(null); // setTonic is only used in the useOriginalTonic branch
        // C → G is +7 semitones, clamped to the shortest path (-5). C4 - 5 semitones = G3.
        expect(loaded.shift).toBe(-5);
        expect(loaded.treble.notes).toEqual(['G3']);
    });

    it('exposes the song scale mode + numeric defaults on loaded', () => {
        const { loaded } = resolveLoadedSong(songDef, 'easy', false, null);
        expect(loaded.scaleMode).toBe('Major');
        expect(loaded.timeSignature).toEqual([4, 4]);
        expect(loaded.numMeasures).toBe(1);
        expect(loaded.defaultTempo).toBe(100);
    });
});
