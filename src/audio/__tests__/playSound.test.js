import { describe, it, expect, vi } from 'vitest';
import { resolveNotePitch, resolvePercussionPitch } from '../playSound';

// #1091 round 3 (Han 2026-08-19): resolvePercussionPitch must be a safe drop-in for resolveNotePitch —
// identical results (gainMultiplier always 1) for every case that ISN'T an array-valued percussion pad
// mapping, since resolveNotePitch has several unrelated melodic-only callers (PianoView, ChordGrid,
// App.jsx, useDebugMetronome) that must never be affected by this change.
describe('resolvePercussionPitch (#1091)', () => {
    it('matches resolveNotePitch exactly for a melodic piano note (gainMultiplier 1)', () => {
        const { pitch, gainMultiplier } = resolvePercussionPitch('C4', null, 100);
        expect(pitch).toBe(resolveNotePitch('C4', null));
        expect(gainMultiplier).toBe(1);
    });

    it('matches resolveNotePitch exactly for a scalar (non-array) percussion mapping', () => {
        const { pitch, gainMultiplier } = resolvePercussionPitch('wh', null, 100);
        expect(pitch).toBe(resolveNotePitch('wh', null));
        expect(gainMultiplier).toBe(1);
    });

    it('returns null pitch for a rest, same as resolveNotePitch', () => {
        expect(resolvePercussionPitch('r', null, 100).pitch).toBeNull();
    });

    it('humanizes an array-valued custom mapping instead of a flat uniform pick', () => {
        vi.spyOn(Math, 'random').mockReturnValue(1); // max +15 offset -> louder sample, gain < 1
        const customMapping = { hh: ['soft', 'mid', 'loud'] };
        const { pitch, gainMultiplier } = resolvePercussionPitch('hh', customMapping, 63);
        expect(customMapping.hh).toContain(pitch);
        expect(gainMultiplier).toBeLessThan(1);
        vi.restoreAllMocks();
    });

    it('falls back to a plain random pick (gainMultiplier 1) when no velocity is passed', () => {
        const customMapping = { hh: ['soft', 'mid', 'loud'] };
        const { pitch, gainMultiplier } = resolvePercussionPitch('hh', customMapping, null);
        expect(customMapping.hh).toContain(pitch);
        expect(gainMultiplier).toBe(1);
    });
});
