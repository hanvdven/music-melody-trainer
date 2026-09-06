import { describe, it, expect } from 'vitest';
import { NPC_DIALOGUE, ENTITY_DISPLAY_NAME, randomNpcLine, entityDisplayName } from '../npcDialogue';
import { getEntityAudioProfile } from '../../audio/conversationEntities';

// #weather (Han 2026-09-04) — RPG-world worker NPC names + dialogue. The keys MUST stay in lock-step
// with RpgLevelPanel's `workerNpcs` roster and conversationEntities' audio profiles.
const WORKER_KEYS = ['Blacksmith', 'Blacksmith Woman', 'Town crier', 'Lumberjack', 'Lady Potions', 'Steampunker'];

describe('NPC_DIALOGUE', () => {
    it('has all 6 workers, each with a name and >= 10 non-empty lines', () => {
        expect(Object.keys(NPC_DIALOGUE).sort()).toEqual([...WORKER_KEYS].sort());
        for (const key of WORKER_KEYS) {
            const entry = NPC_DIALOGUE[key];
            expect(entry.displayName).toBeTruthy();
            expect(entry.lines.length).toBeGreaterThanOrEqual(10);
            for (const line of entry.lines) {
                expect(typeof line).toBe('string');
                expect(line.trim().length).toBeGreaterThan(0);
            }
        }
    });

    it('has no placeholder / lorem text', () => {
        const all = Object.values(NPC_DIALOGUE).flatMap((e) => e.lines).join(' ').toLowerCase();
        expect(all).not.toContain('lorem');
        expect(all).not.toContain('todo');
        expect(all).not.toContain('placeholder');
    });

    it('every line has balanced *emphasis* markers', () => {
        for (const entry of Object.values(NPC_DIALOGUE)) {
            for (const line of entry.lines) {
                const stars = (line.match(/\*/g) || []).length;
                expect(stars % 2).toBe(0);
            }
        }
    });
});

describe('randomNpcLine', () => {
    it('returns a line from the pool for a known worker, null otherwise', () => {
        const line = randomNpcLine('Lumberjack');
        expect(NPC_DIALOGUE.Lumberjack.lines).toContain(line);
        expect(randomNpcLine('Nobody')).toBeNull();
    });
});

describe('entityDisplayName', () => {
    it('names the world speakers and the three wizards', () => {
        expect(entityDisplayName('wisp')).toBe('Lamentia');
        expect(entityDisplayName('slime')).toBe('Blob');
        expect(entityDisplayName('Wizard')).toBe('Antophon');
        expect(entityDisplayName('YellowWizard')).toBe('Prosperus');
        expect(entityDisplayName('GreenWizard')).toBe('Modulatus');
        expect(entityDisplayName('Blacksmith')).toBe('Tambo');
        expect(entityDisplayName('unknown')).toBeNull();
    });

    it('ENTITY_DISPLAY_NAME folds in every worker displayName', () => {
        for (const key of WORKER_KEYS) {
            expect(ENTITY_DISPLAY_NAME[key]).toBe(NPC_DIALOGUE[key].displayName);
        }
    });
});

describe('every worker has a real conversation audio profile', () => {
    it('resolves a distinct known instrument per worker (not the marimba default)', () => {
        for (const key of WORKER_KEYS) {
            const profile = getEntityAudioProfile(key);
            expect(profile.instrument).toBeTruthy();
            expect(profile.tonePool.length).toBeGreaterThan(0);
        }
    });
});
