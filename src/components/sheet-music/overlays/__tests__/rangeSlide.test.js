import { describe, it, expect } from 'vitest';
import { nextNaturalToward, nextNaturalInDir, classifyStep } from '../rangeSlide';
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
