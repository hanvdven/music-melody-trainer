/**
 * Drum kit and percussion sample definitions.
 * Single source of truth for all drum-related constants shared across
 * DrumPad.jsx, playSound.js, and the Sequencer.
 */

/** All available smplr drum machine samples (for the drum pad sample selector) */
export const ALL_SAMPLES = [
    'clap/cp', 'clave/cl', 'conga-hi/hc00', 'conga-hi/hc10', 'conga-hi/hc25', 'conga-hi/hc50', 'conga-hi/hc75',
    'conga-low/lc00', 'conga-low/lc10', 'conga-low/lc25', 'conga-low/lc50', 'conga-low/lc75',
    'conga-mid/mc00', 'conga-mid/mc10', 'conga-mid/mc25', 'conga-mid/mc50', 'conga-mid/mc75',
    'cowbell/cb', 'cymbal/cy0000', 'cymbal/cy0010', 'cymbal/cy0025', 'cymbal/cy0050', 'cymbal/cy0075',
    'cymbal/cy1000', 'cymbal/cy1010', 'cymbal/cy1025', 'cymbal/cy1050', 'cymbal/cy1075',
    'cymbal/cy2500', 'cymbal/cy2510', 'cymbal/cy2525', 'cymbal/cy2550', 'cymbal/cy2575',
    'cymbal/cy5000', 'cymbal/cy5010', 'cymbal/cy5025', 'cymbal/cy5050', 'cymbal/cy5075',
    'cymbal/cy7500', 'cymbal/cy7510', 'cymbal/cy7525', 'cymbal/cy7550', 'cymbal/cy7575',
    'hihat-close/ch', 'hihat-open/oh00', 'hihat-open/oh10', 'hihat-open/oh25', 'hihat-open/oh50', 'hihat-open/oh75',
    'kick/bd0000', 'kick/bd0010', 'kick/bd0025', 'kick/bd0050', 'kick/bd0075', 'kick/bd1000', 'kick/bd1010', 'kick/bd1025', 'kick/bd1050', 'kick/bd1075',
    'kick/bd2500', 'kick/bd2510', 'kick/bd2525', 'kick/bd2550', 'kick/bd2575', 'kick/bd5000', 'kick/bd5010', 'kick/bd5025', 'kick/bd5050', 'kick/bd5075', 'kick/bd7500', 'kick/bd7510', 'kick/bd7525', 'kick/bd7550', 'kick/bd7575',
    'maraca/ma', 'mid-tom/mt00', 'mid-tom/mt10', 'mid-tom/mt25', 'mid-tom/mt50', 'mid-tom/mt75',
    'rimshot/rs', 'snare/sd0000', 'snare/sd0010', 'snare/sd0025', 'snare/sd0050', 'snare/sd0075', 'snare/sd1000', 'snare/sd1010', 'snare/sd1025', 'snare/sd1050', 'snare/sd1075',
    'snare/sd2500', 'snare/sd2510', 'snare/sd2525', 'snare/sd2550', 'snare/sd2575', 'snare/sd5000', 'snare/sd5010', 'snare/sd5025', 'snare/sd5050'
];

/** Sample categories for pad sample selection */
export const CATEGORIES = {
    KICKS: ALL_SAMPLES.filter(s => s.startsWith('kick/')),
    SNARES: ALL_SAMPLES.filter(s => s.startsWith('snare/')),
    CYMBALS: ALL_SAMPLES.filter(s => s.startsWith('cymbal/') || s.startsWith('hihat-')),
    TOMS: ALL_SAMPLES.filter(s => s.startsWith('mid-tom/')),
    PERC: ALL_SAMPLES.filter(s => s.startsWith('conga-') || ['cowbell/cb'].includes(s)),
    OTHER: ALL_SAMPLES.filter(
        s => !s.startsWith('kick/') && !s.startsWith('snare/') && !s.startsWith('cymbal/') &&
            !s.startsWith('hihat-') && !s.startsWith('mid-tom/') && !s.startsWith('conga-') &&
            !['cowbell/cb'].includes(s)
    )
};

