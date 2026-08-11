import React, { createContext, useContext, useMemo } from 'react';

const MelodyContext = createContext(null);

// #858: stable empty object so omitting `invisibleMelodies` doesn't create a new {} every render
// (which would defeat the useMemo below and re-render every consumer on every App.jsx render).
const EMPTY_INVISIBLE_MELODIES = {};

export const MelodyProvider = ({ treble, bass, percussion, metronome, chordProgression, invisibleMelodies, children }) => {
    // Memoise so consumers don't re-render on every parent render when the
    // melody refs themselves haven't changed.
    // #858 (Han 2026-08-10): `invisibleMelodies` carries audio-only Melody instances (keyed by the
    // fixed `invisibleMelody1..10` slot names from constants/melodyInstances.js) — layers that are
    // scheduled/played but never drawn by SheetMusic (e.g. the level's timpani pattern). Optional;
    // defaults to a stable empty object so `useMelodies().invisibleMelodies?.[slot]` is always safe.
    const value = useMemo(
        () => ({ treble, bass, percussion, metronome, chordProgression, invisibleMelodies: invisibleMelodies || EMPTY_INVISIBLE_MELODIES }),
        [treble, bass, percussion, metronome, chordProgression, invisibleMelodies],
    );
    return (
        <MelodyContext.Provider value={value}>
            {children}
        </MelodyContext.Provider>
    );
};

export const useMelodies = () => useContext(MelodyContext);

export default MelodyContext;
