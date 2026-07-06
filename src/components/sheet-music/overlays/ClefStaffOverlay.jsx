import React from 'react';
import {
    VOCAL_VARIANTS, clefFamilyKey, carouselOrder,
    patchForFamily, patchForVocal, patchForTransposition,
} from './clefSelector';
import { TRANSPOSING_INSTRUMENTS, getTranspositionSemitones } from '../../../constants/transposingInstruments';
import TranspositionSetter from './TranspositionSetter';
import { ClefGlyph, variantToSymbolKey, CLEF_GLYPH_X } from '../clefGlyphs';
import NonLinearCarousel from './NonLinearCarousel';
import DisableCross from './DisableCross';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { processMelodyAndCalculateSlots } from '../processMelodyAndCalculateSlots';
import { TICKS_PER_WHOLE } from '../../../constants/timing';
import { getNoteValue, getNoteFromValue } from '../../../utils/rangeUtils';
import { getNoteSemitone, stripOctave } from '../../../theory/noteUtils';

// transposition-offset (semitones) → instrument key, for the TranspositionSetter. Built
// from TRANSPOSING_INSTRUMENTS (§6c — no hardcoded table). Offsets without a key (e.g. −1,
// +12) clamp to the NEAREST available offset so a tap always lands on a real instrument.
const TRANS_BY_SEMI = new Map(TRANSPOSING_INSTRUMENTS.map(i => [i.semitones, i.key]));
const TRANS_SEMIS = [...TRANS_BY_SEMI.keys()].sort((a, b) => a - b);
const keyForTrans = (t) => {
    if (TRANS_BY_SEMI.has(t)) return TRANS_BY_SEMI.get(t);
    const nearest = TRANS_SEMIS.reduce(
        (best, s) => (Math.abs(s - t) < Math.abs(best - t) ? s : best), TRANS_SEMIS[0]);
    return TRANS_BY_SEMI.get(nearest);
};

// Decompose a total written-pitch offset (semitones, up to ±2 octaves) into an instrument key
// (pitch-class part, in [−5,11] where the keys live) + a whole-octave part (Han 2026-06-09,
// Stage D). The optimal-clef logic then picks an 8va/15ma/8vb/15vb clef for the octave part so
// far heads return near the staff. total = getTranspositionSemitones(key) + 12*octave.
const decomposeTrans = (total) => {
    let octave = 0;
    let r = total;
    while (r > 11) { r -= 12; octave += 1; }
    while (r < -5) { r += 12; octave -= 1; }
    return { key: keyForTrans(r), octave };
};

// refTriadNotes — the [tonic, 5th-degree, octave] reference notes for a clef card
// (Han 2026-06-03, supersedes fixed C-G-C). RESPONSIVE to the tonic setter and the
// current scale's 5th DEGREE (not a fixed perfect fifth — Han's choice). The note
// NAMES carry the scale's ♯/♭ spelling so they render as NOTE-LEVEL accidentals
// (no key signature; the card uses numAccidentals:0). The octave is chosen so the
// triad centres in [lo,hi] (MIDI) — fewest semitones spilling past either end, then
// nearest the centre — giving minimal ledger lines (§6c: derived, no note table).
//   tonicName/fifthName: pitch-class spellings (no octave) for display.
//   tonicSemi/fifthSemi: their pitch classes (0–11) for octave maths.
const refTriadNotes = (tonicName, tonicSemi, fifthName, fifthSemi, lo, hi) => {
    const centre = (lo + hi) / 2;
    // Interval (semitones) from the tonic UP to the 5th degree, within one octave.
    const fifthInterval = (((fifthSemi - tonicSemi) % 12) + 12) % 12;
    let best = null;
    // Candidate tonic MIDI values = the tonic pitch class in each octave.
    for (let o = 0; o <= 9; o++) {
        const root = tonicSemi + 12 * o;
        if (root < 12 || root > 119) continue;
        const top = root + 12;
        const spill = Math.max(0, lo - root) + Math.max(0, top - hi);
        const offCentre = Math.abs((root + top) / 2 - centre);
        if (!best || spill < best.spill || (spill === best.spill && offCentre < best.offCentre)) {
            best = { root, spill, offCentre };
        }
    }
    const octDigit = (v) => Math.floor(v / 12) - 1;   // scientific-pitch octave number
    const root = best.root;
    return [
        `${tonicName}${octDigit(root)}`,
        `${fifthName}${octDigit(root + fifthInterval)}`,
        `${tonicName}${octDigit(root + 12)}`,
    ];
};

