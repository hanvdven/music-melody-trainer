import React, { createContext, useContext, useMemo } from 'react';

/**
 * PlaybackTransportContext — the most stable slice of playback state.
 *
 * Holds only `isPlaying` and `isPlayingContinuously`. These flags flip
 * at most a handful of times during a session (start, stop, mode switch),
 * so consumers can subscribe here without paying the re-render cost that
 * round-flips (RoundStateContext) or transition windows
 * (TransitionOverlayContext) would impose.
 *
 * Split from the legacy PlaybackStateContext (which lumped transport,
 * round-flip, and transition state into a single provider). With the
 * monolith, an isOddRound update once per measure invalidated the
 * provider value object and re-rendered every consumer — including
 * MelodyNotesLayer / ChordLabelsLayer caches that we just built memo
 * walls around. Three separate providers keep those memos hot.
 */
const PlaybackTransportContext = createContext(null);

export const PlaybackTransportProvider = ({ isPlaying, isPlayingContinuously, children }) => {
  const value = useMemo(() => ({ isPlaying, isPlayingContinuously }), [isPlaying, isPlayingContinuously]);
  return (
    <PlaybackTransportContext.Provider value={value}>
      {children}
    </PlaybackTransportContext.Provider>
  );
};

export const usePlaybackTransport = () => useContext(PlaybackTransportContext);

export default PlaybackTransportContext;
