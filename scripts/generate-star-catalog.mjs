// §374 "De sterrenhemel" (#1191, Han 2026-09-04) — one-time generator for the world's star data.
//
// Han asked for a real star map ("kun je hiervandaan een sterrenmap halen?"), not hand-typed twinkles.
// This script turns the Yale Bright Star Catalogue into the two baked data modules the CelestialSky
// layer imports, and VALIDATES them against the very same astronomy code the renderer uses
// (src/components/character/celestialModel.js) so the data and the runtime can never disagree about
// what is visible from Brussels facing south.
//
// SOURCE / LICENCE (stars)
//   Hoffleit D. & Warren W.H. Jr. (1991), "Bright Star Catalogue, 5th Revised Ed.", ADC/CDS V/50.
//   Download: http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz   (also CDS VizieR catalogue V/50)
//   A publicly-funded ADC/CDS astronomical catalogue: freely redistributable, no copyleft.
//   The raw catalogue is NOT committed — only the generated .js files are.
//
// SOURCE / LICENCE (constellation figures)
//   The stick figures below are HAND-AUTHORED in this file, on purpose. The obvious ready-made
//   sources are all encumbered for a non-copyleft app: Stellarium's constellationship.fab is
//   GPL-2.0+/CC BY-SA 4.0 (share-alike would attach to our generated data file) and the Sky &
//   Telescope figures are copyrighted. A short factual list of which bright stars a figure joins,
//   written independently, carries none of that. Stars are named by their Bayer/Flamsteed
//   designation ("Alp Ori"), which this script resolves against the catalogue's own name column —
//   so a typo is a hard error, never a silently missing line.
//
// Run with:
//   curl -sSL -o /tmp/bsc5.dat.gz http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz
//   node scripts/generate-star-catalog.mjs --src /tmp/bsc5.dat.gz
// (a plain, un-gzipped bsc5.dat works too — the loader sniffs the gzip magic bytes.)

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { altAz, everVisibleFromSouth, HALF_FOV_AZ_DEG, LAT_DEG } from '../src/components/character/celestialModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'src', 'components', 'character', 'data');
const STARS_OUT = path.join(OUT_DIR, 'brightStars.js');
const LINES_OUT = path.join(OUT_DIR, 'constellationLines.js');

// Han's locked breadth: "~500 stars, mag <= 4.5". Everything fainter is a sub-pixel dot anyway.
const MAG_LIMIT = 4.5;

