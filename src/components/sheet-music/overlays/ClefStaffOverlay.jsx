import React from 'react';
import {
    VOCAL_VARIANTS, OCTAVE_VARIANTS, familyOfClef, carouselOrder,
    patchForFamily, patchForOctave, patchForVocal, patchForTransposition, transpositionChips,
} from './clefSelector';
import { ClefGlyph, variantToSymbolKey, CLEF_GLYPH_X } from '../clefGlyphs';
import ClefCarousel from './ClefCarousel';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { processMelodyAndCalculateSlots } from '../processMelodyAndCalculateSlots';
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

const FAMILY_GLYPH_SIZE = 36;      // clefs at ~true staff size (Han 2026-06-01)
const FAMILY_SLOT_W = 36;          // horizontal step between carousel glyphs (Han #5: more space)
const EIGHTH = TICKS_PER_WHOLE / 8;
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
                        // Disable cross: 2× taller than wide so it spans the staff
                        // (Han #8). Width ±9, height ±18 around the staff centre (y+20).
                        <g stroke={colr} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                            <path d={`M -9 ${staffStart + 2} L 9 ${staffStart + 38}`} />
                            <path d={`M 9 ${staffStart + 2} L -9 ${staffStart + 38}`} />
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
            // Each voice as its REAL clef glyph at true size (Han #8). Bass & Baritone
            // share the F-clef but are distinct voices, matched on rangeMode.
            VOCAL_VARIANTS.forEach(v => chips.push({
                key: `voc-${v.rangeMode}`, symbolKey: v.clef,
                active: rangeMode === v.rangeMode,
                onTap: () => onApplyClefPatch?.(staff, patchForVocal(v)),
            }));
        } else {
            // Octave variants as full ottava CLEFS at true size (via ClefGlyph).
            (OCTAVE_VARIANTS[famId] || []).forEach(o => chips.push({
                key: `oct-${o.id}`, symbolKey: variantToSymbolKey(o.id),
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

        // Variant clefs render at TRUE size (no small boxes), distributed evenly
        // across the staff body [startX … endX] (Han #8). Each is a real ClefGlyph
        // (octave variants) / clef glyph (vocal voices) with a wide invisible hit box.
        const VAR_X0 = splitX + 18;
        const VAR_X1 = endX - 10;
        const varStep = chips.length > 1 ? (VAR_X1 - VAR_X0) / (chips.length - 1) : 0;
        const chipRow = chips.map((c, i) => {
            const cx = chips.length > 1 ? VAR_X0 + i * varStep : (VAR_X0 + VAR_X1) / 2;
            const color = c.active ? 'var(--accent-yellow)' : 'var(--text-primary)';
            return (
                <g key={c.key} data-fly=""
                    style={{ cursor: onApplyClefPatch ? 'pointer' : 'default' }}
                    onClick={c.onTap}>
                    {/* wide invisible hit box around the true-size glyph */}
                    <rect x={cx - 16} y={staffStart - 14} width={32} height={56} fill="transparent" />
                    {c.symbolKey ? (
                        <ClefGlyph symbolKey={c.symbolKey} x={cx} baseY={staffStart + 30} fill={color} />
                    ) : c.glyph ? (
                        <text x={cx} y={staffStart + 30} fontSize={FAMILY_GLYPH_SIZE}
                            fontFamily="Maestro" textAnchor="middle" fill={color}
                            style={{ pointerEvents: 'none' }}>
                            {c.glyph}
                        </text>
                    ) : (
                        <text x={cx} y={staffStart + 24} fontSize={13}
                            fontFamily="Georgia, serif" textAnchor="middle" fill={color}
                            style={{ pointerEvents: 'none' }}>
                            {c.label}
                        </text>
                    )}
                    {debugMode && (
                        <rect x={cx - 16} y={staffStart - 14} width={32} height={56}
                            fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
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
        // Pattern: [[k,hh], hh, [s,hh], hh] — 4 EIGHTH notes (Han #8/#10). Build it as
        // a real tick-based melody and run it through processMelodyAndCalculateSlots,
        // exactly like the sheet does, so MelodyNotesLayer BEAMS the 4 eighths into one
        // group (the previous noteGroupSize:1/measureLengthSlots:9999 path gave each
        // note its own flag — §6c: reuse the real pipeline, don't re-invent).
        const pat = [['k', 'hh'], 'hh', ['s', 'hh'], 'hh'];
        const rawMelody = {
            notes: pat,
            durations: pat.map(() => EIGHTH),
            offsets: pat.map((_, i) => i * EIGHTH),   // tick positions: 0,6,12,18
            displayNotes: pat,
        };
        // One beat = the whole 4-eighth bundle (so all 4 beam together); measure =
        // the same span. processMelodyAndCalculateSlots assigns slots; the renderer
        // beams within noteGroupSize.
        const BUNDLE_TICKS = pat.length * EIGHTH;       // 24
        const procMelody = processMelodyAndCalculateSlots(rawMelody, timeSignature, BUNDLE_TICKS, BUNDLE_TICKS);
        const procOffsets = procMelody.offsets || [];
        const allOffsets = [...procOffsets, (procOffsets[procOffsets.length - 1] ?? 0) + 1];

        // Two compact bundles centred at ~33% and ~66% of [startX … endX] (Han #8).
        const span = endX - startX;
        const NOTE_W = 10;                     // tight eighth spacing → small group
        const bundleW = pat.length * NOTE_W;
        const centers = [startX + span * 0.33, startX + span * 0.66];

        // One option = a real percussion render (proper notehead assets + beaming);
        // `split` toggles percussionVoiceSplit on that layer.
        const option = (key, split, active, cx, onTap) => {
            const color = active ? 'var(--accent-yellow)' : 'var(--range-lowlight)';
            const ox = cx - bundleW / 2;
            return (
                <g key={key} style={{ cursor: onToggleVoiceSplit ? 'pointer' : 'default' }} onClick={onTap}>
                    <rect x={ox - 6} y={y - 6} width={bundleW + 12} height={48} rx={3}
                        fill="transparent" stroke={color} strokeWidth={active ? 1.6 : 0.8}
                        vectorEffect="non-scaling-stroke" />
                    <g style={{ pointerEvents: 'none' }}>
                        <MelodyNotesLayer
                            {...PERC_LAYER_PROPS}
                            noteGroupSize={BUNDLE_TICKS}
                            measureLengthSlots={BUNDLE_TICKS}
                            percussionVoiceSplit={split}
                            melody={procMelody}
                            staff="percussion"
                            staffYStart={y}
                            clef={null}
                            startX={ox}
                            noteWidth={NOTE_W}
                            allOffsets={allOffsets}
                            timeSignature={timeSignature}
                            theme={theme}
                            previewMode={color}
                        />
                    </g>
                    {debugMode && (
                        <rect x={ox - 6} y={y - 6} width={bundleW + 12} height={48}
                            fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </g>
            );
        };

        // Left clef carousel: 2 items — percussion clef glyph `/` and X (disable).
        // Each glyph has a transparent hit rect so it's clickable (Han #8 — the perc
        // clefs weren't clickable because the bare <text> had pointerEvents:none).
        const clipId = 'clef-gutter-clip-percussion';
        const renderPercClef = (item, { isActive }) => {
            const colr = isActive ? 'var(--accent-yellow)' : 'var(--text-lowlight)';
            return (
                <>
                    <rect x={-FAMILY_SLOT_W / 2} y={y - 6} width={FAMILY_SLOT_W} height={52} fill="transparent" />
                    {item === 'off' ? (
                        <g stroke={colr} strokeWidth={2.4} strokeLinecap="round" style={{ pointerEvents: 'none' }}>
                            <path d={`M -9 ${y + 2} L 9 ${y + 38}`} />
                            <path d={`M 9 ${y + 2} L -9 ${y + 38}`} />
                        </g>
                    ) : (
                        // The sheet percussion clef is drawn at x=18 — match it so the
                        // carousel's active clef aligns exactly with the sheet (Han #8).
                        <text x={0} y={y + 30} fontSize={FAMILY_GLYPH_SIZE} fontFamily="Maestro"
                            textAnchor="middle" fill={colr} style={{ pointerEvents: 'none' }}>
                            {'/'}
                        </text>
                    )}
                </>
            );
        };
        // Sheet percussion clef sits at x=18 (not CLEF_GLYPH_X=13); align the carousel.
        const PERC_CLEF_X = 18;
        // current first: if disabled, 'off' is active; else the clef.
        const percOrder = percussionDisabled ? ['off', 'perc'] : ['perc', 'off'];

        return (
            <g className="clef-row clef-row-percussion" key="percussion">
                <ClefCarousel
                    items={percOrder}
                    startX={PERC_CLEF_X}
                    stepX={FAMILY_SLOT_W}
                    visible={2}
                    renderItem={renderPercClef}
                    onPick={() => onTogglePercussionDisabled?.()}
                    clipId={clipId}
                    clipRect={{ x: 0, y: y - 6, width: startX, height: 56 }}
                />
                {/* Right: together / split toggler bundles at ~33% / ~66%, enabled only. */}
                {!percussionDisabled && option('together', false, !percussionVoiceSplit, centers[0],
                    () => { if (percussionVoiceSplit) onToggleVoiceSplit?.(); })}
                {!percussionDisabled && option('split', true, percussionVoiceSplit, centers[1],
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
