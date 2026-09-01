import { describe, it, expect } from 'vitest';
import {
    blockMeasuresFor, blockTypeAt, blockTypeForBlock, resolveBlockScale, blockCountFor,
    leadInSpecFor, trackSpecsForLevel, callGroupMeasuresFor,
    MIXED_BLOCK_MEASURES, KEY_MODULATION_BLOCK_MEASURES,
} from '../levelBlockPlan';
import { MAX_TREBLE_DENSITY_STEP } from '../adaptiveLadder';
import { LEVELS } from '../levels';
import Scale from '../../model/Scale';
import InstrumentSettings from '../../model/InstrumentSettings';

// #1165: `levelBlockPlan` is the PURE per-level policy the one content stream reads. Everything the
// five retired mechanisms used to hardcode independently lives here, so it can be asserted directly
// without rendering a hook or generating a note.
describe('levelBlockPlan — blockMeasuresFor (THE one cadence)', () => {
    it('a plain level uses its own numMeasures (Han: numMeasures IS the generation chunk size)', () => {
        expect(blockMeasuresFor({ numMeasures: 8 })).toBe(8);
        expect(blockMeasuresFor({ numMeasures: 2 })).toBe(2);
    });

    it('a call-response block is call + response: callResponseMeasures * 2 (#1101)', () => {
        expect(blockMeasuresFor({ enemyType: 'Wizard', callResponseMeasures: 1, numMeasures: 8 })).toBe(2);
        expect(blockMeasuresFor({ enemyType: 'Wizard', callResponseMeasures: 2, numMeasures: 8 })).toBe(4);
        // A NATIVE Wizard level (13/108/114/118) authors no callResponseMeasures → 1+1, as today.
        expect(blockMeasuresFor({ enemyType: 'Wizard', numMeasures: 8 })).toBe(2);
    });

    it('Mixed and decorativeWizard keep their own authored 2-measure musical period, not numMeasures', () => {
        expect(blockMeasuresFor({ enemyType: 'Mixed', numMeasures: 8 })).toBe(MIXED_BLOCK_MEASURES);
        expect(blockMeasuresFor({ decorativeWizard: true, numMeasures: 8 })).toBe(KEY_MODULATION_BLOCK_MEASURES);
    });

    it('reproduces every shipped level shape (the #1165 "no content change" guarantee)', () => {
        expect(blockMeasuresFor(LEVELS[3])).toBe(LEVELS[3].numMeasures);   // gated procedural
        expect(blockMeasuresFor(LEVELS[4])).toBe(LEVELS[4].numMeasures);   // classic ramp level
        expect(blockMeasuresFor(LEVELS[13])).toBe(2);                      // native call-response
        expect(blockMeasuresFor(LEVELS[14])).toBe(2);                      // Mixed alternation period
        expect(blockMeasuresFor(LEVELS[15])).toBe(2);                      // decorativeWizard modulation period
    });
});

describe('levelBlockPlan — blockTypeAt / blockTypeForBlock', () => {
    it('blockTypeAt keeps the retired useLevelMixedStream semantics exactly (Slime first, per 2 measures)', () => {
        expect(blockTypeAt(0)).toBe('Slime');
        expect(blockTypeAt(1)).toBe('Slime');
        expect(blockTypeAt(2)).toBe('Wizard');
        expect(blockTypeAt(3)).toBe('Wizard');
        expect(blockTypeAt(4)).toBe('Slime');
        expect(blockTypeAt(-5)).toBe('Slime');   // clamped, never negative-indexed
    });

    it('a Mixed level alternates per block, and content agrees with what SheetRpgLayer renders', () => {
        const lvl = LEVELS[14];
        const B = blockMeasuresFor(lvl);
        for (let k = 0; k < 4; k++) {
            expect(blockTypeForBlock(lvl, k)).toBe(blockTypeAt(k * B));
        }
        expect([0, 1, 2, 3].map((k) => blockTypeForBlock(lvl, k)))
            .toEqual(['Slime', 'Wizard', 'Slime', 'Wizard']);
    });

    it('a Wizard level is uniformly Wizard; everything else uniformly Slime', () => {
        expect(blockTypeForBlock({ enemyType: 'Wizard' }, 0)).toBe('Wizard');
        expect(blockTypeForBlock({ enemyType: 'Wizard' }, 7)).toBe('Wizard');
        expect(blockTypeForBlock({ enemyType: 'Slime' }, 3)).toBe('Slime');
        expect(blockTypeForBlock({ decorativeWizard: true }, 3)).toBe('Slime');
    });
});

