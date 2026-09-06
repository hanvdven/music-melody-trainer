import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    evaluateLadder, densityOverrideFor, slotsPerMeasure,
    gatingAllowed, shouldExitGated, pushHiddenGrade,
    MIN_DENSITY_STEP, MAX_TREBLE_DENSITY_STEP, MAX_DENSITY_STEP,
    GATED_EXIT_WINDOW, GATED_EXIT_REQUIRED, GATED_REENTRY_COOLDOWN_BLOCKS,
} from '../adaptiveLadder';
import { ADAPTIVE_STEP } from '../adaptiveTempo';
import { trackSpecsForLevel } from '../levelBlockPlan';
import { GLOBAL_RESOLUTION } from '../../constants/generatorDefaults';
import InstrumentSettings from '../../model/InstrumentSettings';

// #1121 (Han 2026-09-01) — THE adaptive difficulty LADDER, as one monotone ordered scale.
//
// The ±5%/clamp cases in the first describe block below are the MIGRATED `evaluateAdaptiveBpm` tests
// (they moved with the function out of adaptiveTempo.js, CLAUDE.md §7: no compat shim, no orphaned
// suite). They are the proof that the tempo rung is byte-identical to what #1102 shipped.

const stats = (over = {}) => ({
    defeated: 0, misses: 0, perfect: 0, tooFast: 0, tooSlow: 0, muchTooFast: 0, muchTooSlow: 0,
    secondAttemptCorrected: 0, wrongUncorrected: 0, missed: 0, extraNote: 0, ...over,
});
const ZERO = stats();
const CLEAN = stats({ defeated: 10, perfect: 10 });                       // 100% → harder
const ROUGH = stats({ defeated: 5, perfect: 5, misses: 5, missed: 5 });   // 50%  → easier
const OK_ISH = stats({ defeated: 8, perfect: 8, misses: 2, missed: 2 });  // 80%  → hold

const BASE = 100;
const CEILING = BASE;
const FLOOR = BASE / 2;
const PROCEDURAL = { id: 4, bpm: BASE };
const rung = (over = {}) => ({ bpm: BASE, densityStep: 0, pacing: 'timed', ...over });
const harder = (state, lvl = PROCEDURAL) =>
    evaluateLadder({ prevStats: ZERO, currStats: CLEAN, state, baseBpm: BASE, lvl });
const easier = (state, lvl = PROCEDURAL) =>
    evaluateLadder({ prevStats: ZERO, currStats: ROUGH, state, baseBpm: BASE, lvl });

// ── (a) the migrated tempo rung ────────────────────────────────────────────────────────────
describe('adaptiveLadder — the TEMPO rung (migrated from evaluateAdaptiveBpm, #1102)', () => {
    it('speeds up by exactly 5% after a clean stretch (>=90% accuracy)', () => {
        expect(harder(rung({ bpm: 80 })).bpm).toBeCloseTo(80 * (1 + ADAPTIVE_STEP), 6);
    });

    it('slows down by exactly 5% after a rough stretch (<70% accuracy)', () => {
        expect(easier(rung({ bpm: 80 })).bpm).toBeCloseTo(80 * (1 - ADAPTIVE_STEP), 6);
    });

    it('HOLDS steady in the 70-90% deadband rather than chasing noise every block', () => {
        const state = rung({ bpm: 80 });
        expect(evaluateLadder({
            prevStats: ZERO, currStats: OK_ISH, state, baseBpm: BASE, lvl: PROCEDURAL,
        })).toBe(state);   // the very same object — nothing moved at all
    });

    it('is a NO-OP when nothing was graded in the stretch (e.g. the very first block)', () => {
        const snapshot = stats({ defeated: 4, perfect: 4 });
        const state = rung({ bpm: 80 });
        expect(evaluateLadder({
            prevStats: snapshot, currStats: snapshot, state, baseBpm: BASE, lvl: PROCEDURAL,
        })).toBe(state);
    });

    it('never leaves the [baseBpm/2, baseBpm] clamp in either direction', () => {
        expect(harder(rung({ bpm: CEILING * 0.98 })).bpm).toBe(CEILING);
        expect(easier(rung({ bpm: FLOOR * 1.02 })).bpm).toBe(FLOOR);
    });

    it('at the CEILING the tempo no longer rises — that is where the DENSITY rung takes over', () => {
        const next = harder(rung({ bpm: CEILING }));
        expect(next.bpm).toBe(CEILING);
        expect(next.densityStep).toBe(1);
    });

    it('at the FLOOR the tempo no longer falls — the content thins instead', () => {
        const next = easier(rung({ bpm: FLOOR }));
        expect(next.bpm).toBe(FLOOR);
        expect(next.densityStep).toBe(-1);
    });
});

