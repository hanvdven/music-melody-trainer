import { describe, it, expect } from 'vitest';
import {
    computeWorldLayout,
    WORLD_GPX_W_MIN, WORLD_GPX_H_MIN, WORLD_GPX_H_MAX, WORLD_ART_GPX_H, WORLD_SQUEEZE_BOTTOM_BELOW,
    WORLD_BOTTOM_CROP_GPX, CONTENT_GPX_H_MIN, CONTENT1_GPX_W_MIN, CONTENT2_GPX_W_MIN,
    NAV_GPX, NAV_ICON_COUNT,
} from '../worldLayout.js';

const VIEWPORTS = [
    [1920, 1080], [1366, 768], [1280, 720], [1600, 900], [2560, 1440], [3840, 2160],
    [3440, 1440], [1920, 1200], [800, 600], [700, 900], [500, 900], [1024, 768],
    [1920, 600], [1280, 500], [3440, 800], [938, 688], [938, 667], [1000, 1000],
    [360, 780], [1280, 300],
];

describe('computeWorldLayout — invariants', () => {
    for (const [w, h] of VIEWPORTS) {
        it(`${w}x${h}: valid rects, world 192–320 gpx / ≥304 wide, crops+art sum to 272, blocks in bounds`, () => {
            const L = computeWorldLayout(w, h);
            const { scale, world, nav, content } = L;
            const b1 = content.block1, b2 = content.block2;

            expect(Number.isInteger(scale)).toBe(true);
            expect(scale).toBeGreaterThanOrEqual(1);

            // World.
            expect(world.gpxH).toBeGreaterThanOrEqual(WORLD_GPX_H_MIN);
            expect(world.gpxH).toBeLessThanOrEqual(WORLD_GPX_H_MAX);
            expect(world.gpxW).toBeGreaterThanOrEqual(WORLD_GPX_W_MIN - 1);
            // topCrop + (visible art = gpxH − skyPad) + bottomCrop === 272 (the art is always ≤ 272).
            expect(world.topCropGpx + (world.gpxH - world.skyPadGpx) + world.bottomCropGpx).toBe(WORLD_ART_GPX_H);
            expect(world.skyPadGpx).toBe(Math.max(0, world.gpxH - WORLD_ART_GPX_H));
            expect(world.bottomCropGpx).toBe(Math.min(world.gpxH, WORLD_ART_GPX_H) < WORLD_SQUEEZE_BOTTOM_BELOW ? WORLD_BOTTOM_CROP_GPX : 0);
            expect(world.x).toBe(0);
            expect(world.y).toBe(0);

            // Every block fits inside the viewport.
            for (const r of [world, nav, b1, b2]) {
                expect(r.x).toBeGreaterThanOrEqual(-0.5);
                expect(r.y).toBeGreaterThanOrEqual(-0.5);
                expect(r.x + r.screenW).toBeLessThanOrEqual(w + 0.5);
                expect(r.y + r.screenH).toBeLessThanOrEqual(h + 0.5);
                expect(r.screenW).toBeGreaterThan(0);
                expect(r.screenH).toBeGreaterThan(0);
            }

            // Nav holds all NAV_ICON_COUNT icons, spread across the full extent: a horizontal strip is
            // full-width × 16 gpx; a vertical column is `cols`·16 gpx wide × the full bottom-area
            // height (icons spread over it).
            expect(nav.cols * nav.rows).toBeGreaterThanOrEqual(NAV_ICON_COUNT);
            if (nav.orientation === 'vertical') {
                expect(nav.gpxW).toBe(nav.cols * NAV_GPX);
                expect(nav.screenH).toBeGreaterThan(0);
            } else {
                expect(nav.screenW).toBe(w);
                expect(nav.gpxH).toBe(NAV_GPX);
            }

            // Content blocks meet their zero-padding minimums (−2 gpx for the split rounding).
            expect(b1.gpxH).toBeGreaterThanOrEqual(CONTENT_GPX_H_MIN - 1);
            expect(b2.gpxH).toBeGreaterThanOrEqual(CONTENT_GPX_H_MIN - 1);
            expect(b1.gpxW).toBeGreaterThanOrEqual(CONTENT1_GPX_W_MIN - 2);
            expect(b2.gpxW).toBeGreaterThanOrEqual(CONTENT2_GPX_W_MIN - 2);

            // world.screenH is (near) an integer multiple of the scale.
            expect(Math.abs(world.screenH - world.gpxH * scale)).toBeLessThanOrEqual(scale);
        });
    }
});

