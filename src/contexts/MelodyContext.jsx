import React, { createContext, useContext, useMemo } from 'react';

const MelodyContext = createContext(null);

export const MelodyProvider = ({ treble, bass, percussion, metronome, chordProgression, children }) => {
    // Memoise so consumers don't re-render on every parent render when the
    // melody refs themselves haven't changed.
    const value = useMemo(
        () => ({ treble, bass, percussion, metronome, chordProgression }),
        [treble, bass, percussion, metronome, chordProgression],
    );
    return (
        <MelodyContext.Provider value={value}>
            {children}
        </MelodyContext.Provider>
    );
};

export const useMelodies = () => useContext(MelodyContext);

export default MelodyContext;
