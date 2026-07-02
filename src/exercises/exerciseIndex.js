/**
 * Exercise registry (#265, epic #245) — data layer only.
 *
 * Mirrors src/songs/songIndex.js: a flat list the exercise selector (#266)
 * renders, plus one apply helper. Each exercise is a DECLARATIVE config patch
 * onto the existing generator/playback settings — no new generation logic
 * (CLAUDE.md §6b/§6c): every field below already exists on InstrumentSettings
 * or playbackConfig and flows through the shared pipeline.
 *
 * The seven entries are the six practice presets from kanban #54–#59 plus the
 * rubato ear-training exercise from epic #245 (Han 2026-07-02: seed them all).
 * The dedicated 10-melody rubato RUN with scoring is ticket #267 — here the
 * rubato exercise applies its config and switches rubato mode on, so playing
 * uses the existing wave-1 rubato (Play → input-test note mode).
 *
 * Config shape (all keys optional):
 *   bpm            — number
 *   numMeasures    — number
 *   isRubato       — bool: switch the rubato play-mode toggle
 *   treble         — patch onto trebleSettings (notePool, randomizationRule,
 *                    rhythmVariability, notesPerMeasure, smallestNoteDenom, …)
 *   playback       — patch onto playbackConfig; its randomize / oddRounds /
 *                    evenRounds sub-objects are merged, not replaced
 */

export const EXERCISES = [
    {
        id: 'scale-runs',
        title: 'Scale Runs',
        description: 'Stepwise runs through the scale — classic technique work.',
        config: {
            treble: { notePool: 'scale', randomizationRule: 'arp_group', rhythmVariability: 20, notesPerMeasure: 6, smallestNoteDenom: 8 },
            playback: { randomize: { melody: true } },
        },
    },
    {
        id: 'broken-chords',
        title: 'Broken Chords',
        description: 'Arpeggiated chord tones over the progression.',
        config: {
            treble: { notePool: 'chord', randomizationRule: 'arp_group', rhythmVariability: 10, notesPerMeasure: 4, smallestNoteDenom: 8 },
            playback: { randomize: { melody: true } },
        },
    },
    {
        id: 'dexterity',
        title: 'Dexterity',
        description: 'Fast 16th-note patterns — finger speed and evenness.',
        config: {
            treble: { notePool: 'scale', randomizationRule: 'arp_var', rhythmVariability: 0, notesPerMeasure: 8, smallestNoteDenom: 16 },
            playback: { randomize: { melody: true } },
        },
    },
    {
        id: 'syncopation',
        title: 'Syncopation',
        description: 'Off-beat rhythms with high rhythmic variability.',
        config: {
            treble: { notePool: 'scale', randomizationRule: 'arp_var', rhythmVariability: 80, notesPerMeasure: 5, smallestNoteDenom: 16 },
            playback: { randomize: { melody: true } },
        },
    },
    {
        id: 'ear-training',
        title: 'Ear Training',
        description: 'Round 1 audio only, round 2 with notes — listen first, then check.',
        config: {
            bpm: 80,
            treble: { notePool: 'chord', randomizationRule: 'uniform', rhythmVariability: 10, notesPerMeasure: 4 },
            playback: {
                repsPerMelody: 2,
                randomize: { melody: true },
                oddRounds: { treble: 1, trebleEye: false, notes: true },
                evenRounds: { treble: 1, trebleEye: true, notes: true },
            },
        },
    },
    {
        id: 'sight-reading',
        title: 'Sight-reading',
        description: 'Round 1 notes without audio, round 2 with audio — read first, then hear.',
        config: {
            treble: { notePool: 'scale', randomizationRule: 'weighted', rhythmVariability: 50, notesPerMeasure: 5 },
            playback: {
                repsPerMelody: 2,
                randomize: { melody: true },
                oddRounds: { treble: 0, trebleEye: true, notes: true },
                evenRounds: { treble: 1, trebleEye: true, notes: true },
            },
        },
    },
    {
        id: 'rubato-ear',
        title: 'Rubato Ear-training',
        description: 'Play back what you hear at your own tempo — the accompaniment follows you.',
        config: {
            bpm: 100,
            isRubato: true,
            treble: { notePool: 'scale', randomizationRule: 'uniform', rhythmVariability: 10, notesPerMeasure: 4 },
            playback: { randomize: { melody: true } },
        },
    },
];

export const getExerciseById = (id) => EXERCISES.find(e => e.id === id) || null;

/**
 * Applies an exercise's declarative config through the app's existing setters.
 * Sub-objects of the playback patch merge into the previous config so an
 * exercise only overrides what it names (same semantics as PresetPicker).
 */
export function applyExerciseConfig(exercise, {
    setPlaybackConfig, setTrebleSettings, setBpm, setNumMeasures, setIsRubato,
}) {
    const { bpm, numMeasures, isRubato, treble, playback } = exercise.config || {};
    if (bpm != null && setBpm) setBpm(bpm);
    if (numMeasures != null && setNumMeasures) setNumMeasures(numMeasures);
    // Rubato is explicitly two-state: exercises that don't declare it turn it
    // OFF, so leaving the rubato exercise never traps the user in rubato mode.
    if (setIsRubato) setIsRubato(isRubato === true);
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
