import React, { createContext, useContext } from 'react';

const MelodyContext = createContext(null);

export const MelodyProvider = ({ treble, bass, percussion, metronome, chordProgression, children }) => (
    <MelodyContext.Provider value={{ treble, bass, percussion, metronome, chordProgression }}>
        {children}
    </MelodyContext.Provider>
);

export const useMelodies = () => useContext(MelodyContext);

export default MelodyContext;
