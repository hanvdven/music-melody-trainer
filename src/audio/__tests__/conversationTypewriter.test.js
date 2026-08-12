import { describe, it, expect } from 'vitest';
import { buildTypewriterSchedule, pickWeightedTone, DEFAULT_TONE_POOL, GROUP_SIZE } from '../conversationTypewriter';

describe('conversationTypewriter (#922)', () => {
    it('groups up to GROUP_SIZE characters per click, spread linearly across it', () => {
        // 'Hi!' — 3 non-punctuation-forcing chars (the trailing '!' below is tested separately) fill
        // exactly one group of GROUP_SIZE(3), evenly spaced at clickOffset 0, 1/3, 2/3.
        const schedule = buildTypewriterSchedule('Hi!', 4);
        expect(schedule).toHaveLength(3);
        expect(schedule[0]).toMatchObject({ char: 'H', tone: 'C3', clickOffset: 0, subSpan: 1 / 3 });
        expect(schedule[1]).toMatchObject({ char: 'i', clickOffset: 1 / 3, subSpan: 1 / 3 });
        expect(schedule[2]).toMatchObject({ char: '!', tone: 'C3', clickOffset: 2 / 3, subSpan: 1 / 3 });
    });

    it('a 4th character starts a NEW click (group boundary at GROUP_SIZE)', () => {
        const schedule = buildTypewriterSchedule('Four', 4);
        expect(GROUP_SIZE).toBe(3);
        expect(schedule[0].clickOffset).toBe(0);
        expect(schedule[2].clickOffset).toBeCloseTo(2 / 3);
        expect(schedule[3].clickOffset).toBe(1);   // 4th char starts click 1's group
        expect(schedule[3].subSpan).toBe(1);        // trailing partial group of 1 -> spans the whole click
    });

    it('spaces are silent (no tone) but still occupy a slot in the group', () => {
        const schedule = buildTypewriterSchedule('a b', 4);
        const space = schedule.find((e) => e.char === ' ');
        expect(space.tone).toBeNull();
        // 'a', ' ', 'b' — 3 chars, no punctuation — all land in ONE group (click 0).
        expect(schedule.every((e) => e.clickOffset < 1)).toBe(true);
    });

    it('a comma ALWAYS closes its group immediately, even mid-group, then adds 2 silent clicks', () => {
        // 'a,b': 'a' starts a group, ',' forces it closed at size 2 (not the full GROUP_SIZE=3).
        const schedule = buildTypewriterSchedule('a,b', 4);
        const comma = schedule.find((e) => e.char === ',');
        const b = schedule.find((e) => e.char === 'b');
        expect(comma.tone).toBe('C3');
        expect(comma.clickOffset).toBe(0.5);   // 2nd (last) of a 2-member group -> click 0 + 1/2
        // the comma's group consumed click 0; +2 silent clicks lands 'b' (its own fresh group) at click 3.
        expect(b.clickOffset).toBe(3);
    });

    it('a period ALWAYS closes its group immediately, then snaps forward to the next beat boundary', () => {
        // 'Hi. X': 'H','i' accumulate, '.' forces the group closed at size 3 (H,i,.) — click 0 -> click 1.
        // Then period's OWN snap-to-beat pushes click to the next multiple of clicksPerBeat(4): click 4.
        const schedule = buildTypewriterSchedule('Hi. X', 4);
        const period = schedule.find((e) => e.char === '.');
        expect(period.clickOffset).toBeCloseTo(2 / 3);   // 3rd member of the H/i/. group
        const space = schedule.find((e) => e.char === ' ');
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

    it('an entity-specific tone pool (e.g. the wisp\'s +2 octaves, or the shamisen\'s IN-scale notes) is used verbatim', () => {
        const wispPool = [{ note: 'C5', weight: 70 }, { note: 'D5', weight: 25 }, { note: 'E5', weight: 5 }];
        expect(pickWeightedTone(wispPool, () => 0)).toBe('C5');
        expect(pickWeightedTone(wispPool, () => 0.96)).toBe('E5');

        const inScalePool = [{ note: 'C4', weight: 70 }, { note: 'D♭4', weight: 25 }, { note: 'F4', weight: 5 }];
        const schedule = buildTypewriterSchedule('A,b.', 4, { tonePool: inScalePool, rand: () => 0 });
        expect(schedule.every((e) => e.tone == null || ['C4', 'D♭4', 'F4'].includes(e.tone))).toBe(true);
        expect(schedule[0].tone).toBe('C4');   // uppercase -> cap tone (the pool's own first entry)
    });
});
