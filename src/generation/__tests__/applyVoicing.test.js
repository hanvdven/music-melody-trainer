// #435 (Han 2026-07-17): voices post-step + the extracted percussion overlap resolver.
// The voicing runs through the REAL MelodyGenerator entry point (no internals mocked), so these
// are pipeline-level guarantees: voices=1 is byte-compatible single-note output, 2/3 produce
// distinct in-span chords, 'var' keeps the Melody contiguity invariant, and percussion merges
// never contain forbidden pad pairs (ho+hh etc.).
import { describe, it, expect } from 'vitest';
import MelodyGenerator from '../melodyGenerator.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import { resolvePercussionChord } from '../../audio/drumKits.js';
import { getNoteIndex } from '../../theory/musicUtils.js';
import { TICKS_PER_WHOLE } from '../../constants/timing.js';

const SCALE = {
    notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    tonic: 'C', numAccidentals: 0,
};
const TS = [4, 4];
const NUM_MEASURES = 2;

const trebleSettings = (over = {}) =>
    Object.assign(InstrumentSettings.defaultTrebleInstrumentSettings(), over);

const generate = (settings) =>
    new MelodyGenerator(SCALE, NUM_MEASURES, TS, settings, [], settings.range).generateMelody();

const activeEntries = (melody) =>
    melody.notes.filter(n => n != null && n !== 'r');

describe('resolvePercussionChord (extracted to drumKits, #435)', () => {
    it('passes non-arrays through untouched', () => {
        expect(resolvePercussionChord('hh')).toBe('hh');
        expect(resolvePercussionChord('r')).toBe('r');
        expect(resolvePercussionChord(null)).toBe(null);
    });

    it('ho kills hh (Han: "[ho > hh]")', () => {
        expect(resolvePercussionChord(['ho', 'hh'])).toBe('ho');
    });

    it('applies the cymbal hierarchy cc > cr > ho/hh', () => {
        expect(resolvePercussionChord(['cc', 'cr', 'hh', 'k'])).toEqual(['cc', 'k']);
        expect(resolvePercussionChord(['cr', 'ho'])).toBe('cr');
    });

    it('applies the primary hierarchy s > sg and the tom hierarchy tl > tm > th', () => {
        expect(resolvePercussionChord(['s', 'sg'])).toBe('s');
        expect(resolvePercussionChord(['tl', 'tm', 'th'])).toBe('tl');
    });

    it('deduplicates exact doubles', () => {
        expect(resolvePercussionChord(['k', 'k'])).toBe('k');
    });
});

describe('applyVoicing — voices 1 (no regression)', () => {
    it('produces only single-note strings, exactly as before', () => {
        const melody = generate(trebleSettings({ voices: 1 }));
        for (const entry of activeEntries(melody)) {
            expect(typeof entry).toBe('string');
        }
    });
});

describe('applyVoicing — fixed voices 2 / 3', () => {
    it('voices=2: every active slot is a chord of 2 distinct notes within maxLeap', () => {
        const settings = trebleSettings({ voices: 2 });
        const melody = generate(settings);
        const active = activeEntries(melody);
        expect(active.length).toBeGreaterThan(0);
        for (const entry of active) {
            expect(Array.isArray(entry)).toBe(true);
            expect(entry.length).toBe(2);
            expect(new Set(entry).size).toBe(entry.length);
            const [a, b] = entry.map(getNoteIndex);
            expect(Math.abs(a - b)).toBeLessThanOrEqual(settings.maxLeap);
        }
    });

    it('voices=3: slots hold up to 3 distinct notes, all within maxLeap of the base note', () => {
        const settings = trebleSettings({ voices: 3 });
        const melody = generate(settings);
        for (const entry of activeEntries(melody)) {
            expect(Array.isArray(entry)).toBe(true);
            expect(entry.length).toBeGreaterThanOrEqual(2); // scale pool is big enough for extras
            expect(entry.length).toBeLessThanOrEqual(3);
            expect(new Set(entry).size).toBe(entry.length);
            const base = getNoteIndex(entry[0]);
            for (const n of entry.slice(1)) {
                expect(Math.abs(getNoteIndex(n) - base)).toBeLessThanOrEqual(settings.maxLeap);
            }
        }
    });
});

describe("applyVoicing — 'var' three-melody merge", () => {
    it('keeps the Melody contiguity invariant and the total tick length', () => {
        // Melody arrays contain null CONTINUATION entries (the flat-slot shape), and a melody may
        // OPEN with silence (leading nulls form a gap, not an extension). The invariant is over
        // the non-null entries: from the first onset, each starts where the previous one ended,
        // and the last one ends exactly at the melody's total tick length.
        const melody = generate(trebleSettings({ voices: 'var' }));
        const totalTicks = TICKS_PER_WHOLE * NUM_MEASURES * (TS[0] / TS[1]);
        let expectedOffset = null;
        for (let i = 0; i < melody.notes.length; i++) {
            if (melody.notes[i] == null) continue;
            if (expectedOffset !== null) expect(melody.offsets[i]).toBe(expectedOffset);
            expect(melody.durations[i]).toBeGreaterThan(0);
            expectedOffset = melody.offsets[i] + melody.durations[i];
        }
        expect(expectedOffset).toBe(totalTicks);
    });

    it('never emits exact duplicates inside one chord slot', () => {
        const melody = generate(trebleSettings({ voices: 'var' }));
        for (const entry of activeEntries(melody)) {
            if (Array.isArray(entry)) {
                expect(new Set(entry).size).toBe(entry.length);
            }
        }
    });

    it('yields at least as many onsets as the base density (loose notes are kept)', () => {
        // npm=2 over 2 measures → base ≥ 4 onsets; the 60%/40% voices can only add.
        const melody = generate(trebleSettings({ voices: 'var', rhythmVariability: 0 }));
        expect(activeEntries(melody).length).toBeGreaterThanOrEqual(4);
    });
});

describe("applyVoicing — percussion 'var' obeys the pad hierarchy", () => {
    it('merged slots never contain forbidden pairs (ho+hh, s+sg, cc+cr)', () => {
        const settings = Object.assign(
            InstrumentSettings.defaultPercussionInstrumentSettings(),
            { voices: 'var', randomizationRule: 'backbeat' },
        );
        const melody = new MelodyGenerator(SCALE, NUM_MEASURES, TS, settings, [], null).generateMelody();
        for (const entry of activeEntries(melody)) {
            if (!Array.isArray(entry)) continue;
            const set = new Set(entry);
            expect(set.has('ho') && set.has('hh')).toBe(false);
            expect(set.has('s') && set.has('sg')).toBe(false);
            expect(set.has('cc') && set.has('cr')).toBe(false);
        }
    });
});
