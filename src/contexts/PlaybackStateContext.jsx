import React, { createContext, useContext } from 'react';

const PlaybackStateContext = createContext(null);

export const PlaybackStateProvider = ({
    isPlaying, isPlayingContinuously, isOddRound, currentMeasureIndex,
    showNotes, nextLayer, previewMelody,
    inputTestState, inputTestSubMode, setInputTestSubMode,
    children,
}) => (
    <PlaybackStateContext.Provider value={{
        isPlaying, isPlayingContinuously, isOddRound, currentMeasureIndex,
        showNotes, nextLayer, previewMelody,
        inputTestState, inputTestSubMode, setInputTestSubMode,
    }}>
        {children}
    </PlaybackStateContext.Provider>
);

export const usePlaybackState = () => useContext(PlaybackStateContext);

export default PlaybackStateContext;
