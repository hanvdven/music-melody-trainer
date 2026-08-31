// #UI-overhaul Stap 3 (Han 2026-08-27): pixel-perfect layout for world mode. Splits the viewport into
// a WORLD block (top) + a NAV block + TWO CONTENT blocks (bottom — the conversation lives in block 1),
// all at ONE shared scale factor `N` (game px → CSS px) so every game pixel is the same size
// everywhere (docs/architecture.md §327/§334). `N` is a whole integer except for a single **1.5**
// half-step, offered only on `devicePixelRatio ≥ 2` screens, to bridge the wide 1→2 gap (#347).
//
// GOAL: pick the biggest scale `N` that fits (the `SCALE_STEPS_*` search + `TIE_PX` bump rule), then
// `distributeHeight` splits the chosen viewport between the world block and the content blocks along
// a fixed piecewise-linear LADDER as the screen gets taller (Han 2026-08-29):
//    (world 240 gpx, content 64 gpx/block) ─lin─▶ (272, 92) ─lin─▶ (272, 128) ─lin─▶ (320, 128)
//    below the foot: world squeezes 240→192 (+16-gpx bottom crop), content pinned at 64
//    above the top : world stays 320, every further gpx goes to the content blocks
// The split ALWAYS fills the viewport exactly (`world + navOverhead + k·content === viewport`).
//
// Constraints (Han's numbers):
//  - World art is 272 game px tall. Rendered ≤ 272 it crops (272→240 top sky only; <240 also 16 gpx
//    off the bottom). Rendered 272→320 (ladder phase 3) the extra top strip is sky-coloured padding
//    (`skyPadGpx`, painted by App.jsx) — the art stays 272.
//  - Minimum visible world width 304 game px (rule 4A).
//  - Content blocks: block 1 ≥ 256×64, block 2 ≥ 192×64 game px (W×H); their height follows the
//    ladder above (per block — h-col/split stack two of them).
//  - Portrait / taller-than-wide viewport → the two content blocks always STACK full-width (h-col /
//    split), never side-by-side (Han 2026-08-28).
//  - Nav holds 9 icons of 16×16 game px. As a vertical block that's 16×144 (1 col) or, if too tall
//    for the space, 32×80 (2 cols); as a horizontal strip it's 144×16.
//
// Pure function, no React — unit-tested in __tests__/worldLayout.test.js.

export const WORLD_ART_GPX_H = 272;
export const WORLD_GPX_H_MIN = 192;
export const WORLD_GPX_H_MAX = 320;
export const WORLD_SQUEEZE_BOTTOM_BELOW = 240;
export const WORLD_BOTTOM_CROP_GPX = 16;
export const WORLD_GPX_W_MIN = 304;
export const CONTENT1_GPX_W_MIN = 256;
export const CONTENT2_GPX_W_MIN = 192;
export const CONTENT_GPX_H_MIN = 64;
export const NAV_GPX = 16;               // one icon / one nav grid unit
export const NAV_ICON_COUNT = 9;         // must match WorldNavBar (6 screens + start/debug/music-view; §352 added 'scales')
const MAX_SCALE = 8;
// #347 (Han 2026-08-28): the jump from N=1 to N=2 is a doubling — on a viewport just under the N=2
// width gate (`w/2 ≥ 304` ⇒ `w ≥ 608`, i.e. a ~560–607-px phone) the world was stuck at N=1 with a
// lot of empty space. A single half-step, **1.5**, bridges that gap; no 2.5/3.5 (the 2→3 jump is
// only +50%, not worth the extra rule). 1.5 is only offered when `devicePixelRatio ≥ 2`, where
// 1.5 CSS-px = 3 whole device-px per game pixel so it stays pixel-perfect; a dpr-1 desktop window
// keeps the crisp integer N=1. Whole integers still win — 1.5 is picked only when N=2 doesn't fit
// AND it clears the same `TIE_PX` height-gain bar an integer bump must clear.
const SCALE_STEPS_BASE = [1, 2, 3, 4, 5, 6, 7, 8];
const SCALE_STEPS_HALFSTEP = [1, 1.5, 2, 3, 4, 5, 6, 7, 8];
const TIE_PX = 2 * NAV_GPX;              // min world-height gain (px) worth bumping to a bigger scale
const SOFT_SQUEEZE_MIN = 224;           // a bump is only allowed if the world stays ≥ this many game px
                                        // (so a bigger scale can't crop the world hard for a small gain)
