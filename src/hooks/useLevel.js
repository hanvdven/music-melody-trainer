import { useState, useRef, useCallback } from 'react';
import { LEVEL1, wavesForLevel, trebleOnlyEyes, threeLineEyes } from '../levels/levels';

// #659/#660 Level orchestration. Applies a level's config (snapshotting the prior config to restore on
// close), accumulates combat stats (defeated / misses / longest streak), counts cleared waves, and flags
// completion so the app can show the "Well done!" splash. Parametrised by the level def so it drives both
// Level 1 (static combat) and Level 2 (side-scroll). Pure state machine — the app wires the setters +
// regenerate.

// Graded timing stats (Han 2026-08-02): the side-scroll levels grade each kill (gradeHit — perfect /
// too fast / too slow / much too fast / much too slow) and award points (perfect = 1, everything else ½).
// Level 1 (no metronome) passes no grade → just defeated + 1 point.
//
// Well-done breakdown (Han 2026-08-02, 4 distinct outcomes for a "miss" — see SheetRpgLayer's combat
// effect for how each is resolved). Field names match the `reason`/`grade.category` strings SheetRpgLayer
// emits EXACTLY (no translation table) — see gradeHit.js's GRADE_LABELS for the display-label mapping:
//   - missed                 a due note was never attempted at all before its slime expired.
//   - wrongUncorrected       a wrong pitch was played while a slime was hittable, and never fixed in time.
//   - secondAttemptCorrected a wrong pitch was played, then CORRECTED before the slime expired (½ point).
//   - extraNote              a note was played while nothing was due at all (no slime in any window).
const emptyStats = () => ({
    defeated: 0, misses: 0, currentStreak: 0, longestStreak: 0, points: 0,
    perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0,
    secondAttemptCorrected: 0, wrongUncorrected: 0, missed: 0, extraNote: 0,
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
            // #661 rework (Han 2026-08-02): quarter-note/quarter-rest grid for Level 1/2, produced by the
            // GENERATOR (see levels.js QUARTER_GRID comment) — NOT a post-process. insertBeatRests and
            // polyMultiplier are written UNCONDITIONALLY (never `...(lvl.x ? {x} : {})`) on every level
            // switch, so a value set by a PREVIOUS level in the same session can never leak into this one
            // (e.g. Level 2 → Level 3 must not carry over insertBeatRests=true).
            insertBeatRests: !!lvl.insertBeatRests,
            polyMultiplier: lvl.polyMultiplier ?? 1,
        }));
        // #661 (Han 2026-08-02, "de 3 lijnen zichtbaar maken"): a side-scroll level shows treble + bass +
        // percussion (all 3 scroll, SheetRpgLayer) instead of the static Level-1 treble-only view.
        const eyes = lvl.sideScroll ? threeLineEyes : trebleOnlyEyes;
        setters.setPlaybackConfig((prev) => ({
            ...prev, repsPerMelody: lvl.numRepeats,
            oddRounds: eyes(prev.oddRounds), evenRounds: eyes(prev.evenRounds),
        }));
        // #661 ("gewoon op de baslijn een cello zet"): a side-scroll level's bass line plays through a
        // cello timbre — the REAL generated bass melody, via the REAL bass instrument slot (App.jsx's
        // scheduleLevelBacking schedules it with playMelodies, no separate ad-hoc Soundfont).
        if (lvl.sideScroll) setters.setBassSettings?.((prev) => ({ ...prev, instrument: 'cello' }));
        // #661 ("melodische percussie … percussie de timpanen"): percussion becomes the fixed pitched
        // timpani pattern (utils/timpaniPattern.js) — notation AND the level's dedicated timpani audio
        // both key off this flag. Written UNCONDITIONALLY (mirrors insertBeatRests/polyMultiplier above)
        // so it can never leak between levels.
        setters.setPercussionSettings?.((prev) => ({ ...prev, melodic: !!lvl.sideScroll }));
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
    // `reason` = 'missed' | 'wrongUncorrected' | 'extraNote' (see emptyStats above) — each breaks the
    // streak and bumps the total `misses` count (used for the overall accuracy %) plus its own stat row.
    const onMiss = useCallback((reason) => setStats((s) => ({
        ...s, misses: s.misses + 1, currentStreak: 0,
        ...(reason ? { [reason]: (s[reason] || 0) + 1 } : {}),
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
        setters.setBassSettings?.(() => s.bassSettings);   // restores the pre-level bass instrument (cello only during a level)
        setters.setPercussionSettings?.(() => s.percussionSettings);   // restores melodic flag + percussion kit
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
