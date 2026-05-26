import React, { createContext, useContext, useMemo } from 'react';

const PlaybackStateContext = createContext(null);

export const PlaybackStateProvider = ({
    isPlaying, isPlayingContinuously, isOddRound,
    showNotes, nextLayer, previewMelody,
    inputTestState, inputTestSubMode, setInputTestSubMode,
    children,
}) => {
    // Memoise the value object so consumers don't re-render when an unrelated
    // App-level state update happens to trigger a re-render of this Provider.
    // currentMeasureIndex was removed from this context entirely (2026-05-25): it
    // changed on every measure tick (~once per second) but NO consumer reads it —
    // the leftover prop forced every consumer (TabView, SheetMusic) to re-render
    // on every tick because the value object's reference flipped each time.
    const value = useMemo(() => ({
        isPlaying, isPlayingContinuously, isOddRound,
        showNotes, nextLayer, previewMelody,
        inputTestState, inputTestSubMode, setInputTestSubMode,
    }), [
        isPlaying, isPlayingContinuously, isOddRound,
        showNotes, nextLayer, previewMelody,
        inputTestState, inputTestSubMode, setInputTestSubMode,
    ]);
    return (
        <PlaybackStateContext.Provider value={value}>
            {children}
        </PlaybackStateContext.Provider>
    );
};

export const usePlaybackState = () => useContext(PlaybackStateContext);

export default PlaybackStateContext;
