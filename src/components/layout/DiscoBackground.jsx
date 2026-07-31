import React, { useRef, useEffect } from 'react';

// #628-S5 DISCO BALL background (Han 2026-07-31). CSS backgrounds cannot give a particle a
// POSITION-DEPENDENT speed, so the disco theme's animated background is this <canvas> particle system.
//
// Physics — a rotating cylinder/ball. Each speck sits on a horizontal ring at phase φ and its screen X is
//   x = cx + halfW * sin(φ + ω·t)
// so its horizontal speed dx/dt = halfW·ω·cos(φ+ω·t) is MAX at the centre and → 0 at the edges, where the
// specks bunch up (the classic mirror-ball sweep; Han: "in het midden bewegen ze sneller … naar de rand
// toe … verder uit elkaar"). Rings (rows) at 15/35/50/65/85 % of the height; dot counts 4/5/6/5/4 give the
// ¼ / ⅕ / ⅙ / ⅕ / ¼ average spacing (tightest at the equator). Specks are small BLURRED rectangles.
// LAMPS are a few coloured (R/B/G/Y) glows of VARIED size drifting randomly, sometimes off-screen.
// rAF-driven; nothing here touches React state per frame (CLAUDE.md §6).
export default function DiscoBackground() {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        const parent = canvas.parentElement;
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const ROWS = [0.15, 0.35, 0.50, 0.65, 0.85];
        const DOTS = [4, 5, 6, 5, 4];                       // per row → ¼ ⅕ ⅙ ⅕ ¼ spacing
        const LAMP_COLORS = ['#ff2d2d', '#2d6eff', '#2ddc5a', '#ffd72d'];
        const OMEGA = 0.9;                                  // ring rotation speed (rad/s) — Han: faster
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
                r: (0.05 + Math.random() * 0.09) * Math.min(w, h),   // varied sizes
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

        let last = performance.now();
        const draw = (now) => {
            const dt = Math.min((now - last) / 1000, 0.05); last = now;
            const t = (now - t0) / 1000;
            const cx = w / 2, halfW = w / 2;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#9e92c0';                       // medium base so the screened light shows
            ctx.fillRect(0, 0, w, h);

            // LAMPS — additive coloured glows, drifting; wrap with a margin so they leave/re-enter frame
            ctx.globalCompositeOperation = 'lighter';
            lamps.forEach((l) => {
                l.x += l.vx * dt; l.y += l.vy * dt;
                if (l.x < -l.r * 1.6) l.x = w + l.r; else if (l.x > w + l.r * 1.6) l.x = -l.r;
                if (l.y < -l.r * 1.6) l.y = h + l.r; else if (l.y > h + l.r * 1.6) l.y = -l.r;
                const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
                g.addColorStop(0, l.c); g.addColorStop(1, l.c + '00');
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
            });
            ctx.globalAlpha = 1;

            // SPECKS — blurred white rects on the rotating rings (fade the "back" of the ring for depth)
            ctx.shadowColor = 'rgba(255,255,255,0.95)';
            ctx.shadowBlur = 7;
            specks.forEach((s) => {
                const a = s.phase + OMEGA * t;
                const x = cx + halfW * Math.sin(a);
                const front = Math.cos(a);                   // >0 = near side → brighter
                ctx.globalAlpha = 0.28 + 0.62 * Math.max(0, front);
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
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
