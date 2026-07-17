import React from 'react';
import { NOTE_FONT_SIZE } from '../staffNoteGlyph';
import { melodicNoteColor } from '../../../theory/noteUtils';
import { MiniMelody, MINI_QUARTER as QUARTER, PREVIEW_TONIC, PREVIEW_SCALE } from './MiniMelody';

// ── Inline-note carousel content for the GENERATION setter ────────────────────────────────────────
//
// ROBUST (Han 2026-07-13): every note preview goes through the shared `MiniMelody` primitive (see
// MiniMelody.jsx) — the SAME renderMelodyNotes pipeline the sheet uses. NotePoolGlyph / RhythmMeasure
// Glyph / ComplexityChordGlyph are thin wrappers; no glyph offsets live here (§6c/§6d).

// Shift a note name down one octave (bass-clef example notes render an octave lower — Han: "de
// gerenderde noten moeten een octaaf lager zijn indien bassleutel", C3–C4 for bass vs C4–C5 treble).
const octaveDown = (name) => {
    const m = String(name).match(/^([A-G][♭♯#b]?)(-?\d+)$/);
    return m ? `${m[1]}${parseInt(m[2], 10) - 1}` : name;
};

// ── Note-pool example runs (#295/#431) ────────────────────────────────────────
// Example notes per pool, as a MELODY (notes achter elkaar). Treble/vocal → C4–C5; bass → C3–C4
// (the names shift an octave, then MelodyNotesLayer positions them for the clef, so a clef change
// re-renders correctly). 'chromatic' uses a chromatic ascending run so its accidentals render at
// REAL size.
const POOL_NOTES = {
    root: ['C4', 'C5'],
    chord: ['C4', 'E4', 'G4', 'C5'],
    scale: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    chromatic: ['C4', 'D♭4', 'D4', 'E♭4', 'E4', 'F4', 'F♯4', 'G4', 'A♭4', 'A4', 'B♭4', 'B4', 'C5'],
};
// Horizontal room for the run (Han 2026-07-14: "maak de note pool selector iets breder" — widened
// so the 13-note chromatic run isn't cramped).
const POOL_WIDTH = 150;

/**
 * One note-pool item: the pool's example notes rendered through the real melody pipeline, so they
 * carry the active note-colouring, real accidentals and clef-correct positions.
 */
export const NotePoolGlyph = ({
    pool, staffStart, clef, staffType, noteColoringMode, tonic, scaleNotes, activeChord, theme,
}) => {
    let notes = POOL_NOTES[pool] || POOL_NOTES.scale;
    if (clef === 'bass') notes = notes.map(octaveDown);   // C3–C4 for bass
    return (
        <MiniMelody
            slots={notes}
            durations={notes.map(() => QUARTER)}
            width={POOL_WIDTH}
            staffStart={staffStart}
            clef={clef}
            staff={staffType}
            noteColoringMode={noteColoringMode}
            tonic={tonic}
            scaleNotes={scaleNotes}
            processedChords={activeChord ? [{ absoluteOffset: 0, isSlash: false, chord: activeChord }] : []}
            theme={theme}
        />
    );
};

/**
 * #434 (Han: "percussion pool: breng in lijn met note pool setter — render de noten uit de pool") —
 * the percussion pool option renders the preset's actual DRUM notes (like the melodic note pool
 * renders example notes), through the shared MiniMelody pipeline with staff="percussion" so each pad
 * sits at its real drum position and gets its chromatone colour where the rule applies.
 */
export const PercPoolGlyph = ({ pads, staffStart, noteColoringMode, theme }) => {
    const slots = (pads && pads.length) ? pads : ['k', 's', 'hh'];
    return (
        <MiniMelody
            slots={slots}
            durations={slots.map(() => QUARTER)}
            width={POOL_WIDTH}
            staffStart={staffStart}
            clef="percussion"
            staff="percussion"
            noteColoringMode={noteColoringMode}
            theme={theme}
        />
    );
};

/**
 * #435 (Han 2026-07-17): voices carousel item — the option rendered AS the notation it produces
 * (through the shared MiniMelody pipeline, §6d): 1 = a single head; 2/3 = the stacked chord;
 * 'var' = a single note followed by a two-note chord (the three-melody merge in miniature).
 * Percussion shows pads (staff="percussion"): 1 = snare; var = snare then a kick+hi-hat pair.
 */
export const VoicesGlyph = ({
    voices, staffStart, clef, staffType, noteColoringMode, tonic, scaleNotes, activeChord, theme,
}) => {
    let slots;
    if (staffType === 'percussion') {
        slots = voices === 'var' ? ['s', ['k', 'hh']] : ['s'];
    } else {
        slots = voices === 1 ? [['C4']]
            : voices === 2 ? [['C4', 'E4']]
            : voices === 3 ? [['C4', 'E4', 'G4']]
            : ['C4', ['C4', 'E4']]; // 'var'
        if (clef === 'bass') {
            slots = slots.map(s => Array.isArray(s) ? s.map(octaveDown) : octaveDown(s));
        }
    }
    return (
        <MiniMelody
            slots={slots}
            durations={slots.map(() => QUARTER)}
            width={slots.length > 1 ? 44 : 0}
            staffStart={staffStart}
            clef={staffType === 'percussion' ? 'percussion' : clef}
            staff={staffType}
            noteColoringMode={noteColoringMode}
            tonic={tonic}
            scaleNotes={scaleNotes}
            processedChords={activeChord ? [{ absoluteOffset: 0, isSlash: false, chord: activeChord }] : []}
            theme={theme}
        />
    );
};

// ── Notes-per-measure rhythm patterns (#295) ──────────────────────────────────
//
// Han's spec, DERIVED not tabulated (§6c): start from the measure's beats
// (4 × quarter in 4/4). For n below the beat count, merge beats into halves /
// a whole; above it, split beats into 8th pairs (inner beats first — his
// examples put the first pair on beat 2), then split 8ths into 16th pairs the
// same way. Works for any n 1..16 and generalises to other measure lengths.
export function rhythmPatternDurations(n, measureTicks = 48) {
    const BEAT = 12;
    const beats = measureTicks / BEAT;
    if (n <= 0) return [];
    if (n === 1) return [measureTicks];
    if (n < beats) {
        const quarters = 2 * n - beats;
        if (quarters >= 0) {
            return [...Array(quarters).fill(BEAT), ...Array(beats - n).fill(BEAT * 2)];
        }
        return [measureTicks];
    }
    // ≥ beats: split beats into 8th pairs, inner-first (beat order 2,3,4 then 1).
    const slots = Array.from({ length: beats }, () => [BEAT]);
    const splitOrder = [...Array.from({ length: beats - 1 }, (_, i) => i + 1), 0];
    let extra = n - beats;
    for (const b of splitOrder) {
        if (extra <= 0) break;
        slots[b] = [6, 6];
        extra--;
    }
    if (extra > 0) {
        // Still more notes: split 8ths into 16th pairs, same inner-first beat order.
        outer:
        for (const b of splitOrder) {
            for (let k = 0; k < slots[b].length; k++) {
                if (slots[b][k] === 6) {
                    slots[b].splice(k, 1, 3, 3);
                    k++; // skip the first of the new pair
                    if (--extra <= 0) break outer;
                }
            }
        }
    }
    return slots.flat();
}

// One measure's pattern width (Han 2026-07-14: "maak de selector iets breder" — widened from 96).
const PATTERN_W = 124;

/**
 * #362/#431: notes-per-measure rendered "volgens bestaande protocol renderMelodyNotes" — a REAL
 * mini-measure through the shared pipeline, so eighths beam per beat-group and the [2,2] groups get
 * the sheet's horizontal separation (Han: the "spatie" between groups). Every note sits on the
 * middle line (B4); the count/rhythm is what matters, so a single preview colour is used.
 */
export const RhythmMeasureGlyph = ({ n, staffStart, color = 'var(--text-primary)' }) => {
    const durations = rhythmPatternDurations(n);
    if (!durations.length) return null;
    return (
        <MiniMelody
            slots={durations.map(() => 'B4')}
            durations={durations}
            width={PATTERN_W}
            staffStart={staffStart}
            groupSpacing
            previewColor={color}
        />
    );
};

// ── Chord-complexity → the REAL chord it stands for (one stacked chord slot) ───
// Most are C-rooted; 'exotic' (labelled alt/ext, #431) is Han's altered/extended voicing. The chord
// is ONE melody slot = an array of note names, so renderMelodyNotes draws it with the proper single
// shared stem + real accidentals + note colours (Han: "volg de renditie-regels van gewone akkoorden"
// / "waarom zijn de noten niet gekleurd?").
const COMPLEXITY_NOTES = {
    root: ['C4'],
    power: ['C4', 'G4'],
    triad: ['C4', 'E4', 'G4'],
    seventh: ['C4', 'E4', 'G4', 'B4'],
    sus: ['C4', 'F4', 'G4'],
    // #431 rework (Han 2026-07-14): alt/ext = C4, D♯4, E4, F4, G4, A4, B♭4, C5.
    exotic: ['C4', 'D♯4', 'E4', 'F4', 'G4', 'A4', 'B♭4', 'C5'],
};

/**
 * #362/#431: chord-complexity item = the REAL chord rendered without a staff, via the shared
 * pipeline (one slot = the chord array). The chords row floats on the chord-label band (no staff),
 * so the chord anchors on a VIRTUAL staff around the row centre. Coloured by the active rule (the
 * 'chords' mode uses the representative chord passed via activeChord).
 */
export const ComplexityChordGlyph = ({ complexity, centerY, noteColoringMode, tonic, scaleNotes, activeChord, theme }) => {
    const notes = COMPLEXITY_NOTES[complexity] || COMPLEXITY_NOTES.triad;
    // #431 rework (Han 2026-07-17): the stack is anchored 8px HIGHER (was centerY−26) so its lowest
    // head (C4 ledger) clears the shared +28 value-label line — this lets the chords-row labels sit at
    // the SAME offset as every other row instead of being pushed down to clear the stack.
    const virtualStaffStart = centerY - 34;
    return (
        <MiniMelody
            slots={[notes]}                 // a SINGLE slot containing the whole chord
            durations={[QUARTER]}
            width={0}                       // one column → the chord sits on the origin
            staffStart={virtualStaffStart}
            noteColoringMode={noteColoringMode}
            tonic={tonic}
            scaleNotes={scaleNotes}
            processedChords={activeChord ? [{ absoluteOffset: 0, isSlash: false, chord: activeChord }] : []}
            theme={theme}
        />
    );
};

// ── Chords-per-measure literal labels (#431, Han) ─────────────────────────────
// Han's EXACT illustrative labels by chord count (confirmed literal in the interview, NOT derived
// from the actual progression): C (≤1) · C G (1<n≤2) · C F G (2<n≤3) · C F G C (=4). A FRACTIONAL
// count lowlights the last (partial) chord — e.g. 2.5 → C F (G) with G dimmed.
const CHORD_LABEL_SEQ = { 1: ['C'], 2: ['C', 'G'], 3: ['C', 'F', 'G'], 4: ['C', 'F', 'G', 'C'] };

// count → [{ label, dim }]. `dim` marks the trailing partial chord of a fractional count.
export const chordLabelsFor = (n) => {
    const count = n <= 1 ? 1 : Math.min(4, Math.ceil(n));
    const seq = CHORD_LABEL_SEQ[count] || CHORD_LABEL_SEQ[1];
    const full = n <= 1 ? 1 : Math.floor(n);   // how many chords are "full" (bright)
    return seq.map((label, i) => ({ label, dim: i >= full }));
};

// Match the sheet's chord ROOT label EXACTLY (Han: "waarom een andere grootte en lettertype dan
// akkoorden in gewone melodie?") — serif, fontSize 26, weight normal (ChordLabelsLayer.rootFontSize).
const CHORD_LABEL_FONT_SIZE = 26;
// Han 2026-07-14: "voeg spatie toe tussen de akkoorden" — wider gap between the chord letters.
const CHORD_LABEL_SPACING = 26;

/**
 * #431 (Han): the chords/measure item renders literal chord LABELS in the SAME serif font/size the
 * sheet uses for chord roots (§6d). The trailing partial chord of a fractional count is lowlit, and
 * each chord letter is COLOURED by the active note-coloring rule (Han 2026-07-14: "de letters worden
 * niet gekleurd, ik verwacht van wel") — the letter's root pitch class through melodicNoteColor.
 */
export const ChordCountGlyph = ({
    count, centerY, noteColoringMode, tonic = PREVIEW_TONIC, scaleNotes = PREVIEW_SCALE,
    activeChord = null, theme, color = 'var(--text-primary)',
}) => {
    const labels = chordLabelsFor(count);
    const x0 = -((labels.length - 1) * CHORD_LABEL_SPACING) / 2;
    const letterColor = (letter) =>
        melodicNoteColor(`${letter}4`, { noteColoringMode, tonic, scaleNotes, theme, activeChord })
        || color;
    return (
        <g style={{ pointerEvents: 'none' }}>
            {labels.map((c, i) => (
                // #434 rework (Han: "maak niet-geheel akkoord iets kleiner, maar wel de gewone kleur")
                // — the trailing partial chord of a fractional count is drawn SMALLER but in its
                // NORMAL colour (not lowlit).
                <text key={i} x={x0 + i * CHORD_LABEL_SPACING} y={centerY} textAnchor="middle"
                    fontFamily="serif" fontSize={c.dim ? CHORD_LABEL_FONT_SIZE * 0.7 : CHORD_LABEL_FONT_SIZE}
                    fontWeight="normal" fill={letterColor(c.label)}>
                    {c.label}
                </text>
            ))}
        </g>
    );
};

/**
 * Chord-progression item content: the progression label as ROMAN NUMERALS
 * (Han: "render de akkoorden in romeinse cijfers"). Serif, roomy — the numeral
 * IS the icon; the regular text label below is omitted by the caller.
 */
export const RomanProgressionGlyph = ({ label, y, color = 'var(--text-primary)', active = false }) => (
    <text x={0} y={y} textAnchor="middle" fontSize={13} fontFamily="serif"
        fontWeight={active ? 'bold' : 'normal'} fill={color}
        style={{ pointerEvents: 'none' }}>
        {label}
    </text>
);

// Font-size reference so this module never drifts from the canonical note size.
export const GENERATION_GLYPH_NOTE_FONT = NOTE_FONT_SIZE;
