// #668 (Han 2026-08-03, "scan de map characters en maak een bestiary met alle niet-hero personages"):
// one-time (re-runnable) generator that scans src/assets/ASSORTED/characters/** (excluding char_hero, which
// is the PLAYER and belongs to the character creator, not the bestiary) and produces a static manifest of
// { category, base, variant, relPath, width, height, frame:{w,h}, crop, animations:[{key,label,cells}] }
// records — the runtime counterpart to the hand-curated src/model/enemyAssets.js (which stays UNTOUCHED: it
// also feeds real gameplay — SheetRpgLayer's slimes — and must not be duplicated/broken by this scan).
//
// Since there's no way to know a new sheet's frame size, animation-row layout, or content-vs-blank-filler
// cells without either measuring ~450 files by hand or inspecting the actual pixels, this DECODES each PNG
// (via pngjs) and proposes: the largest common divisor of width/height from FRAME_CANDIDATES as the square
// frame size; per-row content-frame counts by scanning columns left-to-right until a fully-transparent cell;
// and a crop rectangle (union of non-transparent pixel bounds across all content frames, in frame-local
// coords). Han's plan (Q&A, §4b): "doe een voorstel op basis van wat je in de file aantreft… toon de hxb in
// debug mode" — a proposal, verified in-app via the debug width×height overlay.
//
// #669 (Han 2026-08-03, same-day follow-up): the square-only guess is WRONG for several animal packs (non-
// square frames — cow/pig/wisp; a too-coarse-but-valid square guess for the shared pets frame; one sheet,
// "critters", that's actually 16 DIFFERENT animals stacked in one file, not one animal's animation rows).
// Han hand-measured the real frame sizes + (for horse, whose animations are stitched across row boundaries
// in an irregular pattern no generic algorithm could infer) the exact per-animation cell sequences. FRAME_
// OVERRIDES/HARD_OVERRIDES/BASE_OVERRIDES encode exactly what Han specified — see the inline comments next
// to each for the literal instruction it implements.
//
// Run with: node scripts/generate-bestiary-manifest.mjs
//
// #692 (Han 2026-08-04, "vind een manier om alle sprites goed te organiseren, labelen, splitsen indien
// nodig, zodat je snel kan laden/vinden in de files") / #790 (Han 2026-08-09, "er is een giga-bestand met
// sprite-definities; doe een voorstel die drastisch op te ruimen — maak die zo overzichtelijk dat ik er
// handmatig in kan werken"): §692 explicitly deferred the full multi-file split pending Han saying so; he
// has now asked for exactly that. Executed as a TARGETED split, not a blind one: the 18 bespoke per-creature
// "frame N-M = animation X" functions — the ONES HAN ACTUALLY HAND-EDITS when giving a corrected frame spec
// for a single creature — moved to `scripts/bestiary/animationDefs.mjs` (their tiny shared helpers to
// `scripts/bestiary/helpers.mjs`). THIS file, edit-this-when-you-mean-"the whole pipeline", still owns
// everything with real cross-references and declaration-order dependencies (folder/category rules, frame-
// size/label overrides, the pixel scanner, the roster/column/special-case EXPANSION functions, and the main
// scan loop that ties them all together) — splitting THAT part further was the specific risk §692 flagged
// (shared mutable state, order-dependent helpers) and is not worth it: nobody hand-edits "the scan loop" the
// way they hand-edit "Goblin's frame numbers". Regenerating after this split produced a BYTE-IDENTICAL
// manifest to before it (verified via diff) — confirming the split changed nothing about behavior.
//
// TABLE OF CONTENTS (search for the exact heading text, e.g. "SECTION: FRAME SIZE"):
//   scripts/bestiary/helpers.mjs        — cap/rowCells/frameRange: the 3 tiny helpers animationDefs.mjs needs
//   scripts/bestiary/animationDefs.mjs  — hand-authored per-creature animation-cell layouts (horse, goblin,
//                                         zombie, maid ×4, skeleton, wizard, santa/vampire, knighty ×3,
//                                         art lady, boss_spider, large skull, devil) — EDIT THIS FILE for a
//                                         corrected/new "frame N-M = animation X" spec for one creature.
//   SECTION: FOLDER MAP & CATEGORY OVERRIDES  — which folder → which bestiary tab; per-file category moves
//   SECTION: FILTERS (junk/curated/excluded)  — what gets SKIPPED and why (junk previews, already-curated
//                                                gameplay enemies, style exclusions, duplicate downloads)
//   SECTION: VARIANT / COLOUR PARSING         — turns "X Blue.png" into base="X", variant="Blue"
//   SECTION: FILE DISCOVERY                   — recursive PNG listing, portrait-pairing lookup
//   SECTION: FRAME SIZE                       — auto-guess + FRAME_OVERRIDES (hand-measured corrections)
//   SECTION: BASE-NAME OVERRIDES              — one physical file → a different logical creature name/split
//   SECTION: ROW LABELS                       — "row 0/1/2" → "Idle/Move/Attack/Death" (or a pack-specific
//                                                override, e.g. cow's "Idle/Walk/Graze")
//   SECTION: PIXEL SCANNING                   — the actual PNG decode + per-row content-frame counting
//   SECTION: GENERIC ANALYZE                  — combines all of the above into one file's proposed record
//   SECTION: ROSTER SHEETS                    — one shared "characters sheet N.png" → many named creatures
//   SECTION: COLUMN-SHEET EXPANSION           — the Male/Female Pixel Art columns (one column = one char)
//   SECTION: SPECIAL ONE-OFF EXPANSIONS       — damned tree/critters/evil wizard: each its own "one file →
//                                                N manifest entries" shape
//   SECTION: MAIN SCAN LOOP                    — walks every folder, dispatches to the right expansion above
//   SECTION: POST-PROCESS MERGES               — folds "Sheet2"/"Combat"/etc. suffixed variants back together
//   SECTION: SWATCH + PORTRAIT + BRAND-STRIP   — colour swatches, projectile/portrait pairing, name cleanup
//   SECTION: OUTPUT                            — writes bestiaryManifest.generated.js
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { PNG } from 'pngjs';
// #790 (Han 2026-08-09, "er is een giga-bestand met sprite-definities; doe een voorstel die drastisch op
// te ruimen"): this script crossed 2000 lines with 18 bespoke per-creature "frame N-M = animation X"
// functions inlined among the scan/expansion logic. Those functions — the ones Han actually hand-edits when
// giving a corrected frame spec for one creature — moved to scripts/bestiary/animationDefs.mjs (their tiny
// shared helpers to scripts/bestiary/helpers.mjs), leaving this file with just the scan/expansion machinery
// (which stays together deliberately — see the note below on why a FULL split was rejected).
import { cap, rowCells } from './bestiary/helpers.mjs';
import {
    horseAnimations, goblinAnimations, zombieAnimations, maidAnimations, maidSheet2Animations,
    maidCombatAnimations, maidSwordDownAnimations, poopThrowerAnimations, skeletonAnimations,
    artLadyAnimations, wizardPortraitAnimations, santaVampireAnimations, knightyAnimations,
    knightyRunFastAnimations, knightHeavySheet2Animations, boss_spiderAnimations, largeSkullAnimations,
    devilAnimations,
} from './bestiary/animationDefs.mjs';

// ═══ SECTION: FOLDER MAP & CATEGORY OVERRIDES ═══
const ROOT = join(process.cwd(), 'src/assets/ASSORTED/characters');
const OUT = join(process.cwd(), 'src/model/bestiaryManifest.generated.js');

// Category → folder(s). #671 (Han 2026-08-03, third follow-up: "verdeel characters onder volgens mijn
// categorisering: passive, with attack, with portrait, with walk") — the single 'characters' bucket is
// split into 4, still 1:1 on the existing folder names, same principle as §113's original mapping.
const CATEGORY_FOLDERS = {
    passive: ['char_passive'],
    attack: ['char_with_attack'],
    portrait: ['char_with_porttrait'],
    walk: ['char_with_walk'],
    humanoid: ['creature_humanoid'],
    animal: ['animals'],
    air: ['creatures_air'],
    ground: ['creatures_ground'],
    other: ['creatures_other'],
};

// #674 (Han 2026-08-03, sixth follow-up: "musicians zijn: drum, tamborine, violin. geef musicians een
// apart tabblad.") — Musicians.png/Japanese Musician.png/Knight Cooking's row4 all live in char_passive
// (folder-category 'passive') but get pulled into their own category, checked by relPath after the normal
// folder assignment.
const CATEGORY_OVERRIDES = [
    { test: (p) => /Musicians\.png$/i.test(p), category: 'musicians' },
    { test: (p) => /Japanese Musician\.png$/i.test(p), category: 'musicians' },
    // #676 (Han: "bard -> musicians")
    { test: (p) => /char_passive\/Bard\.png$/i.test(p), category: 'musicians' },
    // #682 (Han 2026-08-04, new "mature" category) — every SINGLE-FILE (non-roster) item Han listed for it.
    { test: (p) => /char_passive\/Art lady\.png$/i.test(p), category: 'mature' },
    { test: (p) => /char_passive\/Bathtime( Bare)?\.png$/i.test(p), category: 'mature' },
    { test: (p) => /Funny Spring Characters\.png$/i.test(p), category: 'mature' },
    { test: (p) => /GandalfHardcore Covered Characters sheet\.png$/i.test(p), category: 'mature' },
    { test: (p) => /GandalfHardcore Dryad sheet\.png$/i.test(p), category: 'mature' },
    { test: (p) => /GandalfHardcore Eve sheet\.png$/i.test(p), category: 'mature' },
    { test: (p) => /GandalfHardcore Flower dryad\.png$/i.test(p), category: 'mature' },
    { test: (p) => /Japanese Characters( Bare)?\.png$/i.test(p), category: 'mature' },
    { test: (p) => /Lovers\.png$/i.test(p), category: 'mature' },
    { test: (p) => /char_passive\/(Character sheet( bare)? |Character sheet\.)/i.test(p) && /Spirit/.test(p), category: 'mature' },
    // succubus: every file under the Succubus folder (any category it currently has — mostly 'portrait' via
    // the Female Pixel Art column, or 'humanoid'/'passive' for the many standalone sheets) moves to 'mature'.
    { test: (p) => /\/Succubus\//i.test(p) || /Succubus/i.test(p), category: 'mature' },
    // #687 (Han 2026-08-04, "laat maid bathing apart en zet bij mature")
    { test: (p) => /GandalfHardcore maid bathing\.png$/i.test(p), category: 'mature' },
    // #682 new "incomplete" category (Han: "portrait -> incomplete") — these packs sit in 'portrait' today
    // but are only partially verified (multi-colour sheets with no confirmed portrait pairing / animation
    // breakdown) — moved to their own tab so they read as distinct from the checked 'portrait' entries.
    // #683 (Han 2026-08-04, "werk deze karakter uit en verplaats naar char + portrait"): Goblin/Zombie/Maid
    // are now fully worked out (real animation breakdowns below) — moved BACK to 'portrait' (their normal
    // char_with_porttrait folder category). Samurai/Angel/Mounted Knight stay 'incomplete' pending the same
    // treatment. #689: Goddess is now worked out too (idle dropped, walk→fly) — moved back to 'portrait'.
    { test: (p) => /char_with_porttrait\/.*Samurai/i.test(p), category: 'incomplete' },
    { test: (p) => /char_with_porttrait\/.*Angel/i.test(p), category: 'incomplete' },
    { test: (p) => /char_with_porttrait\/.*Mounted knight/i.test(p), category: 'incomplete' },
    // #693 (Han 2026-08-04, critters batch round 2: "verplaats naar flying: cocadaemon" / "verplaats naar
    // other: de portals, de totems, de destructible objects") — checked BEFORE the blanket critters→
    // 'critters' rule below (array order = precedence, `.find()` stops at the first match).
    { test: (p) => /\/animals\/critters\/Cacodaemon/i.test(p), category: 'air' },
    // #693 round 12 (Han: "wisp should be moved to air category"): the pet-companion Wisp sheets (both the
    // Plain and Outline colour variants) currently fall through to the folder's default 'animal' category.
    { test: (p) => /animals\/pets\/.*Wisp/i.test(p), category: 'air' },
    { test: (p) => /\/animals\/critters\/(Green|Purple) Portal/i.test(p), category: 'other' },
    { test: (p) => /\/animals\/critters\/(Buff Totem|Fire Totem|Heal Totem)/i.test(p), category: 'other' },
    { test: (p) => /\/animals\/critters\/Destructible Objects/i.test(p), category: 'other' },
    { test: (p) => /\/animals\/critters\/Training Dummy/i.test(p), category: 'other' },   // Han round 3: "move target dummy to 'other'"
    // #692 (Han 2026-08-04, "en heel veel critters"): everything under the new `animals/critters/` folder
    // (the "Basic Animal/Vermin/Magical Animations" packs + the loose "* Sprite Sheet.png" files) belongs in
    // the existing 'critters' tab, not 'animal' (its physical folder's default category) — matches the
    // established precedent for "critters sheet.png" above (also explicitly tagged 'critters').
    { test: (p) => /\/animals\/critters\//i.test(p), category: 'critters' },
];
function categoryOverrideFor(relPath, fallback) {
    return CATEGORY_OVERRIDES.find((o) => o.test(relPath))?.category || fallback;
}

// Never a pickable/previewable creature — attribution/junk/duplicate-portrait renders that sit alongside the
// real sheet (mirrors characterAssets.js's JUNK_NAME).
// #692 (Han 2026-08-04, "heel veel critters" batch): "- Guides.png" siblings (e.g. "Human Baby Sprite Sheet
// - Guides.png") are measurement/reference overlays, same non-creature-junk role as the existing patterns.
// (Tested against the raw directory entry INCLUDING ".png" in `listPngs` below — no `$` anchor, so it still
// matches regardless of the extension trailing it.)
// ═══ SECTION: FILTERS (junk/curated/excluded) ═══
const JUNK_NAME = /dont forget|read ?me|portrait| - guides/i;
// #669/#671 (Han: "de doggy backpack en doggy hat zijn equipable" → "maak een toggler voor hat en
// backpack") — not standalone creatures; routed to a separate ACCESSORIES map instead of the manifest.
const PET_ACCESSORY = /doggy (backpack|hat)/i;
const DOGGY_BODY = /GandalfHardcore Pet companion\/(GandalfHardcore )?doggy sheet/i;

// Already hand-curated in enemyAssets.js (fully animated, feeds real gameplay via SLIME_COLORS/etc. too) —
// skip these so the bestiary never lists the same creature twice.
// #676 (Han 2026-08-03, eighth follow-up): plain substring `.includes()` here caused a SECOND collision bug
// this session (after the "Female"/"Male" one) — "Bathtime.png" contains "bat" as a substring ("bat-time"),
// so it was silently treated as an already-curated duplicate of the Bat enemy and dropped entirely. Fixed
// with the same `\b` word-boundary technique used for the Male/Female fix (§675) — checked for every
// keyword now, not patched one-off.
const CURATED_KEYWORDS = ['lamia', 'bat', 'flying eye', 'flying witch', 'mimic', 'mosquito', 'mushroom', 'plant', 'pumpkin', 'rat', 'slime'];
// #687 (Han 2026-08-04, "ik mis rat thief van de passive characters"): "Rat thief.png" (a char_passive
// HUMAN character) was silently dropped because 'rat' matched inside it too (word-boundary alone can't
// tell "Rat" the curated enemy apart from "Rat thief" the passive character) — carved out explicitly,
// same targeted-exception convention as EXCLUDED_NAME above, rather than a fragile folder/heuristic guess.
const isCurated = (name) => !/^Rat thief$/i.test(name) && CURATED_KEYWORDS.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(name));

// #682 (Han 2026-08-04: "haal de bikini girls uit de set - past niet in de stijl" + "haal het karakter
// 'color variations' weg uit de lijst. ook 'heavy colors' mag weg") — never a pickable bestiary creature,
// skipped entirely (same mechanism as JUNK_NAME, kept separate since these are content/style decisions,
// not junk-detection heuristics).
// #683 (Han 2026-08-04, while working on Goblin/Zombie/Maid): generalized from the original 2 named files
// ("color variations"/"heavy colors") — EVERY "* colors.png" in this asset pack turns out to be the same
// kind of junk preview-swatch thumbnail (Dress/Goblin/Maid/Mounted knight/Samurai/Zombie colors, verified by
// listing every "colors" match in the whole tree — no legitimate creature name collides with this suffix).
// #689 (Han 2026-08-04, "skeletons variations: mag weg") — a junk preview-swatch file, same treatment.
const EXCLUDED_NAME = /bikini girls|^color variations$|\bcolors$|^skeleton variations$/i;
// #692 (Han 2026-08-04): a literal " (1)" suffix is Windows' generic "duplicate download" naming — e.g.
// "Ice Elemental Sprite Sheet (1).png" sitting next to the real "Ice Elemental Sprite Sheet.png" — a byte-
// identical (or near-identical) accidental double-download, not a genuine second creature/variant.
const DUPLICATE_DOWNLOAD_NAME = / \(\d+\)$/;

// Colour-variant keywords — same list as characterAssets.js's COLORS (kept independent here: this script
// runs under plain Node, not Vite, so it can't import a module that calls import.meta.glob at load time).
// ═══ SECTION: VARIANT / COLOUR PARSING ═══
const COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'skyblue', 'yellow', 'black', 'white', 'brown', 'pink', 'cyan', 'grey', 'gray', 'bw', 'rw'];
function parseVariant(name) {
    const tokens = name.replace(/\.png$/i, '').split(/\s+/);
    const i = tokens.findIndex((t) => COLORS.includes(t.toLowerCase()));
    if (i === -1) return { base: name.replace(/\.png$/i, ''), variant: null };
    return { base: tokens.filter((_, j) => j !== i).join(' ').trim(), variant: cap(tokens[i].toLowerCase()) };
}

