// Renders a PIXEL-PERFECT glyph atlas PNG of the three pixel fonts the app uses, so Han can trace /
// edit / extend it (e.g. add missing music symbols). Not part of the build.
//
//   CelticTime  → BestiaryPixel "normal"  (bestiary tags/buttons, WorldPiano note letters + wordmark)
//   SandyForest → BestiaryPixel "italic"
//   Bitfantasy  → BestiaryPixel "bold" + the DialogueBox conversation text
//
// Pixel-perfect approach: all three fonts sit on a 16-unit em grid (Han measured x-heights 5/5/6
// design-pixels; cap ≈ 7). We anchor each font on its measured x-height vs `f.xh`, get the font-size
// where one design-pixel == one screen-pixel (comes out to 16px for all three), then render at
// `RENDER_SCALE ×` that — an integer multiple, so every design-pixel is exactly `RENDER_SCALE`
// screen-pixels with zero sub-pixel drift. A faint per-design-pixel grid is drawn so you can edit
// pixel by pixel.
//
// Run:  node scripts/render-font-atlas.mjs      Out:  docs/font-atlas.png

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = resolve(ROOT, 'src/assets/fonts/pixel_fonts');
const OUT_PNG = resolve(ROOT, 'docs/font-atlas.png');

// `xh` = x-height in DESIGN-pixels, measured by Han per font. This is the anchor for the pixel grid:
// we scale each font so one design-pixel == an integer number of screen-pixels, no sub-pixel drift.
const FONTS = [
    { name: 'CelticTime', xh: 5, role: 'BestiaryPixel normal · piano letters + "Melody Hill"' },
    { name: 'SandyForest', xh: 5, role: 'BestiaryPixel italic' },
    { name: 'Bitfantasy', xh: 6, role: 'BestiaryPixel bold · DialogueBox text' },
];

const ROWS = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!"#$%&\'()*+,-./:;<=>?@',
    '[\\]^_`{|}~',
    'ÀÁÂÄÆÇÈÉÊËÍÎÏÑÓÔÖØÚÛÜ',
    'àáâäæçèéêëíîïñóôöøúûüÿ',
    '♯♭♮𝄫𝄪𝄞𝄢°•·–—…‘’“”«»†‡€£¥§¶',
];

// Per-font extra rows appended after the shared set. CelticTime carries the glyphs Han drew into
// the atlas and injected via scripts/inject-glyphs.mjs: subscript digits, superscript digits, and
// Roman numerals I–VII (for mode labels). Accidentals stay in the shared row 8 — they turn from
// grey fallback to black now that CelticTime has them.
const EXTRA_ROWS = {
    CelticTime: [
        '₀₁₂₃₄₅₆₇₈₉',
        '⁰¹²³⁴⁵⁶⁷⁸⁹',
        'ⅠⅡⅢⅣⅤⅥⅦ',
    ],
};

const CAP_PX = 7;         // measured capital height in design-pixels (for the glyph baseline)
const CELL = 13;          // design-pixels per glyph cell (1 pad + 10 glyph box + 2 bottom margin)
const PAD = 1;            // design-pixels of left/top padding inside a cell
const RENDER_SCALE = 8;   // screen-pixels per design-pixel in the output PNG (integer → still exact)

const b64 = (file) => readFileSync(resolve(FONT_DIR, `${file}.ttf`)).toString('base64');
const faces = FONTS.map(
    (f) => `@font-face{font-family:'${f.name}';src:url(data:font/ttf;base64,${b64(f.name)}) format('truetype');}`,
).join('');

