import React from 'react';
import {
    CLEF_FAMILIES, VOCAL_VARIANTS, OCTAVE_VARIANTS, familyOfClef, carouselOrder,
    patchForFamily, patchForOctave, patchForVocal, patchForTransposition, transpositionChips,
} from './clefSelector';

/**
 * ClefStaffOverlay — in-SVG CLEF selector (Han 2026-06-01), sibling of
 * RangeStaffOverlay. Rendered inside the SheetMusic SVG when `clefEditMode` is on,
 * one block per visible melodic staff.
 *
 * LAYOUT per staff (full content width startX..endX):
 *   LEFT 20%  — the three clef FAMILY glyphs (G / F / Vocal) as a carousel: the
 *               current family leftmost + bright, the other two lowlit to its right.
 *               Tapping a lowlit one selects that family (and slides the carousel —
 *               a CSS transform transition L→R; the order itself comes from
 *               clefSelector.carouselOrder).
 *   RIGHT 80% — VARIANTS of the current family. Melodic (G/F): octave chips
 *               (8 / 8va / 8vb / 15ma) + transposition chips (B♭, E♭, F, …) and a
 *               final "…" chip opening the full instrument list. Vocal: the voice
 *               clefs (Bass…Soprano). The selected variant is highlighted; cycling
 *               back to the plain octave variant reverts transposition implicitly via
 *               the family default.
 *
 * Writes go through optional callbacks (onApplyClefPatch / onOpenInstrumentList) so
 * a static render (smoke test) is possible. Pure presentation; all option logic is
 * in clefSelector.js (§6c — no hardcoded tables here).
 */

const FAMILY_SPLIT = 0.2;          // left 20% holds the family carousel
const CHIP_GAP = 6;                // gap between variant chips (SVG units)
const CHIP_W = 34, CHIP_H = 18;    // variant chip box
const FAMILY_GLYPH_SIZE = 26;

const ClefStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart,
    isTrebleVisible, isBassVisible,
    clefTreble, clefBass,
    trebleSettings, bassSettings,
    onApplyClefPatch,            // (staff, patch) => void
    onOpenInstrumentList,        // (staff) => void  (full transposing list)
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    const splitX = startX + (endX - startX) * FAMILY_SPLIT;

    // One staff block: family carousel (left) + variants (right).
    const staffBlock = (staff, staffStart, clef, settings) => {
        const famId = familyOfClef(clef);
        const order = carouselOrder(famId);            // current first
        const transKey = settings?.transpositionKey || 'C';

        // ── Left: family carousel ────────────────────────────────────────────
        // Glyphs laid out left→right; current (order[0]) bright, others lowlit.
        // Each glyph is KEYED by family id and positioned via a CSS-transitioned
        // transform, so when the order changes React keeps the same node and it
        // SLIDES to its new slot (carousel L→R, Han 2026-06-01) instead of jumping.
        const famSlotW = (splitX - startX) / 3;
        const familyGlyphs = order.map((fam, i) => {
            const isCurrent = i === 0;
            const cx = startX + famSlotW * (i + 0.5);
            return (
                <g key={fam.id} className="clef-family-glyph"
                    style={{ cursor: onApplyClefPatch ? 'pointer' : 'default', transform: `translateX(${cx}px)` }}
                    onClick={onApplyClefPatch ? () => onApplyClefPatch(staff, patchForFamily(fam.id)) : undefined}>
                    <rect x={-famSlotW / 2} y={staffStart - 14} width={famSlotW} height={48}
                        fill="transparent" />
                    <text x={0} y={staffStart + 22} fontSize={FAMILY_GLYPH_SIZE} fontFamily="Maestro"
                        textAnchor="middle"
                        fill={isCurrent ? 'var(--accent-yellow)' : 'var(--text-lowlight)'}
                        style={{ pointerEvents: 'none' }}>
                        {fam.glyph}
                    </text>
                    {debugMode && (
                        <rect x={-famSlotW / 2} y={staffStart - 14} width={famSlotW} height={48}
                            fill="orange" fillOpacity={0.18} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </g>
            );
        });

        // ── Right: variant chips ──────────────────────────────────────────────
        const chips = [];
        if (famId === 'vocal') {
            VOCAL_VARIANTS.forEach(v => chips.push({
                key: `voc-${v.clef}`, label: v.label,
                active: clef === v.clef,
                onTap: () => onApplyClefPatch?.(staff, patchForVocal(v.clef)),
            }));
        } else {
            // Octave variants first, then transposition chips, then the "…" full list.
            (OCTAVE_VARIANTS[famId] || []).forEach(o => chips.push({
                key: `oct-${o.id}`, label: o.label,
                active: clefMatchesOctave(clef, settings, famId, o),
                onTap: () => { const p = patchForOctave(famId, o.id); if (p) onApplyClefPatch?.(staff, p); },
            }));
            transpositionChips().forEach(t => chips.push({
                key: `tr-${t.key}`, label: t.label,
                active: transKey === t.key,
                onTap: () => onApplyClefPatch?.(staff, patchForTransposition(t.key)),
            }));
            chips.push({
                key: 'more', label: '…',
                active: false,
                onTap: () => onOpenInstrumentList?.(staff),
            });
        }

        const chipsX0 = splitX + CHIP_GAP;
        const chipRow = chips.map((c, i) => {
            const x = chipsX0 + i * (CHIP_W + CHIP_GAP);
            const y = staffStart + 2;
            const color = c.active ? 'var(--accent-yellow)' : 'var(--text-primary)';
            return (
                <g key={c.key}
                    style={{ cursor: onApplyClefPatch ? 'pointer' : 'default' }}
                    onClick={c.onTap}>
                    <rect x={x} y={y} width={CHIP_W} height={CHIP_H} rx={3}
                        fill="transparent" stroke={color} strokeWidth={c.active ? 1.6 : 0.8}
                        vectorEffect="non-scaling-stroke" />
                    <text x={x + CHIP_W / 2} y={y + CHIP_H / 2 + 4} fontSize={10}
                        fontFamily="Georgia, serif" textAnchor="middle" fill={color}
                        style={{ pointerEvents: 'none' }}>
                        {c.label}
                    </text>
                </g>
            );
        });

        return (
            <g className={`clef-row clef-row-${staff}`} key={staff}>
                {/* Carousel slides L→R when the family order changes (CSS transition
                    on the group's transform — set declaratively so React owns it). */}
                <g className="clef-family-carousel">{familyGlyphs}</g>
                <g className="clef-variant-chips">{chipRow}</g>
            </g>
        );
    };

    return (
        <g className="clef-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && staffBlock('treble', trebleStart, clefTreble, trebleSettings)}
            {isBassVisible && staffBlock('bass', bassStart, clefBass, bassSettings)}
        </g>
    );
};

// Whether the staff's current clef+rangeMode corresponds to a given octave variant.
function clefMatchesOctave(clef, settings, famId, octaveVariant) {
    const base = famId === 'g' ? 'treble' : 'bass';
    if (clef !== base) return false;
    const mode = settings?.rangeMode;
    if (octaveVariant.default) return mode !== 'relative' && mode !== 'relative_15a' && mode !== 'relative_low';
    return mode === octaveVariant.rangeMode;
}

export default ClefStaffOverlay;
