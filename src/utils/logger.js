/**
 * Lightweight leveled logger for the music-melody-trainer app.
 *
 * Why this exists:
 * - We need a single place to control verbosity (silence noisy modules in
 *   production, opt into verbose audio scheduling debug only when needed).
 * - We need a way to attach error codes and component context to log lines so
 *   reports from users (or scheduled cloud agents) are grep-able.
 * - We do NOT need a full lib like winston/pino — those are server-side.
 *
 * Usage:
 *   import logger from './utils/logger';
 *   logger.debug('Sequencer', 'Iteration tick', { measure: 0 });
 *   logger.error('App', 'E001', err, { componentStack });
 *
 * The first arg is the source/component (free-form string), the second is a
 * short message OR an error code string (uppercase like 'E001-AUDIO-INIT'),
 * subsequent args are forwarded to console.
 *
 * Levels: debug < info < warn < error. Default level is 'info' (debug is
 * silenced). Override with localStorage.LOG_LEVEL='debug' for in-browser
 * tweaking, or import.meta.env.VITE_LOG_LEVEL at build time.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function resolveLevel() {
    try {
        const lsLevel = typeof window !== 'undefined' && window.localStorage?.getItem('LOG_LEVEL');
        if (lsLevel && LEVELS[lsLevel] != null) return lsLevel;
    } catch {
        // localStorage may throw in private mode / sandboxed contexts; ignore.
    }
    const envLevel = import.meta.env?.VITE_LOG_LEVEL;
    if (envLevel && LEVELS[envLevel] != null) return envLevel;
    return import.meta.env?.DEV ? 'debug' : 'info';
}

let currentLevel = resolveLevel();

function should(level) {
    return LEVELS[level] >= LEVELS[currentLevel];
}

function format(level, source, msg) {
    const t = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    return `[${t}] [${level.toUpperCase()}] [${source}] ${msg}`;
}

const logger = {
    debug: (source, msg, ...rest) => {
        if (should('debug')) console.debug(format('debug', source, msg), ...rest);
    },
    info: (source, msg, ...rest) => {
        if (should('info')) console.info(format('info', source, msg), ...rest);
    },
    warn: (source, msg, ...rest) => {
        if (should('warn')) console.warn(format('warn', source, msg), ...rest);
    },
    error: (source, code, errOrMsg, ...rest) => {
        // error() is the only level where the second arg is a stable code, e.g. 'E001-XYZ'.
        // Reports referencing a code can be grep'd reliably across builds.
        if (should('error')) console.error(format('error', source, code), errOrMsg, ...rest);
    },
    setLevel: (level) => {
        if (LEVELS[level] != null) {
            currentLevel = level;
            try {
                if (typeof window !== 'undefined') window.localStorage?.setItem('LOG_LEVEL', level);
            } catch { /* localStorage may be unavailable (private mode) */ }
        }
    },
    getLevel: () => currentLevel,
};

export default logger;
