/**
 * Drum kit and percussion sample definitions.
 * Single source of truth for all drum-related constants shared across
 * DrumPad.jsx, playSound.js, and the Sequencer.
 */

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

/**
 * GM-soundfont "acoustic MIDI" percussion kit identifiers (Han 2026-06-22).
 * These three names are the ones the percussion branch in useInstruments.js already
 * special-cases (`isGMKit = ['standard','electronic','jazz']`) — i.e. the dormant
 * GM-acoustic path. They are listed here as the SINGLE SOURCE for the kit catalog so the
 * carousel derives them from data, not a hardcoded inline list (§6c).
 *
 * ⚠ KNOWN GAP (Han 2026-06-22 — surfaced honestly, NOT fabricated): smplr's Soundfont set
 * (gleitz/MusyngKite + FluidR3_GM) contains NO GM percussion bank — `standard`/`jazz`/
 * `electronic` are NOT valid Soundfont instrument names, and there is also no KIT_NOTE_MAPPINGS
 * entry mapping the app's pad ids ('k','s','hh',…) to GM percussion MIDI notes for them. So these
 * kits currently CANNOT produce audio without (a) a valid GM-percussion soundfont source and
 * (b) a pad→GM-MIDI mapping table. Per CLAUDE.md §6c we do NOT invent those mappings here.
 * `PERCUSSION_KIT_CATEGORIES` therefore marks this category `available: false` so the carousel
 * can either hide it or render it disabled rather than offer silent kits. Drop a real mapping +
 * soundfont source here and flip `available` to true to enable it.
 */
export const GM_ACOUSTIC_KITS = ['standard', 'jazz', 'electronic'];

/**
 * Percussion-kit CATALOG for the in-staff percussion-kit carousel (Han 2026-06-22, Task D).
 * DERIVED from the existing kit data (DRUM_KITS) + GM_ACOUSTIC_KITS rather than a hardcoded list
 * (§6c): the FreePats entry is the local Sampler kit, the remaining DRUM_KITS entries are the
 * smplr DrumMachine kits, and GM_ACOUSTIC_KITS are the dormant GM soundfont kits.
 *
 * Each category carries:
 *   • `label`     — bracket header (display).
 *   • `icon`      — icons8 BASENAME (resolved via getIconUrlByBasename — reuses the instrument
 *                   carousel's icon path, no parallel icon system). 'drum-set' + 'drums' assets
 *                   EXIST; 'synthesizer' does NOT yet → 'electronic-music' PLACEHOLDER.
 *   • `kits`      — array of { id } where `id` is the EXACT value written to
 *                   percussionSettings.instrument (the same string useInstruments.js branches on).
 *   • `available` — false ⇒ kits in this category have no working audio path yet (see GAP above).
 *
 * The `id` strings are the canonical identifiers already used elsewhere (DRUM_KITS keys feed the
 * DrumMachine/Sampler constructors; the GM ids feed the isGMKit branch), so selecting one writes
 * the SAME value the rest of the app already understands.
 */
const DRUM_MACHINE_IDS = Object.keys(DRUM_KITS).filter(k => k !== 'FreePats Percussion');
export const PERCUSSION_KIT_CATEGORIES = [
    {
        label: 'Sampled',
        // 'drum-set' asset EXISTS (src/assets/icons8-drum-set-100.png).
        icon: 'drum-set',
        available: true,
        kits: [{ id: 'FreePats Percussion' }],
    },
    {
        label: 'Drum machines',
        // 'drums' asset EXISTS (src/assets/icons8-drums-100.png).
        icon: 'drums',
        available: true,
        // Derived from DRUM_KITS (all keys except the local FreePats sampler) so a new DrumMachine
        // kit added to DRUM_KITS appears automatically (§6c — no second list to keep in sync).
        kits: DRUM_MACHINE_IDS.map(id => ({ id })),
    },
    {
        label: 'Acoustic MIDI',
        // PLACEHOLDER — TODO(icons8): drop src/assets/icons8-synthesizer-100.png, then change this
        // basename to 'synthesizer'. (Han 2026-06-22: "Synthesizer=midis".) Mirrors how
        // instruments.jsx flags its placeholder synth icons.
        icon: 'electronic-music',
        // ⚠ DISABLED — no working GM-percussion audio path exists yet (see GM_ACOUSTIC_KITS GAP).
        // The carousel skips unavailable categories; flip to true once a soundfont source + a
        // pad→GM-MIDI mapping are added (do NOT fabricate them — §6c).
        available: false,
        kits: GM_ACOUSTIC_KITS.map(id => ({ id })),
    },
];

/**
 * Kit id → SHORT carousel CARD label (Han 2026-06-22). The carousel card shows this; the category
 * bracket shows the category label. Defaults to the id itself for kits without a nicer short name
 * (so a newly-added DrumMachine kit still gets a sensible card label automatically). No Unicode
 * accidentals occur in any current kit id, but if one ever did it would already be Unicode here
 * since these are display strings (§5b).
 */
const PERCUSSION_KIT_LABELS = {
    'FreePats Percussion': 'samples',
    standard: 'standard',
    jazz: 'jazz',
    electronic: 'electronic',
};
export const percussionKitLabel = (id) => PERCUSSION_KIT_LABELS[id] || id;

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
 * Display ordering for the range-selector percussion row (Han 2026-05-30).
 * Ordered per instrument family (kick → snare → toms → hi-hat → ride → crash →
 * other); within each family the BASE pad comes first, followed by its variants.
 * Robust to future additions: append a new pad id to the relevant family array
 * and it appears automatically (the renderer filters to pads that have a staff
 * position). Keep in sync with PERCUSSION_INTERRUPT_GROUP base/variant grouping.
 */
// Not exported: only consumed within this module (Han 2026-06-19).
const PERCUSSION_DISPLAY_FAMILIES = [
    ['k'],                              // kick
    ['s', 'sg', 'sr'],                  // snare: base, ghost, rim
    ['hh', 'ho'],                       // hi-hat: closed, open
    ['hp'],                             // hi-hat pedal (Han 2026-05-31: own slot after hi-hat)
    ['cc', 'cct', 'cc_bell'],           // crash: base, tip, bell
    ['cr', 'crt', 'cr_bell'],           // ride: base, tip, bell
    ['th', 'tm', 'tl'],                 // toms: high → low
    ['cb', 'wh', 'wm', 'wl', 'other'],  // rest: high → low pitch
];
// Not exported: only consumed within this module (Han 2026-06-19).
const PERCUSSION_DISPLAY_ORDER = PERCUSSION_DISPLAY_FAMILIES.flat();

/**
 * Percussion "range" presets (Han 2026-05-30) — the pad pool each preset selects.
 * basic = core 3-piece kit; standard adds crash, ride and floor tom; full = every
 * pad. Variants (open/pedal hi-hat, ghost/rim snare, cymbal tips/bells) only
 * appear in 'full'. FULL is derived from the display order so it stays complete
 * as new pads are added.
 */
export const PERCUSSION_PRESETS = {
    BASIC: ['k', 's', 'hh'],
    // Han 2026-06-01: open hi-hat (ho) added to the middle preset (Han calls it
    // "large"; percussion's middle tier is STANDARD).
    STANDARD: ['k', 's', 'hh', 'ho', 'cc', 'cr', 'tl'],
    FULL: PERCUSSION_DISPLAY_ORDER,
};

/**
 * Display order helper: the family-grouped percussion ids as a flat array.
 * Exposed as a function so callers don't depend on array identity.
 */
export const orderedPercussionPads = () => PERCUSSION_DISPLAY_ORDER;

/**
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

