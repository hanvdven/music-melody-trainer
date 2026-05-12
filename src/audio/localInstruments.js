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
 * Maps the smplr instrument slug (used in InstrumentSettings) to a local
 * sample buffer map, bypassing CDN loading in useInstruments.js.
 *
 * Only woodblock is here because standard GM instruments (piano, guitar, bass)
 * load fine from the smplr CDN Soundfont. The woodblock GM soundfont is absent
 * from CDN so it uses local WAV files instead.
 */
export const LOCAL_INSTRUMENT_BUFFERS = {
    woodblock: LOCAL_WOODBLOCK_BUFFERS,
};