// ── (b) strict precedence: exactly ONE knob per call ───────────────────────────────────────
describe('adaptiveLadder — STRICT PRECEDENCE (one knob, one notch, per graded block)', () => {
    const STATES = [];
    for (const bpm of [FLOOR, FLOOR * 1.2, CEILING * 0.9, CEILING]) {
        for (let d = MIN_DENSITY_STEP; d <= MAX_DENSITY_STEP; d++) STATES.push(rung({ bpm, densityStep: d }));
    }

    it('never changes more than one of {bpm, densityStep, pacing} on any single call', () => {
        for (const state of STATES) {
            for (const next of [harder(state), easier(state)]) {
                const changed = ['bpm', 'densityStep', 'pacing'].filter((k) => next[k] !== state[k]);
                expect(changed.length).toBeLessThanOrEqual(1);
            }
        }
    });

    it('a density notch is always exactly ±1 — never a jump', () => {
        for (const state of STATES) {
            for (const next of [harder(state), easier(state)]) {
                expect(Math.abs(next.densityStep - state.densityStep)).toBeLessThanOrEqual(1);
            }
        }
    });

    it('#1121 never sets pacing — that rung belongs to #1120', () => {
        for (const state of STATES) {
            expect(harder(state).pacing).toBe('timed');
            expect(easier(state).pacing).toBe('timed');
        }
    });

    it('the deadband moves nothing, from any rung', () => {
        for (const state of STATES) {
            expect(evaluateLadder({
                prevStats: ZERO, currStats: OK_ISH, state, baseBpm: BASE, lvl: PROCEDURAL,
            })).toBe(state);
        }
    });
});

