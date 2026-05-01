import { useState, useRef, useCallback } from 'react';
import playSound from '../audio/playSound';
import {
    ENHARMONIC_PAIRS,
    updateScaleWithTonic,
    updateScaleWithMode,
    getBestEnharmonicTonic,
} from '../theory/scaleHandler';
import { calculateRelativeRange } from '../theory/musicUtils';
import { getHarmonyAtDifficulty } from '../utils/harmonyTable';

/**
 * Owns scale-related state and handlers.
 *
 * State:
 * - `tonic`, `setTonic(newTonic, isManualOverride)` — applies getBestEnharmonicTonic
 *   when minimize-accidentals is on (unless manually overridden), syncs treble/bass
 *   ranges via calculateRelativeRange, and updates the scale.
 * - `selectedMode`, `setSelectedMode(newMode)` — updates mode and re-runs
 *   getBestEnharmonicTonic for the new mode.
 * - `isScalePlaying` — true while handleScaleClick is playing audio.
 *
 * Handlers:
 * - `handleScaleClick` — plays the scale's notes sequentially.
 * - `handleEnharmonicToggle` — toggles tonic to its enharmonic equivalent (F♯↔G♭).
 * - `applyHarmonyAtDifficulty(target)` — picks (family, mode, tonic) matching the
 *   target harmonic difficulty within ±0.5 and applies it.
 *
 * NOTE: setTonic, setSelectedMode, and applyHarmonyAtDifficulty all use `_setScale`
 * (the raw setter) directly — preserving the existing behavior where scaleRef.current
 * is NOT synced via these paths. If you need scaleRef sync, use the wrapped setScale.
 */
export default function useScaleManagement({
    context,
    instruments,
    scale,
    setScale,            // wrapped (updates scaleRef) — used by handleEnharmonicToggle
    _setScale,           // raw setter — used by setTonic / setSelectedMode / applyHarmonyAtDifficulty
    bpmRef,
    instrumentSettingsRef,
    setTrebleSettings,
    setBassSettings,
    minimizeAccidentals,
    playbackConfig,
}) {
    const [isScalePlaying, setIsScalePlaying] = useState(false);
    const scalePlayTimerRef = useRef(null);

    const [tonic, _setTonic] = useState('C4');
    const [selectedMode, _setSelectedMode] = useState('Major');

    // Internal: sync treble/bass ranges synchronously to prevent lag between
    // tonic change and melody generation.
    const syncRangesForTonic = useCallback((newTonic) => {
        const trebleRange = calculateRelativeRange('treble', instrumentSettingsRef.current.treble?.rangeMode, newTonic);
        if (trebleRange) {
            setTrebleSettings(p => ({ ...p, range: trebleRange }));
        }
        const bassRange = calculateRelativeRange('bass', instrumentSettingsRef.current.bass?.rangeMode, newTonic);
        if (bassRange) {
            setBassSettings(p => ({ ...p, range: bassRange }));
        }
    }, [instrumentSettingsRef, setTrebleSettings, setBassSettings]);

    const setTonic = useCallback((newTonic, isManualOverride = false) => {
        let finalTonic = newTonic;
        // Apply minimization only if NOT manually overridden and toggle is ON
        if (minimizeAccidentals && !isManualOverride) {
            finalTonic = getBestEnharmonicTonic(newTonic, selectedMode);
        }
        _setTonic(finalTonic);

        syncRangesForTonic(finalTonic);

        // Also update scale since tonic usually changes scale
        _setScale((prev) => {
            if (!prev) return prev;
            return updateScaleWithTonic({ currentScale: prev, newTonic: finalTonic });
        });
    }, [minimizeAccidentals, selectedMode, syncRangesForTonic, _setScale]);

    const setSelectedMode = useCallback((newMode) => {
        _setSelectedMode(newMode);

        // When mode changes, if minimize is on, we might need a better tonic for THIS mode
        if (minimizeAccidentals) {
            _setTonic((prevTonic) => {
                const bestTonic = getBestEnharmonicTonic(prevTonic, newMode);
                if (bestTonic !== prevTonic) {
                    // Update scale too if we switched tonic
                    _setScale((prevScale) => {
                        if (!prevScale) return prevScale;
                        return updateScaleWithTonic({ currentScale: prevScale, newTonic: bestTonic });
                    });

                    syncRangesForTonic(bestTonic);

                    return bestTonic;
                }
                return prevTonic;
            });
        }
    }, [minimizeAccidentals, syncRangesForTonic, _setScale]);

    /**
     * Picks a random (family, mode, tonic) whose harmonic difficulty matches
     * `target` within ±0.5 and applies it to the current scale.
     */
    const applyHarmonyAtDifficulty = useCallback((target) => {
        const rand = playbackConfig.randomize;
        const constraints = {
            fixedTonic: !rand.tonic ? scale.displayTonic?.replace(/\d+$/, '') ?? scale.tonic.replace(/\d+$/, '') : null,
            fixedFamily: rand.family === false ? scale.family : null,
            fixedMode: (rand.family === false && !rand.mode) ? scale.name : null,
        };
        const entry = getHarmonyAtDifficulty(target, 0.5, constraints);
        if (!entry) return;
        if (rand.family !== false || rand.mode) {
            _setScale((prev) => updateScaleWithMode({ currentScale: prev, newFamily: entry.family, newMode: entry.modeName }));
            _setSelectedMode(entry.modeName);
        }
        if (rand.tonic) {
            setTonic(entry.tonic + '4');
        }
    }, [playbackConfig, scale, _setScale, setTonic]);

    // Play all scale notes sequentially when the scale name in the header is clicked.
    const handleScaleClick = useCallback(async () => {
        if (!context || !instruments.treble || !scale?.notes?.length) return;
        try {
            if (context.state !== 'running') await context.resume();
            const spacing = 60 / Math.max(60, bpmRef.current || 120);
            scale.notes.forEach((note, i) => {
                playSound(note, instruments.treble, context, context.currentTime + i * spacing, spacing * 0.9, 1, null);
            });
            setIsScalePlaying(true);
            if (scalePlayTimerRef.current) clearTimeout(scalePlayTimerRef.current);
            const totalMs = scale.notes.length * spacing * 1000;
            scalePlayTimerRef.current = setTimeout(() => setIsScalePlaying(false), totalMs);
        } catch {}
    }, [context, instruments.treble, scale, bpmRef]);

    // Toggle tonic to its enharmonic equivalent when the key-signature accidentals are clicked.
    // E.g. F♯ major ↔ G♭ major. Uses ENHARMONIC_PAIRS (pitch-class → enharmonic pitch-class).
    const handleEnharmonicToggle = useCallback(() => {
        setScale(prev => {
            if (!prev?.tonic) return prev;
            // Strip octave suffix to get pitch class, then look up enharmonic spelling.
            const tonicPC = prev.tonic.replace(/\d+$/, '');
            const altPC = ENHARMONIC_PAIRS[tonicPC];
            if (!altPC) return prev; // no enharmonic exists (C, E, B, etc.)
            const octave = prev.tonic.match(/\d+$/)?.[0] ?? '4';
            const newTonic = altPC + octave;
            return updateScaleWithTonic({ currentScale: prev, newTonic });
        });
    }, [setScale]);

    return {
        // State
        tonic,
        selectedMode,
        isScalePlaying,
        // Setters / handlers
        setTonic,
        setSelectedMode,
        applyHarmonyAtDifficulty,
        handleScaleClick,
        handleEnharmonicToggle,
    };
}
