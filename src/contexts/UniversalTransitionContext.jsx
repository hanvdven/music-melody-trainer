import React, { createContext, useContext } from 'react';

/**
 * UniversalTransitionContext — carries a monotonically-increasing `transitionKey`.
 *
 * App owns the key as state and bumps it (via `fireTransition`) on each universal-transition
 * TRIGGER (song load, difficulty change, tab change, setter overlay open/close). The key is
 * passed down through this prop-driven provider (mirroring TransitionOverlayProvider) so that
 * App — which is also the FIRER — never has to consume a context it provides. The sole
 * consumer is the sheet-music surface, where `useUniversalTransition` watches the key and
 * replays the 1.5s fly-in cascade when it changes.
 *
 * Default 0 keeps `useUniversalTransition`'s "skip on mount" guard correct when no provider
 * is present (e.g. in isolated tests / render harnesses).
 */
const UniversalTransitionContext = createContext(0);

export const UniversalTransitionProvider = ({ transitionKey, children }) => (
  <UniversalTransitionContext.Provider value={transitionKey}>
    {children}
  </UniversalTransitionContext.Provider>
);

export const useUniversalTransitionKey = () => useContext(UniversalTransitionContext);

export default UniversalTransitionContext;
