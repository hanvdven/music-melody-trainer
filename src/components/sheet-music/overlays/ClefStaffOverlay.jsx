import React from 'react';
import {
    VOCAL_VARIANTS, OCTAVE_VARIANTS, familyOfClef, carouselOrder,
    patchForFamily, patchForOctave, patchForVocal, patchForTransposition,
} from './clefSelector';
import { TRANSPOSING_INSTRUMENTS } from '../../../constants/transposingInstruments';
import ClefCardCarousel from './ClefCardCarousel';
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
 * Writes go through the optional `onApplyClefPatch` callback so a static render
 * (smoke test) is possible. Pure presentation; all option logic is in clefSelector.js
 * (§6c — no hardcoded tables here).
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

// The 3-note reference melody drawn after each clickable clef so the transposition /
// clef reads instantly (Han #14): C4 G4 C5 in the G family, C3 G3 C4 in the F family.
const Q = TICKS_PER_WHOLE / 4;
const REF_NOTES = { g: ['C4', 'G4', 'C5'], f: ['C3', 'G3', 'C4'] };
const REF_LAYER_PROPS = {
    numAccidentals: 0, scaleNotes: [], tonic: '', processedChords: [], inputTestState: null,
    pixelsPerTick: null, startMeasureIndex: 0, debugMode: false, interactive: false,
    courtesyAccidentals: false, percussionVoiceSplit: false, noteColoringMode: 'none',
    noteGroupSize: TICKS_PER_WHOLE, measureLengthSlots: TICKS_PER_WHOLE,
};

// ClefCard — one instrument-clef option: the family clef on the LEFT, then the 3
// reference notes TRANSPOSED by the instrument (so the transposition is visible), and
// a small "(B♭ inst.)" superscript for transposing instruments. The notes are the
// REAL renderer (MelodyNotesLayer) — §6c, never hand-drawn noteheads.
const ClefCard = ({ symbolKey, clef, notes, trans, inst, x, staffStart, cardW, color, theme }) => {
    const noteW = Math.max(12, (cardW || 60) * 0.14);
    const refMelody = {
        notes, offsets: [0, Q, 2 * Q], durations: [Q, Q, Q],
        displayNotes: notes, ties: [null, null, null], triplets: null, rhythmicGrouping: null,
    };
    // Leading sentinel (−1) so the first note lands at the layer's startX (getTickX
    // uses indexOf − 1), trailing marker closes the row.
    const allOffsets = [-1, 0, Q, 2 * Q, 2 * Q + 1];
    return (
        <g style={{ pointerEvents: 'none' }}>
            <ClefGlyph symbolKey={symbolKey} x={x} baseY={staffStart + 30} fill={color} anchor="start" />
            {inst && (
                // Match the REAL staff's transposition label exactly (SheetMusic.jsx
                // staff group): fontSize 12, plain serif, NOT italic — so the setter
                // reads identically to the sheet (Han 2026-06-03, consistency).
                <text x={x} y={staffStart - 8} fontSize={12}
                    fontFamily="serif" fill={color} textAnchor="start">
                    {`(${inst}.)`}
                </text>
            )}
            <MelodyNotesLayer
                {...REF_LAYER_PROPS}
                melody={refMelody}
                staff="treble"
                clef={clef}
                staffYStart={staffStart}
                startX={x + 22}
                noteWidth={noteW}
                allOffsets={allOffsets}
                timeSignature={[3, 4]}
                transpositionSemitones={trans}
                theme={theme}
                previewMode={color}
            />
        </g>
    );
};

const ClefStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    trebleSettings, bassSettings,
    percussionVoiceSplit = false,
    percussionDisabled = false,
    theme,
    onApplyClefPatch,            // (staff, patch) => void
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
            // Active = NORMAL sheet colour (NOT yellow); passive = lowlight but solid
            // (opacity 1) so it reads as greyed, not faded (Han #14).
            const colr = isActive ? 'var(--text-primary)' : 'var(--text-lowlight)';
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
                        <ClefGlyph symbolKey={symbolKey} x={0} baseY={staffStart + 30} fill={colr} anchor="middle" />
                    )}
                    {debugMode && (
                        <rect x={-FAMILY_SLOT_W / 2} y={staffStart - 18} width={FAMILY_SLOT_W} height={60}
                            fill="orange" fillOpacity={0.18} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </>
            );
        };
        // Spread the N family glyphs evenly across the clef gutter: leftmost at the
        // sheet clef position (CLEF_GLYPH_X — so the ACTIVE clef sits exactly where the
        // sheet draws it, visual continuity) and rightmost at 90% of startX (a right
        // margin so it isn't squeezed against the staff). Han #14.
        const famN = order.length;
        const FAM_X1 = startX * 0.90;
        const famStepX = famN > 1 ? (FAM_X1 - CLEF_GLYPH_X) / (famN - 1) : 0;
        const familyCarousel = (
            <ClefCarousel
                items={order}
                startX={CLEF_GLYPH_X}
                stepX={famStepX}
                visible={famN}
                renderItem={renderFamily}
                onPick={(fam) => onApplyClefPatch?.(staff, patchForFamily(fam.id))}
                clipId={clipId}
                clipRect={{ x: 0, y: staffStart - 18, width: startX, height: 64 }}
            />
        );

        // ── Right: variant cards / chips ──────────────────────────────────────
        // 'off' (disabled staff) has no variants.
        const rangeMode = settings?.rangeMode;
        const baseClef = famId === 'g' ? 'treble' : 'bass';
        const refNotes = REF_NOTES[famId];          // 3-note reference melody (G/F only)
        const VAR_X0 = splitX + 20;
        const VAR_X1 = endX - 10;
        const viewWidth = VAR_X1 - VAR_X0;

        let variantContent = null;
        if (famId === 'vocal') {
            // Vocal voices: each as its REAL clef glyph (Han #8), evenly spread (a small
            // fixed set — no swipe needed). Bass & Baritone share the F-clef glyph but
            // are distinct voices, matched on rangeMode.
            const chips = VOCAL_VARIANTS.map(v => ({
                key: `voc-${v.rangeMode}`, symbolKey: v.clef,
                active: rangeMode === v.rangeMode,
                onTap: () => onApplyClefPatch?.(staff, patchForVocal(v)),
            }));
            const step = chips.length > 1 ? viewWidth / (chips.length - 1) : 0;
            variantContent = (
                <g className="clef-variant-chips">
                    {chips.map((c, i) => {
                        const cx = chips.length > 1 ? VAR_X0 + i * step : VAR_X0 + viewWidth / 2;
                        // Active = accent yellow (matches the sheet's settings highlight);
                        // non-selected = the darker setter-lowlight grey (Han 2026-06-03).
                        const color = c.active ? 'var(--accent-yellow)' : 'var(--setter-lowlight)';
                        return (
                            <g key={c.key} data-fly="" data-fly-from={startX}
                                style={{ cursor: onApplyClefPatch ? 'pointer' : 'default' }}
                                onClick={c.onTap}>
                                <rect x={cx - 16} y={staffStart - 14} width={32} height={56} fill="transparent" />
                                <ClefGlyph symbolKey={c.symbolKey} x={cx} baseY={staffStart + 30} fill={color} anchor="middle" />
                                {debugMode && (
                                    <rect x={cx - 16} y={staffStart - 14} width={32} height={56}
                                        fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                                        style={{ pointerEvents: 'none' }} />
                                )}
                            </g>
                        );
                    })}
                </g>
            );
        } else if (famId !== 'off') {
            // Melodic G/F: a SWIPEABLE strip of clef CARDS (Han 2026-06-02). Order:
            // octave cards (normal · 8va · 15ma — set rangeMode only) then ALL
            // transposing instruments except concert C (set transpositionKey only).
            // Octave and transposition stay ORTHOGONAL fields (clefSelector invariant),
            // so up to two cards can read active at once. Cards beyond the window sit
            // off-screen and slide in on drag. §6c: octave list + instruments come from
            // OCTAVE_VARIANTS / TRANSPOSING_INSTRUMENTS, not a table here.
            const octaveActive = (o) => o.default
                ? (rangeMode !== 'relative' && rangeMode !== 'relative_15a' && rangeMode !== 'relative_low')
                : rangeMode === o.rangeMode;
            const cards = [];
            (OCTAVE_VARIANTS[famId] || []).forEach(o => cards.push({
                key: `oct-${o.id}`, symbolKey: variantToSymbolKey(o.id), trans: 0, inst: null,
                active: octaveActive(o),
                onTap: () => { const p = patchForOctave(famId, o.id); if (p) onApplyClefPatch?.(staff, p); },
            }));
            // Concert C is the default; a transposing card tapped while ALREADY active
            // toggles back to C — that is the only way to reset transposition from the
            // strip (there is no dedicated C card, per Han's order).
            TRANSPOSING_INSTRUMENTS.filter(i => i.key !== 'C').forEach(i => cards.push({
                key: `tr-${i.key}`, symbolKey: baseClef, trans: i.semitones, inst: i.display,
                active: transKey === i.key,
                onTap: () => onApplyClefPatch?.(staff, patchForTransposition(transKey === i.key ? 'C' : i.key)),
            }));

            const CARD_W = 92;
            const renderCard = (card, slotX) => {
                // Active = accent yellow; non-selected = darker setter-lowlight (Han 2026-06-03).
                const color = card.active ? 'var(--accent-yellow)' : 'var(--setter-lowlight)';
                return (
                    <g>
                        <ClefCard symbolKey={card.symbolKey} clef={baseClef} notes={refNotes}
                            trans={card.trans} inst={card.inst} x={slotX} staffStart={staffStart}
                            cardW={CARD_W} color={color} theme={theme} />
                        {/* Debug: per-card tap region (§3a) — taps route to the card whose
                            [slotX … slotX+CARD_W] slot the pointer lands in. */}
                        {debugMode && (
                            <rect x={slotX - 4} y={staffStart - 24} width={CARD_W} height={74}
                                fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                                style={{ pointerEvents: 'none' }} />
                        )}
                    </g>
                );
            };
            variantContent = (
                // data-fly on the OUTER group so the enter-morph flies the whole strip in
                // from the clef; the carousel's INNER strip owns the drag transform (no
                // conflict: morph uses style.transform on this <g>, drag uses the SVG
                // transform attr on the inner strip).
                <g className="clef-variant-cards" data-fly="" data-fly-from={startX}>
                    <ClefCardCarousel cards={cards} x0={VAR_X0} y={staffStart - 24}
                        viewWidth={viewWidth} height={74} cardW={CARD_W}
                        clipId={`clefcards-${staff}`} renderCard={renderCard} />
                </g>
            );
        }

        return (
            <g className={`clef-row clef-row-${staff}`} key={staff}>
                {/* The family carousel (loop animation + fade mask) lives in the
                    gutter; ClefCarousel owns its own clip + right-edge fade. */}
                {familyCarousel}
                {variantContent}
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
        const span = endX - startX;

        // The two options are real percussion renders via MelodyNotesLayer (§6c —
        // reuse the sheet's renderer, never re-invent). We give each a [1,2]
        // (odd-numerator) measure so the beam-span logic produces ONE beam over the
        // 4 eighths instead of splitting them 2+2 (Han #13).
        const PERC_TS = [1, 2];                  // one half note = 24 ticks
        const BUNDLE_TICKS = 4 * EIGHTH;         // 24
        const QUARTER = 2 * EIGHTH;              // 12
        const proc = (raw) => processMelodyAndCalculateSlots(raw, PERC_TS, BUNDLE_TICKS, BUNDLE_TICKS);

        // TOGETHER = a single voice: the full pattern [[k,hh], hh, [s,hh], hh] as 4
        // eighth-note chords, beamed as one group.
        const togetherPat = [['k', 'hh'], 'hh', ['s', 'hh'], 'hh'];
        const togetherMel = proc({
            notes: togetherPat, durations: togetherPat.map(() => EIGHTH),
            offsets: togetherPat.map((_, i) => i * EIGHTH), displayNotes: togetherPat,
        });

        // SPLIT = real parallel-voice drum notation (Han #14): the hi-hats are 4
        // beamed eighths (RH, stems UP) and the kick+snare are QUARTER notes (LH,
        // stems DOWN) — kick on beat 1, snare on beat 2. Two voices = two melodies
        // run through the SAME renderer with percussionVoiceSplit on (so the single-
        // note RH/LH classifier forces the correct stem direction per voice).
        const hhMel = proc({
            notes: ['hh', 'hh', 'hh', 'hh'], durations: [EIGHTH, EIGHTH, EIGHTH, EIGHTH],
            offsets: [0, EIGHTH, 2 * EIGHTH, 3 * EIGHTH], displayNotes: ['hh', 'hh', 'hh', 'hh'],
        });
        const ksMel = proc({
            notes: ['k', 's'], durations: [QUARTER, QUARTER],
            offsets: [0, QUARTER], displayNotes: ['k', 's'],
        });

        // Shared x-grid for ALL voices so split RH/LH align vertically: the union of
        // every voice's processed offsets, sorted. A leading sentinel (< all offsets)
        // makes the FIRST note land exactly at the layer's startX — getTickX uses
        // (indexOf − 1), so without it the bundle was shoved one slot LEFT (the
        // "not centered" bug, Han #14).
        const gridOffsets = Array.from(new Set([
            ...togetherMel.offsets, ...hhMel.offsets, ...ksMel.offsets,
        ])).sort((a, b) => a - b);
        const lastOff = gridOffsets[gridOffsets.length - 1] ?? 0;
        const allOffsets = [-1, ...gridOffsets, lastOff + 1];
        const slots = Math.max(1, gridOffsets.length - 1);   // gaps between notes
        const NOTE_W = (span * 0.15) / slots;                // bundle ≈ 15% of the width

        // One option, CENTRED on cx: the first note sits at cx − (slots/2)·NOTE_W so the
        // whole bundle is symmetric about cx. `layers` = one or more voices (split = 2).
        const renderOption = (key, cx, active, layers, onTap) => {
            const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
            const ox = cx - (slots / 2) * NOTE_W;
            const hitX = ox - 10, hitW = slots * NOTE_W + 20;
            return (
                <g key={key} style={{ cursor: onToggleVoiceSplit ? 'pointer' : 'default' }} onClick={onTap}>
                    {/* invisible hit target — no visible box around the notes (Han #14) */}
                    <rect x={hitX} y={y - 6} width={hitW} height={48} fill="transparent" />
                    <g style={{ pointerEvents: 'none' }}>
                        {layers.map((L, i) => (
                            <MelodyNotesLayer key={i}
                                {...PERC_LAYER_PROPS}
                                noteGroupSize={BUNDLE_TICKS}
                                measureLengthSlots={BUNDLE_TICKS}
                                percussionVoiceSplit={L.split}
                                melody={L.melody}
                                staff="percussion"
                                staffYStart={y}
                                clef={null}
                                startX={ox}
                                noteWidth={NOTE_W}
                                allOffsets={allOffsets}
                                timeSignature={PERC_TS}
                                theme={theme}
                                previewMode={color}
                            />
                        ))}
                    </g>
                    {debugMode && (
                        <rect x={hitX} y={y - 6} width={hitW} height={48}
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
            const colr = isActive ? 'var(--text-primary)' : 'var(--text-lowlight)';
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
        // Sheet percussion clef sits at x=18 (not CLEF_GLYPH_X=13); align the leftmost
        // (active) glyph there and spread to 90% of startX, same as the melodic
        // families (Han #14 — 2 glyphs evenly spread, no resting lookahead).
        const PERC_CLEF_X = 18;
        // current first: if disabled, 'off' is active; else the clef.
        const percOrder = percussionDisabled ? ['off', 'perc'] : ['perc', 'off'];
        const percStepX = (startX * 0.90) - PERC_CLEF_X;   // 2 items → one step

        return (
            <g className="clef-row clef-row-percussion" key="percussion">
                <ClefCarousel
                    items={percOrder}
                    startX={PERC_CLEF_X}
                    stepX={percStepX}
                    visible={2}
                    renderItem={renderPercClef}
                    onPick={() => onTogglePercussionDisabled?.()}
                    clipId={clipId}
                    clipRect={{ x: 0, y: y - 6, width: startX, height: 56 }}
                />
                {/* Right: together / split toggler bundles CENTRED at 30% / 70% of the
                    staff body, enabled only. Together = one voice; split = RH hi-hats
                    (beamed, up) + LH kick/snare (quarters, down). */}
                {!percussionDisabled && renderOption('together', startX + span * 0.30, !percussionVoiceSplit,
                    [{ melody: togetherMel, split: false }],
                    () => { if (percussionVoiceSplit) onToggleVoiceSplit?.(); })}
                {!percussionDisabled && renderOption('split', startX + span * 0.70, percussionVoiceSplit,
                    [{ melody: hhMel, split: true }, { melody: ksMel, split: true }],
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

export default ClefStaffOverlay;
