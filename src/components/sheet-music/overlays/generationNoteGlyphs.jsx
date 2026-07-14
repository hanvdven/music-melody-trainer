import React from 'react';
import { NOTE_FONT_SIZE } from '../staffNoteGlyph';
import { MiniMelody, MINI_QUARTER as QUARTER } from './MiniMelody';

// ── Inline-note carousel content for the GENERATION setter ────────────────────────────────────────
//
// ROBUST (Han 2026-07-13): every note preview goes through the shared `MiniMelody` primitive (see
// MiniMelody.jsx) — the SAME renderMelodyNotes pipeline the sheet uses. NotePoolGlyph / RhythmMeasure
// Glyph / ComplexityChordGlyph are thin wrappers; no glyph offsets live here (§6c/§6d).

// ── Note-pool example runs (#295/#431) ────────────────────────────────────────
// Example notes per pool, as a MELODY (notes achter elkaar — Han: "zet de noten achter elkaar ipv
// boven elkaar"). The NAMES stay C-based regardless of clef; MelodyNotesLayer positions them for the
// active clef, so switching bass↔treble repositions the notes (Han's clef-change bug — no manual
// octave maths). 'chromatic' uses a chromatic ascending run so its accidentals render at REAL size.
const POOL_NOTES = {
    root: ['C4', 'C5'],
    chord: ['C4', 'E4', 'G4', 'C5'],
    scale: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    chromatic: ['C4', 'D♭4', 'D4', 'E♭4', 'E4', 'F4', 'F♯4', 'G4', 'A♭4', 'A4', 'B♭4', 'B4', 'C5'],
};
const POOL_WIDTH = 100;   // horizontal room for the run; more notes → tighter (root ends up widest)

/**
 * One note-pool item: the pool's example notes rendered through the real melody pipeline, so they
 * carry the active note-colouring, real accidentals and clef-correct positions.
 */
export const NotePoolGlyph = ({ pool, staffStart, clef, staffType, noteColoringMode, theme }) => {
    const notes = POOL_NOTES[pool] || POOL_NOTES.scale;
    return (
        <MiniMelody
            slots={notes}
            durations={notes.map(() => QUARTER)}
            width={POOL_WIDTH}
            staffStart={staffStart}
            clef={clef}
            staff={staffType}
            noteColoringMode={noteColoringMode}
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

const PATTERN_W = 96; // one measure's worth of pattern width inside a carousel item

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
    // #431 (Han): alt/ext = D4, E♭4, F4, G♯4, A4, B4, C5.
    exotic: ['D4', 'E♭4', 'F4', 'G♯4', 'A4', 'B4', 'C5'],
};

/**
 * #362/#431: chord-complexity item = the REAL chord rendered without a staff, via the shared
 * pipeline (one slot = the chord array). The chords row floats on the chord-label band (no staff),
 * so the chord anchors on a VIRTUAL staff around the row centre.
 */
export const ComplexityChordGlyph = ({ complexity, centerY, noteColoringMode, theme }) => {
    const notes = COMPLEXITY_NOTES[complexity] || COMPLEXITY_NOTES.triad;
    const virtualStaffStart = centerY - 26; // middle line = centerY − 6
    return (
        <MiniMelody
            slots={[notes]}                 // a SINGLE slot containing the whole chord
            durations={[QUARTER]}
            width={0}                       // one column → the chord sits on the origin
            staffStart={virtualStaffStart}
            noteColoringMode={noteColoringMode}
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
const CHORD_LABEL_SPACING = 18;

/**
 * #431 (Han): the chords/measure item renders literal chord LABELS in the SAME serif font/size the
 * sheet uses for chord roots (§6d). The trailing partial chord of a fractional count is lowlit.
 */
export const ChordCountGlyph = ({ count, centerY, color = 'var(--text-primary)' }) => {
    const labels = chordLabelsFor(count);
    const x0 = -((labels.length - 1) * CHORD_LABEL_SPACING) / 2;
    return (
        <g style={{ pointerEvents: 'none' }}>
            {labels.map((c, i) => (
                <text key={i} x={x0 + i * CHORD_LABEL_SPACING} y={centerY} textAnchor="middle"
                    fontFamily="serif" fontSize={CHORD_LABEL_FONT_SIZE} fontWeight="normal"
                    fill={c.dim ? 'var(--text-lowlight)' : color}>
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
