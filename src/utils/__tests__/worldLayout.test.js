import { describe, it, expect } from 'vitest';
import {
    computeWorldLayout, computeWorldFullHeightLayout,
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
            // Bottom crop ramps 16→0 over artGpxH 192→208 (Han 2026-09-01), then stays 0.
            const artGpxH = Math.min(world.gpxH, WORLD_ART_GPX_H);
            const expectedBottomCrop = Math.max(0, Math.min(
                WORLD_BOTTOM_CROP_GPX, (WORLD_GPX_H_MIN + WORLD_BOTTOM_CROP_GPX) - artGpxH));
            expect(world.bottomCropGpx).toBe(expectedBottomCrop);
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

    it('1366x768 → world reaches the ladder\'s 272-gpx phase-2 plateau', () => {
        // #348/#379 bugfix (2026-09-05): this plateau (272, `distributeHeight`'s own P1/P2) is a
        // SEPARATE design value from `WORLD_ART_GPX_H` (now 320, bumped to match the LDtk levels'
        // real height) — the two used to coincide at 272, which is why this test used to assert
        // against `WORLD_ART_GPX_H` directly. They no longer do, so assert the ladder's own number.
        expect(computeWorldLayout(1366, 768).world.gpxH).toBe(272);
    });

    it('very short 1280x256 → world squeezed to the 192-gpx floor ⇒ full 16-gpx bottom crop', () => {
        const L = computeWorldLayout(1280, 256);
        expect(L.world.gpxH).toBe(WORLD_GPX_H_MIN);
        expect(L.world.bottomCropGpx).toBe(WORLD_BOTTOM_CROP_GPX);
        // the 16 gpx come off the BOTTOM; the top sky crop is whatever is left to reach 272.
        expect(L.world.topCropGpx).toBe(WORLD_ART_GPX_H - WORLD_GPX_H_MIN - WORLD_BOTTOM_CROP_GPX);
    });

    it('very narrow 500x900 → N=1 (304 gpx width rule)', () => {
        expect(computeWorldLayout(500, 900).scale).toBe(1);
    });
});

