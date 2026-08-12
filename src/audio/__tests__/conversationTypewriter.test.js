import { describe, it, expect } from 'vitest';
import { buildTypewriterSchedule, pickWeightedTone, DEFAULT_TONE_POOL } from '../conversationTypewriter';

describe('conversationTypewriter (#922)', () => {
    it('gives every character its own click, in order, starting at click 0', () => {
        const schedule = buildTypewriterSchedule('Hi', 4);
        expect(schedule).toHaveLength(2);
        expect(schedule[0]).toMatchObject({ char: 'H', tone: 'C3', clickOffset: 0 });
        expect(schedule[1].clickOffset).toBe(1);
    });

    it('spaces are silent (no tone) but still consume a click', () => {
        const schedule = buildTypewriterSchedule('a b', 4);
        const space = schedule.find((e) => e.char === ' ');
        expect(space.tone).toBeNull();
        // 'a' at click 0, ' ' at click 1, 'b' at click 2 — space did not collapse to zero-width.
        expect(schedule[2].clickOffset).toBe(2);
    });

    it('comma adds 2 silent clicks on top of its own click (1/8-beat pause)', () => {
        const schedule = buildTypewriterSchedule('a,b', 4);
        const comma = schedule.find((e) => e.char === ',');
        const b = schedule.find((e) => e.char === 'b');
        expect(comma.tone).toBe('C3');
        expect(comma.clickOffset).toBe(1);   // right after 'a'
        expect(b.clickOffset).toBe(comma.clickOffset + 1 + 2);   // own click + 2 silent
    });

    it('period snaps the NEXT character forward to the next beat boundary', () => {
        // clicksPerBeat = 4: "Hi." -> H@0, i@1, .@2 (own click), next char must land on click 4 (next
        // multiple of 4), not click 3.
        const schedule = buildTypewriterSchedule('Hi. X', 4);
        const period = schedule.find((e) => e.char === '.');
        expect(period.clickOffset).toBe(2);
        const space = schedule[3];   // the space right after the period
        expect(space.char).toBe(' ');
        expect(space.clickOffset).toBe(4);
    });

    it('uppercase letters and punctuation always resolve to the pool\'s cap tone', () => {
        const schedule = buildTypewriterSchedule('A!', 4);
        expect(schedule[0].tone).toBe('C3');
        expect(schedule[1].tone).toBe('C3');
    });

    it('lowercase letters use the weighted tone pool, never anything else', () => {
        const schedule = buildTypewriterSchedule('abcdef', 4);
        for (const entry of schedule) {
            expect(['C3', 'D3', 'E3']).toContain(entry.tone);
        }
    });

    it('pickWeightedTone respects the 70/25/5 weighting at its boundaries', () => {
        expect(pickWeightedTone(DEFAULT_TONE_POOL, () => 0)).toBe('C3');
        expect(pickWeightedTone(DEFAULT_TONE_POOL, () => 0.69)).toBe('C3');
        expect(pickWeightedTone(DEFAULT_TONE_POOL, () => 0.71)).toBe('D3');
        expect(pickWeightedTone(DEFAULT_TONE_POOL, () => 0.94)).toBe('D3');
        expect(pickWeightedTone(DEFAULT_TONE_POOL, () => 0.96)).toBe('E3');
        expect(pickWeightedTone(DEFAULT_TONE_POOL, () => 0.999)).toBe('E3');
    });

    it('an entity-specific tone pool (e.g. the wisp\'s +2 octaves, or the koto\'s IN-scale notes) is used verbatim', () => {
        const wispPool = [{ note: 'C5', weight: 70 }, { note: 'D5', weight: 25 }, { note: 'E5', weight: 5 }];
        expect(pickWeightedTone(wispPool, () => 0)).toBe('C5');
        expect(pickWeightedTone(wispPool, () => 0.96)).toBe('E5');

        const kotoPool = [{ note: 'C4', weight: 70 }, { note: 'D♭4', weight: 25 }, { note: 'F4', weight: 5 }];
        const schedule = buildTypewriterSchedule('A,b.', 4, { tonePool: kotoPool, rand: () => 0 });
        expect(schedule.every((e) => e.tone == null || ['C4', 'D♭4', 'F4'].includes(e.tone))).toBe(true);
        expect(schedule[0].tone).toBe('C4');   // uppercase -> cap tone (the pool's own first entry)
    });
});
