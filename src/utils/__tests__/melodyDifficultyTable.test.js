import { describe, it, expect } from 'vitest';
import { getRangeScore } from '../melodyDifficultyTable';

// getRangeScore for custom/vocal/relative ranges computes (semitones - 12) / 2 from the
// actual min/max. The semitone conversion now routes through the canonical getNoteSemitone
// (§6 invariant); these tests lock the corrected enharmonic behaviour that the old local
// _PC_ORDER/_ENHARMONICS table got wrong ('Db'→'E♭') or returned null for (C♭/F♭/E♯/B♯).
describe('getRangeScore enharmonic correctness', () => {
    const score = (min, max) => getRangeScore({ rangeMode: 'custom', range: { min, max } });

    it('scores a natural-boundary range by (semitones - 12) / 2', () => {
        // C4→C5 is exactly one octave (12 semitones) → 0.
        expect(score('C4', 'C5')).toBe(0);
        // C4→G5 = 19 semitones → (19 - 12) / 2 = 3.5.
        expect(score('C4', 'G5')).toBe(3.5);
    });

    it('treats D♭ as pitch-class 1 (C♯), not E♭ — the fixed bug', () => {
        // D♭4 = semitone 61, C6 = 84 → diff 23 → (23 - 12) / 2 = 5.5.
        // The old buggy table mapped D♭→E♭ (semitone 63), giving 4.5.
        expect(score('Db4', 'C6')).toBe(5.5);
    });

    it('handles C♭/F♭/E♯/B♯ that the old table returned null for', () => {
        // C♭4 resolves to pitch-class 11; F♯5 = 78, C♭4 = 71 → diff 7 → max(0,(7-12)/2)=0.
        expect(score('Cb4', 'F#5')).toBe(0);
        // E♯4 (pc 5 = F) → 65, E♯6 → 89 → diff 24 → (24-12)/2 = 6.
        expect(score('E#4', 'E#6')).toBe(6);
    });

    it('agrees on unicode and ASCII accidental spellings', () => {
        expect(score('D♭4', 'C6')).toBe(score('Db4', 'C6'));
    });
});
