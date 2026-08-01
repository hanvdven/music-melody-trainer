import { useState, useRef, useCallback } from 'react';
import { LEVEL1, wavesForLevel, trebleOnlyEyes } from '../levels/levels';

// #659 Level orchestration. Applies a level's config (snapshotting the prior config to restore on close),
// accumulates combat stats (defeated / misses / longest streak), counts cleared waves, and flags completion
// so the app can show the "Well done!" splash. Pure state machine — the app wires the setters + regenerate.

const emptyStats = () => ({ defeated: 0, misses: 0, currentStreak: 0, longestStreak: 0 });

// `setters` — the app state setters the level drives. `snapshot()` returns the current config to restore.
// `regenerate()` builds a fresh melody (a new wave) from the CURRENT settings (call AFTER applying config).
export default function useLevel({ setters, snapshot, regenerate }) {
    const level = LEVEL1;
    const totalWaves = wavesForLevel(level);

    const [active, setActive] = useState(false);
    const [wave, setWave] = useState(0);
    const [done, setDone] = useState(false);
    const [stats, setStats] = useState(emptyStats);
    const snapRef = useRef(null);
    const activeRef = useRef(false); activeRef.current = active;

    const applyConfig = useCallback(() => {
        setters.setNumMeasures(level.numMeasures);
        setters.setStartMeasureIndex?.(0);   // Han: a new level restarts the measure numbering from 1
        setters.setTrebleSettings((prev) => ({
            ...prev, notesPerMeasure: level.notesPerMeasure, rhythmVariability: level.variability,
            range: level.range, rangeMode: 'fixed',
        }));
        // repeats live in playbackConfig.repsPerMelody; treble-only via the round `eyes`.
        setters.setPlaybackConfig((prev) => ({
            ...prev, repsPerMelody: level.numRepeats,
            oddRounds: trebleOnlyEyes(prev.oddRounds), evenRounds: trebleOnlyEyes(prev.evenRounds),
        }));
        setters.setShowChordsOddRounds?.(false);
        setters.setShowChordsEvenRounds?.(false);
    }, [setters, level]);

    const begin = useCallback(() => {
        applyConfig();
        setStats(emptyStats()); setWave(0); setDone(false); setActive(true);
        regenerate();   // first wave, from the just-applied config (setters update refs synchronously)
    }, [applyConfig, regenerate]);

    const start = useCallback(() => { snapRef.current = snapshot(); begin(); }, [snapshot, begin]);
    const replay = useCallback(() => begin(), [begin]);   // keep the snapshot; just restart the run

    // combat stat hooks (only meaningful while active — the app passes these only then).
    const onHit = useCallback(() => setStats((s) => {
        const cs = s.currentStreak + 1;
        return { ...s, defeated: s.defeated + 1, currentStreak: cs, longestStreak: Math.max(s.longestStreak, cs) };
    }), []);
    const onMiss = useCallback(() => setStats((s) => ({ ...s, misses: s.misses + 1, currentStreak: 0 })), []);

    // a cleared slime-wave. Returns true if the level consumed it (so the app skips its default regen). At the
    // target wave count → done (splash); otherwise spawn the next wave.
    const onWaveCleared = useCallback(() => {
        if (!activeRef.current) return false;
        setWave((w) => {
            const next = w + 1;
            if (next >= totalWaves) setDone(true);
            else regenerate();
            return next;
        });
        return true;
    }, [totalWaves, regenerate]);

    const restore = useCallback(() => {
        const s = snapRef.current;
        if (!s) return;
        setters.setNumMeasures(s.numMeasures);
        setters.setTrebleSettings(() => s.trebleSettings);
        setters.setPlaybackConfig(() => s.playbackConfig);
        setters.setShowChordsOddRounds?.(s.showChordsOddRounds);
        setters.setShowChordsEvenRounds?.(s.showChordsEvenRounds);
    }, [setters]);

    const close = useCallback(() => {
        restore();
        setActive(false); setDone(false); setWave(0);
        regenerate();   // rebuild a normal melody from the restored config
    }, [restore, regenerate]);

    return { active, done, wave, totalWaves, stats, level, start, replay, close, onHit, onMiss, onWaveCleared };
}
