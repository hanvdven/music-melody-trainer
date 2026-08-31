// Reads the glyphs Han hand-drew into `docs/font-atlas.png` (painted on top of the grey
// fallback tracing guides) and quantises them to the atlas's own 13x13 design-pixel grid,
// isolating his black ink from the `#9aa0a6` fallback outlines. Output: `scripts/pixel-glyphs.json`
// (the raster-exact "netjes" version) + an ASCII preview so Han can sanity-check each glyph.
//
// This reads the CURRENT atlas geometry (before render-font-atlas.mjs grows per-font rows):
//   RENDER_SCALE 8 → 8 screen-px per design-pixel · CELL 13 → 104-px cells · GAP 16 · HEADER 22
//   section tops: CelticTime 16 · SandyForest 886 · Bitfantasy 1756
//
// Run:  node scripts/extract-pixel-glyphs.mjs [--threshold 128] [--ascii]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ATLAS = resolve(ROOT, 'docs/font-atlas.png');
const OUT_JSON = resolve(ROOT, 'scripts/pixel-glyphs.json');

const args = process.argv.slice(2);
// Han's ink is near-black; the fallback tracing guides are `#9aa0a6` (luminance ~159). Keep both
// cut-offs well under 159 so the grey guide never leaks in. INK = solidly dark, MAYBE = a dark-ish
// stroke edge Han may want cleaned.
const INK_MAX = Number(args[args.indexOf('--ink') + 1]) || 95;
const MAYBE_MAX = Number(args[args.indexOf('--maybe') + 1]) || 130;
const DUMP = args[args.indexOf('--dump') + 1]; // print raw per-pixel luminance for one glyph name

// --- atlas geometry (mirrors render-font-atlas.mjs constants at the time Han drew) -------------
const GAP = 16;
const HEADER = 22;
const CELL = 13;          // design-pixels per cell
const PPX = 8;            // screen-px per design-pixel (RENDER_SCALE)
const CELL_PX = CELL * PPX; // 104
const SECTION_TOP = { CelticTime: 16, SandyForest: 886, Bitfantasy: 1756 };

// --- what Han drew, and where (current-atlas row indices; row 5/6/7 are the shared
//     accented-caps / accented-lowercase / accidental rows he traced on top of) ---------------
const U = (hex) => String.fromCodePoint(parseInt(hex, 16));
const SUBSCRIPT = ['2081', '2082', '2083', '2084', '2085', '2086', '2087', '2088', '2089', '2080']; // cells hold 1..9,0
const SUPERSCRIPT = ['00B9', '00B2', '00B3', '2074', '2075', '2076', '2077', '2078', '2079', '2070'];
const ROMAN = ['2160', '2161', '2162', '2163', '2164', '2165', '2166']; // Ⅰ..Ⅶ
const ACCID = ['266F', '266D', '266E', '1D12B', '1D12A']; // ♯ ♭ ♮ 𝄫 𝄪

const TARGETS = [
  ...SUBSCRIPT.map((cp, i) => ({
    font: 'CelticTime', row: 5, col: i, name: `subscript-${U(cp)}`, codepoints: [cp],
  })),
  ...ROMAN.map((cp, i) => ({
    font: 'CelticTime', row: 6, col: i, name: `roman-${U(cp)}`, codepoints: [cp],
  })),
  ...ACCID.map((cp, i) => ({
    font: 'CelticTime', row: 7, col: i, name: `accidental-${U(cp)}`, codepoints: [cp],
  })),
  { font: 'SandyForest', row: 2, col: 0, name: 'digit-0', codepoints: ['0030'] },
];

// --- pixel sampling --------------------------------------------------------------------------
const png = PNG.sync.read(readFileSync(ATLAS));
const { width, height, data } = png;

const lumAt = (x, y) => {
  const idx = (width * y + x) << 2;
  const r = data[idx]; const g = data[idx + 1]; const b = data[idx + 2];
  return { lum: 0.299 * r + 0.587 * g + 0.114 * b, r, g, b };
};

// Classify one design-pixel: average a 4x4 block at its centre (offsets 2..5 inside the 8-px
// cell — clear of the 1-px grid lines, the cell border and the red baseline). Ink = dark AND
// not red (the red baseline sits on the py=8 boundary; centre sampling already avoids it, this
// is belt-and-braces).
const meanLum = (cx, rowTop, px, py) => {
  let sum = 0; let redish = 0; let n = 0;
  for (let ox = 2; ox <= 5; ox++) {
    for (let oy = 2; oy <= 5; oy++) {
      const { lum, r, g, b } = lumAt(cx + px * PPX + ox, rowTop + py * PPX + oy);
      sum += lum;
      if (r - Math.max(g, b) > 40) redish++;
      n++;
    }
  }
  return { mean: sum / n, redish: redish > n / 2 };
};

const classify = (cx, rowTop, px, py) => {
  const { mean, redish } = meanLum(cx, rowTop, px, py);
  if (redish) return '.';
  if (mean < INK_MAX) return '#';
  if (mean < MAYBE_MAX) return '?';   // dark-ish edge — Han's stroke may need cleanup
  return '.';
};

