import { describe, it, expect } from 'vitest';
import { doubleMelodyForCallResponse } from '../sliceSongCallResponseBlock';
import { generateBlock } from '../generateBlock';
import { collapseToCallRests } from '../generateLevel9CallResponseBlock';
import { sliceMelodyByRange } from '../../utils/melodySlice';
import Scale from '../../model/Scale';
import InstrumentSettings from '../../model/InstrumentSettings';

// ── #1165 MIGRATION GUARD: the retired `sliceSongCallResponseBlock` ────────────────────────────
// #1155's song call-response was `sliceMelodyByRange` + exactly the transform
// `generateLevel9CallResponseBlock` applies to GENERATED material. #1165 merged the two into the ONE
// `generateBlock` path `useLevelContentStream` now uses for every level: the block's song slice is
// handed in as that block's FIXED material (`randomizationRule: 'fixed'` with no reference melody —
// so the notes and their spellings pass through VERBATIM, never through `modulateMelody`), and
// `shape: 'call-response'` applies the collapse/shift. These tests assert the merged path reproduces
// the retired function's output byte-for-byte, for exactly the cases its own tests covered.
describe('song call-response — merged into generateBlock (#1165, was sliceSongCallResponseBlock #1155)', () => {
    const MLT = 48;   // measureLengthTicks, 4/4 at TICKS_PER_WHOLE=48
    const ts = [4, 4];

    // A 4-measure fake song: one note per measure, at each measure's downbeat.
    const songMelody = {
        notes: ['C4', 'D4', 'E4', 'F4'],
        durations: [MLT, MLT, MLT, MLT],
        offsets: [0, MLT, 2 * MLT, 3 * MLT],
        displayNotes: ['C4', 'D4', 'E4', 'F4'],
    };

    // What `useLevelContentStream` does per block for a song-backed call-response level.
    const songCallResponseBlock = (groupMeasures, blockIndex) => {
        const slice = sliceMelodyByRange(songMelody, MLT, groupMeasures, blockIndex * groupMeasures);
        const scale = Scale.defaultScale();
        const block = generateBlock({
            activeScale: scale,
            timeSignature: ts,
            numMeasures: groupMeasures,
            chordProgression: null,
            seriesArgs: {
                oldTonic: scale.tonic, oldMode: scale.name, oldFamily: scale.family,
                oldScaleNotes: scale.notes, oldDisplayScale: scale.displayNotes,
                randConfig: { melody: true },
                currentMelodies: {},
                instrumentSettings: {
                    treble: { ...InstrumentSettings.defaultTrebleInstrumentSettings(), randomizationRule: 'fixed' },
                    bass: InstrumentSettings.defaultBassInstrumentSettings(),
                    percussion: InstrumentSettings.defaultPercussionInstrumentSettings(),
                    chords: InstrumentSettings.defaultChordInstrumentSettings(),
                },
                currentMelodyContext: {},
                targetTrebleDifficulty: null, targetBassDifficulty: null,
                percussionScale: Scale.defaultPercussionScale(),
            },
            fixedOstinato: { treble: slice },
            shape: 'call-response',
            groupMeasures,
        });
        return block.treble;
    };

    it('groupMeasures=1: block 0 slices measure 0 only, call collapses to rest, response repeats the real note', () => {
        const treble = songCallResponseBlock(1, 0);
        expect(treble.notes[0]).toBe('r');
        expect(treble.offsets[0]).toBe(0);
        expect(treble.durations[0]).toBe(MLT);
        const responseIdx = treble.notes.findIndex((n, i) => i > 0 && n === 'C4');
        expect(responseIdx).toBeGreaterThan(-1);
        expect(treble.offsets[responseIdx]).toBe(MLT);
    });

    it('groupMeasures=1: block 1 slices measure 1 (D4), independent of block 0', () => {
        const treble = songCallResponseBlock(1, 1);
        expect(treble.notes).toContain('D4');
        expect(treble.notes).not.toContain('C4');
    });

    it('groupMeasures=2: block 0 covers measures 0-1 (C4, D4) as ONE call group, response repeats both', () => {
        const treble = songCallResponseBlock(2, 0);
        // call half: 2 measures, EACH collapsed to its own rest (a rest can't span a barline)
        expect(treble.notes.filter((n) => n === 'r').length).toBe(2);
        const c4Idx = treble.notes.lastIndexOf('C4');
        const d4Idx = treble.notes.lastIndexOf('D4');
        expect(treble.offsets[c4Idx]).toBe(2 * MLT);
        expect(treble.offsets[d4Idx]).toBe(2 * MLT + MLT);
    });

    it('a block entirely past the end of the song has no content (its treble contributes nothing)', () => {
        const treble = songCallResponseBlock(1, 10);
        expect(treble.notes).toEqual([]);
    });

    it('reproduces the retired sliceSongCallResponseBlock output byte-for-byte', () => {
        const groupMeasures = 2;
        const slice = sliceMelodyByRange(songMelody, MLT, groupMeasures, 0);
        const call = collapseToCallRests(slice.notes, slice.durations, slice.offsets, slice.displayNotes, MLT);
        const responseOffsets = slice.offsets.map((o) => (o == null ? o : o + groupMeasures * MLT));
        const treble = songCallResponseBlock(groupMeasures, 0);
        expect(treble.notes).toEqual([...call.notes, ...slice.notes]);
        expect(treble.durations).toEqual([...call.durations, ...slice.durations]);
        expect(treble.offsets).toEqual([...call.offsets, ...responseOffsets]);
        expect(treble.displayNotes).toEqual([...call.displayNotes, ...slice.displayNotes]);
    });

    it('never mutates the input songMelody', () => {
        const before = JSON.stringify(songMelody);
        songCallResponseBlock(2, 0);
        expect(JSON.stringify(songMelody)).toBe(before);
    });
});

