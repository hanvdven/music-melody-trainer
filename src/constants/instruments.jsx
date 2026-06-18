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

// Grouped by CATEGORY (`label` — the top-level family shown nowhere as a card, used only to
// keep the list ordered). Each item carries:
//   • `name`  — the SHORT VARIANT name shown as the carousel CARD label (e.g. 'nylon').
//   • `group` — the "family (subgroup)" string shown as the carousel BRACKET header above the
//     staff (e.g. 'strings (guitar)'). Consecutive items sharing a `group` are bracketed together.
//   • `family`/`slug` — descriptive metadata + the GM Soundfont name (the icon comes from
//     SLUG_TO_ICON below, not the family).
//
// Label split (Han 2026-06-18): previously each Strings card glued the whole taxonomy into the
// card name ('strings (guitar nylon)') while the bracket showed only the bare top-level family
// ('Strings'). Han wants the bracket to carry "family (subgroup)" — 'strings (guitar)' — and the
// CARD to carry just the variant — 'nylon'. So we split: `group` → bracket, `name` → card. WHY
// this split (Han 2026-06-18): the bracket already groups same-`group` runs, so the subgroup
// ('guitar' vs 'bass' vs 'orchestral') belongs on the bracket, leaving the card free to show only
// what distinguishes one variant from its siblings.
//
// Taxonomy (Han 2026-06-17): ONE big STRINGS category folds in the guitars/basses, the
// orchestral strings AND the harp (harp is NOT a keyboard). Categories: Keys / Strings /
// Winds / Tuned Percussion / Voice.
export const INSTRUMENT_GROUPS = [
    {
        label: 'Keys',
        items: [
            { name: 'grand', group: 'keys (piano)', slug: 'acoustic_grand_piano', family: 'keys' },
            { name: 'electric', group: 'keys (piano)', slug: 'electric_piano_1', family: 'keys' },
            { name: 'organ', group: 'keys (organ)', slug: 'church_organ', family: 'keys' },
        ],
    },
    {
        label: 'Strings',
        items: [
            { name: 'nylon', group: 'strings (guitar)', slug: 'acoustic_guitar_nylon', family: 'guitar' },
            { name: 'steel', group: 'strings (guitar)', slug: 'acoustic_guitar_steel', family: 'guitar' },
            { name: 'clean', group: 'strings (guitar)', slug: 'electric_guitar_clean', family: 'guitar' },
            { name: 'acoustic', group: 'strings (bass)', slug: 'acoustic_bass', family: 'guitar' },
            { name: 'picked', group: 'strings (bass)', slug: 'electric_bass_pick', family: 'guitar' },
            { name: 'synth', group: 'strings (bass)', slug: 'synth_bass_1', family: 'guitar' },
            { name: 'violin', group: 'strings (orchestral)', slug: 'violin', family: 'strings' },
            { name: 'cello', group: 'strings (orchestral)', slug: 'cello', family: 'strings' },
            { name: 'ensemble', group: 'strings (orchestral)', slug: 'string_ensemble_1', family: 'strings' },
            { name: 'harp', group: 'strings (orchestral)', slug: 'orchestral_harp', family: 'strings' },
        ],
    },
    {
        label: 'Winds',
        items: [
            { name: 'trumpet', group: 'winds (brass)', slug: 'trumpet', family: 'winds' },
            { name: 'horn', group: 'winds (brass)', slug: 'french_horn', family: 'winds' },
            { name: 'sax', group: 'winds (reeds)', slug: 'tenor_sax', family: 'winds' },
            { name: 'clarinet', group: 'winds (reeds)', slug: 'clarinet', family: 'winds' },
            { name: 'oboe', group: 'winds (reeds)', slug: 'oboe', family: 'winds' },
            { name: 'flute', group: 'winds (flute)', slug: 'flute', family: 'winds' },
        ],
    },
    {
        label: 'Tuned Percussion',
        items: [
            { name: 'marimba', group: 'percussion (tuned)', slug: 'marimba', family: 'percussion' },
            { name: 'vibraphone', group: 'percussion (tuned)', slug: 'vibraphone', family: 'percussion' },
        ],
    },
    {
        label: 'Voice',
        items: [
            { name: 'oohs', group: 'voice', slug: 'voice_oohs', family: 'voice' },
            { name: 'choir', group: 'voice', slug: 'choir_aahs', family: 'voice' },
        ],
    },
];

// Flat list of every instrument row, in group order. Convenient for lookups + the
// RangeControls stepper (which wants a flat options list). `groupLabel` keeps the top-level
// category (Keys/Strings/…) as descriptive metadata.
export const INSTRUMENT_LIST = INSTRUMENT_GROUPS.flatMap(g =>
    g.items.map(it => ({ ...it, groupLabel: g.label })));

// Self-sufficient display label "group — name" (e.g. "strings (guitar) — nylon"). The carousel
// CARD shows only the short `name`, but RangeControls' stepper + current-instrument label show a
// single instrument out of context, so a bare "nylon" would be ambiguous there. This combined
// label disambiguates it. (Han 2026-06-18.)
export const instrumentFullLabel = (it) => `${it.group} — ${it.name}`;

// Flat { displayLabel: slug } map — the legacy shape RangeControls relied on (it uses the KEYS as
// stepper option labels + to find the current instrument's label by slug). Keyed by the
// self-sufficient `instrumentFullLabel` so RangeControls reads unambiguously; derived from
// INSTRUMENT_GROUPS so it always tracks the grouped list (single source of truth).
export const INSTRUMENTS = Object.fromEntries(
    INSTRUMENT_LIST.map(it => [instrumentFullLabel(it), it.slug]));

// slug → self-sufficient display label (for RangeControls' current-label lookup). The carousel
// card uses the short `it.name` directly; this returns the disambiguated "group — name" form.
const LABEL_BY_SLUG = Object.fromEntries(
    INSTRUMENT_LIST.map(it => [it.slug, instrumentFullLabel(it)]));
export const instrumentNameForSlug = (slug) =>
    LABEL_BY_SLUG[slug] || 'keys (piano) — grand';

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
