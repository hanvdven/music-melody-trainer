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

// Grouped by family. `family` is the lucide glyph key used by getInstrumentIcon so the
// icon is DERIVED from the group, never hand-mapped per instrument (§6c).
export const INSTRUMENT_GROUPS = [
    {
        label: 'Keys',
        family: 'keys',
        items: [
            { name: 'Piano', slug: 'acoustic_grand_piano' },
            { name: 'Electric Piano', slug: 'electric_piano_1' },
            { name: 'Organ', slug: 'church_organ' },
            { name: 'Harp', slug: 'orchestral_harp' },
        ],
    },
    {
        label: 'Guitars & Bass',
        family: 'guitar',
        items: [
            { name: 'Guitar Nylon', slug: 'acoustic_guitar_nylon' },
            { name: 'Guitar Steel', slug: 'acoustic_guitar_steel' },
            { name: 'Guitar Clean', slug: 'electric_guitar_clean' },
            { name: 'Acoustic Bass', slug: 'acoustic_bass' },
            { name: 'Bass Picked', slug: 'electric_bass_pick' },
            { name: 'Synth Bass', slug: 'synth_bass_1' },
        ],
    },
    {
        label: 'Strings',
        family: 'strings',
        items: [
            { name: 'Violin', slug: 'violin' },
            { name: 'Cello', slug: 'cello' },
            { name: 'Ensemble', slug: 'string_ensemble_1' },
        ],
    },
    {
        label: 'Winds',
        family: 'winds',
        items: [
            { name: 'Trumpet', slug: 'trumpet' },
            { name: 'French Horn', slug: 'french_horn' },
            { name: 'Saxophone', slug: 'tenor_sax' },
            { name: 'Clarinet', slug: 'clarinet' },
            { name: 'Oboe', slug: 'oboe' },
            { name: 'Flute', slug: 'flute' },
        ],
    },
    {
        label: 'Tuned Percussion',
        family: 'percussion',
        items: [
            { name: 'Marimba', slug: 'marimba' },
            { name: 'Vibraphone', slug: 'vibraphone' },
        ],
    },
    {
        label: 'Voice',
        family: 'voice',
        items: [
            { name: 'Voice Oohs', slug: 'voice_oohs' },
            { name: 'Choir', slug: 'choir_aahs' },
        ],
    },
];

// Flat list of every instrument row, in group order. Convenient for lookups + the
// RangeControls stepper (which wants a flat options list).
export const INSTRUMENT_LIST = INSTRUMENT_GROUPS.flatMap(g =>
    g.items.map(it => ({ ...it, family: g.family, groupLabel: g.label })));

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
