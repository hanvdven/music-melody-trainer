/**
 * playInstrumentPreview — plays a short preview for an instrument selection.
 *
 * Han #163 AC2: fires on every carousel select (Q1 answer "a" — both tap-to-centre
 * and drag-settle). Two cases:
 *
 *   • Pitched (treble / bass / chords): plays the current scale at 2× speed (eighth
 *     notes via scale.toMelodyFast) through the matching smplr Soundfont instrument.
 *
 *   • Percussion: plays the hardcoded pattern [[k,hh], hh, [s,hh], hh, [k,c]] as
 *     eighth notes (duration=6 ticks each) through instruments.percussion (DrumMachine).
 *     All notes are routed via the existing playMelodies + METRONOME_NOTE_IDS check
 *     (§MEMORY: percussion routing checklist). BPM = current song BPM (Q2 answer "a").
 *
 * The function is FIRE-AND-FORGET (no return value, no state). If the audio context
 * is not running we resume it before scheduling, matching the existing app pattern
 * (MEMORY: AudioContext eager init, play handlers call resume before scheduling).
 */

import playMelodies from './playMelodies';
import Melody from '../model/Melody';

// Percussion preview pattern: [[k,hh], hh, [s,hh], hh, [k,c]] as 5 eighth-note beats.
// Notes are the standard short IDs from drumKits.js (k=kick, hh=hihat closed, s=snare, c=crash).
// NOT routed through METRONOME_NOTE_IDS (none of k/s/hh/c are woodblocks), so all go to
// instruments.percussion (DrumMachine) as per §MEMORY percussion routing checklist.
const PERC_PREVIEW_NOTES  = [['k','hh'], ['hh'], ['s','hh'], ['hh'], ['k','c']];
const PERC_PREVIEW_DURATION = 6; // eighth note in 48th-note ticks
const PERC_PREVIEW_MELODY = new Melody(
    PERC_PREVIEW_NOTES,
    new Array(5).fill(PERC_PREVIEW_DURATION),
    Array.from({ length: 5 }, (_, i) => i * PERC_PREVIEW_DURATION),
    PERC_PREVIEW_NOTES,
);

/**
 * @param {string} staff        - 'treble' | 'bass' | 'chords' | 'percussion'
 * @param {string} slug         - GM Soundfont slug (pitched) or kit id (percussion, unused)
 * @param {object} instruments  - { treble, bass, percussion, chords } smplr instances
 * @param {object} scale        - Scale instance with toMelodyFast()
 * @param {AudioContext} context
 * @param {number} bpm
 */
const playInstrumentPreview = async (staff, slug, instruments, scale, context, bpm) => {
    if (!context || !instruments) return;

    try {
        // Ensure the AudioContext is running before scheduling (MEMORY invariant).
        if (context.state !== 'running') await context.resume();

        if (staff === 'percussion') {
            // Percussion preview: fixed kit pattern through instruments.percussion.
            if (!instruments.percussion) return;
            playMelodies(
                [PERC_PREVIEW_MELODY],
                [instruments.percussion],
                context,
                bpm,
                context.currentTime,
            );
        } else {
            // Pitched preview: 2× speed scale (eighth notes) through the matching track instrument.
            // Bass staff gets a bass-octave scale (one octave lower) to match its normal range.
            let melody;
            if (staff === 'bass') {
                // generateBassScale() lowers the scale by one octave — same as the bass staff does.
                melody = scale.generateBassScale().toMelodyFast();
            } else {
                melody = scale.toMelodyFast();
            }
            // Instrument routing: treble → instruments.treble; bass → instruments.bass;
            // chords → instruments.chords. The NEWLY selected slug isn't loaded yet into the
            // instrument instance (that fires asynchronously after setSettings), so we play through
            // the CURRENT instance — the user hears the previous instrument briefly, which is fine
            // because the new one loads quickly and the next selection will sound correct.
            const instrument = staff === 'bass'
                ? instruments.bass
                : staff === 'chords'
                    ? instruments.chords
                    : instruments.treble;
            if (!instrument) return;

            playMelodies(
                [melody],
                [instrument],
                context,
                bpm,
                context.currentTime,
            );
        }
    } catch {
        // Preview is best-effort; errors are non-fatal (context may be suspended, instruments
        // may not be loaded yet). Silent fail: the user just doesn't hear the preview.
    }
};

export default playInstrumentPreview;
