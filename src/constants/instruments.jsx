// icons8 instrument PNGs (Han 2026-06-17). Bundled via Vite's import.meta.glob (?url → the
// emitted asset path) — only the icons mapped in SLUG_TO_ICON exist in src/assets, so the glob
// pulls in exactly those. Replaces the earlier lucide placeholder glyphs.
const ICON_URLS = import.meta.glob('../assets/icons8-*-100.png', { eager: true, query: '?url', import: 'default' });

// ── Playback instruments — SINGLE SOURCE OF TRUTH (Han 2026-06-16) ───────────
// Previously the curated instrument list + icon mapping lived inline in
// RangeControls.jsx. The in-staff INSTRUMENT setter (InstrumentStaffOverlay) needs
// the SAME list, GROUPED by family, so the two surfaces can never drift apart
// (§6c/§6d: one source, no parallel tables). RangeControls now imports `INSTRUMENTS`
// and `getInstrumentIcon` from here.
//
// Every `slug` is a valid General-MIDI Soundfont instrument name as smplr expects
// (the same strings already used by trebleSettings.instrument / bassSettings.instrument).
// The original 13 from RangeControls are preserved; Han asked to extend with a few
// common ones (Electric Piano, Organ, Cello, Clarinet, Oboe, French Horn, Marimba,
// Vibraphone, Acoustic Bass, Choir).
//
// ICONS are PLACEHOLDERS: the existing lucide-react family glyphs (Piano/Guitar/
// Music2/Wind/MicVocal/Drum) chosen per family, drawn next to the instrument NAME.
// The structure (one row per instrument, icon resolved by slug) is intentionally
// shaped so a future drop of real icons8 <image>s only needs `getInstrumentIcon` to
// return an <image> per slug and `ICON_ATTRIBUTION` to flip — see TODO below.

// Grouped by CATEGORY (the header shown above the carousel). Each item also carries a `family`
// (keys/guitar/strings/winds/percussion/voice) as descriptive metadata; the actual icon now
// comes from SLUG_TO_ICON below (icons8 PNGs), not the family.
//
// Taxonomy (Han 2026-06-17): ONE big STRINGS category folds in the guitars/basses, the
// orchestral strings AND the harp (harp is NOT a keyboard). Categories: Keys / Strings /
// Winds / Tuned Percussion / Voice.
export const INSTRUMENT_GROUPS = [
    {
        label: 'Keys',
        items: [
            { name: 'Piano', slug: 'acoustic_grand_piano', family: 'keys' },
            { name: 'Electric Piano', slug: 'electric_piano_1', family: 'keys' },
            { name: 'Organ', slug: 'church_organ', family: 'keys' },
        ],
    },
    {
        label: 'Strings',
        // Names carry the family in parens (Han 2026-06-17: "strings (guitar)" etc) so a single
        // visible string instrument still reads as a string even when its category bracket
        // (shown only for 2+ visible) is absent.
        items: [
            { name: 'strings (guitar nylon)', slug: 'acoustic_guitar_nylon', family: 'guitar' },
            { name: 'strings (guitar steel)', slug: 'acoustic_guitar_steel', family: 'guitar' },
            { name: 'strings (guitar clean)', slug: 'electric_guitar_clean', family: 'guitar' },
            { name: 'strings (acoustic bass)', slug: 'acoustic_bass', family: 'guitar' },
            { name: 'strings (bass picked)', slug: 'electric_bass_pick', family: 'guitar' },
            { name: 'strings (synth bass)', slug: 'synth_bass_1', family: 'guitar' },
            { name: 'strings (violin)', slug: 'violin', family: 'strings' },
            { name: 'strings (cello)', slug: 'cello', family: 'strings' },
            { name: 'strings (ensemble)', slug: 'string_ensemble_1', family: 'strings' },
            { name: 'strings (harp)', slug: 'orchestral_harp', family: 'strings' },
        ],
    },
    {
        label: 'Winds',
        items: [
            { name: 'Trumpet', slug: 'trumpet', family: 'winds' },
            { name: 'French Horn', slug: 'french_horn', family: 'winds' },
            { name: 'Saxophone', slug: 'tenor_sax', family: 'winds' },
            { name: 'Clarinet', slug: 'clarinet', family: 'winds' },
            { name: 'Oboe', slug: 'oboe', family: 'winds' },
            { name: 'Flute', slug: 'flute', family: 'winds' },
        ],
    },
    {
        label: 'Tuned Percussion',
        items: [
            { name: 'Marimba', slug: 'marimba', family: 'percussion' },
            { name: 'Vibraphone', slug: 'vibraphone', family: 'percussion' },
        ],
    },
    {
        label: 'Voice',
        items: [
            { name: 'Voice Oohs', slug: 'voice_oohs', family: 'voice' },
            { name: 'Choir', slug: 'choir_aahs', family: 'voice' },
        ],
    },
];

