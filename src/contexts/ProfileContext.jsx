import React, { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'music-trainer-profile';

// Scale families in display order (matches scaleDefinitions keys + Simple)
export const ALL_SCALE_FAMILIES = [
    'Simple',
    'Diatonic',
    'Pentatonic',
    'Melodic',
    'Harmonic Minor',
    'Harmonic Major',
    'Hexatonic',
    'Double Harmonic',
    'Other Heptatonic',
    'Supertonic',
];

const DEFAULT_UNLOCKED = new Set(['Diatonic', 'Simple']);

function loadProfile() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveProfile(profile) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
        // Storage unavailable — ignore silently
    }
}

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
    const [state, setState] = useState(() => {
        const saved = loadProfile();
        return {
            unlockedFamilies: saved?.unlockedFamilies
                ? new Set(saved.unlockedFamilies)
                : new Set(DEFAULT_UNLOCKED),
            debugMode: saved?.debugMode ?? false,
        };
    });

    const setDebugMode = useCallback((enabled) => {
        setState(prev => {
            const next = { ...prev, debugMode: enabled };
            saveProfile({ unlockedFamilies: [...next.unlockedFamilies], debugMode: next.debugMode });
            return next;
        });
    }, []);

    const toggleFamily = useCallback((family) => {
        // Toggling lock state requires debug mode — in normal use, lessons control locks
        setState(prev => {
            if (!prev.debugMode) return prev;
            const next = new Set(prev.unlockedFamilies);
            if (next.has(family)) {
                next.delete(family);
            } else {
                next.add(family);
            }
            const nextState = { ...prev, unlockedFamilies: next };
            saveProfile({ unlockedFamilies: [...next], debugMode: nextState.debugMode });
            return nextState;
        });
    }, []);

    // Returns true when the family can be used (based on unlock state only — debug doesn't auto-unlock)
    const isFamilyUnlocked = useCallback((family) => {
        return state.unlockedFamilies.has(family);
    }, [state]);

    // Expose the raw unlock set (same as isFamilyUnlocked but for consumers that need the set)
    const activeFamilies = state.unlockedFamilies;

    return (
        <ProfileContext.Provider value={{
            unlockedFamilies: state.unlockedFamilies,
            activeFamilies,
            debugMode: state.debugMode,
            setDebugMode,
            toggleFamily,
            isFamilyUnlocked,
        }}>
            {children}
        </ProfileContext.Provider>
    );
}

export function useProfile() {
    const ctx = useContext(ProfileContext);
    if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
    return ctx;
}
