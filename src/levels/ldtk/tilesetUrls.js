// Resolves a `RAM level.ldtk` tileset def to its bundled Vite URL. Globs every PNG under the ASSORTED
// tiles/backgrounds trees, keyed by filename (not full path) — the `.ldtk` file's own `relPath` values
// point at a couple of stale subfolders from before Han's asset reorg (e.g. `tiles/animated/GandalfHardcore
// Animated Water Tiles.png`, which now actually lives under `tiles/water/`), so matching on filename alone
// is what keeps ASSORTED as the real source of truth instead of the `.ldtk` file's own recorded paths
// (Han 2026-08-10: "zorg dat ASSORTED de source of truth is").
import logger from '../../utils/logger';

// #RAM-level (Han 2026-08-11, "de app startup duurt heel lang"): the broad `tiles/**` glob below was
// eagerly registering all 235 PNGs under ASSORTED/tiles+backgrounds at APP BOOT (via
// useRpgLevelState.js's unconditional import chain), even though `RAM level.ldtk` only references ~17 of
// them. `Legacy_Fantasy`/`chests`/`carriage`/`sky_decoration` (86 files, ~37% of the total) are NOT used
// by any tileset this level references (verified against the file's own `defs.tilesets` list) — excluded
// here to cut the eager-import count without touching the `eager:true` pattern itself (an async rewrite
// would be a bigger, riskier change for an unconfirmed win — see docs/architecture.md for the measured
// finding that JSON.parse itself is cheap, ~26ms, so this glob was the more likely actual contributor).
const FILES = {
    ...import.meta.glob([
        '../../assets/ASSORTED/tiles/**/*.png',
        '!../../assets/ASSORTED/tiles/Legacy_Fantasy/**',
        '!../../assets/ASSORTED/tiles/chests/**',
        '!../../assets/ASSORTED/tiles/carriage/**',
        '!../../assets/ASSORTED/tiles/sky_decoration/**',
    ], { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob('../../assets/ASSORTED/backgrounds/**/*.png', { eager: true, query: '?url', import: 'default' }),
};
const URL_BY_FILENAME = new Map();
for (const [path, url] of Object.entries(FILES)) {
    URL_BY_FILENAME.set(path.slice(path.lastIndexOf('/') + 1), url);
}

const warnedMissing = new Set();

// `tilesetDef` is one entry of `ldtk.defs.tilesets` (has `identifier` + `relPath`).
export function tilesetUrlFor(tilesetDef) {
    const filename = tilesetDef.relPath.slice(tilesetDef.relPath.lastIndexOf('/') + 1);
    const url = URL_BY_FILENAME.get(filename);
    if (!url && !warnedMissing.has(filename)) {
        warnedMissing.add(filename);
        // A tileset the .ldtk file references has no matching file anywhere under ASSORTED — tiles using
        // it are silently skipped by ldtkWorld.js rather than crashing the whole scene (§7a: this is a
        // data-integrity warning, not a fatal error, so no logger.error/error-code allocation).
        logger.warn('ldtkWorld', 'tileset PNG not found under ASSORTED', { tileset: tilesetDef.identifier, filename });
    }
    return url || null;
}
