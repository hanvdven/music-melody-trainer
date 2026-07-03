import { describe, it, expect, vi } from 'vitest';
import {
    EXERCISES, AXES, AXIS_ORDER, getExerciseById,
    configFromAxes, applyExerciseConfig,
} from '../exerciseIndex';

describe('exercise registry', () => {
    it('has the six kanban presets (#54–#59) with unique ids and complete axes', () => {
        expect(EXERCISES.length).toBe(6);
        const ids = EXERCISES.map(e => e.id);
        expect(new Set(ids).size).toBe(6);
        for (const e of EXERCISES) {
            for (const axis of AXIS_ORDER) {
                const values = AXES[axis].map(o => o.value);
                expect(values).toContain(e.axes[axis]);
            }
            expect(e.Icon).toBeTruthy(); // lucide placeholder icon (Han 2026-07-02)
            expect(e.title).toBe(e.title.toUpperCase()); // all carousel text ALL CAPS
        }
    });

    it('REPEAT axis reuses the repsPerMelody option list with until-correct LEFTMOST', () => {
        const values = AXES.evaluation.map(o => o.value);
        expect(values).toEqual(['until', 1, 2, 4, 6, 8, Infinity]);
        expect(AXES.evaluation[0].isUntil).toBe(true);
    });

    it('getExerciseById finds presets and returns null for unknown ids', () => {
        expect(getExerciseById('scale-runs')?.title).toBe('SCALE RUNS');
        expect(getExerciseById('nope')).toBeNull();
    });
});

describe('configFromAxes', () => {
    const base = { melodyType: 'scales', input: 'read', tempo: 'fixed', evaluation: 2 };

    it('maps melodyType onto existing generator fields (no new generation logic)', () => {
        expect(configFromAxes(base).treble).toEqual({ notePool: 'scale', randomizationRule: 'arp_group' });
        expect(configFromAxes({ ...base, melodyType: 'chords' }).treble.notePool).toBe('chord');
    });

    it('read shows notes, hear hides them (blind play-back)', () => {
        expect(configFromAxes(base).playback.oddRounds.notes).toBe(true);
        expect(configFromAxes({ ...base, input: 'hear' }).playback.oddRounds.notes).toBe(false);
    });

    it('tempo axis drives isRubato both ways', () => {
        expect(configFromAxes(base).isRubato).toBe(false);
        expect(configFromAxes({ ...base, tempo: 'rubato' }).isRubato).toBe(true);
    });

    it("evaluation 'until' → repsPerMelody Infinity + untilCorrect flag (Sequencer stays numeric)", () => {
        const cfg = configFromAxes({ ...base, evaluation: 'until' });
        expect(cfg.playback.repsPerMelody).toBe(Infinity);
        expect(cfg.playback.untilCorrect).toBe(true);
        const numeric = configFromAxes(base);
        expect(numeric.playback.repsPerMelody).toBe(2);
        expect(numeric.playback.untilCorrect).toBe(false);
    });
});

describe('applyExerciseConfig', () => {
    const makeSetters = () => {
        const state = {
            playbackConfig: {
                repsPerMelody: 4,
                randomize: { tonic: true, melody: false },
                oddRounds: { treble: 1, bass: 1 },
                evenRounds: { treble: 0 },
            },
            treble: { notePool: 'scale', rhythmVariability: 30 },
            bpm: 120,
            isRubato: false,
        };
        return {
            state,
            setters: {
                setPlaybackConfig: (fn) => { state.playbackConfig = fn(state.playbackConfig); },
                setTrebleSettings: (fn) => { state.treble = fn(state.treble); },
                setBpm: (v) => { state.bpm = v; },
                setNumMeasures: vi.fn(),
                setIsRubato: (v) => { state.isRubato = v; },
            },
        };
    };

    it('merges playback sub-objects instead of replacing them (PresetPicker semantics)', () => {
        const { state, setters } = makeSetters();
        applyExerciseConfig({ playback: { randomize: { melody: true }, oddRounds: { treble: 0.5 } } }, setters);
        // Named keys override…
        expect(state.playbackConfig.randomize.melody).toBe(true);
        expect(state.playbackConfig.oddRounds.treble).toBe(0.5);
        // …unnamed siblings survive.
        expect(state.playbackConfig.randomize.tonic).toBe(true);
        expect(state.playbackConfig.oddRounds.bass).toBe(1);
        expect(state.playbackConfig.repsPerMelody).toBe(4);
    });

    it('patches treble settings without dropping unnamed fields', () => {
        const { state, setters } = makeSetters();
        applyExerciseConfig({ treble: { notePool: 'chord' } }, setters);
        expect(state.treble.notePool).toBe('chord');
        expect(state.treble.rhythmVariability).toBe(30);
    });

    it('only touches isRubato when the patch names it', () => {
        const { state, setters } = makeSetters();
        state.isRubato = true;
        applyExerciseConfig({ treble: { notePool: 'chord' } }, setters);
        expect(state.isRubato).toBe(true); // extra-patches without isRubato leave it alone
        applyExerciseConfig(configFromAxes({ melodyType: 'scales', input: 'read', tempo: 'fixed', evaluation: 1 }), setters);
        expect(state.isRubato).toBe(false); // axes patches always name it
    });

    it('full preset flow: axes config then extra fine-tune', () => {
        const { state, setters } = makeSetters();
        const preset = EXERCISES.find(e => e.id === 'ear-training');
        applyExerciseConfig(configFromAxes(preset.axes), setters);
        applyExerciseConfig(preset.extra, setters);
        expect(state.treble.notePool).toBe('chord');           // axes: melodyType chords
        expect(state.treble.randomizationRule).toBe('uniform'); // extra overrides arp_group
        expect(state.playbackConfig.oddRounds.notes).toBe(false); // hear = blind
        expect(state.bpm).toBe(80);                              // extra
    });
});