// ═══ SECTION: FILE DISCOVERY ═══
function listPngs(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = statSync(p);
        if (st.isDirectory()) out.push(...listPngs(p));
        else if (/\.png$/i.test(entry) && !JUNK_NAME.test(entry)) out.push(p);
    }
    return out;
}

// #672 (Han 2026-08-03, fourth follow-up: "de characters met portrait: die horen altijd bij elkaar. toon
// het portret in het voorbeeld") — every subfolder under char_with_porttrait pairs ONE character sheet with
// ONE small "…64x64…portrait…" crop (naming varies wildly: "portrait 64x64.png", "64x64 Zombie
// Portrait.png", "Heavy Knight portrait 64x64.png", …, hence the loose keyword match). Paired by shared
// CONTAINING DIRECTORY (not just the top subfolder — Succubus nests one sub-subfolder per character), and
// only when that directory has exactly ONE portrait candidate (Samurai's 8-numbered-portraits folder is a
// multi-character composite sheet with no unambiguous 1:1 pairing — skipped, disclosed limitation).
function buildPortraitMap() {
    const map = {};
    let dir;
    try { dir = join(ROOT, 'char_with_porttrait'); readdirSync(dir); } catch { return map; }
    const byDir = {};
    for (const absPath of listAllPngs(dir)) {
        const d = dirname(absPath);
        const file = absPath.split(/[/\\]/).pop();
        (byDir[d] ||= []).push(file);
    }
    for (const [d, files] of Object.entries(byDir)) {
        const portraits = files.filter((f) => /portrait/i.test(f) && /64x64/i.test(f));
        if (portraits.length !== 1) continue;   // 0 = no portrait; >1 = ambiguous multi-character sheet
        map[d] = `../assets/ASSORTED/characters/${relative(ROOT, join(d, portraits[0])).replace(/\\/g, '/')}`;
    }
    return map;
}
function listAllPngs(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...listAllPngs(p));
        else if (/\.png$/i.test(entry)) out.push(p);
    }
    return out;
}
const PORTRAIT_MAP = buildPortraitMap();

// ═══ SECTION: FRAME SIZE ═══
const FRAME_CANDIDATES = [128, 96, 80, 64, 48, 32, 24, 16];
function guessFrameSize(width, height) {
    for (const f of FRAME_CANDIDATES) {
        if (width % f === 0 && height % f === 0) return { w: f, h: f };
    }
    return { w: Math.min(width, height), h: Math.min(width, height) };   // fallback: whole image is one frame
}

