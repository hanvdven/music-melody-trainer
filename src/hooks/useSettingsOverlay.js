import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Manages the sheet-music settings overlay visibility with an auto-hide timer.
 * When the overlay is shown, it auto-hides after `delay` ms of inactivity.
 * `resetSettingsTimer(delay)` restarts the countdown (e.g. on user interaction).
 */
export default function useSettingsOverlay() {
    const [showSheetMusicSettings, setShowSheetMusicSettings] = useState(false);
    const settingsTimerRef = useRef(null);

    // Auto-hide settings after 5 seconds of inactivity
    useEffect(() => {
        if (showSheetMusicSettings) {
            if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
            settingsTimerRef.current = setTimeout(() => {
                setShowSheetMusicSettings(false);
            }, 5000);
        }
        return () => {
            if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
        };
    }, [showSheetMusicSettings]);

    // delay = 5000 for normal interactions, 10000 when a picker/list is open
    const resetSettingsTimer = useCallback((delay = 5000) => {
        if (!showSheetMusicSettings) return;
        if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
        settingsTimerRef.current = setTimeout(() => {
            setShowSheetMusicSettings(false);
        }, delay);
    }, [showSheetMusicSettings]);

    const toggleSheetMusicSettings = useCallback(() => setShowSheetMusicSettings(p => !p), []);

    return { showSheetMusicSettings, toggleSheetMusicSettings, resetSettingsTimer };
}
