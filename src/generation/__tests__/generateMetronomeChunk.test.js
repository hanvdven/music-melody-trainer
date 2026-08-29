import { describe, it, expect } from 'vitest';
import { generateMetronomeChunk } from '../generateMetronomeChunk';

// #1165 side-effect (a), Han's explicit acceptance criterion: the cello/bass rhythm may change (it now
// follows the block cadence, off the shared rhythm grid) but the METRONOME must stay byte-identical.
// These tests prove the property that makes that true — the click track carries no cross-measure state,
// so the chunk size it is generated in is irrelevant to what comes out.
//
// SCOPE NOTE (found while writing this test, PRE-EXISTING, unchanged by #1165): for an ODD-numerator
// meter the accent pattern within a measure follows the measure's own GROUPING (7/8 = 2+2+3 or 3+2+2,
// …), and `chooseGrouping` picks that fresh on every generation call — so 7/8's wh/wm/wl SEQUENCE
// already differed between two identical calls long before this ticket, at any chunk size. What is
// invariant for EVERY meter is the click COUNT and every click's OFFSET (asserted below for all four),
// which is what "the metronome still clicks on exactly the same beats" means. The wh/wm/wl sequence is
// asserted identical for the meters whose grouping is deterministic.
describe('generateMetronomeChunk — chunk-size invariance (#1165 side-effect (a))', () => {
    const MLT = 48;   // 4/4 at TICKS_PER_WHOLE = 48
    const shift = (chunk, baseTicks) => chunk.offsets.map((o) => (o == null ? o : o + baseTicks));
    // 7/8 (and any odd numerator) has a randomized grouping — see the SCOPE NOTE above.
    const METERS = [
        { ts: [4, 4], deterministicAccents: true },
        { ts: [3, 4], deterministicAccents: true },
        { ts: [6, 8], deterministicAccents: true },
        { ts: [7, 8], deterministicAccents: false },
    ];

    for (const { ts, deterministicAccents } of METERS) {
        const label = `${ts[0]}/${ts[1]}`;
        const mlt = (MLT * ts[0]) / ts[1];

        const concatChunks = (sizes, runIdPrefix) => {
            const notes = [];
            const durations = [];
            const offsets = [];
            let measure = 0;
            for (const size of sizes) {
                // A DIFFERENT runId per chunk — the real stream uses `${runId}-${blockIndex}`, so if the
                // metronome depended on its seed at all these tests would catch it.
                const c = generateMetronomeChunk({ timeSignature: ts, measures: size, runId: `${runIdPrefix}-${measure}` });
                notes.push(...c.notes);
                durations.push(...c.durations);
                offsets.push(...shift(c, measure * mlt));
                measure += size;
            }
            return { notes, durations, offsets };
        };

        it(`${label}: four 1-measure chunks click on exactly the same beats as one 4-measure chunk`, () => {
            const whole = generateMetronomeChunk({ timeSignature: ts, measures: 4, runId: 'whole' });
            const split = concatChunks([1, 1, 1, 1], 'split');
            expect(split.offsets).toEqual(whole.offsets);
            expect(split.durations).toEqual(whole.durations);
            if (deterministicAccents) expect(split.notes).toEqual(whole.notes);
        });

        it(`${label}: a 2+2 split (the OLD leadInBars cadence) clicks identically to one 4-measure block (the NEW one)`, () => {
            const whole = generateMetronomeChunk({ timeSignature: ts, measures: 4, runId: 'whole' });
            const split = concatChunks([2, 2], 'split');
            expect(split.offsets).toEqual(whole.offsets);
            expect(split.durations).toEqual(whole.durations);
            if (deterministicAccents) expect(split.notes).toEqual(whole.notes);
        });

        it(`${label}: places exactly ${ts[0]} clicks per measure, always starting on each downbeat`, () => {
            const chunk = generateMetronomeChunk({ timeSignature: ts, measures: 2, runId: 'q' });
            const real = chunk.offsets.filter((o) => o != null);
            expect(real.length).toBe(ts[0] * 2);
            expect(real[0]).toBe(0);
            expect(real[ts[0]]).toBe(mlt);
        });
    }

    it('a zero measure count yields an empty (never throwing) chunk — the metronomeBars=0 edge case', () => {
        expect(generateMetronomeChunk({ timeSignature: [4, 4], measures: 0, runId: 'z' }))
            .toEqual({ notes: [], durations: [], offsets: [], displayNotes: [] });
    });
});