describe('computeWorldLayout — the world/content ladder (#348, Han 2026-08-29)', () => {
    it('a very tall viewport pushes the world to its 320-gpx max, fully uncropped, no sky pad', () => {
        const L = computeWorldLayout(560, 1400);      // narrow + very tall → N=1, deep into the ladder
        expect(L.scale).toBe(1);
        expect(L.world.gpxH).toBe(WORLD_GPX_H_MAX);
        // #348/#379 bugfix (2026-09-05): `WORLD_ART_GPX_H` now equals `WORLD_GPX_H_MAX` (both 320), so
        // this is always 0 — there's no ladder height the art can't natively reach anymore.
        expect(L.world.skyPadGpx).toBe(WORLD_GPX_H_MAX - WORLD_ART_GPX_H);   // 0
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

    // Han 2026-09-01: the first 16 gpx of world growth above the 192 floor un-crop the BOTTOM of the
    // art (bottomCrop 16→0, one row per gpx); the top sky crop only starts shrinking after that.
    it('bottom crop ramps 16→0 as the world grows 192→208 gpx, and the top crop holds meanwhile', () => {
        let prevBottom = Infinity;
        let sawRampMiddle = false;
        // 1280-wide → N=1 with the o=0 (v-row) arrangement; heights 256→316 walk the squeeze floor,
        // the 16-gpx ramp, and out the top of it.
        for (let h = 256; h <= 316; h += 2) {
            const { gpxH, bottomCropGpx, topCropGpx, skyPadGpx } = computeWorldLayout(1280, h).world;
            const artGpxH = Math.min(gpxH, WORLD_ART_GPX_H);
            // monotonic non-increasing bottom crop as the world grows
            expect(bottomCropGpx).toBeLessThanOrEqual(prevBottom + 0.001);
            prevBottom = bottomCropGpx;
            if (artGpxH <= WORLD_GPX_H_MIN) expect(bottomCropGpx).toBe(WORLD_BOTTOM_CROP_GPX);
            if (artGpxH >= WORLD_GPX_H_MIN + WORLD_BOTTOM_CROP_GPX) expect(bottomCropGpx).toBe(0);
            if (artGpxH > WORLD_GPX_H_MIN && artGpxH < WORLD_GPX_H_MIN + WORLD_BOTTOM_CROP_GPX) {
                sawRampMiddle = true;
                // while the bottom is still un-cropping, the visible top crop stays at its floor value
                expect(topCropGpx).toBe(WORLD_ART_GPX_H - (WORLD_GPX_H_MIN + WORLD_BOTTOM_CROP_GPX));
            }
            // invariant still exact
            expect(topCropGpx + (gpxH - skyPadGpx) + bottomCropGpx).toBe(WORLD_ART_GPX_H);
        }
        expect(sawRampMiddle).toBe(true);
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

// UI world-height toggle (Han 2026-09-04): "als het 'wereld' beeld lager is dan 320 GPX, wil ik een
// knopje ... om het volle hoogte te geven. Als content 1 en 2 niet meer passen, render die dan niet.
// als het nog wel past, render ze dan wel." Drop priority: content2 first, then content1, then nav.
describe('computeWorldFullHeightLayout — the manual full-height override', () => {
    it('pins the world block to WORLD_GPX_H_MAX and keeps the scale the caller passed in', () => {
        for (const [w, h] of VIEWPORTS) {
            const n = computeWorldLayout(w, h).scale;
            const L = computeWorldFullHeightLayout(w, h, n);
            expect(L.scale).toBe(n);
            expect(L.world.x).toBe(0);
            expect(L.world.y).toBe(0);
            expect(L.world.screenW).toBe(w);
            // Clamped only when the viewport itself can't reach 320 gpx at this scale.
            expect(L.world.gpxH).toBe(Math.min(WORLD_GPX_H_MAX, Math.round(h / n)));
        }
    });

    it('when everything comfortably fits, all three blocks survive full-width, filling the viewport', () => {
        const n = 1;
        const L = computeWorldFullHeightLayout(2000, 2000, n);   // world 320 + plenty left over
        expect(L.nav).not.toBeNull();
        expect(L.content.block1).not.toBeNull();
        expect(L.content.block2).not.toBeNull();
        for (const r of [L.nav, L.content.block1, L.content.block2]) {
            expect(r.x).toBe(0);
            expect(r.screenW).toBe(2000);
        }
        // stacked top-to-bottom with no gap, filling to the viewport bottom.
        expect(L.content.block1.y).toBe(L.world.screenH);
        expect(L.content.block2.y).toBe(L.content.block1.y + L.content.block1.screenH);
        expect(L.nav.y).toBe(L.content.block2.y + L.content.block2.screenH);
        expect(L.nav.y + L.nav.screenH).toBe(2000);
    });

    it('drops content2 FIRST when there is only room for content1 + nav (ac: priority order)', () => {
        const n = 1;
        // world 320 + content1 min (64) + nav (16) = 400; leave a bit of slack but not enough for content2 too.
        const h = 320 + CONTENT_GPX_H_MIN + NAV_GPX + 10;
        const L = computeWorldFullHeightLayout(2000, h, n);
        expect(L.content.block2).toBeNull();
        expect(L.content.block1).not.toBeNull();
        expect(L.nav).not.toBeNull();
        // the survivors still fill exactly to the viewport bottom.
        expect(L.nav.y + L.nav.screenH).toBe(h);
    });

    it('drops content1 too when even that does not fit, keeping nav (kept longest)', () => {
        const n = 1;
        const h = 320 + NAV_GPX + 5;   // room for world + nav only
        const L = computeWorldFullHeightLayout(2000, h, n);
        expect(L.content.block1).toBeNull();
        expect(L.content.block2).toBeNull();
        expect(L.nav).not.toBeNull();
        expect(L.nav.y + L.nav.screenH).toBe(h);
    });

    it('drops everything but the world when even nav does not fit — world alone fills the viewport', () => {
        const n = 1;
        const h = 320;   // exactly the world, nothing left for nav
        const L = computeWorldFullHeightLayout(2000, h, n);
        expect(L.nav).toBeNull();
        expect(L.content.block1).toBeNull();
        expect(L.content.block2).toBeNull();
        expect(L.world.screenH).toBe(h);
    });

    it('never renders a surviving block below its own minimum size', () => {
        for (const h of [340, 360, 400, 420, 450, 500, 600]) {
            const L = computeWorldFullHeightLayout(2000, h, 1);
            if (L.content.block1) expect(L.content.block1.screenH).toBeGreaterThanOrEqual(CONTENT_GPX_H_MIN - 0.5);
            if (L.content.block2) expect(L.content.block2.screenH).toBeGreaterThanOrEqual(CONTENT_GPX_H_MIN - 0.5);
            if (L.nav) expect(L.nav.screenH).toBeGreaterThanOrEqual(NAV_GPX - 0.5);
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