/**
 * Valid smplr DrumMachine instrument IDs mapped from display name.
 * Only these names are accepted by smplr's DrumMachine constructor.
 * 'FreePats Percussion' uses local FLAC files via smplr's Sampler class.
 */
export const DRUM_KITS = {
    'FreePats Percussion': 'FreePats Percussion',
    'TR-808': 'TR-808',
    'Casio RZ-1': 'Casio-RZ1',
    'LM-2': 'LM-2',
    'MFB-512': 'MFB-512',
    'Roland CR-8000': 'Roland CR-8000',
};

/** Default smplr instrument ID used when none is selected */
export const DEFAULT_DRUM_KIT = 'FreePats Percussion';

/**
 * Buffer map for the local FreePats Percussion kit.
 * Keys are sample names; values are paths served from public/.
 * Used to construct a smplr Sampler instance.
 * Multiple variants per sound enable random selection in resolveNotePitch.
 */
export const LOCAL_PERCUSSION_BUFFERS = {
    // Kick (AcousticBassDrum) — HV variants
    'Kick_HV1': '/samples/Percussion/AcousticBassDrum/HV1.wav',
    'Kick_HV2': '/samples/Percussion/AcousticBassDrum/HV2.wav',
    'Kick_HV3': '/samples/Percussion/AcousticBassDrum/HV3.wav',
    'Kick_HV4': '/samples/Percussion/AcousticBassDrum/HV4.wav',
    // Snare — HV and LV variants
    'Snare_HV1': '/samples/Percussion/AcousticSnare/HV1.wav',
    'Snare_HV2': '/samples/Percussion/AcousticSnare/HV2.wav',
    'Snare_HV3': '/samples/Percussion/AcousticSnare/HV3.wav',
    'Snare_HV4': '/samples/Percussion/AcousticSnare/HV4.wav',
    'Snare_HV5': '/samples/Percussion/AcousticSnare/HV5.wav',
    'Snare_HV6': '/samples/Percussion/AcousticSnare/HV6.wav',
    'Snare_HV7': '/samples/Percussion/AcousticSnare/HV7.wav',
    'Snare_LV1': '/samples/Percussion/AcousticSnare/LV1.wav',
    'Snare_LV2': '/samples/Percussion/AcousticSnare/LV2.wav',
    // Closed Hi-Hat variants
    'Hihat_01': '/samples/Percussion/ClosedHiHat/01.wav',
    'Hihat_02': '/samples/Percussion/ClosedHiHat/02.wav',
    'Hihat_03': '/samples/Percussion/ClosedHiHat/03.wav',
    'Hihat_04': '/samples/Percussion/ClosedHiHat/04.wav',
    'Hihat_05': '/samples/Percussion/ClosedHiHat/05.wav',
    'Hihat_06': '/samples/Percussion/ClosedHiHat/06.wav',
    'Hihat_07': '/samples/Percussion/ClosedHiHat/07.wav',
    // Open Hi-Hat variants
    'OpenHihat_01': '/samples/Percussion/OpenHiHat/01.wav',
    'OpenHihat_02': '/samples/Percussion/OpenHiHat/02.wav',
    'OpenHihat_03': '/samples/Percussion/OpenHiHat/03.wav',
    'OpenHihat_04': '/samples/Percussion/OpenHiHat/04.wav',
    // Pedal Hi-Hat
    'PedalHihat_01': '/samples/Percussion/PedalHiHat/01.wav',
    // Crash Cymbal 1 variants
    'Crash1_01': '/samples/Percussion/CrashCymbal1/01.wav',
    'Crash1_02': '/samples/Percussion/CrashCymbal1/02.wav',
    // Crash Cymbal 2
    'Crash2_01': '/samples/Percussion/CrashCymbal2/01.wav',
    // China Cymbal variants
    'China_01': '/samples/Percussion/ChinaCymbal/01.wav',
    'China_02': '/samples/Percussion/ChinaCymbal/02.wav',
    'China_03': '/samples/Percussion/ChinaCymbal/03.wav',
    'China_04': '/samples/Percussion/ChinaCymbal/04.wav',
    // Ride Cymbal 1 — HV variants
    'Ride1_HV1': '/samples/Percussion/RideCymbal1/HV1.wav',
    'Ride1_HV2': '/samples/Percussion/RideCymbal1/HV2.wav',
    // Ride Cymbal 2 — HV variants
    'Ride2_HV1': '/samples/Percussion/RideCymbal2/HV1.wav',
    'Ride2_HV2': '/samples/Percussion/RideCymbal2/HV2.wav',
    // Ride Bell variants
    'RideBell_01': '/samples/Percussion/RideBell/01.wav',
    'RideBell_02': '/samples/Percussion/RideBell/02.wav',
    'RideBell_03': '/samples/Percussion/RideBell/03.wav',
    'RideBell_04': '/samples/Percussion/RideBell/04.wav',
    // Splash Cymbal variants
    'Splash_01': '/samples/Percussion/SplashCymbal/01.wav',
    'Splash_02': '/samples/Percussion/SplashCymbal/02.wav',
    'Splash_03': '/samples/Percussion/SplashCymbal/03.wav',
    // Hi Tom variants
    'TomHi_01': '/samples/Percussion/HighTom/01.wav',
    'TomHi_02': '/samples/Percussion/HighTom/02.wav',
    'TomHi_03': '/samples/Percussion/HighTom/03.wav',
    // Mid Tom variants
    'TomMid_01': '/samples/Percussion/MidTom/01.wav',
    'TomMid_02': '/samples/Percussion/MidTom/02.wav',
    'TomMid_03': '/samples/Percussion/MidTom/03.wav',
    // Low Tom variants
    'TomLow_01': '/samples/Percussion/LowTom/01.wav',
    'TomLow_02': '/samples/Percussion/LowTom/02.wav',
    // Side Stick / Rim Click variants
    'RimClick_01': '/samples/Percussion/SideStick/01.wav',
    'RimClick_02': '/samples/Percussion/SideStick/02.wav',
    'RimClick_03': '/samples/Percussion/SideStick/03.wav',
    'RimClick_04': '/samples/Percussion/SideStick/04.wav',
    // Cowbell variants
    'Cowbell_02': '/samples/Percussion/Cowbell/02.wav',
    'Cowbell_03': '/samples/Percussion/Cowbell/03.wav',
    'Cowbell_04': '/samples/Percussion/Cowbell/04.wav',
    'Cowbell_05': '/samples/Percussion/Cowbell/05.wav',
    'Cowbell_09': '/samples/Percussion/Cowbell/09.wav',
    'Cowbell_10': '/samples/Percussion/Cowbell/10.wav',
    'Cowbell_11': '/samples/Percussion/Cowbell/11.wav',
    // Hand Clap variants
    'Clap_01': '/samples/Percussion/HandClap/01_02.wav',
    'Clap_02': '/samples/Percussion/HandClap/01_03.wav',
    'Clap_03': '/samples/Percussion/HandClap/01_05.wav',
    'Clap_04': '/samples/Percussion/HandClap/01_07.wav',
    'Clap_05': '/samples/Percussion/HandClap/01_09.wav',
    'Clap_06': '/samples/Percussion/HandClap/02_02.wav',
    'Clap_07': '/samples/Percussion/HandClap/02_05.wav',
};