// Resolve the tonic pitch-class spelling + the scale's 5th-degree spelling from the
// current key. Falls back to a perfect fifth (sharp spelling) when the scale isn't
// available (e.g. chromatic / unset) so the card still renders something sensible.
const tonicAndFifth = (tonic, scaleNotes) => {
    const tonicName = stripOctave(tonic) || 'C';
    const tonicSemi = getNoteSemitone(tonicName);
    if (scaleNotes && scaleNotes.length >= 5) {
        const fifthName = stripOctave(scaleNotes[4]);
        return { tonicName, tonicSemi, fifthName, fifthSemi: getNoteSemitone(fifthName) };
    }
    const fifthSemi = (tonicSemi + 7) % 12;
    return { tonicName, tonicSemi, fifthName: stripOctave(getNoteFromValue(60 + fifthSemi)), fifthSemi };
};

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

// #262 rework (Han 2026-07-02): every clef carousel item carries its ITALIAN
// name as an ALL-CAPS label (standing carousel-caps CR).
const ITALIAN_FAMILY = { g: 'VIOLINO', f: 'BASSO', vocal: 'VOCE', off: 'OFF' };
const ITALIAN_VOICE = {
    Bass: 'BASSO', Baritone: 'BARITONO', Tenor: 'TENORE',
    Alto: 'CONTRALTO', 'Mezzo-soprano': 'MEZZOSOPRANO', Soprano: 'SOPRANO',
};
const CLEF_LABEL_DY = 56;          // Italian label baseline below the staff body
const CLEF_LABEL_SIZE = 7;

const FAMILY_GLYPH_SIZE = 36;      // clefs at ~true staff size (Han 2026-06-01)
const FAMILY_SLOT_W = 36;          // horizontal step between carousel glyphs (Han #5: more space)
// Family clefs cluster a bit tighter so the rightmost sits just OUTSIDE the 95% fader
// zone (Han #9, 2026-06-03). Shared so the percussion 'off' cross can align to a slot.
const FAMILY_RIGHT_FRAC = 0.80;
const EIGHTH = TICKS_PER_WHOLE / 8;
const PERC_LAYER_PROPS = {
    numAccidentals: 0, noteGroupSize: 1, measureLengthSlots: 9999, scaleNotes: [],
    tonic: '', processedChords: [], inputTestState: null, pixelsPerTick: null,
    startMeasureIndex: 0, transpositionSemitones: 0, debugMode: false, interactive: false,
    courtesyAccidentals: false, percussionVoiceSplit: false, noteColoringMode: 'none',
};

