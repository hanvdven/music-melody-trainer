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
        // #1100 bug fix (Han 2026-08-22): the level's own bpm is passed through as a 2nd arg so
        // App.jsx's levelLoadSong can re-assert it AFTER loadSong's own setBpm(song.defaultTempo) —
        // see useLevel.js's begin() comment for why this was silently clobbering variant-scaled bpm.
        // #1153/#1154: 3rd arg is the g/h levelOverride — null for a level without either selected.
        expect(setters.loadSong).toHaveBeenCalledWith('level1-intro', LEVEL1.bpm, null);
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

    // #1165 (Han 2026-08-29): this test used to be "clears 4 waves then flags done; regenerates
    // between waves only" and asserted regenerate() firing once per cleared wave. That mechanism is
    // RETIRED: every level's content now streams block by block from `useLevelContentStream`, so a
    // wave clear has no content work to do at all and `wave` is purely a combat/spawn counter.
    // `regenerate` survives only for begin() (the level's ONE initial generation, which also authors
    // the chord progression) and close().
    // Bug fix (Han 2026-08-29 UAT of #1102): this used to be "clears 4 waves then flags done" and
    // walked `onWaveCleared` four times. There is exactly ONE clear event per level now — SheetRpgLayer
    // can only fire `onSlimesCleared` when its whole-song-cumulative `killedCount` catches up to its
    // whole-song-cumulative `total`, which the JIT stream's lookahead makes impossible until the very
    // end (see `wavesForLevel`'s own comment in levels.js). Waiting for a 2nd/3rd/4th clear is what
    // left the level unable to reach `done` at all.
    it('ONE clear arms the song-end gate; NEVER regenerates between waves (#1165/#1102)', () => {
        // #1053: Level 1 is now a fixed 5-measure song so it can no longer serve as this generic
        // mechanism test's example — a standalone level object decouples this test from the real
        // roster's structure entirely, so it can never break again from an unrelated renumbering.
        // Deliberately still authored as 4 generation chunks (`totalMeasures / numMeasures === 4`) so
        // the test actively proves the wave count no longer follows the chunk count.
        const fourChunkLevel = { id: 999, sideScroll: true, numMeasures: 2, numRepeats: 1, totalMeasures: 8 };
        const { regenerate, result } = setup();
        act(() => result.current.start(fourChunkLevel));                // regenerate #1 (begin() only)
        expect(result.current.totalWaves).toBe(1);
        act(() => { result.current.onWaveCleared(); });                 // the level's ONE clear → no regen
        expect(result.current.wave).toBe(1);
        expect(result.current.done).toBe(false);
        // #688: a side-scroll level's splash must wait for `onSongEnd()` (the final barline visually
        // reaching the strike line), not fire the instant the last wave resolves.
        act(() => { result.current.onSongEnd(); });
        expect(result.current.done).toBe(true);
        expect(regenerate).toHaveBeenCalledTimes(1);
    });

    // The §289 "level never ends" guard, in its most direct form: `onSongEnd` BEFORE any clear must be
    // a no-op that leaves the gate open, and the clear that follows must still be able to end the
    // level. (SheetRpgLayer resets its own `songEndFiredRef` on every `levelWaveIndex` change for
    // exactly this race — the final barline can cross the strike line up to half a beat before the last
    // slime's miss deadline resolves it.)
    it('onSongEnd before the clear is a no-op, and the level can still finish afterwards (§289)', () => {
        const lvl = { id: 997, sideScroll: true, numMeasures: 2, numRepeats: 1, totalMeasures: 24 };
        const { result } = setup();
        act(() => result.current.start(lvl));
        act(() => { result.current.onSongEnd(); });
        expect(result.current.done).toBe(false);      // nothing pending yet — must NOT latch
        act(() => { result.current.onWaveCleared(); });
        expect(result.current.done).toBe(false);      // side-scroll still waits for the barline
        act(() => { result.current.onSongEnd(); });
        expect(result.current.done).toBe(true);
    });

    // A non-side-scroll static-combat level (101/107/112) has no barline to wait for, so its single
    // clear must flip `done` immediately. Its authored `numBlocks` (3-6) used to become its wave count,
    // which — with #1165 generating all of its content in one synchronous pass, hence one clear event —
    // meant `next >= tw` never held and the static levels never finished either.
    it('a non-side-scroll static level finishes on its single clear (#1165 regression)', () => {
        const staticLevel = { id: 996, sideScroll: false, numMeasures: 2, numRepeats: 1, totalMeasures: 8 };
        const { result } = setup();
        act(() => result.current.start(staticLevel));
        act(() => { result.current.onWaveCleared(); });
        expect(result.current.done).toBe(true);
    });

    // Bug fix (Han 2026-08-24 UAT, call-response levels: "enemies vanquished" underreported + a burst of
    // extra "missed" judgments): a multi-wave call-response (Wizard-forced) level streams its treble via
    // the JIT treble stream (App.jsx activated it on `enemyType === 'Wizard'`), same as a JIT gated
    // level — `onWaveCleared` must NOT call `regenerate()` for it either, even though `isJitTrebleLevel`
    // itself is (correctly, for wave-COUNTING purposes) false for Wizard levels.
    // #1165: this is now true for EVERY level, not just this shape — kept as its own case because it is
    // the exact regression that first proved the guard was needed.
    it('never regenerates between waves for a call-response (Wizard) level — only the wave count advances', () => {
        const callResponseLevel = {
            id: 998, sideScroll: true, enemyType: 'Wizard', gatedScroll: false,
            numMeasures: 2, numRepeats: 2, totalMeasures: 8,
        };
        const { regenerate, result } = setup();
        act(() => result.current.start(callResponseLevel));   // regenerate #1 (start() always regenerates once)
        act(() => { result.current.onWaveCleared(); });       // the level's ONE clear → must NOT regenerate
        expect(result.current.wave).toBe(1);
        expect(regenerate).toHaveBeenCalledTimes(1);
        act(() => { result.current.onSongEnd(); });
        expect(result.current.done).toBe(true);
        expect(regenerate).toHaveBeenCalledTimes(1);
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

    it('every side-scroll level turns percussion melodic on, gated or not (Han 2026-08-20, #867 rework "b"); close() restores it', () => {
        // #867 rework: REVERTED #1052's gated-scroll exclusion — timpani now rides
        // `useLevelBackingStream`'s chunked/loop-forever mechanism (same as cello) instead of a one-shot
        // schedule that went silent during a long gated freeze, so gated levels (1-3) get melodic
        // percussion again too, same as every other side-scroll level.
        const { setters, result } = setup();
        act(() => result.current.start(LEVEL4));
        const percApplied = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: false });
        expect(percApplied).toMatchObject({ melodic: true });

        act(() => result.current.start(LEVEL1));
        const percLevel1 = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: false });
        expect(percLevel1).toMatchObject({ melodic: true });

        act(() => result.current.start(LEVEL2));
        const percLevel2 = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: false });
        expect(percLevel2).toMatchObject({ melodic: true });

        act(() => result.current.start(LEVEL3));
        const percLevel3 = setters.setPercussionSettings.mock.calls.at(-1)[0]({ melodic: false });
        expect(percLevel3).toMatchObject({ melodic: true });

        act(() => result.current.start(LEVEL4));
        act(() => result.current.close());
        expect(setters.setPercussionSettings.mock.calls.at(-1)[0]()).toMatchObject({ melodic: false });
    });

    it('every level start unconditionally un-pins playbackConfig.randomize.melody/chords (Han 2026-08-18, "na level 2 start level 3 niet")', () => {
        // App.jsx's handleLoadSong (fired for a songId level, right after applyConfig — see begin())
        // PINS randomize.melody/chords to false so the loaded song plays verbatim. Before this fix,
        // NOTHING ever un-pinned it again for a later level with no songId of its own — leftover state
        // from whichever song-backed level last ran would silently persist across every subsequent
        // level start for the rest of the session. Simulates that exact leftover (a pinned
        // playbackConfig, as if a songId level's loadSong had just run) and asserts a plain level's
        // start() clears it.
        const { setters, snapshot, result } = setup();
        snapshot.mockReturnValue({
            ...snap(), playbackConfig: { y: 1, randomize: { tonic: false, mode: false, family: false, melody: false, chords: false } },
        });
        act(() => result.current.start(LEVEL4));   // LEVEL4 has no songId — a plain procedural level
        // Level 4 has debugOnlyLines: true, so the SEPARATE live-debug-mode effect (line ~267 above)
        // ALSO calls setPlaybackConfig — find applyConfig's OWN call specifically (the only one that
        // also sets repsPerMelody) rather than assuming it's the last call in the mock's history.
        const applyConfigCall = setters.setPlaybackConfig.mock.calls.find((args) => {
            const out = args[0]({
                repsPerMelody: undefined,
                randomize: { tonic: false, mode: false, family: false, melody: false, chords: false },
            });
            return out.repsPerMelody !== undefined;
        });
        expect(applyConfigCall).toBeTruthy();
        const applied = applyConfigCall[0]({
            randomize: { tonic: false, mode: false, family: false, melody: false, chords: false },
        });
        expect(applied.randomize).toMatchObject({ melody: true, chords: true });
    });
});