// Bug fix (Han 2026-08-25 UAT, Sakura d/e: "de akkoorden (en dus de bas) houden geen rekening met de
// herhalingen. De lengte van het nummer is ook niet verdubbeld"): the chord progression (loaded once at
// song load, never JIT-grown like treble) must double to match call-response's doubled treble length —
// unlike the melody, chords are NOT rest-collapsed for the call half (the harmony plays under BOTH halves).
describe('doubleMelodyForCallResponse (bug fix)', () => {
    const MLT = 48;
    // A 4-measure chord progression: one chord per measure.
    const chordMelody = {
        notes: ['C4', 'F4', 'G4', 'C4'],
        durations: [MLT, MLT, MLT, MLT],
        offsets: [0, MLT, 2 * MLT, 3 * MLT],
        displayNotes: ['C4', 'F4', 'G4', 'C4'],
    };

    it('groupMeasures=1: every chord repeats immediately after itself (call, then response)', () => {
        const doubled = doubleMelodyForCallResponse({ melody: chordMelody, groupMeasures: 1, measureLengthTicks: MLT, totalMeasures: 4 });
        expect(doubled.notes).toEqual(['C4', 'C4', 'F4', 'F4', 'G4', 'G4', 'C4', 'C4']);
        expect(doubled.offsets).toEqual([0, MLT, 2 * MLT, 3 * MLT, 4 * MLT, 5 * MLT, 6 * MLT, 7 * MLT]);
    });

    it('groupMeasures=2: each 2-measure group repeats as a whole (call pair, then response pair)', () => {
        const doubled = doubleMelodyForCallResponse({ melody: chordMelody, groupMeasures: 2, measureLengthTicks: MLT, totalMeasures: 4 });
        // group 0 (C4,F4) call at 0,MLT then response at 2*MLT,3*MLT; group 1 (G4,C4) call at 4*MLT,5*MLT
        // then response at 6*MLT,7*MLT.
        expect(doubled.notes).toEqual(['C4', 'F4', 'C4', 'F4', 'G4', 'C4', 'G4', 'C4']);
        expect(doubled.offsets).toEqual([0, MLT, 2 * MLT, 3 * MLT, 4 * MLT, 5 * MLT, 6 * MLT, 7 * MLT]);
    });

    it('doubled length spans exactly 2x totalMeasures (the reported "runs out halfway" bug)', () => {
        const doubled = doubleMelodyForCallResponse({ melody: chordMelody, groupMeasures: 2, measureLengthTicks: MLT, totalMeasures: 4 });
        const lastOffset = doubled.offsets[doubled.offsets.length - 1];
        // last chord's offset must fall within the doubled span (2*4=8 measures), not the original 4.
        expect(lastOffset).toBeLessThan(8 * MLT);
        expect(lastOffset).toBeGreaterThanOrEqual(4 * MLT);   // proves it actually extends PAST the original length
    });

    it('offsets stay in ascending order (no interleaving of call/response across a multi-event group)', () => {
        const doubled = doubleMelodyForCallResponse({ melody: chordMelody, groupMeasures: 2, measureLengthTicks: MLT, totalMeasures: 4 });
        for (let i = 1; i < doubled.offsets.length; i++) {
            expect(doubled.offsets[i]).toBeGreaterThan(doubled.offsets[i - 1]);
        }
    });

    it('handles a partial final group (totalMeasures not evenly divisible by groupMeasures)', () => {
        const doubled = doubleMelodyForCallResponse({ melody: chordMelody, groupMeasures: 3, measureLengthTicks: MLT, totalMeasures: 4 });
        // group 0: measures 0-2 (C4,F4,G4); group 1: measure 3 only (C4) — a partial trailing group.
        expect(doubled.notes).toEqual(['C4', 'F4', 'G4', 'C4', 'F4', 'G4', 'C4', 'C4']);
    });

    it('null/empty melody passes through unchanged (no chords loaded — nothing to double)', () => {
        expect(doubleMelodyForCallResponse({ melody: null, groupMeasures: 1, measureLengthTicks: MLT, totalMeasures: 4 })).toBe(null);
        const empty = { notes: [], durations: [], offsets: [], displayNotes: [] };
        expect(doubleMelodyForCallResponse({ melody: empty, groupMeasures: 1, measureLengthTicks: MLT, totalMeasures: 4 })).toBe(empty);
    });

    it('never mutates the input melody', () => {
        const before = JSON.stringify(chordMelody);
        doubleMelodyForCallResponse({ melody: chordMelody, groupMeasures: 2, measureLengthTicks: MLT, totalMeasures: 4 });
        expect(JSON.stringify(chordMelody)).toBe(before);
    });
});
