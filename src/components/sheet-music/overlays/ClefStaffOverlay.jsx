import React from 'react';
import {
    CLEF_FAMILIES, VOCAL_VARIANTS, OCTAVE_VARIANTS, familyOfClef, carouselOrder,
    patchForFamily, patchForOctave, patchForVocal, patchForTransposition, transpositionChips,
} from './clefSelector';
import { ClefGlyph, variantToSymbolKey, CLEF_GLYPH_X } from '../clefGlyphs';

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

const CHIP_GAP = 6;                // gap between variant chips (SVG units)
const CHIP_W = 34, CHIP_H = 18;    // variant chip box
const FAMILY_GLYPH_SIZE = 36;      // clefs at ~true staff size (Han 2026-06-01)
const FAMILY_SLOT_W = 26;          // horizontal step between carousel glyphs

const ClefStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    trebleSettings, bassSettings,
    percussionVoiceSplit = false,
    onApplyClefPatch,            // (staff, patch) => void
    onOpenInstrumentList,        // (staff) => void  (full transposing list)
    onToggleVoiceSplit,          // () => void  (percussion together↔split)
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    // The family carousel lives in the CLEF GUTTER, fully LEFT of startX (Han
    // 2026-06-01): the current clef sits where the real clef glyph normally is
    // (~x=13) and neighbours peek/scroll to its right up to startX. Variant chips
    // occupy the staff body from startX onward.
    const GUTTER_X = CLEF_GLYPH_X;     // current carousel glyph at the real clef pos
    const splitX = startX;

    // One staff block: family carousel (left) + variants (right).
    const staffBlock = (staff, staffStart, clef, settings) => {
        const famId = familyOfClef(clef);
        const order = carouselOrder(famId);            // current first
        const transKey = settings?.transpositionKey || 'C';

        // ── Left: family carousel (in the clef gutter, LEFT of startX) ───────
        // The CURRENT family sits at the EXACT sheet clef position (CLEF_GLYPH_X) and
        // shows the EXACT clef glyph via ClefGlyph (reused from the sheet, incl.
        // ottava + correct height). Neighbours step right by FAMILY_SLOT_W, filling
        // the gutter all the way up to startX. Each glyph is KEYED by family id and
        // positioned via a CSS-transitioned transform, so a family change SLIDES the
        // carousel L→R; glyphs entering from the right slide in (no fade — Han
        // 2026-06-01 #4). The current slot's symbol is the concrete current clef;
        // neighbours use their family's default clef glyph.
        const slotX = (i) => CLEF_GLYPH_X + i * FAMILY_SLOT_W;
        const lastX = slotX(order.length - 1);
        const familyGlyphs = order.map((fam, i) => {
            const isCurrent = i === 0;
            const isOff = fam.id === 'off';
            const colr = isCurrent ? 'var(--accent-yellow)' : 'var(--text-lowlight)';
            // current slot → the actual concrete clef symbol; others → family default.
            const symbolKey = isCurrent ? variantToSymbolKey(clef) : fam.clef;
            // baseY positions ClefGlyph on the staff: sheet uses 30 at staffYStart 0,
            // so add staffStart. x is relative (group translated to slotX).
            return (
                <g key={fam.id} className="clef-family-glyph"
                    style={{
                        cursor: onApplyClefPatch ? 'pointer' : 'default',
                        transform: `translateX(${slotX(i)}px)`,
                    }}
                    onClick={onApplyClefPatch ? () => onApplyClefPatch(staff, patchForFamily(fam.id)) : undefined}>
                    <rect x={-FAMILY_SLOT_W / 2} y={staffStart - 14} width={FAMILY_SLOT_W} height={48}
                        fill="transparent" />
                    {isOff ? (
                        // 'off' = a large cross drawn as strokes (clear at any size).
                        <g stroke={colr} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                            <path d={`M -9 ${staffStart + 11} L 9 ${staffStart + 29}`} />
                            <path d={`M 9 ${staffStart + 11} L -9 ${staffStart + 29}`} />
                        </g>
                    ) : (
                        <ClefGlyph symbolKey={symbolKey} x={0} baseY={staffStart + 30} fill={colr} />
                    )}
                    {debugMode && (
                        <rect x={-FAMILY_SLOT_W / 2} y={staffStart - 14} width={FAMILY_SLOT_W} height={48}
                            fill="orange" fillOpacity={0.18} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </g>
            );
        });
        // A clip so glyphs sliding in from the right don't spill past startX into the
        // variant chips (they appear to slide in from behind the chips area).
        const clipId = `clef-gutter-clip-${staff}`;
        void lastX;

        // ── Right: variant chips ──────────────────────────────────────────────
        // 'off' (disabled staff) has no variants.
        const rangeMode = settings?.rangeMode;
        const chips = [];
        if (famId === 'off') {
            // no chips
        } else if (famId === 'vocal') {
            // Show the actual clef GLYPH per voice (Han 2026-06-01: clefs, not names).
            // Bass & Baritone share the F-clef glyph but are distinct voices, matched
            // on rangeMode so the right one highlights.
            VOCAL_VARIANTS.forEach(v => chips.push({
                key: `voc-${v.rangeMode}`, glyph: v.glyph,
                active: rangeMode === v.rangeMode,
                onTap: () => onApplyClefPatch?.(staff, patchForVocal(v)),
            }));
        } else {
            // Octave variants as full ottava CLEFS (glyph + 8/15 marker), not text.
            (OCTAVE_VARIANTS[famId] || []).forEach(o => chips.push({
                key: `oct-${o.id}`, glyph: o.glyph, ott: o.ott,
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
                <g key={c.key} data-fly=""
                    style={{ cursor: onApplyClefPatch ? 'pointer' : 'default' }}
                    onClick={c.onTap}>
                    <rect x={x} y={y} width={CHIP_W} height={CHIP_H} rx={3}
                        fill="transparent" stroke={color} strokeWidth={c.active ? 1.6 : 0.8}
                        vectorEffect="non-scaling-stroke" />
                    {c.glyph ? (
                        <>
                            <text x={x + CHIP_W / 2} y={y + CHIP_H / 2 + 6} fontSize={20}
                                fontFamily="Maestro" textAnchor="middle" fill={color}
                                style={{ pointerEvents: 'none' }}>
                                {c.glyph}
                            </text>
                            {/* Ottava marker (8 / 15) drawn above or below the clef, as
                                in real notation — the octave variant reads as a clef. */}
                            {c.ott && (
                                <text x={x + CHIP_W / 2} y={c.ott.above ? y + 4 : y + CHIP_H - 1}
                                    fontSize={6} fontFamily="Georgia, serif" fontStyle="italic"
                                    textAnchor="middle" fill={color} style={{ pointerEvents: 'none' }}>
                                    {c.ott.n}
                                </text>
                            )}
                        </>
                    ) : (
                        <text x={x + CHIP_W / 2} y={y + CHIP_H / 2 + 4} fontSize={10}
                            fontFamily="Georgia, serif" textAnchor="middle" fill={color}
                            style={{ pointerEvents: 'none' }}>
                            {c.label}
                        </text>
                    )}
                </g>
            );
        });

        return (
            <g className={`clef-row clef-row-${staff}`} key={staff}>
                {/* Clip the carousel to the gutter [0, startX] so glyphs sliding in
                    from the right are revealed within the gutter, not over the chips. */}
                <clipPath id={clipId}>
                    <rect x={0} y={staffStart - 16} width={startX} height={52} />
                </clipPath>
                {/* Carousel slides L→R when the family order changes (CSS transition
                    on each glyph's transform — set declaratively so React owns it). */}
                <g className="clef-family-carousel" clipPath={`url(#${clipId})`}>{familyGlyphs}</g>
                <g className="clef-variant-chips">{chipRow}</g>
            </g>
        );
    };

    // Percussion block: left = a percussion-clef indicator (the ‖ neutral clef);
    // right = a `[[k,c],hh,[s,hh],hh]` ×2 mini-rhythm acting as a TOGGLER between the
    // two staff modes — TOGETHER (one voice, all stems one way) and SPLIT (RH↑/LH↓
    // parallel voices, = `percussionVoiceSplit`). Han 2026-06-01: this toggler used
    // to live in SettingsPanel; localized here. We draw a compact glyph-free sketch
    // (dots + stems) rather than the full renderer to keep it light.
    const percussionBlock = () => {
        const y = percussionStart;
        // Eighth-note x positions for one bar of the pattern, repeated ×2 (8 onsets).
        const pat = [['k', 'c'], ['hh'], ['s', 'hh'], ['hh']];
        const onsets = [...pat, ...pat];
        const mid = y + 20;

        // A compact rendering of one option (split = stems both ways; together =
        // all stems up). Returns a <g> spanning [ox, ox+optW].
        const option = (label, split, active, ox, optW, onTap) => {
            const color = active ? 'var(--accent-yellow)' : 'var(--text-lowlight)';
            const step = optW / onsets.length;
            const dots = onsets.map((stack, i) => {
                const cx = ox + step * (i + 0.5);
                // top voice (hi-hat/cymbal) sits high; bottom voice (kick/snare) low.
                const hasTop = stack.some(n => n === 'hh' || n === 'c');
                const hasBot = stack.some(n => n === 'k' || n === 's');
                return (
                    <g key={i}>
                        {hasTop && <circle cx={cx} cy={mid - 9} r={1.6} fill={color} />}
                        {hasBot && <circle cx={cx} cy={mid + 4} r={1.8} fill={color} />}
                        {/* stems: split → top up / bottom down; together → all up */}
                        {hasTop && <path d={`M ${cx + 1.6} ${mid - 9} V ${mid - 18}`} stroke={color} strokeWidth={0.8} />}
                        {hasBot && <path d={`M ${cx + (split ? -1.6 : 1.6)} ${mid + 4} V ${split ? mid + 13 : mid - 18}`}
                            stroke={color} strokeWidth={0.8} />}
                    </g>
                );
            });
            return (
                <g key={label} style={{ cursor: onToggleVoiceSplit ? 'pointer' : 'default' }} onClick={onTap}>
                    <rect x={ox} y={y - 2} width={optW} height={40} rx={3}
                        fill="transparent" stroke={color} strokeWidth={active ? 1.6 : 0.8}
                        vectorEffect="non-scaling-stroke" />
                    {dots}
                    {debugMode && (
                        <rect x={ox} y={y - 2} width={optW} height={40}
                            fill="orange" fillOpacity={0.15} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </g>
            );
        };

        const bodyX = splitX + CHIP_GAP;
        const bodyW = (endX - bodyX);
        const optW = (bodyW - CHIP_GAP) / 2;
        return (
            <g className="clef-row clef-row-percussion" key="percussion">
                {/* Neutral percussion clef glyph in the gutter (not switchable here). */}
                <text x={GUTTER_X} y={y + 30} fontSize={FAMILY_GLYPH_SIZE} fontFamily="Maestro"
                    textAnchor="middle" fill="var(--text-primary)" style={{ pointerEvents: 'none' }}>
                    {'/'}
                </text>
                {option('together', false, !percussionVoiceSplit, bodyX, optW,
                    () => { if (percussionVoiceSplit) onToggleVoiceSplit?.(); })}
                {option('split', true, percussionVoiceSplit, bodyX + optW + CHIP_GAP, optW,
                    () => { if (!percussionVoiceSplit) onToggleVoiceSplit?.(); })}
            </g>
        );
    };

    return (
        <g className="clef-overlay" onClick={(e) => e.stopPropagation()}>
            {isTrebleVisible && staffBlock('treble', trebleStart, clefTreble, trebleSettings)}
            {isBassVisible && staffBlock('bass', bassStart, clefBass, bassSettings)}
            {isPercussionVisible && percussionBlock()}
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