// ── (c) + (d) the monotone order, its symmetric unwind, and termination ────────────────────
describe('adaptiveLadder — one monotone scale: the climb and its exact reverse', () => {
    /** Drive one direction to a fixed point, recording every position visited. */
    const drive = (start, step) => {
        const seen = [start];
        let state = start;
        for (let i = 0; i < 200; i++) {
            const next = step(state);
            if (next.bpm === state.bpm && next.densityStep === state.densityStep
                && next.pacing === state.pacing) return { seen, terminated: true };
            state = next;
            seen.push(state);
        }
        return { seen, terminated: false };
    };

    const BOTTOM = rung({ bpm: FLOOR, densityStep: MIN_DENSITY_STEP });
    const TOP = rung({ bpm: CEILING, densityStep: MAX_DENSITY_STEP });

    it('TERMINATES in both directions — the ladder is a FINITE ordered scale', () => {
        const up = drive(BOTTOM, harder);
        const down = drive(TOP, easier);
        expect(up.terminated).toBe(true);
        expect(down.terminated).toBe(true);
        expect(up.seen[up.seen.length - 1]).toEqual(TOP);
        expect(down.seen[down.seen.length - 1]).toEqual(BOTTOM);
    });

    it('climbs in Han\'s order: restore CONTENT, then TEMPO, then densify above authored', () => {
        const { seen } = drive(BOTTOM, harder);
        // Phase 1: at the floor, density climbs from the skeleton back to 0.
        const restore = seen.slice(0, -MIN_DENSITY_STEP + 1);
        expect(restore.every((s) => s.bpm === FLOOR)).toBe(true);
        expect(restore[restore.length - 1].densityStep).toBe(0);
        // Phase 3: once the tempo is pinned at the ceiling, density climbs above authored.
        const densify = seen.filter((s) => s.densityStep > 0);
        expect(densify.every((s) => s.bpm === CEILING)).toBe(true);
        // Phase 2 in between: every position with densityStep 0 sits between floor and ceiling.
        const tempoPhase = seen.filter((s) => s.densityStep === 0);
        expect(tempoPhase.length).toBeGreaterThan(2);
        expect(tempoPhase.every((s) => s.bpm >= FLOOR && s.bpm <= CEILING)).toBe(true);
    });

    /**
     * Which knob moved at each step, run-length-encoded into PHASES. Comparing phases rather than raw
     * step counts is deliberate: the ±5% tempo rung is MULTIPLICATIVE, so climbing floor→ceiling takes
     * ceil(ln2/ln1.05)=15 notches while descending ceiling→floor takes ceil(ln2/-ln0.95)=14. That
     * asymmetry is pre-existing #1102 behaviour (the clamp absorbs the remainder at each end), not
     * something the ladder introduces — what Han's "symmetric back-off" is about is the ORDER the KNOBS
     * are used in, and the exact mirroring of the density rungs.
     */
    const phasesOf = (seen) => {
        const out = [];
        for (let i = 1; i < seen.length; i++) {
            const knob = seen[i].densityStep !== seen[i - 1].densityStep ? 'density' : 'bpm';
            if (out[out.length - 1] !== knob) out.push(knob);
        }
        return out;
    };

    it('the back-off unwinds in EXACTLY the reverse KNOB order (Han\'s symmetric back-off)', () => {
        const up = drive(BOTTOM, harder).seen;
        const down = drive(TOP, easier).seen;
        // Content, then tempo, then content — and the same three phases mirrored coming back down.
        expect(phasesOf(up)).toEqual(['density', 'bpm', 'density']);
        expect(phasesOf(down).reverse()).toEqual(phasesOf(up));
    });

    it('the DENSITY rungs mirror exactly, notch for notch', () => {
        const upDensity = drive(BOTTOM, harder).seen.map((s) => s.densityStep);
        const downDensity = drive(TOP, easier).seen.map((s) => s.densityStep);
        // Dedupe the tempo plateau (where the density does not move) and the two sequences are exact
        // reverses: every rung the climb added is removed on the way down, in the reverse order.
        const dedupe = (xs) => xs.filter((v, i) => i === 0 || v !== xs[i - 1]);
        expect(dedupe(downDensity)).toEqual(dedupe(upDensity).reverse());
        expect(dedupe(upDensity)).toEqual([-2, -1, 0, 1, 2, 3, 4, 5]);
    });

    it('ADDED density comes off before the bpm is touched again (acceptance criterion 3)', () => {
        const next = easier(rung({ bpm: CEILING, densityStep: 2 }));
        expect(next.densityStep).toBe(1);
        expect(next.bpm).toBe(CEILING);   // untouched
    });

    it('thinned content is restored before the bpm climbs again (acceptance criterion 5)', () => {
        const next = harder(rung({ bpm: FLOOR, densityStep: -2 }));
        expect(next.densityStep).toBe(-1);
        expect(next.bpm).toBe(FLOOR);     // untouched
    });

    it('parks silently at both ends — without #1120 the bottom is a legal resting place', () => {
        expect(harder(TOP)).toBe(TOP);
        expect(easier(BOTTOM)).toBe(BOTTOM);
    });
});

