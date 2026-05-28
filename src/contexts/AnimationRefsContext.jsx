import React, { createContext, useContext, useMemo } from 'react';

const AnimationRefsContext = createContext(null);

export const AnimationRefsProvider = ({
    wipeTransitionRef, scrollTransitionRef, paginationFadeRef,
    transitionRef,
    clearHighlightStateRef, showNoteHighlightRef, setCurrentMeasureIndex,
    sequencerRef, context,
    children,
}) => {
    // All values here are refs / setters with stable identity across renders,
    // so memoising the value object on its identity-stable dependencies
    // produces a context value that NEVER changes after first mount. Without
    // useMemo the value object got a new reference on every App re-render,
    // forcing every consumer to re-render too.
    const value = useMemo(() => ({
        wipeTransitionRef, scrollTransitionRef, paginationFadeRef,
        transitionRef,
        clearHighlightStateRef, showNoteHighlightRef, setCurrentMeasureIndex,
        sequencerRef, context,
    }), [
        wipeTransitionRef, scrollTransitionRef, paginationFadeRef,
        transitionRef,
        clearHighlightStateRef, showNoteHighlightRef, setCurrentMeasureIndex,
        sequencerRef, context,
    ]);
    return (
        <AnimationRefsContext.Provider value={value}>
            {children}
        </AnimationRefsContext.Provider>
    );
};

export const useAnimationRefs = () => useContext(AnimationRefsContext);

export default AnimationRefsContext;
