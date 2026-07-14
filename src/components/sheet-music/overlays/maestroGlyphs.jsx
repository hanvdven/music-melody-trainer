import React from 'react';

// ── Custom Maestro fraction glyphs (#434, Han 2026-07-14) ─────────────────────────────────────────
//
// Han wants fractional setter labels (smallest-note 1/4, 1/8 …; chords/measure ½, 2½ …) rendered as
// REAL music-font fractions instead of the ASCII '½' that Maestro can't draw. Maestro exposes SMALL
// numerals via the Mac OPTION+digit keys (Han: "OPTION+1 = Small 1, OPTION+2 = Small 2, …"), which
// map to these codepoints in the font. We build a diagonal fraction: small superscript numerator /
// slash / small subscript denominator. Same helper drives the smallest-note and chords/measure labels.
const MAESTRO_SMALL_DIGIT = {
    '0': 'º', // º  OPT+0
    '1': '¡', // ¡  OPT+1
    '2': '™', // ™  OPT+2
    '3': '£', // £  OPT+3
    '4': '¢', // ¢  OPT+4
    '5': '∞', // ∞  OPT+5
    '6': '§', // §  OPT+6
    '7': '¶', // ¶  OPT+7
    '8': '•', // •  OPT+8
    '9': 'ª', // ª  OPT+9
};
const smallDigits = (n) => String(n).split('').map(d => MAESTRO_SMALL_DIGIT[d] ?? d).join('');

// A diagonal small fraction num/den centred on (cx, cy).
export const MaestroFraction = ({ num, den, cx, cy, size = 15, color = 'var(--text-primary)', opacity = 1 }) => (
    <g style={{ pointerEvents: 'none' }} opacity={opacity}>
        <text x={cx - size * 0.32} y={cy - size * 0.14} textAnchor="middle" fontFamily="Maestro"
            fontSize={size} fill={color}>{smallDigits(num)}</text>
        <text x={cx} y={cy + size * 0.12} textAnchor="middle" fontFamily="serif" fontSize={size * 1.15}
            fill={color}>/</text>
        <text x={cx + size * 0.34} y={cy + size * 0.34} textAnchor="middle" fontFamily="Maestro"
            fontSize={size} fill={color}>{smallDigits(den)}</text>
    </g>
);

// Whole part → big Maestro numeral; the common fractional parts → a trailing small fraction.
const FRAC_PARTS = { 0.25: [1, 4], 0.5: [1, 2], 0.75: [3, 4] };

// A MIXED number (e.g. 2.5 → "2" + ½, 0.25 → ¼, 3 → "3") for the chords/measure count. The whole
// part uses the big Maestro numeral (same as the sheet); the fraction uses MaestroFraction.
export const MaestroMixedNumber = ({ value, cx, cy, size = 24, color = 'var(--text-primary)', opacity = 1 }) => {
    const whole = Math.floor(value);
    const fracKey = Math.round((value - whole) * 100) / 100;
    const frac = FRAC_PARTS[fracKey] || null;
    const showWhole = whole > 0 || !frac;   // 0.25 shows just the fraction; 2.5 shows 2 + ½
    // Rough widths so whole + fraction sit side by side, centred on cx.
    const wholeW = showWhole ? size * 0.6 : 0;
    const fracW = frac ? size * 0.7 : 0;
    const x0 = cx - (wholeW + fracW) / 2;
    return (
        <g style={{ pointerEvents: 'none' }} opacity={opacity}>
            {showWhole && (
                <text x={x0 + wholeW / 2} y={cy} textAnchor="middle" fontFamily="Maestro"
                    fontSize={size} fill={color}>{whole}</text>
            )}
            {frac && (
                <MaestroFraction num={frac[0]} den={frac[1]} cx={x0 + wholeW + fracW / 2} cy={cy - size * 0.15}
                    size={size * 0.62} color={color} />
            )}
        </g>
    );
};