describe('levelBlockPlan — resolveBlockScale (§305 merge)', () => {
    const scale = Scale.defaultScale();   // C Major

    it('returns the scale UNCHANGED for a level without decorativeWizard', () => {
        expect(resolveBlockScale({ decorativeWizard: false }, scale, 0)).toBe(scale);
        expect(resolveBlockScale({ enemyType: 'Wizard' }, scale, 1)).toBe(scale);
    });

    it('alternates Major/Minor per block for a decorativeWizard level — Slime blocks AND Wizard blocks', () => {
        // The retired code needed TWO rules for this: useLevelKeyModulationStream (Slime blocks) and
        // blockScaleForCallResponse (Wizard blocks). One rule now covers both.
        for (const lvl of [{ decorativeWizard: true }, { decorativeWizard: true, enemyType: 'Wizard' }]) {
            expect(resolveBlockScale(lvl, scale, 0).name).toBe('Major');
            expect(resolveBlockScale(lvl, scale, 1).name).toBe('Minor');
            expect(resolveBlockScale(lvl, scale, 2).name).toBe('Major');
        }
    });

    it('never changes the tonic — only the mode alternates (Han: "wisselt niet van tonic")', () => {
        const lvl = { decorativeWizard: true };
        expect(resolveBlockScale(lvl, scale, 0).tonic).toBe(scale.tonic);
        expect(resolveBlockScale(lvl, scale, 1).tonic).toBe(scale.tonic);
    });
});

describe('levelBlockPlan — blockCountFor (the §299 fix, in ONE place)', () => {
    it('reads totalMeasures, NEVER numMeasures', () => {
        // The exact §299 booby-trap: useLevelMixedStream/useLevelKeyModulationStream read numMeasures,
        // which was only ever correct because levels 14/15 have numMeasures === totalMeasures === 8.
        expect(blockCountFor({ enemyType: 'Mixed', numMeasures: 2, totalMeasures: 8 })).toBe(4);
        expect(blockCountFor({ decorativeWizard: true, numMeasures: 2, totalMeasures: 8 })).toBe(4);
        // ...and it stays 4 after #1166's numMeasures 8→2 edit, instead of silently truncating to 1.
        expect(blockCountFor({ enemyType: 'Mixed', numMeasures: 8, totalMeasures: 8 })).toBe(4);
    });

    it('a gated level generates FOREVER (§867/§1052 — content must never run out during a freeze)', () => {
        expect(blockCountFor({ gatedScroll: true, numMeasures: 2, totalMeasures: 10 })).toBe(Infinity);
    });

    it('covers a call-response level\'s full (doubled) timeline exactly once', () => {
        // applyLevelVariant doubles a song's totalMeasures for d/e; one block covers call+response.
        expect(blockCountFor({ enemyType: 'Wizard', callResponseMeasures: 1, numMeasures: 1, totalMeasures: 16 })).toBe(8);
        expect(blockCountFor({ enemyType: 'Wizard', callResponseMeasures: 2, numMeasures: 2, totalMeasures: 16 })).toBe(4);
        // Native Wizard level 13: 8 measures of timeline in 2-measure call-response blocks.
        expect(blockCountFor(LEVELS[13])).toBe(4);
    });

    it('every shipped non-gated level covers exactly its own totalMeasures', () => {
        for (const lvl of Object.values(LEVELS)) {
            if (lvl.gatedScroll) continue;
            const covered = blockCountFor(lvl) * blockMeasuresFor(lvl);
            expect(covered, `level ${lvl.id} under-covers its timeline`).toBeGreaterThanOrEqual(lvl.totalMeasures);
            // Never more than one block of overshoot (a trailing partial block).
            expect(covered - lvl.totalMeasures, `level ${lvl.id} over-covers`).toBeLessThan(blockMeasuresFor(lvl));
        }
    });
});