// ---------------------------------------------------------------------------------------------
// The hand-authored stick figures. Each entry is a constellation NAME plus the pairs of stars its
// lines join, written as BSC5 Bayer designations ("Alp Ori" = α Orionis; a superscript index follows
// the Greek abbreviation with no space, e.g. "Alp1 Cap"). Chosen for the ~30 constellations that
// actually clear the southern horizon from Brussels — the validation pass below PROVES that claim
// star by star rather than trusting this comment.
// ---------------------------------------------------------------------------------------------
const CONSTELLATION_FIGURES = [
    {
        name: 'Orion',
        segments: [
            ['Bet Ori', 'Del Ori'], ['Del Ori', 'Eps Ori'], ['Eps Ori', 'Zet Ori'],
            ['Zet Ori', 'Kap Ori'], ['Del Ori', 'Gam Ori'], ['Zet Ori', 'Alp Ori'],
            ['Gam Ori', 'Lam Ori'], ['Lam Ori', 'Alp Ori'],
        ],
    },
    {
        name: 'Canis Major',
        segments: [
            ['Alp CMa', 'Bet CMa'], ['Alp CMa', 'Del CMa'],
            ['Del CMa', 'Eps CMa'], ['Del CMa', 'Eta CMa'],
        ],
    },
    { name: 'Canis Minor', segments: [['Alp CMi', 'Bet CMi']] },
    {
        name: 'Taurus',
        segments: [
            ['Bet Tau', 'Eps Tau'], ['Eps Tau', 'Alp Tau'], ['Alp Tau', 'Gam Tau'],
            ['Gam Tau', 'Lam Tau'], ['Zet Tau', 'Alp Tau'],
        ],
    },
    {
        name: 'Gemini',
        segments: [
            ['Alp Gem', 'Bet Gem'], ['Alp Gem', 'Tau Gem'], ['Tau Gem', 'Eps Gem'],
            ['Eps Gem', 'Mu Gem'], ['Mu Gem', 'Eta Gem'],
            ['Bet Gem', 'Del Gem'], ['Del Gem', 'Zet Gem'], ['Zet Gem', 'Gam Gem'],
        ],
    },
    {
        name: 'Auriga',
        segments: [
            ['Alp Aur', 'Bet Aur'], ['Bet Aur', 'The Aur'], ['The Aur', 'Bet Tau'],
            ['Bet Tau', 'Iot Aur'], ['Iot Aur', 'Alp Aur'], ['Alp Aur', 'Eps Aur'],
        ],
    },
    {
        name: 'Perseus',
        segments: [
            ['Alp Per', 'Gam Per'], ['Gam Per', 'Eta Per'], ['Alp Per', 'Del Per'],
            ['Del Per', 'Eps Per'], ['Alp Per', 'Bet Per'], ['Bet Per', 'Rho Per'],
        ],
    },
    {
        name: 'Andromeda',
        segments: [['Alp And', 'Del And'], ['Del And', 'Bet And'], ['Bet And', 'Gam And']],
    },
    {
        name: 'Pegasus',
        segments: [
            ['Alp Peg', 'Bet Peg'], ['Bet Peg', 'Alp And'], ['Alp And', 'Gam Peg'],
            ['Gam Peg', 'Alp Peg'], ['Alp Peg', 'The Peg'], ['The Peg', 'Eps Peg'],
            ['Bet Peg', 'Eta Peg'],
        ],
    },
    { name: 'Aries', segments: [['Alp Ari', 'Bet Ari'], ['Bet Ari', 'Gam Ari']] },
    {
        name: 'Pisces',
        segments: [
            ['Gam Psc', 'The Psc'], ['The Psc', 'Iot Psc'], ['Iot Psc', 'Lam Psc'],
            ['Lam Psc', 'Kap Psc'], ['Kap Psc', 'Gam Psc'],
            ['Lam Psc', 'Ome Psc'], ['Ome Psc', 'Del Psc'], ['Del Psc', 'Eps Psc'],
            ['Eps Psc', 'Alp Psc'], ['Alp Psc', 'Omi Psc'], ['Omi Psc', 'Eta Psc'],
        ],
    },
    {
        name: 'Cetus',
        segments: [
            ['Alp Cet', 'Gam Cet'], ['Gam Cet', 'Del Cet'], ['Del Cet', 'Omi Cet'],
            ['Omi Cet', 'Zet Cet'], ['Zet Cet', 'Tau Cet'], ['Tau Cet', 'Bet Cet'],
            ['Bet Cet', 'Iot Cet'], ['Iot Cet', 'Eta Cet'], ['Eta Cet', 'The Cet'],
            ['The Cet', 'Zet Cet'], ['Alp Cet', 'Lam Cet'], ['Lam Cet', 'Mu Cet'],
        ],
    },
    {
        name: 'Eridanus',
        segments: [
            ['Bet Eri', 'Ome Eri'], ['Ome Eri', 'Mu Eri'], ['Mu Eri', 'Nu Eri'],
            ['Nu Eri', 'Omi1 Eri'], ['Omi1 Eri', 'Gam Eri'], ['Gam Eri', 'Pi Eri'],
            ['Pi Eri', 'Del Eri'], ['Del Eri', 'Eps Eri'], ['Eps Eri', 'Eta Eri'],
        ],
    },
    {
        name: 'Lepus',
        segments: [
            ['Alp Lep', 'Bet Lep'], ['Bet Lep', 'Eps Lep'], ['Alp Lep', 'Zet Lep'],
            ['Alp Lep', 'Mu Lep'], ['Mu Lep', 'Lam Lep'], ['Bet Lep', 'Gam Lep'],
            ['Gam Lep', 'Del Lep'], ['Del Lep', 'Eta Lep'],
        ],
    },
    {
        name: 'Monoceros',
        segments: [['Alp Mon', 'Del Mon'], ['Del Mon', 'Gam Mon'], ['Del Mon', 'Bet Mon']],
    },
    {
        name: 'Hydra',
        segments: [
            ['Del Hya', 'Eps Hya'], ['Eps Hya', 'Zet Hya'], ['Zet Hya', 'Eta Hya'],
            ['Eta Hya', 'Rho Hya'], ['Rho Hya', 'Sig Hya'], ['Sig Hya', 'Del Hya'],
            ['Zet Hya', 'Alp Hya'], ['Alp Hya', 'Ups1 Hya'], ['Ups1 Hya', 'Lam Hya'],
            ['Lam Hya', 'Nu Hya'],
        ],
    },
    {
        name: 'Cancer',
        segments: [
            ['Bet Cnc', 'Del Cnc'], ['Del Cnc', 'Gam Cnc'],
            ['Del Cnc', 'Alp Cnc'], ['Gam Cnc', 'Iot Cnc'],
        ],
    },
    {
        name: 'Leo',
        segments: [
            ['Alp Leo', 'Eta Leo'], ['Eta Leo', 'Gam Leo'], ['Gam Leo', 'Zet Leo'],
            ['Zet Leo', 'Mu Leo'], ['Mu Leo', 'Eps Leo'],
            ['Gam Leo', 'Del Leo'], ['Del Leo', 'Bet Leo'], ['Bet Leo', 'The Leo'],
            ['The Leo', 'Alp Leo'], ['The Leo', 'Del Leo'],
        ],
    },
    {
        name: 'Virgo',
        segments: [
            ['Alp Vir', 'Gam Vir'], ['Gam Vir', 'Eta Vir'], ['Eta Vir', 'Bet Vir'],
            ['Gam Vir', 'Del Vir'], ['Del Vir', 'Eps Vir'],
            ['Alp Vir', 'Zet Vir'], ['Zet Vir', 'Tau Vir'], ['Tau Vir', 'Iot Vir'],
        ],
    },
    {
        name: 'Corvus',
        segments: [
            ['Alp Crv', 'Eps Crv'], ['Eps Crv', 'Gam Crv'], ['Gam Crv', 'Del Crv'],
            ['Del Crv', 'Bet Crv'], ['Bet Crv', 'Eps Crv'],
        ],
    },
    {
        name: 'Bootes',
        segments: [
            ['Alp Boo', 'Eta Boo'], ['Alp Boo', 'Eps Boo'], ['Eps Boo', 'Del Boo'],
            ['Del Boo', 'Bet Boo'], ['Bet Boo', 'Gam Boo'], ['Gam Boo', 'Rho Boo'],
            ['Rho Boo', 'Alp Boo'],
        ],
    },
    {
        name: 'Corona Borealis',
        segments: [
            ['The CrB', 'Bet CrB'], ['Bet CrB', 'Alp CrB'], ['Alp CrB', 'Gam CrB'],
            ['Gam CrB', 'Del CrB'], ['Del CrB', 'Eps CrB'],
        ],
    },
    {
        name: 'Serpens',
        segments: [
            ['Bet Ser', 'Gam Ser'], ['Bet Ser', 'Del Ser'], ['Del Ser', 'Alp Ser'],
            ['Alp Ser', 'Eps Ser'], ['Eps Ser', 'Mu Ser'],
        ],
    },
    {
        name: 'Ophiuchus',
        segments: [
            ['Alp Oph', 'Kap Oph'], ['Kap Oph', 'Del Oph'], ['Del Oph', 'Eps Oph'],
            ['Eps Oph', 'Zet Oph'], ['Zet Oph', 'Eta Oph'], ['Eta Oph', 'Bet Oph'],
            ['Bet Oph', 'Alp Oph'],
        ],
    },
    {
        name: 'Scorpius',
        segments: [
            ['Bet Sco', 'Del Sco'], ['Del Sco', 'Pi Sco'], ['Del Sco', 'Sig Sco'],
            ['Sig Sco', 'Alp Sco'], ['Alp Sco', 'Tau Sco'], ['Tau Sco', 'Eps Sco'],
        ],
    },
    {
        name: 'Sagittarius',
        segments: [
            ['Del Sgr', 'Eps Sgr'], ['Eps Sgr', 'Zet Sgr'], ['Zet Sgr', 'Phi Sgr'],
            ['Phi Sgr', 'Del Sgr'], ['Phi Sgr', 'Lam Sgr'], ['Lam Sgr', 'Del Sgr'],
            ['Zet Sgr', 'Tau Sgr'], ['Tau Sgr', 'Sig Sgr'], ['Sig Sgr', 'Phi Sgr'],
        ],
    },
    {
        name: 'Aquila',
        segments: [
            ['Bet Aql', 'Alp Aql'], ['Alp Aql', 'Gam Aql'], ['Gam Aql', 'Zet Aql'],
            ['Zet Aql', 'Eps Aql'], ['Alp Aql', 'Del Aql'], ['Del Aql', 'Lam Aql'],
            ['Del Aql', 'The Aql'], ['The Aql', 'Eta Aql'],
        ],
    },
    {
        name: 'Lyra',
        segments: [['Alp Lyr', 'Bet Lyr'], ['Alp Lyr', 'Gam Lyr'], ['Bet Lyr', 'Gam Lyr']],
    },
    {
        name: 'Cygnus',
        segments: [
            ['Alp Cyg', 'Gam Cyg'], ['Gam Cyg', 'Bet Cyg'], ['Gam Cyg', 'Del Cyg'],
            ['Gam Cyg', 'Eps Cyg'], ['Del Cyg', 'Iot Cyg'], ['Eps Cyg', 'Zet Cyg'],
        ],
    },
    {
        name: 'Delphinus',
        segments: [
            ['Alp Del', 'Bet Del'], ['Bet Del', 'Gam Del'], ['Gam Del', 'Del Del'],
            ['Del Del', 'Alp Del'], ['Bet Del', 'Eps Del'],
        ],
    },
    {
        name: 'Aquarius',
        segments: [
            ['Alp Aqr', 'Bet Aqr'], ['Alp Aqr', 'Gam Aqr'], ['Gam Aqr', 'Zet Aqr'],
            ['Zet Aqr', 'Eta Aqr'], ['Alp Aqr', 'The Aqr'], ['The Aqr', 'Lam Aqr'],
            ['Lam Aqr', 'Del Aqr'],
        ],
    },
    {
        name: 'Capricornus',
        segments: [
            ['Alp2 Cap', 'Bet Cap'], ['Bet Cap', 'Psi Cap'], ['Psi Cap', 'Ome Cap'],
            ['Ome Cap', 'Zet Cap'], ['Zet Cap', 'Del Cap'], ['Del Cap', 'Gam Cap'],
            ['Gam Cap', 'The Cap'], ['The Cap', 'Alp2 Cap'],
        ],
    },
    {
        name: 'Ursa Major',
        segments: [
            ['Eta UMa', 'Zet UMa'], ['Zet UMa', 'Eps UMa'], ['Eps UMa', 'Del UMa'],
            ['Del UMa', 'Gam UMa'], ['Gam UMa', 'Bet UMa'], ['Bet UMa', 'Alp UMa'],
            ['Alp UMa', 'Del UMa'],
        ],
    },
];

