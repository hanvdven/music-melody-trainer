import { stripOctave } from '../theory/noteUtils.js';
import { loadSong } from './loadSong.js';
import { updateScaleWithTonic, updateScaleWithMode } from '../theory/scaleHandler.js';

/**
 * Pure parse/resolve half of `handleLoadSong` (App.jsx) — extracted per
 * ARCHITECTURE_AUDIT.md §4 (Han 2026-06-19). This module computes EVERY value
 * that `handleLoadSong` derives from the song definition + current app scale
 * WITHOUT calling any React setter. The caller (App) is the only place that
 * applies the result via setters, so this stays a pure, testable function.
 *
 * Behaviour is byte-identical to the previous inline logic — this is a pure
 * mechanical extraction, no timing/scheduling/logic change.
 *
 * @param {object}      songDef          - Song definition from songs/definitions/*.js
 * @param {string}      difficulty        - 'easy' | 'medium' | 'hard'
 * @param {boolean}     useOriginalTonic  - true: load in the song's written key (App also
 *                                          updates the app tonic to match); false (default):
 *                                          transpose the song to the user's current tonic.
 * @param {object|null} scale             - The current app scale (for currentTonic + refScale).
 * @returns {{
 *   targetTonic: string|null,
 *   loaded: ReturnType<typeof loadSong>,
 *   refScale: object|null,
 *   tonicToSet: string|null,   // non-null only when App must call setTonic (octave-suffixed)
 * }}
 */
export function resolveLoadedSong(songDef, difficulty, useOriginalTonic = false, scale = null) {
    const currentTonic = stripOctave(scale?.tonic) ?? null;
    let targetTonic;
    // tonicToSet carries the "App must setTonic(...)" decision out of this pure
    // function. In the original inline code the useOriginalTonic branch called
    // setTonic directly; here we only COMPUTE whether/what to set and hand it back.
    let tonicToSet = null;
    if (useOriginalTonic) {
        // Load in written key; App updates the app tonic so scale/key sig aligns with the song.
        targetTonic = null;
        if (songDef.defaultTonic && currentTonic !== songDef.defaultTonic) {
            // setTonic expects a note with octave (e.g. "F4").
            tonicToSet = songDef.defaultTonic + '4';
        }
    } else {
        targetTonic = currentTonic !== songDef.defaultTonic ? currentTonic : null;
    }
    const loaded = loadSong(songDef, difficulty, targetTonic);

    // referenceScale anchors the source-key of refMelody. resolveVoice
    // modulates from refScale to the (possibly later-changed) app scale; if
    // we leave the previous referenceScale in place, modulateMelody would
    // double-transpose loaded melodies away from their intended key.
    // Build the scale synchronously here because setSelectedMode / setTonic
    // only commit on the next render — resolveVoice may need refScale
    // immediately if the user clicks "play continuous" right after load.
    const effectiveTonic = targetTonic ?? songDef.defaultTonic;
    let refScale = scale;
    if (refScale && stripOctave(refScale.tonic) !== effectiveTonic) {
        refScale = updateScaleWithTonic({ currentScale: refScale, newTonic: effectiveTonic + '4' });
    }
    if (loaded.scaleMode && refScale && (refScale.name !== loaded.scaleMode || (loaded.scaleFamily && refScale.family !== loaded.scaleFamily))) {
        refScale = updateScaleWithMode({
            currentScale: refScale,
            newFamily: loaded.scaleFamily ?? refScale.family,
            newMode: loaded.scaleMode,
        });
    }

    return { targetTonic, loaded, refScale, tonicToSet };
}
