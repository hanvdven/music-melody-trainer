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

    // #UI-overhaul (Han 2026-08-27, 'nooit nieuwe regels midden in een woord' — saw "y⏎ou know"):
    // every character used to be its own `inline-block`, so the browser could break the line between
    // ANY two of them, mid-word. Now each WORD is a single `white-space: nowrap` `inline-block` group
    // — the browser can only break at the whitespace runs BETWEEN groups. `pre-wrap` on the parent
    // keeps multiple spaces / explicit `\n` (the #1088 requirement). A global char counter keeps the
    // per-letter oscillation seed stable across the grouping.
    let n = 0;
    const charSpan = (ch) => {
        const i = n++;
        return (
            <span key={`c${i}`} ref={(el) => { spanRefs.current[i] = el; }} style={{ display: 'inline-block' }}>
                {ch}
            </span>
        );
    };
    return (
        <span style={{ ...style, whiteSpace: 'pre-wrap', overflowWrap: 'normal', wordBreak: 'keep-all' }}>
            {text.split(/(\s+)/).map((tok, ti) => {
                if (tok === '') return null;
                // eslint-disable-next-line react/no-array-index-key -- static split, index is stable identity
                if (/\s/.test(tok)) return <React.Fragment key={`s${ti}`}>{tok}</React.Fragment>;
                return (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={`w${ti}`} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {tok.split('').map(charSpan)}
                    </span>
                );
            })}
        </span>
    );
}
