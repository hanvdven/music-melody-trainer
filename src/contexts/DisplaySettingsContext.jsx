import React, { createContext, useContext } from 'react';

/**
 * DisplaySettingsContext — distributes UI display preferences.
 *
 * Values provided:
 *   noteColoringMode, setNoteColoringMode,
 *   debugMode,
 *   lyricsMode, setLyricsMode,
 *   chordDisplayMode, setChordDisplayMode,
 *   showNoteHighlight, setShowNoteHighlight,
 *   animationMode, setAnimationMode
 */
const DisplaySettingsContext = createContext(null);

export function DisplaySettingsProvider({ value, children }) {
    return (
        <DisplaySettingsContext.Provider value={value}>
            {children}
        </DisplaySettingsContext.Provider>
    );
}

export function useDisplaySettings() {
    const ctx = useContext(DisplaySettingsContext);
    if (!ctx) throw new Error('useDisplaySettings must be used within DisplaySettingsProvider');
    return ctx;
}

export default DisplaySettingsContext;
