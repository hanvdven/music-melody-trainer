import React, { createContext, useContext } from 'react';

/**
 * InstrumentSettingsContext — distributes per-instrument settings state.
 *
 * Values provided:
 *   trebleSettings, setTrebleSettings,
 *   bassSettings, setBassSettings,
 *   percussionSettings, setPercussionSettings,
 *   metronomeSettings, setMetronomeSettings,
 *   chordSettings, setChordSettings
 */
const InstrumentSettingsContext = createContext(null);

export function InstrumentSettingsProvider({ value, children }) {
    return (
        <InstrumentSettingsContext.Provider value={value}>
            {children}
        </InstrumentSettingsContext.Provider>
    );
}

export function useInstrumentSettings() {
    const ctx = useContext(InstrumentSettingsContext);
    if (!ctx) throw new Error('useInstrumentSettings must be used within InstrumentSettingsProvider');
    return ctx;
}

export default InstrumentSettingsContext;