const trimGrid = (grid) => {
  let top = 0; let bot = grid.length - 1; let left = CELL - 1; let right = 0;
  let any = false;
  grid.forEach((rowArr, y) => rowArr.forEach((c, x) => {
    if (c !== '.') { any = true; top = Math.min(top === 0 && !any ? y : top, y); }
  }));
  // recompute cleanly
  top = CELL; bot = -1; left = CELL; right = -1;
  grid.forEach((rowArr, y) => rowArr.forEach((c, x) => {
    if (c !== '.') {
      top = Math.min(top, y); bot = Math.max(bot, y);
      left = Math.min(left, x); right = Math.max(right, x);
    }
  }));
  if (bot < 0) return { grid: [], bbox: null };
  return { top, bot, left, right };
};

const results = [];
for (const t of TARGETS) {
  const top = SECTION_TOP[t.font];
  const rowTop = top + HEADER + t.row * CELL_PX;
  const cx = GAP + t.col * CELL_PX;

  if (DUMP && t.name === DUMP) {
    console.log(`raw luminance for ${t.name} (13x13, centre-of-pixel mean):`);
    for (let py = 0; py < CELL; py++) {
      const cells = [];
      for (let px = 0; px < CELL; px++) cells.push(String(Math.round(meanLum(cx, rowTop, px, py).mean)).padStart(4));
      console.log(cells.join(''));
    }
    console.log('');
  }

  const grid = [];
  for (let py = 0; py < CELL; py++) {
    const rowArr = [];
    for (let px = 0; px < CELL; px++) rowArr.push(classify(cx, rowTop, px, py));
    grid.push(rowArr);
  }
  const bb = trimGrid(grid);
  results.push({ ...t, grid, bbox: bb.bot < 0 ? null : { top: bb.top, bot: bb.bot, left: bb.left, right: bb.right } });
}

// --- ASCII preview -------------------------------------------------------------------------
{
  const baseline = 1 + 7; // PAD + CAP_PX — design-row of the baseline within a cell
  for (const g of results) {
    const cps = g.codepoints.map((c) => `U+${c}`).join(',');
    console.log(`\n${g.name}  [${cps}]  bbox=${g.bbox ? JSON.stringify(g.bbox) : 'EMPTY'}`);
    g.grid.forEach((rowArr, y) => {
      const mark = y === baseline ? '─' : ' ';
      console.log(`${mark}${rowArr.join('')}`);
    });
  }
  const amb = results.reduce((s, g) => s + g.grid.flat().filter((c) => c === '?').length, 0);
  console.log(`\n${results.length} glyphs · ${amb} ambiguous pixels (?) · ink<${INK_MAX} maybe<${MAYBE_MAX}`);
}

// --- write JSON --------------------------------------------------------------------------
const json = {
  meta: {
    source: 'docs/font-atlas.png',
    cell: CELL,
    pad: 1,
    capPx: 7,
    baseDp: 8,
    inkMax: INK_MAX,
    maybeMax: MAYBE_MAX,
    note: 'grid[y][x]: "#" ink, "?" ambiguous (treated as ink unless overridden), "." empty. '
      + 'y=0 is the cell top; baseline is design-row 8 (pad 1 + cap 7).',
    generated: new Date().toISOString(),
  },
  glyphs: results.map((g) => ({
    name: g.name,
    codepoints: g.codepoints,
    from: { font: g.font, row: g.row, col: g.col },
    bbox: g.bbox,
    grid: g.grid.map((rowArr) => rowArr.join('')),
  })),
  // superscript digits reuse the subscript outlines, shifted up at inject time (see inject-glyphs.mjs)
  superscriptFromSubscript: SUBSCRIPT.map((sub, i) => ({ sub, sup: SUPERSCRIPT[i] })),
};
writeFileSync(OUT_JSON, `${JSON.stringify(json, null, 2)}\n`);
console.log(`\nwrote ${OUT_JSON}`);

// --- SVG preview (one crisp cell per glyph, baseline marked) --------------------------------
const OUT_SVG = resolve(ROOT, 'scripts/pixel-glyphs-preview.svg');
const S = 12;                 // px per design-pixel in the preview
const CW = CELL * S;          // cell width
const LABEL = 20;
const COLS = 10;
const cellW = CW + 10;
const cellH = CW + LABEL + 10;
const svgW = COLS * cellW + 20;
const rows = Math.ceil(results.length / COLS);
const svgH = rows * cellH + 20;
const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" font-family="monospace">`,
  `<rect width="${svgW}" height="${svgH}" fill="#fff"/>`];
results.forEach((g, i) => {
  const gx = 10 + (i % COLS) * cellW;
  const gy = 10 + Math.floor(i / COLS) * cellH;
  parts.push(`<text x="${gx}" y="${gy + 13}" font-size="11" fill="#111">${g.codepoints.map((c) => (c.length > 4 ? `U+${c}` : `U+${c}`)).join(' ')}</text>`);
  const ox = gx; const oy = gy + LABEL;
  parts.push(`<rect x="${ox}" y="${oy}" width="${CW}" height="${CW}" fill="none" stroke="#ddd"/>`);
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const c = g.grid[y][x];
      if (c === '#' || c === '?') {
        parts.push(`<rect x="${ox + x * S}" y="${oy + y * S}" width="${S}" height="${S}" fill="${c === '#' ? '#111' : '#c00'}"/>`);
      }
    }
  }
  const by = oy + (1 + 7) * S; // baseline row
  parts.push(`<line x1="${ox}" y1="${by}" x2="${ox + CW}" y2="${by}" stroke="#e0392b" stroke-width="1"/>`);
});
parts.push('</svg>');
writeFileSync(OUT_SVG, parts.join('\n'));
console.log(`wrote ${OUT_SVG}`);
