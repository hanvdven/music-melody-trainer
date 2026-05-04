import React, { createContext, useContext } from 'react';

const PlaybackStateContext = createContext(null);

export const PlaybackStateProvider = ({
    isPlaying, isOddRound, currentMeasureIndex,
    inputTestState, inputTestSubMode, setInputTestSubMode,
    children,
}) => (
    <PlaybackStateContext.Provider value={{
        isPlaying, isOddRound, currentMeasureIndex,
        inputTestState, inputTestSubMode, setInputTestSubMode,
    }}>
        {children}
    </PlaybackStateContext.Provider>
);

export const usePlaybackState = () => useContext(PlaybackStateContext);

export default PlaybackStateContext;
