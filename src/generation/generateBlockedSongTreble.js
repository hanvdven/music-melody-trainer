import MelodyGenerator from './melodyGenerator';
import { sliceMelodyByRange } from '../utils/melodySlice';
import { TICKS_PER_WHOLE } from '../constants/timing';
import Melody from '../model/Melody';

/**
 * Bug fix (Han 2026-08-25 UAT, "H: er wordt alleen in de eerste paar maten melodie gegenereerd" —
 * letter h "Randomized Notes", #1154): a single `MelodyGenerator` call spanning the WHOLE song (14
 * measures for Sakura) only produced notes for the first few measures — every OTHER caller in the app
 * generates a handful of measures at a time (normal continuous-play regen, the level's own JIT
 * per-block streaming in useLevelTrebleStream.js, call-response's 1-2 measure blocks); this was the
 * first call site asking it to fill a whole song at once.
 *
 * Extracted per the SAME rationale as `resolveLoadedSong.js` (ARCHITECTURE_AUDIT.md §4) — a testable
 * module beats an inline App.jsx closure.
 *
 * Fixed by matching the app's existing "generate in small chunks, concatenate" pattern (§6c) instead
 * of one oversized call: blocks of 4 measures (Han's own spec), or 2 if the song's length isn't
 * divisible by 4 — falls back to 4 regardless when neither divides evenly (the final block then just
 * gets whatever measures remain; MelodyGenerator already handles an arbitrary small measure count
 * correctly, since that's the size every other caller already uses it at). Each block gets its OWN
 * slice of the chord progression via `sliceMelodyByRange` (the same slicing utility
 * generateLevel9CallResponseBlock.js / generateLevelBackingChunk.js already use for the identical
 * reason: a block's generator call needs its chords re-offset to start at tick 0, not the whole song's
 * absolute ticks).
 *
 * @param {object} activeScale       - the Scale the melody is generated IN (post-#1153 modulation)
 * @param {number} totalMeasures     - the song's full measure count (loaded.numMeasures)
 * @param {number[]} timeSignature   - [beats, beatUnit]
 * @param {object} settings          - merged InstrumentSettings (mergedTrebleSettings in App.jsx)
 * @param {object|null} chordMelody  - the (possibly already-remodulated) full-song chord Melody, or null
 * @param {string} runIdPrefix       - unique-ish prefix for MelodyGenerator's runId per block
 * @returns {Melody}
 */
export function generateBlockedSongTreble(activeScale, totalMeasures, timeSignature, settings, chordMelody, runIdPrefix) {
    const measureLengthTicks = (TICKS_PER_WHOLE * timeSignature[0]) / timeSignature[1];
    const blockSize = totalMeasures % 4 === 0 ? 4 : (totalMeasures % 2 === 0 ? 2 : 4);
    const notes = [], durations = [], offsets = [], displayNotes = [], volumes = [], velocities = [];
    for (let start = 0; start < totalMeasures; start += blockSize) {
        const blockMeasures = Math.min(blockSize, totalMeasures - start);
        const chordSlice = chordMelody
            ? sliceMelodyByRange(chordMelody, measureLengthTicks, blockMeasures, start)
            : null;
        const blockMelody = new MelodyGenerator(
            activeScale, blockMeasures, timeSignature,
            settings, chordSlice, settings?.range ?? null,
            `${runIdPrefix}-${start}`,
        ).generateMelody();
        if (!blockMelody) continue;
        const blockOffset = start * measureLengthTicks;
        notes.push(...blockMelody.notes);
        durations.push(...blockMelody.durations);
        offsets.push(...blockMelody.offsets.map((o) => (o == null ? o : o + blockOffset)));
        displayNotes.push(...(blockMelody.displayNotes ?? blockMelody.notes));
        volumes.push(...(blockMelody.volumes ?? blockMelody.notes.map(() => 1)));
        velocities.push(...(blockMelody.velocities ?? blockMelody.notes.map(() => 100)));
    }
    return new Melody(notes, durations, offsets, displayNotes, volumes, velocities);
}
