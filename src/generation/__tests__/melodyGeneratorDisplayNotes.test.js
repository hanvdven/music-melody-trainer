// Han 2026-09-03 — Level 8 variant 'g' (Modulated) → C Locrian: the treble melody's G♭
// (5th degree) rendered as F♯ in the sheet music. Root cause: MelodyGenerator never captured
// Scale.displayNotes, so Melody.fromFlattenedNotes's scale-context re-spelling was skipped
// (it is gated on notes+displayNotes+tonic all being present) and displayNotes fell back to
// the raw AUDIO spelling — allNotesArray.js always spells pitch-class 6 as 'F♯', never 'G♭'.
//
// These run through the REAL MelodyGenerator entry point with a REAL Scale built the way the
// app builds it, so they are a pipeline-level guarantee: the melody's display spelling must
// match the mode-aware Scale.displayNotes, flatting pc-6 in Locrian while keeping F♯ in Lydian.
import { describe, it, expect } from 'vitest';
import MelodyGenerator from '../melodyGenerator.js';
import InstrumentSettings from '../../model/InstrumentSettings.js';
import Scale from '../../model/Scale.js';
import { updateScaleWithMode } from '../../theory/scaleHandler.js';

const TS = [4, 4];
const NUM_MEASURES = 4;

const modeScale = (mode) =>
    updateScaleWithMode({
        currentScale: Scale.defaultScale(),
        newFamily: 'Diatonic',
        newMode: mode,
        rangeUp: 24,
    });

const trebleSettings = () =>
    Object.assign(InstrumentSettings.defaultTrebleInstrumentSettings(), {
        notesPerMeasure: 8,
        randomizationRule: 'uniform',
        range: { min: 'C4', max: 'C6' },
    });

// All display-note strings the melody uses across many generations, rests/nulls dropped.
const collectDisplayNotes = (scale) => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
        const melody = new MelodyGenerator(
            scale, NUM_MEASURES, TS, trebleSettings(), [], trebleSettings().range,
        ).generateMelody();
        for (const dn of melody.displayNotes) {
            if (dn == null || dn === 'r') continue;
            if (typeof dn === 'string' && /^[A-G]/.test(dn)) seen.add(dn);
        }
    }
    return seen;
};

describe('MelodyGenerator display-note spelling follows the mode (Level 8 → C Locrian bug)', () => {
    it('C Locrian: pitch-class 6 is spelled G♭, never F♯', () => {
        const scale = modeScale('Locrian');
        // Sanity: the Scale itself already spells the 5th degree G♭ (audio spelling is F♯).
        expect(scale.displayNotes.some((n) => n.startsWith('G♭'))).toBe(true);
        expect(scale.notes.some((n) => n.startsWith('F♯'))).toBe(true);

        const used = collectDisplayNotes(scale);
        expect([...used].some((n) => n.startsWith('G♭'))).toBe(true); // pc-6 actually occurs
        expect([...used].some((n) => n.startsWith('F♯'))).toBe(false); // and is never mis-spelled
        // Every display note the melody uses is a member of the mode-aware scale spelling.
        for (const n of used) expect(scale.displayNotes).toContain(n);
    });

    it('C Lydian: the raised 4th stays F♯, never flipped to G♭', () => {
        const scale = modeScale('Lydian');
        expect(scale.displayNotes.some((n) => n.startsWith('F♯'))).toBe(true);

        const used = collectDisplayNotes(scale);
        expect([...used].some((n) => n.startsWith('F♯'))).toBe(true);
        expect([...used].some((n) => n.startsWith('G♭'))).toBe(false);
        for (const n of used) expect(scale.displayNotes).toContain(n);
    });

    it('C Major: unchanged — no accidentals in the display spelling', () => {
        const scale = modeScale('Major');
        const used = collectDisplayNotes(scale);
        for (const n of used) expect(scale.displayNotes).toContain(n);
        expect([...used].some((n) => /[♯♭]/.test(n))).toBe(false);
    });
});