// #669 hand-measured frame-size corrections (Han). Keyed by a substring match against the posix relPath
// (relative to ROOT) — good enough for these one-off overrides without needing exact-path plumbing.
const FRAME_OVERRIDES = [
    { test: (p) => /animals\/Sleeping Dragon\.png$/i.test(p), frame: { w: 208, h: 128 } },
    { test: (p) => /animals\/Tiger\.png$/i.test(p), frame: { w: 80, h: 64 } },
    // #671 (Han: "whisp had moeten zijn 32x32 (sorry)") — corrects §669's 40x32.
    { test: (p) => /pets\/.*Wisp/i.test(p), frame: { w: 32, h: 32 } },
    // "pets: 32x32 steeds idle, run" — every remaining pet sheet (doggy variants, fox); Wisp/backpack/hat
    // are matched by their OWN more specific rules above/below first.
    { test: (p) => /animals\/pets\//i.test(p) && !/Wisp/i.test(p), frame: { w: 32, h: 32 } },
    // #671 (Han: "horse had moeten zijn 128x90 (sorry)") — corrects §669's 96x120; ALSO fixes the row-
    // count bug flagged in §114 (720/90 = 8 rows, so the stagger/death "rij 7/8" references are valid now).
    { test: (p) => /farm\/horse/i.test(p), frame: { w: 128, h: 90 } },
    { test: (p) => /farm\/cow/i.test(p), frame: { w: 112, h: 80 } },
    { test: (p) => /farm\/pig/i.test(p), frame: { w: 80, h: 48 } },
    // #670 (Han 2026-08-03, second follow-up)
    { test: (p) => /boss_spider\.png$/i.test(p), frame: { w: 192, h: 96 } },
    { test: (p) => /creatures_ground\/Imp\.png$/i.test(p), frame: { w: 64, h: 64 } },
    { test: (p) => /Female Hell Giant/i.test(p), frame: { w: 112, h: 128 } },
    { test: (p) => /The Devil\.png$/i.test(p), frame: { w: 96, h: 112 } },
    // #671 (Han: "alle damneds, en mummy en orc zijn 64x64")
    { test: (p) => /creature_humanoid\/(damned|Mummy|Orc)/i.test(p), frame: { w: 64, h: 64 } },
    // #676 (Han 2026-08-03, eighth follow-up) — exceptions to the "characters are 64x64" default, listed
    // BEFORE that blanket rule below (array order = precedence, `.find()` stops at the first match).
    { test: (p) => /Lady Godiva/i.test(p), frame: { w: 96, h: 80 } },   // Han: "de enige uitzondering"
    { test: (p) => /Japanese Characters/i.test(p), frame: { w: 80, h: 64 } },
    { test: (p) => /char_passive\/Bathtime( Bare)?\.png$/i.test(p), frame: { w: 128, h: 64 } },   // NOT Bathtime Knight (stays 64x64)
    // #677 (Han: "knights (heavy en knighty) 69x58") — verified against Knight Knighty's real dimensions
    // (345×812 = exactly 5×14 @ 69×58); Knight HEAVY's sheets do NOT divide evenly by 69×58 (flagged in
    // knightyAnimations()'s comment) so Heavy is deliberately NOT matched here — left on the generic guess.
    { test: (p) => /Knight Knighty\/[A-Za-z]+ knight\.png$/i.test(p), frame: { w: 69, h: 58 } },
    { test: (p) => /Knight Knighty\/.*Knight [Rr]un\.png$/i.test(p), frame: { w: 69, h: 58 } },
    // #682 (Han 2026-08-04, re-measured after §677 flagged the mismatch): Knight Heavy's real frame is
    // 91×64 — verified against ALL THREE of its sheets (455×768 = 5×12, 546×64 = 6×1, 637×192 = 7×3, all
    // exact divisions, unlike the previously-assumed-but-wrong 69×58).
    { test: (p) => /Knight Heavy\/[A-Za-z]+ heavy ?\.png$/i.test(p), frame: { w: 91, h: 64 } },
    { test: (p) => /Knight Heavy\/Heavy Knight Run and Portrait\//i.test(p), frame: { w: 91, h: 64 } },
    { test: (p) => /Knight Heavy\/.*Heavy Knighty sheet2/i.test(p), frame: { w: 91, h: 64 } },
    // #683 (Han 2026-08-04, "goblin: frame size 84x64") — exception to the 64×64 blanket rule below.
    { test: (p) => /char_with_porttrait\/.*Goblin.*sheet\.png$/i.test(p), frame: { w: 84, h: 64 } },
    // #672 (Han: "characters: je mag aannemen dat ze 64x64 zijn") — blanket override for all 4 character
    // folders (passive/attack/portrait/walk), replacing the generic square-guess for these.
    { test: (p) => /characters\/(char_passive|char_with_attack|char_with_porttrait|char_with_walk)\//i.test(p), frame: { w: 64, h: 64 } },
    // #693 (Han 2026-08-04, critters batch round 2 — explicit frame-size list): "arkaname, totem (buff),
    // bumble bee, cat, flying brain monster, totem heal, hedgehog, human baby, intellect devourer, koala,
    // kobold priest, leaf elemental, leshy leaf, pidgeon, ratfolk mage, worm = 32x32". One alternation
    // (§6c — a single rule, not 16 near-identical lines), scoped to the loose critters files (NOT the
    // "Basic Animal/Vermin Animations" packs, already correctly 16×16 and untouched).
    {
        test: (p) => /\/animals\/critters\/(Akaname|Buff Totem|Bumble Bee|Cat Sprite Sheet|Flying Brain Monster|Heal Totem|Hedgehog|Human Baby|Intellect Devourer|Koala|Kobold Priest|Leaf Elemental|Leshy Leaf|Pidgeon|Ratfolk Mage|Worm)/i.test(p),
        frame: { w: 32, h: 32 },
    },
    // #693 round 3 correction: Han revised "porcupine = 40x40" (round 2) to "porcupine ... = 32x32" — the
    // later instruction supersedes the earlier one (same convention used throughout this session).
    { test: (p) => /\/animals\/critters\/(Porcupine|Imp)/i.test(p), frame: { w: 32, h: 32 } },   // Han: "porcupine, imp = 32x32"
    { test: (p) => /\/animals\/critters\/(Cacodaemon|Phoenixling)/i.test(p), frame: { w: 64, h: 64 } },   // Han: "= 64x64"
];
function frameOverrideFor(relPath) {
    const hit = FRAME_OVERRIDES.find((o) => o.test(relPath));
    return hit?.frame || null;
}

// #669 (Han: "de whisps ... (2 kleurvarianten)") — "GandalfHardcore Wisp" and "Wisp with outline" don't
// share a base name the colour-keyword grouper (parseVariant) can match, so they're grouped by hand.
// ═══ SECTION: BASE-NAME OVERRIDES ═══
const BASE_OVERRIDES = [
    { test: (p) => /Wisp with outline\.png$/i.test(p), base: 'Wisp', variant: 'Outline' },
    { test: (p) => /GandalfHardcore Wisp\.png$/i.test(p), base: 'Wisp', variant: 'Plain' },
    // #670 (Han: "maak van covered/uncovered twee kleurvarianten") — "covered"/no-suffix aren't colour
    // words the generic grouper recognises, so grouped by hand.
    { test: (p) => /Female Hell Giant covered\.png$/i.test(p), base: 'Hell Giant', variant: 'Covered' },
    { test: (p) => /Female Hell Giant\.png$/i.test(p), base: 'Hell Giant', variant: 'Uncovered' },
    // #671 (Han: "maak voor de damned male en female een covered variant")
    { test: (p) => /damned male covered\.png$/i.test(p), base: 'Damned Male', variant: 'Covered' },
    { test: (p) => /damned male\.png$/i.test(p), base: 'Damned Male', variant: 'Uncovered' },
    { test: (p) => /damned female covered\.png$/i.test(p), base: 'Damned Female', variant: 'Covered' },
    { test: (p) => /damned female\.png$/i.test(p), base: 'Damned Female', variant: 'Uncovered' },
    // #684: Sword Spirit/Sword Spirit Bare are now read directly by `spiritBlueEntries()` (the Brown/Brown
    // Bare variants of the merged "Spirit Blue" creature) — no longer routed through the generic per-file
    // path at all (skipped explicitly where the main loop encounters them, mirroring the Bathmaids pattern).
    // #676 (Han: "female wizard bare is variant van female wizard")
    { test: (p) => /char_passive\/Female Wizard bare\.png$/i.test(p), base: 'Female Wizard', variant: 'Bare' },
    { test: (p) => /char_passive\/Female Wizard\.png$/i.test(p), base: 'Female Wizard', variant: 'Normal' },
    // #676 (Han: "lady godiva is de enige uitzondering")
    { test: (p) => /Lady Godiva covered\.png$/i.test(p), base: 'Lady Godiva', variant: 'Covered' },
    { test: (p) => /Lady Godiva\.png$/i.test(p), base: 'Lady Godiva', variant: 'Uncovered' },
    // #676 (Han: "japanese characters zijn 80x64. bare is een variant daarop")
    { test: (p) => /Japanese Characters Bare\.png$/i.test(p), base: 'Japanese Characters', variant: 'Bare' },
    { test: (p) => /Japanese Characters\.png$/i.test(p), base: 'Japanese Characters', variant: 'Normal' },
    // #676 (Han: "bathtime bare is 128x64 ... bathtime knight 64x64" — "Bathtime.png" itself, the non-bare
    // counterpart, wasn't explicitly named but is the obvious pairing; Bathtime Knight is a separate,
    // standalone creature, NOT grouped here).
    { test: (p) => /char_passive\/Bathtime Bare\.png$/i.test(p), base: 'Bathtime', variant: 'Bare' },
    { test: (p) => /char_passive\/Bathtime\.png$/i.test(p), base: 'Bathtime', variant: 'Normal' },
    // #682 (Han 2026-08-04, "mature" category renames)
    { test: (p) => /char_passive\/Art lady\.png$/i.test(p), base: 'Lady Art Pose', variant: null },
    { test: (p) => /GandalfHardcore Dryad sheet\.png$/i.test(p), base: 'Lady Dryad', variant: null },
    { test: (p) => /GandalfHardcore Eve sheet\.png$/i.test(p), base: 'Lady Eve', variant: null },
    { test: (p) => /GandalfHardcore Flower dryad\.png$/i.test(p), base: 'Lady Dryad Flowers', variant: null },
    // #682 ("GandalfHardcore Covered Characters sheet.png" — 13-row/26-slot roster with no names given yet;
    // included as ONE generic creature rather than skipped outright, so the asset isn't silently dropped —
    // flagged for Han to split into named characters once he provides the roster, mirroring §676's
    // "sheets 5/6 skipped" precedent for the reverse case (there: skipped for lack of names; here: kept
    // whole since Han asked for it to be included, just not yet split).
    { test: (p) => /GandalfHardcore Covered Characters sheet\.png$/i.test(p), base: 'Covered Characters', variant: null },
    // #683 (Han 2026-08-04, Goblin's 6 colours) — 3 of the 6 are compound colour words (`parseVariant` only
    // matches a SINGLE token against COLORS) — grouped explicitly for all 6 so none silently mis-parses.
    { test: (p) => /Goblin enemy green sheet\.png$/i.test(p), base: 'Goblin', variant: 'Green' },
    { test: (p) => /Goblin enemy lime sheet\.png$/i.test(p), base: 'Goblin', variant: 'Lime' },
    { test: (p) => /Goblin enemy dark green sheet\.png$/i.test(p), base: 'Goblin', variant: 'Dark Green' },
    { test: (p) => /Goblin enemy brown sheet\.png$/i.test(p), base: 'Goblin', variant: 'Brown' },
    { test: (p) => /Goblin enemy red sheet\.png$/i.test(p), base: 'Goblin', variant: 'Red' },
    { test: (p) => /Goblin enemy bright green sheet\.png$/i.test(p), base: 'Goblin', variant: 'Bright Green' },
    // #683 (Han: "zombies: kleurvarianten brown, dark red, red, yellow") — v1-v4 assumed to correspond to
    // this exact colour order (filenames are just "v1".."v4", no colour word) — flagged assumption.
    { test: (p) => /GandalfHardcore Zombie v1 sheet\.png$/i.test(p), base: 'Zombie', variant: 'Brown' },
    { test: (p) => /GandalfHardcore Zombie v2 sheet\.png$/i.test(p), base: 'Zombie', variant: 'Dark Red' },
    { test: (p) => /GandalfHardcore Zombie v3 sheet\.png$/i.test(p), base: 'Zombie', variant: 'Red' },
    { test: (p) => /GandalfHardcore Zombie v4 sheet\.png$/i.test(p), base: 'Zombie', variant: 'Yellow' },
    // #687 (Han 2026-08-04, skeleton colour order: "grey (sheet), retro, full white, red, gold, ghost") —
    // grouped explicitly (like Goblin/Zombie above) since "retro"/"gold"/"ghost" aren't in `COLORS` and
    // "sheet"/"colors"/"full" would otherwise leak into the base name via `parseVariant`.
    { test: (p) => /Skeleton Enemy Sheet\/skeleton sheet\.png$/i.test(p), base: 'Skeleton', variant: 'Grey' },
    { test: (p) => /Skeleton Enemy Sheet\/skeleton retro colors\.png$/i.test(p), base: 'Skeleton', variant: 'Retro' },
    { test: (p) => /Skeleton Enemy Sheet\/skeleton full white\.png$/i.test(p), base: 'Skeleton', variant: 'Full White' },
    { test: (p) => /Skeleton Enemy Sheet\/skeleton red\.png$/i.test(p), base: 'Skeleton', variant: 'Red' },
    { test: (p) => /Skeleton Enemy Sheet\/skeleton gold\.png$/i.test(p), base: 'Skeleton', variant: 'Gold' },
    { test: (p) => /Skeleton Enemy Sheet\/skeleton ghost\.png$/i.test(p), base: 'Skeleton', variant: 'Ghost' },
    // #683 (Han: "maid has a toggler 'normal/full' and color setter") — the data model has one `variant`
    // dimension; both are folded into it as "{Color}"/"{Color} (Full)" (same technique as Knighty's
    // Colour×Heavy/Run combos, §682) — renders as text-pill toggles rather than true colour swatches (same
    // trade-off already shipped for Knighty), since `variantColor()` only exact-matches a bare colour word.
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full black\.png$/i.test(p), base: 'Maid', variant: 'Black (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full blue\.png$/i.test(p), base: 'Maid', variant: 'Blue (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full brown\.png$/i.test(p), base: 'Maid', variant: 'Brown (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full green\.png$/i.test(p), base: 'Maid', variant: 'Green (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full purple\.png$/i.test(p), base: 'Maid', variant: 'Purple (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full red\.png$/i.test(p), base: 'Maid', variant: 'Red (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full white\.png$/i.test(p), base: 'Maid', variant: 'White (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character full yellow\.png$/i.test(p), base: 'Maid', variant: 'Yellow (White Accent)' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character black\.png$/i.test(p), base: 'Maid', variant: 'Black' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character blue\.png$/i.test(p), base: 'Maid', variant: 'Blue' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character brown\.png$/i.test(p), base: 'Maid', variant: 'Brown' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character green\.png$/i.test(p), base: 'Maid', variant: 'Green' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character purple\.png$/i.test(p), base: 'Maid', variant: 'Purple' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character red\.png$/i.test(p), base: 'Maid', variant: 'Red' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character white\.png$/i.test(p), base: 'Maid', variant: 'White' },
    { test: (p) => /GandalfHardcore Maid Character\/Maid Character yellow\.png$/i.test(p), base: 'Maid', variant: 'Yellow' },
    // #693 (Han 2026-08-04, critters batch round 2: "human baby... met 3 kleurvarianten: light, dark,
    // yellow") — the 3 files are just numbered ("Sprite Sheet"/"2"/"3"), no colour word in the filename;
    // read in that exact numeric order as light/dark/yellow per Han's list order — NOT independently
    // verified pixel-by-pixel (same flagged-assumption convention as Zombie's v1-v4 colours, §683).
    { test: (p) => /\/animals\/critters\/Human Baby Sprite Sheet\.png$/i.test(p), base: 'Human Baby', variant: 'Light' },
    { test: (p) => /\/animals\/critters\/Human Baby Sprite Sheet 2\.png$/i.test(p), base: 'Human Baby', variant: 'Dark' },
    { test: (p) => /\/animals\/critters\/Human Baby Sprite Sheet 3\.png$/i.test(p), base: 'Human Baby', variant: 'Yellow' },
];

// ═══ SECTION: ROW LABELS ═══
const ROW_LABELS = ['Idle', 'Move', 'Attack', 'Death'];
// #669 (Han: "cows: idle, walk, graze" / "pigs: idle, walk, sniff") — positional row labels for packs
// where the generic Idle/Move/Attack/Death guess would be wrong.
const ROW_LABEL_OVERRIDES = [
    { test: (p) => /farm\/cow/i.test(p), labels: ['Idle', 'Walk', 'Graze'] },
    { test: (p) => /farm\/pig/i.test(p), labels: ['Idle', 'Walk', 'Sniff'] },
    // #670 (Han: "imp: idle, eat, walk, fly, death")
    { test: (p) => /creatures_ground\/Imp\.png$/i.test(p), labels: ['Idle', 'Eat', 'Walk', 'Fly', 'Death'] },
    // #670 (Han: "female hell giant: enkel idle")
    { test: (p) => /Female Hell Giant/i.test(p), labels: ['Idle'] },
    // #670 (Han: "flying eye, moquito, demon eye, demon fly, demon mine: fly, death" — 2-row relabel;
    // "demon fly" has no exact filename match, read as "Plague Flies" — closest air-folder creature,
    // flagged as an assumption for Han to correct if wrong).
    { test: (p) => /Demon eye\.png$/i.test(p), labels: ['Fly', 'Death'] },
    { test: (p) => /Demon Mine\.png$/i.test(p), labels: ['Fly', 'Death'] },
    { test: (p) => /Plague Flies\.png$/i.test(p), labels: ['Fly', 'Death'] },
    // #671 (Han: "damneds, orc, mummy: idle, walk, attack, death" — except damned bloated and damned tree,
    // handled separately below).
    { test: (p) => /creature_humanoid\/(damned|Mummy|Orc)/i.test(p) && !/damned bloated|damned tree/i.test(p), labels: ['Idle', 'Walk', 'Attack', 'Death'] },
    { test: (p) => /damned bloated\.png$/i.test(p), labels: ['Idle', 'Move', 'Death'] },
    // #676 (Han: "archer: idle, shoot, move, hit, death") — all 8 colour variants + the plain sheet.
    { test: (p) => /char_with_attack\/GandalfHardcore Archer.*sheet\.png$/i.test(p), labels: ['Idle', 'Shoot', 'Move', 'Hit', 'Death'] },
    // #676 (Han: "beekeeper attack -> beekeeper pose") — 3rd row relabelled, first two left as-is.
    { test: (p) => /char_with_walk\/Beekeeper/i.test(p), labels: ['Idle', 'Move', 'Pose'] },
    // #693 (Han 2026-08-04, critters batch round 2: "portals: rij 1 idle, rij 2 appear, rij 3 dissappear")
    { test: (p) => /\/animals\/critters\/(Green|Purple) Portal/i.test(p), labels: ['Idle', 'Appear', 'Disappear'] },
    // #693 (Han: "human baby (idle, move, idle2, cry, feed, poop; met 3 kleurvarianten: light, dark, yellow)")
    { test: (p) => /\/animals\/critters\/Human Baby Sprite Sheet/i.test(p), labels: ['Idle', 'Move', 'Idle2', 'Cry', 'Feed', 'Poop'] },
];
function labelsFor(relPath) {
    return ROW_LABEL_OVERRIDES.find((o) => o.test(relPath))?.labels || ROW_LABELS;
}
// ═══ SECTION: PIXEL SCANNING ═══
const ALPHA_THRESHOLD = 10;
function hasContent(data, width, fx, fy, fw, fh) {
    for (let y = fy; y < fy + fh; y++) {
        for (let x = fx; x < fx + fw; x++) {
            if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) return true;
        }
    }
    return false;
}

// Generic per-row scan: for a given (possibly overridden) frame size, find each row's real content-frame
// count (stopping at the first fully-transparent cell) and the union crop rectangle. Returns raw per-row
// `{row, frames}` counts — callers turn that into positionally-labelled `animations` (or, for irregular
// packs like the horse, ignore this entirely and hand-write `animations` directly).
function scanRows(data, width, height, frame) {
    const cols = Math.max(1, Math.floor(width / frame.w));
    const rows = Math.max(1, Math.floor(height / frame.h));
    const contentRows = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let r = 0; r < rows; r++) {
        let count = 0;
        for (let c = 0; c < cols; c++) {
            const fx = c * frame.w, fy = r * frame.h;
            if (!hasContent(data, width, fx, fy, frame.w, frame.h)) break;
            count++;
            for (let y = fy; y < fy + frame.h; y++) {
                for (let x = fx; x < fx + frame.w; x++) {
                    if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
                        const lx = x - fx, ly = y - fy;
                        if (lx < minX) minX = lx;
                        if (ly < minY) minY = ly;
                        if (lx > maxX) maxX = lx;
                        if (ly > maxY) maxY = ly;
                    }
                }
            }
        }
        if (count > 0) contentRows.push({ row: r, frames: count });
    }
    const crop = Number.isFinite(minX)
        ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
        : { x: 0, y: 0, w: frame.w, h: frame.h };
    return { contentRows, crop };
}

// #671 (Han: "doggies: maak er kleurvarianten van. kan je de kleur samplen?") — the 5 doggy sheets have no
// colour-word filenames (no "black"/"brown"/… to group on, unlike chicken/horse/cow/pig), so instead of a
// hand-picked hex per file (§113's skinSwatchColor approach), this SAMPLES the actual average pixel colour
// of each sheet's non-transparent pixels — genuinely derived from the file, not guessed.
function sampleColor(data) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > ALPHA_THRESHOLD) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    }
    if (!n) return '#999999';
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// #684 (Han 2026-08-04, "goblin portraits kleuren niet mee, pak de juiste portraits (ze zijn raar
// genummerd)"): §683's whole-sprite average-colour match failed — goblins are mostly the SAME green skin
// tone regardless of clothing/weapon colour, so the average RGB barely differed between variants (5 of 6
// resolved to the same portrait). Replaced with an EXPLICIT mapping, determined by visually comparing each
// portrait's dominant HUE (and, for the two hardest-to-tell-apart greens, relative brightness/saturation)
// against each sheet's idle-frame crop — "Portrait 64x64".."64x69" are numbered in NO discernible order.
// Bright Green ↔ Dark Green were the closest call (both hue≈150°); resolved by saturation (Bright Green's
// sheet reads distinctly more vivid/saturated than Dark Green's muted, grey-tinted green) — flagged as the
// one pairing worth a second look if it turns out wrong.
// ═══ SECTION: GENERIC ANALYZE ═══
const GOBLIN_PORTRAIT_BY_VARIANT = {
    Green: 'Portrait 64x64.png',
    Lime: 'Portrait 64x65.png',
    'Dark Green': 'Portrait 64x66.png',
    Brown: 'Portrait 64x67.png',
    Red: 'Portrait 64x68.png',
    'Bright Green': 'Portrait 64x69.png',
};

function analyze(absPath, relPath) {
    const buf = readFileSync(absPath);
    const png = PNG.sync.read(buf);
    const { width, height, data } = png;
    const frame = frameOverrideFor(relPath) || guessFrameSize(width, height);
    const { contentRows, crop } = scanRows(data, width, height, frame);
    if (!contentRows.length) return null;

    // #669 (Han: "sleeping dragon: een lange loop: idle") — ALL cells (row-major across every row of the
    // 5x5 grid) are ONE continuous idle loop, not one animation per row.
    if (/animals\/Sleeping Dragon\.png$/i.test(relPath)) {
        const cells = contentRows.flatMap(({ row, frames }) => rowCells(row, frames));
        return { width, height, frame, crop, animations: [{ key: 'idle', label: 'Idle', cells }], contentRows };
    }

    const labels = labelsFor(relPath);
    const animations = contentRows.map(({ row, frames }, i) => ({
        key: (labels[i] || `Row ${row}`).toLowerCase(), label: labels[i] || `Row ${row}`,
        cells: rowCells(row, frames),
    }));
    return { width, height, frame, crop, animations, contentRows };
}

// #673 (Han 2026-08-03, fifth follow-up: "characters sheet 1 tm 6 zijn kleurvarianten ... 5 frames passief,
// 2 per rij" + "sheet1, sheet2, sheet3 (dus aan elkaar) zelfde stramien" with a different roster): each of
// these composite sheets packs TWO named characters per row (5 idle frames each, cols 0-4 and 5-9) — a full
// custom expansion, like `expandCritters`, but keyed by an explicit row→[leftName,rightName] roster instead
// of positional labels, since these are DIFFERENT characters, not animations of one creature. `variant` is
// the sheet number (a real colour-palette swap across all rows at once, confirmed by Han: "zijn
// kleurvarianten"). Cat/Cat Hat/Dog/Dog Helmet are pulled into the 'animal' category (Han: "show in pets").
// ═══ SECTION: ROSTER SHEETS ═══
const ANIMAL_ROSTER_NAMES = new Set(['Cat', 'Cat Hat', 'Dog', 'Dog Helmet']);
// #682 (Han 2026-08-04: "cat hat is een variant van cat" / "dog hat is een variant van dog") — these were
// separate roster names (→ separate creatures); now grouped as {base, variant} pairs so they merge into ONE
// creature with a Hat/Helmet toggle, like every other roster colour-variant.
const ROSTER_NAME_VARIANTS = {
    'Cat Hat': { base: 'Cat', variant: 'Hat' },
    'Dog Helmet': { base: 'Dog', variant: 'Helmet' },
};
// #678 (Han 2026-08-03, tenth follow-up: "satyr -> musicians")
const MUSICIAN_ROSTER_NAMES = new Set(['Satyr']);
// #682 (Han 2026-08-04, new "mature" category — every roster-sheet name Han listed for it): checked the
// same way ANIMAL_ROSTER_NAMES/MUSICIAN_ROSTER_NAMES already are, so these names route to 'mature' instead
// of whichever folder-category the source sheet would otherwise assign.
// #684 (Han 2026-08-04, "wissel lady flower (met 3 varianten) van mature naar passive" + "wissel lady
// flower plain van passive naar mature"): the two swapped places — "Lady Flower" (the roster-1-3 colour
// group) is OUT, "Lady Flower Plain" (the roster-4 singleton, §682's split-apart-from-Lady-Flower name) is
// IN — this Set is checked uniformly by `expandRosterSheet()` regardless of which roster table (spaced/
// unspaced/sheet-4) it's iterating, so both live in the same list.
const MATURE_ROSTER_NAMES = new Set([
    'Ladies Bare', 'Lady Back', 'Lady Pose', 'Posing Lady Pose 1', 'Posing Lady Pose 2', 'Posing Lady Pose 3',
    'Nurse', 'Lady Flower Plain', 'Lady Bare Ass', 'Lady Mini Skirt', 'Lady Sitting Stone Bare', 'Lady Skull Witch',
    'Lady Sweeping', 'Maid Backside Bare', 'Maid Backside 2 Bare', 'Maid Frontal Bare', 'Maid Lying Ground Bare',
    'Mermaid', 'Seer',
]);
// rows 1-14, 1-indexed to match Han's "rij N" notation directly (converted to 0-indexed inside the loop).
const ROSTER_SHEETS_SPACED = {
    1: ['Hugging Ladies', 'Lady Sitting'],
    2: ['Lady Back', 'Lady Pose'],
    3: ['Lady Lying', 'Ladies Bare'],
    // #673: "rij4 posing lady (pose1, pose2); rij5 eerste 5 pose3 - dus 3 varianten" — read as ONE
    // character with 3 POSE variants (not a colour dimension) spanning row4's both slots + row5's left
    // slot; simplified to 3 separate creature names (each still gets the 6 sheet-colour variants) rather
    // than building 2-dimensional (pose × colour) variant selection — flagged as a scope simplification.
    4: ['Posing Lady Pose 1', 'Posing Lady Pose 2'],
    5: ['Posing Lady Pose 3', 'Lady Fancy'],
    6: ['Guard Bow', 'Guard Crossbow'],
    7: ['Guard Axe', 'Guard Short Sword'],
    8: ['Guard Short Crossbow', 'Lady Leg'],
    9: ['Artist Statue', 'Artist Painter'],
    // #687 (Han 2026-08-04, Maid mega-merge): renamed from plain 'Maid' — that name now belongs to the
    // detailed "Maid Character" bestiary group (colours/full/sheet2/combat/sword-down); this roster slot is
    // a different, much simpler palette-swapped character and would otherwise collide (same base → merged
    // into one card with mismatched variants "Sheet 1/2/3" alongside the colour swatches).
    10: ['Maid (Roster)', 'Nurse'],
    11: ['Lady Potions', 'Lady Flower'],
    12: ['Jester', 'Lady Goth'],
    13: ['Wizard', 'Satyr'],
    14: ['Monk', null],   // only one name given for this row — right slot left unnamed, skipped
};
const ROSTER_SHEETS_UNSPACED = {
    1: ['Lady Bar', 'Maid Sewing'],
    2: ['Maid Pregnant', 'Maid Dress Leaning'],
    3: ['Maid Dress Sitting Chair', 'Maid Dress Sitting Ground'],
    4: ['Maid Reading', 'Maid Lying Ground'],
    5: ['Maid Lying Ground Bare', 'Maid Frontal Bare'],
    6: ['Maid Backside Bare', 'Maid Backside 2 Bare'],
    7: ['Cat', 'Cat Hat'],
    8: ['Dog', 'Dog Helmet'],
    9: ['Guard Squat', 'Guard Shield'],
    10: ['Guard Beer', 'Guard Lute'],
    11: ['Executioner Squat', 'Lumberjack'],
    12: ['Butcher', 'Witch'],
    13: ['Lady Basket', 'Male Noble'],
    14: ['Cook', 'Musketeer'],
    15: ['Mermaid', 'Seer'],
};
// #676 (Han 2026-08-03, eighth follow-up: "ik maakte een fout. char sheet 4, 5 en 6 zijn geen kleurvarianten
// maar eigen chars.") — corrects §673: sheets 4/5/6 do NOT share sheets 1-3's roster as colour variants.
// Only sheet 4's real roster was given (below) — sheets 5/6 are SKIPPED (not pushed at all) rather than
// mislabelled with a guess, since Han hasn't provided their content yet.
const ROSTER_SHEET_4 = {
    1: ['Man Sharpening', 'Plague Doctor'],
    2: ['Man Tabbard Idle', 'Man Blacksmith'],
    3: ['Lady Sweeping', 'Roman Orator'],
    4: ['Roman Man', 'Roman Woman'],
    5: ['Lady Skull Witch', 'Woman Laundry'],
    6: ['Woman Basket Apples', 'Woman Praying'],
    7: ['Lady Bare Ass', 'Lady Can Can'],
    8: ['Lady Corset', 'Lady Mini Skirt'],
    9: ['Lady Tub', 'Lady Beer'],
    10: ['Man Rake', 'Man Pickaxe'],
    11: ['Lady Bar Maid Beers', 'Man Marquise'],
    12: ['Lady Beer Sitting', 'Man Beer'],
    // #682 (Han 2026-08-04: "lady flower -> splitsen plain apart, sheet 1 sheet 2 sheet 3 als groep") — this
    // slot has no colour variant (unlike §673's roster-1-3 "Lady Flower", which DOES get Sheet1/2/3 variants)
    // — renamed so it doesn't merge with that group.
    13: ['Man Barbarian Axe', 'Lady Flower Plain'],
    14: ['Lady Sitting Stone Bare', null],
};

// ═══ SECTION: COLUMN-SHEET EXPANSION ═══
const FRAMES_PER_CHAR = 5;

// Tight crop (union of non-transparent pixel bounds, frame-local) over just the 5 cells belonging to one
// named character — mirrors scanRows' crop math but scoped to a specific cell range instead of a whole row.
function cropForCells(data, width, frame, cells) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { row, col } of cells) {
        const fx = col * frame.w, fy = row * frame.h;
        for (let y = fy; y < fy + frame.h; y++) {
            for (let x = fx; x < fx + frame.w; x++) {
                if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
                    const lx = x - fx, ly = y - fy;
                    if (lx < minX) minX = lx;
                    if (ly < minY) minY = ly;
                    if (lx > maxX) maxX = lx;
                    if (ly > maxY) maxY = ly;
                }
            }
        }
    }
    return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : { x: 0, y: 0, w: frame.w, h: frame.h };
}

