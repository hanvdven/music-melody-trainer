import { describe, it, expect } from 'vitest';
import { nextNaturalToward, nextNaturalInDir, classifyStep, easeOutCubic } from '../rangeSlide';
import { naturalsInRange } from '../../../../utils/rangeUtils';

const NAT = naturalsInRange(21, 108); // A0..C8 white keys

const midi = (name) => NAT.find(n => n.name === name).midi;

describe('nextNaturalToward', () => {
    it('steps one natural up toward a higher target', () => {
        expect(nextNaturalToward(NAT, midi('C4'), midi('G4'))).toBe(midi('D4'));
    });
    it('steps one natural down toward a lower target', () => {
        expect(nextNaturalToward(NAT, midi('C4'), midi('F3'))).toBe(midi('B3'));
    });
    it('returns null at the target', () => {
        expect(nextNaturalToward(NAT, midi('C4'), midi('C4'))).toBeNull();
    });
    it('returns null at the piano edge', () => {
        // C8 (108) is the last natural; target above the keyboard → no next note.
        expect(nextNaturalToward(NAT, midi('C8'), 200)).toBeNull();
    });
});

describe('nextNaturalInDir', () => {
    it('extends outward up and down', () => {
        expect(nextNaturalInDir(NAT, midi('C4'), 1)).toBe(midi('D4'));
        expect(nextNaturalInDir(NAT, midi('C4'), -1)).toBe(midi('B3'));
    });
    it('stops at the piano edges', () => {
        expect(nextNaturalInDir(NAT, midi('A0'), -1)).toBeNull();
        expect(nextNaturalInDir(NAT, midi('C8'), 1)).toBeNull();
    });
});

describe('classifyStep', () => {
    it('extend-right reveals one note on the right, left anchored', () => {
        expect(classifyStep({ loIdx: 10, hiIdx: 20 }, { loIdx: 10, hiIdx: 21 }))
            .toEqual({ kind: 'enter', edgeIdx: 21, anchor: 'left', dir: 1 });
    });
    it('extend-left reveals one note on the left, right anchored', () => {
        expect(classifyStep({ loIdx: 10, hiIdx: 20 }, { loIdx: 9, hiIdx: 20 }))
            .toEqual({ kind: 'enter', edgeIdx: 9, anchor: 'right', dir: -1 });
    });
    it('shrink-right hides the old right note, left anchored', () => {
        expect(classifyStep({ loIdx: 10, hiIdx: 20 }, { loIdx: 10, hiIdx: 19 }))
            .toEqual({ kind: 'leave', edgeIdx: 20, anchor: 'left', dir: 1 });
    });
    it('shrink-left hides the old left note, right anchored', () => {
        expect(classifyStep({ loIdx: 10, hiIdx: 20 }, { loIdx: 11, hiIdx: 20 }))
            .toEqual({ kind: 'leave', edgeIdx: 10, anchor: 'right', dir: -1 });
    });
    it('multi-note jumps and no-ops are not single steps', () => {
        expect(classifyStep({ loIdx: 10, hiIdx: 20 }, { loIdx: 10, hiIdx: 22 }).kind).toBe('none');
        expect(classifyStep({ loIdx: 10, hiIdx: 20 }, { loIdx: 8, hiIdx: 25 }).kind).toBe('none');
        expect(classifyStep({ loIdx: 10, hiIdx: 20 }, { loIdx: 10, hiIdx: 20 }).kind).toBe('none');
        expect(classifyStep(null, { loIdx: 10, hiIdx: 20 }).kind).toBe('none');
    });
});

// easeOutCubic drives BOTH the transposition carousel and the range-setter cascade
// (Han 2026-06-18): the range overlay imports it so the two animations share one easing
// curve and can't drift. Smoke-test the endpoints + monotonic decel shape.
describe('easeOutCubic', () => {
    it('pins the endpoints', () => {
        expect(easeOutCubic(0)).toBe(0);
        expect(easeOutCubic(1)).toBe(1);
    });
    it('is an ease-OUT (fast start, slow finish) — past halfway by t=0.5', () => {
        // 1 − (1−0.5)³ = 0.875 → most of the distance is covered in the first half.
        expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
        expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    });
    it('is monotonically increasing across the unit interval', () => {
        let prev = -Infinity;
        for (let t = 0; t <= 1.0001; t += 0.1) {
            const v = easeOutCubic(t);
            expect(v).toBeGreaterThanOrEqual(prev);
            prev = v;
        }
    });
});