// ── (e) + (f) the projection is a FORMULA, valid for every meter ───────────────────────────
describe('adaptiveLadder — densityOverrideFor is a formula over the METER (§6c)', () => {
    const METERS = [[4, 4], [3, 4], [5, 4], [7, 8], [6, 8], [11, 8], [12, 8]];
    const trebleAuthored = { notesPerMeasure: 3, smallestNoteDenom: 4 };
    const bassAuthored = { notesPerMeasure: 1, smallestNoteDenom: 1 };

    it('slotsPerMeasure is ts[0] * denom / ts[1] — correct for odd numerators too', () => {
        expect(slotsPerMeasure([4, 4], 4)).toBe(4);
        expect(slotsPerMeasure([4, 4], 16)).toBe(16);
        expect(slotsPerMeasure([7, 8], 8)).toBe(7);
        expect(slotsPerMeasure([5, 4], 8)).toBe(10);
        expect(slotsPerMeasure([6, 8], 16)).toBe(12);
    });

    it('never produces more notes than the measure has slots, in ANY meter', () => {
        for (const timeSignature of METERS) {
            for (let s = 1; s <= MAX_DENSITY_STEP; s++) {
                const { treble } = densityOverrideFor(s, { trebleAuthored, bassAuthored, timeSignature });
                if (!treble) continue;
                expect(treble.notesPerMeasure)
                    .toBeLessThanOrEqual(slotsPerMeasure(timeSignature, treble.smallestNoteDenom));
            }
        }
    });

    it('refines the grid ONLY when the measure is full, and never past GLOBAL_RESOLUTION', () => {
        for (const timeSignature of METERS) {
            for (let s = 1; s <= MAX_DENSITY_STEP; s++) {
                const { treble } = densityOverrideFor(s, { trebleAuthored, bassAuthored, timeSignature });
                if (!treble) continue;
                expect(treble.smallestNoteDenom).toBeLessThanOrEqual(GLOBAL_RESOLUTION);
                expect(treble.smallestNoteDenom).toBeGreaterThanOrEqual(trebleAuthored.smallestNoteDenom);
                // A power-of-two doubling of the authored grid, never an arbitrary value.
                expect(Number.isInteger(Math.log2(treble.smallestNoteDenom / trebleAuthored.smallestNoteDenom)))
                    .toBe(true);
            }
        }
    });

    it('is MONOTONE: every extra rung adds notes (or is a silent no-op at the grid ceiling)', () => {
        for (const timeSignature of METERS) {
            let prev = trebleAuthored.notesPerMeasure;
            for (let s = 1; s <= MAX_TREBLE_DENSITY_STEP; s++) {
                const { treble } = densityOverrideFor(s, { trebleAuthored, bassAuthored, timeSignature });
                const npm = treble ? treble.notesPerMeasure : trebleAuthored.notesPerMeasure;
                expect(npm).toBeGreaterThanOrEqual(prev);
                prev = npm;
            }
        }
    });

    it('stops SILENTLY once the finest grid is full — no throw, no illegal value', () => {
        // Authored already AT GLOBAL_RESOLUTION and completely full: 16 sixteenths in 4/4.
        const full = { notesPerMeasure: 16, smallestNoteDenom: GLOBAL_RESOLUTION };
        for (let s = 1; s <= MAX_DENSITY_STEP; s++) {
            expect(densityOverrideFor(s, {
                trebleAuthored: full, bassAuthored, timeSignature: [4, 4],
            }).treble).toBeNull();
        }
    });

    it('the SKELETON floor is 1 note/measure, and negative rungs never touch the bass', () => {
        for (const timeSignature of METERS) {
            for (let s = -1; s >= MIN_DENSITY_STEP; s--) {
                const { treble, bass } = densityOverrideFor(s, {
                    trebleAuthored: { notesPerMeasure: 2, smallestNoteDenom: 4 }, bassAuthored, timeSignature,
                });
                expect(treble.notesPerMeasure).toBeGreaterThanOrEqual(1);
                expect(bass).toBeNull();
                // Thinning never coarsens the grid — the surviving notes stay on the beats the player
                // already learned.
                expect(treble.smallestNoteDenom).toBe(4);
            }
        }
    });

    it('the BASS rungs only start once the TREBLE has reached its own cap (Han q3)', () => {
        const args = { trebleAuthored, bassAuthored, timeSignature: [4, 4] };
        for (let s = 1; s <= MAX_TREBLE_DENSITY_STEP; s++) {
            expect(densityOverrideFor(s, args).bass).toBeNull();
        }
        const above = densityOverrideFor(MAX_TREBLE_DENSITY_STEP + 1, args);
        expect(above.bass).not.toBeNull();
        // LEVEL_BASS_SIMPLE is 1 note/measure on a WHOLE-note grid — the grid must double before a
        // second note can fit. A lookup table would not have got this right.
        expect(above.bass.smallestNoteDenom).toBe(2);
        expect(above.bass.notesPerMeasure).toBe(2);
        // …and the treble stops climbing once its own cap is reached.
        expect(above.treble).toEqual(densityOverrideFor(MAX_TREBLE_DENSITY_STEP, args).treble);
    });
});

