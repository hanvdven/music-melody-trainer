import React from 'react';
import {
    CLEF_FAMILIES, VOCAL_VARIANTS, OCTAVE_VARIANTS, familyOfClef, carouselOrder,
    patchForFamily, patchForOctave, patchForVocal, patchForTransposition, transpositionChips,
} from './clefSelector';
import { ClefGlyph, variantToSymbolKey, CLEF_GLYPH_X } from '../clefGlyphs';
import ClefCarousel from './ClefCarousel';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { TICKS_PER_WHOLE } from '../../../constants/timing';

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
const FAMILY_SLOT_W = 36;          // horizontal step between carousel glyphs (Han #5: more space)
const QUARTER = TICKS_PER_WHOLE / 4;
const mkMelody = (entries) => ({
    notes: entries.map(e => e.name),
    offsets: entries.map(e => e.offset),
    durations: entries.map(() => QUARTER),
    ties: entries.map(() => null),
    triplets: null, rhythmicGrouping: null,
});
const PERC_LAYER_PROPS = {
    numAccidentals: 0, noteGroupSize: 1, measureLengthSlots: 9999, scaleNotes: [],
    tonic: '', processedChords: [], inputTestState: null, pixelsPerTick: null,
    startMeasureIndex: 0, transpositionSemitones: 0, debugMode: false, interactive: false,
    courtesyAccidentals: false, percussionVoiceSplit: false, noteColoringMode: 'none',
};

const ClefStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    trebleSettings, bassSettings,
    percussionVoiceSplit = false,
    percussionDisabled = false,
    timeSignature = [4, 4], theme,
    onApplyClefPatch,            // (staff, patch) => void
    onOpenInstrumentList,        // (staff) => void  (full transposing list)
    onToggleVoiceSplit,          // () => void  (percussion together↔split)
    onTogglePercussionDisabled,  // () => void  (percussion clef on↔off)
    debugMode = false,
}) => {
    if (startX == null || endX == null) return null;

    // The family carousel lives in the CLEF GUTTER, fully LEFT of startX (Han
    // 2026-06-01): the current clef sits where the real clef glyph normally is
    // (~x=13) and neighbours peek/scroll to its right up to startX. Variant chips
    // occupy the staff body from startX onward.
    const splitX = startX;

    // One staff block: family carousel (left) + variants (right).
    const staffBlock = (staff, staffStart, clef, settings) => {
        const famId = familyOfClef(clef);
        const order = carouselOrder(famId);            // current first
        const transKey = settings?.transpositionKey || 'C';

        // ── Left: family carousel (a true loop carousel in the clef gutter) ───
        // The CURRENT family sits at the EXACT sheet clef position (CLEF_GLYPH_X) and
        // shows the EXACT clef glyph via ClefGlyph (reused from the sheet, incl.
        // ottava + correct height). ClefCarousel handles the loop animation: picking
        // a glyph slides the strip left and re-enters glyphs from the right under a
        // fade mask (Han 2026-06-01 #5). The current slot shows the concrete current
        // clef; neighbours show their family default.
        const clipId = `clef-gutter-clip-${staff}`;
        const renderFamily = (fam, { isActive }) => {
            const isOff = fam.id === 'off';
            const colr = isActive ? 'var(--accent-yellow)' : 'var(--text-lowlight)';
            const symbolKey = isActive ? variantToSymbolKey(clef) : fam.clef;
            return (
                <>
                    <rect x={-FAMILY_SLOT_W / 2} y={staffStart - 18} width={FAMILY_SLOT_W} height={60}
                        fill="transparent" />
                    {isOff ? (
                        <g stroke={colr} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                            <path d={`M -9 ${staffStart + 11} L 9 ${staffStart + 29}`} />
                            <path d={`M 9 ${staffStart + 11} L -9 ${staffStart + 29}`} />
                        </g>
                    ) : (
                        <ClefGlyph symbolKey={symbolKey} x={0} baseY={staffStart + 30} fill={colr} />
                    )}
                    {debugMode && (
                        <rect x={-FAMILY_SLOT_W / 2} y={staffStart - 18} width={FAMILY_SLOT_W} height={60}
                            fill="orange" fillOpacity={0.18} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </>
            );
        };
        const familyCarousel = (
            <ClefCarousel
                items={order}
                startX={CLEF_GLYPH_X}
                stepX={FAMILY_SLOT_W}
                visible={Math.max(2, Math.floor((startX - CLEF_GLYPH_X) / FAMILY_SLOT_W))}
                renderItem={renderFamily}
                onPick={(fam) => onApplyClefPatch?.(staff, patchForFamily(fam.id))}
                clipId={clipId}
                clipRect={{ x: 0, y: staffStart - 18, width: startX, height: 64 }}
            />
        );

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
                {/* The family carousel (loop animation + fade mask) lives in the
                    gutter; ClefCarousel owns its own clip + right-edge fade. */}
                {familyCarousel}
                <g className="clef-variant-chips">{chipRow}</g>
            </g>
        );
    };

    // Percussion block (Han 2026-06-01 #5):
    //   LEFT  = a 2-item carousel (percussion clef `/` ↔ X disable), in the gutter at
    //           the EXACT same x as the sheet percussion clef (CLEF_GLYPH_X).
    //   RIGHT = the `[[k,c],hh,[s,hh],hh]` ×2 pattern rendered TWICE (together / split)
    //           with the REAL note renderer (MelodyNotesLayer) as a TOGGLER for
    //           percussionVoiceSplit. Together = one voice (no split); split = RH↑/LH↓.
    const percussionBlock = () => {
        const y = percussionStart;
        // The pattern as MelodyNotesLayer entries: chord stacks become arrays.
        const pat = [['k', 'c'], 'hh', ['s', 'hh'], 'hh'];
        const onsets = [...pat, ...pat];
        const entries = onsets.map((stack, i) => ({ name: stack, offset: i + 1 }));
        const allOffsets = Array.from({ length: onsets.length + 1 }, (_, i) => i);

        const bodyX = splitX + CHIP_GAP;
        const bodyW = endX - bodyX;
        const optW = (bodyW - CHIP_GAP) / 2;

        // One option = a real percussion render (so noteheads use the proper assets,
        // not tiny font). `split` toggles percussionVoiceSplit on that layer.
        const option = (key, split, active, ox, onTap) => {
            const color = active ? 'var(--accent-yellow)' : 'var(--range-lowlight)';
            const noteWidth = (optW - 12) / onsets.length;
            return (
                <g key={key} style={{ cursor: onToggleVoiceSplit ? 'pointer' : 'default' }} onClick={onTap}>
                    <rect x={ox} y={y - 4} width={optW} height={46} rx={3}
                        fill="transparent" stroke={color} strokeWidth={active ? 1.6 : 0.8}
                        vectorEffect="non-scaling-stroke" />
                    <g style={{ pointerEvents: 'none' }}>
                        <MelodyNotesLayer
                            {...PERC_LAYER_PROPS}
                            percussionVoiceSplit={split}
                            melody={mkMelody(entries)}
                            staff="percussion"
                            staffYStart={y}
                            clef={null}
                            startX={ox + 8}
                            noteWidth={noteWidth}
                            allOffsets={allOffsets}
                            timeSignature={timeSignature}
                            theme={theme}
                            previewMode={color}
                        />
                    </g>
                    {debugMode && (
                        <rect x={ox} y={y - 4} width={optW} height={46}
                            fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </g>
            );
        };

        // Left clef carousel: 2 items — percussion clef glyph `/` and X (disable).
        const clipId = 'clef-gutter-clip-percussion';
        const renderPercClef = (item, { isActive }) => {
            const colr = isActive ? 'var(--accent-yellow)' : 'var(--text-lowlight)';
            if (item === 'off') {
                return (
                    <g stroke={colr} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                        <path d={`M -9 ${y + 11} L 9 ${y + 29}`} />
                        <path d={`M 9 ${y + 11} L -9 ${y + 29}`} />
                    </g>
                );
            }
            return (
                <text x={0} y={y + 30} fontSize={FAMILY_GLYPH_SIZE} fontFamily="Maestro"
                    textAnchor="middle" fill={colr} style={{ pointerEvents: 'none' }}>
                    {'/'}
                </text>
            );
        };
        // current first: if disabled, 'off' is active; else the clef.
        const percOrder = percussionDisabled ? ['off', 'perc'] : ['perc', 'off'];

        return (
            <g className="clef-row clef-row-percussion" key="percussion">
                <ClefCarousel
                    items={percOrder}
                    startX={CLEF_GLYPH_X}
                    stepX={FAMILY_SLOT_W}
                    visible={2}
                    renderItem={renderPercClef}
                    onPick={() => onTogglePercussionDisabled?.()}
                    clipId={clipId}
                    clipRect={{ x: 0, y: y - 6, width: startX, height: 56 }}
                />
                {/* Right: together / split toggler, only when the staff is enabled. */}
                {!percussionDisabled && option('together', false, !percussionVoiceSplit, bodyX,
                    () => { if (percussionVoiceSplit) onToggleVoiceSplit?.(); })}
                {!percussionDisabled && option('split', true, percussionVoiceSplit, bodyX + optW + CHIP_GAP,
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