/**
 * Default pad → smplr sample path or MIDI note number mapping.
 * Custom mappings override these on a per-pad basis.
 */
export const DEFAULT_NOTE_MAPPING = {
    s: 'snare/sd0010',
    sg: 'snare/sd0010',   // Ghost snare — same sample, played at 70 % velocity
    sr: 37,               // Rim click — side stick MIDI note
    k: 'kick/bd0010',
    b: 'mid-tom',
    hh: 'hihat-close/ch',
    ho: 'hihat-open/oh50',
    hp: 'maraca',
    cr: 'cymbal/cy7575',
    cc: 'cymbal/cy0010',
    crt: 'cymbal/cy1000',
    cct: 'cymbal/cy1000',
    cc_bell: 'cymbal/cy7575',
    cr_bell: 'cymbal/cy7575',
    th: 'conga-hi',
    tm: 'conga-mid',
    tl: 'conga-low',
    cb: 'cowbell',
    wh: 91,
    wm: 86,
    wl: 81,
    other: 'clap/cp',
};

/**
 * Percussion pad IDs that are routed to the metronome Soundfont instrument
 * rather than the DrumMachine/Sampler, because they resolve to MIDI numbers.
 * Import this constant wherever percussion note → instrument routing is needed
 * (playMelodies.js, handleNoteClick in App.jsx, etc.) — do NOT redefine inline.
 */