// Flat list of every instrument row, in group order. Convenient for lookups + the
// RangeControls stepper (which wants a flat options list).
export const INSTRUMENT_LIST = INSTRUMENT_GROUPS.flatMap(g =>
    g.items.map(it => ({ ...it, groupLabel: g.label })));

// Flat { displayName: slug } map — the legacy shape RangeControls relied on. Derived
// from INSTRUMENT_GROUPS so it always tracks the grouped list (single source of truth).
export const INSTRUMENTS = Object.fromEntries(INSTRUMENT_LIST.map(it => [it.name, it.slug]));

// slug → display name (for the setter's card label + RangeControls' current-label lookup).
const NAME_BY_SLUG = Object.fromEntries(INSTRUMENT_LIST.map(it => [it.slug, it.name]));
export const instrumentNameForSlug = (slug) => NAME_BY_SLUG[slug] || 'Piano';

// slug → icons8 icon basename. A GENUINE per-instrument lookup: icons8 ships distinct art per
// instrument, so there is no formula to derive it — this is the user-supplied "what an instrument
// looks like" data, which §6c explicitly allows as a table. Han 2026-06-17: use the ROCK MUSIC
// icon for the ELECTRIC GUITAR + ELECTRIC BASS. A few instruments map to the nearest available
// icon (acoustic bass → guitar-pick, oboe → bassoon, ensemble → classic-music, marimba →
// xylophone, vibraphone → bell-lyre, voice → microphone) — easy to retarget here.
const SLUG_TO_ICON = {
    acoustic_grand_piano: 'grand-piano',
    electric_piano_1: 'piano',
    church_organ: 'pipe-organ',
    acoustic_guitar_nylon: 'guitar',
    acoustic_guitar_steel: 'guitar-strings',
    electric_guitar_clean: 'rock-music',
    acoustic_bass: 'guitar-pick',
    electric_bass_pick: 'rock-music',
    synth_bass_1: 'electronic-music',
    violin: 'violin',
    cello: 'cello',
    string_ensemble_1: 'classic-music',
    orchestral_harp: 'harp',
    trumpet: 'trumpet',
    french_horn: 'french-horn',
    tenor_sax: 'saxophone',
    clarinet: 'clarinet',
    oboe: 'bassoon',
    flute: 'flute',
    marimba: 'xylophone',
    vibraphone: 'bell-lyre',
    voice_oohs: 'microphone',
    choir_aahs: 'choir',
};

// slug → bundled icons8 PNG URL. The icons render flat-black, so consumers apply
// `var(--instrument-icon-filter)` (invert(1) on dark themes — see App.css) so they read on any
// theme. Falls back to the grand-piano icon for an unknown slug.
export const getInstrumentIconUrl = (slug) => {
    const name = SLUG_TO_ICON[slug] || 'grand-piano';
    return ICON_URLS[`../assets/icons8-${name}-100.png`];
};

// Attribution / licence line shown while the instrument setter is open — MANDATORY for icons8's
// free licence (Han 2026-06-17: "don't forget the mandatory credits").
export const ICON_ATTRIBUTION = 'Icons by Icons8 — icons8.com';
