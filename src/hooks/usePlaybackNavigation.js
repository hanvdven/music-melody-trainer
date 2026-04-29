import { useCallback } from 'react';

/**
 * Handles skip-back, skip-forward, and measure-number-click navigation.
 * In pagination mode, first attempts to navigate between blocks within the current melody;
 * otherwise navigates through melody history.
 */
export default function usePlaybackNavigation({
    animationMode,
    musicalBlocks,
    startMeasureIndex,
    setStartMeasureIndex,
    numMeasures,
    navigateHistory,
    setScale,
    _setTonic,
    isPlayingContinuously,
    isPlayingMelody,
    handleStopAllPlayback,
    startSequencer,
    setIsPlayingMelody,
    setIsPlayingContinuously,
    melodies,
}) {
    const handleMeasureNumberClick = useCallback((globalIdx) => {
        setStartMeasureIndex(globalIdx);
        if (isPlayingContinuously || isPlayingMelody) handleStopAllPlayback();
    }, [setStartMeasureIndex, isPlayingContinuously, isPlayingMelody, handleStopAllPlayback]);

    const handleSkipBack = useCallback(() => {
        // PAGINATION: Try to go to previous block first
        if (animationMode === 'pagination' && musicalBlocks.length > 1) {
            const localS = startMeasureIndex % (numMeasures || 1);
            let cumulative = 0;
            let currentBlockIdx = -1;
            for (let i = 0; i < musicalBlocks.length; i++) {
                if (localS >= cumulative && localS < cumulative + musicalBlocks[i]) {
                    currentBlockIdx = i;
                    break;
                }
                cumulative += musicalBlocks[i];
            }

            if (currentBlockIdx > 0) {
                const prevBlockStart = cumulative - musicalBlocks[currentBlockIdx - 1];
                const newGlobalStart = Math.floor(startMeasureIndex / (numMeasures || 1)) * (numMeasures || 1) + prevBlockStart;
                setStartMeasureIndex(newGlobalStart);

                if (isPlayingContinuously || isPlayingMelody) {
                    handleStopAllPlayback();
                    setTimeout(() => {
                        const melodiesData = { treble: melodies.treble, bass: melodies.bass, percussion: melodies.percussion, chordProgression: melodies.chordProgression };
                        startSequencer(melodiesData, isPlayingMelody, newGlobalStart);
                        if (isPlayingMelody) setIsPlayingMelody(true);
                        else setIsPlayingContinuously(true);
                    }, 50);
                }
                return;
            }
        }

        const entry = navigateHistory('back');
        if (entry) {
            // Update UI/Refs
            if (entry.scale) setScale(entry.scale);
            if (entry.tonic) _setTonic(entry.tonic);

            // To provide a consistent experience, skipping back to a previous melody
            // starts it from the beginning (index 0).
            const newStartIdx = 0;
            setStartMeasureIndex(newStartIdx);

            if (isPlayingContinuously || isPlayingMelody) {
                handleStopAllPlayback();
                setTimeout(() => {
                    startSequencer(entry, isPlayingMelody, newStartIdx);
                    if (isPlayingMelody) setIsPlayingMelody(true);
                    else setIsPlayingContinuously(true);
                }, 50);
            }
        }
    }, [
        animationMode, musicalBlocks, startMeasureIndex, numMeasures,
        navigateHistory, setScale, isPlayingContinuously, isPlayingMelody,
        handleStopAllPlayback, startSequencer, melodies
    ]);

    const handleSkipForward = useCallback(() => {
        // PAGINATION: Try to go to next block first
        if (animationMode === 'pagination' && musicalBlocks.length > 1) {
            const localS = startMeasureIndex % (numMeasures || 1);
            let cumulative = 0;
            let currentBlockIdx = -1;
            for (let i = 0; i < musicalBlocks.length; i++) {
                if (localS >= cumulative && localS < cumulative + musicalBlocks[i]) {
                    currentBlockIdx = i;
                    break;
                }
                cumulative += musicalBlocks[i];
            }

            if (currentBlockIdx !== -1 && currentBlockIdx < musicalBlocks.length - 1) {
                const nextBlockStart = cumulative + musicalBlocks[currentBlockIdx];
                const newGlobalStart = Math.floor(startMeasureIndex / (numMeasures || 1)) * (numMeasures || 1) + nextBlockStart;
                setStartMeasureIndex(newGlobalStart);

                if (isPlayingContinuously || isPlayingMelody) {
                    handleStopAllPlayback();
                    setTimeout(() => {
                        const melodiesData = { treble: melodies.treble, bass: melodies.bass, percussion: melodies.percussion, chordProgression: melodies.chordProgression };
                        startSequencer(melodiesData, isPlayingMelody, newGlobalStart);
                        if (isPlayingMelody) setIsPlayingMelody(true);
                        else setIsPlayingContinuously(true);
                    }, 50);
                }
                return;
            }
        }

        const entry = navigateHistory('forward');
        if (entry) {
            if (entry.scale) setScale(entry.scale);
            if (entry.tonic) _setTonic(entry.tonic);

            const newStartIdx = 0;
            setStartMeasureIndex(newStartIdx);

            if (isPlayingContinuously || isPlayingMelody) {
                handleStopAllPlayback();
                setTimeout(() => {
                    startSequencer(entry, isPlayingMelody, newStartIdx);
                    if (isPlayingMelody) setIsPlayingMelody(true);
                    else setIsPlayingContinuously(true);
                }, 50);
            }
        }
    }, [
        animationMode, musicalBlocks, startMeasureIndex, numMeasures,
        navigateHistory, setScale, isPlayingContinuously, isPlayingMelody,
        handleStopAllPlayback, startSequencer, melodies
    ]);

    return { handleSkipBack, handleSkipForward, handleMeasureNumberClick };
}
