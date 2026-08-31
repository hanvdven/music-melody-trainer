import React from 'react';
import {
    VOCAL_VARIANTS, clefFamilyKey, CLEF_FAMILIES,
    patchForFamily, patchForVocal, patchForTransposition,
} from './clefSelector';
import { TRANSPOSING_INSTRUMENTS, getTranspositionSemitones } from '../../../constants/transposingInstruments';
import TranspositionSetter from './TranspositionSetter';
import { ClefGlyph, variantToSymbolKey, CLEF_GLYPH_X } from '../clefGlyphs';
import NonLinearCarousel from './NonLinearCarousel';
import { CarouselField } from '../CarouselFieldItem';
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

// FAMILY_GLYPH_SIZE + FAMILY_RIGHT_FRAC (removed #529 Slice B) and FAMILY_SLOT_W (removed #530 UAT —
// the clef family picker is now a CarouselField, not a raw gutter NonLinearCarousel) were all part of
// the old always-visible clef/percussion carousels.
const EIGHTH = TICKS_PER_WHOLE / 8;
const PERC_LAYER_PROPS = {
    numAccidentals: 0, noteGroupSize: 1, measureLengthSlots: 9999, scaleNotes: [],
    tonic: '', processedChords: [], inputTestState: null, pixelsPerTick: null,
    startMeasureIndex: 0, transpositionSemitones: 0, debugMode: false, interactive: false,
    courtesyAccidentals: false, percussionVoiceSplit: false, colorScheme: 'none', colorScope: 'all',
};

// The 3-note reference melody drawn after each clickable clef so the transposition /
// clef reads instantly (Han #14). The notes are tonic + 5th scale degree + octave,
// responsive to the tonic setter (see refTriadNotes above), octave-placed per card.
const Q = TICKS_PER_WHOLE / 4;
const REF_LAYER_PROPS = {
    numAccidentals: 0, scaleNotes: [], tonic: '', processedChords: [], inputTestState: null,
    pixelsPerTick: null, startMeasureIndex: 0, debugMode: false, interactive: false,
    courtesyAccidentals: false, percussionVoiceSplit: false, colorScheme: 'none', colorScope: 'all',
    noteGroupSize: TICKS_PER_WHOLE, measureLengthSlots: TICKS_PER_WHOLE,
};

