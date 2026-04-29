import React, { createContext, useContext } from 'react';

/**
 * PlaybackConfigContext — distributes playback configuration state.
 *
 * Values provided:
 *   playbackConfig, setPlaybackConfig, toggleRoundSetting
 *
 * toggleRoundSetting is included here (despite touching instrument settings)
 * because it primarily mutates playbackConfig and is always consumed alongside it.
 */
const PlaybackConfigContext = createContext(null);

export function PlaybackConfigProvider({ value, children }) {
    return (
        <PlaybackConfigContext.Provider value={value}>
            {children}
        </PlaybackConfigContext.Provider>
    );
}

export function usePlaybackConfig() {
    const ctx = useContext(PlaybackConfigContext);
    if (!ctx) throw new Error('usePlaybackConfig must be used within PlaybackConfigProvider');
    return ctx;
}

export default PlaybackConfigContext;
