// #668 (Han 2026-08-03, "scan de map characters en maak een bestiary met alle niet-hero personages"):
// runtime companion to bestiaryManifest.generated.js (produced by scripts/generate-bestiary-manifest.mjs).
// The generator can't resolve Vite asset URLs (it runs under plain Node) — this module does that half:
// import.meta.glob for URLs, joined against the generated metadata by relPath, then grouped into ONE
// "creature" per `base` with a `variants` array (colour siblings — Slime blue/green/red, the 7 Archer
// colours, farm-animal colours, …), mirroring how characterAssets.js groups clothing colour variants.
import MANIFEST, { ACCESSORIES } from './bestiaryManifest.generated.js';

// #691 (Han 2026-08-04, archer/wizard projectile panel): `portraitRelPath` can now point at `fx/` (arrow.png,
// Projectile sheet blue.png) — a sibling glob merged in, since those files live outside `characters/`.
const SHEETS = {
    ...import.meta.glob('../assets/ASSORTED/characters/**/*.png', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob('../assets/ASSORTED/fx/**/*.png', { eager: true, query: '?url', import: 'default' }),
};

// #669: `frame`/`animations` (with `cells: [{row,col}]` sequences — needed for the horse's cross-row-
// stitched animations) come straight from the manifest now; this module only resolves URLs and groups.
function buildCreatures() {
    const map = new Map();
    for (const m of MANIFEST) {
        const url = SHEETS[m.relPath];
        if (!url) continue;   // manifest is stale (file moved/renamed since last generate) — skip gracefully
        const id = `${m.category}::${m.base}`;
        if (!map.has(id)) map.set(id, { id, category: m.category, being: m.being || 'human', name: m.base, variants: [] });
        // #687 (Han 2026-08-04, "green knight + green knight run als één set animaties" / knight (heavy)'s
        // "heavy + run + sheet2 zijn allemaal verschillende animaties"): an animation can now be sourced
        // from a DIFFERENT file than its variant's own `relPath` (e.g. the "Run" animation lives in a
        // separate sheet with the same colour) — `animation.relPath`, when present, resolves its OWN url
        // here so the renderer never needs to do path lookups; animations without one keep using the
        // variant's own `url` (unchanged behaviour for every other creature).
        // #689 (Han: "zet het lantern frame ook in beeld") — an animation may carry a STATIC prop image
        // (`propRelPath`, a single fixed icon — NOT a per-cell overlay like Doggy's hat/backpack) resolved
        // to its own `propUrl` the same way.
        const animations = (m.animations || []).map((a) => ({
            ...a,
            ...(a.relPath ? { url: SHEETS[a.relPath] } : {}),
            ...(a.propRelPath ? { propUrl: SHEETS[a.propRelPath] } : {}),
            // #870 (Han 2026-08-12, Maid "hat superimposed" overlay) — same per-animation url resolution as
            // `relPath` above, a SEPARATE field so the base sprite and the hat overlay can differ per key.
            ...(a.hatRelPath ? { hatUrl: SHEETS[a.hatRelPath] } : {}),
        }));
        map.get(id).variants.push({
            variant: m.variant,
            // #790 (Han 2026-08-09, "alle animals uit de categorie air" moeten oscilleren): denormalized
            // from the parent creature so `isFlyingAnim` can check category without every call site having
            // to separately thread the creature object through just for this.
            category: m.category,
            // #790 (Han 2026-08-09, "voeg tags toe aan de bestiary, zodat ik straks kan zoeken"): derived
            // by the generator (`scripts/generate-bestiary-manifest.mjs`) from category/animation/variant-name
            // signals — never hand-typed. Per-animation tags ride through automatically via `animations`'s
            // own `...a` spread above; this is the CREATURE/variant-level tag list.
            tags: m.tags || [],
            // #870 (Han 2026-08-12, "human / humanoid / animal / other being. elke entiteit is precies één
            // van deze vier"): a SEPARATE axis from `tags` (see generator's `entry.being` comment) —
            // defaults to 'human' if somehow absent (curated ENEMIES entries never set it).
            being: m.being || 'human',
            url,
            width: m.width,
            height: m.height,
            frame: m.frame,
            crop: m.crop,
            animations,
            swatchColor: m.swatchColor || null,
            // #690 (Han: "twee-kleuren vakje" — diagonal duo swatches for genuinely two-toned variants).
            swatchColor2: m.swatchColor2 || null,
            // #672 ("de characters met portrait horen altijd bij elkaar. toon het portret in het voorbeeld")
            portraitUrl: m.portraitRelPath ? SHEETS[m.portraitRelPath] : null,
            // #675 follow-up — set only when the portrait file is a multi-cell grid (the Wizard's 8-colour
            // portrait strip), so the renderer crops to one cell instead of showing the whole file.
            portraitCell: m.portraitCell || null,
            portraitFrame: m.portraitFrame || null,
            // #693 (Han: portrait "nog niet geanimeerd") — optional column count to cycle the portrait's
            // OWN row through (e.g. the projectile's 6-frame flight loop), driven by the same tick the
            // creature sprite itself animates on.
            portraitAnimCols: m.portraitAnimCols || null,
            // #693 round 3 ("use the same oscillation... for the arrow for the archer" / wizard's
            // projectile) — opt-in per entry, not every portrait (a static reference image like Poop
            // Impact Sheet shouldn't wobble).
            portraitOscillate: m.portraitOscillate || false,
            // #693 round 3 ("portait/wizard: add the animated projectile right of the portrait") — a 2nd,
            // INDEPENDENT portrait slot for creatures whose primary `portraitUrl` above is already spoken
            // for (Wizard (Portrait)'s own colour-crop portrait).
            sidePortraitUrl: m.sidePortraitRelPath ? SHEETS[m.sidePortraitRelPath] : null,
            sidePortraitCell: m.sidePortraitCell || null,
            sidePortraitFrame: m.sidePortraitFrame || null,
            sidePortraitAnimCols: m.sidePortraitAnimCols || null,
        });
    }
    return [...map.values()].map((c) => ({
        ...c,
        // #684 (Han 2026-08-04, "zorg dat ALTIJD eerst als default normal wordt getoond, en niet bare") —
        // plain alphabetical sort put "Bare" before "Normal" (B < N), so a Bare/Normal creature defaulted to
        // Bare (index 0, `useBestiaryEditor`'s `variantIndex` starts at 0). Any "bare" variant now sorts
        // LAST; among the rest, an exact "Normal" wins first; everything else still alphabetical.
        variants: c.variants.sort((a, b) => {
            const bareRank = (v) => (/\bbare\b/i.test(v || '') ? 1 : 0);
            const ar = bareRank(a.variant), br = bareRank(b.variant);
            if (ar !== br) return ar - br;
            if (a.variant === 'Normal' && b.variant !== 'Normal') return -1;
            if (b.variant === 'Normal' && a.variant !== 'Normal') return 1;
            return (a.variant || '').localeCompare(b.variant || '');
        }),
        // #671 (Han: "maak een toggler voor hat en backpack") — layers toggled on TOP of whichever variant
        // is selected (same grid alignment across all Doggy variants), resolved from ACCESSORIES by name.
        accessories: (ACCESSORIES[c.name] || []).map((a) => ({ ...a, url: SHEETS[a.relPath] })).filter((a) => a.url),
    })).sort((a, b) => a.name.localeCompare(b.name));
}

// #669 (Han: "critters: aparte categorie") — 'critters' its own category, distinct from 'animal'.
// #672 (Han: "verdeel characters onder volgens mijn categorisering: passive, with attack, with portrait,
// with walk") — the single 'characters' bucket (§668) is now 4 categories, 1:1 on the source folders.
// #674 (Han: "geef musicians een apart tabblad")
// #682 (Han 2026-08-04): 'mature' (a new content-rating category) and 'incomplete' (portrait packs moved
// out of 'portrait' pending verification — Han: "portrait -> incomplete").
export const BESTIARY_CATEGORIES = ['passive', 'attack', 'portrait', 'walk', 'humanoid', 'animal', 'air', 'ground', 'other', 'critters', 'musicians', 'mature', 'incomplete'];
export const SCANNED_CREATURES = buildCreatures();
export const scannedByCategory = (cat) => SCANNED_CREATURES.filter((c) => c.category === cat);

// #790 (Han 2026-08-09, SSOT audit): moved here from RpgLevelPanel's local `petVariant` useMemo (§693
// round 12) so CharacterDoll's persona-preview pet can resolve the SAME classified variant the same way —
// one lookup, not two hand-copied loops that could drift. Matches by resolved sprite URL (not name) since
// the avatar system's PET_FILES glob and this file's own glob resolve the SAME source PNG to the same URL.
export function findVariantByUrl(url) {
    if (!url) return null;
    for (const c of SCANNED_CREATURES) {
        const v = c.variants.find((v) => v.url === url);
        if (v) return v;
    }
    return null;
}

// #790: moved here from RpgLevelPanel's local `findCreature` (§693 round 7) — looks up a creature by its
// bestiary NAME (used for the Wisp NPC, which has no equippable "pet file" URL to match by).
export function findCreatureByName(name) {
    const c = SCANNED_CREATURES.find((c) => c.name === name);
    if (!c) return null;
    return c.variants.find((v) => v.variant === 'Plain') || c.variants[0] || null;
}

// #790: like `findCreatureByName`, but for a creature classified with named COLOUR variants (e.g. the
// Wizard's Black/Blue/Green/... portrait sheets — no "Plain" variant to fall back to) where the caller
// needs one SPECIFIC variant, not "whichever is first".
export function findCreatureVariantByName(name, variantName) {
    const c = SCANNED_CREATURES.find((c) => c.name === name);
    return c?.variants.find((v) => v.variant === variantName) || null;
}

// #790: exact-key animation lookup (vs `findMoveAnim`/`findIdleAnim`'s "whichever of a priority list
// matches" heuristic) — for animations with no move/idle semantics, e.g. the Wizard's `song_attack_*` keys.
export function findAnim(variant, key) {
    return variant?.animations.find((a) => a.key === key) || null;
}

// #693 round 9 (Han: "waarom gebruik je de walk / run animatie niet. zorg dat je check voor fly/run/walk-
// animaties; en zorg ook dat als ik die update in de bestiary, dat ze aangepast zijn in het level (single
// source of truth)"): moved here (was local to RpgLevelPanel) so EVERY world placement of a classified
// creature — the RPG level's WorldCreature AND SheetRpgLayer's Critter — picks its moving/idle animation
// from this ONE function reading the SAME manifest data the Bestiary tab itself uses. Priority order covers
// every movement-animation key the manifest actually uses; whichever one a creature is classified with is
// picked automatically, so re-classifying in the Bestiary editor needs no code change anywhere else.
export const MOVE_ANIM_KEYS = ['walk', 'run', 'move', 'fly', 'float'];
export function findMoveAnim(variant) {
    for (const key of MOVE_ANIM_KEYS) {
        const a = variant.animations.find((x) => x.key === key);
        if (a) return a;
    }
    return null;
}
export function findIdleAnim(variant) {
    return variant.animations.find((a) => a.key === 'idle' || a.key === 'sit') || variant.animations[0];
}
// A creature "flies" (for anchor purposes — see RpgLevelPanel/Critter/CreatureSprite) if its
// CURRENTLY-PLAYING animation key is fly/float — NOT merely "has one somewhere" — so a fly/float creature
// that also has a 'sit' anim re-anchors to the floor specifically while sitting (Han: "als die OOK een sit
// animatie heeft, anker 'm terug naar de vloer voor die specifieke animatie").
// #790 (Han 2026-08-09, "pas hetzelfde effect toe op: alle animals uit de categorie air, alle animaties met
// 'fly' of 'float' in de titel"): broadened two ways, `variant` (optional, 2nd arg — every call site has it
// in scope) unlocks the category check:
//   1. the WHOLE creature's category is 'air' → always flying, whatever its current animation is playing
//      (the explicit 'sit' override above still wins — a specific per-animation ground pose beats the
//      creature-level default).
//   2. the animation's key OR its human-readable label contains "fly"/"float" (substring, case-insensitive)
//      — not just an exact key match, so e.g. a "Flying" or "Float Loop" label also counts.
export function isFlyingAnim(anim, variant) {
    if (!anim) return false;
    if (anim.key === 'sit') return false;
    if (variant?.category === 'air') return true;
    // #870 (Han 2026-08-12, "sommige creaturen zijn (octopus, flying brain monster, pixie)... maar niet
    // gecentreerd en oscillerend"): the ALWAYS_FLYING_NAMES roster (generate-bestiary-manifest.mjs) tags
    // these creatures' animations `flying` WITHOUT renaming key/label to fly/float — this check was missing
    // that path entirely, so the tag never actually turned on the centering/oscillation it exists to drive.
    if (anim.tags?.includes('flying')) return true;
    return /fly|float/i.test(`${anim.key || ''} ${anim.label || ''}`);
}
