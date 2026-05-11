/**
 * Local FLAC sample buffer maps for instruments that would otherwise require CDN access.
 *
 * Each map keys are standard note names (e.g. 'A4', 'D#3') recognised by smplr's
 * noteNameToMidi parser. smplr's Sampler automatically spreads key ranges between
 * provided samples via pitch-shifting, so sparse coverage is fine.
 *
 * Usage:
 *   import { Sampler } from 'smplr';
 *   const inst = new Sampler(context, { buffers: LOCAL_PIANO_BUFFERS, destination: dest });
 *
 * Audio paths are served by Vite's dev server (or the production build) from /public/samples/.
 */

export const LOCAL_PIANO_BUFFERS = {
    'C1':  '/samples/Piano/C1.flac',
    'B1':  '/samples/Piano/B1.flac',
    'B2':  '/samples/Piano/B2.flac',
    'D#2': '/samples/Piano/D#2.flac',
    'F#1': '/samples/Piano/F#1.flac',
    'F#2': '/samples/Piano/F#2.flac',
    'D#3': '/samples/Piano/D#3.flac',
    'F#3': '/samples/Piano/F#3.flac',
    'A3':  '/samples/Piano/A3.flac',
    'C4':  '/samples/Piano/C4.flac',
    'D#4': '/samples/Piano/D#4.flac',
    'F#4': '/samples/Piano/F#4.flac',
    'A4':  '/samples/Piano/A4.flac',
    'C5':  '/samples/Piano/C5.flac',
    'D#5': '/samples/Piano/D#5.flac',
    'F#5': '/samples/Piano/F#5.flac',
    'A5':  '/samples/Piano/A5.flac',
    'C6':  '/samples/Piano/C6.flac',
    'D#6': '/samples/Piano/D#6.flac',
    'F#6': '/samples/Piano/F#6.flac',
    'A6':  '/samples/Piano/A6.flac',
    'C7':  '/samples/Piano/C7.flac',
    'D#7': '/samples/Piano/D#7.flac',
    'F#7': '/samples/Piano/F#7.flac',
    'A7':  '/samples/Piano/A7.flac',
    'B7':  '/samples/Piano/B7.flac',
};

export const LOCAL_GUITAR_NYLON_BUFFERS = {
    'G1': '/samples/GuitarNylon/G1.flac',
    'A1': '/samples/GuitarNylon/A1.flac',
    'B1': '/samples/GuitarNylon/B1.flac',
    'D2': '/samples/GuitarNylon/D2.flac',
    'F2': '/samples/GuitarNylon/F2.flac',
    'G2': '/samples/GuitarNylon/G2.flac',
    'A3': '/samples/GuitarNylon/A3.flac',
    'B2': '/samples/GuitarNylon/B2.flac',
    'G3': '/samples/GuitarNylon/G3.flac',
    'D3': '/samples/GuitarNylon/D3.flac',
    'E3': '/samples/GuitarNylon/E3.flac',
    'B3': '/samples/GuitarNylon/B3.flac',
    'D4': '/samples/GuitarNylon/D4.flac',
    'E4': '/samples/GuitarNylon/E4.flac',
    'F4': '/samples/GuitarNylon/F4.flac',
    'G4': '/samples/GuitarNylon/G4.flac',
    'A4': '/samples/GuitarNylon/A4.flac',
    'B4': '/samples/GuitarNylon/B4.flac',
    'D5': '/samples/GuitarNylon/D5.flac',
    'E5': '/samples/GuitarNylon/E5.flac',
    'F5': '/samples/GuitarNylon/F5.flac',
    'G5': '/samples/GuitarNylon/G5.flac',
    'A5': '/samples/GuitarNylon/A5.flac',
    'B5': '/samples/GuitarNylon/B5.flac',
    'C6': '/samples/GuitarNylon/C6.flac',
};

export const LOCAL_ELECTRIC_BASS_BUFFERS = {
    'E1':  '/samples/ElectricBassFinger/E1.flac',
    'G#1': '/samples/ElectricBassFinger/G#1.flac',
    'A#1': '/samples/ElectricBassFinger/A#1.flac',
    'D2':  '/samples/ElectricBassFinger/D2.flac',
    'E2':  '/samples/ElectricBassFinger/E2.flac',
    'F2':  '/samples/ElectricBassFinger/F2.flac',
    'B2':  '/samples/ElectricBassFinger/B2.flac',
    'D#3': '/samples/ElectricBassFinger/D#3.flac',
    'F#3': '/samples/ElectricBassFinger/F#3.flac',
    'A#3': '/samples/ElectricBassFinger/A#3.flac',
    'C4':  '/samples/ElectricBassFinger/C4.flac',
    'F4':  '/samples/ElectricBassFinger/F4.flac',
};

/**
 * Woodblock / metronome sounds served locally via Cowbell WAV files.
 *
 * smplr routes woodblock notes as MIDI numbers (wl=81=A5, wm=86=D6, wh=91=G6).
 * Mapping these note names to Cowbell samples gives a usable metronome click
 * without requiring the 'woodblock' GM soundfont from CDN.
 */
export const LOCAL_WOODBLOCK_BUFFERS = {
    'A5': '/samples/Percussion/Cowbell/04.wav', // wl — low woodblock (MIDI 81)
    'D6': '/samples/Percussion/Cowbell/05.wav', // wm — mid woodblock (MIDI 86)
    'G6': '/samples/Percussion/Cowbell/10.wav', // wh — high woodblock (MIDI 91)
};

/**
 * Maps the smplr instrument slug (used in InstrumentSettings) to its local
 * FLAC buffer map.  Entries here bypass CDN loading in useInstruments.js.
 */
export const LOCAL_INSTRUMENT_BUFFERS = {
    acoustic_grand_piano:   LOCAL_PIANO_BUFFERS,
    acoustic_guitar_nylon:  LOCAL_GUITAR_NYLON_BUFFERS,
    electric_bass_pick:     LOCAL_ELECTRIC_BASS_BUFFERS,
    electric_bass_finger:   LOCAL_ELECTRIC_BASS_BUFFERS,
    woodblock:              LOCAL_WOODBLOCK_BUFFERS,
};