// ClefCard — one instrument-clef option: the family clef on the LEFT, then the 3
// reference notes TRANSPOSED by the instrument (so the transposition is visible), and
// a small "(B♭ inst.)" superscript for transposing instruments. The notes are the
// REAL renderer (MelodyNotesLayer) — §6c, never hand-drawn noteheads.
const ClefCard = ({ symbolKey, clef, notes, trans, inst, x, staffStart, cardW, color, theme,
    active, colorScheme, colorScope, tonic, scaleNotes, showNotes = true }) => {
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
        ? { previewMode: false, colorScheme, colorScope, tonic, scaleNotes }
        : { previewMode: color, colorScheme: 'none', colorScope: 'all', tonic: '', scaleNotes: [] };
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

// ── Shared notation-carousel spacing (§59, Han 2026-07-29 UAT) ────────────────────────────────────
// The chord-notation, percussion AND clef carousels all use the SAME header/label offsets so their
// header → content → value-label rhythm is identical (Han: "spacing … inconsistent tussen chord
// notation en percussion"). Header sits at rowCenterY−31 (= staffStart−11, §59); the caps value label
// at +38 (the generation setter's CONTENT_LABEL_DY).
export const NOTATION_HEADER_DY = -31;
export const NOTATION_LABEL_DY = 38;

// ── #530: clef-FAMILY picker = the SAME shared CarouselField as every other setter ────────────────
// Han 2026-07-29 UAT: the clef picker must be IDENTICAL to the other carousels (fonts, alignment,
// header-above-active, veil) — the ONLY difference is that it sits GUTTER-anchored so the active clef
// lands at the sheet-clef position and the left edge clips. So it is now a thin wrapper around
// `CarouselField`, centred near the gutter (`CLEF_CENTER_X`); `CarouselField`'s own reveal + localized
// veil (§60) + §59 header do everything. Families are already exactly 4 (CLEF_FAMILIES); the concrete
// active clef / family-default glyphs come from the canonical `ClefGlyph` (§6d) via `renderClef`.
// staffX0=0 because the sheet staff lines run from x=0, so the veil redraws them through the gutter.
const CLEF_CENTER_X = CLEF_GLYPH_X + 14;   // active clef centres ≈ the sheet-clef position; left clips
const CLEF_BASE = 46;
const FamilyClefCarousel = ({
    items, activeIndex, onSelectFamily, renderClef, staffStart, endX,
    fieldId, activeFieldId, onActivate, debugMode,
}) => (
    <CarouselField
        items={items}
        activeIndex={activeIndex}
        onSelect={onSelectFamily}
        centerX={CLEF_CENTER_X}
        rowCenterY={staffStart + 20}
        baseWidth={CLEF_BASE}
        hitTop={-30}
        hitHeight={66}
        iconSize={0}
        iconDy={0}
        labelDy={NOTATION_LABEL_DY}
        labelFontSize={11}
        bracketDy={NOTATION_HEADER_DY}
        headerDy={NOTATION_HEADER_DY}
        labelAbove="clef"
        renderContent={renderClef}
        staffLineYs={[-20, -10, 0, 10, 20].map(d => staffStart + 20 + d)}
        staffX0={0}
        staffX1={endX}
        visibleHalf={2}
        fieldId={fieldId}
        activeFieldId={activeFieldId}
        onActivate={onActivate}
        hidden
        debugMode={debugMode}
    />
);

const ClefStaffOverlay = ({
    startX, endX,
    trebleStart, bassStart, percussionStart,
    isTrebleVisible, isBassVisible, isPercussionVisible,
    clefTreble, clefBass,
    trebleSettings, bassSettings,
    tonic, scaleNotes,           // current key — reference notes are tonic+5th+octave
    colorScheme, colorScope,     // selected card colours its notes per this scheme (A3)
    activeChord = null,          // paused active chord (last-if-tonic-else-first) for chord colour
    isNarrow = false,            // narrow screens: only the selected card shows notes (A7)
    percussionVoiceSplit = false,
    percussionDisabled = false,
    percussionMelodic = false,   // #661 ("melodische percussie"): fixed pitched timpani pattern
    theme,
    onApplyClefPatch,            // (staff, patch) => void
    onToggleVoiceSplit,          // () => void  (percussion together↔split)
    onTogglePercussionDisabled,  // () => void  (percussion clef on↔off)
    onToggleMelodicPercussion,   // () => void  (percussion drum-notation↔melodic/timpani)
    debugMode = false,
}) => {
    // #529 Slice B: single-open coordination for the hidden percussion-notation carousel. Local for
    // now (the melodic family carousels are always-visible NonLinearCarousels, not hidden fields);
    // lifted to coordinate with the clef carousels when #530 converts those too. Declared BEFORE the
    // early return so the hook order is stable (rules-of-hooks).
    const [activeFieldId, setActiveFieldId] = React.useState(null);

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
        // renderContent for the clef CarouselField (signature (item, active, color)): draw the
        // canonical ClefGlyph — the ACTIVE slot shows the concrete current clef, neighbours their
        // family default (Han BUG-N5) — or the shared DisableCross for OFF. anchor="middle" so the
        // glyph, its value label and the header all centre on centerX, identical to the other
        // carousels; CarouselField's makeRenderItem renders the ITALIAN family label below.
        const renderClef = (item, active, color) => {
            if (item.value === 'off') {
                return <DisableCross x={-9} topY={staffStart + 2} color={color} />;
            }
            const symbolKey = active ? variantToSymbolKey(clef) : item.clef;
            return <ClefGlyph symbolKey={symbolKey} x={0} baseY={staffStart + 30} fill={color} anchor="middle" />;
        };
        const familyItems = CLEF_FAMILIES.map((fam) => ({
            value: fam.id, label: ITALIAN_FAMILY[fam.id] ?? fam.label, clef: fam.clef,
        }));
        const familyActiveIndex = Math.max(0, CLEF_FAMILIES.findIndex((f) => f.id === famId));
        const familyCarousel = (
            <FamilyClefCarousel
                items={familyItems}
                activeIndex={familyActiveIndex}
                onSelectFamily={(item) => { if (item.value !== famId) onApplyClefPatch?.(staff, patchForFamily(item.value)); }}
                renderClef={renderClef}
                staffStart={staffStart}
                endX={endX}
                fieldId={`clef-${staff}`}
                activeFieldId={activeFieldId}
                onActivate={setActiveFieldId}
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
                // + "=" / "concert C₄ =" labels do the delayed fade (collectFadeEls). (#530: the old
                // whole-row family-switch re-fly was removed — the hidden clef carousel's own collapse
                // fade covers the transition now.)
                <g key={`clefvar-${famId}`} className="clef-variant-cards">
                    <TranspositionSetter
                        staff={staff} clef={clef} staffStart={staffStart}
                        startX={startX} endX={endX}
                        transSemitones={totalTrans}
                        colorScheme={colorScheme} colorScope={colorScope} tonic={tonic}
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

        // MELODIC (Han 2026-08-02, "melodische percussie"): a taste of the fixed timpani pattern
        // (utils/timpaniPattern.js — C2, C2, C3, rest per measure) as PITCHED noteheads, first 2
        // quarters shown (this preview bundle is a compact 2-quarter/24-tick window, matching the
        // together/split previews' own PERC_TS — not the full 4-beat pattern).
        const melodicMel = proc({
            notes: ['C2', 'C2'], durations: [QUARTER, QUARTER],
            offsets: [0, QUARTER], displayNotes: ['C2', 'C2'],
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

        // #529 Slice B (Han 2026-07-25: "doe hetzelfde voor percussie … [X/||] + [samen/gesplitst]
        // -> een carousel [samen/gesplitst/X]"): the old LEFT clef-picker carousel (perc `/` ↔ X) and
        // the RIGHT together/split hit boxes MERGE into ONE hidden CarouselField with three options —
        // together / split / off. The drum-pattern renders are reused verbatim (§6c — the sheet's real
        // MelodyNotesLayer), now authored around the carousel item's LOCAL x-origin (the wrapper
        // translates each option into place); `off` is the shared DisableCross.
        const renderDrumBundle = (layers, active) => {
            const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
            const ox = -(slots / 2) * NOTE_W;   // bundle symmetric about the item's local origin (0)
            return (
                <g style={{ pointerEvents: 'none' }}>
                    {/* Stage I (Han 2026-06-09): the ACTIVE option colours its percussion heads through
                        the real colour mode (chromatone) like the live staff; the inactive option stays
                        a flat lowlight via previewMode. */}
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
                            colorScheme={active ? colorScheme : 'none'} colorScope={active ? colorScope : 'all'}
                            previewMode={active ? false : color}
                        />
                    ))}
                </g>
            );
        };

        // The four merged options (Han order: samen / gesplitst / melodisch / X). Labels (Han
        // 2026-07-26: "INVISIBLE / JOINED / SPLIT"; 2026-08-02 adds "MELODIC") show ALL-CAPS below the
        // bundle.
        const PERC_ITEMS = [
            { value: 'together', label: 'joined', layers: [{ melody: togetherMel, split: false }] },
            { value: 'split', label: 'split', layers: [{ melody: hhMel, split: true }, { melody: ksMel, split: true }] },
            { value: 'melodic', label: 'melodic' },
            { value: 'off', label: 'invisible' },
        ];
        const percActiveIndex = percussionDisabled ? 3 : percussionMelodic ? 2 : (percussionVoiceSplit ? 1 : 0);

        // renderContent draws each option around the item's local origin (0). `off` = the shared
        // DisableCross centred on the staff; `melodic` = the pitched timpani preview; the two drum
        // pattern options = the real drum renders.
        const renderMelodicBundle = (active) => {
            const color = active ? 'var(--text-primary)' : 'var(--text-lowlight)';
            const ox = -(slots / 2) * NOTE_W;
            return (
                <g style={{ pointerEvents: 'none' }}>
                    <MelodyNotesLayer
                        {...PERC_LAYER_PROPS}
                        noteGroupSize={BUNDLE_TICKS}
                        measureLengthSlots={BUNDLE_TICKS}
                        melody={melodicMel}
                        staff="bass"
                        staffYStart={y}
                        clef="bass"
                        startX={ox}
                        noteWidth={NOTE_W}
                        allOffsets={allOffsets}
                        timeSignature={PERC_TS}
                        theme={theme}
                        colorScheme={active ? colorScheme : 'none'} colorScope={active ? colorScope : 'all'}
                        previewMode={active ? false : color}
                    />
                </g>
            );
        };
        const renderPercContent = (item, active, color) => {
            if (item.value === 'off') return <DisableCross x={-9} topY={y + 2} color={color} />;
            if (item.value === 'melodic') return renderMelodicBundle(active);
            return renderDrumBundle(item.layers, active);
        };

        // Committing an option may flip TWO/THREE pieces of state at once (enable/disable + split +
        // melodic). React 18 batches the setters, so the round lands in one render. 'off' only disables;
        // 'melodic' ensures enabled + sets the melodic flag (mutually exclusive with split — a drum
        // together/split option turns melodic back off).
        const selectPerc = (item) => {
            const v = item.value;
            if (v === 'off') {
                if (!percussionDisabled) onTogglePercussionDisabled?.();
                return;
            }
            if (percussionDisabled) onTogglePercussionDisabled?.();
            if (v === 'melodic') {
                if (!percussionMelodic) onToggleMelodicPercussion?.();
                return;
            }
            if (percussionMelodic) onToggleMelodicPercussion?.();
            const wantSplit = v === 'split';
            if (percussionVoiceSplit !== wantSplit) onToggleVoiceSplit?.();
        };

        // Carousel stride: wide enough that the ~15%-of-span drum bundle + a gap fits per option, so
        // the three don't overlap when the field is revealed. visibleHalf=1 → all three show open.
        const PERC_BASE = Math.max(150, slots * NOTE_W + 48);
        const rowCenterY = y + 20;   // percussion 5-line staff centre (lines at y..y+40)

        return (
            <g className="clef-row clef-row-percussion" key="percussion">
                <CarouselField
                    items={PERC_ITEMS}
                    activeIndex={percActiveIndex}
                    onSelect={selectPerc}
                    centerX={(startX + endX) / 2}
                    rowCenterY={rowCenterY}
                    baseWidth={PERC_BASE}
                    // Hit/veil must cover the tall drum bundle: the split hi-hat beam rides ≈ y−28
                    // (rowCenterY−48) and the together stems hang ≈ y+50 (rowCenterY+30).
                    hitTop={-50}
                    hitHeight={84}
                    iconSize={0}
                    iconDy={0}
                    // #530 UAT: header/label offsets shared with the chord-notation + clef carousels
                    // (NOTATION_HEADER_DY / NOTATION_LABEL_DY) so the header→content→label rhythm is
                    // consistent across the notation carousels. The label at +38 still clears the drum
                    // stems (which hang to ≈ rowCenterY+30).
                    labelDy={NOTATION_LABEL_DY}
                    labelFontSize={11}
                    bracketDy={NOTATION_HEADER_DY}
                    headerDy={NOTATION_HEADER_DY}
                    labelAbove="percussion"
                    renderContent={renderPercContent}
                    // Percussion 5-line staff → redraw its lines through the veil (§60).
                    staffLineYs={[-20, -10, 0, 10, 20].map(d => rowCenterY + d)}
                    staffX0={startX}
                    staffX1={endX}
                    visibleHalf={1}
                    fieldId="percussion-notation"
                    activeFieldId={activeFieldId}
                    onActivate={setActiveFieldId}
                    hidden
                    debugMode={debugMode}
                />
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