describe('levelBlockPlan — leadInSpecFor (the metronome half-stagger)', () => {
    it('keeps Han\'s "alle opmaten cello, de tweede helft (round up) + metronoom erbij" rule', () => {
        expect(leadInSpecFor({ leadInBars: 4 })).toEqual({ leadInBars: 4, metronomeBars: 2 });
        expect(leadInSpecFor({ leadInBars: 3 })).toEqual({ leadInBars: 3, metronomeBars: 2 });
        expect(leadInSpecFor({ leadInBars: 2 })).toEqual({ leadInBars: 2, metronomeBars: 1 });
        // Degenerate single-measure lead-in: the metronome joins that one measure, no special-casing.
        expect(leadInSpecFor({ leadInBars: 1 })).toEqual({ leadInBars: 1, metronomeBars: 1 });
    });

    it('an explicitly authored metronomeBars (normalizeLevel\'s own derivation) wins', () => {
        expect(leadInSpecFor({ leadInBars: 4, metronomeBars: 3 }).metronomeBars).toBe(3);
    });

    it('the lead-in is NEVER the content cadence — it stays leadInBars whatever numMeasures is', () => {
        const lvl = { leadInBars: 4, numMeasures: 2, enemyType: 'Wizard', callResponseMeasures: 2 };
        expect(leadInSpecFor(lvl).leadInBars).toBe(4);
        expect(blockMeasuresFor(lvl)).toBe(4);   // coincidentally equal here — different concepts
        expect(leadInSpecFor({ ...lvl, leadInBars: 3 }).leadInBars).toBe(3);
    });
});

