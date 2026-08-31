// Injects the pixel glyphs Han hand-drew in `docs/font-atlas.png` (extracted to
// `scripts/pixel-glyphs.json` by extract-pixel-glyphs.mjs) into the actual pixel fonts, so the
// app renders them from real characters instead of a grey fallback.
//
//   CelticTime.ttf  ← subscript digits U+2080–2089, superscript digits U+2070/00B9/00B2/00B3/
//                     2074–2079 (same shapes, same height — Han asked to keep his drawn position),
//                     Roman numerals U+2160–2166, accidentals ♯♭♮ U+266F/266D/266E and 𝄫𝄪
//                     U+1D12B/1D12A
//   SandyForest.ttf ← digit 0 (U+0030) — genuinely absent from that font
//
// Geometry (verified against both fonts): unitsPerEm 1024, x-height 320 units = Han's 5 design-
// pixels → 64 units per design-pixel; cap height 448 = 7 dp = the atlas CAP_PX. Glyph origin x
// sits at the atlas cell's PAD (design-pixel column 1); baseline is design-row 8 (PAD 1 + cap 7).
// Ink pixels below row 8 become descenders (the natural sign uses this).
//
// The JSON is the editable source of truth — re-run extract, tweak the grids by hand if needed,
// then re-run this. Overwrites the .ttf in place (git history is the backup).
//
// Run:  node scripts/inject-glyphs.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import opentype from 'opentype.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = resolve(ROOT, 'src/assets/fonts/pixel_fonts');
const JSON_PATH = resolve(ROOT, 'scripts/pixel-glyphs.json');

const spec = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const { cell: CELL, pad: PAD, baseDp: BASE_DP } = spec.meta;
const UNITS_PER_DP = 64;   // 320-unit x-height / 5 design-pixel x-height (both fonts, unitsPerEm 1024)

// grid rows: '#' and '?' are ink ('?' = a dark-ish edge extract flagged; Han said take his drawing
// as-is so we keep them), '.' is empty.
const isInk = (c) => c === '#' || c === '*';

// Build a glyph Path from a 13x13 grid by merging each row's ink into horizontal run rectangles
// (fewer contours than one-square-per-pixel, and no seams inside a solid shape). All contours run
// the same direction so TrueType non-zero winding fills them solid.
const gridToPath = (grid) => {
    const path = new opentype.Path();
    let right = -1;
    for (let py = 0; py < CELL; py++) {
        const row = grid[py];
        const yTop = (BASE_DP - py) * UNITS_PER_DP;
        const yBot = (BASE_DP - py - 1) * UNITS_PER_DP;
        let px = 0;
        while (px < row.length) {
            if (!isInk(row[px])) { px++; continue; }
            let end = px;
            while (end + 1 < row.length && isInk(row[end + 1])) end++;
            const xL = (px - PAD) * UNITS_PER_DP;
            const xR = (end + 1 - PAD) * UNITS_PER_DP;
            // clockwise in font space (y up): BL → TL → TR → BR
            path.moveTo(xL, yBot);
            path.lineTo(xL, yTop);
            path.lineTo(xR, yTop);
            path.lineTo(xR, yBot);
            path.close();
            if (end > right) right = end;
            px = end + 1;
        }
    }
    return { path, right };
};

// Add or replace a cmap'd glyph in `font` for one codepoint.
const putGlyph = (font, codepoint, grid, label) => {
    const { path, right } = gridToPath(grid);
    if (right < 0) throw new Error(`empty grid for ${label}`);
    const advanceWidth = (right - PAD + 2) * UNITS_PER_DP;   // ink width + 1 dp side bearing
    const name = codepoint > 0xFFFF
        ? `u${codepoint.toString(16).toUpperCase().padStart(5, '0')}`
        : `uni${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;

    const existing = font.charToGlyph(String.fromCodePoint(codepoint));
    if (existing && existing.index !== 0) {
        existing.path = path;
        existing.advanceWidth = advanceWidth;
        existing.unicode = codepoint;
        existing.unicodes = [codepoint];
        return `replaced ${label}`;
    }
    const index = font.glyphs.length;
    const glyph = new opentype.Glyph({ name, unicode: codepoint, index, advanceWidth, path });
    glyph.unicodes = [codepoint];
    // mutate the GlyphSet in place so every other table (name, OS/2, head, hhea) is preserved
    font.glyphs.glyphs[index] = glyph;
    font.glyphs.length += 1;
    font.numGlyphs += 1;
    return `added ${label} @${index}`;
};

// --- route each spec glyph to its font -------------------------------------------------------
const byCp = new Map();       // 'HHHH' -> grid, for the superscript reuse below
const jobs = { CelticTime: [], SandyForest: [] };
for (const g of spec.glyphs) {
    const grid = g.grid;
    for (const cpHex of g.codepoints) {
        byCp.set(cpHex, grid);
        jobs[g.from.font].push({ cp: parseInt(cpHex, 16), grid, label: `${g.name} U+${cpHex}` });
    }
}
// superscript digits: Han only drew one set — reuse the subscript grids at the same height
for (const { sub, sup } of spec.superscriptFromSubscript) {
    const grid = byCp.get(sub);
    if (!grid) throw new Error(`no subscript grid for U+${sub}`);
    jobs.CelticTime.push({ cp: parseInt(sup, 16), grid, label: `superscript U+${sup} (= U+${sub})` });
}

for (const fontName of Object.keys(jobs)) {
    if (jobs[fontName].length === 0) continue;
    const file = resolve(FONT_DIR, `${fontName}.ttf`);
    const font = opentype.parse(readFileSync(file));
    console.log(`\n${fontName}.ttf  (${font.glyphs.length} glyphs)`);
    for (const j of jobs[fontName]) console.log('  ', putGlyph(font, j.cp, j.grid, j.label));
    writeFileSync(file, Buffer.from(font.toArrayBuffer()));
    console.log(`  → wrote ${font.glyphs.length} glyphs`);
}

// --- verify the round-trip ------------------------------------------------------------------
console.log('\nverify:');
for (const fontName of Object.keys(jobs)) {
    if (jobs[fontName].length === 0) continue;
    const font = opentype.parse(readFileSync(resolve(FONT_DIR, `${fontName}.ttf`)));
    let ok = 0; let bad = 0;
    for (const j of jobs[fontName]) {
        const idx = font.charToGlyph(String.fromCodePoint(j.cp)).index;
        if (idx === 0) { bad++; console.log(`  MISSING after write: ${fontName} ${j.label}`); } else ok++;
    }
    // sanity: an original glyph still resolves
    const ctrl = font.charToGlyph('A').index;
    console.log(`  ${fontName}: ${ok} present, ${bad} missing · 'A' idx ${ctrl}${ctrl === 0 ? ' !!!' : ''}`);
}
