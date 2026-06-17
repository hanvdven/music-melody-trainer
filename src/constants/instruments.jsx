import React from 'react';
import { Piano, Guitar, Music2, Wind, MicVocal, Drum } from 'lucide-react';

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

// Grouped by CATEGORY (the header shown above the carousel). Each item carries its own
// `family` = the lucide glyph key used by getInstrumentIcon, so the icon is DERIVED per
// item (§6c) — this lets the STRINGS category hold both guitar-glyph and string-glyph
// instruments without a per-instrument icon table.
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

// slug → lucide family glyph key. Derived from the group a slug belongs to so there is
// no per-instrument icon table (§6c). Falls back to a generic note glyph for unknown slugs.
const FAMILY_BY_SLUG = Object.fromEntries(INSTRUMENT_LIST.map(it => [it.slug, it.family]));

// slug → display name (for the setter's card label + RangeControls' current-label lookup).
const NAME_BY_SLUG = Object.fromEntries(INSTRUMENT_LIST.map(it => [it.slug, it.name]));
export const instrumentNameForSlug = (slug) => NAME_BY_SLUG[slug] || 'Piano';

// PLACEHOLDER icon resolver — returns a lucide glyph node for a slug, picked by family.
// Mirrors RangeControls.getIconForInstrument's family→glyph choices so the two surfaces
// show the same icons.
//
// TODO(icons8): replace the lucide glyph with an icons8 <image href=…/> per slug. When
// that lands, also flip ICON_ATTRIBUTION below to the icons8 credit. Keeping the resolver
// the only place that knows "what an instrument looks like" means that swap touches one
// function + one string, nothing else.
export const getInstrumentIcon = (slug, size = 18) => {
    const family = FAMILY_BY_SLUG[slug];
    switch (family) {
        case 'keys': return <Piano size={size} />;
        case 'guitar': return <Guitar size={size} />;
        case 'winds': return <Wind size={size} />;
        case 'percussion': return <Drum size={size} />;
        case 'voice': return <MicVocal size={size} />;
        case 'strings':
        default: return <Music2 size={size} />;
    }
};

// Attribution / licence line shown while the instrument setter is open. Data-driven so a
// future icons8 swap only changes this string (see getInstrumentIcon TODO).
// TODO(icons8): change to 'Icons by Icons8 — icons8.com' once real icons8 images replace
// the lucide placeholders.
export const ICON_ATTRIBUTION = 'Instrument icons: placeholder (lucide-react, ISC)';