describe('computeWorldLayout — scale selection', () => {
    it('1920x1080 → N=3 (does NOT bump to N=4 for a sliver of screen height); world on the ladder, not squeezed', () => {
        const L = computeWorldLayout(1920, 1080);
        expect(L.scale).toBe(3);
        expect(L.world.gpxH).toBeGreaterThanOrEqual(WORLD_SQUEEZE_BOTTOM_BELOW);
        expect(L.world.gpxH).toBeLessThanOrEqual(WORLD_GPX_H_MAX);
    });

    it('938x667 → bumps to N=2 by squeezing the world a little (Han: "verlagen tot het minimum")', () => {
        const L = computeWorldLayout(938, 667);
        expect(L.scale).toBe(2);
        // The N=1 layout would give a much shorter world; N=2 must beat it clearly.
        expect(L.world.screenH).toBeGreaterThan(272 + 2 * NAV_GPX);
    });

    it('1366x768 → world reaches full 272 gpx (ladder phase 2)', () => {
        expect(computeWorldLayout(1366, 768).world.gpxH).toBe(WORLD_ART_GPX_H);
    });

    it('very short 1280x300 → world squeezes (below 240 ⇒ bottom crop)', () => {
        const L = computeWorldLayout(1280, 300);
        expect(L.world.gpxH).toBeLessThan(WORLD_ART_GPX_H);
        expect(L.world.gpxH).toBeGreaterThanOrEqual(WORLD_GPX_H_MIN);
        expect(L.world.bottomCropGpx).toBe(WORLD_BOTTOM_CROP_GPX);
    });

    it('very narrow 500x900 → N=1 (304 gpx width rule)', () => {
        expect(computeWorldLayout(500, 900).scale).toBe(1);
    });
});

describe('computeWorldLayout — the world/content ladder (#348, Han 2026-08-29)', () => {
    it('a very tall viewport pushes the world to its 320-gpx max, with a sky pad above the 272-gpx art', () => {
        const L = computeWorldLayout(560, 1400);      // narrow + very tall → N=1, deep into the ladder
        expect(L.scale).toBe(1);
        expect(L.world.gpxH).toBe(WORLD_GPX_H_MAX);
        expect(L.world.skyPadGpx).toBe(WORLD_GPX_H_MAX - WORLD_ART_GPX_H);   // 48
        expect(L.world.topCropGpx).toBe(0);
        expect(L.world.bottomCropGpx).toBe(0);
    });

    it('the world + nav-overhead + every content block fills the viewport exactly (no gap, no overflow)', () => {
        for (const [w, h] of [[560, 1400], [560, 900], [560, 700], [560, 560], [1280, 760], [1024, 900]]) {
            const L = computeWorldLayout(w, h);
            // the lowest edge of whatever sits at the bottom is the viewport bottom.
            const lowest = Math.max(
                L.nav.y + L.nav.screenH,
                L.content.block1.y + L.content.block1.screenH,
                L.content.block2.y + L.content.block2.screenH,
            );
            expect(Math.abs(lowest - h)).toBeLessThanOrEqual(2);
        }
    });

    it('as the viewport grows, the world height is monotonic non-decreasing then flat at 320', () => {
        let prev = 0;
        for (let h = 400; h <= 1600; h += 40) {
            const gpxH = computeWorldLayout(560, h).world.gpxH;   // fixed narrow width → stays N=1
            expect(gpxH).toBeGreaterThanOrEqual(prev - 1);        // −1 for rounding
            expect(gpxH).toBeLessThanOrEqual(WORLD_GPX_H_MAX);
            prev = gpxH;
        }
    });
});

