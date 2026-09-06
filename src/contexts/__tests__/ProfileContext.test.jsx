import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ProfileProvider, useProfile } from '../ProfileContext';

const STORAGE_KEY = 'music-trainer-profile';
const wrapper = ({ children }) => <ProfileProvider>{children}</ProfileProvider>;

describe('ProfileContext schema (v2)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('migrates the legacy { unlockedFamilies, debugMode } shape losslessly', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            unlockedFamilies: ['Diatonic', 'Simple', 'Pentatonic'],
            debugMode: true,
        }));
        const { result } = renderHook(() => useProfile(), { wrapper });
        expect(result.current.debugMode).toBe(true);
        expect(result.current.isFamilyUnlocked('Pentatonic')).toBe(true);
        expect(result.current.gamification.totalXP).toBe(0);
        expect(result.current.gamification.level).toBe(1);
    });

    it('migrates v1 branchXP into starting skill ratings (v2, #129 rework)', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            unlockedFamilies: ['Diatonic', 'Simple'],
            debugMode: false,
            totalXP: 500,
            branchXP: { ear: 2000, sightReading: 0, rhythm: 0, harmony: 0, consistency: 700 },
            streak: { days: 3, lastActiveDate: '2026-07-01', freezeTokens: 1 },
            lifetime: { keys: {}, scales: {} },
        }));
        const { result } = renderHook(() => useProfile(), { wrapper });
        // skillScore(2000) = 63 becomes the starting Ear rating
        expect(result.current.gamification.skills.ear).toBe(63);
        expect(result.current.gamification.skills.sightReading).toBe(0);
        // consistency keeps its XP curve
        expect(result.current.gamification.skills.consistency).toBeGreaterThan(0);
        expect(result.current.gamification.totalXP).toBe(500);
    });

    it('moves ratings by performance: flawless raises, poor accuracy drops', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        // Flawless 12-note melody at difficulty 1.0 (rating 50) from rating 0 → rises
        act(() => {
            result.current.beginSession();
            result.current.recordEvent('melodyComplete', {
                subMode: 'note', staff: 'treble', difficultyMultiplier: 1.0,
                correct: 12, total: 12, tonicPC: 'C', family: 'Diatonic', mode: 'Major',
            });
        });
        const afterWin = result.current.endSession();
        expect(afterWin.skillDeltas.sightReading).toBeGreaterThan(0);

        // Now fail badly at trivial difficulty → rating drops
        act(() => {
            result.current.beginSession();
            result.current.recordEvent('melodyComplete', {
                subMode: 'note', staff: 'treble', difficultyMultiplier: 0,
                correct: 6, total: 12, tonicPC: 'C', family: 'Diatonic', mode: 'Major',
            });
        });
        const afterLoss = result.current.endSession();
        expect(afterLoss.skillDeltas.sightReading).toBeLessThan(0);
    });

    it('listening (seriesComplete) never moves skill ratings', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.beginSession();
            result.current.recordEvent('seriesComplete', { staff: 'treble', tonicPC: 'C', family: 'Diatonic', mode: 'Major' });
        });
        let summary;
        act(() => { summary = result.current.endSession(); });
        expect(summary).not.toBeNull();
        ['ear', 'sightReading', 'rhythm', 'harmony'].forEach(b => {
            expect(result.current.gamification.skills[b]).toBe(0);
        });
    });

    it('falls back to defaults on corrupt JSON', () => {
        localStorage.setItem(STORAGE_KEY, '{not json');
        const { result } = renderHook(() => useProfile(), { wrapper });
        expect(result.current.isFamilyUnlocked('Diatonic')).toBe(true);
        expect(result.current.gamification.totalXP).toBe(0);
    });

    it('awards XP through a session and returns a gated summary', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.beginSession();
            result.current.recordEvent('noteCorrect', { subMode: 'note', staff: 'treble', difficultyMultiplier: 1 });
            result.current.recordEvent('noteWrong', { subMode: 'note', staff: 'treble' });
            result.current.recordEvent('melodyComplete', {
                subMode: 'note', staff: 'treble', difficultyMultiplier: 1,
                tonicPC: 'C', family: 'Diatonic', mode: 'Major',
            });
        });
        let summary;
        act(() => { summary = result.current.endSession(); });
        expect(summary).not.toBeNull();
        expect(summary.notesCorrect).toBe(1);
        expect(summary.notesTotal).toBe(2);
        // 2×1.25 (note) + 25×1.25 (melody) + 15 (new key) + 20 (new scale) + streak day
        expect(summary.xpEarned).toBeGreaterThan(0);
        expect(summary.streakDays).toBe(1);
        // Persisted at the melodyComplete flush
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        expect(saved.version).toBe(5);   // #1099: bumped from 4 to 5 (anpm axis added)
        expect(saved.totalXP).toBeGreaterThan(0);
        expect(Object.keys(saved.lifetime.scales)).toContain('Diatonic:Major');
    });

    it('returns null summary when no melody was completed (gate)', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.beginSession();
            result.current.recordEvent('noteCorrect', { subMode: 'note', staff: 'treble' });
        });
        let summary;
        act(() => { summary = result.current.endSession(); });
        expect(summary).toBeNull();
    });

    it('persists per-exercise progress counters (#268, v3)', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordExerciseProgress('scale-runs', { melodies: 1 });
            result.current.recordExerciseProgress('scale-runs', { melodies: 1, runs: 1 });
        });
        expect(result.current.exerciseProgress['scale-runs'].melodies).toBe(2);
        expect(result.current.exerciseProgress['scale-runs'].runs).toBe(1);
        // The run bump flushed to storage.
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        expect(saved.exerciseProgress['scale-runs'].runs).toBe(1);
        expect(saved.version).toBe(5);   // #1099: bumped from 4 to 5 (anpm axis added)
    });

    // #1054 (Han 2026-08-20, level-based stats/progression): recordLevelCompletion smoke tests.
    it('recordLevelCompletion ratchets highestLevelAt80/knownScales at >=80%, never below', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 3, tonic: 'C4', mode: 'Major', accuracyPercent: 85 });
        });
        expect(result.current.levelMastery.highestLevelAt80).toBe(3);
        expect(result.current.levelMastery.knownScales).toContain('C4:Major');
        expect(result.current.levelMastery.playCounts[3]).toBe(1);
        expect(result.current.levelMastery.perfectCounts[3]).toBeUndefined();

        // A LOWER level completed afterwards must not lower the ratchet.
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 100 });
        });
        expect(result.current.levelMastery.highestLevelAt80).toBe(3);
        expect(result.current.levelMastery.perfectCounts[1]).toBe(1);   // 100% bumps the perfect counter

        // Below 80% must not move the ratchet, but still counts as a play.
        act(() => {
            result.current.recordLevelCompletion({ levelId: 4, tonic: 'C4', mode: 'Major', accuracyPercent: 60 });
        });
        expect(result.current.levelMastery.highestLevelAt80).toBe(3);
        expect(result.current.levelMastery.playCounts[4]).toBe(1);

        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        expect(saved.levelMastery.highestLevelAt80).toBe(3);
    });

    it('recordLevelCompletion tracks songId levels as knownSongs, not highestLevelAt80', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordLevelCompletion({ songId: 'arirang', tonic: 'D4', mode: 'Minor', accuracyPercent: 90 });
        });
        expect(result.current.levelMastery.knownSongs).toContain('arirang');
        expect(result.current.levelMastery.highestLevelAt80).toBeNull();
        expect(result.current.levelMastery.knownScales).toContain('D4:Minor');
        expect(result.current.levelMastery.playCounts.arirang).toBe(1);
    });

    // #1099 (Han 2026-08-22, ANPM stat) + #1122 (Han 2026-09-01, asymmetric gated smoothing):
    // recordLevelCompletion's anpm smoke tests. The blend law itself lives in gamification.js
    // nextAnpm() and has its own unit suite; these check the ProfileContext wiring end to end.
    it('recordLevelCompletion sets anpm directly on the FIRST qualifying (>=90%) completion', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        expect(result.current.anpm).toBeNull();
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 95, notesPerMinute: 40 });
        });
        expect(result.current.anpm).toBe(40);
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        expect(saved.anpm).toBe(40);
    });

    it('recordLevelCompletion leaves anpm null on a FIRST completion below 90% accuracy', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 80, notesPerMinute: 40 });
        });
        expect(result.current.anpm).toBeNull();   // a first sloppy run must not become the anchor
    });

    it('recordLevelCompletion HOLDS anpm on a fast-but-sloppy run (branch 2, accuracy < 90)', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 95, notesPerMinute: 40 });
        });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 70, notesPerMinute: 100 });
        });
        expect(result.current.anpm).toBe(40);   // faster than anpm but sloppy — evidence of neither
    });

    it('recordLevelCompletion blends a second clean FAST completion via ANPM_ALPHA_UP', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 95, notesPerMinute: 40 });
        });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 100, notesPerMinute: 60 });
        });
        // ANPM_ALPHA_UP = 0.15: 40 + 0.15*(60-40) = 43
        expect(result.current.anpm).toBeCloseTo(43, 5);
    });

    it('recordLevelCompletion HOLDS anpm on a slow-but-accurate run (#1122 — the whole point)', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 95, notesPerMinute: 60 });
        });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 85, notesPerMinute: 30 });
        });
        expect(result.current.anpm).toBe(60);   // slow piece, still accurate — no skill regression
    });

    it('recordLevelCompletion lowers anpm GENTLY on a slow-and-struggling run (ANPM_ALPHA_DOWN)', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 95, notesPerMinute: 60 });
        });
        act(() => {
            result.current.recordLevelCompletion({ levelId: 1, tonic: 'C4', mode: 'Major', accuracyPercent: 50, notesPerMinute: 30 });
        });
        // ANPM_ALPHA_DOWN = 0.05: 60 + 0.05*(30-60) = 58.5
        expect(result.current.anpm).toBeCloseTo(58.5, 5);
    });

    it('accumulates stats but no XP when gamification is off', () => {
        const { result } = renderHook(() => useProfile(), { wrapper });
        act(() => { result.current.setGamificationEnabled(false); });
        act(() => {
            result.current.beginSession();
            result.current.recordEvent('melodyComplete', { subMode: 'note', staff: 'treble', tonicPC: 'C', family: 'Diatonic', mode: 'Major' });
        });
        let summary;
        act(() => { summary = result.current.endSession(); });
        expect(summary).not.toBeNull();
        expect(summary.xpEarned).toBe(0);
        expect(result.current.gamification.totalXP).toBe(0);
    });
});