// #674 (Han 2026-08-03, sixth follow-up: Camp Characters / Collecting Coin / Knight Cooking / Musicians) —
// each named CHARACTER gets its own manifest entry built from one or more ROWS of one file (content-frame
// counts real-scanned, not assumed) — some are lone rows, some (Knight Cooking's "knight crown cooking")
// span 2 merged rows, same merge pattern as the Devil/Damned Tree. `defs`: [{rows, category, base,
// variant}]. Several entries reuse a `base` already used by an EARLIER file (Han: "variant op ... hierboven")
// — grouping is automatic: bestiaryAssets.js groups by (category, base) regardless of which file the
// variant's pixels came from, exactly like the roster-sheet colour variants (§673).
function expandNamedRows(absPath, relPath, frame, defs) {
    const buf = readFileSync(absPath);
    const png = PNG.sync.read(buf);
    const { width, height, data } = png;
    const { contentRows } = scanRows(data, width, height, frame);
    const framesByRow = Object.fromEntries(contentRows.map((r) => [r.row, r.frames]));
    return defs.map(({ rows, category, base, variant }) => {
        const cells = rows.flatMap((r) => rowCells(r, framesByRow[r] || 1));
        return {
            category, relPath, base, variant, width, height, frame,
            crop: cropForCells(data, width, frame, cells),
            animations: [{ key: 'idle', label: 'Idle', cells }],
        };
    });
}

// #684 (Han 2026-08-04, "verplaats all 4 de spirit blue naar mature. Merge en geef 4 'animaties' on the
// floor, pose back, pose frontal, sword; toggle bare normal en blue brown."): what used to be 4 SEPARATE
// creatures (Spirit Blue Pose Frontal/Pose Back/Lie/Sword, each just a Bare/Normal pairing, §674/§676) is
// now ONE creature, "Spirit Blue" — the 4 poses become ANIMATION buttons on a single variant, and Bare/
// Normal × Blue/Brown becomes the variant toggle (4 variants: Normal, Bare, Brown, Brown Bare). Brown (the
// standalone "Sword Spirit"/"Sword Spirit Bare" files) only HAS sword art — those 2 variants simply get ONE
// animation ('sword') instead of 4; `BestiaryTopPanel` already renders whatever `variant.animations` a
// variant has, so a shorter list for Brown isn't a special case anywhere.
function spiritBlueEntries(charSheetAbsPath, charSheetRelPath, frame) {
    const charBuf = PNG.sync.read(readFileSync(charSheetAbsPath));
    const dir = dirname(charSheetAbsPath);
    const bareAbsPath = join(dir, 'Character sheet bare .png');
    const bareRelPath = charSheetRelPath.replace(/Character sheet\.png$/i, 'Character sheet bare .png');
    const bareBuf = PNG.sync.read(readFileSync(bareAbsPath));
    const swordAbsPath = join(dir, 'Sword Spirit.png');
    const swordRelPath = charSheetRelPath.replace(/Character sheet\.png$/i, 'Sword Spirit.png');
    const swordBuf = PNG.sync.read(readFileSync(swordAbsPath));
    const swordBareAbsPath = join(dir, 'Sword Spirit Bare.png');
    const swordBareRelPath = charSheetRelPath.replace(/Character sheet\.png$/i, 'Sword Spirit Bare.png');
    const swordBareBuf = PNG.sync.read(readFileSync(swordBareAbsPath));

    const { contentRows: charRows } = scanRows(charBuf.data, charBuf.width, charBuf.height, frame);
    const { contentRows: bareRows } = scanRows(bareBuf.data, bareBuf.width, bareBuf.height, frame);
    const framesFor = (rows, row) => rows.find((r) => r.row === row)?.frames || 1;
    const poseAnim = (rows, label, key, row) => ({ key, label, cells: rowCells(row, framesFor(rows, row)) });

    const blueAnims = [
        poseAnim(charRows, 'Pose Frontal', 'posefrontal', 2),
        poseAnim(charRows, 'Pose Back', 'poseback', 3),
        poseAnim(charRows, 'On The Floor', 'onthefloor', 4),
        poseAnim(charRows, 'Sword', 'sword', 5),
    ];
    const bareAnims = [
        poseAnim(bareRows, 'Pose Frontal', 'posefrontal', 0),
        poseAnim(bareRows, 'Pose Back', 'poseback', 1),
        poseAnim(bareRows, 'On The Floor', 'onthefloor', 2),
        poseAnim(bareRows, 'Sword', 'sword', 3),
    ];
    const swordCells = Array.from({ length: Math.round(swordBuf.width / frame.w) }, (_, c) => ({ row: 0, col: c }));
    const swordBareCells = Array.from({ length: Math.round(swordBareBuf.width / frame.w) }, (_, c) => ({ row: 0, col: c }));

    return [
        {
            category: 'mature', relPath: charSheetRelPath, base: 'Spirit Blue', variant: 'Normal',
            width: charBuf.width, height: charBuf.height, frame,
            crop: cropForCells(charBuf.data, charBuf.width, frame, blueAnims.flatMap((a) => a.cells)),
            animations: blueAnims,
        },
        {
            category: 'mature', relPath: bareRelPath, base: 'Spirit Blue', variant: 'Bare',
            width: bareBuf.width, height: bareBuf.height, frame,
            crop: cropForCells(bareBuf.data, bareBuf.width, frame, bareAnims.flatMap((a) => a.cells)),
            animations: bareAnims,
        },
        {
            category: 'mature', relPath: swordRelPath, base: 'Spirit Blue', variant: 'Brown',
            width: swordBuf.width, height: swordBuf.height, frame,
            crop: cropForCells(swordBuf.data, swordBuf.width, frame, swordCells),
            animations: [{ key: 'sword', label: 'Sword', cells: swordCells }],
        },
        {
            category: 'mature', relPath: swordBareRelPath, base: 'Spirit Blue', variant: 'Brown Bare',
            width: swordBareBuf.width, height: swordBareBuf.height, frame,
            crop: cropForCells(swordBareBuf.data, swordBareBuf.width, frame, swordBareCells),
            animations: [{ key: 'sword', label: 'Sword', cells: swordBareCells }],
        },
    ];
}

// #675 (Han 2026-08-03, seventh follow-up: "toon bij portrait characters links de avatar met animatie-
// variaties, en rechts het portret (groot)"): the Male/Female Pixel Art character sheets are COLUMN-based —
// each of the 11 columns is a DIFFERENT named character (not a colour variant), and within one column the
// animation frames are stacked VERTICALLY: row0 = portrait (already a separate embedded cell, but the
// standalone "…Portrait large{N}.png" file is used instead — same character, much bigger image, matching
// Han's "toon het groot"), rows1-5 = idle (5 frames), rows6-13 = walk (8 frames). `names[col]` order matches
// the order Han listed them in (left-to-right column order is an assumption — flagged).
const IDLE_ROWS_COLSHEET = [1, 2, 3, 4, 5];
const WALK_ROWS_COLSHEET = [6, 7, 8, 9, 10, 11, 12, 13];
// #687 (Han 2026-08-04, "de succubus heeft breedte 128 (maar het portret is 64x64) dus de goddess moet
// doorschuiven, en de maid ook"): the Female sheet's Succubus column is DOUBLE-WIDE (128px, spanning 2 of
// the sheet's native 64px column slots) while every other column (including Succubus's OWN portrait file)
// stays 64px — `wideNames` (a Set of character names that consume 2 native columns) lets ONE name's frame/
// crop use a 128px-wide cell while every name after it still reads from the correct native pixel column
// (tracked via a running `nativeCol` cursor, not the plain array index `expandColumnSheet` used before this
// only had to handle uniform-width sheets, e.g. the Male sheet, which still calls this unchanged).
function expandColumnSheet(absPath, relPath, category, names, portraitRelPathFor, wideNames = new Set()) {
    const buf = readFileSync(absPath);
    const png = PNG.sync.read(buf);
    const { width, height, data } = png;
    let nativeCol = 0;
    return names.map((name, idx) => {
        const span = wideNames.has(name) ? 2 : 1;
        const frame = { w: 64 * span, h: 64 };
        const col = nativeCol / span;   // this entry's own column index, in units of ITS OWN frame width
        nativeCol += span;
        const idleCells = IDLE_ROWS_COLSHEET.map((row) => ({ row, col }));
        const walkCells = WALK_ROWS_COLSHEET.map((row) => ({ row, col }));
        return {
            category, relPath, base: name, variant: null, width, height, frame,
            crop: cropForCells(data, width, frame, [...idleCells, ...walkCells]),
            animations: [{ key: 'idle', label: 'Idle', cells: idleCells }, { key: 'walk', label: 'Walk', cells: walkCells }],
            // portraits are separate per-character FILES (not sliced from this sheet), numbered by the
            // character's own sequential index — unaffected by how many pixel columns the main sheet uses.
            portraitRelPath: portraitRelPathFor(idx),
        };
    });
}
// #682 (Han 2026-08-04: "wissel de namen van bisshop en male knight halberd om") — the two labels were
// attached to the wrong physical columns; swapped here (column ORDER is otherwise unchanged/assumed-correct
// per §675, only these two names traded places).
const MALE_PIXEL_ART_NAMES = ['Knight Iron Mask', 'Male Apron', 'Wanderer Dark', 'Male Hood', 'Bishop', 'Male Knight Halberd', 'Dwarf', 'King', 'Male Wood Archer', 'Barrel', 'Male Knight Sword Shield'];
const FEMALE_PIXEL_ART_NAMES = ['Queen', 'Lady Dryad', 'Nun', 'Bar Lady Dancer', 'Female Hood', 'Female Knight Heavy Armor', 'Female Vampire', 'Female Oriental Traveller', 'Female Succubus', 'Female Goddess', 'Female Maid'];
// #687 (Han: "de succubus heeft breedte 128... dus de goddess moet doorschuiven, en de maid ook") —
// Succubus consumes 2 of the sheet's native 64px columns (verified: sheet is 768px = 12 native columns
// for 11 characters); Goddess/Maid still list in the SAME order, just each read one native column further
// right than a plain 1:1 mapping would put them (handled by `expandColumnSheet`'s running cursor).
const FEMALE_WIDE_NAMES = new Set(['Female Succubus']);

// #687 (Han 2026-08-04, "female medieval pixel art character + lantern zijn twee varianten (normal/
// lantern)... de twee harp animaties mogen ook bij de lantern variant getoond worden... zo kan je de vier
// karakters mergen"): the main sheet (640×576 = 10×9) is 9 ROWS = 9 animations in Han's given order; the
// Lantern sheet (576×448 = 9×7) has the SAME first 7 (no harp rows — a lantern-holder can't also hold a
// harp with the same hands). The 2 harp animations are borrowed onto the Lantern variant by pointing their
// `cells` at the NORMAL sheet's own relPath (§687's animation-level relPath override, used here for the
// first time on a "borrow entirely different file" case rather than "one extra bonus file per colour").
// "Harp.png"/"Lantern.png" (a single 64×64 prop image and a 16×16 icon) are NOT wired up as overlays — the
// existing `overlayUrls` mechanism assumes the overlay shares the base sprite's OWN cell grid (Doggy's hat/
// backpack, §671), which neither prop does; flagged as a follow-up rather than a fragile one-off hack.
const MEDIEVAL_ANIM_META = [
    { key: 'idle', label: 'Idle' }, { key: 'walk', label: 'Walk' }, { key: 'run', label: 'Run' },
    { key: 'airup', label: 'Air Up' }, { key: 'airdown', label: 'Air Down' }, { key: 'hit', label: 'Hit' },
    { key: 'death', label: 'Death' }, { key: 'playingharp', label: 'Playing Harp' }, { key: 'separateharp', label: 'Separate Harp' },
];
function femaleMedievalEntries(category, normalAbsPath, normalRelPath, lanternAbsPath, lanternRelPath) {
    const frame = { w: 64, h: 64 };
    const nBuf = PNG.sync.read(readFileSync(normalAbsPath));
    const lBuf = PNG.sync.read(readFileSync(lanternAbsPath));
    const { contentRows: nRows } = scanRows(nBuf.data, nBuf.width, nBuf.height, frame);
    const { contentRows: lRows } = scanRows(lBuf.data, lBuf.width, lBuf.height, frame);
    const framesFor = (rows, row) => rows.find((r) => r.row === row)?.frames || 1;
    // #689 (Han: "playing harp / separate harp + lantern: zet het lantern frame ook in beeld: dat is gewoon
    // lantern.png") — both harp animations additionally carry a STATIC prop image (`propRelPath`, resolved
    // to its own `propUrl` in bestiaryAssets.js and drawn as a small fixed badge by `CreatureSprite` —
    // unlike `overlayUrls`/§671, this prop is a single 16×16 icon, not a per-cell-matched animated layer).
    const LANTERN_PROP = normalRelPath.replace(/Female Medieval Pixel Art character\.png$/i, 'Lantern.png');
    const animFor = (rows, row, relPathOverride) => {
        const { key, label } = MEDIEVAL_ANIM_META[row];
        const cells = rowCells(row, framesFor(rows, row));
        const isHarp = key === 'playingharp' || key === 'separateharp';
        return {
            key, label, cells,
            ...(relPathOverride ? { relPath: relPathOverride } : {}),
            ...(isHarp ? { propRelPath: LANTERN_PROP } : {}),
        };
    };
    const normalAnims = MEDIEVAL_ANIM_META.map((_, row) => animFor(nRows, row));
    const lanternAnims = [
        ...MEDIEVAL_ANIM_META.slice(0, 7).map((_, row) => animFor(lRows, row)),
        animFor(nRows, 7, normalRelPath), animFor(nRows, 8, normalRelPath),
    ];
    return [
        {
            category, relPath: normalRelPath, base: 'Female Medieval Pixel Art Character', variant: 'Normal',
            width: nBuf.width, height: nBuf.height, frame,
            crop: cropForCells(nBuf.data, nBuf.width, frame, normalAnims.flatMap((a) => a.cells)),
            animations: normalAnims,
        },
        {
            category, relPath: lanternRelPath, base: 'Female Medieval Pixel Art Character', variant: 'Lantern',
            width: lBuf.width, height: lBuf.height, frame,
            crop: cropForCells(lBuf.data, lBuf.width, frame, lanternAnims.filter((a) => !a.relPath).flatMap((a) => a.cells)),
            animations: lanternAnims,
        },
    ];
}