// The 3-note reference melody drawn after each clickable clef so the transposition /
// clef reads instantly (Han #14). The notes are tonic + 5th scale degree + octave,
// responsive to the tonic setter (see refTriadNotes above), octave-placed per card.
const Q = TICKS_PER_WHOLE / 4;
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
const ClefCard = ({ symbolKey, clef, notes, trans, inst, x, staffStart, cardW, color, theme,
    active, noteColoringMode, tonic, scaleNotes, showNotes = true }) => {
    // Note spacing tuned to Han's nudges (2026-06-03): first note +8 right, third −8 left
    // vs the doubled-width render → a tighter, centred triad. Fixed (not cardW-scaled) so
    // the nudge is predictable.
    const noteW = 26;
    const CLEF_X = x + CLEF_GLYPH_X;
    // First note +8 further right than before (x+48 → x+56) per Han's nudge.
    const NOTES_X = x + 56;
    // SELECTED card: notes follow the real note-colour scheme (tonic/scale/chromatone),
    // exactly like the sheet (Han A3, 2026-06-03) — so previewMode is OFF and the real
    // colouring props flow in. NON-selected: flat lowlight so the card reads as greyed.
    const noteColourProps = active
        ? { previewMode: false, noteColoringMode, tonic, scaleNotes }
        : { previewMode: color, noteColoringMode: 'none', tonic: '', scaleNotes: [] };
    const refMelody = {
        notes, offsets: [0, Q, 2 * Q], durations: [Q, Q, Q],
        displayNotes: notes, ties: [null, null, null], triplets: null, rhythmicGrouping: null,
    };
    // Leading sentinel (−1) so the first note lands at the layer's startX (getTickX
    // uses indexOf − 1), trailing marker closes the row.
    const allOffsets = [-1, 0, Q, 2 * Q, 2 * Q + 1];
    return (
        <g style={{ pointerEvents: 'none' }}>
            <ClefGlyph symbolKey={symbolKey} x={CLEF_X} baseY={staffStart + 30} fill={color} anchor="start" />
            {inst && (
                // Match the REAL staff's transposition label EXACTLY (SheetMusic.jsx staff
                // group: x = accidentalStartX − 10 ≈ clef + 25, y = −8, fontSize 12, plain
                // serif, NOT italic). So setter and sheet read identically (Han 2026-06-03).
                <text x={CLEF_X + 25} y={staffStart - 8} fontSize={12}
                    fontFamily="serif" fill={color} textAnchor="start">
                    {`(${inst}.)`}
                </text>
            )}
            {/* showNotes=false (narrow screens, non-selected cards) → clef only, to make
                room for more clefs (Han A7, 2026-06-03). */}
            {showNotes && (
                <MelodyNotesLayer
                    {...REF_LAYER_PROPS}
                    {...noteColourProps}
                    melody={refMelody}
                    staff="treble"
                    clef={clef}
                    staffYStart={staffStart}
                    startX={NOTES_X}
                    noteWidth={noteW}
                    allOffsets={allOffsets}
                    timeSignature={[3, 4]}
                    transpositionSemitones={trans}
                    theme={theme}
                />
            )}
        </g>
    );
};

const ClefStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    trebleSettings, bassSettings,
    tonic, scaleNotes,           // current key — reference notes are tonic+5th+octave
    noteColoringMode,            // selected card colours its notes per this scheme (A3)
    activeChord = null,          // paused active chord (last-if-tonic-else-first) for chord colour
    isNarrow = false,            // narrow screens: only the selected card shows notes (A7)
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

    // Reference notes for every card = tonic + 5th scale degree + octave, in the
    // current key (Han 2026-06-03). Computed once; octave-placed per card below.
    const { tonicName, tonicSemi, fifthName, fifthSemi } = tonicAndFifth(tonic, scaleNotes);

    // One staff block: family carousel (left) + variants (right).
    const staffBlock = (staff, staffStart, clef, settings) => {
        // Family the LEFT carousel shows must be rangeMode-aware so a VOCAL voice that
        // notates in the F-clef (vocal Bass/Baritone) reads as the 'vocal' family, not
        // 'f'. Using familyOfClef(clef) here made selecting a vocal sub-clef wrongly
        // activate the Bass family (Han BUG-N8, 2026-06-08); clefFamilyKey inspects the
        // rangeMode, familyOfClef only sees the concrete clef glyph.
        const famId = clefFamilyKey(settings);
        const order = carouselOrder(famId);            // current first
        const transKey = settings?.transpositionKey || 'C';
        // Total written-pitch offset = instrument pitch-class part + whole-octave part (Stage D).
        const transOctave = settings?.transpositionOctave || 0;
        const totalTrans = getTranspositionSemitones(transKey) + 12 * transOctave;

        // ── Left: family carousel (in the clef gutter) ────────────────────────
        // The CURRENT family sits at the EXACT sheet clef position (CLEF_GLYPH_X) and
        // shows the EXACT clef glyph via ClefGlyph (reused from the sheet, incl.
        // ottava + correct height). The current slot shows the concrete current
        // clef; neighbours show their family default.
        // #262 rework (Han 2026-07-02): the family picker is now the SHARED
        // NonLinearCarousel (drag / scale / settle — consistent with every other
        // horizontal carousel), with ONE exception kept as-is: the ACTIVE clef
        // sits at the EXACT sheet clef position (item origin = CLEF_GLYPH_X,
        // glyph anchor='start' — pixel-identical to the real staff clef).
        // Neighbours left of the centre fall off-canvas (the gutter has no room
        // there) and fade in while dragging — the wheel wraps, so every family
        // stays reachable in either direction. Each glyph carries its ITALIAN
        // name below (standing caps CR). Interaction + §3a hit box come from
        // NonLinearCarousel itself.
        const renderFamily = (fam, isActive) => {
            const isOff = fam.id === 'off';
            const colr = isActive ? 'var(--text-primary)' : 'var(--text-lowlight)';
            // The ACTIVE slot shows the current clef's concrete variant glyph ONLY when
            // it really is the current family (fam.id === famId) — a neighbour keeps its
            // OWN family glyph (Han BUG-N5).
            const symbolKey = (isActive && fam.id === famId) ? variantToSymbolKey(clef) : fam.clef;
            return (
                <g style={{ pointerEvents: 'none' }}>
                    {isOff ? (
                        // Shared DisableCross so it matches the percussion + chord OFF
                        // crosses (V1); START-aligned like the clef glyphs (Han #8).
                        <DisableCross x={0} topY={staffStart + 2} color={colr} />
                    ) : (
                        <ClefGlyph symbolKey={symbolKey} x={0} baseY={staffStart + 30} fill={colr} anchor="start" />
                    )}
                    <text x={9} y={staffStart + CLEF_LABEL_DY} textAnchor="middle"
                        fontSize={CLEF_LABEL_SIZE} fontFamily="sans-serif" letterSpacing={0.5}
                        fontWeight={isActive ? 'bold' : 'normal'} fill={colr}>
                        {ITALIAN_FAMILY[fam.id] ?? fam.label.toUpperCase()}
                    </text>
                </g>
            );
        };
        const familyCarousel = (
            <NonLinearCarousel
                items={order}
                activeIndex={0}
                renderItem={(fam, i) => renderFamily(fam, i === 0)}
                centerX={CLEF_GLYPH_X}
                y={staffStart - 18}
                baseWidth={FAMILY_SLOT_W}
                height={62}
                visibleHalf={2}
                onSelect={(fam) => { if (fam.id !== famId) onApplyClefPatch?.(staff, patchForFamily(fam.id)); }}
                debugMode={debugMode}
            />
        );

        // ── Right: variant cards / chips ──────────────────────────────────────
        // 'off' (disabled staff) has no variants.
        const rangeMode = settings?.rangeMode;
        // Distribute the variant clefs across 12%→86% of the staff body [startX…endX]
        // (Han 2026-06-03): the 12% left inset clears the family clef-setter in the
        // Variant carousel window spans 5%→95% of the staff body [startX…endX]; the edge
        // fades each take 10% of that width (0–10% and 90–100%) — Han 2026-06-03.
        const W = endX - startX;
        const VAR_X0 = startX + 0.05 * W;
        const VAR_X1 = startX + 0.95 * W;
        const viewWidth = VAR_X1 - VAR_X0;

        let variantContent = null;
        if (famId === 'vocal') {
            // #262 rework (Han 2026-07-02): "Zet de zangsleutels ook in een
            // horizontale carousel — net als de colours." The six voices are a
            // NonLinearCarousel wheel of their REAL clef glyphs (C-clefs on their
            // lines, F-clefs) with the ITALIAN voice name below each (caps CR).
            // Drag/scale/settle come from the shared primitive; §3a box included.
            const activeVoiceIdx = Math.max(0, VOCAL_VARIANTS.findIndex(v => v.rangeMode === rangeMode));
            const renderVoice = (v, isActive) => {
                const colr = isActive ? 'var(--text-primary)' : 'var(--text-lowlight)';
                return (
                    <g style={{ pointerEvents: 'none' }}>
                        <ClefGlyph symbolKey={variantToSymbolKey(v.clef)} x={0}
                            baseY={staffStart + 30} fill={colr} anchor="middle" />
                        <text x={0} y={staffStart + CLEF_LABEL_DY} textAnchor="middle"
                            fontSize={CLEF_LABEL_SIZE} fontFamily="sans-serif" letterSpacing={0.5}
                            fontWeight={isActive ? 'bold' : 'normal'} fill={colr}>
                            {ITALIAN_VOICE[v.rangeMode] ?? v.label.toUpperCase()}
                        </text>
                    </g>
                );
            };
            variantContent = (
                <g key={`clefvar-${famId}`} className="clef-variant-cards clef-variant-enter"
                    data-fly="" data-fly-from={startX}>
                    <NonLinearCarousel
                        items={VOCAL_VARIANTS}
                        activeIndex={activeVoiceIdx}
                        renderItem={(v, i) => renderVoice(v, i === activeVoiceIdx)}
                        centerX={(VAR_X0 + VAR_X1) / 2}
                        y={staffStart - 24}
                        baseWidth={64}
                        height={74}
                        visibleHalf={2}
                        onSelect={(v) => onApplyClefPatch?.(staff, patchForVocal(v))}
                        debugMode={debugMode}
                    />
                </g>
            );
        } else if (famId !== 'off') {
            // Melodic G/F: the TranspositionSetter (Han 2026-06-08) — two coupled half-step
            // carousels (LEFT concert note names, RIGHT diagonal noteheads) replacing the old
            // swipe-strip of clef cards. The setter expresses "concert C4 is WRITTEN as the
            // chosen note"; a tap reports the new offset, which we map back to an instrument
            // key (keyForTrans, §6c — derived from TRANSPOSING_INSTRUMENTS, no table here).
            variantContent = (
                // Plain container (Han 2026-06-16): NOT a single data-fly block and NO
                // clef-variant-enter CSS — those made the whole setter slide-from-left/fade as one
                // unit (the "old logic"), which conflicted with the per-element cascade. Now the
                // setter's OWN tagged children animate: carousels + heads slide (data-fly), presets
                // + "=" / "concert C₄ =" labels do the delayed fade (collectFadeEls). Family-switch
                // entrance is covered by useClefRefly re-flying the clef row.
                <g key={`clefvar-${famId}`} className="clef-variant-cards">
                    <TranspositionSetter
                        staff={staff} clef={clef} staffStart={staffStart}
                        startX={startX} endX={endX}
                        transSemitones={totalTrans}
                        noteColoringMode={noteColoringMode} tonic={tonic}
                        scaleNotes={scaleNotes} theme={theme} activeChord={activeChord}
                        onSelectTrans={(t) => {
                            const { key, octave } = decomposeTrans(t);
                            onApplyClefPatch?.(staff, patchForTransposition(key, octave));
                        }}
                        debugMode={debugMode} />
                </g>
            );
        }

        return (
            <g className={`clef-row clef-row-${staff}`} key={staff}>
                {/* The family carousel (shared NonLinearCarousel, #262) lives in the
                    gutter; its edge mask fades the wrap-around neighbours. */}
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
            // Taller + a touch wider hit target so the percussion together/split toggles
            // aren't fiddly (Han 2026-06-03 "percussion clickzone too small").
            const hitX = ox - 16, hitW = slots * NOTE_W + 32;
            // Cover the FULL note bundle (Han BUG-N3, 2026-06-08): the split voice's
            // hi-hat beam rides above the staff (≈ y−28) and the together voice's
            // stems+beam hang below it (≈ y+50); the old y−18…y+44 box clipped both
            // ends, so the clickzone didn't match the visible note height.
            const HIT_Y = y - 30, HIT_H = 84;
            return (
                <g key={key} style={{ cursor: onToggleVoiceSplit ? 'pointer' : 'default' }} onClick={onTap}>
                    {/* invisible hit target — no visible box around the notes (Han #14) */}
                    <rect x={hitX} y={HIT_Y} width={hitW} height={HIT_H} fill="transparent" />
                    {/* Debug mode: visualise the actual hit region (§3a) */}
                    {debugMode && (
                        <rect x={hitX} y={HIT_Y} width={hitW} height={HIT_H}
                            fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
                            style={{ pointerEvents: 'none' }} />
                    )}
                    <g style={{ pointerEvents: 'none' }}>
                        {/* Stage I (Han 2026-06-09): the ACTIVE option colours its percussion heads
                            through the real colour mode (chromatone) like the live staff; the
                            inactive option stays a flat lowlight via previewMode. */}
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
                                noteColoringMode={active ? noteColoringMode : 'none'}
                                previewMode={active ? false : color}
                            />
                        ))}
                    </g>
                    {debugMode && (
                        <rect x={hitX} y={HIT_Y} width={hitW} height={HIT_H}
                            fill="orange" fillOpacity={0.12} stroke="orange" strokeWidth={0.5}
                            style={{ pointerEvents: 'none' }} />
                    )}
                </g>
            );
        };

        // Left clef picker (#262 rework): the SHARED NonLinearCarousel — the
        // ACTIVE item sits at the sheet percussion clef position (PERC_CLEF_X,
        // Han #8 alignment kept as-is); 'off' shows the shared DisableCross at
        // the −5 offset so it lands on the same absolute span as the melodic
        // staff crosses (BUG-N1). Italian label below (caps CR).
        const PERC_CLEF_X = 18;
        const percOrder = percussionDisabled ? ['off', 'perc'] : ['perc', 'off'];
        const renderPercClef = (item, isActive) => {
            const colr = isActive ? 'var(--text-primary)' : 'var(--text-lowlight)';
            const CROSS_DX = CLEF_GLYPH_X - PERC_CLEF_X;   // −5 (BUG-N1 alignment)
            return (
                <g style={{ pointerEvents: 'none' }}>
                    {item === 'off' ? (
                        <DisableCross x={CROSS_DX} topY={y + 2} color={colr} />
                    ) : (
                        <text x={0} y={y + 30} fontSize={FAMILY_GLYPH_SIZE} fontFamily="Maestro"
                            textAnchor="middle" fill={colr}>{'/'}</text>
                    )}
                    <text x={0} y={y + CLEF_LABEL_DY} textAnchor="middle"
                        fontSize={CLEF_LABEL_SIZE} fontFamily="sans-serif" letterSpacing={0.5}
                        fontWeight={isActive ? 'bold' : 'normal'} fill={colr}>
                        {item === 'off' ? 'OFF' : 'PERCUSSIONE'}
                    </text>
                </g>
            );
        };

        return (
            <g className="clef-row clef-row-percussion" key="percussion">
                <NonLinearCarousel
                    items={percOrder}
                    activeIndex={0}
                    renderItem={(item, i) => renderPercClef(item, i === 0)}
                    centerX={PERC_CLEF_X}
                    y={y - 18}
                    baseWidth={FAMILY_SLOT_W}
                    height={62}
                    visibleHalf={1}
                    onSelect={(item, i) => { if (i !== 0) onTogglePercussionDisabled?.(); }}
                    debugMode={debugMode}
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
