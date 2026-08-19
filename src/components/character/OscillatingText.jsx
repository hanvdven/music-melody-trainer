import React, { useEffect, useRef } from 'react';
import { oscillate } from '../../utils/oscillate';

// #925 follow-up (Han 2026-08-16, "letters van tekst moeten een heel klein beetje oscilleren
// (individueel), range 2 game pixels"): splits `text` into one <span> per character, each nudged
// vertically via the SAME oscillate() wobble every projectile/flying-creature already uses (CLAUDE.md
// §6c — reuse, don't reinvent a wobble formula), seeded by the character's own index so neighboring
// letters don't move in lockstep. Ref-driven, no per-frame React state (CLAUDE.md §6: 60Hz state churn
// is banned) — a single shared rAF loop directly sets each span's transform, mirroring
// SheetRpgLayer.jsx's own imperative-ref animation convention (§193/§863 round 2) rather than a React
// state re-render per frame.
//
// #925 round 2 (Han 2026-08-16, "mag 50% minder groot, en 100% trager"): range halved (2 -> 1 game px),
// speed halved (oscillate()'s own `speed` multiplier, default 1 -> 0.5 here) from the round-1 defaults.
const OSC_SPEED = 0.5;

// `rangeGamePx`: the oscillation range in RPG/GAME pixels (never screen px, per this project's own
// pixel-terminology rule — see docs memory "Pixels = RPG sprite pixels"). The caller supplies `scale`
// (its own native-px-to-display-px zoom constant, e.g. DIALOGUE_SCALE) to convert.
export default function OscillatingText({ text, scale, rangeGamePx = 1, style }) {
    const spanRefs = useRef([]);
    const liveRef = useRef({ scale, rangeGamePx });
    liveRef.current = { scale, rangeGamePx };
    spanRefs.current = [];

    useEffect(() => {
        let raf;
        const animate = () => {
            const t = performance.now();
            const { scale: s, rangeGamePx: r } = liveRef.current;
            const rangePx = r * s;
            spanRefs.current.forEach((el, i) => {
                if (!el) return;
                const dy = oscillate(i, t, rangePx, OSC_SPEED);
                el.style.transform = `translateY(${dy}px)`;
            });
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf);
        // Deliberately NOT depending on scale/rangeGamePx — read live via liveRef so a param change never
        // tears down and restarts the rAF loop (would reset every letter's phase, a visible stutter).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text]);

    return (
        // #1088 (Han 2026-08-19, "sinds ticket 1027 hebben lange zinnen geen 'new line' mechanisme meer"):
        // `white-space: pre` never wraps — it only breaks on literal `\n` characters, so a long sentence ran
        // straight off the edge of the fixed-width dialogue box. `pre-wrap` keeps the SAME whitespace-
        // preserving behaviour (so multiple spaces between words still render, matching the old `pre`
        // semantics for anything that isn't a bare wrap point) while allowing the browser to wrap between
        // the per-character `inline-block` spans below at the container's own width.
        <span style={{ ...style, whiteSpace: 'pre-wrap' }}>
            {text.split('').map((ch, i) => (
                // eslint-disable-next-line react/no-array-index-key -- static per-render character list, index is stable identity here
                <span key={i} ref={(el) => { spanRefs.current[i] = el; }} style={{ display: 'inline-block' }}>
                    {ch}
                </span>
            ))}
        </span>
    );
}
