import { describe, it, expect } from 'vitest';
import MelodyGenerator from '../melodyGenerator.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import Scale from '../../model/Scale.js';

/**
 * GOLDEN — guards the Level 1/2 "elke kwartnoot is een kwartnoot of een rust" invariant
 * (Han 2026-08-02, replacing the retired `forceQuarterNotes.js` post-process).
 *
 * ROOT CAUSE this guards against: with `insertBeatRests` off (the treble default), an inactive
 * quarter-slot silently EXTENDS the duration of the preceding note instead of becoming an explicit
 * rest — and `Melody.fromFlattenedNotes`'s leading-rest special case additionally represents a
 * piece-opening rest with a NULL offset (invisible: no note, no rest, nothing rendered). Setting
 * `smallestNoteDenom: 4` (caps slot resolution at a beat) + `insertBeatRests: true` (every empty
 * on-beat slot becomes an explicit 'r' BEFORE the merge step ever runs) + `polyMultiplier: 1` (no
 * tuplet injection) together guarantee every slot is exactly one quarter long, real note or rest,
 * offset contiguous from 0 — no gaps, no null-offset entries, no ties needed (see levels.js
 * `QUARTER_GRID` for the full mechanism writeup).
 */
describe('quarter-grid generator settings (Levels 1/2, §6c: generator-level, not a post-process)', () => {
    it('produces a gapless one-quarter-per-slot melody across many trials — no gaps, no null entries', () => {
        const NUM = 8, TRIALS = 200, MEASURE_TICKS = 48, TOTAL_TICKS = NUM * MEASURE_TICKS, QUARTER = 12;
        for (let t = 0; t < TRIALS; t++) {
            const scale = Scale.defaultScale();
            const settings = InstrumentSettings.defaultTrebleInstrumentSettings();
            settings.notesPerMeasure = 3;
            settings.rhythmVariability = 30;
            settings.smallestNoteDenom = 4;
            settings.insertBeatRests = true;
            settings.polyMultiplier = 1;
            settings.range = { min: 'C4', max: 'G4' };
            const triad = { root: scale.notes[0], notes: [scale.notes[0], scale.notes[2], scale.notes[4]] };
            const chords = Array.from({ length: NUM }, () => triad);
            const melody = new MelodyGenerator(scale, NUM, [4, 4], settings, chords, settings.range).generateMelody();

            const events = melody.offsets
                .map((off, i) => ({ off, dur: melody.durations[i], note: melody.notes[i] }))
                .filter((e) => e.off != null)
                .sort((a, b) => a.off - b.off);

            expect(events.length, `trial ${t}: expected exactly ${TOTAL_TICKS / QUARTER} quarter events`).toBe(TOTAL_TICKS / QUARTER);
            let cursor = 0;
            for (const e of events) {
                expect(e.off, `trial ${t}: gap before offset ${e.off}`).toBe(cursor);
                expect(e.dur, `trial ${t}: entry at ${e.off} is not exactly one quarter`).toBe(QUARTER);
                expect(e.note === 'r' || e.note != null, `trial ${t}: null note at a real offset`).toBe(true);
                cursor += e.dur;
            }
            expect(cursor).toBe(TOTAL_TICKS);
            expect(melody.offsets.some((o) => o == null), `trial ${t}: found a null-offset entry (the old leading-rest artifact)`).toBe(false);
        }
    });
});