// ---------------------------------------------------------------------------------------------
// BSC5 parsing. Fixed-width columns, 1-indexed per the catalogue's own ReadMe:
//   1-4 HR · 5-14 Name (Flamsteed 5-7, Bayer 8-10, superscript 11, constellation 12-14)
//   76-77 RAh(J2000) · 78-79 RAm · 80-83 RAs · 84 DE sign · 85-86 DEd · 87-88 DEm · 89-90 DEs
//   103-107 Vmag · 110-114 B-V
// ---------------------------------------------------------------------------------------------
function parseRow(line) {
    const hr = parseInt(line.slice(0, 4), 10);
    const rah = parseInt(line.slice(75, 77), 10);
    const ram = parseInt(line.slice(77, 79), 10);
    const ras = parseFloat(line.slice(79, 83));
    const ded = parseInt(line.slice(84, 86), 10);
    const dem = parseInt(line.slice(86, 88), 10);
    const des = parseInt(line.slice(88, 90), 10);
    const mag = parseFloat(line.slice(102, 107));
    const bvRaw = parseFloat(line.slice(109, 114));
    if (!Number.isFinite(hr) || !Number.isFinite(rah) || !Number.isFinite(ded) || !Number.isFinite(mag)) return null;
    const bayer = line.slice(7, 10).trim();
    const sup = line.slice(10, 11).trim();
    const con = line.slice(11, 14).trim();
    return {
        hr,
        // "Alp Ori" / "Alp1 Cap" — the designation key the figures above are written in. Empty when
        // the row has no Bayer letter (a Flamsteed-only or catalogue-number-only star).
        designation: bayer && con ? `${bayer}${sup} ${con}` : '',
        ra: rah + ram / 60 + ras / 3600,
        dec: (line[83] === '-' ? -1 : 1) * (ded + dem / 60 + des / 3600),
        mag,
        // A handful of catalogue rows carry no B−V. White (0.0) is the honest neutral default, and it
        // is applied HERE so the runtime palette lookup never sees a NaN.
        bv: Number.isFinite(bvRaw) ? bvRaw : 0,
    };
}