const CONTENT_W_SUM = CONTENT1_GPX_W_MIN + CONTENT2_GPX_W_MIN;   // 448

// Bottom-band tilings, ordered by ascending band height. `minWgpx` = minimum visible world width.
// `o` = nav gpx the tiling stacks *vertically* (a strip costs 16; a beside-column costs 0).
// `k` = how many content blocks stack in the vertical direction (a row = 1; h-col/split = 2).
// The minimum band (`bandGpx`, used only as the feasibility floor) is then `o + k·64`.
//   v-row : nav vertical column | c1 | c2                 — o 0,  k 1  → band 64,  needs 2·16 + 448
//   h-row : nav strip on top, then c1 | c2                — o 16, k 1  → band 80,  needs      448
//   split : c1 full width, then [nav | c2]                — o 0,  k 2  → band 128, needs      256
//   h-col : nav strip on top, then c1, then c2 (stacked)  — o 16, k 2  → band 144, needs      256
const ARRANGEMENTS = [
    { id: 'v-row', o: 0,       k: 1, minWgpx: 2 * NAV_GPX + CONTENT_W_SUM },
    { id: 'h-row', o: NAV_GPX, k: 1, minWgpx: CONTENT_W_SUM },
    { id: 'split', o: 0,       k: 2, minWgpx: CONTENT1_GPX_W_MIN },
    { id: 'h-col', o: NAV_GPX, k: 2, minWgpx: CONTENT1_GPX_W_MIN },
].map((a) => ({ ...a, bandGpx: a.o + a.k * CONTENT_GPX_H_MIN }));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The 272-px level art fills at most the bottom 272 gpx of the world block. `topCropGpx` /
// `bottomCropGpx` describe how it is cropped when the block is SHORTER than 272; `skyPadGpx` is the
// sky-coloured strip ABOVE the art when the block is TALLER than 272 (ladder phase 3+ — App.jsx
// paints it). Always: `topCropGpx + (worldGpxH − skyPadGpx) + bottomCropGpx === WORLD_ART_GPX_H`.
function cropFor(worldGpxH) {
    const skyPadGpx = Math.max(0, worldGpxH - WORLD_ART_GPX_H);
    const artGpxH = worldGpxH - skyPadGpx;                       // = min(worldGpxH, 272)
    const bottom = artGpxH < WORLD_SQUEEZE_BOTTOM_BELOW ? WORLD_BOTTOM_CROP_GPX : 0;
    const top = WORLD_ART_GPX_H - artGpxH - bottom;
    return { topCropGpx: Math.max(0, top), bottomCropGpx: bottom, skyPadGpx };
}

// Piecewise-linear split of the viewport height `H` (game px, = viewport CSS px / N) between the
// world block and ONE content block, as the screen gets taller (Han 2026-08-29). `o`/`k` from the
// arrangement (see ARRANGEMENTS): `o` extra vertical nav gpx, `k` content blocks stacked vertically.
//   (world 240, content 64) ──lin──▶ (272, 92) ──lin──▶ (272, 128) ──lin──▶ (320, 128)
//   below the foot : world squeezes 240→192 (+16-gpx bottom crop), content pinned at 64
//   above the top  : world stays 320, every further gpx goes to the content blocks (they fill it)
// By construction `world + k·content === H − o` at every point, so the layout fills the viewport
// exactly (no gap, no overflow) whenever the arrangement is feasible.
function distributeHeight(H, o, k) {
    const avail = H - o;
    const P0 = 240 + 64 * k;   // foot        (world 240, content 64)
    const P1 = 272 + 92 * k;   //             (world 272, content 92)
    const P2 = 272 + 128 * k;  //             (world 272, content 128)
    const P3 = 320 + 128 * k;  // top         (world 320, content 128)
    if (avail <= P0) {                                   // squeeze zone
        return { worldGpx: clamp(avail - 64 * k, WORLD_GPX_H_MIN, WORLD_SQUEEZE_BOTTOM_BELOW), contentGpx: CONTENT_GPX_H_MIN };
    }
    if (avail >= P3) {                                   // above the ladder — content absorbs the rest
        return { worldGpx: WORLD_GPX_H_MAX, contentGpx: 128 + (avail - P3) / k };
    }
    if (avail <= P1) {                                   // phase 1: world 240→272 AND content 64→92
        const u = (avail - P0) / (P1 - P0);
        return { worldGpx: 240 + 32 * u, contentGpx: 64 + 28 * u };
    }
    if (avail <= P2) {                                   // phase 2: world fixed 272, content 92→128
        return { worldGpx: 272, contentGpx: 92 + 36 * ((avail - P1) / (P2 - P1)) };
    }
    return { worldGpx: 272 + 48 * ((avail - P2) / (P3 - P2)), contentGpx: 128 };  // phase 3: content fixed 128, world 272→320
}

