/**
 * Local sample overrides for instruments whose GM soundfont is absent from the
 * smplr CDN (gleitz.github.io/midi-js-soundfonts).
 *
 * As of smplr 0.20.0 all standard GM instruments — including 'woodblock' and
 * 'xylophone' — ARE available on the CDN. This file is kept as an extension
 * point for future instruments that may not be.
 *
 * To add a local override:
 *   export const LOCAL_MY_INSTRUMENT_BUFFERS = { 'C4': '/samples/...', ... };
 *   and add  myInstrument: LOCAL_MY_INSTRUMENT_BUFFERS  to LOCAL_INSTRUMENT_BUFFERS.
 */

/**
 * Maps an instrument slug (used in InstrumentSettings) to a local sample
 * buffer map, bypassing CDN loading in useInstruments.js.
 *
 * Currently empty — all instruments load from the smplr Soundfont CDN.
 */
export const LOCAL_INSTRUMENT_BUFFERS = {};
