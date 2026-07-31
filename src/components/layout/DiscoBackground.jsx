import React, { useRef, useEffect } from 'react';

// #628-S5 DISCO BALL background (Han 2026-07-31). CSS backgrounds cannot give a particle a
// POSITION-DEPENDENT speed, so the disco theme's animated background is this <canvas> particle system.
//
// Physics — a mirror-ball's reflection on a FLAT wall (Han 2026-07-31: "denk na over de fysica"). A beam
// from a facet rotating at constant ω hits the flat view at
//   x = cx + K · tan(θ),   θ = phase + ω·t   (wrapped to (−π/2, π/2))
// so the spot's speed dx/dθ = K·sec²θ is SLOW at the centre and FAST toward the edges — and it sweeps in
// ONE direction (θ monotonic): it exits the right edge (tan→+∞) and a new spot enters from the left
// (tan→−∞), never bouncing back. This is exactly Han's "in het midden 100%, naar de rand 200%,
// versnellen naar de rand" — the earlier sin() model was slow-at-edges and oscillated (wrong). Rows at
// 15/35/50/65/85 %; 4/5/6/5/4 dots per row. Specks are small BLURRED rectangles. LAMPS are a few coloured
// (R/B/G/Y) glows of VARIED size drifting randomly, sometimes off-screen. rAF-driven; no React state (§6).
export default function DiscoBackground() {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        const parent = canvas.parentElement;
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const ROWS = [0.15, 0.35, 0.50, 0.65, 0.85];
        const DOTS = [4, 6, 8, 6, 4];                       // more toward the equator (Han: most in mid row)
        const LAMP_COLORS = ['#ff2d2d', '#2d6eff', '#2ddc5a', '#ffd72d'];
        const OMEGA = 0.32;                                 // rotation speed (rad/s) — Han: 65% slower
        let w = 0, h = 0, t0 = performance.now(), raf = 0;
        let specks = [], lamps = [];

        const build = () => {
            specks = [];
            ROWS.forEach((ry, ri) => {
                const n = DOTS[ri];
                const offset = ri * 0.7;                    // stagger rows so they don't line up
                for (let j = 0; j < n; j++) {
                    specks.push({ phase: (j / n) * Math.PI * 2 + offset, y: ry * h });
                }
            });
            lamps = LAMP_COLORS.map((c) => ({
                c,
                x: Math.random() * w,
                y: (0.15 + 0.7 * Math.random()) * h,
                r: (0.20 + Math.random() * 0.21) * Math.min(w, h),   // +50% bigger, varied (Han)
                vx: (18 + Math.random() * 30) * (Math.random() < 0.5 ? -1 : 1),
                vy: (8 + Math.random() * 18) * (Math.random() < 0.5 ? -1 : 1),
            }));
        };

        const resize = () => {
            const rect = parent.getBoundingClientRect();
            w = Math.max(1, rect.width); h = Math.max(1, rect.height);
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
            canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            build();
        };

        // #628-S5 (Han todo-4: bg in line with the theme's colour): the base = the theme's own --panel-bg
        // (read once), so the disco background matches the swatch/palette instead of a divergent hardcode.
        const base = getComputedStyle(canvas).getPropertyValue('--panel-bg').trim() || '#a99ec8';

        let last = performance.now();
        const draw = (now) => {
            const dt = Math.min((now - last) / 1000, 0.05); last = now;
            const t = (now - t0) / 1000;
            const cx = w / 2, halfW = w / 2;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = base;
            ctx.fillRect(0, 0, w, h);

            // LAMPS — additive coloured glows, drifting; wrap with a margin so they leave/re-enter frame
            ctx.globalCompositeOperation = 'lighter';
            lamps.forEach((l) => {
                l.x += l.vx * dt; l.y += l.vy * dt;
                if (l.x < -l.r * 1.6) l.x = w + l.r; else if (l.x > w + l.r * 1.6) l.x = -l.r;
                if (l.y < -l.r * 1.6) l.y = h + l.r; else if (l.y > h + l.r * 1.6) l.y = -l.r;
                const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
                g.addColorStop(0, l.c + 'cc'); g.addColorStop(0.5, l.c + '99'); g.addColorStop(1, l.c + '00');
                ctx.globalAlpha = 0.42;                      // subtler (Han: less 'fel')
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
            });
            ctx.globalAlpha = 1;

            // SPECKS — blurred white rects, tan-projected: slow at centre, FASTER toward the edges, sweeping
            // one direction (exit right, re-enter left). Larger K = the edge/centre speed ratio 1+(halfW/K)²
            // is smaller = a MORE SUBTLE speed difference (Han). K=halfW/2 → ~5× (was halfW/3 → 10×).
            const K = halfW / 2;
            ctx.shadowColor = 'rgba(255,255,255,0.95)';
            ctx.shadowBlur = 7;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            specks.forEach((s) => {
                let a = (s.phase + OMEGA * t) % Math.PI;     // 0..π
                if (a < 0) a += Math.PI;
                a -= Math.PI / 2;                            // −π/2 .. π/2
                const x = cx + K * Math.tan(a);
                const off = Math.abs(x - cx) / halfW;
                if (off > 1.02) return;                      // off-screen (tan blows up near ±π/2)
                ctx.globalAlpha = off > 0.75 ? Math.max(0, 1 - (off - 0.75) / 0.27) : 1;  // fade at edges
                ctx.fillRect(x - 2.5, s.y - 1.5, 5, 3);      // small rectangle (Han) + shadowBlur glow
            });
            ctx.shadowBlur = 0; ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            raf = requestAnimationFrame(draw);
        };

        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(parent);
        raf = requestAnimationFrame(draw);
        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }, []);

    return <canvas ref={canvasRef} className="disco-canvas" aria-hidden="true" />;
}
