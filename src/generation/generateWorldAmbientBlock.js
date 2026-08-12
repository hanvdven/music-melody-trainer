import Scale from '../model/Scale';
import ChordProgression from '../model/ChordProgression';
import InstrumentSettings from '../model/InstrumentSettings';
import { generateProgression } from '../theory/chordGenerator';
import MelodyGenerator from './melodyGenerator';
import { WORLD_BPM, WORLD_TIME_SIGNATURE } from '../audio/worldClock';

// #924 (Han 2026-08-12, "wereldlevel: speel op de achtergrond zachtjes random generated muziek met een
// fluit (treble melody) en een acoustic_bass in de bas. bpm 100, numrepeats 1, nummeasures 2, c majeur,
// geef een kans van 2 op 3 dat de melodie stil is"): PURE generation (no React, no Sequencer/Song — mirrors
// generateLevelBackingChunk.js's "pure generation" boundary, §8) for the open-world tab's ambient
// background music. Reuses the SAME generation pipeline classes every other track in the app uses
// (MelodyGenerator, theory/chordGenerator's generateProgression, docs/architecture.md §3) — per Han's own
// choice ("hergebruik de hoofd-pipeline") — but with this feature's OWN fixed parameters, independent of
// whatever InstrumentSettings/key the user's actual practice session has active.
// #924 round 4 ("alles op een klok... is die uberhaupt hetzelfde tempo?"): bpm/timeSignature are now
// re-exported straight from worldClock.js — the ONE canonical "what tempo is the open world" constant,
// also used by useDebugMetronome.js and the wisp/slime conversation (RpgLevelBottomPanel.jsx) — instead of
// a second, independently-defined 100bpm copy that could silently drift out of sync with those.
export const WORLD_AMBIENT_BPM = WORLD_BPM;
export const WORLD_AMBIENT_TIME_SIGNATURE = WORLD_TIME_SIGNATURE;
export const WORLD_AMBIENT_NUM_MEASURES = 2;
export const WORLD_AMBIENT_SILENCE_CHANCE = 2 / 3;

// #924 round 4 (Han: "ik nog steeds maar weinig melodie. zet die maar even op piano-instrument, en zelfde
// volume als de vogels"): both treble and bass switched to piano while diagnosing audibility — was
// flute/acoustic_bass. Own dedicated Soundfont instances either way (useWorldAmbientMusic.js), never the
// user's own configured treble/bass instrument.
export const WORLD_AMBIENT_TREBLE_SETTINGS = new InstrumentSettings(
    'acoustic_grand_piano', 'treble', 3, 8, 40, 'scale', 'uniform', null, true, { min: 'C4', max: 'C6' }, 'treble', 'fixed', 'C', 12,
);
export const WORLD_AMBIENT_BASS_SETTINGS = new InstrumentSettings(
    'acoustic_grand_piano', 'bass', 2, 4, 20, 'chord', 'emphasize_roots', null, true, { min: 'C2', max: 'C4' }, 'bass', 'fixed', 'C', 12,
);

// Generates ONE ambient block. Treble and bass each roll their OWN independent 2/3 silence chance (Han,
// round 3: "ik verwacht dat ongeveer 50% van de tijd op z'n minst bas melody en/of treble melodie speelt
// (5/9 kans dat ten minste een van beide speelt...)" — that 5/9 figure only comes out of two INDEPENDENT
// 1/3-chance-to-play rolls: 1 - (2/3 × 2/3) = 5/9. A single shared roll for the whole block (the original
// implementation) would have given only 1/3, not 5/9.
export function generateWorldAmbientBlock({ runId = `world-amb-${Date.now()}`, rand = Math.random } = {}) {
    const trebleSilent = rand() < WORLD_AMBIENT_SILENCE_CHANCE;
    const bassSilent = rand() < WORLD_AMBIENT_SILENCE_CHANCE;
    if (trebleSilent && bassSilent) return { treble: null, bass: null };

    const scale = Scale.defaultScale();   // C major (Han: "c majeur")
    const chords = generateProgression(scale, WORLD_AMBIENT_NUM_MEASURES, 'random', 'triad');
    const chordProgression = new ChordProgression(chords, 'triad', 'random', 'modal');

    const treble = trebleSilent ? null : new MelodyGenerator(
        scale, WORLD_AMBIENT_NUM_MEASURES, WORLD_AMBIENT_TIME_SIGNATURE, WORLD_AMBIENT_TREBLE_SETTINGS,
        chordProgression, WORLD_AMBIENT_TREBLE_SETTINGS.range, `${runId}-treble`,
    ).generateMelody();
    const bass = bassSilent ? null : new MelodyGenerator(
        scale.generateBassScale(), WORLD_AMBIENT_NUM_MEASURES, WORLD_AMBIENT_TIME_SIGNATURE, WORLD_AMBIENT_BASS_SETTINGS,
        chordProgression, WORLD_AMBIENT_BASS_SETTINGS.range, `${runId}-bass`,
    ).generateMelody();

    return { treble, bass };
}
