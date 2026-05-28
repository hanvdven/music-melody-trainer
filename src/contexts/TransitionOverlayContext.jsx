import React, { createContext, useContext, useMemo } from 'react';

/**
 * TransitionOverlayContext — preview / overlay state for pagination + wipe.
 *
 * Holds `nextLayer` and `previewMelody`. These are non-null only during
 * an active transition (a fraction of the session). Outside transitions
 * both are null and the value object is stable, so consumers that depend
 * only on transport / round state do not re-render when a transition
 * arms or completes.
 *
 * Split from the legacy PlaybackStateContext so PreviewOverlay (the only
 * heavy consumer of transition state) doesn't drag MelodyNotesLayer /
 * ChordLabelsLayer caches into invalidation each time previewMelody
 * changes.
 */
const TransitionOverlayContext = createContext(null);

export const TransitionOverlayProvider = ({ nextLayer, previewMelody, iterInCurrentSeries, children }) => {
  const value = useMemo(
    () => ({ nextLayer, previewMelody, iterInCurrentSeries }),
    [nextLayer, previewMelody, iterInCurrentSeries]
  );
  return (
    <TransitionOverlayContext.Provider value={value}>
      {children}
    </TransitionOverlayContext.Provider>
  );
};

export const useTransitionOverlay = () => useContext(TransitionOverlayContext);

export default TransitionOverlayContext;