function expandRosterSheet(absPath, relPath, category, roster, variant) {
    const buf = readFileSync(absPath);
    const png = PNG.sync.read(buf);
    const { width, height, data } = png;
    const frame = { w: 64, h: 64 };
    const entries = [];
    for (const [rowStr, names] of Object.entries(roster)) {
        const row = Number(rowStr) - 1;
        names.forEach((name, slot) => {
            if (!name) return;
            const colStart = slot * FRAMES_PER_CHAR;
            const cells = Array.from({ length: FRAMES_PER_CHAR }, (_, i) => ({ row, col: colStart + i }));
            // #682: a roster name may itself be a VARIANT of another roster name (Cat Hat → Cat+Hat) — that
            // overrides the sheet-level `variant` (the colour/sheet-number dimension) entirely, since these
            // two names never coexist with a colour-variant roster (§673's colour sheets don't include them).
            const nameVariant = ROSTER_NAME_VARIANTS[name];
            entries.push({
                category: ANIMAL_ROSTER_NAMES.has(name) ? 'animal'
                    : MUSICIAN_ROSTER_NAMES.has(name) ? 'musicians'
                        : MATURE_ROSTER_NAMES.has(name) ? 'mature' : category,
                relPath, base: nameVariant?.base || name, variant: nameVariant?.variant ?? variant, width, height, frame,
                crop: cropForCells(data, width, frame, cells),
                animations: [{ key: 'idle', label: 'Idle', cells }],
            });
        });
    }
    return entries;
}

// ═══ SECTION: SPECIAL ONE-OFF EXPANSIONS ═══
// boss_spider/large skull/devil animation defs moved to scripts/bestiary/animationDefs.mjs (#790).

// #671 (Han: "damned tree: rij1: male variant, frame1 idle, rij1 death / rij2: female variant, frame1
// idle, rij1 death") — each ROW is a GENDER, not an animation: column 0 of that row is a single-frame idle
// pose, the rest of the row's content frames are the death sequence. One file → 2 manifest entries (Male/
// Female "variants" of one Damned Tree creature), each with its own idle+death built from its own row.
function damnedTreeEntries(category, relPath, width, height, frame, crop, contentRows) {
    const build = (row, variant) => {
        const total = contentRows.find((r) => r.row === row)?.frames || 1;
        const death = Array.from({ length: Math.max(1, total - 1) }, (_, i) => ({ row, col: Math.min(i + 1, total - 1) }));
        return {
            category, relPath, base: 'Damned Tree', variant, width, height, frame, crop,
            animations: [{ key: 'idle', label: 'Idle', cells: [{ row, col: 0 }] }, { key: 'death', label: 'Death', cells: death }],
        };
    };
    return [build(0, 'Male'), build(1, 'Female')];
}

// #669 (Han: "critters: aparte categorie, het zijn verschillende dieren" — 16 species, one per row, 16x16
// frames). A full custom expansion: one input file → 16 manifest entries, category 'critters' (not
// 'animal' — Han asked for it separate).
const CRITTER_ROWS = [
    ['Frog', ['idle']], ['Frog', ['move']],
    ['Pigeon', ['idle']], ['Pigeon', ['fly']],
    ['Blue Jay', ['idle']], ['Blue Jay', ['fly']],
    ['Rat', ['idle', 'move']],
    ['Snail', ['idle', 'move']],
    ['Turtle', ['idle']], ['Turtle', ['move']],
    ['Firefly', ['fly']], ['Ladybird', ['fly']], ['Fly', ['fly']], ['Butterfly', ['fly']],
    ['Mosquito', ['fly']], ['Dragonfly', ['fly']],
];
function expandCritters(absPath, relPath, category) {
    const buf = readFileSync(absPath);
    const png = PNG.sync.read(buf);
    const { width, height, data } = png;
    const frame = { w: 16, h: 16 };   // 80x256 / 16 rows = 16px rows; 80/16 = 5 cols — matches the auto-guess
    const entries = [];
    // Two consecutive CRITTER_ROWS entries sharing a species name (frog/pigeon/blue jay/turtle: idle+move
    // rows) merge into ONE creature with 2 animation keys; single-row species (rat/snail: idle+move on the
    // SAME row; the rest: one 'fly' row) are one creature with 1-2 animation keys pointing at the same row.
    let row = 0;
    let i = 0;
    while (i < CRITTER_ROWS.length) {
        const [name, keys] = CRITTER_ROWS[i];
        const nextIsSameName = CRITTER_ROWS[i + 1]?.[0] === name && CRITTER_ROWS[i + 1][1].length === 1 && keys.length === 1;
        const rowsForThis = nextIsSameName ? [row, row + 1] : [row];
        const { contentRows } = scanRows(data, width, height, frame);
        const framesByRow = Object.fromEntries(contentRows.map((r) => [r.row, r.frames]));
        const animations = nextIsSameName
            ? [
                { key: keys[0], label: cap(keys[0]), cells: rowCells(rowsForThis[0], framesByRow[rowsForThis[0]] || 1) },
                { key: CRITTER_ROWS[i + 1][1][0], label: cap(CRITTER_ROWS[i + 1][1][0]), cells: rowCells(rowsForThis[1], framesByRow[rowsForThis[1]] || 1) },
            ]
            : keys.map((k) => ({ key: k, label: cap(k), cells: rowCells(row, framesByRow[row] || 1) }));
        entries.push({
            category, relPath, base: name, variant: null, width, height, frame,
            crop: { x: 0, y: 0, w: frame.w, h: frame.h },   // uniform small sheet — no per-cell crop needed
            animations,
        });
        i += nextIsSameName ? 2 : 1;
        row += rowsForThis.length;
    }
    return entries;
}

// #692 (Han 2026-08-04, "evil wizard.png. rij 1: wizard evil, rij 2: wizard skeleton"): another "one file,
// several DIFFERENT creatures stacked as rows" sheet, same shape as `expandCritters` above — row 0 is one
// creature (a hooded caster with a glowing orb), row 1 is a DIFFERENT creature (a robed skeleton wizard),
// not two animations of the same creature. Each row's frame count is auto-detected via `scanRows` like
// every other pack (no hand-counted frame numbers needed here — both rows fill the full 12-column grid).
function expandEvilWizard(absPath, relPath, category) {
    const buf = readFileSync(absPath);
    const png = PNG.sync.read(buf);
    const { width, height, data } = png;
    const frame = { w: 64, h: 64 };   // char_passive blanket rule (§672) — matches this file exactly (768×128).
    const { contentRows } = scanRows(data, width, height, frame);
    // #693 (Han 2026-08-04, round 2: "noem evil wizard -> wizard evil") — matches the "Wizard Skeleton"
    // naming convention (Wizard first) for the sibling row.
    const ROW_BASES = ['Wizard Evil', 'Wizard Skeleton'];
    return contentRows.map(({ row, frames }) => ({
        category, relPath, base: ROW_BASES[row] || `Evil Wizard Row ${row}`, variant: null,
        width, height, frame, crop: { x: 0, y: 0, w: frame.w, h: frame.h },
        animations: [{ key: 'idle', label: 'Idle', cells: rowCells(row, frames) }],
    }));
}

// ═══ SECTION: MAIN SCAN LOOP ═══
const manifest = [];
// #671 (Han: "maak een toggler voor hat en backpack") — accessories layer ON TOP of whichever Doggy
// variant is selected (same 32×32/6-col/2-row grid as the body sheets, so cells line up); kept OUT of the
// normal creature/variant manifest and exposed as its own map, keyed by the creature `base` they apply to.
const ACCESSORIES = {};

