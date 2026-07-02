/**
 * Exercise registry (#265/#266 rework, epic #245, Han 2026-07-02).
 *
 * Han's model (chat 2026-07-02): an exercise is defined by four AXES —
 *   melodyType  — what gets generated: scales | melodies | chords
 *   input       — what the user does: read (sight, notes visible) | hear (play
 *                 back by ear, notes hidden). Pure listening was dropped.
 *   tempo       — fixed | rubato ("rubato is instelbaar via tempo")
 *   evaluation  — 'until' (tot het goed is) | 1 | 2 | 4 | 6 | 8 | ∞ — the SAME
 *                 option list as the PLAYBACK repeats setter (repsPerMelody)
 * The named exercises below are PRESETS: choosing one sets the axes (plus an
 * `extra` fine-tune patch); every axis stays individually adjustable in the
 * setter afterwards, so e.g. a "rubato scale run" = Scale Runs + tempo RUBATO.
 *
 * `configFromAxes` maps axes onto EXISTING settings only (CLAUDE.md §6b/§6c):
 * notePool/randomizationRule on trebleSettings, repsPerMelody/untilCorrect +
 * round eyes on playbackConfig, and the isRubato play-mode flag. No new
 * generation logic. START behaviour (input test 'note' mode for both inputs)
 * lives in App.handleStartExercise, not here — the registry stays data-only.
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
    // Han 2026-07-02: pure listening dropped as an input; 'hear' = play back BY
    // EAR (blind input test) — the old 'replay'.
    input: [
        { value: 'read', label: 'READ' },
        { value: 'hear', label: 'HEAR' },
    ],
    tempo: [
        { value: 'fixed', label: 'FIXED' },
        { value: 'rubato', label: 'RUBATO' },
    ],
    // Same option list as the PLAYBACK repeats setter (repsPerMelody), with
    // 'until correct' LEFTMOST (Han 2026-07-02, BadgeCheck icon — star-check
    // does not exist in the installed lucide version).
    evaluation: [
        { value: 'until', label: null, isUntil: true },
        { value: 1, label: '×1' },
        { value: 2, label: '×2' },
        { value: 4, label: '×4' },
        { value: 6, label: '×6' },
        { value: 8, label: '×8' },
        { value: Infinity, label: '∞' },
    ],
};

export const AXIS_ORDER = ['melodyType', 'input', 'tempo', 'evaluation'];
export const AXIS_LABELS = {
    melodyType: 'MELODY', input: 'INPUT', tempo: 'TEMPO', evaluation: 'REPEAT',
};

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
 * input: READ shows the notes (sight); HEAR hides them (play back by ear).
 * evaluation 'until' → repsPerMelody: Infinity + untilCorrect flag: the
 * Sequencer's repeat arithmetic stays purely numeric (Infinity already means
 * "never stop" at the iteration check); the input test reads untilCorrect to
 * regenerate only after a flawless completion. Full scoring: ticket #267.
 */
export function configFromAxes(axes) {
    const until = axes.evaluation === 'until';
    return {
        isRubato: axes.tempo === 'rubato',
        treble: { ...MELODY_TYPE_TREBLE[axes.melodyType] },
        playback: {
            repsPerMelody: until ? Infinity : axes.evaluation,
            untilCorrect: until,
            randomize: { melody: true },
            oddRounds: { treble: 1, trebleEye: true, notes: axes.input === 'read' },
            evenRounds: { treble: 1, trebleEye: true, notes: axes.input === 'read' },
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
        axes: { melodyType: 'chords', input: 'hear', tempo: 'fixed', evaluation: 2 },
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
