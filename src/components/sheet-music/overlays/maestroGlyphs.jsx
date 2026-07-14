import React from 'react';

// ── Custom Maestro fraction glyphs (#434, Han 2026-07-14) ─────────────────────────────────────────
//
// Han wants fractional setter labels (smallest-note 1/4, 1/8 …; chords/measure ½, 2½ …) rendered as
// REAL fractions instead of the ASCII '½'. The Maestro music font's small numerals could not be
// addressed reliably (the Mac OPTION+digit codepoints did not render), so the fraction NUMERALS use
// a plain sans-serif at a small size with superscript/subscript positioning (font-independent, always
// renders). A diagonal fraction: small raised numerator / slash / small lowered denominator. Same
// helper drives the smallest-note and chords/measure labels. (If the Maestro small numerals become
// available under a known codepoint, only this component needs to change.)
const FRACTION_FONT = 'sans-serif';

// A diagonal small fraction num/den centred on (cx, cy).
export const MaestroFraction = ({ num, den, cx, cy, size = 15, color = 'var(--text-primary)', opacity = 1 }) => {
    const d = size * 0.72;   // the small numerals are ~72% of the nominal size
    return (
        <g style={{ pointerEvents: 'none' }} opacity={opacity}>
            <text x={cx - d * 0.42} y={cy - d * 0.28} textAnchor="middle" fontFamily={FRACTION_FONT}
                fontSize={d} fill={color}>{num}</text>
            <text x={cx} y={cy + d * 0.30} textAnchor="middle" fontFamily={FRACTION_FONT}
                fontSize={size} fill={color}>/</text>
            <text x={cx + d * 0.46} y={cy + d * 0.52} textAnchor="middle" fontFamily={FRACTION_FONT}
                fontSize={d} fill={color}>{den}</text>
        </g>
    );
};

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