let doggyIndex = 0;
for (const [category, folders] of Object.entries(CATEGORY_FOLDERS)) {
    for (const folder of folders) {
        const dir = join(ROOT, folder);
        let files;
        try { files = listPngs(dir); } catch { continue; }
        for (const absPath of files) {
            // #692 (Han, "labelen"): underscore-separated filenames ("Bat_Sprite_Sheet.png") normalize to
            // spaces FIRST so the trailing "Sprite Sheet" strip (`stripBrand`, further below) still fires.
            let name = absPath.split(/[/\\]/).pop().replace(/\.png$/i, '').replace(/_/g, ' ');
            if (isCurated(name)) continue;
            if (EXCLUDED_NAME.test(name)) continue;
            if (DUPLICATE_DOWNLOAD_NAME.test(name)) continue;
            // #692 (Han 2026-08-04, "heel veel critters" batch, "labelen"): the curated "Basic Animal/
            // Vermin/Magical Animations" packs name each file in camelCase with NO spaces (e.g.
            // "PlagueBat.png") while their CONTAINING FOLDER already has the nice human label ("Plague
            // Bat") — use the folder name whenever it's the same word sequence as the filename, just
            // spaced/cased differently (generic normalize-and-compare, §6c — not a per-creature table).
            const parentFolder = absPath.split(/[/\\]/).slice(-2, -1)[0];
            const alnumOnly = (s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (parentFolder && alnumOnly(parentFolder) === alnumOnly(name)) {
                // "basic magical animations"'s folders are all-lowercase ("water elemental") — Title Case
                // them for display consistency with every other pack's folders ("Plague Bat"); a folder
                // that's ALREADY mixed-case (the animal/vermin packs) is left exactly as authored.
                name = parentFolder === parentFolder.toLowerCase()
                    ? parentFolder.replace(/\b\w/g, (c) => c.toUpperCase())
                    : parentFolder;
            }
            const relPath = `../assets/ASSORTED/characters/${relative(ROOT, absPath).replace(/\\/g, '/')}`;

            // #673 (Han: "characters sheet 1 tm 6 zijn kleurvarianten" / "sheet1, sheet2, sheet3 ... zelfde
            // stramien" [different roster]) — matched BEFORE the generic per-file path since these are full
            // custom expansions, not single creatures.
            const spacedSheet = /characters sheet (\d)$/i.exec(name);
            const unspacedSheet = /characters sheet(\d)$/i.exec(name);
            if (spacedSheet) {
                const n = Number(spacedSheet[1]);
                // #676: sheets 1-3 are colour variants (unchanged); sheet 4 has its OWN roster (no shared
                // `variant` — each name stands alone); sheets 5/6 skipped (roster not given yet).
                if (n <= 3) manifest.push(...expandRosterSheet(absPath, relPath, category, ROSTER_SHEETS_SPACED, `Sheet ${n}`));
                else if (n === 4) manifest.push(...expandRosterSheet(absPath, relPath, category, ROSTER_SHEET_4, null));
                continue;
            }
            if (unspacedSheet) {
                manifest.push(...expandRosterSheet(absPath, relPath, category, ROSTER_SHEETS_UNSPACED, `Sheet ${unspacedSheet[1]}`));
                continue;
            }

            if (PET_ACCESSORY.test(name)) {
                const key = /hat/i.test(name) ? 'hat' : 'backpack';
                (ACCESSORIES.Doggy ||= []).push({ key, label: cap(key), relPath });
                continue;
            }

            // #671 doggy sheets: group as ONE "Doggy" creature, variant swatch colour SAMPLED from the
            // actual pixels (no colour-word filenames to group on, unlike chicken/horse/cow/pig).
            if (DOGGY_BODY.test(relPath)) {
                doggyIndex += 1;
                let da;
                try { da = analyze(absPath, relPath); } catch (e) { console.warn('skip (decode failed):', absPath, e.message); continue; }
                if (!da) continue;
                delete da.contentRows;
                const buf = readFileSync(absPath);
                const swatchColor = sampleColor(PNG.sync.read(buf).data);
                manifest.push({ category, relPath, base: 'Doggy', variant: `Style ${doggyIndex}`, swatchColor, ...da });
                continue;
            }

            if (/critters sheet\.png$/i.test(relPath)) {
                manifest.push(...expandCritters(absPath, relPath, 'critters'));
                continue;
            }

            // #692 (Han: "evil wizard.png. rij 1: wizard evil, rij 2: wizard skeleton") — one file, two
            // different creatures (see `expandEvilWizard` above).
            if (/char_passive\/Evil Wizard\.png$/i.test(relPath)) {
                manifest.push(...expandEvilWizard(absPath, relPath, category));
                continue;
            }

            // #682 (Han 2026-08-04: "bathmaids: splits in 4. met normal en bare variant (merge de set)") —
            // measured Bathmaids Covered.png/Bathmaids bare.png: BOTH 320×256 = 5 cols × 4 rows, all rows
            // full — a 1:1 row pairing (same layout in both files), so this reads both together and pushes
            // 4 creatures × 2 variants (Normal from Covered, Bare from the bare file) in one pass; the plain
            // "Bathmaids bare.png" iteration is skipped below (`EXCLUDED_NAME`-style continue) so it isn't
            // ALSO scanned standalone by the generic analyze() path.
            if (/char_passive\/Bathmaids Covered\.png$/i.test(relPath)) {
                const bareAbsPath = absPath.replace(/Covered\.png$/i, 'bare.png');
                const bareRelPath = relPath.replace(/Covered\.png$/i, 'bare.png');
                const frame64 = { w: 64, h: 64 };
                const coveredBuf = PNG.sync.read(readFileSync(absPath));
                const bareBuf = PNG.sync.read(readFileSync(bareAbsPath));
                for (let row = 0; row < 4; row++) {
                    const cells = rowCells(row, 5);
                    const base = `Bathmaid ${row + 1}`;
                    manifest.push({
                        category: 'mature', relPath, base, variant: 'Normal', width: coveredBuf.width, height: coveredBuf.height, frame: frame64,
                        crop: cropForCells(coveredBuf.data, coveredBuf.width, frame64, cells),
                        animations: [{ key: 'idle', label: 'Idle', cells }],
                    });
                    manifest.push({
                        category: 'mature', relPath: bareRelPath, base, variant: 'Bare', width: bareBuf.width, height: bareBuf.height, frame: frame64,
                        crop: cropForCells(bareBuf.data, bareBuf.width, frame64, cells),
                        animations: [{ key: 'idle', label: 'Idle', cells }],
                    });
                }
                continue;
            }
            if (/char_passive\/Bathmaids bare\.png$/i.test(relPath)) continue;   // handled above, paired with Covered

            // #674 (Han: Camp Characters / Collecting Coin / Knight Cooking / Musicians) — several named
            // characters recur across these files (Han: "variant op ... hierboven"); grouping by `base`
            // happens automatically downstream (bestiaryAssets.js), same as §673's roster sheets.
            const CHAR64 = { w: 64, h: 64 };
            if (/Camp Characters\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'passive', base: 'Wizard (Camp)', variant: 'Reading' },
                    { rows: [1], category: 'passive', base: 'Knight Crown', variant: 'Squatting' },
                    { rows: [2], category: 'passive', base: 'Knight Pointy Hat', variant: 'Sharpening' },
                ]));
                continue;
            }
            if (/Collecting Coin\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'passive', base: 'Knight Crown', variant: 'Collecting Coin' },
                    { rows: [1], category: 'passive', base: 'Wizard (Camp)', variant: 'With Bag' },
                    { rows: [2], category: 'passive', base: 'Lady Collecting Coin', variant: null },
                ]));
                continue;
            }
            if (/Knight Cooking\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0, 1], category: 'passive', base: 'Knight Crown', variant: 'Cooking' },
                    { rows: [2], category: 'passive', base: 'Lady Reading', variant: null },
                    { rows: [3], category: 'musicians', base: 'Musician Lyre', variant: null },
                ]));
                continue;
            }
            if (/Musicians\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'musicians', base: 'Drum', variant: null },
                    { rows: [1], category: 'musicians', base: 'Tambourine', variant: null },
                    { rows: [2], category: 'musicians', base: 'Violin', variant: null },
                ]));
                continue;
            }
            // #676 (Han: "tavern npcs zijn 4 personages, splits. lute -> musicians, flute -> musicians,
            // drunk dancing, couple dancing.")
            if (/GandalfHardcore tavern NPCs\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'musicians', base: 'Lute', variant: null },
                    { rows: [1], category: 'musicians', base: 'Flute', variant: null },
                    { rows: [2], category: 'passive', base: 'Drunk Dancing', variant: null },
                    { rows: [3], category: 'passive', base: 'Couple Dancing', variant: null },
                ]));
                continue;
            }
            // #676 (Han: "character sheet zijn allemaal verschillende personages") — 9 rows, 9 different
            // characters; the two "Knight Crown" rows MERGE into the existing "Knight Crown" creature
            // (§674) as two more variants (kneel/no helmet), same cross-file grouping mechanism.
            // #684 (Han 2026-08-04, "verplaats all 4 de spirit blue naar mature. Merge en geef 4
            // 'animaties'... toggle bare normal en blue brown") — rows 2-5 (the 4 Spirit Blue poses) no
            // longer go through `expandNamedRows` as 4 separate creatures; see `spiritBlueEntries()` below.
            if (/char_passive\/Character sheet\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'passive', base: 'Knight Crown', variant: 'Kneel' },
                    { rows: [1], category: 'passive', base: 'Knight Crown', variant: 'No Helmet' },
                    { rows: [6], category: 'passive', base: 'Armorer', variant: null },
                    { rows: [7], category: 'passive', base: 'Nun Dark', variant: null },
                    { rows: [8], category: 'passive', base: 'Lady Cook', variant: null },
                ]));
                manifest.push(...spiritBlueEntries(absPath, relPath, CHAR64));
                continue;
            }
            // #684: "Character sheet bare .png" and "Sword Spirit(.png/ Bare.png)" are now read TOGETHER
            // with "Character sheet.png" inside `spiritBlueEntries()` — skipped here so they aren't ALSO
            // scanned standalone (mirrors the Bathmaids Covered/bare merge pattern, §682).
            if (/char_passive\/Character sheet bare \.png$/i.test(relPath)) continue;
            if (/char_passive\/Sword Spirit( Bare)?\.png$/i.test(relPath)) continue;
            // #689: "Poop Impact sheet.png" is only ever shown as Throwing Poop's portrait (above) — never
            // scanned standalone.
            if (/poop thrower\/Poop Impact sheet\.png$/i.test(relPath)) continue;
            // #693 (Han 2026-08-04, critters batch round 2: "flying brain monster (zet de mind blast in een
            // kader ernaast, zoals arrow)") — same whole-file portrait-companion technique as Poop Impact
            // Sheet/arrow.png; never scanned standalone (paired in PORTRAIT_OVERRIDES_BY_NAME below).
            if (/\/animals\/critters\/Flying Brain Monster Mind Blast\.png$/i.test(relPath)) continue;
            // #693 — "Leaf Elemental S Dormant.png" is only ever shown as the main Leaf Elemental's
            // "Dormant" animation (added below) — never scanned standalone.
            if (/\/animals\/critters\/Leaf Elemental S Dormant\.png$/i.test(relPath)) continue;
            // #687 (Han: "female medieval pixel art character + lantern zijn twee varianten") — read
            // together inside `femaleMedievalEntries()`; the Lantern file is skipped standalone below so
            // it isn't ALSO scanned generically (mirrors the Bathmaids/Spirit Blue pattern above).
            if (/Female Pixel Art Character\/Female Medieval Pixel Art character\.png$/i.test(relPath)) {
                const lanternAbsPath = absPath.replace(/character\.png$/i, 'character Lantern.png');
                const lanternRelPath = relPath.replace(/character\.png$/i, 'character Lantern.png');
                manifest.push(...femaleMedievalEntries(category, absPath, relPath, lanternAbsPath, lanternRelPath));
                continue;
            }
            if (/Female Medieval Pixel Art character Lantern\.png$/i.test(relPath)) continue;
            // #687: "Harp.png" (a single 64×64 prop) and "Lantern.png" (a 16×16 icon) are reference props,
            // not playable creatures — not wired up as overlays (see femaleMedievalEntries' comment above),
            // so they're skipped entirely rather than cluttering the grid as their own broken-looking cards.
            if (/Female Pixel Art Character\/(Harp|Lantern)\.png$/i.test(relPath)) continue;
            // #689 (Han 2026-08-04, "oriental female characters, zijn 6 verschillende: rij 1 en rij 7:
            // oriental laying (normal, bare); rij 2 en rij 8: oriental musician (normal, bare); rij 3:
            // sitting; rij 4: leaning; rij 5: wading -> mature; rij 6: lady lounging -> mature") — 640×512
            // = 10×8, all 8 rows accounted for exactly once.
            if (/char_passive\/Oriental Female Characters \.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'passive', base: 'Oriental Laying', variant: 'Normal' },
                    { rows: [6], category: 'passive', base: 'Oriental Laying', variant: 'Bare' },
                    { rows: [1], category: 'passive', base: 'Oriental Musician', variant: 'Normal' },
                    { rows: [7], category: 'passive', base: 'Oriental Musician', variant: 'Bare' },
                    { rows: [2], category: 'passive', base: 'Oriental Sitting', variant: null },
                    { rows: [3], category: 'passive', base: 'Oriental Leaning', variant: null },
                    { rows: [4], category: 'mature', base: 'Oriental Wading', variant: null },
                    { rows: [5], category: 'mature', base: 'Lady Lounging', variant: null },
                ]));
                continue;
            }
            // #676/#678 (Han: "little person and magician splitsen. rij1 wizard smoking grey hat, rij2
            // froto, rij3 wizard smoking brown hat" → follow-up: "wizard smoking, wissel hoedkleuren" —
            // the two hat colours were swapped from what Han intended; corrected here.
            if (/Little Person and Magician\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'passive', base: 'Wizard Smoking', variant: 'Brown Hat' },
                    { rows: [1], category: 'passive', base: 'Frodo', variant: null },
                    { rows: [2], category: 'passive', base: 'Wizard Smoking', variant: 'Grey Hat' },
                ]));
                continue;
            }
            // #676 (Han: "relaxing characters: noem die lady relaxing 1, 2, 3 (elk een rij) met bare
            // variant") — paired 1:1 with Relaxing Bare characters.png (same row layout).
            if (/char_passive\/Relaxing characters\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'passive', base: 'Lady Relaxing 1', variant: 'Normal' },
                    { rows: [1], category: 'passive', base: 'Lady Relaxing 2', variant: 'Normal' },
                    { rows: [2], category: 'passive', base: 'Lady Relaxing 3', variant: 'Normal' },
                ]));
                continue;
            }
            if (/char_passive\/Relaxing Bare characters\.png$/i.test(relPath)) {
                manifest.push(...expandNamedRows(absPath, relPath, CHAR64, [
                    { rows: [0], category: 'passive', base: 'Lady Relaxing 1', variant: 'Bare' },
                    { rows: [1], category: 'passive', base: 'Lady Relaxing 2', variant: 'Bare' },
                    { rows: [2], category: 'passive', base: 'Lady Relaxing 3', variant: 'Bare' },
                ]));
                continue;
            }
            if (/Wizard with a map\.png$/i.test(relPath)) {
                // #674 (Han: "wizard reading map (variant op wizard hierboven)") — no row breakdown given;
                // merged into ONE idle loop across every content row (mirrors Sleeping Dragon's treatment,
                // §669), grouped as a "Wizard" variant.
                const buf = readFileSync(absPath);
                const png = PNG.sync.read(buf);
                const { contentRows } = scanRows(png.data, png.width, png.height, CHAR64);
                const cells = contentRows.flatMap(({ row, frames }) => rowCells(row, frames));
                manifest.push({
                    category: 'passive', relPath, base: 'Wizard (Camp)', variant: 'Reading Map',
                    width: png.width, height: png.height, frame: CHAR64,
                    crop: cropForCells(png.data, png.width, CHAR64, cells),
                    animations: [{ key: 'idle', label: 'Idle', cells }],
                });
                continue;
            }
            // #675 column-based composite sheets — 11 named characters, portraits paired via the matching
            // numbered "…Portrait{N}.png" (col index + 1). Assumption flagged: left-to-right column
            // order is assumed to match the order Han listed the 11 names in.
            // #693 round 8 BUGFIX (Han: "veel portraits zijn nu enorm ingezoomed"): the "…large{N}.png"
            // files are the SAME portraits at 640×640 (10× upscaled, pixel-identical content) — NOT a
            // different/higher-detail crop. `PortraitImage` (BestiaryPanels.jsx) assumes every portrait is
            // already TRUE 64×64 size (`trueScale = size/64`, no contain-fit) — fed a 640×640 image, it
            // rendered at 10× the intended size and got clipped to a random ~10%-area fragment near the
            // center, i.e. "enormously zoomed in". The plain (non-"large") files are the correct 64×64
            // originals — verified via direct pixel-dimension checks (both 64×64) — swapped in here.
            if (/\bMale Pixel Art characters\.png$/i.test(relPath)) {
                manifest.push(...expandColumnSheet(absPath, relPath, category, MALE_PIXEL_ART_NAMES,
                    (col) => `../assets/ASSORTED/characters/char_with_porttrait/Male Pixel Art characters/Male Pixel Art portrait${col + 1}.png`));
                continue;
            }
            if (/Female Pixel Art characters\.png$/i.test(relPath)) {
                manifest.push(...expandColumnSheet(absPath, relPath, category, FEMALE_PIXEL_ART_NAMES,
                    (col) => `../assets/ASSORTED/characters/char_with_porttrait/Female Pixel Art characters/Female Pixel Art Portrait${col + 1}.png`,
                    FEMALE_WIDE_NAMES));
                continue;
            }

            let analysis;
            try { analysis = analyze(absPath, relPath); } catch (e) { console.warn('skip (decode failed):', absPath, e.message); continue; }
            if (!analysis) continue;   // fully transparent / decode noise — not a real sprite

            // #675 (Han: "de wizards") — the 8 colour-variant portrait-paired wizard sheets.
            if (/char_with_porttrait\/Wizard\/.*Wizard sheet\.png$/i.test(relPath)) analysis.animations = wizardPortraitAnimations();
            // #677 (Han: "santa, vampire lady 2, zij steeds ...")
            if (/(GandalfHardcore Santa Claus|GandalfHardcore Vampire Lady v2)\.png$/i.test(relPath)) analysis.animations = santaVampireAnimations();
            // #689 (Han 2026-08-04, "goddess: idle animatie mag weg (idle frames) walk -> fly en gebruik
            // die als preview") — 832×64 = 13×1, the SAME layout Santa/Vampire use (5 idle + 8 walk cols) —
            // reused, then Han's edit applied: idle dropped, 'walk' renamed to 'fly' (and, being the only
            // animation left, it's automatically what shows by default/as the preview).
            if (/Goddess\/GandalfHardcore Goddess NPC\.png$/i.test(relPath)) {
                analysis.animations = santaVampireAnimations()
                    .filter((a) => a.key !== 'idle')
                    .map((a) => (a.key === 'walk' ? { key: 'fly', label: 'Fly', cells: a.cells } : a));
            }
            // #693 (Han 2026-08-04, round 3: "imp only use the first 6 rows") — 256×384 @ 32×32 = 8×12,
            // auto-detects up to 12 content rows; capped to the first 6.
            if (/\/animals\/critters\/Imp Sprite Sheet\.png$/i.test(relPath)) {
                analysis.animations = analysis.animations.slice(0, 6);
            }
            // #693 (Han 2026-08-04, critters batch round 2: "leaf elemental (voeg dormant toe als anim bij
            // de eerste leaf elemental)") — "Leaf Elemental S Dormant.png" is a single standalone 32×32
            // frame, added as ONE MORE animation with its OWN `relPath` (mirrors the Knighty/Green-Knight-Run
            // cross-file-animation mechanism, §687) rather than a separate creature; skipped from standalone
            // scanning below (mirrors the Poop Impact Sheet/Mind Blast pattern above).
            if (/\/animals\/critters\/Leaf Elemental S Sprite Sheet\.png$/i.test(relPath)) {
                analysis.animations = [
                    ...analysis.animations,
                    { key: 'dormant', label: 'Dormant', cells: [{ row: 0, col: 0 }], relPath: '../assets/ASSORTED/characters/animals/critters/Leaf Elemental S Dormant.png' },
                ];
            }
            // #677/#682 (Han: "knights (heavy en knighty) 69x58"; Heavy re-measured to 91x64, §682) — same
            // animation LAYOUT for both, Heavy's main sheet just has 2 fewer rows (12 vs 14).
            if (/Knight Knighty\/[A-Za-z]+ knight\.png$/i.test(relPath)) analysis.animations = knightyAnimations(14);
            if (/Knight Knighty\/.*Knight [Rr]un\.png$/i.test(relPath)) analysis.animations = knightyRunFastAnimations();
            if (/Knight Heavy\/[A-Za-z]+ heavy ?\.png$/i.test(relPath)) analysis.animations = knightyAnimations(12);
            if (/Knight Heavy\/Heavy Knight Run and Portrait\//i.test(relPath)) analysis.animations = knightyRunFastAnimations();
            if (/Knight Heavy\/.*Heavy Knighty sheet2/i.test(relPath)) analysis.animations = knightHeavySheet2Animations();
            // #683 (Han 2026-08-04)
            if (/char_with_porttrait\/.*Goblin.*sheet\.png$/i.test(relPath)) analysis.animations = goblinAnimations();
            // #689 (Han 2026-08-04, "poop thrower en poop impact sheet horen bij elkaar")
            if (/poop thrower\/Throwing poop\.png$/i.test(relPath)) analysis.animations = poopThrowerAnimations();
            if (/GandalfHardcore Zombie v\d sheet\.png$/i.test(relPath)) analysis.animations = zombieAnimations();
            if (/GandalfHardcore Maid Character\/Maid Character( full)? [a-z]+\.png$/i.test(relPath)) analysis.animations = maidAnimations();
            // #687 (Han 2026-08-04, Maid mega-merge): sheet2/combat/sword-down each get their OWN animation
            // set here; base/variant tagging (grouped later by the merge pass below) happens further down.
            if (/Maid Character 2\/Maid Character2 /i.test(relPath)) analysis.animations = maidSheet2Animations();
            if (/Maid Character 3 Combat\/Maid Combat Sheet /i.test(relPath)) analysis.animations = maidCombatAnimations();
            if (/Maid Character 4\/Maid Walk with sword down Sheet [a-z]+\.png$/i.test(relPath)) analysis.animations = maidSwordDownAnimations();
            // #690 (Han: hat sheets share the SAME grid as their non-hat counterparts)
            if (/GandalfHardcore Maid Witch Hat\/Maid Witch hat sheet1\.png$/i.test(relPath)) analysis.animations = maidAnimations();
            if (/GandalfHardcore Maid Witch Hat\/Maid Witch hat sheet2\.png$/i.test(relPath)) analysis.animations = maidSheet2Animations();
            if (/Maid Character 3 Combat\/Maid Witch hat combat\.png$/i.test(relPath)) analysis.animations = maidCombatAnimations();
            // #689 (Han 2026-08-04)
            if (/Skeleton Enemy Sheet\/skeleton (sheet|retro colors|full white|red|gold|ghost)\.png$/i.test(relPath)) analysis.animations = skeletonAnimations();

            if (/damned tree\.png$/i.test(relPath)) {
                manifest.push(...damnedTreeEntries(category, relPath, analysis.width, analysis.height, analysis.frame, analysis.crop, analysis.contentRows));
                continue;
            }

            // #682 (Han 2026-08-04: "bella donna splitsen in: bella donna (eerste 5 frames) en lady sitting
            // hair bare") — measured 640×64 = ONE row × 10 content frames; splits cleanly in half (5+5, no
            // leftover — same self-consistency check used throughout this generator).
            if (/char_passive\/Bella donna\.png$/i.test(relPath)) {
                const { width, height, frame } = analysis;
                const buf2 = readFileSync(absPath);
                const data2 = PNG.sync.read(buf2).data;
                const firstCells = rowCells(0, 5);
                const restCells = Array.from({ length: 5 }, (_, i) => ({ row: 0, col: 5 + i }));
                manifest.push({
                    category: 'mature', relPath, base: 'Bella Donna', variant: null, width, height, frame,
                    crop: cropForCells(data2, width, frame, firstCells),
                    animations: [{ key: 'idle', label: 'Idle', cells: firstCells }],
                });
                manifest.push({
                    category: 'mature', relPath, base: 'Lady Sitting Hair Bare', variant: null, width, height, frame,
                    crop: cropForCells(data2, width, frame, restCells),
                    animations: [{ key: 'idle', label: 'Idle', cells: restCells }],
                });
                continue;
            }

            // #682 (Han: "split roman female characters idle -> 1, move -> 2 (twee aparte karakters, maar
            // niet in de mature afdeling)") — measured 384×128 = 2 rows × 6 cols; row0 currently reads as
            // 'Idle', row1 as 'Move' (generic ROW_LABELS) — split into two standalone creatures instead of
            // one 2-animation creature. Explicitly NOT routed to 'mature' (Han's own carve-out).
            if (/char_passive\/Roman female Characters\.png$/i.test(relPath)) {
                const { width, height, frame, contentRows } = analysis;
                const buf2 = readFileSync(absPath);
                const data2 = PNG.sync.read(buf2).data;
                contentRows.forEach(({ row, frames }, i) => {
                    const cells = rowCells(row, frames);
                    manifest.push({
                        category, relPath, base: `Roman Female ${i + 1}`, variant: null, width, height, frame,
                        crop: cropForCells(data2, width, frame, cells),
                        animations: [{ key: 'idle', label: 'Idle', cells }],
                    });
                });
                continue;
            }

            // #682 (Han: "lady bee (niet idle move, maar normal bare)") — measured 640×128 = 2 rows × 10
            // cols; was falling to the generic Idle/Move 2-animation guess. Han: these are NORMAL/BARE
            // VARIANTS of one creature (each row a full idle loop), not two animations of one variant.
            if (/char_passive\/Bee Girl\.png$/i.test(relPath)) {
                const { width, height, frame, contentRows } = analysis;
                const buf2 = readFileSync(absPath);
                const data2 = PNG.sync.read(buf2).data;
                const variants = ['Normal', 'Bare'];
                contentRows.forEach(({ row, frames }, i) => {
                    const cells = rowCells(row, frames);
                    manifest.push({
                        category: 'mature', relPath, base: 'Bee Girl', variant: variants[i] || `Row ${row}`,
                        width, height, frame, crop: cropForCells(data2, width, frame, cells),
                        animations: [{ key: 'idle', label: 'Idle', cells }],
                    });
                });
                continue;
            }

            // #682 (Han: "bathing characters (splitsen in lady hair (eerste 5), lady washing foot)") —
            // measured 640×128 = 2 rows × 10 cols, matching the roster-sheet convention (2 named slots per
            // row, 5 frames each, §673) — only the FIRST slot of each row was named; the second slot is
            // skipped, same convention as unnamed roster slots elsewhere (e.g. ROSTER_SHEETS_SPACED row 14).
            if (/char_passive\/Bathing characters\.png$/i.test(relPath)) {
                const { width, height, frame } = analysis;
                const buf2 = readFileSync(absPath);
                const data2 = PNG.sync.read(buf2).data;
                [['Lady Hair', 0], ['Lady Washing Foot', 1]].forEach(([nm, row]) => {
                    const cells = rowCells(row, 5);
                    manifest.push({
                        category: 'mature', relPath, base: nm, variant: null, width, height, frame,
                        crop: cropForCells(data2, width, frame, cells),
                        animations: [{ key: 'idle', label: 'Idle', cells }],
                    });
                });
                continue;
            }

            if (/farm\/horse/i.test(relPath)) analysis.animations = horseAnimations();
            if (/boss_spider\.png$/i.test(relPath)) analysis.animations = boss_spiderAnimations(analysis.contentRows);
            if (/Large Skull\.png$/i.test(relPath)) analysis.animations = largeSkullAnimations(analysis.contentRows);
            if (/The Devil\.png$/i.test(relPath)) analysis.animations = devilAnimations(analysis.contentRows);
            // #674 (Han: "art lady, last frame is 'statue' variant")
            if (/char_passive\/Art lady\.png$/i.test(relPath)) analysis.animations = artLadyAnimations(analysis.contentRows);
            // #676 (Han: "bathtime bare is 128x64 (twee rijen, een animatie)") — merge both rows into ONE
            // idle loop (mirrors Sleeping Dragon's treatment, §669) rather than two separate animations.
            if (/char_passive\/Bathtime( Bare)?\.png$/i.test(relPath)) {
                analysis.animations = [{ key: 'idle', label: 'Idle', cells: analysis.contentRows.flatMap(({ row, frames }) => rowCells(row, frames)) }];
            }

            // #670 (Han: "sla IMP Death ook nog een keer apart op als explosion effect, voor sprites zonder
            // death animation. Zet bij other.") — a reusable generic "death substitute" effect, cloned from
            // Imp's own death row, listed as its own creature under 'other'.
            if (/creatures_ground\/Imp\.png$/i.test(relPath)) {
                const deathAnim = analysis.animations.find((a) => a.key === 'death');
                if (deathAnim) {
                    manifest.push({
                        category: 'other', relPath, base: 'Explosion', variant: null,
                        width: analysis.width, height: analysis.height, frame: analysis.frame, crop: analysis.crop,
                        animations: [{ key: 'explosion', label: 'Explosion', cells: deathAnim.cells }],
                    });
                }
            }

            delete analysis.contentRows;
            const baseOverride = BASE_OVERRIDES.find((o) => o.test(relPath));
            let { base, variant } = baseOverride || parseVariant(name);
            // #675 ("de wizards") — disambiguate from §673's roster "Wizard" and §674's "Wizard (Camp)";
            // `parseVariant` already correctly extracts the colour as `variant` (base would default to
            // "Wizard sheet"), only the BASE needs overriding here.
            const isWizardPortrait = /char_with_porttrait\/Wizard\/.*Wizard sheet\.png$/i.test(relPath);
            if (isWizardPortrait) base = 'Wizard (Portrait)';
            // #677/#682 — `parseVariant` would otherwise give these a bare lowercase "knight"/"heavy" base,
            // colliding visually with the unrelated Knight Crown/Knight Iron Mask/Knight Sword Shield
            // creatures. §682 (Han: "merge alle knight (knighty) animaties met knight (knighty run) (en
            // portret) tot één groep" + "merge alle knight (heavy); dat is een variant op knight knighty") —
            // ALL FIVE sources (Knighty main/run, Heavy main/run/sheet2) now share ONE base, distinguished
            // only by `variant` suffix, so they appear as one creature's variant swatches instead of 4
            // separate bestiary cards.
            // #687 (Han 2026-08-04, Maid mega-merge): sheet2/combat/sword-down are colour-suffixed files
            // just like sheet1 already is (`BASE_OVERRIDES` above) — extracted generically here (not one
            // override line per colour × file-type, ~40 combinations) and tagged with a source suffix so
            // the merge pass below can group them back onto the matching colour's primary 'Maid' entry.
            // "Maid Walk with sword down Sheet.png" (no colour word) and "...Sheet hat.png" are left OUT of
            // this colour grouping — a "Sheet black.png" ALSO exists in the same folder, so the unlabelled
            // file can't be assumed to be Black (that would collide); what it actually represents is
            // unclear without a visual check, so it's left as its own ungrouped fallback entry, flagged.
            const maidColorMatch = /(full )?(black|blue|brown|green|purple|red|white|yellow)/i.exec(name);
            const maidColorVariant = maidColorMatch ? `${cap(maidColorMatch[2].toLowerCase())}${maidColorMatch[1] ? ' (White Accent)' : ''}` : null;
            if (/Maid Character 2\/Maid Character2 /i.test(relPath) && maidColorVariant) { base = 'Maid'; variant = `${maidColorVariant} (Sheet2)`; }
            if (/Maid Character 3 Combat\/Maid Combat Sheet /i.test(relPath) && maidColorVariant) { base = 'Maid'; variant = `${maidColorVariant} (Combat)`; }
            if (/Maid Character 4\/Maid Walk with sword down Sheet [a-z]+\.png$/i.test(relPath) && !/ hat\.png$/i.test(relPath) && maidColorVariant) {
                base = 'Maid'; variant = `${maidColorVariant} (SwordDown)`;
            }
            // #690 (Han: "ik mis de hat toggler, en de hoed staat nog als apart karakter vermeld... de
            // aparte maid hats moeten 'gemerget' worden met maid"): the 2 Witch Hat sheets share sheet1's/
            // sheet2's OWN grid (640×576 and 640×320 respectively — same as the plain Maid sheets), so
            // they get treated as ONE MORE "colour" — literally named "Hat" — merged in the same pass as
            // every other Maid source below. There is only ONE hat sheet (not one per Maid colour), so this
            // becomes a single extra toggle option rather than a true colour×hat combination — flagged.
            if (/GandalfHardcore Maid Witch Hat\/Maid Witch hat sheet1\.png$/i.test(relPath)) { base = 'Maid'; variant = 'Hat'; }
            if (/GandalfHardcore Maid Witch Hat\/Maid Witch hat sheet2\.png$/i.test(relPath)) { base = 'Maid'; variant = 'Hat (Sheet2)'; }
            if (/Maid Character 3 Combat\/Maid Witch hat combat\.png$/i.test(relPath)) { base = 'Maid'; variant = 'Hat (Combat)'; }
            const KNIGHTY_PORTRAIT = '../assets/ASSORTED/characters/char_with_porttrait/Knight Knighty/GandalfHardcore Knight Run and Portrait/Knight Portrait 64x64.png';
            const HEAVY_PORTRAIT = '../assets/ASSORTED/characters/char_with_porttrait/Knight Heavy/Heavy Knight Run and Portrait/Heavy Knight portrait 64x64.png';
            let knightyPortraitOverride;
            if (/Knight Knighty\/[A-Za-z]+ knight\.png$/i.test(relPath)) { base = 'Knight (Knighty)'; knightyPortraitOverride = KNIGHTY_PORTRAIT; }
            if (/Knight Knighty\/.*Knight [Rr]un\.png$/i.test(relPath)) { base = 'Knight (Knighty)'; variant = `${variant || 'Plain'} (Run)`; knightyPortraitOverride = KNIGHTY_PORTRAIT; }
            if (/Knight Heavy\/[A-Za-z]+ heavy ?\.png$/i.test(relPath)) { base = 'Knight (Knighty)'; variant = `${variant || 'Plain'} (Heavy)`; knightyPortraitOverride = HEAVY_PORTRAIT; }
            if (/Knight Heavy\/Heavy Knight Run and Portrait\//i.test(relPath)) { base = 'Knight (Knighty)'; variant = `${variant || 'Plain'} (Heavy Run)`; knightyPortraitOverride = HEAVY_PORTRAIT; }
            if (/Knight Heavy\/.*Heavy Knighty sheet2/i.test(relPath)) { base = 'Knight (Knighty)'; variant = `${variant || 'Plain'} (Heavy Alt)`; knightyPortraitOverride = HEAVY_PORTRAIT; }
            // #683/#684 (Han: "voeg de goblins ook toe aan de portraits" → "kleuren niet mee, pak de juiste
            // portraits") — Goblin's folder has 6 portrait candidates (ambiguous for `PORTRAIT_MAP`'s
            // 1-candidate rule); resolved via the explicit `GOBLIN_PORTRAIT_BY_VARIANT` mapping.
            let goblinPortraitOverride;
            if (/char_with_porttrait\/.*Goblin.*sheet\.png$/i.test(relPath) && GOBLIN_PORTRAIT_BY_VARIANT[variant]) {
                goblinPortraitOverride = `../assets/ASSORTED/characters/char_with_porttrait/GandalfHardcore Goblin sheet/${GOBLIN_PORTRAIT_BY_VARIANT[variant]}`;
            }
            // #687 (Han 2026-08-04, skeleton portraits): "Skeleton Portraits 64x64.png" is ONE 3×2 grid (6
            // cells, one per colour, §675's Wizard-portrait-grid technique reused rather than re-invented) —
            // order given explicitly by Han, so no guessing needed (unlike §675's original Wizard order).
            const SKELETON_PORTRAIT_ORDER = ['Grey', 'Retro', 'Full White', 'Red', 'Gold', 'Ghost'];
            const isSkeletonPortrait = /Skeleton Enemy Sheet\/skeleton (sheet|retro colors|full white|red|gold|ghost)\.png$/i.test(relPath);
            const SKELETON_PORTRAIT_STRIP = '../assets/ASSORTED/characters/char_with_porttrait/GandalfHardcore Skeleton Enemy Sheet/Skeleton Portraits 64x64.png';
            // #689 (Han: "zet de poop impact sheet naast de poop thrower alsof het een portret is") — a
            // 7-frame strip shown whole (no cell/frame crop, unlike Wizard/Skeleton's colour grids) in the
            // portrait slot, purely as a companion reference image.
            const poopPortraitOverride = /poop thrower\/Throwing poop\.png$/i.test(relPath)
                ? relPath.replace(/Throwing poop\.png$/i, 'Poop Impact sheet.png') : undefined;
            // #672 ("de characters met portrait horen altijd bij elkaar")
            const portraitRelPath = knightyPortraitOverride || goblinPortraitOverride || poopPortraitOverride
                || (isSkeletonPortrait ? SKELETON_PORTRAIT_STRIP : undefined)
                || (category === 'portrait' ? PORTRAIT_MAP[dirname(absPath)] : undefined);
            // #675 follow-up (caught before shipping): "64x64 Wizard Portraits.png" isn't ONE portrait — at
            // 256×128 it's an 8-cell (4×2) grid, one crop per colour variant, unlike every other portrait
            // pairing (a lone dedicated file per character). Attaching the raw file would show all 8 colour
            // portraits at once regardless of which colour is selected. `portraitCell` + `portraitFrame` let
            // the renderer crop to just the ONE cell matching this variant instead of showing the whole
            // strip. Assumption flagged: cell order is alphabetical-by-colour (Black,Blue,Brown,Green,
            // Purple,Red,White,Yellow) row-major across the 4×2 grid — not independently verified pixel-by-
            // pixel against the actual portraits.
            // #678 (Han: "wizard: de portretkleuren kloppen niet. in portraits zijn ze gegeven in volgorde:
            // blue red green purple yellow brown black white") — corrects §675's guessed alphabetical order.
            const WIZARD_PORTRAIT_ORDER = ['Blue', 'Red', 'Green', 'Purple', 'Yellow', 'Brown', 'Black', 'White'];
            const portraitCell = isWizardPortrait
                ? { row: Math.floor(WIZARD_PORTRAIT_ORDER.indexOf(variant) / 4), col: WIZARD_PORTRAIT_ORDER.indexOf(variant) % 4 }
                : isSkeletonPortrait
                ? { row: Math.floor(SKELETON_PORTRAIT_ORDER.indexOf(variant) / 3), col: SKELETON_PORTRAIT_ORDER.indexOf(variant) % 3 }
                : undefined;
            const portraitFrame = (isWizardPortrait || isSkeletonPortrait) ? { w: 64, h: 64 } : undefined;
            manifest.push({ category: categoryOverrideFor(relPath, category), relPath, base, variant, portraitRelPath, portraitCell, portraitFrame, ...analysis });
        }
    }
}