const ARR_BY_ID = Object.fromEntries(ARRANGEMENTS.map((a) => [a.id, a]));
// #UI-overhaul (Han 2026-08-27): PREFER a nav STRIP above the content ("als er meer dan genoeg ruimte
// is boven content 1 en 2, plaats dan de iconen erboven") whenever the FULL 272-gpx world still fits
// with it — the strip only costs 16 gpx more than a beside-column. Only when the screen is too short
// for that does the nav become a vertical column beside the content (and its icons then spread
// vertically). Within each tier: side-by-side content before stacked.
const STRIP_ABOVE = ['h-row', 'h-col'];
const COLUMN_BESIDE = ['v-row', 'split'];

function pickArrangement(n, w, h) {
    if (w / n < WORLD_GPX_W_MIN) return null;
    const wg = w / n;
    const fits = (id, minWorld) => {
        const a = ARR_BY_ID[id];
        return wg >= a.minWgpx && (minWorld + a.bandGpx) * n <= h ? a : null;
    };
    // Portrait / taller-than-wide viewport → STACK the two content blocks full-width (Han 2026-08-28:
    // "altijd stapelen op smal/portret" — side-by-side made the blocks far taller than they were
    // wide). h-col first (both blocks stacked under a nav strip), split as the fallback.
    if (h > w) {
        for (const id of ['h-col', 'split']) { const a = fits(id, WORLD_ART_GPX_H); if (a) return a; }
        for (const id of ['h-col', 'split']) { const a = fits(id, WORLD_GPX_H_MIN); if (a) return a; }
    }
    for (const id of STRIP_ABOVE) { const a = fits(id, WORLD_ART_GPX_H); if (a) return a; }    // strip, full world
    for (const id of STRIP_ABOVE) { const a = fits(id, SOFT_SQUEEZE_MIN); if (a) return a; }   // strip, only lightly squeezed
    for (const id of COLUMN_BESIDE) { const a = fits(id, WORLD_GPX_H_MIN); if (a) return a; }  // tight → beside column
    for (const id of STRIP_ABOVE) { const a = fits(id, WORLD_GPX_H_MIN); if (a) return a; }    // last resort: heavily-squeezed strip
    return null;
}

// Vertical nav grid: 1×8 (16×128 gpx) if it fits the available height, else 2×4 (32×64 gpx).
function vNavGrid(availHpx, s) {
    return NAV_ICON_COUNT * s <= availHpx ? { cols: 1, rows: NAV_ICON_COUNT } : { cols: 2, rows: Math.ceil(NAV_ICON_COUNT / 2) };
}

