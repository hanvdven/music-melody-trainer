import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import useLevel from '../useLevel';
import { LEVEL1, LEVEL2, LEVEL3, LEVEL8 } from '../../levels/levels';

const makeSetters = () => ({
    setNumMeasures: vi.fn(), setTrebleSettings: vi.fn(), setBassSettings: vi.fn(), setPercussionSettings: vi.fn(),
    setChordSettings: vi.fn(), setPlaybackConfig: vi.fn(), setShowChordsOddRounds: vi.fn(), setShowChordsEvenRounds: vi.fn(),
});
const snap = () => ({
    numMeasures: 4, trebleSettings: { x: 1 }, bassSettings: { instrument: 'electric_bass_pick' },
    percussionSettings: { melodic: false }, chordSettings: { strategy: 'modal-random' },
    playbackConfig: { y: 1 }, showChordsOddRounds: true, showChordsEvenRounds: true,
});

const setup = (initialProps = {}) => {
    const setters = makeSetters();
    const snapshot = vi.fn(snap);
    const regenerate = vi.fn();
    const hook = renderHook(
        (props) => useLevel({ setters, snapshot, regenerate, ...props }),
        { initialProps },
    );
    return { setters, snapshot, regenerate, ...hook };
};

describe('useLevel (#659 Level 1)', () => {
    it('start applies the level-1 config, resets stats, and spawns the first wave', () => {
        const { setters, regenerate, result } = setup();
        expect(result.current.active).toBe(false);
        act(() => result.current.start());
        expect(result.current.active).toBe(true);
        expect(setters.setNumMeasures).toHaveBeenCalledWith(2);          // Level 1 = 2 measures
        expect(setters.setTrebleSettings).toHaveBeenCalled();
        expect(setters.setPlaybackConfig).toHaveBeenCalled();
        expect(setters.setShowChordsOddRounds).toHaveBeenCalledWith(false);
        expect(regenerate).toHaveBeenCalledTimes(1);                     // the first wave
        expect(result.current.stats).toMatchObject({ defeated: 0, misses: 0, longestStreak: 0 });
    });

    it('accumulates defeated / misses / longest streak', () => {
        const { result } = setup();
        act(() => result.current.start());
        act(() => { result.current.onHit(); result.current.onHit(); result.current.onHit(); });
        act(() => result.current.onMiss());
        act(() => result.current.onHit());
        expect(result.current.stats).toMatchObject({ defeated: 4, misses: 1, longestStreak: 3 });
    });

    it('accumulates graded timing stats + points (Han 2026-08-02)', () => {
        const { result } = setup();
        act(() => result.current.start());
        act(() => result.current.onHit({ category: 'perfect', points: 1 }));
        act(() => result.current.onHit({ category: 'tooSlow', points: 0.5 }));
        act(() => result.current.onHit({ category: 'secondAttemptCorrected', points: 0.5 }));
        expect(result.current.stats).toMatchObject({
            defeated: 3, points: 2, perfect: 1, tooSlow: 1, secondAttemptCorrected: 1,
        });
    });

    it('distinguishes missed / wrongUncorrected / extraNote in the well-done breakdown (Han 2026-08-02)', () => {
        const { result } = setup();
        act(() => result.current.start());
        act(() => result.current.onMiss('missed'));
        act(() => result.current.onMiss('wrongUncorrected'));
        act(() => result.current.onMiss('wrongUncorrected'));
        act(() => result.current.onMiss('extraNote'));
        expect(result.current.stats).toMatchObject({
            misses: 4, missed: 1, wrongUncorrected: 2, extraNote: 1, currentStreak: 0,
        });
    });

    it('clears 4 waves then flags done; regenerates between waves only', () => {
        const { regenerate, result } = setup();
        act(() => result.current.start());                              // regenerate #1 — defaults to Level 1
        act(() => { result.current.onWaveCleared(); });                 // wave 1 → regenerate #2
        act(() => { result.current.onWaveCleared(); });                 // wave 2 → #3
        act(() => { result.current.onWaveCleared(); });                 // wave 3 → #4
        expect(result.current.done).toBe(false);
        act(() => { result.current.onWaveCleared(); });                 // wave 4 → NO regen
        expect(result.current.done).toBe(false);
        // #1052 (Han 2026-08-17): Level 1 is now `sideScroll: true` — per the #688 side-scroll behaviour
        // just above (`onWaveCleared`), the splash must wait for `onSongEnd()` (the final barline visually
        // reaching the strike line), not fire the instant the last wave resolves.
        act(() => { result.current.onSongEnd(); });
        expect(result.current.done).toBe(true);
        expect(regenerate).toHaveBeenCalledTimes(4);
    });

    it('Level 1/2 set the quarter-grid generator fields; Level 3 (half notes) explicitly clears insertBeatRests (Han 2026-08-02, no cross-level leakage)', () => {
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL2));
        let applied = setters.setTrebleSettings.mock.calls.at(-1)[0]({});
        expect(applied).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: true, polyMultiplier: 1 });

        // Switching straight to Level 3 (no close() in between) must NOT inherit Level 2's
        // insertBeatRests/polyMultiplier — this is the exact leakage the explicit-write fixes.
        act(() => result.current.start(LEVEL3));
        applied = setters.setTrebleSettings.mock.calls.at(-1)[0]({ insertBeatRests: true, polyMultiplier: 4 });
        expect(applied).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: false, polyMultiplier: 1 });

        act(() => result.current.start(LEVEL1));
        applied = setters.setTrebleSettings.mock.calls.at(-1)[0]({});
        expect(applied).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: true, polyMultiplier: 1 });
    });

    it('the 8-level ramp never leaks smallestNoteDenom between rungs (Han 2026-08-02, "stap voor stap")', () => {
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL2));   // quarter grid
        expect(setters.setTrebleSettings.mock.calls.at(-1)[0]({})).toMatchObject({ smallestNoteDenom: 4 });

        act(() => result.current.start(LEVEL3));   // half notes — same grid resolution, longer notes allowed
        expect(setters.setTrebleSettings.mock.calls.at(-1)[0]({})).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: false });

        act(() => result.current.start(LEVEL8));   // straight to Level 8 — must NOT inherit Level 3's grid
        expect(setters.setTrebleSettings.mock.calls.at(-1)[0]({ smallestNoteDenom: 4 })).toMatchObject({ smallestNoteDenom: 8 });
    });

    it('close restores the snapshot and deactivates', () => {
        const { setters, result } = setup();
        act(() => result.current.start());
        act(() => result.current.close());
        expect(setters.setNumMeasures).toHaveBeenLastCalledWith(4);     // the snapshot's value
        expect(result.current.active).toBe(false);
        expect(result.current.done).toBe(false);
    });

    it('Level 8 always shows 3 lines + cello bass; Level 1 stays treble-only; close() restores bass (Han 2026-08-02)', () => {
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL8));
        const bassApplied = setters.setBassSettings.mock.calls.at(-1)[0]({ instrument: 'electric_bass_pick' });
        expect(bassApplied).toMatchObject({ instrument: 'cello' });
        const eyesApplied = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        // #663: chordsEye now follows the same "always on for non-debugOnlyLines levels" rule as bass/percussion.
        expect(eyesApplied.oddRounds).toMatchObject({ trebleEye: true, bassEye: true, percussionEye: true, chordsEye: true });

        act(() => result.current.start(LEVEL1));
        const eyesLevel1 = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyesLevel1.oddRounds).toMatchObject({ trebleEye: true, bassEye: false, percussionEye: false });

        act(() => result.current.close());
        expect(setters.setBassSettings).toHaveBeenLastCalledWith(expect.any(Function));
        expect(setters.setBassSettings.mock.calls.at(-1)[0]()).toMatchObject({ instrument: 'electric_bass_pick' });
    });

    it('Level 1/2 hide bass+percussion by default but show them live when debugMode toggles on, without a restart (Han 2026-08-02)', () => {
        const { setters, result, rerender } = setup({ debugMode: false });
        act(() => result.current.start(LEVEL2));
        let eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ trebleEye: true, bassEye: false, percussionEye: false });

        // Toggling debugMode ON while Level 2 is still running must re-apply the eyes immediately —
        // no result.current.start() call in between.
        rerender({ debugMode: true });
        eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ trebleEye: true, bassEye: true, percussionEye: true });

        rerender({ debugMode: false });
        eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ bassEye: false, percussionEye: false });
    });

    it('Level 8 ignores debugMode — always 3 lines regardless of the toggle (Han 2026-08-02)', () => {
        const { setters, result, rerender } = setup({ debugMode: false });
        act(() => result.current.start(LEVEL8));
        rerender({ debugMode: true });   // toggling debug must not change anything for Level 8
        const eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ trebleEye: true, bassEye: true, percussionEye: true });
    });

    it('Level 2 simplifies bass via real generator settings (octave-mismatch UAT fix, #663 rework); Level 8 keeps the real generated bass (Han 2026-08-02/2026-08-03)', () => {
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL2));
        expect(setters.setBassSettings.mock.calls.at(-1)[0]({})).toMatchObject({
            // #925 (Han 2026-08-13): the level cello now follows the chord changes —
            // 'force_chord_roots' (notesPerMeasure is a MINIMUM under that rule).
            // #889 (Han 2026-08-14): notesPerMeasure reverted 2 -> 1 (was 'emphasize_roots' / 1 before #925).
            // #889 follow-up (Han 2026-08-14): range G#1-G2 (was C2-B2) — "te hoog voor mijn gevoel".
            instrument: 'cello', notesPerMeasure: 1, smallestNoteDenom: 1, rhythmVariability: 0,
            notePool: 'chord', randomizationRule: 'force_chord_roots', range: { min: 'G#1', max: 'G2' },
        });

        act(() => result.current.start(LEVEL8));
        expect(setters.setBassSettings.mock.calls.at(-1)[0]({ notesPerMeasure: 1 })).toMatchObject({
            instrument: 'cello', notesPerMeasure: 1, randomizationRule: 'force_chord_roots',
        });
    });

    it('EVERY level (not just side-scroll) forces a tonic-tonic-tonic progression fixed to C, 1 chord/measure, forcing a fresh regen on start; close() restores the prior settings (#663, Han 2026-08-03)', () => {
        const { setters, regenerate, result } = setup();
        act(() => result.current.start(LEVEL1));   // Level 1 is NOT side-scroll — must still get this
        expect(setters.setChordSettings.mock.calls.at(-1)[0]({ strategy: 'modal-random' })).toMatchObject({
            strategy: 'tonic-tonic-tonic', fixedTonic: 'C4', chordCount: 1,
        });
        // start() forces a fresh chord regen (regenerate(true)) so the strategy actually gets applied —
        // regenerate() alone (used between waves) does NOT regenerate chords.
        expect(regenerate).toHaveBeenLastCalledWith(true);

        act(() => result.current.close());
        expect(setters.setChordSettings.mock.calls.at(-1)[0]()).toMatchObject({ strategy: 'modal-random' });

        act(() => result.current.start(LEVEL2));
        expect(setters.setChordSettings.mock.calls.at(-1)[0]({})).toMatchObject({ strategy: 'tonic-tonic-tonic', fixedTonic: 'C4', chordCount: 1 });
    });

    it('side-scroll levels turn percussion melodic (timpani); Level 1 keeps it off; close() restores it (Han 2026-08-02)', () => {
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL2));
        const percApplied = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: false });
        expect(percApplied).toMatchObject({ melodic: true });

        act(() => result.current.start(LEVEL1));
        const percLevel1 = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: true });
        expect(percLevel1).toMatchObject({ melodic: false });

        act(() => result.current.start(LEVEL2));
        act(() => result.current.close());
        expect(setters.setPercussionSettings.mock.calls.at(-1)[0]()).toMatchObject({ melodic: false });
    });
});
