import { describe, it, expect } from 'vitest';
import { filterPercussionByEnabledPads } from '../generateBackbeat.js';

// The drum-pool filter is the single point where the range-selector's pad
// on/off choice influences generation. It must drop disabled pads while keeping
// the rhythm (offsets/durations) byte-for-byte intact: a fully-disabled slot
// becomes a rest, never a dropped slot.

const mel = () => ({
    notes: ['k', ['k', 'hh'], 's', 'r', ['cc', 'cr']],
    durations: [12, 12, 12, 12, 12],
    offsets: [0, 12, 24, 36, 48],
});

describe('filterPercussionByEnabledPads', () => {
    it('returns the melody unchanged when enabledPads is null (back-compat)', () => {
        expect(filterPercussionByEnabledPads(mel(), null).notes).toEqual(mel().notes);
    });

    it('drops disabled pads, collapsing emptied slots to rests', () => {
        const out = filterPercussionByEnabledPads(mel(), ['k', 'hh', 'cr']);
        // 'k' kept; ['k','hh'] kept both; 's' disabled → 'r'; 'r' stays;
        // ['cc','cr'] → only 'cr' survives → single string.
        expect(out.notes).toEqual(['k', ['k', 'hh'], 'r', 'r', 'cr']);
    });

    it('preserves offsets and durations exactly', () => {
        const out = filterPercussionByEnabledPads(mel(), ['k']);
        expect(out.durations).toEqual(mel().durations);
        expect(out.offsets).toEqual(mel().offsets);
        expect(out.notes).toEqual(['k', 'k', 'r', 'r', 'r']);
    });

    it('empty pool turns every pitched slot into a rest', () => {
        const out = filterPercussionByEnabledPads(mel(), []);
        // empty array is falsy-ish but Array.isArray true → filters everything out
        expect(out.notes).toEqual(['r', 'r', 'r', 'r', 'r']);
    });
});