const html = `<!doctype html><meta charset="utf-8"><style>${faces}
  html,body{margin:0;background:#fff}</style><canvas id="atlas"></canvas>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });

const dims = await page.evaluate(async ({ FONTS, ROWS, EXTRA_ROWS, CAP_PX, CELL, PAD, RENDER_SCALE }) => {
    await document.fonts.ready;
    // Force each face to actually load by measuring it once.
    const probe = document.createElement('canvas').getContext('2d');
    FONTS.forEach((f) => { probe.font = `40px '${f.name}'`; probe.measureText('H'); });
    await document.fonts.ready;

    // Per font: anchor on the MEASURED x-height vs Han's design x-height (`f.xh`). `nativePx` is the
    // font-size at which one design-pixel == one screen-pixel; render at `RENDER_SCALE ×` that (an
    // integer multiple, so every design-pixel is exactly `RENDER_SCALE` screen-pixels — no drift).
    const info = FONTS.map((f) => {
        probe.font = `400px '${f.name}'`;
        const xhAt400 = probe.measureText('x').actualBoundingBoxAscent;
        const capAt400 = probe.measureText('H').actualBoundingBoxAscent;
        const nativePx = Math.round((f.xh * 400) / xhAt400);
        const capDesignPx = +(capAt400 / (xhAt400 / f.xh)).toFixed(2);   // sanity
        const rows = ROWS.concat(EXTRA_ROWS[f.name] || []);
        return { ...f, rows, nativePx, capDesignPx, k: RENDER_SCALE, size: nativePx * RENDER_SCALE };
    });

    const cols = Math.max(...info.flatMap((f) => f.rows.map((r) => [...r].length)));
    const HEADER = 22;      // screen-px reserved above each font section for its label
    const GAP = 16;

    // Total canvas size.
    let H = GAP;
    const sections = info.map((f) => {
        const ppx = f.k;
        const cellPx = CELL * ppx;
        const top = H;
        H += HEADER + f.rows.length * cellPx + GAP;
        return { ...f, ppx, cellPx, top };
    });
    const W = GAP + cols * Math.max(...sections.map((s) => s.cellPx)) + GAP;

    const cv = document.getElementById('atlas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.textRendering = 'geometricPrecision';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    // Does the primary font actually contain this glyph? CSS font fallback walks the family list in
    // order, so if `'<Font>'` lacks the glyph it renders identically to the declared fallback
    // (`monospace`). Render both into tiny offscreens and pixel-compare.
    const om = document.createElement('canvas'); om.width = 56; om.height = 56;
    const octx = om.getContext('2d');
    const inkKey = (ch, fontStr) => {
        octx.clearRect(0, 0, 56, 56);
        octx.font = `36px ${fontStr}`;
        octx.textBaseline = 'alphabetic';
        octx.fillStyle = '#000';
        octx.fillText(ch, 3, 42);
        return octx.getImageData(0, 0, 56, 56).data.join(',');
    };
    const missing = (ch, name) => inkKey(ch, `'${name}', monospace`) === inkKey(ch, 'monospace');

    const FIT_DP = 9;   // fallback outlines are fitted to this many design-pixels tall, for tracing

    for (const s of sections) {
        const { ppx, cellPx, top } = s;
        ctx.fillStyle = '#111';
        ctx.font = '12px ui-monospace, Menlo, monospace';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(`${s.name}  —  ${s.role}   ·   size ${s.size}px, ${ppx}px per design-pixel   ·   red line = baseline   ·   grey = fallback (not in font — trace it)`, GAP, top + 14);

        const gridTop = top + 22;
        const baseDp = PAD + CAP_PX;   // baseline row within a cell

        for (let r = 0; r < s.rows.length; r++) {
            const chars = [...s.rows[r]];
            const rowTop = gridTop + r * cellPx;
            for (let c = 0; c < chars.length; c++) {
                const cx = GAP + c * cellPx;
                // per-design-pixel grid + cell border
                ctx.strokeStyle = '#f1f1f1';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let gx = 0; gx <= CELL; gx++) { ctx.moveTo(cx + gx * ppx + 0.5, rowTop + 0.5); ctx.lineTo(cx + gx * ppx + 0.5, rowTop + cellPx + 0.5); }
                for (let gy = 0; gy <= CELL; gy++) { ctx.moveTo(cx + 0.5, rowTop + gy * ppx + 0.5); ctx.lineTo(cx + cellPx + 0.5, rowTop + gy * ppx + 0.5); }
                ctx.stroke();
                ctx.strokeStyle = '#cfcfcf';
                ctx.strokeRect(cx + 0.5, rowTop + 0.5, cellPx, cellPx);

                const ch = chars[c];
                const baselineY = rowTop + baseDp * ppx;

                // clip every glyph to its own cell so a big fallback can't bleed into neighbours
                ctx.save();
                ctx.beginPath();
                ctx.rect(cx, rowTop, cellPx, cellPx);
                ctx.clip();

                if (missing(ch, s.name)) {
                    // Fallback outline, fitted inside the glyph box (≤ FIT_DP tall, ≤ box wide) and
                    // centred — the footprint the pixel glyph should have, ready to trace.
                    const PROBE = 200;
                    ctx.font = `${PROBE}px serif`;
                    const m = ctx.measureText(ch);
                    const inkH = Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 8);
                    const inkW = Math.max(m.width, 8);
                    const boxH = FIT_DP * ppx;
                    const boxW = (CELL - 2 * PAD) * ppx;
                    const fb = PROBE * Math.min(boxH / inkH, boxW / inkW);
                    ctx.font = `${fb}px serif`;
                    const asc = m.actualBoundingBoxAscent * (fb / PROBE);
                    const desc = m.actualBoundingBoxDescent * (fb / PROBE);
                    const w = m.width * (fb / PROBE);
                    const boxMid = rowTop + (PAD + FIT_DP / 2) * ppx;
                    ctx.fillStyle = '#9aa0a6';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(ch, cx + PAD * ppx + (boxW - w) / 2, boxMid + (asc - desc) / 2);
                } else {
                    ctx.font = `${s.size}px '${s.name}'`;
                    ctx.fillStyle = '#000';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(ch, cx + PAD * ppx, baselineY);
                }
                ctx.restore();

                // baseline — red, 1 screen-px, on top
                ctx.fillStyle = '#e0392b';
                ctx.fillRect(cx, Math.round(baselineY), cellPx, 1);
            }
        }
    }
    return info;
}, { FONTS, ROWS, EXTRA_ROWS, CAP_PX, CELL, PAD, RENDER_SCALE });

await page.locator('#atlas').screenshot({ path: OUT_PNG });
await browser.close();

console.log('wrote', OUT_PNG);
for (const f of dims) {
    console.log(`  ${f.name}: x-height ${f.xh}dp · native ${f.nativePx}px → render ${f.size}px @ ${f.k}px/design-pixel (measured cap ≈ ${f.capDesignPx}dp)`);
}