// #687 (Han 2026-08-04, "ik wil 1 knight knightly met de verschillende kleuren. De alt animatie (run) mag
// gewoon in de lijst die hoort bij die kleur" + "verplaats de heavy knight alt animaties en het portret
// naar knight (heavy)... heavy + run + sheet 2 zijn allemaal verschillende animaties bij heavy knight"):
// the per-file loop above still pushes ONE entry per (colour × source file) — Knighty main/run and Heavy
// main/run/sheet2 — each tagged with a suffixed variant ("Green (Run)", "Green (Heavy)", "Green (Heavy
// Run)", "Green (Heavy Alt)") from the §682 round. This groups them by colour and MERGES every non-primary
// file's animations into its colour's primary entry (using the animation-level `relPath` override, §687
// above) instead of keeping them as separate variant swatches — "Green" now has Walk/Attack/.../Run all as
// animation buttons, one variant per colour, not 5 near-duplicate cards. Knighty and Heavy are also split
// into TWO separate creatures here (`Knight (Knighty)` / `Knight (Heavy)`) — they no longer merge into one
// base, since Han now wants Heavy on its own card with its own portrait.
// ═══ SECTION: POST-PROCESS MERGES ═══
function mergeKnightEntries(list) {
    const knightEntries = list.filter((e) => e.base === 'Knight (Knighty)');
    const others = list.filter((e) => e.base !== 'Knight (Knighty)');
    const groups = new Map();   // "family::colour" -> { primary, extras: [entry] }
    for (const e of knightEntries) {
        const m = /^(.*?)(?: \((Run|Heavy|Heavy Run|Heavy Alt)\))?$/.exec(e.variant || '');
        const color = m[1];
        const suffix = m[2] || null;
        const family = suffix && suffix.startsWith('Heavy') ? 'heavy' : 'knighty';
        const key = `${family}::${color}`;
        if (!groups.has(key)) groups.set(key, { primary: null, extras: [] });
        const g = groups.get(key);
        const isPrimary = family === 'knighty' ? suffix === null : suffix === 'Heavy';
        if (isPrimary) g.primary = e; else g.extras.push(e);
    }
    const merged = [];
    for (const [key, g] of groups) {
        if (!g.primary) { console.warn('knight merge: no primary entry for', key); continue; }
        const [family, color] = key.split('::');
        const animations = [...g.primary.animations];
        for (const extra of g.extras) {
            for (const a of extra.animations) animations.push({ ...a, relPath: extra.relPath });
        }
        merged.push({ ...g.primary, base: family === 'heavy' ? 'Knight (Heavy)' : 'Knight (Knighty)', variant: color, animations });
    }
    return [...others, ...merged];
}
manifest.splice(0, manifest.length, ...mergeKnightEntries(manifest));

// #687 (Han 2026-08-04, Maid mega-merge: "sheet 2 voegt animaties toe" / "combat: ..." / "sword down (sheet
// 4) is een idle sword animatie") — same technique as `mergeKnightEntries` above: sheet2/combat/sword-down
// entries were tagged with a "(Sheet2)"/"(Combat)"/"(SwordDown)" suffix on push; this groups them back onto
// the matching colour's PRIMARY 'Maid' entry (the sheet1 entry, already carrying walk/idle/etc. from
// `maidAnimations()`) as extra animation buttons, via the animation-level relPath override (§687).
function mergeMaidEntries(list) {
    const maidEntries = list.filter((e) => e.base === 'Maid');
    const others = list.filter((e) => e.base !== 'Maid');
    const groups = new Map();   // colour (e.g. "Black" / "Black (Full)") -> { primary, extras: [entry] }
    for (const e of maidEntries) {
        const m = /^(.*?)(?: \((Sheet2|Combat|SwordDown)\))?$/.exec(e.variant || '');
        const color = m[1];
        const isExtra = !!m[2];
        if (!groups.has(color)) groups.set(color, { primary: null, extras: [] });
        const g = groups.get(color);
        if (isExtra) g.extras.push(e); else g.primary = e;
    }
    const merged = [];
    for (const [color, g] of groups) {
        if (!g.primary) { console.warn('maid merge: no sheet1 primary for', color); merged.push(...g.extras); continue; }
        const animations = [...g.primary.animations];
        for (const extra of g.extras) for (const a of extra.animations) animations.push({ ...a, relPath: extra.relPath });
        merged.push({ ...g.primary, variant: color, animations });
    }
    return [...others, ...merged];
}
manifest.splice(0, manifest.length, ...mergeMaidEntries(manifest));

