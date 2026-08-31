// Enriches Han's `Animals-Icons-scalesl.csv` (icon ↔ animal ↔ scale mapping for the upcoming
// "Toonladders" world view). Han pre-assigned 12 rows; this fills the rest so EVERY scale in
// scaleHandler.js gets exactly one icon, matched animal→"emotional colour" of the scale (Han:
// "doe maar gewoon een gok"). It also derives a `scale-colour` hex and a one-word `emotion`.
//
// Icon file for a CSV row:  sets 1–10 → `Ability_icons{set}_{setId}.png`
//                           sets 11–15 → `Ability_icon_{set}_{setId}.png`
//   where setId = classId + (subset-1)*50   (verified against the shipped PNGs)
//
// `Scle` code convention: modal families → letter + arabic mode number
//   D# (Diatonic) · MM# (Melodic) · HMin# (Harmonic Minor) · HMaj# (Harmonic Major) · DH# (Double
//   Harmonic), # = I..VII → 1..7.  Non-modal families → the literal scale name (as Han already did
//   with `In` / `Inen`).
//
// Run:  node scripts/build-scale-icon-map.mjs         (rewrites the CSV in place)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = resolve(ROOT, 'src/assets/ASSET DROP/ability icons');
const CSV = resolve(ICON_DIR, 'Animals-Icons-scalesl.csv');
const OUT_ICON_DIR = resolve(ROOT, 'src/assets/scale-icons');           // renamed copies used by the app
const OUT_MAP = resolve(ROOT, 'src/theory/scaleIconMap.generated.js');

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- scale universe: parse scaleDefinitions straight out of scaleHandler.js -------------------
const shSrc = readFileSync(resolve(ROOT, 'src/theory/scaleHandler.js'), 'utf8');
const defsBlock = shSrc.match(/const scaleDefinitions = (\{[\s\S]*?\n\});/)[1];
// eslint-disable-next-line no-eval
const scaleDefinitions = eval(`(${defsBlock})`);

const MODAL = { Diatonic: 'D', Melodic: 'MM', 'Harmonic Minor': 'HMin', 'Harmonic Major': 'HMaj', 'Double Harmonic': 'DH' };
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };

// canonical key per scale + lookup by any code/name Han might type
const scales = [];
for (const [family, arr] of Object.entries(scaleDefinitions)) {
    for (const s of arr) {
        const modeNum = s.index ? ROMAN[s.index] : null;
        const code = MODAL[family] && modeNum ? `${MODAL[family]}${modeNum}` : s.name;
        scales.push({ family, name: s.name, index: s.index || null, modeNum, diatonic: s.diatonic || null, code });
    }
}
const findScale = (raw) => {
    const q = String(raw).trim();
    if (!q) return null;
    return scales.find((s) => s.code === q)
        || scales.find((s) => s.name === q)
        || scales.find((s) => s.name.toLowerCase() === q.toLowerCase())
        // tolerate Han's shorthands: HMaj1==HM1, MM==M, In/Inen literal names handled above
        || scales.find((s) => s.code.replace('HMaj', 'HM').replace('HMin', 'Hm') === q)
        || scales.find((s) => q === 'Inen' && s.name === 'Insen')
        || null;
};

