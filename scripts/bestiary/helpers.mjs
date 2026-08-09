// #790 (Han 2026-08-09, "er is een giga-bestand met sprite-definities; maak die zo overzichtelijk dat ik
// er handmatig in kan werken"): extracted from scripts/generate-bestiary-manifest.mjs's "PIXEL SCANNING" /
// "VARIANT / COLOUR PARSING" / "COLUMN-SHEET EXPANSION" sections — the handful of tiny, generic helpers
// every per-creature animation-cell definition (scripts/bestiary/animationDefs.mjs) needs. Kept separate
// from the main script (rather than importing animationDefs.mjs's functions back into it, and vice versa)
// so there is no circular import between the two.
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const rowCells = (row, frames) => Array.from({ length: frames }, (_, c) => ({ row, col: c }));

// #687 shared row-major frame-range→cells helper (Han keeps giving "f1-13"-style ranges) — generalises the
// per-function `seq()` pattern into plain start/end frame numbers, avoiding manual row/col transcription.
export const frameRange = (startN, endN, cols) => {
    const cells = [];
    for (let n = startN; n <= endN; n++) { const i = n - 1; cells.push({ row: Math.floor(i / cols), col: i % cols }); }
    return cells;
};
