import React from 'react';
import { StaffQuarterNote, NOTE_FONT_SIZE } from '../staffNoteGlyph';
import { getNoteAbsoluteY } from '../renderMelodyNotes';
import MelodyNotesLayer from '../MelodyNotesLayer';
import { processMelodyAndCalculateSlots } from '../processMelodyAndCalculateSlots';

// ── Inline-note carousel content for the GENERATION setter (#295, Han) ────────
//
// Han: "vervang de items in de carousels met inline noten, zoals in de colour
// carousel. Volg die zo precies mogelijk qua design." All drawing goes through
// the CANONICAL staff-note components (§6d — StaffQuarterNote for pitched runs,
// StaffMelodyNote for duration patterns); no local glyph offsets.
//
// Everything is authored around the carousel item ORIGIN (x = 0); the caller's
// NonLinearCarousel applies translate/scale/opacity per frame.

// Ledger lines between the staff body and an off-staff notehead — same helper
// the colour overlay uses (kept tiny + local there too).
const ledgerYs = (y, staffStart) => {
    const out = [];
    for (let g = staffStart - 10; y <= g; g -= 10) out.push(g);
    for (let g = staffStart + 50; y >= g; g += 10) out.push(g);
    return out;
};

// Example-note runs per note pool (Han's exact spec).
const POOL_NOTES = {
    root: ['C4', 'C5'],
    chord: ['C4', 'E4', 'G4', 'C5'],
    scale: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
    chromatic: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
};
// Maestro accidental glyphs shown LEFT of the chromatic run: flat, sharp, natural.
const CHROMATIC_ACCIDENTALS = ['b', '#', 'n'];

const POOL_NOTE_SPACING = 16;  // x-gap — EXACTLY the colour setter's NOTE_SPACING (#362)
const ACC_SPACING = 8;         // x-gap between the chromatic accidental glyphs
const ACC_FONT = 22;           // accidental cluster size (compact — three glyphs must fit)

/**
 * One note-pool item: the pool's example notes at their REAL staff positions
 * (colour-carousel design). `staffStart` = the host staff's top line; `clef` +
 * `staffType` feed getNoteAbsoluteY so the bass row positions C4 correctly.
 */
export const NotePoolGlyph = ({ pool, staffStart, clef, staffType, color = 'var(--text-primary)' }) => {
    const notes = POOL_NOTES[pool] || POOL_NOTES.scale;
    const accs = pool === 'chromatic' ? CHROMATIC_ACCIDENTALS : [];
    const runW = (notes.length - 1) * POOL_NOTE_SPACING;
    const accW = accs.length * ACC_SPACING;
    const x0 = -(runW + accW) / 2 + accW; // centre run+accidentals together on the origin
    return (
        <g style={{ pointerEvents: 'none' }}>
            {accs.map((a, i) => (
                <text key={a} x={x0 - accW + i * ACC_SPACING} y={staffStart + 20 + 5}
                    fontSize={ACC_FONT} fontFamily="Maestro" fill={color}>{a}</text>
            ))}
            {notes.map((n, k) => {
                const y = getNoteAbsoluteY(n, staffStart, clef, staffType);
                if (y == null) return null;
                return (
                    <StaffQuarterNote key={n} x={x0 + k * POOL_NOTE_SPACING} positionY={y}
                        staffYStart={staffStart} ledgerYs={ledgerYs(y, staffStart)} color={color} />
                );
            })}
        </g>
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

const PATTERN_W = 92; // one measure's worth of pattern width inside a carousel item

// Neutral layer props for the mini-measures below — mirrors ClefStaffOverlay's
// PERC_LAYER_PROPS recipe (§6c: same MelodyNotesLayer preparation, not a fork).
const MINI_LAYER_PROPS = {
    numAccidentals: 0, noteGroupSize: 12, measureLengthSlots: 9999, scaleNotes: [],
    tonic: '', processedChords: [], inputTestState: null, pixelsPerTick: null,
    startMeasureIndex: 0, transpositionSemitones: 0, debugMode: false, interactive: false,
    courtesyAccidentals: false, percussionVoiceSplit: false, noteColoringMode: 'none',
};

/**
 * #362 (Han): notes-per-measure rendered "volgens bestaande protocol
 * renderMelodyNotes" — a REAL mini-measure through MelodyNotesLayer, so eighths
 * beam per beat and groupings read exactly like the sheet. The pattern comes
 * from the same derived rhythmPatternDurations; every note sits on the middle
 * line (B4 in treble).
 */
export const RhythmMeasureGlyph = ({ n, staffStart, color = 'var(--text-primary)' }) => {
    const durations = rhythmPatternDurations(n);
    if (!durations.length) return null;
    const offsets = [];
    let cum = 0;
    for (const d of durations) { offsets.push(cum); cum += d; }
    const raw = {
        notes: durations.map(() => 'B4'),
        durations,
        offsets,
        displayNotes: durations.map(() => 'B4'),
    };
    const mel = processMelodyAndCalculateSlots(raw, [4, 4], 12, 48);
    // Shared x-grid with sentinels — the ClefStaffOverlay recipe (getTickX uses
    // indexOf − 1, so a leading sentinel lands the first note at startX).
    const grid = Array.from(new Set(mel.offsets)).sort((a, b) => a - b);
    const lastOff = grid[grid.length - 1] ?? 0;
    const allOffsets = [-1, ...grid, lastOff + 1];
    const slots = Math.max(1, grid.length);
    const noteW = PATTERN_W / slots;
    const ox = -PATTERN_W / 2;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <MelodyNotesLayer
                {...MINI_LAYER_PROPS}
                melody={mel}
                clef="treble"
                staff="treble"
                staffYStart={staffStart}
                startX={ox}
                noteWidth={noteW}
                allOffsets={allOffsets}
                timeSignature={[4, 4]}
                previewMode={color}
            />
        </g>
    );
};

// Chord-complexity → the stacked pitches it stands for (built on C so every
// head is a natural; the stack IS the icon — #362 Han: "geen plaatjes").
const COMPLEXITY_NOTES = {
    root: ['C4'],
    power: ['C4', 'G4'],
    triad: ['C4', 'E4', 'G4'],
    seventh: ['C4', 'E4', 'G4', 'B4'],
    sus: ['C4', 'F4', 'G4'],
    exotic: ['C4', 'E4', 'G4', 'B4', 'D5'],
};

/**
 * #362: chord-complexity item = a REAL stacked chord (canonical noteheads via
 * StaffQuarterNote). The chords row floats on the chord-label band (no staff),
 * so the stack anchors on a VIRTUAL staff around the row centre; stems follow
 * the normal middle-line rule of that virtual staff.
 */
export const ComplexityChordGlyph = ({ complexity, centerY, color = 'var(--text-primary)' }) => {
    const notes = COMPLEXITY_NOTES[complexity] || COMPLEXITY_NOTES.triad;
    const virtualStaffStart = centerY - 26; // middle line = centerY − 6
    return (
        <g style={{ pointerEvents: 'none' }}>
            {notes.map((nname) => {
                const y = getNoteAbsoluteY(nname, virtualStaffStart, 'treble', 'treble');
                if (y == null) return null;
                return (
                    <StaffQuarterNote key={nname} x={-5} positionY={y}
                        staffYStart={virtualStaffStart} ledgerYs={[]} color={color} />
                );
            })}
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
