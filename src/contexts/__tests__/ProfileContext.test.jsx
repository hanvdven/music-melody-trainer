import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ProfileProvider, useProfile } from '../ProfileContext';

const STORAGE_KEY = 'music-trainer-profile';
const wrapper = ({ children }) => <ProfileProvider>{children}</ProfileProvider>;

describe('ProfileContext v1 schema', () => {
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
        expect(saved.version).toBe(1);
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
