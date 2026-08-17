import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import useLevel from '../useLevel';
import { LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL7, LEVEL12 } from '../../levels/levels';

const makeSetters = () => ({
    setNumMeasures: vi.fn(), setTrebleSettings: vi.fn(), setBassSettings: vi.fn(), setPercussionSettings: vi.fn(),
    setChordSettings: vi.fn(), setPlaybackConfig: vi.fn(), setShowChordsOddRounds: vi.fn(), setShowChordsEvenRounds: vi.fn(),
    // #1053 (Han 2026-08-17): Level 1/2/3 are now gated levels with a songId (1/2 fixed, 3 procedural) —
    // begin() calls setters.loadSong(lvl.songId) instead of regenerate(true) for those (see useLevel.js's
    // own #871 comment). Every test that starts a song-backed level needs this mocked.
    loadSong: vi.fn(),
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

// #1053 (Han 2026-08-17, "vaste levels 1-4 + renummering"): Levels 1-3 are now GATED introductory levels
// (1/2 play a fixed songId melody, 3 is the first random-uniform generated one) — the former Level 2's
// exact procedural config (quarter-grid, fixedBass, debugOnlyLines) now lives at Level 4; the former
// Level 3's "half notes unlocked" config is at Level 7; the former Level 8's "full richness" config is at
// Level 12. Tests below that exercised THOSE specific procedural behaviors were repointed accordingly —
// see each test's own comment for the old->new mapping.
describe('useLevel (#659 Level 1)', () => {
    it('start applies the level-1 config, resets stats, and loads the level\'s fixed song', () => {
        const { setters, regenerate, result } = setup();
        expect(result.current.active).toBe(false);
        act(() => result.current.start());
        expect(result.current.active).toBe(true);
        // #1053: Level 1's numMeasures is now back-filled from its song (level1-intro.json, 5 measures —
        // 4 bars of quarters + 1 whole-note bar), not the old hardcoded procedural "2".
        expect(setters.setNumMeasures).toHaveBeenCalledWith(5);
        expect(setters.setTrebleSettings).toHaveBeenCalled();
        expect(setters.setPlaybackConfig).toHaveBeenCalled();
        expect(setters.setShowChordsOddRounds).toHaveBeenCalledWith(false);
        // #1053: a songId level calls loadSong instead of regenerate(true) (useLevel.js's begin()).
        expect(setters.loadSong).toHaveBeenCalledWith('level1-intro');
        expect(regenerate).not.toHaveBeenCalled();
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
        // #1053: Level 1 is now a fixed 5-measure song (1 wave, see songLevels.test.js's own coverage) so
        // it can no longer serve as this generic "N waves" mechanism test's example — a standalone
        // 4-wave level object (totalMeasures/numMeasures = 4) decouples this test from the real roster's
        // structure entirely, so it can never break again from an unrelated future renumbering.
        const fourWaveLevel = { id: 999, sideScroll: true, numMeasures: 2, numRepeats: 1, totalMeasures: 8 };
        const { regenerate, result } = setup();
        act(() => result.current.start(fourWaveLevel));                 // regenerate #1
        act(() => { result.current.onWaveCleared(); });                 // wave 1 → regenerate #2
        act(() => { result.current.onWaveCleared(); });                 // wave 2 → #3
        act(() => { result.current.onWaveCleared(); });                 // wave 3 → #4
        expect(result.current.done).toBe(false);
        act(() => { result.current.onWaveCleared(); });                 // wave 4 → NO regen
        expect(result.current.done).toBe(false);
        // #688: a side-scroll level's splash must wait for `onSongEnd()` (the final barline visually
        // reaching the strike line), not fire the instant the last wave resolves.
        act(() => { result.current.onSongEnd(); });
        expect(result.current.done).toBe(true);
        expect(regenerate).toHaveBeenCalledTimes(4);
    });

    it('Level 4/7 set the quarter-grid generator fields; Level 7 (half notes) explicitly clears insertBeatRests (Han 2026-08-02, no cross-level leakage)', () => {
        // #1053: repointed from the former Level 2 (quarter-grid)/Level 3 (half notes) — that exact
        // procedural config now lives at Level 4/Level 7 respectively (see file-top comment).
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL4));
        let applied = setters.setTrebleSettings.mock.calls.at(-1)[0]({});
        expect(applied).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: true, polyMultiplier: 1 });

        // Switching straight to Level 7 (no close() in between) must NOT inherit Level 4's
        // insertBeatRests/polyMultiplier — this is the exact leakage the explicit-write fixes.
        act(() => result.current.start(LEVEL7));
        applied = setters.setTrebleSettings.mock.calls.at(-1)[0]({ insertBeatRests: true, polyMultiplier: 4 });
        expect(applied).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: false, polyMultiplier: 1 });

        act(() => result.current.start(LEVEL1));
        applied = setters.setTrebleSettings.mock.calls.at(-1)[0]({});
        expect(applied).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: true, polyMultiplier: 1 });
    });

    it('the ramp never leaks smallestNoteDenom between rungs (Han 2026-08-02, "stap voor stap")', () => {
        // #1053: repointed from Level 2/3/8 to their new positions 4/7/12 (see file-top comment).
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL4));   // quarter grid
        expect(setters.setTrebleSettings.mock.calls.at(-1)[0]({})).toMatchObject({ smallestNoteDenom: 4 });

        act(() => result.current.start(LEVEL7));   // half notes — same grid resolution, longer notes allowed
        expect(setters.setTrebleSettings.mock.calls.at(-1)[0]({})).toMatchObject({ smallestNoteDenom: 4, insertBeatRests: false });

        act(() => result.current.start(LEVEL12));   // straight to Level 12 — must NOT inherit Level 7's grid
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

    it('Level 12 always shows 3 lines + cello bass; Level 1 stays treble-only; close() restores bass (Han 2026-08-02)', () => {
        // #1053: repointed from the former Level 8 (full richness) to its new position 12.
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL12));
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

    it('Level 4 hides bass+percussion by default but shows them live when debugMode toggles on, without a restart (Han 2026-08-02)', () => {
        // #1053: repointed from the former Level 2 to Level 4 — Level 2 now has a songId, and
        // computeEyes forces bassEye/percussionEye false for a songId level with no bass/percussion
        // content REGARDLESS of debugMode (useLevel.js's own #871 comment) — correct for a song that
        // genuinely has no bass part, but it means Level 2 can no longer exercise the debug-reveal
        // mechanic this test is about. Level 4 has no songId and still has debugOnlyLines: true.
        const { setters, result, rerender } = setup({ debugMode: false });
        act(() => result.current.start(LEVEL4));
        let eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ trebleEye: true, bassEye: false, percussionEye: false });

        // Toggling debugMode ON while Level 4 is still running must re-apply the eyes immediately —
        // no result.current.start() call in between.
        rerender({ debugMode: true });
        eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ trebleEye: true, bassEye: true, percussionEye: true });

        rerender({ debugMode: false });
        eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ bassEye: false, percussionEye: false });
    });

    it('Level 12 ignores debugMode — always 3 lines regardless of the toggle (Han 2026-08-02)', () => {
        // #1053: repointed from the former Level 8 to its new position 12.
        const { setters, result, rerender } = setup({ debugMode: false });
        act(() => result.current.start(LEVEL12));
        rerender({ debugMode: true });   // toggling debug must not change anything for Level 12
        const eyes = setters.setPlaybackConfig.mock.calls.at(-1)[0]({ oddRounds: {}, evenRounds: {} });
        expect(eyes.oddRounds).toMatchObject({ trebleEye: true, bassEye: true, percussionEye: true });
    });

    it('Level 4 simplifies bass via real generator settings (octave-mismatch UAT fix, #663 rework); Level 12 keeps the real generated bass (Han 2026-08-02/2026-08-03)', () => {
        // #1053: repointed from the former Level 2 (fixedBass: true)/Level 8 to their new positions 4/12 —
        // Levels 1-3 now have fixedBass: false (song-backed or not yet using the cello-simplification path).
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL4));
        expect(setters.setBassSettings.mock.calls.at(-1)[0]({})).toMatchObject({
            // #925 (Han 2026-08-13): the level cello now follows the chord changes —
            // 'force_chord_roots' (notesPerMeasure is a MINIMUM under that rule).
            // #889 (Han 2026-08-14): notesPerMeasure reverted 2 -> 1 (was 'emphasize_roots' / 1 before #925).
            // #889 follow-up (Han 2026-08-14): range G#1-G2 (was C2-B2) — "te hoog voor mijn gevoel".
            instrument: 'cello', notesPerMeasure: 1, smallestNoteDenom: 1, rhythmVariability: 0,
            notePool: 'chord', randomizationRule: 'force_chord_roots', range: { min: 'G#1', max: 'G2' },
        });

        act(() => result.current.start(LEVEL12));
        expect(setters.setBassSettings.mock.calls.at(-1)[0]({ notesPerMeasure: 1 })).toMatchObject({
            instrument: 'cello', notesPerMeasure: 1, randomizationRule: 'force_chord_roots',
        });
    });

    it('EVERY level (not just side-scroll) forces a tonic-tonic-tonic progression fixed to C, 1 chord/measure, forcing a fresh regen on start; close() restores the prior settings (#663, Han 2026-08-03)', () => {
        // #1053: repointed from Levels 1/2 to 4/7 — Levels 1-3 are songId-backed now and call loadSong
        // instead of regenerate(true) (see useLevel.js's begin()); the chord-forcing itself is
        // unconditional (applies to every level, songId or not) and is already covered for a songId level
        // by the very first test in this file.
        const { setters, regenerate, result } = setup();
        act(() => result.current.start(LEVEL4));
        expect(setters.setChordSettings.mock.calls.at(-1)[0]({ strategy: 'modal-random' })).toMatchObject({
            strategy: 'tonic-tonic-tonic', fixedTonic: 'C4', chordCount: 1,
        });
        // start() forces a fresh chord regen (regenerate(true)) so the strategy actually gets applied —
        // regenerate() alone (used between waves) does NOT regenerate chords.
        expect(regenerate).toHaveBeenLastCalledWith(true);

        act(() => result.current.close());
        expect(setters.setChordSettings.mock.calls.at(-1)[0]()).toMatchObject({ strategy: 'modal-random' });

        act(() => result.current.start(LEVEL7));
        expect(setters.setChordSettings.mock.calls.at(-1)[0]({})).toMatchObject({ strategy: 'tonic-tonic-tonic', fixedTonic: 'C4', chordCount: 1 });
    });

    it('gated levels keep percussion melodic off (no timpani pulse); a normal side-scroll level turns it on; close() restores it (Han 2026-08-02, #1052 follow-up)', () => {
        // #1053/#1052: repointed the "melodic: true" case from the former Level 2 to Level 4 — Level 2 is
        // gated now (gatedScroll levels never get timpani, see useLevel.js's melodic formula), so it
        // belongs on the "off" side of this test alongside Level 1/3, not the "on" side.
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL4));
        const percApplied = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: false });
        expect(percApplied).toMatchObject({ melodic: true });

        act(() => result.current.start(LEVEL1));
        const percLevel1 = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: true });
        expect(percLevel1).toMatchObject({ melodic: false });

        act(() => result.current.start(LEVEL2));
        const percLevel2 = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: true });
        expect(percLevel2).toMatchObject({ melodic: false });

        act(() => result.current.start(LEVEL3));
        const percLevel3 = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: true });
        expect(percLevel3).toMatchObject({ melodic: false });

        act(() => result.current.start(LEVEL4));
        act(() => result.current.close());
        expect(setters.setPercussionSettings.mock.calls.at(-1)[0]()).toMatchObject({ melodic: false });
    });
});