describe('computeWorldLayout — the 1.5 half-step (#347, Han 2026-08-28)', () => {
    it('a ~580-px tall viewport on a hi-dpr screen gets scale 1.5 (bridges the 1→2 gap)', () => {
        const L = computeWorldLayout(580, 900, 2);
        expect(L.scale).toBe(1.5);
        // still a valid layout: rects in bounds, world height ≈ gpxH·scale.
        for (const r of [L.world, L.nav, L.content.block1, L.content.block2]) {
            expect(r.x + r.screenW).toBeLessThanOrEqual(580 + 0.5);
            expect(r.y + r.screenH).toBeLessThanOrEqual(900 + 0.5);
        }
        expect(Math.abs(L.world.screenH - L.world.gpxH * 1.5)).toBeLessThanOrEqual(1.5);
    });

    it('the same viewport on a dpr-1 screen stays on integer scale 1', () => {
        expect(computeWorldLayout(580, 900, 1).scale).toBe(1);
        expect(computeWorldLayout(580, 900).scale).toBe(1);   // default dpr = 1
    });

    it('1.5 is never chosen when a whole integer fits — wide screens are unaffected', () => {
        for (const [w, h] of [[1920, 1080], [1366, 768], [1000, 1000]]) {
            expect(Number.isInteger(computeWorldLayout(w, h, 2).scale)).toBe(true);
        }
    });
});

describe('computeWorldLayout — portrait stacks the content blocks (Han 2026-08-28)', () => {
    it('portrait (h > w) → both content blocks full-width, stacked, filling the bottom band', () => {
        for (const [w, h] of [[598, 899], [700, 900], [500, 900], [360, 780]]) {
            const L = computeWorldLayout(w, h);
            expect(['h-col', 'split']).toContain(L.arrangement);
            // block 2 sits below block 1, both the full viewport width.
            expect(L.content.block2.y).toBeGreaterThanOrEqual(L.content.block1.y + L.content.block1.screenH - 0.5);
            expect(L.content.block1.screenW).toBe(w);
            // together they reach the viewport bottom — the leftover is absorbed, not left as a gap.
            expect(L.content.block2.y + L.content.block2.screenH).toBeGreaterThanOrEqual(h - 1.5);
        }
    });

    it('landscape (w > h) keeps a side-by-side arrangement — the portrait rule does not fire', () => {
        for (const [w, h] of [[1920, 1080], [1366, 768], [1600, 900]]) {
            expect(['v-row', 'h-row']).toContain(computeWorldLayout(w, h).arrangement);
        }
    });
});

describe('computeWorldLayout — nav grid', () => {
    it('vertical nav spans the full column: 1 or 2 cols, height >= its icons', () => {
        // A short viewport forces a beside-column (vertical) nav.
        const L = computeWorldLayout(1200, 500);
        if (L.nav.orientation === 'vertical') {
            expect([1, 2]).toContain(L.nav.cols);
            expect(L.nav.gpxW).toBe(L.nav.cols * NAV_GPX);
            // Column spans the whole bottom area — at least tall enough for its icons.
            expect(L.nav.screenH).toBeGreaterThanOrEqual(L.nav.cols === 1 ? NAV_ICON_COUNT * NAV_GPX * L.scale - 0.5 : 0);
        }
    });

    it('horizontal nav is a full-width strip, 16 gpx tall', () => {
        const L = computeWorldLayout(1600, 900);
        if (L.nav.orientation === 'horizontal') {
            expect(L.nav.cols).toBe(8);
            expect(L.nav.rows).toBe(1);
            expect(L.nav.screenW).toBe(1600);
            expect(L.nav.gpxH).toBe(16);
        }
    });
});