export const METRONOME_NOTE_IDS = new Set(['wh', 'wm', 'wl', 'mk', 'mc']);

/**
 * Maps each percussion pad ID to its choke group.
 * When a note fires, any currently-playing note in the same group is stopped.
 * Woodblocks each have a unique group so they do NOT interrupt each other.
 * If an ID is absent, it plays freely with no choke behaviour.
 */
export const PERCUSSION_INTERRUPT_GROUP = {
    hh: 'hihat', ho: 'hihat', hp: 'hihat',
    cc: 'crash', cct: 'crash', cc_bell: 'crash',
    cr: 'ride', crt: 'ride', cr_bell: 'ride',
    s: 'snare', sg: 'snare', sr: 'snare',
    k: 'kick',
    th: 'tom_hi', tm: 'tom_mid', tl: 'tom_low',
    wh: 'woodblock_hi',
    wm: 'woodblock_mid',
    wl: 'woodblock_lo',
    cb: 'cowbell',
    other: 'clap',
};

/**
 * Default pad → smplr sample name mapping per drum kit.
 * All DrumMachine kits use smplr sample path strings (NOT MIDI numbers).
 * Sample names must exactly match the upstream dm.json manifest for each kit.
 * Woodblocks (wh/wm/wl) always use MIDI numbers — they go through the
 * metronome Soundfont instrument, not the DrumMachine.
 *
 * Sample sources (fetched at runtime by smplr):
 *   https://smpldsnds.github.io/drum-machines/{kit}/dm.json
 */
