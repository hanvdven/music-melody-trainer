import React, { createContext, useContext } from 'react';

const AnimationRefsContext = createContext(null);

export const AnimationRefsProvider = ({
    wipeTransitionRef, scrollTransitionRef, pendingScrollTransitionRef, paginationFadeRef,
    clearHighlightStateRef, showNoteHighlightRef, setCurrentMeasureIndex,
    sequencerRef, context,
    children,
}) => (
    <AnimationRefsContext.Provider value={{
        wipeTransitionRef, scrollTransitionRef, pendingScrollTransitionRef, paginationFadeRef,
        clearHighlightStateRef, showNoteHighlightRef, setCurrentMeasureIndex,
        sequencerRef, context,
    }}>
        {children}
    </AnimationRefsContext.Provider>
);

export const useAnimationRefs = () => useContext(AnimationRefsContext);

export default AnimationRefsContext;