// --- colour by HEPTA REF (Han 2026-08-29 r3/r4): a scale's colour comes purely from its parent
// diatonic mode (`diatonic` field), Ionian → Locrian; each degree maps to a 5-shade class palette
// sampled from `src/assets/ASSET DROP/ability icons/Color_palette{,2}.png`. The class NAMES are
// just palette labels. Every scale icon is RE-COLOURED into its class palette (light → dark ramp).
const DIA_NUM = { Ionian: 1, Dorian: 2, Phrygian: 3, Phryigian: 3 /* sic, source typo */, Lydian: 4, Mixolydian: 5, Aeolian: 6, Locrian: 7 };
const HEPTA_ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII' };
// Han r6: II → Warrior (was Geomancer — too close to Priest/Paladin), VII → Occultist (was Warlock
// — too close to Aerotheurge).
const HEPTA_CLASS = { 1: 'Paladin', 2: 'Warrior', 3: 'Hydrosophist', 4: 'Hunter', 5: 'Priest', 6: 'Aerotheurge', 7: 'Occultist' };
// 5 shades each, lightest → darkest (sampled from Color_palette{,2,3}.png). All of these are emitted
// to classPalettes.generated.css; HEPTA_CLASS picks the 7 the scale grid uses.
const CLASS_PALETTES = {
    Paladin: ['#efd69f', '#efac28', '#ab5c1c', '#550f0a', '#300f0a'],
    Warrior: ['#efd8a1', '#ef692f', '#9b1a0a', '#550f0a', '#300f0a'],
    Geomancer: ['#efd69f', '#efb775', '#a56243', '#773421', '#36170c'],
    Hydrosophist: ['#efd8a1', '#3c9f9c', '#276468', '#183f39', '#2a1d0d'],
    Hunter: ['#efd8a1', '#efac28', '#a58c27', '#39571c', '#1f240a'],
    Priest: ['#efd8a1', '#efac28', '#ab5c1c', '#724113', '#36170c'],
    Aerotheurge: ['#efd8a1', '#3c9f9c', '#384cbc', '#24187c', '#080c3f'],
    Warlock: ['#efd69f', '#c084e2', '#6b3ab3', '#24187c', '#080c3f'],
    Occultist: ['#efd8a1', '#c084e2', '#6b3ab3', '#550f0a', '#300f0a'],
    Witch: ['#efd8a1', '#3c9f9c', '#384cbc', '#550f0a', '#300f0a'],
};
const heptaNum = (sc) => DIA_NUM[sc.diatonic] ?? 1;
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Re-colour one 32×32 icon into `palette` (5 hex shades). Each opaque pixel's luminance is
// stretched across the icon's OWN min..max range then quantised to one of the 5 shades, so every
// icon uses the full light→dark ramp. Alpha is preserved.
const recolourIcon = (srcPath, palette, destPath) => {
    const png = PNG.sync.read(readFileSync(srcPath));
    const { data, width, height } = png;
    const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let lo = 255; let hi = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        const l = lum(i); if (l < lo) lo = l; if (l > hi) hi = l;
    }
    const span = Math.max(1, hi - lo);
    const rgb = palette.map(hexToRgb);
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        const t = (hi - lum(i)) / span;                 // 0 = lightest, 1 = darkest
        const bin = Math.min(4, Math.max(0, Math.round(t * 4)));
        [data[i], data[i + 1], data[i + 2]] = rgb[bin];
    }
    writeFileSync(destPath, PNG.sync.write(png));
    void width; void height;
};

// --- the fill: CSV data-row number (1 = first row after header) → scale code -------------------
// Rows not listed here keep whatever Han already put in `Scle` (his 12), or stay blank (spares:
// row 36 Snake, row 50 Bull-nose-ring). Animal ↔ scale matched by "emotional colour" (a guess).
const ASSIGN = {
    // Melodic — teal, smooth jazz-minor
    45: 'MM7', 53: 'MM5', 62: 'MM4', 10: 'MM3', 48: 'MM2',
    // Harmonic Minor — crimson, gothic drama
    35: 'HMin6', 39: 'HMin3', 43: 'HMin2', 7: 'HMin1', 33: 'HMin4', 57: 'HMin5', 56: 'HMin7',
    // Harmonic Major — rose, bittersweet
    38: 'HMaj2', 12: 'HMaj3', 23: 'HMaj4', 20: 'HMaj5', 40: 'HMaj6', 21: 'HMaj7',
    // Double Harmonic — deep purple, Byzantine spice
    59: 'DH1', 25: 'DH5', 47: 'DH4', 9: 'DH3', 49: 'DH2', 51: 'DH6', 55: 'DH7',
    // Other Heptatonic — grey-violet, odd exotic
    52: 'Persian', 42: 'Enigmatic', 34: 'Gypsy major', 14: 'Hungarian major',
    22: 'Neapolitan minor', 26: 'Neapolitan major', 44: 'Locrian major', 17: 'Lydian diminished',
    // Pentatonic — earthy green, folk
    24: 'Pentatonic Major', 32: 'Pentatonic Minor', 8: 'Hirajoshi scale', 64: 'Iwato',
    67: 'Egyptian pentatonic', 66: 'Kumoi', 68: 'Minor six pentatonic',
    // Hexatonic — slate blue, blues haze
    63: 'Minor Blues scale', 28: 'Major blues scale', 11: 'Whole Tone', 30: 'Augmented scale',
    29: 'Prometheus scale', 27: 'Scale of harmonics', 4: 'Tritone scale',
    3: 'Two-semitone tritone scale', 65: 'Istrian scale',
    // Supertonic — steel grey, chromatic/urban
    13: 'Major Bebop', 58: 'Bebop Dominant', 41: 'Diminished', 46: 'Dominant Diminished',
    15: 'Spanish octatonic', 54: 'Chromatic',
};