export const KIT_NOTE_MAPPINGS = {
    // Local WAV samples via smplr Sampler; woodblocks remain on metronome Soundfont.
    // Array values → resolveNotePitch picks a random element each time.
    'FreePats Percussion': {
        k: ['Kick_HV1', 'Kick_HV2', 'Kick_HV3', 'Kick_HV4'],
        s: ['Snare_HV1', 'Snare_HV2', 'Snare_HV3', 'Snare_HV4', 'Snare_HV5', 'Snare_HV6', 'Snare_HV7'],
        sg: ['Snare_LV1', 'Snare_LV2'],  // Ghost snare — low velocity only
        sr: ['RimClick_01', 'RimClick_02', 'RimClick_03', 'RimClick_04'],  // Rim click
        b: ['TomMid_01', 'TomMid_02', 'TomMid_03'],
        hh: ['Hihat_01', 'Hihat_02', 'Hihat_03', 'Hihat_04', 'Hihat_05', 'Hihat_06', 'Hihat_07'],
        ho: ['OpenHihat_01', 'OpenHihat_02', 'OpenHihat_03', 'OpenHihat_04'],
        hp: ['PedalHihat_01'],
        cr: ['Ride1_HV1', 'Ride1_HV2'],
        crt: ['Ride2_HV1', 'Ride2_HV2'],
        cc: ['Crash1_01', 'Crash1_02'],
        cct: ['Crash2_01'],
        cc_bell: ['Crash2_01'],
        cr_bell: ['RideBell_01', 'RideBell_02', 'RideBell_03', 'RideBell_04'],
        th: ['TomHi_01', 'TomHi_02', 'TomHi_03'],
        tm: ['TomMid_01', 'TomMid_02', 'TomMid_03'],
        tl: ['TomLow_01', 'TomLow_02'],
        cb: ['Cowbell_02', 'Cowbell_03', 'Cowbell_04', 'Cowbell_05', 'Cowbell_09', 'Cowbell_10', 'Cowbell_11'],
        wh: 91, wm: 86, wl: 81,
        other: ['Clap_01', 'Clap_02', 'Clap_03', 'Clap_04', 'Clap_05', 'Clap_06', 'Clap_07'],
    },

    'TR-808': { ...DEFAULT_NOTE_MAPPING },

    // 12 samples: clap clave cowbell crash hihat-closed hihat-open kick ride snare tom-1 tom-2 tom-3
    'Casio-RZ1': {
        s: 'snare', sg: 'snare', sr: 'snare', k: 'kick', b: 'tom-2',
        hh: 'hihat-closed', ho: 'hihat-open', hp: 'hihat-closed',
        cr: 'ride', cc: 'crash', crt: 'ride', cct: 'crash',
        cc_bell: 'crash', cr_bell: 'ride',
        th: 'tom-1', tm: 'tom-2', tl: 'tom-3', cb: 'cowbell',
        wh: 91, wm: 86, wl: 81,
        other: 'clap',
    },

    // 29 samples: cabasa clap conga-h/hh/l/ll/lll/m cowbell crash hhclosed/hhclosed-long/hhclosed-short
    //             hhopen kick kick-alt ride snare-h/l/m stick-h/l/m tambourine tom-h/hh/l/ll/m
    'LM-2': {
        s: 'snare-m', sg: 'snare-m', sr: 'stick-m', k: 'kick', b: 'tom-m',
        hh: 'hhclosed', ho: 'hhopen', hp: 'hhclosed-short',
        cr: 'ride', cc: 'crash', crt: 'ride', cct: 'crash',
        cc_bell: 'crash', cr_bell: 'ride',
        th: 'tom-h', tm: 'tom-m', tl: 'tom-l', cb: 'cowbell',
        wh: 91, wm: 86, wl: 81,
        other: 'clap',
    },

    // 9 samples: clap cymbal hihat-closed hihat-open kick snare tom-hi tom-low tom-mid
    'MFB-512': {
        s: 'snare', sg: 'snare', sr: 'snare', k: 'kick', b: 'tom-mid',
        hh: 'hihat-closed', ho: 'hihat-open', hp: 'hihat-closed',
        cr: 'cymbal', cc: 'cymbal', crt: 'cymbal', cct: 'cymbal',
        cc_bell: 'cymbal', cr_bell: 'cymbal',
        th: 'tom-hi', tm: 'tom-mid', tl: 'tom-low', cb: 'clap',
        wh: 91, wm: 86, wl: 81,
        other: 'clap',
    },

    // 13 samples: clap clave conga-high conga-low cowbell cymball(!) hihat-closed hihat-open
    //             kick rimshot snare tom-high tom-low
    // NOTE: upstream manifest spells cymbal as "cymball" (double-l) — must match exactly.
    'Roland CR-8000': {
        s: 'snare', sg: 'snare', sr: 'rimshot', k: 'kick', b: 'tom-high',
        hh: 'hihat-closed', ho: 'hihat-open', hp: 'hihat-closed',
        cr: 'cymball', cc: 'cymball', crt: 'cymball', cct: 'cymball',
        cc_bell: 'cymball', cr_bell: 'cymball',
        th: 'tom-high', tm: 'tom-high', tl: 'tom-low', cb: 'cowbell',
        wh: 91, wm: 86, wl: 81,
        other: 'clap',
    },
};

/**
 * All available smplr sample names per drum kit (for the per-kit sample selector).
 * TR-808 reuses ALL_SAMPLES (category/variant format).
 * All other kits use flat sample name strings exactly as they appear in the upstream dm.json.
 */
