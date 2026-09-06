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

// #weather (Han 2026-09-04, "Gebruik wel Bitfantasy in de tekstvakken voor benadrukte woorden"): the
// dialogue body renders in SandyForest (DialogueBox sets the family) and any run wrapped in *asterisks*
// switches to Bitfantasy. Splits `text` into `[{ text, emph }]` segments, markers stripped. Multi-word
// runs are fine (`*I almost have it*`); a lone/unbalanced `*` is left as a literal character.
export function parseEmphasis(text) {
    const segments = [];
    const re = /\*([^*]+)\*/g;
    let last = 0;
    let m = re.exec(text);
    while (m) {
        if (m.index > last) segments.push({ text: text.slice(last, m.index), emph: false });
        segments.push({ text: m[1], emph: true });
        last = m.index + m[0].length;
        m = re.exec(text);
    }
    if (last < text.length) segments.push({ text: text.slice(last), emph: false });
    return segments.length ? segments : [{ text, emph: false }];
}

const EMPHASIS_FONT = "'Bitfantasy', monospace";

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
    // #weather: flatten the *emphasis* segments into one char stream carrying a per-char `emph` flag, so
    // the word-grouping / oscillation-seed logic below is unchanged — an emphasised char just also gets
    // Bitfantasy as its font-family.
    const chars = [];
    for (const seg of parseEmphasis(text)) {
        for (const ch of seg.text) chars.push({ ch, emph: seg.emph });
    }

    let n = 0;
    const charSpan = ({ ch, emph }) => {
        const i = n++;
        return (
            <span
                key={`c${i}`}
                ref={(el) => { spanRefs.current[i] = el; }}
                style={emph ? { display: 'inline-block', fontFamily: EMPHASIS_FONT } : { display: 'inline-block' }}
            >
                {ch}
            </span>
        );
    };

    // Group the char stream into whitespace runs (unbreakable Fragments) and word runs (nowrap spans),
    // exactly as before — but over `chars` (with flags) instead of the raw string.
    const groups = [];
    let cur = null;
    for (const c of chars) {
        const isWs = /\s/.test(c.ch);
        if (!cur || cur.ws !== isWs) { cur = { ws: isWs, items: [] }; groups.push(cur); }
        cur.items.push(c);
    }

    return (
        <span style={{ ...style, whiteSpace: 'pre-wrap', overflowWrap: 'normal', wordBreak: 'keep-all' }}>
            {groups.map((g, gi) => (
                g.ws
                    // eslint-disable-next-line react/no-array-index-key -- static split, index is stable identity
                    ? <React.Fragment key={`s${gi}`}>{g.items.map((c) => c.ch).join('')}</React.Fragment>
                    // eslint-disable-next-line react/no-array-index-key
                    : <span key={`w${gi}`} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>{g.items.map(charSpan)}</span>
            ))}
        </span>
    );
}
