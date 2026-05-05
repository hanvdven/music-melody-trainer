/**
 * appConfig.js
 * Persists the latest app settings to localStorage so they survive page reloads.
 *
 * Usage:
 *   import { saveConfig, loadConfig } from '../utils/appConfig';
 *
 *   // On settings change:
 *   saveConfig({ scale: 'C Major', tempo: 120, ... });
 *
 *   // On app init:
 *   const saved = loadConfig();
 *   if (saved) applySettings(saved);
 *
 * Accessible from browser console:
 *   window.appConfig.get()       → current config object
 *   window.appConfig.clear()     → wipe saved config
 *   window.appConfig.download()  → download as JSON file
 */

import logger from './logger';

const STORAGE_KEY = 'melody_trainer_config';

/** Persist the current settings object. Merges with any existing config. */
export const saveConfig = (settings) => {
    try {
        const existing = loadConfig() ?? {};
        const merged = { ...existing, ...settings, savedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
        // quota exceeded or private mode — silently ignore
    }
};

/** Load the persisted settings object, or null if nothing is saved. */
export const loadConfig = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

/** Remove saved config. */
export const clearConfig = () => {
    localStorage.removeItem(STORAGE_KEY);
};

/** Download the current config as a JSON file. */
export const downloadConfig = () => {
    const config = loadConfig();
    if (!config) { logger.warn('appConfig', 'No config saved yet.'); return; }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app_config_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

if (typeof window !== 'undefined') {
    window.appConfig = { get: loadConfig, clear: clearConfig, download: downloadConfig };
}
