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
//   • `group` — the string shown as the carousel BRACKET header above the staff. Consecutive items
//     sharing a `group` are bracketed together. NOTE (Han 2026-06-22): with the re-categorisation
//     below, `group` is now simply the bare TOP category (e.g. 'guitars', 'bass guitars') rather
//     than the old "family (subgroup)" form ('strings (guitar)') described in the 2026-06-18 note.
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
//
// Re-categorisation (Han 2026-06-22): split the old mega-STRINGS into separate TOP categories so
// the carousel brackets read by instrument-family the way a player thinks of them. New top
// categories (each is both an INSTRUMENT_GROUPS .label AND the per-item bracket `group`/`family`):
//   keys / guitars / bass guitars / strings / wind / percussion tuned / voice / synth.
// WHY split (Han 2026-06-22): guitars, bass guitars, orchestral strings and synths are distinct
// mental categories — folding them under one "strings" bracket made the carousel header lie about
// what the player was scrolling through. Each item's `group`/`family` now equals its top category
// so the bracket header (which groups consecutive same-`group` runs) shows the real family.
// Every slug remains a standard GM Soundfont name (loadable directly by smplr).
export const INSTRUMENT_GROUPS = [
    {
        label: 'keys',
        items: [
            { name: 'grand piano', group: 'keys', slug: 'acoustic_grand_piano', family: 'keys' },
            { name: 'e-piano', group: 'keys', slug: 'electric_piano_1', family: 'keys' },
            { name: 'organ', group: 'keys', slug: 'church_organ', family: 'keys' },
            // accordion: GM slug 'accordion' loads fine; icon is a PLACEHOLDER until Han drops the
            // real asset (see SLUG_TO_ICON). (Han 2026-06-22)
            { name: 'accordion', group: 'keys', slug: 'accordion', family: 'keys' },
        ],
    },
    {
        // GUITARS is now its own top category, separate from bass guitars + orchestral strings
        // (Han 2026-06-22).
        label: 'guitars',
        items: [
            { name: 'nylon', group: 'guitars', slug: 'acoustic_guitar_nylon', family: 'guitars' },
            // steel reuses the same plain 'guitar' icon as nylon — per Han 2026-06-22.
            { name: 'steel', group: 'guitars', slug: 'acoustic_guitar_steel', family: 'guitars' },
            { name: 'electric', group: 'guitars', slug: 'electric_guitar_clean', family: 'guitars' },
            // distorted reuses the same 'rock-music' icon as electric — per Han 2026-06-22.
            { name: 'distorted', group: 'guitars', slug: 'distortion_guitar', family: 'guitars' },
        ],
    },
    {
        // BASS GUITARS split out from guitars + strings (Han 2026-06-22).
        label: 'bass guitars',
        items: [
            // acoustic bass uses the plain nylon 'guitar' icon — per Han 2026-06-22.
            { name: 'acoustic', group: 'bass guitars', slug: 'acoustic_bass', family: 'bass guitars' },
            { name: 'electric', group: 'bass guitars', slug: 'electric_bass_pick', family: 'bass guitars' },
            { name: 'synth', group: 'bass guitars', slug: 'synth_bass_1', family: 'bass guitars' },
        ],
    },
    {
        // Orchestral STRINGS — now distinct from guitars/basses (Han 2026-06-22). Harp stays here
        // (Han didn't ask to remove it).
        label: 'strings',
        items: [
            { name: 'violin', group: 'strings', slug: 'violin', family: 'strings' },
            { name: 'cello', group: 'strings', slug: 'cello', family: 'strings' },
            { name: 'ensemble', group: 'strings', slug: 'string_ensemble_1', family: 'strings' },
            { name: 'contrabass', group: 'strings', slug: 'contrabass', family: 'strings' },
            { name: 'harp', group: 'strings', slug: 'orchestral_harp', family: 'strings' },
        ],
    },
    {
        // 'wind' (singular) per Han's target naming 2026-06-22.
        label: 'wind',
        items: [
            { name: 'trumpet', group: 'wind', slug: 'trumpet', family: 'wind' },
            { name: 'horn', group: 'wind', slug: 'french_horn', family: 'wind' },
            { name: 'sax', group: 'wind', slug: 'tenor_sax', family: 'wind' },
            { name: 'clarinet', group: 'wind', slug: 'clarinet', family: 'wind' },
            { name: 'oboe', group: 'wind', slug: 'oboe', family: 'wind' },
            { name: 'flute', group: 'wind', slug: 'flute', family: 'wind' },
            { name: 'harmonica', group: 'wind', slug: 'harmonica', family: 'wind' },
        ],
    },
    {
        // 'percussion tuned' per Han's target naming 2026-06-22. Added xylophone (Han wanted it
        // back as a distinct entry alongside marimba + vibraphone).
        label: 'percussion tuned',
        items: [
            { name: 'marimba', group: 'percussion tuned', slug: 'marimba', family: 'percussion tuned' },
            { name: 'vibraphone', group: 'percussion tuned', slug: 'vibraphone', family: 'percussion tuned' },
            { name: 'xylophone', group: 'percussion tuned', slug: 'xylophone', family: 'percussion tuned' },
        ],
    },
    {
        label: 'voice',
        items: [
            { name: 'oohs', group: 'voice', slug: 'voice_oohs', family: 'voice' },
            { name: 'choir', group: 'voice', slug: 'choir_aahs', family: 'voice' },
        ],
    },
    {
        // NEW category SYNTH (Han 2026-06-22). All three slugs are standard GM synth-lead/pad
        // names; icons are PLACEHOLDERS until a real synthesizer asset is dropped.
        label: 'synth',
        items: [
            { name: 'square', group: 'synth', slug: 'lead_1_square', family: 'synth' },
            { name: 'lead', group: 'synth', slug: 'lead_2_sawtooth', family: 'synth' },
            { name: 'pad', group: 'synth', slug: 'pad_1_new_age', family: 'synth' },
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
    LABEL_BY_SLUG[slug] || 'keys — grand piano'; // fallback label tracks the re-categorised default (Han 2026-06-22)

// slug → icons8 icon basename. A GENUINE per-instrument lookup: icons8 ships distinct art per
// instrument, so there is no formula to derive it — this is the user-supplied "what an instrument
// looks like" data, which §6c explicitly allows as a table. Han 2026-06-17: use the ROCK MUSIC
// icon for the ELECTRIC GUITAR + ELECTRIC BASS. A few instruments map to the nearest available
// icon (acoustic bass → guitar-pick, oboe → bassoon, ensemble → classic-music, marimba →
// xylophone, vibraphone → bell-lyre, voice → microphone) — easy to retarget here.
//
// Re-icon pass (Han 2026-06-22): only 22 icons8 basenames exist in src/assets (bassoon, bell-lyre,
// cello, choir, clarinet, classic-music, electronic-music, flute, french-horn, grand-piano, guitar,
// guitar-pick, guitar-strings, harp, microphone, piano, pipe-organ, rock-music, saxophone, trumpet,
// violin, xylophone). Five new instruments have NO matching asset yet (accordion, ensemble/stage,
// contrabass, harmonica, synth leads/pad) — each maps to the nearest available PLACEHOLDER below,
// tagged `TODO(icons8)` with the real filename Han should drop into src/assets. When that asset
// lands, just change the basename here (the glob in ICON_URLS auto-bundles any icons8-*-100.png).
// Per Han 2026-06-22: steel reuses nylon's plain 'guitar'; distorted reuses electric's 'rock-music';
// acoustic bass uses nylon's 'guitar'; vibraphone + xylophone use 'xylophone'; oohs + choir use 'choir'.
const SLUG_TO_ICON = {
    // keys
    acoustic_grand_piano: 'grand-piano',
    electric_piano_1: 'piano',
    church_organ: 'pipe-organ',
    accordion: 'accordion',             // real asset restored from origin/main (Han 2026-06-22)
    // guitars
    acoustic_guitar_nylon: 'guitar',
    acoustic_guitar_steel: 'guitar',    // Han 2026-06-22: same icon as nylon
    electric_guitar_clean: 'rock-music',
    distortion_guitar: 'rock-music',    // Han 2026-06-22: same icon as electric
    // bass guitars
    acoustic_bass: 'guitar',            // Han 2026-06-22: use nylon's plain guitar icon
    electric_bass_pick: 'rock-music',
    synth_bass_1: 'electronic-music',
    // strings
    violin: 'violin',
    cello: 'cello',
    string_ensemble_1: 'classic-music', // PLACEHOLDER — TODO(icons8): "Stage" asset icons8-stage-100.png (Han wants a Stage icon)
    contrabass: 'cello',                // PLACEHOLDER — TODO(icons8): real contrabass asset icons8-contrabass-100.png
    orchestral_harp: 'harp',
    // wind
    trumpet: 'trumpet',
    french_horn: 'french-horn',
    tenor_sax: 'saxophone',
    clarinet: 'clarinet',
    oboe: 'bassoon',
    flute: 'flute',
    harmonica: 'harmonica',             // real asset restored from origin/main (Han 2026-06-22)
    // percussion tuned
    marimba: 'xylophone',
    vibraphone: 'xylophone',            // Han 2026-06-22: use xylophone icon
    xylophone: 'xylophone',
    // voice
    voice_oohs: 'choir',                // Han 2026-06-22: both voice items use the choir icon
    choir_aahs: 'choir',
    // synth (NEW category, Han 2026-06-22) — all three share the synthesizer placeholder
    lead_1_square: 'electronic-music',  // PLACEHOLDER — TODO(icons8): real synth asset icons8-synthesizer-100.png
    lead_2_sawtooth: 'electronic-music', // PLACEHOLDER — TODO(icons8): real synth asset icons8-synthesizer-100.png
    pad_1_new_age: 'electronic-music',  // PLACEHOLDER — TODO(icons8): real synth asset icons8-synthesizer-100.png
};

// icons8 basename → bundled PNG URL. The single low-level swap point: every icon consumer
// resolves through this so they share ONE glob + path convention (§6c/§6d — no parallel icon
// system). `getInstrumentIconUrl` (slug→basename via SLUG_TO_ICON) and the percussion-kit
// carousel (kit→basename via KIT_TO_ICON in drumKits.js) both funnel through here. Falls back to
// the grand-piano icon for an unknown basename. Exported so the kit carousel can reuse it.
export const getIconUrlByBasename = (basename) =>
    ICON_URLS[`../assets/icons8-${basename}-100.png`] || ICON_URLS['../assets/icons8-grand-piano-100.png'];

// slug → bundled icons8 PNG URL. The icons render flat-black, so consumers apply
// `var(--instrument-icon-filter)` (invert(1) on dark themes — see App.css) so they read on any
// theme. Falls back to the grand-piano icon for an unknown slug.
export const getInstrumentIconUrl = (slug) =>
    getIconUrlByBasename(SLUG_TO_ICON[slug] || 'grand-piano');

// CATEGORY → theme-aware CSS custom property (Han 2026-06-22, Task B). Each top category gets a
// SUBTLE colour for its carousel CARD label + its bracket, keyed on the instrument's top category.
// §6c: this maps the category STRING (read straight off the instrument object's `family`/`group`,
// which the 2026-06-22 re-categorisation made equal to the top category) to the matching CSS var —
// it is NOT a slug→colour table. The CSS vars live in App.css (one per category, light + dark).
// New categories only need: (1) a new `--cat-*` block in App.css, (2) one entry here.
const CATEGORY_CSS_VAR = {
    'keys': '--cat-keys',
    'guitars': '--cat-guitars',
    'bass guitars': '--cat-bass-guitars',
    'strings': '--cat-strings',
    'wind': '--cat-wind',
    'percussion tuned': '--cat-percussion-tuned',
    'voice': '--cat-voice',
    'synth': '--cat-synth',
};

// Resolve a category string → `var(--cat-…)` colour expression (falls back to --text-primary for
// an unknown/percussion category so callers can always use the return value directly as a `fill`/
// `stroke`). `fallback` lets a caller supply its own at-rest colour (e.g. --text-lowlight for the
// non-active carousel cards) when the category has no dedicated var.
export const categoryColorVar = (category, fallback = 'var(--text-primary)') => {
    const v = CATEGORY_CSS_VAR[category];
    return v ? `var(${v})` : fallback;
};

// Attribution / licence line shown while the instrument setter is open — MANDATORY for icons8's
// free licence (Han 2026-06-17: "don't forget the mandatory credits").
export const ICON_ATTRIBUTION = 'Icons by Icons8 — icons8.com';