// --- parse CSV, merge, emit -----------------------------------------------------------------
// Idempotent: only the first 7 columns (Han's, comma-free) are ever read as input — any enriched
// block a previous run appended is discarded and rebuilt. BOM stripped.
const BASE_COLS = 7;
const lines = readFileSync(CSV, 'utf8')
    .replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
const header = lines[0].split(',').slice(0, BASE_COLS);
const rows = lines.slice(1).map((ln) => ln.split(',').slice(0, BASE_COLS));

const iconFile = (set, setId) => {
    const s = Number(set);
    const base = s >= 11 ? `Ability_icon_${s}` : `Ability_icons${s}`;
    return `${base}_${String(setId).padStart(2, '0')}.png`;   // ids are 2-digit padded (…_05), 100 stays …_100
};

// the 12 rows Han pre-filled by hand (everything else is either claude's via ASSIGN or a spare)
const HAN_ROWS = new Set([1, 2, 5, 6, 16, 18, 19, 31, 37, 60, 61, 69]);

const covered = new Set();
const out = rows.map((cols, i) => {
    const rowNum = i + 1;
    const [name, klass, scleRaw, classId, set, setIdRaw, subset] = cols;
    const setId = setIdRaw || (Number(classId) + (Number(subset) - 1) * 50);
    const file = iconFile(set, setId);
    if (!existsSync(resolve(ICON_DIR, file))) throw new Error(`row ${rowNum} ${name}: missing icon ${file}`);

    // ASSIGN is authoritative for claude's rows, so the script is stable on re-runs even though the
    // `Scle` cells it writes are no longer empty. A row is claude's iff it's in ASSIGN; otherwise a
    // HAN_ROWS row keeps its hand-typed `Scle`; otherwise it's a deliberate spare.
    let scle = ASSIGN[rowNum] || (HAN_ROWS.has(rowNum) ? (scleRaw || '').trim() : '');
    const by = ASSIGN[rowNum] ? 'claude' : (scle ? 'han' : '');

    let colour = ''; let heptaClass = ''; let sc = null;
    if (scle) {
        sc = findScale(scle);
        if (!sc) throw new Error(`row ${rowNum} ${name}: Scle "${scle}" matches no scale`);
        if (covered.has(sc.code)) throw new Error(`row ${rowNum} ${name}: scale ${sc.code} already assigned`);
        covered.add(sc.code);
        heptaClass = HEPTA_CLASS[heptaNum(sc)];
        colour = CLASS_PALETTES[heptaClass][2];   // representative mid shade of the class palette
        // normalise Han's code spelling to the canonical one
        scle = sc.code;
    }
    return { cols, name, file, scle, colour, heptaClass, by, sc };
});

// coverage report
const missing = scales.filter((s) => !covered.has(s.code));
console.log(`scales covered: ${covered.size}/${scales.length}`);
if (missing.length) {
    console.log('NOT COVERED:');
    for (const s of missing) console.log(`  ${s.family} · ${s.code}  (${s.name})`);
    throw new Error(`${missing.length} scales still have no icon`);
}

// keep the original 7 columns verbatim (with `Scle` filled in place), then append the enriched block
const finalHeader = [...header, 'scale-family', 'hepta-class', 'scale-colour', 'by', 'icon-file'].join(',');
const finalRows = out.map((r) => {
    const c = [...r.cols];
    c[2] = r.scle;                     // fill Han's Scle column in place
    const fam = r.sc ? r.sc.family : '';
    return [...c, fam, r.heptaClass, r.colour, r.by, r.file].map((x) => {
        const v = String(x ?? '');
        return v.includes(',') ? `"${v}"` : v;
    }).join(',');
});
writeFileSync(CSV, `${[finalHeader, ...finalRows].join('\n')}\n`);
console.log(`wrote ${CSV}  (${finalRows.length} rows, ${out.filter((r) => r.by === 'claude').length} filled by claude, ${out.filter((r) => r.by === 'han').length} by han, ${out.filter((r) => !r.scle).length} spare)`);

// --- re-colour + rename the used icons, and emit the generated map + CSS --------------------
// Every used PNG is re-coloured into its scale's hepta-ref class palette and written to
// src/assets/scale-icons/ as `{scale-code-slug}_{animal-slug}.png`. ASSET DROP originals untouched.
mkdirSync(OUT_ICON_DIR, { recursive: true });
for (const f of readdirSync(OUT_ICON_DIR)) { if (f.endsWith('.png')) rmSync(resolve(OUT_ICON_DIR, f)); }

