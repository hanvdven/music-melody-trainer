import { useCallback, useEffect } from 'react';
import { VOLUME_LEVELS } from '../constants/generatorDefaults';
import logger from '../utils/logger';

/**
 * Extracts three substantial App-level handlers and the Option+P shortcut:
 *   - toggleRoundSetting — cycles volume/visibility for one instrument in one round
 *   - handleTimeSignatureChange — increments/decrements/cycles time signature values
 *   - generateChords — wrapper that also updates App-level chordProgression state
 *
 * Note: randomizeAll is NOT computed here because it must be available before usePlayback
 * (which needs it as an input), creating a call-order dependency that would require
 * randomizeAll to exist before isPlayingContinuously does. It stays as a 5-line wrapper
 * in App.jsx and is passed in as an input for handleTimeSignatureChange's dep array.
 */
export default function useAppHandlers({
    setActivePreset,
    setPlaybackConfig,
    setTrebleSettings,
    setBassSettings,
    setPercussionSettings,
    setChordSettings,
    timeSignature,
    setTimeSignature,
    isPlayingContinuously,
    randomizeAll,
    generateChordsLogic,
    chordSettings,
    setChordProgression,
    playbackConfig,
}) {
    const toggleRoundSetting = useCallback((round, instrument, type = 'audio') => {
        if (setActivePreset) setActivePreset('custom');
        const field = type === 'visual' ? `${instrument}Eye` : instrument;

        setPlaybackConfig((prev) => {
            const current = prev[round][field];
            let next;

            if (type === 'visual') {
                if (instrument === 'percussion') {
                    // Eye (true) -> Metronome ('metronome') -> EyeOff (false)
                    if (current === true) next = 'metronome';
                    else if (current === 'metronome') next = false;
                    else next = true;
                } else {
                    next = !current;
                }
            } else {
                // Volume cycle: f → mf → mp → p → pp → // → f
                const idx = VOLUME_LEVELS.findIndex(v => Math.abs(v - current) < 0.05);
                next = VOLUME_LEVELS[(idx < 0 ? 0 : idx + 1) % VOLUME_LEVELS.length];
            }

            const nextConfig = { ...prev, [round]: { ...prev[round], [field]: next } };

            // If enabling 'chords' audio, apply the recommended presets
            if (instrument === 'chords' && type === 'audio' && current === 0 && next > 0) {
                if (setTrebleSettings) setTrebleSettings(p => ({ ...p, notePool: 'scale', randomizationRule: 'weighted' }));
                if (setBassSettings) setBassSettings(p => ({ ...p, notePool: 'chord', randomizationRule: 'emphasize_roots' }));
                if (setPercussionSettings) setPercussionSettings(p => ({ ...p, notePool: 'all', randomizationRule: 'uniform' }));
                if (setChordSettings) setChordSettings(p => ({ ...p, strategy: 'modal-random' }));
            }

            return nextConfig;
        });
    }, [setActivePreset, setPlaybackConfig, setTrebleSettings, setBassSettings, setPercussionSettings, setChordSettings]);

    // OPTION+p → set all instrument volumes to pp (pianissimo)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!e.altKey || e.code !== 'KeyP') return;
            e.preventDefault();
            setPlaybackConfig((prev) => ({
                ...prev,
                oddRounds: { ...prev.oddRounds, treble: 0.2, bass: 0.2, chords: 0.2, percussion: 0.2 },
                evenRounds: { ...prev.evenRounds, treble: 0.2, bass: 0.2, chords: 0.2, percussion: 0.2 },
            }));
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setPlaybackConfig]);

    // Wrapper for generateChords from useMelodyState: also updates App-level chordProgression
    const generateChords = useCallback((strategy) => {
        const nextProgression = generateChordsLogic(strategy || chordSettings.strategy);
        setChordProgression(nextProgression);
        return nextProgression;
    }, [generateChordsLogic, chordSettings.strategy, setChordProgression]);

    const handleTimeSignatureChange = useCallback((type, value) => {
        // Compute new TS inline. Using setTimeSignature(scalar) updates tsRef.current
        // synchronously, so randomizeAll (which reads tsRef.current) can use the new
        // TS immediately. All setState calls inside one event handler are batched by
        // React 18 into a single commit — so the render sees new TS + new melodies
        // together, eliminating the intermediate frame that caused SheetMusic to crash.
        const [top, bottom] = timeSignature;
        let newTS;
        if (type === 'incrementTop') newTS = [Math.min(32, top + 1), bottom];
        else if (type === 'decrementTop') newTS = [Math.max(1, top - 1), bottom];
        else if (type === 'cycleBottom') newTS = [top, bottom === 16 ? 2 : bottom * 2];
        else if (type === 'cycleBottomBackward') newTS = [top, Math.max(2, bottom / 2)];
        else if (type === 'setTop') {
            // Direct numeric input from long-press prompt dialog; value arrives as a string
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) newTS = [Math.max(1, Math.min(32, parsed)), bottom];
        }
        if (!newTS) return;

        setTimeSignature(newTS); // also updates tsRef.current synchronously

        if (isPlayingContinuously) {
            try {
                // We keep randomizeAll here for Time Signature changes
                // until we implement the "graceful partial-measure display" feature
                randomizeAll(playbackConfig.randomize);
            } catch (e) {
                logger.error('App', 'E006-TIMESIG-REGEN', e);
            }
        }
    }, [timeSignature, setTimeSignature, isPlayingContinuously, randomizeAll, playbackConfig.randomize]);

    return { toggleRoundSetting, handleTimeSignatureChange, generateChords, randomizeAll };
}