// ── (g) + (h) scope, and rung-0 identity ───────────────────────────────────────────────────
describe('adaptiveLadder — scope and the rung-0 identity', () => {
    const SONG = { id: 900, songId: 'kalinka', bpm: BASE };

    it('a SONG-backed level never leaves densityStep 0, in either direction', () => {
        expect(harder(rung({ bpm: CEILING }), SONG)).toEqual(rung({ bpm: CEILING }));
        expect(easier(rung({ bpm: FLOOR }), SONG)).toEqual(rung({ bpm: FLOOR }));
        // …but its TEMPO rung still works exactly as before.
        expect(harder(rung({ bpm: 80 }), SONG).bpm).toBeCloseTo(80 * (1 + ADAPTIVE_STEP), 6);
    });

    it('densityOverrideFor(0) is the identity — both patches null', () => {
        expect(densityOverrideFor(0, {
            trebleAuthored: { notesPerMeasure: 3, smallestNoteDenom: 4 },
            bassAuthored: { notesPerMeasure: 1, smallestNoteDenom: 1 },
            timeSignature: [4, 4],
        })).toEqual({ treble: null, bass: null });
    });

    it('trackSpecsForLevel at rung 0 deep-equals the no-density call (acceptance criterion 10)', () => {
        const settings = {
            trebleSettings: InstrumentSettings.defaultTrebleInstrumentSettings(),
            bassSettings: InstrumentSettings.defaultBassInstrumentSettings(),
            percussionSettings: InstrumentSettings.defaultPercussionInstrumentSettings(),
            chordSettings: InstrumentSettings.defaultChordInstrumentSettings(),
            metronomeSettings: InstrumentSettings.defaultMetronomeInstrumentSettings(),
        };
        for (const lvl of [PROCEDURAL, { id: 900, songId: 'kalinka' }]) {
            const plain = trackSpecsForLevel(lvl, settings);
            expect(trackSpecsForLevel(lvl, settings, null)).toEqual(plain);
            expect(trackSpecsForLevel(lvl, settings, { densityStep: 0, timeSignature: [4, 4] })).toEqual(plain);
            // The unchanged tracks are the SAME OBJECT, not a copy — nothing downstream sees a new
            // identity when the ladder has not moved.
            expect(trackSpecsForLevel(lvl, settings, { densityStep: 0, timeSignature: [4, 4] })
                .instrumentSettings.bass).toBe(settings.bassSettings);
        }
    });

    it('a song level keeps randomizationRule "fixed" even under a density patch', () => {
        const settings = {
            trebleSettings: InstrumentSettings.defaultTrebleInstrumentSettings(),
            bassSettings: InstrumentSettings.defaultBassInstrumentSettings(),
            percussionSettings: InstrumentSettings.defaultPercussionInstrumentSettings(),
            chordSettings: InstrumentSettings.defaultChordInstrumentSettings(),
            metronomeSettings: InstrumentSettings.defaultMetronomeInstrumentSettings(),
        };
        const specs = trackSpecsForLevel({ id: 900, songId: 'kalinka' }, settings,
            { densityStep: 2, timeSignature: [4, 4] });
        expect(specs.instrumentSettings.treble.randomizationRule).toBe('fixed');
    });

    it('a treble density patch really reaches instrumentSettings.treble', () => {
        const settings = {
            trebleSettings: { ...InstrumentSettings.defaultTrebleInstrumentSettings(), notesPerMeasure: 3, smallestNoteDenom: 4 },
            bassSettings: InstrumentSettings.defaultBassInstrumentSettings(),
            percussionSettings: InstrumentSettings.defaultPercussionInstrumentSettings(),
            chordSettings: InstrumentSettings.defaultChordInstrumentSettings(),
            metronomeSettings: InstrumentSettings.defaultMetronomeInstrumentSettings(),
        };
        const specs = trackSpecsForLevel(PROCEDURAL, settings, { densityStep: 2, timeSignature: [4, 4] });
        expect(specs.instrumentSettings.treble.notesPerMeasure).toBe(5);
        // Every other authored field survives the shallow merge.
        expect(specs.instrumentSettings.treble.range).toEqual(settings.trebleSettings.range);
    });
});

