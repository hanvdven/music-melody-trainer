import { useState, useRef, useCallback } from 'react';
import { LEVEL1, wavesForLevel, trebleOnlyEyes } from '../levels/levels';

// #659/#660 Level orchestration. Applies a level's config (snapshotting the prior config to restore on
// close), accumulates combat stats (defeated / misses / longest streak), counts cleared waves, and flags
// completion so the app can show the "Well done!" splash. Parametrised by the level def so it drives both
// Level 1 (static combat) and Level 2 (side-scroll). Pure state machine — the app wires the setters +
// regenerate.

// Graded timing stats (Han 2026-08-02): the side-scroll levels grade each kill (gradeHit — perfect /
// too fast / too slow / much too fast / much too slow / on second attempt) and award points (perfect = 1,
// everything else ½). wrongNotes counts wrong-pitch attempts (also a miss); Level 1 (no metronome) passes
// no grade → just defeated + 1 point.
const emptyStats = () => ({
    defeated: 0, misses: 0, currentStreak: 0, longestStreak: 0, points: 0,
    perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0, secondAttempt: 0, wrongNotes: 0,
});

// `setters` — the app state setters the level drives. `snapshot()` returns the current config to restore.
// `regenerate()` builds a fresh melody (a new wave) from the CURRENT settings (call AFTER applying config).
export default function useLevel({ setters, snapshot, regenerate }) {
    const [current, setCurrent] = useState(LEVEL1);
    const [active, setActive] = useState(false);
    const [wave, setWave] = useState(0);
    const [done, setDone] = useState(false);
    const [stats, setStats] = useState(emptyStats);
    const snapRef = useRef(null);
    const activeRef = useRef(false); activeRef.current = active;
    const currentRef = useRef(current); currentRef.current = current;
    const totalWaves = wavesForLevel(current);

    // apply a level's config (takes the level explicitly so it never reads a stale `current`).
    const applyConfig = useCallback((lvl) => {
        setters.setNumMeasures(lvl.numMeasures);
        setters.setStartMeasureIndex?.(0);           // a new level restarts the measure numbering from 1
        if (lvl.bpm) setters.setBpm?.(lvl.bpm);
        setters.setTrebleSettings((prev) => ({
            ...prev, notesPerMeasure: lvl.notesPerMeasure, rhythmVariability: lvl.variability,
            range: lvl.range, rangeMode: 'fixed',
            ...(lvl.smallestNoteDenom ? { smallestNoteDenom: lvl.smallestNoteDenom } : {}),
            forceQuarterNotes: !!lvl.forceQuarterNotes,   // #661 Level 2: every note → a quarter (+ rests)
        }));
        setters.setPlaybackConfig((prev) => ({
            ...prev, repsPerMelody: lvl.numRepeats,
            oddRounds: trebleOnlyEyes(prev.oddRounds), evenRounds: trebleOnlyEyes(prev.evenRounds),
        }));
        setters.setShowChordsOddRounds?.(false);
        setters.setShowChordsEvenRounds?.(false);
        // #661 (Han UAT): a side-scroll level is ONE continuous piece — it must NOT paginate, or the melody
        // (and its slimes) get sliced to a single page and only part of the measures scroll in ("5 of 8").
        // 'wipe' does not slice the melody (only 'pagination' does); the static staff is hidden anyway.
        if (lvl.sideScroll) setters.setAnimationMode?.('wipe');
    }, [setters]);

    const begin = useCallback((lvl) => {
        applyConfig(lvl);
        setStats(emptyStats()); setWave(0); setDone(false); setActive(true);
        regenerate();   // first wave, from the just-applied config (setters update refs synchronously)
    }, [applyConfig, regenerate]);

    const start = useCallback((lvl = LEVEL1) => { snapRef.current = snapshot(); setCurrent(lvl); begin(lvl); }, [snapshot, begin]);
    const replay = useCallback(() => begin(currentRef.current), [begin]);   // keep the snapshot; restart the run

    // combat stat hooks (only meaningful while active — the app passes these only then).
    // `grade` = { category, points } from gradeHit (side-scroll); undefined for ungraded (Level 1) hits.
    const onHit = useCallback((grade) => setStats((s) => {
        const cs = s.currentStreak + 1;
        const g = grade || { category: null, points: 1 };
        return {
            ...s, defeated: s.defeated + 1, currentStreak: cs, longestStreak: Math.max(s.longestStreak, cs),
            points: s.points + g.points,
            ...(g.category ? { [g.category]: (s[g.category] || 0) + 1 } : {}),
        };
    }), []);
    // `reason` = 'wrongNote' (wrong pitch while a slime was hittable) | 'miss' (outside every window / note
    // never played). Both break the streak; wrong notes get their own stat row (Han).
    const onMiss = useCallback((reason) => setStats((s) => ({
        ...s, misses: s.misses + 1, currentStreak: 0,
        ...(reason === 'wrongNote' ? { wrongNotes: s.wrongNotes + 1 } : {}),
    })), []);

    // a cleared slime-wave. Returns true if the level consumed it (so the app skips its default regen). At the
    // target wave count → done (splash); otherwise spawn the next wave.
    const onWaveCleared = useCallback(() => {
        if (!activeRef.current) return false;
        const tw = wavesForLevel(currentRef.current);
        setWave((w) => {
            const next = w + 1;
            if (next >= tw) setDone(true);
            else regenerate();
            return next;
        });
        return true;
    }, [regenerate]);

    const restore = useCallback(() => {
        const s = snapRef.current;
        if (!s) return;
        setters.setNumMeasures(s.numMeasures);
        setters.setBpm?.(s.bpm);
        setters.setTrebleSettings(() => s.trebleSettings);
        setters.setPlaybackConfig(() => s.playbackConfig);
        setters.setShowChordsOddRounds?.(s.showChordsOddRounds);
        setters.setShowChordsEvenRounds?.(s.showChordsEvenRounds);
        setters.setAnimationMode?.(s.animationMode);   // restore the user's animation mode (see applyConfig)
    }, [setters]);

    const close = useCallback(() => {
        restore();
        setActive(false); setDone(false); setWave(0);
        regenerate();   // rebuild a normal melody from the restored config
    }, [restore, regenerate]);

    return { active, done, wave, totalWaves, stats, current, start, replay, close, onHit, onMiss, onWaveCleared };
}