function build(n, arr, w, h) {
    const s = NAV_GPX * n;                                   // one nav unit, in px
    // The world/content split comes from the ladder (§348): world 240→320 gpx, each content block
    // 64→128 gpx, then content absorbs anything beyond. `world + o + k·content === viewport` by
    // construction, so `cH` fills exactly — the LAST block placed still takes `h − y` to swallow any
    // ±1-px rounding so the bottom pins to the viewport edge.
    const { worldGpx, contentGpx } = distributeHeight(h / n, arr.o, arr.k);
    const worldH = Math.round(worldGpx * n);
    const worldGpxH = Math.round(worldGpx);
    const cH = Math.round(contentGpx * n);                   // one content block's screen height
    const bY = worldH;                                       // bottom-area top edge
    const gpx = (px) => Math.round(px / n);
    const rect = (x, y, rw, rh) => ({ x, y, screenW: rw, screenH: rh, gpxW: gpx(rw), gpxH: gpx(rh) });

    let nav, block1, block2;
    if (arr.id === 'v-row') {
        const rowH = h - bY;                                 // = cH within rounding (single row, no nav overhead)
        const g = vNavGrid(rowH, s);
        const navW = g.cols * s;
        nav = { ...rect(0, bY, navW, rowH), cols: g.cols, rows: g.rows, orientation: 'vertical' };
        const availW = w - navW;
        const b1w = Math.round(availW * (CONTENT1_GPX_W_MIN / CONTENT_W_SUM));
        block1 = rect(navW, bY, b1w, rowH);
        block2 = rect(navW + b1w, bY, availW - b1w, rowH);
    } else if (arr.id === 'h-row') {
        // Horizontal nav = a FULL-WIDTH strip (Han 2026-08-27, "vul de volledige overige breedte als
        // de nav blok horizontaal is"); WorldNavBar spreads the 8 icons across it.
        nav = { ...rect(0, bY, w, s), cols: NAV_ICON_COUNT, rows: 1, orientation: 'horizontal' };
        const rowY = bY + s;
        const rowH = h - rowY;
        const b1w = Math.round(w * (CONTENT1_GPX_W_MIN / CONTENT_W_SUM));
        block1 = rect(0, rowY, b1w, rowH);
        block2 = rect(b1w, rowY, w - b1w, rowH);
    } else if (arr.id === 'split') {
        block1 = rect(0, bY, w, cH);
        const r2y = bY + cH;
        const r2h = h - r2y;
        const g = vNavGrid(r2h, s);
        const navW = g.cols * s;
        nav = { ...rect(0, r2y, navW, r2h), cols: g.cols, rows: g.rows, orientation: 'vertical' };
        block2 = rect(navW, r2y, w - navW, r2h);
    } else { // h-col — nav strip, then the two blocks stacked full-width (block 2 absorbs rounding)
        nav = { ...rect(0, bY, w, s), cols: NAV_ICON_COUNT, rows: 1, orientation: 'horizontal' };
        const restY = bY + s;
        block1 = rect(0, restY, w, cH);
        block2 = rect(0, restY + cH, w, h - (restY + cH));
    }

    return {
        scale: n,
        arrangement: arr.id,
        world: { ...rect(0, 0, w, worldH), gpxH: worldGpxH, ...cropFor(worldGpxH) },
        nav,
        content: { block1, block2 },
    };
}

/**
 * @param {number} w    viewport width in CSS px  @param {number} h  viewport height in CSS px
 * @param {number} dpr  devicePixelRatio — gates the 1.5 half-step (see SCALE_STEPS_* / #347)
 * @returns layout: { scale, arrangement, world, nav, content:{block1,block2} } — every block a rect
 *   { x, y, screenW, screenH, gpxW, gpxH } in viewport coordinates; `world` also carries
 *   `topCropGpx`/`bottomCropGpx`/`skyPadGpx`; `nav` also carries `cols`, `rows`, `orientation`.
 */
export function computeWorldLayout(w, h, dpr = 1) {
    const steps = dpr >= 2 ? SCALE_STEPS_HALFSTEP : SCALE_STEPS_BASE;
    let best = null;
    for (const n of steps) {
        if (n > MAX_SCALE) break;
        if (w / n < WORLD_GPX_W_MIN) break;          // wider N only gets narrower — done
        const arr = pickArrangement(n, w, h);
        if (!arr) continue;
        const { worldGpx } = distributeHeight(h / n, arr.o, arr.k);
        const wsh = worldGpx * n;
        // Take the first feasible scale; then bump only for a real screen-height gain that doesn't
        // squeeze the world past SOFT_SQUEEZE_MIN.
        if (!best || (wsh > best.wsh + TIE_PX && worldGpx >= SOFT_SQUEEZE_MIN)) best = { n, arr, wsh };
    }
    if (best) return build(best.n, best.arr, w, h);
    return build(1, ARRANGEMENTS[3], w, h);           // degenerate fallback (viewport too small)
}