// Row order (Han 2026-08-29 round 3): pentatonic and hexatonic first, then the diatonic ladder,
// then the harmonic families, then the odd 7-note bag, then the octatonic/chromatic supertonics.
const FAMILY_ORDER = [
    'Pentatonic', 'Hexatonic', 'Diatonic', 'Melodic', 'Harmonic Minor', 'Harmonic Major',
    'Double Harmonic', 'Other Heptatonic', 'Supertonic',
];

const mapEntries = [];
for (const r of out) {
    if (!r.sc) continue;                         // spare rows
    const dest = `${slug(r.sc.code)}_${slug(r.name)}.png`;
    const hn = heptaNum(r.sc);
    recolourIcon(resolve(ICON_DIR, r.file), CLASS_PALETTES[HEPTA_CLASS[hn]], resolve(OUT_ICON_DIR, dest));
    mapEntries.push({
        key: `${r.sc.family}|${r.sc.name}`,
        code: r.sc.code,
        family: r.sc.family,
        mode: r.sc.modeNum,
        roman: r.sc.modeNum ? HEPTA_ROMAN[r.sc.modeNum] : null,
        heptaNum: hn,               // parent diatonic degree 1..7 — drives colour + column sort
        heptaRoman: HEPTA_ROMAN[hn],
        heptaClass: HEPTA_CLASS[hn],
        icon: dest,
        animal: r.name,
        colour: r.colour,
    });
}
// within a family: modal by mode, everything else by hepta ref (Ionian left → Locrian right, Han)
mapEntries.sort((a, b) => (FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family))
    || ((a.mode || a.heptaNum) - (b.mode || b.heptaNum)) || a.key.localeCompare(b.key));

const js = `// GENERATED by scripts/build-scale-icon-map.mjs — do not edit by hand.
// One ability-icon per scale in scaleHandler.js. \`colour\` / \`heptaClass\` come from the scale's
// HEPTA REF (its parent diatonic mode, Ionian I → Locrian VII), each degree named by an RPG class.
// Source of truth: src/assets/ASSET DROP/ability icons/Animals-Icons-scalesl.csv
// The PNGs live in src/assets/scale-icons/ (renamed \`{scale}_{animal}.png\`); resolve URLs via
// src/theory/scaleIcons.js.

export const SCALE_FAMILY_ORDER = ${JSON.stringify(FAMILY_ORDER)};

// The 7 hepta-ref degrees + their class palettes (lightest → darkest). Also mirrored to CSS as
// --class-<name>-<0..4> in src/styles/classPalettes.generated.css.
export const SCALE_HEPTA_REF = [
${[1, 2, 3, 4, 5, 6, 7].map((n) => `    { num: ${n}, roman: ${JSON.stringify(HEPTA_ROMAN[n])}, klass: ${JSON.stringify(HEPTA_CLASS[n])}, colour: ${JSON.stringify(CLASS_PALETTES[HEPTA_CLASS[n]][2])}, palette: ${JSON.stringify(CLASS_PALETTES[HEPTA_CLASS[n]])} },`).join('\n')}
];

export const SCALE_ICON_MAP = {
${mapEntries.map((e) => `    ${JSON.stringify(e.key)}: { code: ${JSON.stringify(e.code)}, family: ${JSON.stringify(e.family)}, mode: ${e.mode ?? 'null'}, roman: ${JSON.stringify(e.roman)}, heptaNum: ${e.heptaNum}, heptaRoman: ${JSON.stringify(e.heptaRoman)}, heptaClass: ${JSON.stringify(e.heptaClass)}, icon: ${JSON.stringify(e.icon)}, animal: ${JSON.stringify(e.animal)}, colour: ${JSON.stringify(e.colour)} },`).join('\n')}
};
`;
writeFileSync(OUT_MAP, js);
console.log(`wrote ${OUT_ICON_DIR}  (${mapEntries.length} re-coloured icons)`);
console.log(`wrote ${OUT_MAP}`);

// --- CSS custom properties for the class palettes (Han will reuse these elsewhere) ----------
const OUT_CSS = resolve(ROOT, 'src/styles/classPalettes.generated.css');
const cssBody = Object.entries(CLASS_PALETTES)
    .map(([name, shades]) => shades.map((hex, i) => `    --class-${name.toLowerCase()}-${i}: ${hex};`).join('\n'))
    .join('\n');
writeFileSync(OUT_CSS, `/* GENERATED by scripts/build-scale-icon-map.mjs — do not edit by hand.\n`
    + ` * 7 class palettes (hepta-ref colour scheme), lightest (-0) to darkest (-4). */\n`
    + `:root {\n${cssBody}\n}\n`);
console.log(`wrote ${OUT_CSS}`);