function loadCatalogue(srcPath) {
    let buf = fs.readFileSync(srcPath);
    // gzip magic — accept either the .gz straight off the Harvard mirror or an already-expanded .dat.
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    return buf.toString('latin1').split('\n')
        .filter((l) => l.length > 100)
        .map(parseRow)
        .filter(Boolean);
}

function fail(message, details = []) {
    console.error(`\n✗ ${message}`);
    for (const d of details) console.error(`   ${d}`);
    process.exit(1);
}

const round4 = (n) => Math.round(n * 1e4) / 1e4;

function main() {
    const argIdx = process.argv.indexOf('--src');
    if (argIdx < 0 || !process.argv[argIdx + 1]) {
        fail('usage: node scripts/generate-star-catalog.mjs --src <bsc5.dat[.gz]>');
    }
    const srcPath = process.argv[argIdx + 1];
    const rows = loadCatalogue(srcPath);
    console.log(`read ${rows.length} catalogue rows from ${srcPath}`);

    // Designation → row. Later duplicates would be a catalogue oddity; keep the brightest.
    const byDesignation = new Map();
    for (const r of rows) {
        if (!r.designation) continue;
        const prev = byDesignation.get(r.designation);
        if (!prev || r.mag < prev.mag) byDesignation.set(r.designation, r);
    }

    // Resolve a figure's designation. Exact match first; otherwise fall back to the BRIGHTEST
    // superscripted component of the same Bayer letter ("Gam And" → γ¹/γ² Andromedae, "Bet Sco" →
    // β¹/β² Scorpii). Naked-eye stick figures name the naked-eye star, which is the pair's primary —
    // a resolution RULE rather than a hand-listed exception table for every optical double (§6c).
    const resolveDesignation = (key) => {
        const exact = byDesignation.get(key);
        if (exact) return exact;
        const [bayer, con] = key.split(' ');
        const pattern = new RegExp(`^${bayer}\\d ${con}$`);
        let best = null;
        for (const [k, row] of byDesignation) {
            if (pattern.test(k) && (!best || row.mag < best.mag)) best = row;
        }
        return best;
    };

    // a. brightness cut, then b. the visibility cut — a star that NEVER clears the southern horizon
    // inside the ±HALF_FOV_AZ_DEG window can never be drawn, so shipping it is pure bundle weight.
    // Both cuts are derived (MAG_LIMIT, and celestialModel's own geometry), never a hand-listed set.
    const bright = rows.filter((r) => r.mag <= MAG_LIMIT);
    const kept = new Map();
    for (const r of bright) {
        if (everVisibleFromSouth(r.ra, r.dec)) kept.set(r.hr, r);
    }
    console.log(`mag <= ${MAG_LIMIT}: ${bright.length} · of those visible from lat ${LAT_DEG} within ±${HALF_FOV_AZ_DEG}°: ${kept.size}`);

    // c. resolve + validate every figure. Any failure is a hard non-zero exit: a silently dropped star
    // is a broken stick figure that only shows up visually at 3 a.m. in-game.
    const unresolved = [];
    const invisible = [];
    const resolved = CONSTELLATION_FIGURES.map((fig) => {
        const segments = [];
        for (const [a, b] of fig.segments) {
            const ra = resolveDesignation(a);
            const rb = resolveDesignation(b);
            if (!ra) unresolved.push(`${fig.name}: "${a}" is not a BSC5 Bayer designation`);
            if (!rb) unresolved.push(`${fig.name}: "${b}" is not a BSC5 Bayer designation`);
            if (!ra || !rb) continue;
            // b. UNION: a figure star fainter than the mag cut is still carried, so a line can never
            // reference a star that isn't in the shipped catalogue.
            kept.set(ra.hr, ra);
            kept.set(rb.hr, rb);
            segments.push([ra.hr, rb.hr]);
        }
        const stars = [...new Set(segments.flat())].map((hr) => kept.get(hr));
        if (!stars.some((s) => everVisibleFromSouth(s.ra, s.dec))) {
            invisible.push(`${fig.name}: no star ever clears the horizon within ±${HALF_FOV_AZ_DEG}° of due south from lat ${LAT_DEG}`);
        }
        return { name: fig.name, segments };
    });
    if (unresolved.length) fail(`${unresolved.length} unresolved star designation(s)`, unresolved);
    if (invisible.length) fail(`${invisible.length} constellation(s) are never visible`, invisible);

    // Sanity spot-check against the model, printed so a regeneration is auditable at a glance.
    const sirius = byDesignation.get('Alp CMa');
    const transit = altAz(sirius.ra, sirius.dec, sirius.ra * 15);
    console.log(`sanity: Sirius transits at alt ${transit.altDeg.toFixed(2)}° (expected ${(90 - LAT_DEG + sirius.dec).toFixed(2)}°), azSouth ${transit.azSouthDeg.toFixed(2)}°`);

    const stars = [...kept.values()].sort((a, b) => a.mag - b.mag);
    const header = (what) => `// GENERATED FILE — DO NOT EDIT BY HAND.
// ${what}
// Produced by scripts/generate-star-catalog.mjs (see that file for the licence rationale).
// Source: Hoffleit D. & Warren W.H. Jr. (1991), "Bright Star Catalogue, 5th Revised Ed.", ADC/CDS V/50.
//         http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz
// Regenerate:
//   curl -sSL -o /tmp/bsc5.dat.gz http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz
//   node scripts/generate-star-catalog.mjs --src /tmp/bsc5.dat.gz
`;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(STARS_OUT, `${header(`Stars to visual magnitude ${MAG_LIMIT} that ever clear the horizon within ±${HALF_FOV_AZ_DEG}° of due south\n// from latitude ${LAT_DEG}°N, plus every star referenced by a constellation figure. Sorted brightest first.\n// hr = Bright Star number · ra = right ascension in HOURS (J2000) · dec = declination in DEGREES\n// mag = visual magnitude · bv = B−V colour index (0 where the catalogue has none).`)}
export const BRIGHT_STARS = [
${stars.map((s) => `    { hr: ${s.hr}, ra: ${round4(s.ra)}, dec: ${round4(s.dec)}, mag: ${round4(s.mag)}, bv: ${round4(s.bv)} },`).join('\n')}
];
`);

    fs.writeFileSync(LINES_OUT, `${header('Constellation stick figures — hand-authored in the generator, resolved to Bright Star numbers.\n// Every hr referenced here is guaranteed to exist in brightStars.js (the generator unions them in).')}
export const CONSTELLATIONS = [
${resolved.map((c) => `    { name: ${JSON.stringify(c.name)}, segments: [${c.segments.map(([a, b]) => `[${a}, ${b}]`).join(', ')}] },`).join('\n')}
];
`);

    const totalSegments = resolved.reduce((a, c) => a + c.segments.length, 0);
    console.log(`\n✓ wrote ${stars.length} stars → ${path.relative(process.cwd(), STARS_OUT)}`);
    console.log(`✓ wrote ${resolved.length} constellations / ${totalSegments} segments → ${path.relative(process.cwd(), LINES_OUT)}`);
}

main();
