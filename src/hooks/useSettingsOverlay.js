import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Manages the sheet-music settings overlay visibility with an auto-hide timer.
 * When the overlay is shown, it auto-hides after `delay` ms of inactivity.
 * `resetSettingsTimer(delay)` restarts the countdown (e.g. on user interaction).
 *
 * Click-outside-to-close (Han 2026-05-28): a pointerdown anywhere outside the
 * `.settings-overlay` SVG group OR outside an element marked
 * `data-settings-keepalive` closes the overlay. Clicks inside the overlay
 * keep it open (and are handled by the overlay's own handlers). The handler
 * is only attached while the overlay is open.
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

    // Click-outside-to-close. Listens for pointerdown on the document; if the
    // target is NOT inside `.settings-overlay` (the in-SVG settings group)
    // and NOT inside any explicit `data-settings-keepalive` ancestor (escape
    // hatch for floating pickers / portal'd menus), close the overlay.
    // Pointerdown (capture phase) fires before any synthetic React click, so
    // the close happens cleanly even if the click would otherwise be handled
    // by another component.
    useEffect(() => {
        if (!showSheetMusicSettings) return;
        const onPointerDown = (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (t.closest('.settings-overlay')) return;
            if (t.closest('[data-settings-keepalive]')) return;
            setShowSheetMusicSettings(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
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
