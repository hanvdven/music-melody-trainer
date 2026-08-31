import { describe, it, expect } from 'vitest';
import { generateBlockedSongTreble } from '../generateBlockedSongTreble';
import { resolveLoadedSong } from '../../songs/resolveLoadedSong';
import InstrumentSettings from '../../model/InstrumentSettings';
import Scale from '../../model/Scale';
import { TICKS_PER_WHOLE } from '../../constants/timing';
import SONGS from '../../songs/songIndex';

const sakuraDef = SONGS.find((s) => s.id === 'sakura');

// #1154 bug fix (Han 2026-08-25 UAT, "H: er wordt alleen in de eerste paar maten melodie
// gegenereerd"): a single MelodyGenerator call spanning Sakura's whole 14 measures only produced
// notes for the first few — this exercises the block-based replacement against Sakura's REAL 14-measure
// length/chords/generator settings and asserts notes actually reach the LAST measures, not just the
// first block.
describe('generateBlockedSongTreble (#1154, Sakura real data — 14 measures, not divisible by 4)', () => {
    const { loaded, refScale } = resolveLoadedSong(sakuraDef, 'easy', true, Scale.defaultScale());
    const settings = { ...InstrumentSettings.defaultTrebleInstrumentSettings(), ...loaded.generator.trebleSettings };
    const measureLengthTicks = (TICKS_PER_WHOLE * loaded.timeSignature[0]) / loaded.timeSignature[1];

    it('sanity: Sakura is 14 measures — divisible by 2, not by 4 (exercises the "or 2" fallback)', () => {
        expect(loaded.numMeasures).toBe(14);
        expect(loaded.numMeasures % 4).not.toBe(0);
        expect(loaded.numMeasures % 2).toBe(0);
    });

    const result = generateBlockedSongTreble(
        refScale, loaded.numMeasures, loaded.timeSignature, settings, loaded.chordMelody, 'test-h',
    );

    it('produces at least one real (non-rest) note in the FINAL block, not just the first few measures', () => {
        const lastBlockStartTick = (loaded.numMeasures - 2) * measureLengthTicks;
        const notesInLastBlock = result.offsets
            .map((o, i) => ({ o, note: result.notes[i] }))
            .filter(({ o }) => o != null && o >= lastBlockStartTick);
        expect(notesInLastBlock.length).toBeGreaterThan(0);
        expect(notesInLastBlock.some(({ note }) => note && note !== 'r')).toBe(true);
    });

    it('every offset stays within the song\'s total duration (blocks correctly re-offset, no overlap/overrun)', () => {
        const totalTicks = loaded.numMeasures * measureLengthTicks;
        result.offsets.forEach((o) => {
            if (o != null) {
                expect(o).toBeGreaterThanOrEqual(0);
                expect(o).toBeLessThan(totalTicks);
            }
        });
    });

    it('notes/durations/offsets/displayNotes all stay the same length (no field left out of concatenation)', () => {
        expect(result.durations.length).toBe(result.notes.length);
        expect(result.offsets.length).toBe(result.notes.length);
        expect(result.displayNotes.length).toBe(result.notes.length);
    });
});