// ── (j) #1120: the GATED PACING rung at the very bottom of the same ladder ─────────────────
describe('adaptiveLadder — #1120 the GATED PACING rung', () => {
    // A level the rung is actually in scope for: adaptive, side-scroll, procedural, plain Slime.
    const GATABLE = { id: 4, bpm: BASE, adaptive: true, sideScroll: true, enemyType: 'Slime' };
    const BOTTOM = rung({ bpm: FLOOR, densityStep: MIN_DENSITY_STEP, blocksSinceGatedExit: Infinity });
    const perfects = (n, total = GATED_EXIT_WINDOW) => [
        ...Array.from({ length: total - n }, () => 'tooSlow'),
        ...Array.from({ length: n }, () => 'perfect'),
    ];
    const gatedState = (over = {}) => rung({
        bpm: FLOOR, densityStep: MIN_DENSITY_STEP, pacing: 'gated', blocksSinceGatedExit: 0, ...over,
    });
    const exitAt = (state, hiddenGrades) => evaluateLadder({
        prevStats: ZERO, currStats: CLEAN, state, baseBpm: BASE, lvl: GATABLE, hiddenGrades,
    });

    // ── the entry condition ────────────────────────────────────────────────────────────────
    it('gates ONLY from (floor bpm, skeleton density, still struggling) — never one notch earlier', () => {
        expect(easier(BOTTOM, GATABLE).pacing).toBe('gated');
        // One notch of tempo left → the TEMPO moves, pacing does not.
        expect(easier(rung({ bpm: FLOOR * 1.2, densityStep: MIN_DENSITY_STEP }), GATABLE).pacing).toBe('timed');
        // One notch of density left → the CONTENT thins, pacing does not.
        expect(easier(rung({ bpm: FLOOR, densityStep: MIN_DENSITY_STEP + 1 }), GATABLE).pacing).toBe('timed');
        // And a CLEAN block at the bottom climbs back up instead of gating.
        expect(harder(BOTTOM, GATABLE).pacing).toBe('timed');
        expect(harder(BOTTOM, GATABLE).densityStep).toBe(MIN_DENSITY_STEP + 1);
    });

    it('gatingAllowed is ONE predicate: procedural, adaptive, side-scroll, non-Wizard, not authored-gated', () => {
        expect(gatingAllowed(GATABLE)).toBe(true);
        expect(gatingAllowed({ ...GATABLE, songId: 'kalinka' })).toBe(false);
        expect(gatingAllowed({ ...GATABLE, enemyType: 'Wizard' })).toBe(false);
        expect(gatingAllowed({ ...GATABLE, enemyType: 'Mixed' })).toBe(false);
        expect(gatingAllowed({ ...GATABLE, gatedScroll: true })).toBe(false);
        expect(gatingAllowed({ ...GATABLE, sideScroll: false })).toBe(false);
        expect(gatingAllowed({ ...GATABLE, adaptive: false })).toBe(false);
        expect(gatingAllowed(null)).toBe(false);
    });

    it('an out-of-scope level PARKS at (floor, skeleton) instead — no crash, no branch', () => {
        for (const lvl of [
            { ...GATABLE, songId: 'kalinka' },
            { ...GATABLE, enemyType: 'Wizard' },
            { ...GATABLE, enemyType: 'Mixed' },
            { ...GATABLE, gatedScroll: true },
        ]) {
            expect(easier(BOTTOM, lvl)).toBe(BOTTOM);   // the very same object — nothing moved
        }
    });

    it('the anti-flap cooldown blocks re-gating for GATED_REENTRY_COOLDOWN_BLOCKS boundaries', () => {
        for (let n = 0; n < GATED_REENTRY_COOLDOWN_BLOCKS; n++) {
            expect(easier(rung({ ...BOTTOM, blocksSinceGatedExit: n }), GATABLE).pacing).toBe('timed');
        }
        expect(easier(rung({ ...BOTTOM, blocksSinceGatedExit: GATED_REENTRY_COOLDOWN_BLOCKS }), GATABLE).pacing)
            .toBe('gated');
        // A state that predates the counter is never blocked from its FIRST gating.
        const noCounter = { bpm: FLOOR, densityStep: MIN_DENSITY_STEP, pacing: 'timed' };
        expect(easier(noCounter, GATABLE).pacing).toBe('gated');
    });

    // ── the exit condition ─────────────────────────────────────────────────────────────────
    it('shouldExitGated needs a FULL window — a partially filled one can never exit', () => {
        expect(shouldExitGated(null)).toBe(false);
        expect(shouldExitGated([])).toBe(false);
        // Even ALL-perfect, if there are not yet GATED_EXIT_WINDOW of them.
        expect(shouldExitGated(Array.from({ length: GATED_EXIT_WINDOW - 1 }, () => 'perfect'))).toBe(false);
    });

    it('shouldExitGated is false at REQUIRED-1 and true at REQUIRED of the last WINDOW', () => {
        expect(shouldExitGated(perfects(GATED_EXIT_REQUIRED - 1))).toBe(false);
        expect(shouldExitGated(perfects(GATED_EXIT_REQUIRED))).toBe(true);
        // Only the LAST window counts — a great start followed by a bad stretch does not exit.
        expect(shouldExitGated([
            ...Array.from({ length: GATED_EXIT_WINDOW, }, () => 'perfect'),
            ...Array.from({ length: GATED_EXIT_WINDOW }, () => 'muchTooSlow'),
        ])).toBe(false);
    });

    it('pushHiddenGrade keeps the buffer at exactly GATED_EXIT_WINDOW, newest last', () => {
        const buf = [];
        for (let i = 0; i < GATED_EXIT_WINDOW * 3; i++) pushHiddenGrade(buf, `g${i}`);
        expect(buf).toHaveLength(GATED_EXIT_WINDOW);
        expect(buf[buf.length - 1]).toBe(`g${GATED_EXIT_WINDOW * 3 - 1}`);
    });

    it('while gated NOTHING else can move — the block accuracy is ignored in BOTH directions', () => {
        const g = gatedState();
        // A "clean" gated block (accuracy is ~100% by construction) does not climb the ladder…
        expect(exitAt(g, perfects(0))).toBe(g);
        // …and a "rough" one does not thin anything further either.
        expect(evaluateLadder({
            prevStats: ZERO, currStats: ROUGH, state: g, baseBpm: BASE, lvl: GATABLE, hiddenGrades: perfects(0),
        })).toBe(g);
        // Nor does the deadband.
        expect(evaluateLadder({
            prevStats: ZERO, currStats: OK_ISH, state: g, baseBpm: BASE, lvl: GATABLE, hiddenGrades: perfects(0),
        })).toBe(g);
    });

    it('exits to EXACTLY (floor, skeleton, timed) with the cooldown counter reset', () => {
        expect(exitAt(gatedState(), perfects(GATED_EXIT_REQUIRED))).toEqual({
            bpm: FLOOR, densityStep: MIN_DENSITY_STEP, pacing: 'timed', blocksSinceGatedExit: 0,
        });
    });

    it('GATED IS NOT TERMINAL: after the exit the ladder climbs again — CONTENT first, then tempo', () => {
        const exited = exitAt(gatedState(), perfects(GATED_EXIT_REQUIRED));
        const next = harder(exited, GATABLE);
        expect(next.densityStep).toBe(MIN_DENSITY_STEP + 1);
        expect(next.bpm).toBe(FLOOR);            // the tempo waits its turn
        expect(next.pacing).toBe('timed');
    });

    it('a hit-by-hit recovery drives gated → timed and back down again, terminating each way', () => {
        // Enter gated…
        let state = easier(BOTTOM, GATABLE);
        expect(state.pacing).toBe('gated');
        // …play truly in time for a full window…
        state = exitAt(state, perfects(GATED_EXIT_WINDOW));
        expect(state.pacing).toBe('timed');
        // …struggle again: the cooldown holds for one boundary, then it may gate once more.
        expect(easier(state, GATABLE).pacing).toBe('timed');
        expect(easier({ ...state, blocksSinceGatedExit: GATED_REENTRY_COOLDOWN_BLOCKS }, GATABLE).pacing)
            .toBe('gated');
    });

    // ── the mutual-exclusion property the gated audio path relies on ───────────────────────
    it('gated pacing and the BASS density rungs can never both be active', () => {
        // They sit at opposite ends of one totally ordered scale: gating requires
        // densityStep === MIN_DENSITY_STEP, the bass rungs require step > MAX_TREBLE_DENSITY_STEP.
        // This matters concretely — useLevelGatedRubatoAudio's cello logic assumes exactly one whole
        // note per measure and would mis-trigger a busier bass line.
        for (let d = MIN_DENSITY_STEP; d <= MAX_DENSITY_STEP; d++) {
            const next = easier(rung({ bpm: FLOOR, densityStep: d, blocksSinceGatedExit: Infinity }), GATABLE);
            if (next.pacing === 'gated') expect(next.densityStep).toBe(MIN_DENSITY_STEP);
        }
        expect(MIN_DENSITY_STEP).toBeLessThanOrEqual(MAX_TREBLE_DENSITY_STEP);
    });

    it('still changes at most ONE of {bpm, densityStep, pacing} per call, gated rungs included', () => {
        const STATES = [BOTTOM, gatedState(), rung({ bpm: FLOOR, densityStep: MIN_DENSITY_STEP + 1 })];
        for (const state of STATES) {
            for (const next of [
                harder(state, GATABLE),
                easier(state, GATABLE),
                exitAt(state, perfects(GATED_EXIT_WINDOW)),
            ]) {
                const changed = ['bpm', 'densityStep', 'pacing'].filter((k) => next[k] !== state[k]);
                expect(changed.length).toBeLessThanOrEqual(1);
            }
        }
    });
});

// ── (i) the structural rule no unit test would otherwise catch ─────────────────────────────
describe('adaptiveLadder — the import direction stays ACYCLIC', () => {
    it('adaptiveTempo.js never imports adaptiveLadder (that edge would close a cycle)', () => {
        // adaptiveTempo → levels.js → adaptiveTempo is an existing (deliberate) pair; an edge from
        // adaptiveTempo INTO the ladder would make the ladder part of that cycle. ESLint's
        // import/no-cycle rule is not configured in this project, so assert it here.
        const src = fs.readFileSync(path.resolve(__dirname, '../adaptiveTempo.js'), 'utf8');
        const imports = src.match(/^import .*$/gm) || [];
        expect(imports.some((line) => line.includes('adaptiveLadder'))).toBe(false);
    });
});
