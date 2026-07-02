/**
 * Exercise registry (#265/#266 rework, epic #245, Han 2026-07-02).
 *
 * Han's model (chat 2026-07-02): an exercise is defined by four AXES —
 *   melodyType  — what gets generated: scales | melodies | chords
 *   input       — what the user does:  read (sight) | hear (listen) | replay (play back)
 *   tempo       — fixed | rubato ("rubato is instelbaar via tempo")
 *   evaluation  — 'until' (tot het goed is) | 1 | 2 | 4 (repeat count)
 * The named exercises below are PRESETS: choosing one sets the axes (plus an
 * `extra` fine-tune patch); every axis stays individually adjustable in the
 * setter afterwards, so e.g. a "rubato scale run" = Scale Runs + tempo RUBATO.
 *
 * `configFromAxes` maps axes onto EXISTING settings only (CLAUDE.md §6b/§6c):
 * notePool/randomizationRule on trebleSettings, repsPerMelody + round eyes on
 * playbackConfig, and the isRubato play-mode flag. No new generation logic.
 * START behaviour (hear → continuous playback, read/replay → input test) lives
 * in App.handleStartExercise, not here — the registry stays data-only.
 */
import {
    AudioLines, Layers, Zap, Activity, Ear, BookOpenCheck,
} from 'lucide-react';

// ── Axis vocabularies (order = display order in the setter rows) ────────────
export const AXES = {
    melodyType: [
        { value: 'scales', label: 'SCALES' },
        { value: 'melodies', label: 'MELODIES' },
        { value: 'chords', label: 'CHORDS' },
    ],
    input: [
        { value: 'read', label: 'READ' },
        { value: 'hear', label: 'HEAR' },
        { value: 'replay', label: 'REPLAY' },
    ],
    tempo: [
        { value: 'fixed', label: 'FIXED' },
        { value: 'rubato', label: 'RUBATO' },
    ],
    evaluation: [
        { value: 'until', label: 'UNTIL CORRECT' },
        { value: 1, label: '×1' },
        { value: 2, label: '×2' },
        { value: 4, label: '×4' },
    ],
};

export const AXIS_ORDER = ['melodyType', 'input', 'tempo', 'evaluation'];
export const AXIS_LABELS = {
    melodyType: 'MELODY', input: 'INPUT', tempo: 'TEMPO', evaluation: 'REPEAT',
};

/**
 * Axis-combination constraints (v1): listening can be neither rubato (the
 * accompaniment follows YOUR playing — there is nothing to follow when only
 * listening) nor "until correct" (nothing is evaluated). Returns a corrected
 * copy rather than rejecting, so the UI can simply apply and re-render.
 */
export function normalizeAxes(axes) {
    const next = { ...axes };
    if (next.input === 'hear') {
        if (next.tempo === 'rubato') next.tempo = 'fixed';
        if (next.evaluation === 'until') next.evaluation = 2;
    }
    return next;
}

// Which options are selectable given the other axes — the setter dims the rest.
export function isAxisOptionEnabled(axes, axis, value) {
    if (axes.input === 'hear' && axis === 'tempo' && value === 'rubato') return false;
    if (axes.input === 'hear' && axis === 'evaluation' && value === 'until') return false;
    return true;
}

// melodyType → generator settings. 'melodies' = free weighted melody;
// 'scales' = stepwise runs (arp_group walks the pool in lines);
// 'chords' = chord-tone material.
const MELODY_TYPE_TREBLE = {
    scales: { notePool: 'scale', randomizationRule: 'arp_group' },
    melodies: { notePool: 'scale', randomizationRule: 'weighted' },
    chords: { notePool: 'chord', randomizationRule: 'arp_group' },
};

/**
 * Axes → declarative config patch (same shape applyExerciseConfig consumes).
 * input: READ shows notes; REPLAY hides them (play by ear — blind mode);
 * HEAR keeps notes visible while listening.
 */
export function configFromAxes(rawAxes) {
    const axes = normalizeAxes(rawAxes);
    const reps = axes.evaluation === 'until' ? 2 : axes.evaluation;
    return {
        isRubato: axes.tempo === 'rubato',
        treble: { ...MELODY_TYPE_TREBLE[axes.melodyType] },
        playback: {
            repsPerMelody: reps,
            randomize: { melody: true },
            oddRounds: { treble: axes.input === 'read' ? 0 : 1, trebleEye: true, notes: axes.input !== 'replay' },
            evenRounds: { treble: 1, trebleEye: true, notes: axes.input !== 'replay' },
        },
    };
}