describe('levelBlockPlan — trackSpecsForLevel', () => {
    const settings = {
        trebleSettings: InstrumentSettings.defaultTrebleInstrumentSettings(),
        bassSettings: InstrumentSettings.defaultBassInstrumentSettings(),
        percussionSettings: InstrumentSettings.defaultPercussionInstrumentSettings(),
        chordSettings: InstrumentSettings.defaultChordInstrumentSettings(),
        metronomeSettings: InstrumentSettings.defaultMetronomeInstrumentSettings(),
    };

    it('a PROCEDURAL level keeps its own settings and its own chord strategy', () => {
        const specs = trackSpecsForLevel({ numMeasures: 2 }, settings);
        expect(specs.chordStrategy).toBeUndefined();
        expect(specs.songTreble).toBe(false);
        expect(specs.instrumentSettings.treble.randomizationRule)
            .toBe(settings.trebleSettings.randomizationRule);
    });

    it('a SONG level routes on the EXISTING params: treble randomizationRule "fixed" + chord strategy "song"', () => {
        const specs = trackSpecsForLevel({ songId: 'sakura', numMeasures: 8 }, settings);
        expect(specs.chordStrategy).toBe('song');
        expect(specs.songTreble).toBe(true);
        expect(specs.instrumentSettings.treble.randomizationRule).toBe('fixed');
        // Bass is ALWAYS generated for a level (#871: the cello is the level's own backing line,
        // never the song's bass) — its settings must pass through untouched.
        expect(specs.instrumentSettings.bass).toBe(settings.bassSettings);
    });

    it('never mutates the settings objects handed in', () => {
        const before = settings.trebleSettings.randomizationRule;
        trackSpecsForLevel({ songId: 'sakura' }, settings);
        expect(settings.trebleSettings.randomizationRule).toBe(before);
    });

    it('callGroupMeasuresFor defaults to 1 for a level that authors no call-response group size', () => {
        expect(callGroupMeasuresFor({})).toBe(1);
        expect(callGroupMeasuresFor({ callResponseMeasures: 2 })).toBe(2);
    });

    // ── #1121: the optional DENSITY argument ────────────────────────────────────────────────
    // The projection itself is exhaustively tested in adaptiveLadder.test.js; what matters HERE is
    // that this one function is the ONLY place a rung reaches a block's settings, and that rung 0 is
    // the identity.
    it('a treble rung reaches instrumentSettings.treble, and only the two density fields', () => {
        const lvl = { numMeasures: 2 };
        const plain = trackSpecsForLevel(lvl, settings);
        const dense = trackSpecsForLevel(lvl, settings, { densityStep: 2, timeSignature: [4, 4] });
        expect(dense.instrumentSettings.treble.notesPerMeasure)
            .toBeGreaterThan(plain.instrumentSettings.treble.notesPerMeasure);
        // Everything else about the track survives the shallow merge.
        const { notesPerMeasure: _a, smallestNoteDenom: _b, ...restDense } = dense.instrumentSettings.treble;
        const { notesPerMeasure: _c, smallestNoteDenom: _d, ...restPlain } = plain.instrumentSettings.treble;
        expect(restDense).toEqual(restPlain);
        // The AUTHORED settings object is never mutated — the patch is a copy.
        expect(settings.trebleSettings.notesPerMeasure).toBe(plain.instrumentSettings.treble.notesPerMeasure);
    });

    it('a BASS rung only appears above the treble cap, and never before it', () => {
        const lvl = { numMeasures: 2 };
        const authoredBass = settings.bassSettings.notesPerMeasure;
        for (let s = 1; s <= MAX_TREBLE_DENSITY_STEP; s++) {
            expect(trackSpecsForLevel(lvl, settings, { densityStep: s, timeSignature: [4, 4] })
                .instrumentSettings.bass.notesPerMeasure).toBe(authoredBass);
        }
        expect(trackSpecsForLevel(lvl, settings,
            { densityStep: MAX_TREBLE_DENSITY_STEP + 1, timeSignature: [4, 4] })
            .instrumentSettings.bass.notesPerMeasure).toBeGreaterThan(authoredBass);
    });

    it('a NEGATIVE rung thins the treble toward a skeleton and leaves the bass alone', () => {
        const lvl = { numMeasures: 2 };
        const thin = trackSpecsForLevel(lvl, settings, { densityStep: -2, timeSignature: [4, 4] });
        expect(thin.instrumentSettings.treble.notesPerMeasure)
            .toBeLessThan(settings.trebleSettings.notesPerMeasure);
        expect(thin.instrumentSettings.treble.notesPerMeasure).toBeGreaterThanOrEqual(1);
        expect(thin.instrumentSettings.bass).toBe(settings.bassSettings);
    });

    it('a song level keeps randomizationRule "fixed" even under a density patch', () => {
        const specs = trackSpecsForLevel({ songId: 'sakura', numMeasures: 8 }, settings,
            { densityStep: 3, timeSignature: [4, 4] });
        expect(specs.instrumentSettings.treble.randomizationRule).toBe('fixed');
    });

    it('rung 0 / null is the IDENTITY — a level that never leaves the authored density is unchanged', () => {
        for (const lvl of [{ numMeasures: 2 }, { songId: 'sakura', numMeasures: 8 }]) {
            const plain = trackSpecsForLevel(lvl, settings);
            expect(trackSpecsForLevel(lvl, settings, null)).toEqual(plain);
            expect(trackSpecsForLevel(lvl, settings, { densityStep: 0, timeSignature: [4, 4] })).toEqual(plain);
        }
    });
});
