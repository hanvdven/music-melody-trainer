import { describe, it, expect } from 'vitest';
import { noteToMidi } from '../noteUtils.js';
import { getNoteValue as rangeGetNoteValue } from '../../utils/rangeUtils.js';

/**
 * REGRESSION NET for the name→MIDI parser consolidation (Han 2026-06-19).
 *
 * Background: docs/ARCHITECTURE_AUDIT.md §3 HIGH flagged four divergent
 * name→MIDI parsers. Two were name→MIDI:
 *   - rangeUtils.getNoteValue   — base C4=60, fallback 60, single-accidental regex
 *   - convertRankedArrayToMelody's LOCAL getNoteValue — base C4=48 (off-by-12),
 *     fallback -1, percussion-→0, single-accidental regex
 * Both were collapsed onto the canonical noteUtils.noteToMidi WITHOUT changing
 * any numeric output: each site keeps its own base offset and fallback.
 *
 * This file hard-codes the EXACT numbers the OLD per-site implementations
 * produced, so any future drift in the canonical parser (the §6b risk surface)
 * fails loudly. The expected values below were captured from the original
 * single-accidental-regex implementations, NOT recomputed from the new code.
 *
 * (usePitchDetector is deliberately NOT covered here: it has no name→MIDI parser
 * at all — only Hz→MIDI and MIDI→name(sharp-lean PC_NAMES) — so it is not part of
 * this consolidation. See the audit note / task report.)
 */

// ── Reference reimplementations of the OLD per-site parsers ──────────────────
// Kept verbatim from the pre-consolidation code so the assertions are anchored
// to historical behaviour, not to the new helper they now delegate to.
import { getNoteSemitone } from '../noteUtils.js';

const OLD_RANGE = (note) => {
    if (!note) return 60;
    const match = note.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
    if (!match) return 60;
    const oct = parseInt(match[2], 10);
    return (oct + 1) * 12 + getNoteSemitone(match[1]);
};

const PERCUSSION_IDS = ['k', 's', 'hh', 'c', 'b', 'ho', 'th', 'tm', 'tl', 'hp', 'cr', 'cc', 'wh', 'wm', 'wl', '/'];
const OLD_GEN = (note) => {
    if (!note) return -1;
    if (PERCUSSION_IDS.includes(note)) return 0;
    if (typeof note !== 'string') return -1;
    const match = note.match(/^([A-G][#b♯♭]?)(-?\d+)$/);
    if (!match) return -1;
    const oct = parseInt(match[2], 10);
    return oct * 12 + getNoteSemitone(match[1]);
};

// New per-site equivalents (exactly how each site now calls the canonical parser).
const NEW_RANGE = (note) => noteToMidi(note, { fallback: 60 });
const NEW_GEN = (note) => {
    if (PERCUSSION_IDS.includes(note)) return 0;
    return noteToMidi(note, { fallback: -1, base: -12 });
};

// Representative inputs: naturals, both ASCII (#/b) and Unicode (♯/♭) single
// accidentals, negative octaves, very high/low octaves, percussion IDs, and
// unparseable garbage that must hit each site's fallback.
const NOTE_INPUTS = [
    'C4', 'F♯3', 'A♭-1', 'C0', 'B8', 'G♭5', 'D♯2', 'C-1', 'E♭4', 'B♭3', 'A0',
    'Cb4', 'C#4', 'Fb3', 'B#3',
    'k', 's', 'hh', '/', 'wh',
    '', 'X4', 'C', 'F♯',
];

describe('noteToMidi consolidation — byte-identical to OLD per-site parsers', () => {
    it('reproduces the OLD rangeUtils.getNoteValue (C4=60, fallback 60) exactly', () => {
        for (const n of NOTE_INPUTS) {
            expect(NEW_RANGE(n)).toBe(OLD_RANGE(n));
        }
        // Hard-coded golden values (NOT recomputed from new code).
        expect(NEW_RANGE('C4')).toBe(60);
        expect(NEW_RANGE('F♯3')).toBe(54);
        expect(NEW_RANGE('A♭-1')).toBe(8);
        expect(NEW_RANGE('C0')).toBe(12);
        expect(NEW_RANGE('B8')).toBe(119);
        expect(NEW_RANGE('C-1')).toBe(0);
        expect(NEW_RANGE('C#4')).toBe(61);
        expect(NEW_RANGE('Cb4')).toBe(71);
        expect(NEW_RANGE('Fb3')).toBe(52);
        // Octave is labelled by the literal digit, NOT pitch-corrected: B♯3's
        // pitch class is 0 (=C) so it reads (3+1)*12+0 = 48, even though B♯3
        // sounds as C4=60. Both OLD parsers did this; the consolidation preserves it.
        expect(NEW_RANGE('B#3')).toBe(48);
        // Unparseable → C4 fallback.
        expect(NEW_RANGE('')).toBe(60);
        expect(NEW_RANGE('X4')).toBe(60);
        expect(NEW_RANGE('C')).toBe(60);
        expect(NEW_RANGE(null)).toBe(60);
        expect(NEW_RANGE(undefined)).toBe(60);
    });

    it('reproduces the OLD generation getNoteValue (C4=48, fallback -1, perc→0) exactly', () => {
        for (const n of NOTE_INPUTS) {
            expect(NEW_GEN(n)).toBe(OLD_GEN(n));
        }
        // Hard-coded golden values — note these are 12 LOWER than the range set
        // (the intentional off-by-12 generation base) and never recomputed.
        expect(NEW_GEN('C4')).toBe(48);
        expect(NEW_GEN('F♯3')).toBe(42);
        expect(NEW_GEN('A♭-1')).toBe(-4);
        expect(NEW_GEN('C0')).toBe(0);
        expect(NEW_GEN('B8')).toBe(107);
        expect(NEW_GEN('C-1')).toBe(-12);
        expect(NEW_GEN('E♭4')).toBe(51);
        expect(NEW_GEN('B♭3')).toBe(46);
        // Generation always sits exactly 12 below the range parser for real notes.
        for (const n of ['C4', 'F♯3', 'A♭-1', 'C0', 'B8', 'E♭4', 'B♭3', 'C#4', 'Cb4']) {
            expect(NEW_GEN(n)).toBe(NEW_RANGE(n) - 12);
        }
        // Percussion IDs map to 0 (handled at the call site, not the parser).
        for (const p of PERCUSSION_IDS) expect(NEW_GEN(p)).toBe(0);
        // Unparseable / null → -1.
        expect(NEW_GEN('')).toBe(-1);
        expect(NEW_GEN('X4')).toBe(-1);
        expect(NEW_GEN('C')).toBe(-1);
        expect(NEW_GEN(null)).toBe(-1);
    });

    it('the live rangeUtils.getNoteValue export matches the OLD implementation', () => {
        for (const n of NOTE_INPUTS) {
            expect(rangeGetNoteValue(n)).toBe(OLD_RANGE(n));
        }
    });

    it('canonical noteToMidi additionally supports double/stacked accidentals (new capability, dormant at existing call sites)', () => {
        // The OLD single-accidental regexes returned the fallback for these; the
        // canonical parser resolves them via getNoteSemitone. Existing call sites
        // never feed double accidentals (allNotesArray + range bounds are single),
        // so this extra capability changes no current numeric output.
        expect(noteToMidi('C𝄪4')).toBe(62);  // C double-sharp = D
        expect(noteToMidi('D𝄫4')).toBe(60);  // D double-flat  = C
        expect(noteToMidi('C##4')).toBe(62); // ASCII double sharp
        expect(noteToMidi('Dbb4')).toBe(60); // ASCII double flat
    });
});