// ── Presets (kanban #54–#59). Each = axes + a fine-tune `extra` patch. ──────
// Icons are lucide placeholders (Han 2026-07-02: "gebruik voorlopig lucide
// placeholder icons").
export const EXERCISES = [
    {
        id: 'scale-runs',
        title: 'SCALE RUNS',
        description: 'Stepwise runs through the scale — classic technique work.',
        Icon: AudioLines,
        axes: { melodyType: 'scales', input: 'read', tempo: 'fixed', evaluation: 1 },
        extra: { treble: { rhythmVariability: 20, notesPerMeasure: 6, smallestNoteDenom: 8 } },
    },
    {
        id: 'broken-chords',
        title: 'BROKEN CHORDS',
        description: 'Arpeggiated chord tones over the progression.',
        Icon: Layers,
        axes: { melodyType: 'chords', input: 'read', tempo: 'fixed', evaluation: 1 },
        extra: { treble: { rhythmVariability: 10, notesPerMeasure: 4, smallestNoteDenom: 8 } },
    },
    {
        id: 'dexterity',
        title: 'DEXTERITY',
        description: 'Fast 16th-note patterns — finger speed and evenness.',
        Icon: Zap,
        axes: { melodyType: 'scales', input: 'read', tempo: 'fixed', evaluation: 1 },
        extra: { treble: { randomizationRule: 'arp_var', rhythmVariability: 0, notesPerMeasure: 8, smallestNoteDenom: 16 } },
    },
    {
        id: 'syncopation',
        title: 'SYNCOPATION',
        description: 'Off-beat rhythms with high rhythmic variability.',
        Icon: Activity,
        axes: { melodyType: 'melodies', input: 'read', tempo: 'fixed', evaluation: 1 },
        extra: { treble: { randomizationRule: 'arp_var', rhythmVariability: 80, notesPerMeasure: 5, smallestNoteDenom: 16 } },
    },
    {
        id: 'ear-training',
        title: 'EAR TRAINING',
        description: 'Hear it, then play it back by ear.',
        Icon: Ear,
        axes: { melodyType: 'chords', input: 'replay', tempo: 'fixed', evaluation: 2 },
        extra: { bpm: 80, treble: { randomizationRule: 'uniform', rhythmVariability: 10, notesPerMeasure: 4 } },
    },
    {
        id: 'sight-reading',
        title: 'SIGHT-READING',
        description: 'Read the notes and play them at tempo.',
        Icon: BookOpenCheck,
        axes: { melodyType: 'melodies', input: 'read', tempo: 'fixed', evaluation: 2 },
        extra: { treble: { rhythmVariability: 50, notesPerMeasure: 5 } },
    },
];

export const getExerciseById = (id) => EXERCISES.find(e => e.id === id) || null;

/**
 * Applies a declarative config patch (from configFromAxes and/or a preset's
 * `extra`) through the app's existing setters. Sub-objects of the playback
 * patch merge into the previous config so a patch only overrides what it
 * names (same semantics as PresetPicker).
 */
export function applyExerciseConfig(config, {
    setPlaybackConfig, setTrebleSettings, setBpm, setNumMeasures, setIsRubato,
}) {
    const { bpm, numMeasures, isRubato, treble, playback } = config || {};
    if (bpm != null && setBpm) setBpm(bpm);
    if (numMeasures != null && setNumMeasures) setNumMeasures(numMeasures);
    // Rubato is explicitly two-state when the patch names it: axes patches
    // always name it, so leaving a rubato exercise never traps the user in
    // rubato mode.
    if (isRubato != null && setIsRubato) setIsRubato(isRubato === true);
    if (treble && setTrebleSettings) {
        setTrebleSettings(prev => ({ ...prev, ...treble }));
    }
    if (playback && setPlaybackConfig) {
        setPlaybackConfig(prev => ({
            ...prev,
            ...playback,
            randomize: { ...prev.randomize, ...(playback.randomize || {}) },
            oddRounds: { ...prev.oddRounds, ...(playback.oddRounds || {}) },
            evenRounds: { ...prev.evenRounds, ...(playback.evenRounds || {}) },
        }));
    }
}