export const KIT_SAMPLES = {
    'FreePats Percussion': Object.keys(LOCAL_PERCUSSION_BUFFERS),
    'TR-808': ALL_SAMPLES,
    'Casio-RZ1': [
        'clap', 'clave', 'cowbell', 'crash', 'hihat-closed', 'hihat-open',
        'kick', 'ride', 'snare', 'tom-1', 'tom-2', 'tom-3',
    ],
    'LM-2': [
        'cabasa', 'clap', 'conga-h', 'conga-hh', 'conga-l', 'conga-ll', 'conga-lll', 'conga-m',
        'cowbell', 'crash', 'hhclosed', 'hhclosed-long', 'hhclosed-short', 'hhopen',
        'kick', 'kick-alt', 'ride',
        'snare-h', 'snare-l', 'snare-m',
        'stick-h', 'stick-l', 'stick-m',
        'tambourine',
        'tom-h', 'tom-hh', 'tom-l', 'tom-ll', 'tom-m',
    ],
    'MFB-512': [
        'clap', 'cymbal', 'hihat-closed', 'hihat-open', 'kick', 'snare',
        'tom-hi', 'tom-low', 'tom-mid',
    ],
    'Roland CR-8000': [
        'clap', 'clave', 'conga-high', 'conga-low', 'cowbell', 'cymball',
        'hihat-closed', 'hihat-open', 'kick', 'rimshot', 'snare', 'tom-high', 'tom-low',
    ],
};

/** Drum pad layout definitions used by DrumPad.jsx */
export const PADS = [
    { id: 'cc', label: 'crash', category: 'CYMBALS', color: 'var(--chromatone-percussion-crash)' },
    { id: 'cct', label: 'crash tip', category: 'CYMBALS', color: 'var(--chromatone-percussion-crash-tip)' },
    { id: 'cc_bell', label: 'crash bell', category: 'CYMBALS', color: 'var(--chromatone-percussion-crash-bell)' },
    { id: 'cr', label: 'ride', category: 'CYMBALS', color: 'var(--chromatone-percussion-ride)' },
    { id: 'crt', label: 'ride tip', category: 'CYMBALS', color: 'var(--chromatone-percussion-ride-tip)' },
    { id: 'cr_bell', label: 'ride bell', category: 'CYMBALS', color: 'var(--chromatone-percussion-ride-bell)' },
    { id: 'ho', label: 'hi-hat open', category: 'CYMBALS', color: 'var(--chromatone-percussion-hihat-open)' },
    { id: 'hh', label: 'hi-hat closed', category: 'CYMBALS', color: 'var(--chromatone-percussion-hihat-closed)' },
    { id: 'hp', label: 'hi-hat pedal', category: 'CYMBALS', color: 'var(--chromatone-percussion-hihat-pedal)' },
    { id: 'th', label: 'tom high', category: 'TOMS', color: 'var(--chromatone-percussion-tom-high)' },
    { id: 'tm', label: 'mid tom', category: 'TOMS', color: 'var(--chromatone-percussion-tom-mid)' },
    { id: 'tl', label: 'floor tom', category: 'TOMS', color: 'var(--chromatone-percussion-tom-floor)' },
    { id: 's', label: 'snare', category: 'SNARES', color: 'var(--chromatone-percussion-snare)' },
    { id: 'sr', label: 'rim click', category: 'SNARES', color: 'var(--chromatone-percussion-snare-rim)' },
    { id: 'sg', label: 'ghost snare', category: 'SNARES', color: 'var(--chromatone-percussion-snare-ghost)' },
    { id: 'k', label: 'bass drum', category: 'KICKS', color: 'var(--chromatone-percussion-kick)' },
    { id: 'wh', label: 'woodblock hi', category: 'OTHER', color: 'var(--chromatone-percussion-woodblock-hi)' },
    { id: 'wm', label: 'woodblock mid', category: 'OTHER', color: 'var(--chromatone-percussion-woodblock-mid)' },
    { id: 'wl', label: 'woodblock lo', category: 'OTHER', color: 'var(--chromatone-percussion-woodblock-lo)' },
    { id: 'cb', label: 'cowbell', category: 'PERC', color: 'var(--chromatone-percussion-cowbell)' },
    { id: 'other', label: 'other', category: 'OTHER', color: 'var(--chromatone-percussion-other)' },
];
