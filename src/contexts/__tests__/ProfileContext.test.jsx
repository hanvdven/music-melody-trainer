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
        expect(saved.version).toBe(3);
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
        expect(saved.version).toBe(3);
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
