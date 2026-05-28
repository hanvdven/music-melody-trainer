import React, { createContext, useContext, useMemo } from 'react';

/**
 * RoundStateContext — round-flip + show-notes + input-test state.
 *
 * These values update on the boundary of every block (~1× per measure
 * during continuous playback). Splitting them out of the monolithic
 * PlaybackStateContext means consumers that only need transport state
 * (isPlaying) or transition state (previewMelody) don't get re-rendered
 * each tick.
 *
 * Holds:
 * - isOddRound — flips per block; reads e.g. odd/evenRounds playbackConfig
 * - showNotes — user toggles, but also flipped per block when "showOnce"
 * - inputTestState — derived from sequencer + user input
 * - inputTestSubMode + setInputTestSubMode — mode setter passed down
 */
const RoundStateContext = createContext(null);

export const RoundStateProvider = ({
  isOddRound,
  showNotes,
  inputTestState,
  inputTestSubMode,
  setInputTestSubMode,
  children,
}) => {
  const value = useMemo(() => ({
    isOddRound,
    showNotes,
    inputTestState,
    inputTestSubMode,
    setInputTestSubMode,
  }), [isOddRound, showNotes, inputTestState, inputTestSubMode, setInputTestSubMode]);
  return (
    <RoundStateContext.Provider value={value}>
      {children}
    </RoundStateContext.Provider>
  );
};

export const useRoundState = () => useContext(RoundStateContext);

export default RoundStateContext;