// #690 (Han 2026-08-04, "vul missende kleurvakjes in" + per-creature colour lists): a generic swatch-colour
// override pass, matched by (base, variant) — some creatures' `variant` strings aren't colour words at all
// ("Sheet 1", "Bw") so the generic `variantColor()` name-matcher (characterAssets.js) can never resolve
// them; `c2` (a second colour) renders as a DIAGONAL split swatch (§690's "twee-kleuren vakje") for
// genuinely two-toned variants (Archer's yellow/white, the cow's black/white and red/white). `baseTest`
// (a predicate) is used instead of an exact base string for the "every Guard sheet" case — one rule
// covering Guard Bow/Crossbow/Axe/Short Sword/Short Crossbow/Squat/Shield/Beer/Lute/etc. instead of one
// line per guard type.
// ═══ SECTION: SWATCH + PORTRAIT + BRAND-STRIP ═══
const SWATCH_OVERRIDES = [
    { base: 'Archer sheet', variant: null, c1: '#fdd835', c2: '#eeeeee' },   // "archer normal: geel/wit"
    { base: 'Skeleton', variant: 'Ghost', c1: '#8fb8e0' },                   // "flets blauw"
    { base: 'Skeleton', variant: 'Full White', c1: '#eeeeee' },
    { base: 'Zombie', variant: 'Dark Red', c1: '#8b0000' },
    { base: 'cow', variant: 'Bw', c1: '#2b2b2b', c2: '#eeeeee' },
    { base: 'cow', variant: 'Rw', c1: '#e53935', c2: '#eeeeee' },
    { base: 'damned burning', variant: null, c1: '#ff9800' },
    { base: 'Burning Skull', variant: null, c1: '#ff9800' },
    { baseTest: (b) => /^Guard /.test(b), variant: 'Sheet 1', c1: '#4a80e0' },
    { baseTest: (b) => /^Guard /.test(b), variant: 'Sheet 2', c1: '#8b0000' },   // "dieprood"
    { baseTest: (b) => /^Guard /.test(b), variant: 'Sheet 3', c1: '#8a5a3b' },
    { base: 'Musketeer', variant: 'Sheet 1', c1: '#4caf50' },
    { base: 'Musketeer', variant: 'Sheet 2', c1: '#e53935' },
    { base: 'Musketeer', variant: 'Sheet 3', c1: '#4a80e0' },
    { base: 'Witch', variant: 'Sheet 1', c1: '#a4e02c' },   // lime
    { base: 'Witch', variant: 'Sheet 2', c1: '#8a5a3b' },
    { base: 'Witch', variant: 'Sheet 3', c1: '#1a3a6b' },   // dark blue
    { base: 'Wizard', variant: 'Sheet 1', c1: '#4a80e0' },
    { base: 'Wizard', variant: 'Sheet 2', c1: '#e53935' },
    { base: 'Wizard', variant: 'Sheet 3', c1: '#8a5a3b' },
    { base: 'Cat', variant: 'Sheet 1', c1: '#9e9e9e' },
    { base: 'Cat', variant: 'Sheet 2', c1: '#8a5a3b' },
    { base: 'Cat', variant: 'Sheet 3', c1: '#2b2b2b' },
    { base: 'Dog (Small)', variant: 'Sheet 1', c1: '#c8956a' },   // light brown
    { base: 'Dog (Small)', variant: 'Sheet 2', c1: '#5c3a1e' },   // dark brown
    { base: 'Dog (Small)', variant: 'Sheet 3', c1: '#d4d4d4' },   // light grey
];
// #690 (Han: "maid: maak de kleurenvakjes: kleur/wit (diagonaal gesplitst)... 'with accent' is mono, de
// vakjes die nu een kleur hebben zijn 'duo'"): the PLAIN colour variants (Black, Blue, ...) become a
// colour/white DIAGONAL duo swatch; the "(White Accent)" variants stay a single solid colour (mono) — one
// rule per Maid colour, generated from the same word list `variantColor()` already recognises.
for (const c of ['Black', 'Blue', 'Brown', 'Green', 'Purple', 'Red', 'White', 'Yellow']) {
    const hex = { Black: '#2b2b2b', Blue: '#4a80e0', Brown: '#8a5a3b', Green: '#4caf50', Purple: '#9c27b0', Red: '#e53935', White: '#eeeeee', Yellow: '#fdd835' }[c];
    SWATCH_OVERRIDES.push({ base: 'Maid', variant: c, c1: hex, c2: '#eeeeee' });
    SWATCH_OVERRIDES.push({ base: 'Maid', variant: `${c} (White Accent)`, c1: hex });
}
// #682 (Han 2026-08-04: "haal overal GandalfHardcore weg uit de namen") — a final pass over every entry's
// `base`/`variant` stripping the brand-name prefix (present in MANY raw filenames, e.g. "GandalfHardcore
// Succubus", "GandalfHardcore Angel"). A single global pass here (not per-override) so it can never be
// missed for a base computed by any of the many code paths above.
// #692 (Han 2026-08-04, "critters" batch, "labelen"): also strips a trailing "Sprite Sheet" — the loose
// top-level critter files are literally named "<Creature> Sprite Sheet.png" (e.g. "Akaname Sprite
// Sheet.png"), and that suffix is packaging metadata, not part of the creature's name.
const stripBrand = (s) => (typeof s === 'string' ? s.replace(/gandalfhardcore\s*/gi, '').replace(/\s*sprite sheet$/i, '').trim() || s : s);
for (const entry of manifest) {
    entry.base = stripBrand(entry.base);
    entry.variant = stripBrand(entry.variant);
}

// #690 — swatch overrides + the Dog rename are matched against the FINAL (brand-stripped) base/variant
// strings (the ones SWATCH_OVERRIDES above was written against), so this runs AFTER stripBrand — running
// it before silently no-op'd on any raw filename that still had a "GandalfHardcore " prefix at the time
// (found via browser verification: "Archer sheet" never matched because the raw base was still
// "GandalfHardcore Archer sheet" at that point in the script).
// #691 (Han 2026-08-04, "voeg bij de archer en de wizard een 64x64 paneel toe met hun projectiel (net
// als poop thrower): fx > arrow en fx> projectile sheet blue"): same "show the whole file as a
// portrait, no cell crop" technique as Poop Thrower's Impact Sheet pairing (§689) — but these 2 targets
// ('Archer sheet' and the roster 'Wizard', §673/§674) both SHARE their `relPath` with other creatures
// (Archer's own colour files are unique per entry, fine, but roster-Wizard's file is a big composite
// sheet used by DOZENS of other roster names) — matched by (base, variant) here, post-merge, instead of
// by relPath during the per-file scan (which would have wrongly applied to every OTHER roster character
// sharing that same sheet file).
// `portraitCell`/`portraitFrame` on the Wizard entries crop to just ONE flight frame (row 0, col 0) of the
// 6×6 "Projectile sheet blue.png" instead of showing the raw sheet (which would render as a psychedelic
// grid of 36 tiny projectiles, not "de pijl gecentreerd" — Han's #691 follow-up report after the panel
// turned out invisible, see the SHEETS-glob fix in bestiaryAssets.js). Frame size (48×16) mirrors
// `PROJECTILE_FRAME` in `src/model/enemyAssets.js` — duplicated here (not imported) because this script
// runs under plain Node, outside Vite, same boundary every other frame/cell constant in this file already
// lives with. Archer's `arrow.png` is a single small image (no sheet), shown whole — no cell needed.
// #693 (Han 2026-08-04, round 2: "nog niet geanimeerd... zorg dat je dezelfde schaal hanteert"):
// `portraitAnimCols: 6` cycles through the WHOLE row 2 (6 flight frames) instead of a single frozen cell,
// driven by the bestiary panel's own animation tick (BestiaryPanels.jsx).
// #693 round 3 ("the portrait for the projectiles should be 64x64; as any other portrait... true size wrt
// the frame... centered, with mild oscillations" / "use the same oscillation... for the arrow for the
// archer"): `portraitOscillate: true` marks these two as the wobbling ones (PortraitImage, BestiaryPanels.jsx
// — a static reference image like Poop Impact Sheet stays still). Frame size (48×16) mirrors
// `PROJECTILE_FRAME` in `src/model/enemyAssets.js` — duplicated here (not imported) because this script
// runs under plain Node, outside Vite, same boundary every other frame/cell constant in this file already
// lives with. Archer's `arrow.png` is a single small image (no sheet), shown whole — no cell needed.
const PORTRAIT_OVERRIDES_BY_NAME = [
    { baseTest: (b) => b === 'Archer sheet', portraitRelPath: '../assets/ASSORTED/fx/arrow.png', portraitOscillate: true },
    // #693 round 3 ("flying brain monster mind blast should be animated: 96x32, 5 frames"): one row, 5
    // frames of 96×32 each (480×32 total, matches the real file) — cycled via `portraitAnimCols`.
    { base: 'Flying Brain Monster', portraitRelPath: '../assets/ASSORTED/characters/animals/critters/Flying Brain Monster Mind Blast.png', portraitCell: { row: 0, col: 0 }, portraitFrame: { w: 96, h: 32 }, portraitAnimCols: 5 },
    { base: 'Wizard', variant: 'Sheet 1', portraitRelPath: '../assets/ASSORTED/fx/Projectile sheet blue.png', portraitCell: { row: 2, col: 2 }, portraitFrame: { w: 48, h: 16 }, portraitAnimCols: 6, portraitOscillate: true },
    { base: 'Wizard', variant: 'Sheet 2', portraitRelPath: '../assets/ASSORTED/fx/Projectile sheet blue.png', portraitCell: { row: 2, col: 2 }, portraitFrame: { w: 48, h: 16 }, portraitAnimCols: 6, portraitOscillate: true },
    { base: 'Wizard', variant: 'Sheet 3', portraitRelPath: '../assets/ASSORTED/fx/Projectile sheet blue.png', portraitCell: { row: 2, col: 2 }, portraitFrame: { w: 48, h: 16 }, portraitAnimCols: 6, portraitOscillate: true },
];
// #693 round 3 ("portait/wizard: add the animated projectile right of the portrait") — "Wizard (Portrait)"
// (the 8-colour char_with_porttrait creature) already uses its ONE portrait slot for its own colour-crop
// portrait, so the projectile companion needs a SEPARATE side-slot instead (`sidePortrait*`, resolved in
// bestiaryAssets.js, rendered as a 3rd box in BestiaryPanels.jsx) — applies to EVERY colour (no `variant`
// filter, same match-all convention as Archer above).
const SIDE_PORTRAIT_OVERRIDES = [
    { base: 'Wizard (Portrait)', sidePortraitRelPath: '../assets/ASSORTED/fx/Projectile sheet blue.png', sidePortraitCell: { row: 2, col: 2 }, sidePortraitFrame: { w: 48, h: 16 }, sidePortraitAnimCols: 6 },
];
for (const entry of manifest) {
    // Han: "dog (hernoem dog (small)") — disambiguates from the unrelated "Doggy" creature.
    if (entry.base === 'Dog') entry.base = 'Dog (Small)';
    // #693 (Han 2026-08-04, round 2: "goddess: de idle animatie staat er nog steeds; dat zijn lege frames.
    // houdt enkel 'walk' en noem die 'float'"): the roster-column "Female Goddess" (from
    // `expandColumnSheet`/`FEMALE_PIXEL_ART_NAMES` — a DIFFERENT source file than "Goddess NPC" above, which
    // already got this same treatment in §689 but named 'fly' — Han now wants BOTH goddess entries fixed and
    // renamed 'float', not 'fly') — applied here as a targeted post-process since `expandColumnSheet` is
    // shared by 22 other characters and must stay generic.
    if (entry.base === 'Female Goddess' || entry.base === 'Goddess NPC') {
        entry.animations = entry.animations
            .filter((a) => a.key !== 'idle')
            .map((a) => (a.key === 'walk' || a.key === 'fly' ? { key: 'float', label: 'Float', cells: a.cells } : a));
    }
    // #693 round 12 (Han: "wisp's idle should be renamed: float"): Wisp only has the one auto-detected
    // 'idle' animation — it visibly hovers, so rename it to 'float' so `isFlyingAnim` (bestiaryAssets.js)
    // picks it up automatically wherever Wisp is placed (RPG level NPC, bestiary preview).
    if (entry.base === 'Wisp') {
        entry.animations = entry.animations.map((a) => (a.key === 'idle' ? { ...a, key: 'float', label: 'Float' } : a));
    }
    const o = SWATCH_OVERRIDES.find((s) =>
        (s.baseTest ? s.baseTest(entry.base) : s.base === entry.base) && (s.variant ?? null) === (entry.variant ?? null));
    if (o) { entry.swatchColor = o.c1; if (o.c2) entry.swatchColor2 = o.c2; }
    // Archer's override has no `variant` — it must apply to EVERY colour variant, unlike SWATCH_OVERRIDES
    // (where a missing variant means "match only the variant-less entry"). Only check variant when specified.
    const p = PORTRAIT_OVERRIDES_BY_NAME.find((s) =>
        (s.baseTest ? s.baseTest(entry.base) : s.base === entry.base) && (s.variant === undefined || s.variant === entry.variant));
    if (p) {
        entry.portraitRelPath = p.portraitRelPath;
        if (p.portraitCell) entry.portraitCell = p.portraitCell;
        if (p.portraitFrame) entry.portraitFrame = p.portraitFrame;
        if (p.portraitAnimCols) entry.portraitAnimCols = p.portraitAnimCols;
        if (p.portraitOscillate) entry.portraitOscillate = true;
    }
    const sp = SIDE_PORTRAIT_OVERRIDES.find((s) =>
        (s.baseTest ? s.baseTest(entry.base) : s.base === entry.base) && (s.variant === undefined || s.variant === entry.variant));
    if (sp) {
        entry.sidePortraitRelPath = sp.sidePortraitRelPath;
        if (sp.sidePortraitCell) entry.sidePortraitCell = sp.sidePortraitCell;
        if (sp.sidePortraitFrame) entry.sidePortraitFrame = sp.sidePortraitFrame;
        if (sp.sidePortraitAnimCols) entry.sidePortraitAnimCols = sp.sidePortraitAnimCols;
    }
    // #790 (Han 2026-08-09, "voeg tags toe aan de bestiary, zodat ik straks kan zoeken. voeg ook tags toe
    // aan animatie, zodat je makkelijk kan identificeren welke als 'flying' tellen"): tags are DERIVED here
    // (never hand-typed per entry, §6c) from signals that already exist — category, animation key/label,
    // variant name — the exact same rule `isFlyingAnim` (bestiaryAssets.js) uses at runtime, so "tagged
    // flying" and "actually anchors/oscillates as flying" can never disagree.
    const isFlyingKeyOrLabel = (a) => /fly|float/i.test(`${a.key || ''} ${a.label || ''}`) && a.key !== 'sit';
    entry.animations = entry.animations.map((a) => (
        isFlyingKeyOrLabel(a) ? { ...a, tags: [...(a.tags || []), 'flying'] } : a
    ));
    const tags = [];
    if (entry.category === 'air' || entry.animations.some(isFlyingKeyOrLabel)) tags.push('flying');
    if (entry.category === 'mature') tags.push('mature');
    // Han: "geef de bare variant een roze vakje" — the existing bare/Normal sort convention
    // (bestiaryAssets.js's `bareRank`) already identifies this by name; tagged here too so it's searchable
    // alongside every other tag instead of being a one-off regex the UI has to re-run.
    if (/\bbare\b/i.test(entry.variant || '')) tags.push('bare');
    if (tags.length) entry.tags = tags;
}

// ═══ SECTION: OUTPUT ═══
writeFileSync(OUT, `// AUTO-GENERATED by scripts/generate-bestiary-manifest.mjs — do not hand-edit.
// Re-run the script after adding/removing sprite sheets under src/assets/ASSORTED/characters/.
export default ${JSON.stringify(manifest, null, 2)};
export const ACCESSORIES = ${JSON.stringify(ACCESSORIES, null, 2)};
`);
console.log(`Wrote ${manifest.length} entries to ${OUT}`);
