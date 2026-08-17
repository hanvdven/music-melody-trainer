/**
 * abc-to-song — convert an ABC-notation tune (`.abc`) into the app's own song format
 * (`src/songs/data/<id>.json` + a thin `src/songs/definitions/<id>.js` wrapper).
 *
 * #871 (Han 2026-08-11, plan_review: "het abc->song-JSON-script is NIET wegwerp-eenmalig — er komen nog
 * meer abc-bestanden bij"). This is a PERMANENT, REUSABLE BUILD-TIME tool, not a one-off: it takes an
 * ARBITRARY `.abc` path on the command line, so every future ABC import reuses this ONE pipeline instead
 * of growing a second parser (CLAUDE.md §6c). It is never imported by the app bundle — the app only ever
 * reads the generated JSON.
 *
 * Usage:
 *   npm run abc:song -- src/songs/abc/sakura.abc            # write data/ + definitions/
 *   npm run abc:song -- src/songs/abc/*.abc                 # batch
 *   npm run abc:song -- src/songs/abc/sakura.abc --dry      # parse + validate + report only
 *   npm run abc:song -- <file> --id my-id                   # override the derived song id
 *   npm run abc:song -- <file> --fermatas                   # ALSO emit `fermatas` (see below)
 *
 * Run through `vite-node` (see package.json) rather than bare node, so this script can IMPORT the app's
 * real theory helpers (`normalizeNoteChars`, `TICKS_PER_WHOLE`, `DEFAULT_BPM`) instead of re-deriving
 * them — the same reason `scripts/render-*.jsx` run under vite-node. Extensionless imports inside
 * `src/theory/*` cannot be resolved by plain Node.
 *
 * ─── DOCUMENTED CONVERSION DECISIONS (#871, locked with Han during plan review) ────────────────────
 *  1. REPEATS ARE NOT EXPANDED. `|:` … `:|` is written ONCE. The app has no repeat-sign renderer and no
 *     repeat-aware scheduler, so expanding would silently double a level's length; writing the section
 *     once keeps the notated bar count and the played bar count identical.
 *  2. TIES ARE MERGED. `A2-|A2` becomes ONE note of the summed duration. The notation pipeline re-derives
 *     the tie itself whenever a note crosses a barline, so carrying a second onset would produce a
 *     re-articulation the ABC did not ask for.
 *  3. SLURS ARE IGNORED. `(` `)` phrase marks carry no duration and the app has no slur renderer.
 *  4. FERMATAS (`H`) ARE PARSED BUT NOT EMITTED BY DEFAULT (`--fermatas` opts in). A song `fermatas`
 *     entry delays every LATER note's audio by `hold` ticks while leaving `offsets` untouched; the
 *     side-scroll RPG layer positions its enemies purely from `offsets`, so an emitted fermata would
 *     desync the visuals from the audio in exactly the levels these songs are for. Recorded here rather
 *     than silently dropped.
 *  5. SONGS WITHOUT ABC CHORD SYMBOLS get ONE mechanical tonic triad per measure (a drone), so every
 *     generated song ships a non-null chord progression — no chord INFERENCE from the melody.
 *
 * Metadata is taken from the ABC header VERBATIM (K: → tonic + scale mode, M: → time signature, L: →
 * unit note length, Q: → tempo). numMeasures / notesPerMeasure / range are DERIVED mechanically from the
 * parsed note stream — never hand-typed, never inferred by a scale-detection algorithm.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TICKS_PER_WHOLE } from '../src/constants/timing.js';
import { DEFAULT_BPM } from '../src/constants/generatorDefaults.js';
import { normalizeNoteChars } from '../src/theory/noteUtils.js';
import { scaleDefinitions } from '../src/theory/scaleHandler.js';

// ── tiny exact-rational helpers ───────────────────────────────────────────────────────────────────
// Durations are multiplied by 1/2, 3/2 and 2/3 (halved notes, broken rhythm, triplets); doing that in
// floating point and rounding at the end would silently hide a malformed bar. Exact rationals let the
// validator below assert "this bar sums to EXACTLY one measure".
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const rat = (n, d = 1) => { const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
const rmul = (a, b) => rat(a.n * b.n, a.d * b.d);
const radd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rcmp = (a, b) => a.n * b.d - b.n * a.d;
const rint = (a) => (a.n % a.d === 0 ? a.n / a.d : null);

// ── key signatures ────────────────────────────────────────────────────────────────────────────────
// Position on the circle of fifths for each natural letter (F=-1 … B=5); each ♯ adds 7, each ♭ subtracts 7.
const LETTER_FIFTHS = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
// A mode's own displacement on the circle of fifths relative to its parallel Ionian. Same relationship
// scaleHandler.js encodes for its Diatonic family; kept as a plain table here because this build-time
// script must run without the app's React/scale machinery.
const MODE_FIFTHS = { Major: 0, Dorian: -2, Phrygian: -4, Lydian: 1, Mixolydian: -1, Minor: -3, Locrian: -5 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

// ABC mode abbreviations → the app's own scaleHandler.js Diatonic mode NAMES (so `generator.scaleMode`
// can be handed straight to setSelectedMode without a translation table at runtime).
const MODE_ALIASES = {
    '': 'Major', maj: 'Major', ion: 'Major',
    m: 'Minor', min: 'Minor', aeo: 'Minor',
    dor: 'Dorian', phr: 'Phrygian', lyd: 'Lydian', mix: 'Mixolydian', loc: 'Locrian',
};

// Non-Diatonic scale families (Pentatonic etc.) have no circle-of-fifths key signature of their own —
// scaleHandler.js's own `diatonic` field on each mode already names the closest 7-note church-mode
// reference for exactly this purpose (see its `getDiatonicIntervals`). Reused here (via the imported
// `scaleDefinitions`, CLAUDE.md §6c) instead of a second hand-maintained scale-name table: any mode
// added to scaleHandler.js in the future becomes parseable here automatically. Diatonic's own `diatonic`
// field spells the church-mode name (Ionian/Aeolian) rather than MODE_FIFTHS's key (Major/Minor).
const CHURCH_MODE_TO_FIFTHS_KEY = {
    Ionian: 'Major', Aeolian: 'Minor', Dorian: 'Dorian', Phrygian: 'Phrygian',
    Lydian: 'Lydian', Mixolydian: 'Mixolydian', Locrian: 'Locrian',
};

// #1044 follow-up (Han 2026-08-17, arirang "K:F pentatonic major" / sakura "K:A In"): matches a full
// mode PHRASE (not just a 3-letter ABC abbreviation) against every non-Diatonic family's mode
// name/wheelName/aliases, case-insensitively. Diatonic is skipped — MODE_ALIASES already owns the
// standard short ABC forms ("m", "dor", …) for that family.
function findNonDiatonicMode(modeText) {
    const needle = modeText.toLowerCase();
    for (const [family, defs] of Object.entries(scaleDefinitions)) {
        if (family === 'Diatonic') continue;
        for (const def of defs) {
            const candidates = [def.name, def.wheelName, ...(def.aliases || [])].filter(Boolean);
            if (candidates.some((c) => c.toLowerCase() === needle)) {
                return { family, mode: def.name, diatonic: def.diatonic };
            }
        }
    }
    return null;
}

function parseKeyField(raw) {
    const txt = (raw || '').trim();
    // Captures the WHOLE remainder as the mode phrase (not just one word) — standard ABC mode
    // abbreviations are one word ("m", "dor"), but this app's own scale names can be multi-word
    // ("pentatonic major").
    const m = txt.match(/^([A-G])([#b]?)\s*(.*)$/);
    if (!m) throw new Error(`Unsupported K: field "${raw}" (expected e.g. "G", "Em", "Edor", "Bb", "F pentatonic major").`);
    const [, letter, accidental, modeRaw] = m;
    const modeText = modeRaw.trim();
    const shortKey = modeText.toLowerCase().slice(0, 3);
    const diatonicMode = MODE_ALIASES[shortKey] ?? MODE_ALIASES[modeText.toLowerCase()] ?? null;

    let scaleFamily, mode, fifthsSourceMode;
    if (diatonicMode) {
        scaleFamily = 'Diatonic';
        mode = diatonicMode;
        fifthsSourceMode = diatonicMode;
    } else {
        const found = modeText ? findNonDiatonicMode(modeText) : null;
        if (!found) throw new Error(`Unsupported mode "${modeRaw}" in K: field "${raw}".`);
        scaleFamily = found.family;
        mode = found.mode;
        // Fall back to Major if a future scale's `diatonic` reference isn't one of the 7 church modes
        // (shouldn't happen for anything in scaleHandler.js today) — never silently crash a build.
        fifthsSourceMode = CHURCH_MODE_TO_FIFTHS_KEY[found.diatonic] ?? 'Major';
    }

    const fifths = LETTER_FIFTHS[letter] + (accidental === '#' ? 7 : accidental === 'b' ? -7 : 0) + MODE_FIFTHS[fifthsSourceMode];
    // key-signature accidentals, per natural letter — for a non-Diatonic mode this is the accidental
    // set of its DIATONIC REFERENCE scale (see CHURCH_MODE_TO_FIFTHS_KEY above), which is what ABC note
    // letters in the tune body are actually spelled against; the pentatonic scale itself just omits 2
    // of those 7 degrees, it doesn't change which letters carry a sharp/flat.
    const sig = {};
    if (fifths > 0) for (let i = 0; i < Math.min(fifths, 7); i++) sig[SHARP_ORDER[i]] = 1;
    if (fifths < 0) for (let i = 0; i < Math.min(-fifths, 7); i++) sig[FLAT_ORDER[i]] = -1;
    const tonic = normalizeNoteChars(letter + accidental);
    return { tonic, mode, scaleFamily, sig, fifths };
}

// semitone alteration (-2..+2) → the app's Unicode accidental (CLAUDE.md §5b — never ASCII b/# in a
// value that reaches the UI; `defaultTonic` and every note name are display-facing).
const ACC_GLYPH = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };

// ── ABC body tokenizer ────────────────────────────────────────────────────────────────────────────
// Produces a flat event stream: notes/rests (with duration + tie/fermata flags + the chord symbol that
// preceded them) and barlines. Everything else (slurs, decorations, line breaks) is deliberately dropped.
const BARLINE_RE = /^(\|\]|\[\||\|\||::|:\||\|:|\||\])/;

function tokenizeMusicLine(line, ctx, out) {
    let i = 0;
    let pendingChord = null;      // chord symbol seen since the last note
    let pendingFermata = false;
    let tuplet = null;            // { left, ratio } — remaining notes in an in-progress (n tuplet
    let broken = null;            // pending broken-rhythm operator ('>' | '<' with a count)
    const warn = (msg) => ctx.warnings.push(`${ctx.file}: ${msg}`);

    while (i < line.length) {
        const ch = line[i];

        if (ch === ' ' || ch === '\t') { i++; continue; }
        if (ch === '\\') { i++; continue; }                        // line continuation — no musical meaning here

        // "…" — a chord symbol (starts with a note letter) or a free-text annotation ("fine", "^text").
        if (ch === '"') {
            const end = line.indexOf('"', i + 1);
            const body = end === -1 ? line.slice(i + 1) : line.slice(i + 1, end);
            const stripped = body.replace(/^\(|\)$/g, '').trim();  // "(D)" = an alternative/optional chord
            if (/^[A-G][#b]?/.test(stripped)) pendingChord = stripped;
            i = end === -1 ? line.length : end + 1;
            continue;
        }

        // barlines (also reset measure-local accidentals, per the ABC standard)
        const bar = line.slice(i).match(BARLINE_RE);
        if (bar) { out.push({ type: 'bar' }); ctx.measureAccidentals = {}; i += bar[0].length; continue; }

        // (3 … — a tuplet. (n by itself means "n notes in the time of (n-1 for odd, n/2-ish)"; the ABC
        // default for the common cases is encoded below. Everything else falls back to n:(n-1).
        const tup = line.slice(i).match(/^\((\d)(?::(\d)(?::(\d))?)?/);
        if (tup && tup[1]) {
            const p = Number(tup[1]);
            const DEFAULT_Q = { 2: 3, 3: 2, 4: 3, 5: 2, 6: 2, 7: 2, 8: 3, 9: 2 };
            const q = tup[2] ? Number(tup[2]) : (DEFAULT_Q[p] ?? p - 1);
            const r = tup[3] ? Number(tup[3]) : p;
            tuplet = { left: r, ratio: rat(q, p) };
            i += tup[0].length;
            continue;
        }
        if (ch === '(' || ch === ')') { i++; continue; }            // slur — ignored (decision 3)

        // legacy single-letter decorations. Only 'H' (fermata) actually occurs in the current corpus;
        // the others are accepted so a future file doesn't silently mis-parse them as note letters.
        if ('HLMOPSTuv'.includes(ch) && /[A-Ga-gz^_=,']/.test(line[i + 1] ?? '')) {
            if (ch === 'H') pendingFermata = true;
            i++;
            continue;
        }
        if (ch === '.' || ch === '~') { i++; continue; }            // staccato / roll decorations
        if (ch === '!' || ch === '+') {                             // !decoration! / +decoration+
            const close = line.indexOf(ch, i + 1);
            i = close === -1 ? line.length : close + 1;
            continue;
        }

        // broken rhythm operators bind the PREVIOUS note to the NEXT one
        if (ch === '>' || ch === '<') {
            let n = 0;
            while (line[i] === ch) { n++; i++; }
            broken = { dir: ch, n };
            continue;
        }

        // a note or a rest
        const noteMatch = line.slice(i).match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-gzx])([,']*)((?:\d+)?(?:\/+\d*)?)/);
        if (noteMatch) {
            const [, accRaw, letterRaw, octMarks, lenRaw] = noteMatch;
            i += noteMatch[0].length;

            // duration multiplier relative to the unit note length (L:)
            let mult = rat(1);
            const lm = (lenRaw || '').match(/^(\d+)?(\/+)?(\d+)?$/);
            if (lm) {
                const num = lm[1] ? Number(lm[1]) : 1;
                let den = 1;
                if (lm[2]) den = lm[3] ? Number(lm[3]) : 2 ** lm[2].length;   // "/"=÷2, "//"=÷4, "/3"=÷3
                mult = rat(num, den);
            }
            if (tuplet) { mult = rmul(mult, tuplet.ratio); tuplet.left -= 1; if (tuplet.left <= 0) tuplet = null; }

            let ticks = rmul(ctx.unit, mult);

            // broken rhythm: the operator dotted the PREVIOUS note and halves this one (or vice versa).
            if (broken) {
                const factor = rat(2 ** broken.n * 2 - 1, 2 ** broken.n);      // ">": 3/2, ">>": 7/4, …
                const inverse = rat(1, 2 ** broken.n);
                const prev = [...out].reverse().find((e) => e.type === 'note' || e.type === 'rest');
                if (!prev) warn('broken-rhythm operator with no preceding note — ignored');
                else if (broken.dir === '>') { prev.ticks = rmul(prev.ticks, factor); ticks = rmul(ticks, inverse); }
                else { prev.ticks = rmul(prev.ticks, inverse); ticks = rmul(ticks, factor); }
                broken = null;
            }

            if (letterRaw === 'z' || letterRaw === 'x') {
                out.push({ type: 'rest', ticks, line: ctx.lineIndex, chord: pendingChord });
                pendingChord = null; pendingFermata = false;
                continue;
            }

            // pitch: ABC's C = middle C = C4; lowercase = one octave up; ',' down, "'" up.
            const letter = letterRaw.toUpperCase();
            let octave = 4 + (letterRaw === letterRaw.toLowerCase() ? 1 : 0);
            for (const mark of octMarks) octave += mark === "'" ? 1 : -1;

            // accidentals: an explicit one applies for the rest of the MEASURE; otherwise the key signature.
            let alter;
            if (accRaw) {
                alter = accRaw === '=' ? 0 : accRaw.startsWith('^') ? accRaw.length : -accRaw.length;
                ctx.measureAccidentals[letter + octave] = alter;
            } else if (ctx.measureAccidentals[letter + octave] !== undefined) {
                alter = ctx.measureAccidentals[letter + octave];
            } else {
                alter = ctx.key.sig[letter] ?? 0;
            }

            out.push({
                type: 'note',
                pitch: `${letter}${ACC_GLYPH[String(alter)] ?? ''}${octave}`,
                ticks, tie: false, fermata: pendingFermata,
                line: ctx.lineIndex, chord: pendingChord,
            });
            pendingChord = null; pendingFermata = false;
            continue;
        }

        // a tie binds the note just emitted to the next one of the same pitch
        if (ch === '-') {
            const prev = [...out].reverse().find((e) => e.type === 'note');
            if (prev) prev.tie = true; else warn('tie "-" with no preceding note — ignored');
            i++;
            continue;
        }

        if (ch === '[' || ch === ']' || ch === '&' || ch === '*') { i++; continue; }   // unsupported constructs
        warn(`unrecognised character '${ch}' at column ${i} — skipped`);
        i++;
    }
}

// ── lyric syllable tokenizer (`w:` lines) ─────────────────────────────────────────────────────────
// ABC aligns ONE syllable per NOTE (rests are skipped). Within a word:
//   '-'  ends a syllable and keeps the hyphen (so the renderer can draw "Sa- ku- ra")
//   '--' (an empty syllable between two hyphens) and '_' are HOLDS — the previous syllable is sustained
//   '*'  is a note with no syllable at all
const HOLD = '—';   // em dash — the SAME continuation glyph happyBirthday.json already uses
const BLANK = '';

function tokenizeLyricLine(text) {
    const out = [];
    for (const word of text.trim().split(/\s+/).filter(Boolean)) {
        if (word === '|') continue;                                  // bar-advance marker (unused here)
        let acc = '';
        for (const ch of word) {
            if (ch === '-') { if (acc) out.push(acc + '-'); else out.push(HOLD); acc = ''; }
            else if (ch === '_') { if (acc) { out.push(acc); acc = ''; } out.push(HOLD); }
            else if (ch === '*') { if (acc) { out.push(acc); acc = ''; } out.push(BLANK); }
            else if (ch === '~') acc += ' ';
            else acc += ch;
        }
        if (acc) out.push(acc);
    }
    return out;
}

// ── chord symbol → chord data ─────────────────────────────────────────────────────────────────────
const PC_ORDER = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// Intervals reuse the app's own chordDefinitions vocabulary (src/theory/chordDefinitions.js): a
// dominant seventh is [0,4,7,10] there too — no new chord theory is introduced by this script.
// Bug fix (Han 2026-08-11, #871 UAT: "waarom komt de notatie A^m vandaan? Ik gebruik A^- voor
// mineurakkoorden"): `suffix` is the DISPLAY string ChordLabelsLayer renders verbatim as a superscript
// (Chord.js's own `internalSuffix` doc comment already states the app's convention: "e.g. maj7, -7", not
// "m"/"m7") — these were copied straight from ABC's own minor-chord letter ('m'/'min'/'-') instead of
// translated into the app's own notation. The chord TYPE string is unaffected (free-form label, only
// `suffix`/`name` are user-visible).
const CHORD_QUALITIES = [
    { re: /^maj7/, type: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11] },
    { re: /^m7|^min7|^-7/, type: 'min7', suffix: '-7', intervals: [0, 3, 7, 10] },
    { re: /^m|^min|^-/, type: 'minor', suffix: '-', intervals: [0, 3, 7] },
    { re: /^dim|^°/, type: 'dim', suffix: '°', intervals: [0, 3, 6] },
    { re: /^aug|^\+/, type: 'aug', suffix: '+', intervals: [0, 4, 8] },
    { re: /^sus4/, type: 'sus4', suffix: 'sus4', intervals: [0, 5, 7] },
    { re: /^7/, type: 'dom7', suffix: '7', intervals: [0, 4, 7, 10] },
    { re: /^$/, type: 'major', suffix: '', intervals: [0, 4, 7] },
];

function buildChord(symbol, offset, duration) {
    const m = symbol.match(/^([A-G])([#b]?)(.*)$/);
    if (!m) return null;
    const [, letter, acc, rest] = m;
    const rootPc = (NATURAL_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
    const qual = CHORD_QUALITIES.find((q) => q.re.test(rest)) ?? CHORD_QUALITIES[CHORD_QUALITIES.length - 1];
    const rootName = normalizeNoteChars(letter + acc);
    // Voiced from octave 3 upward — the same register happyBirthday.json's chord track uses.
    const notes = qual.intervals.map((iv) => {
        const abs = rootPc + iv;
        return `${PC_ORDER[abs % 12]}${3 + Math.floor(abs / 12)}`;
    });
    return {
        offset, duration, notes,
        root: `${rootName}3`,
        type: qual.type,
        name: `${rootName}${qual.suffix}`,
        suffix: qual.suffix,
    };
}

// ── main conversion ───────────────────────────────────────────────────────────────────────────────
export function convertAbc(source, { file = 'abc', id = null, emitFermatas = false } = {}) {
    const warnings = [];
    const header = {};
    const musicLines = [];        // { text, lyrics: string[]|null }
    let inBody = false;

    const rawLines = source.split(/\r?\n/);
    for (const raw of rawLines) {
        // strip trailing `%` comments (no quoted `%` occurs in ABC chord symbols/annotations in practice)
        const line = raw.replace(/%.*$/, '').trimEnd();
        if (!line.trim()) continue;
        const field = line.match(/^([A-Za-z]):(.*)$/);
        if (field) {
            const [, key, value] = field;
            if (key === 'w') {
                // attaches to the most recent music line; extra w: lines are further VERSES — verse 1 wins.
                const target = musicLines[musicLines.length - 1];
                if (target && target.lyrics === null) target.lyrics = tokenizeLyricLine(value);
                continue;
            }
            if (key === 'W') continue;                    // free-text lyrics block — not note-aligned
            if (!inBody || 'XTOCZSRNBFGMLQK'.includes(key)) header[key] = (header[key] ?? value.trim());
            if (key === 'K') inBody = true;
            continue;
        }
        if (!inBody) continue;
        // `\` continues the SAME logical music line (and therefore the same w: alignment group)
        const prev = musicLines[musicLines.length - 1];
        if (prev && prev.continued) { prev.text += ' ' + line.replace(/\\\s*$/, ''); prev.continued = /\\\s*$/.test(line); continue; }
        musicLines.push({ text: line.replace(/\\\s*$/, ''), continued: /\\\s*$/.test(line), lyrics: null });
    }

    // ── header-derived metadata (trusted verbatim, never inferred) ────────────────────────────────
    const key = parseKeyField(header.K);
    const meterRaw = (header.M ?? '4/4').trim();
    const timeSignature = meterRaw === 'C' ? [4, 4] : meterRaw === 'C|' ? [2, 2]
        : meterRaw.split('/').map(Number);
    if (timeSignature.length !== 2 || timeSignature.some((n) => !Number.isFinite(n) || n <= 0)) {
        throw new Error(`Unsupported M: field "${meterRaw}".`);
    }
    const unitRaw = (header.L ?? '').trim();
    // ABC's own default when L: is absent: 1/8 for meters < 0.75, else 1/16 — but every file in this
    // repo declares L:, so the fallback is only a safety net.
    const unitParts = unitRaw ? unitRaw.split('/').map(Number) : [1, 8];
    const unit = rat(TICKS_PER_WHOLE * unitParts[0], unitParts[1]);
    const tempoRaw = (header.Q ?? '').trim();
    const tempoMatch = tempoRaw.match(/(\d+)\s*$/);
    const defaultTempo = tempoMatch ? Number(tempoMatch[1]) : DEFAULT_BPM;
    const ticksPerMeasure = rint(rat(TICKS_PER_WHOLE * timeSignature[0], timeSignature[1]));
    if (ticksPerMeasure == null) throw new Error(`Meter ${meterRaw} does not map to whole ticks.`);

    // ── tokenize the body ─────────────────────────────────────────────────────────────────────────
    const events = [];
    const ctx = { unit, key, measureAccidentals: {}, warnings, file, lineIndex: 0 };
    musicLines.forEach((ml, idx) => { ctx.lineIndex = idx; tokenizeMusicLine(ml.text, ctx, events); });

    // ── bar-duration validation + repair (pre-tie-merge; a tie never changes a bar's total) ───────
    // Group the event stream into bars so each bar can be checked against the meter. Empty groups
    // (produced by adjacent barlines such as `:|` immediately followed by `|:`, or a `||` section
    // divider) carry no duration and are dropped.
    const barGroups = [];
    let group = [];
    for (const ev of events) {
        if (ev.type === 'bar') { barGroups.push(group); group = []; continue; }
        group.push(ev);
    }
    barGroups.push(group);
    const realBars = barGroups
        .map((g) => ({ events: g, total: g.reduce((acc, e) => radd(acc, e.ticks), rat(0)) }))
        .filter((b) => rcmp(b.total, rat(0)) !== 0);

    // A short INTERIOR bar is almost always the "second half" of an anacrusis-plus-repeat structure
    // (Kalinka: a half-measure pickup before `|:`, and the bar before `:|` short by exactly that
    // pickup — the two add up to one measure only when the repeat is actually taken). Because repeats
    // are NOT expanded (decision 1), leaving it short would shift EVERY later barline by the missing
    // amount and permanently misalign the piece against the meter. The mechanical repair: extend that
    // bar's LAST event to fill the measure (a general rule derived from the meter — not a per-song
    // table, §6c), and warn so the operator can eyeball it.
    realBars.forEach((b, n) => {
        const t = rint(b.total);
        if (t == null) { warnings.push(`${file}: bar ${n + 1} has a non-integer tick total (${b.total.n}/${b.total.d})`); return; }
        if (t === ticksPerMeasure || n === 0 || n === realBars.length - 1) return;
        if (t < ticksPerMeasure && b.events.length > 0) {
            const last = b.events[b.events.length - 1];
            last.ticks = radd(last.ticks, rat(ticksPerMeasure - t));
            b.total = rat(ticksPerMeasure);
            warnings.push(`${file}: bar ${n + 1} was short (${t}/${ticksPerMeasure} ticks) — its last event was extended to fill the measure (repeat/pickup structure, repeats are not expanded)`);
        } else {
            warnings.push(`${file}: bar ${n + 1} sums to ${t} ticks, expected ${ticksPerMeasure} — left as written`);
        }
    });
    // ANACRUSIS: a short FIRST bar is a pickup — shift the whole piece right so the pickup lands at the
    // END of measure 0 (exactly how happyBirthday.json encodes its own "Hap-py" upbeat).
    const firstBarTicks = realBars.length > 1 ? rint(realBars[0].total) : ticksPerMeasure;
    const anacrusis = firstBarTicks != null && firstBarTicks < ticksPerMeasure ? ticksPerMeasure - firstBarTicks : 0;

    // ── raw (pre-merge) note stream + lyric assignment ────────────────────────────────────────────
    const raw = events.filter((e) => e.type !== 'bar');
    for (const ml of musicLines) if (ml.lyrics) { /* touched below */ }
    const lyricByRawIndex = new Map();
    musicLines.forEach((ml, idx) => {
        if (!ml.lyrics || ml.lyrics.length === 0) return;
        const sung = raw.map((e, i) => ({ e, i })).filter(({ e }) => e.line === idx && e.type === 'note');
        if (ml.lyrics.length !== sung.length) {
            warnings.push(`${file}: line ${idx + 1} has ${ml.lyrics.length} syllables for ${sung.length} notes — extra/missing entries padded`);
        }
        sung.forEach(({ i }, k) => lyricByRawIndex.set(i, ml.lyrics[k] ?? BLANK));
    });
    const hasLyrics = lyricByRawIndex.size > 0;

    // ── merge ties (decision 2) ───────────────────────────────────────────────────────────────────
    const merged = [];
    for (let i = 0; i < raw.length; i++) {
        const ev = raw[i];
        const entry = { ...ev, lyric: lyricByRawIndex.get(i) ?? BLANK };
        while (entry.tie) {
            const next = raw[i + 1];
            if (!next || next.type !== 'note' || next.pitch !== entry.pitch) {
                warnings.push(`${file}: tie after ${entry.pitch ?? 'rest'} has no matching next note — dropped`);
                entry.tie = false;
                break;
            }
            entry.ticks = radd(entry.ticks, next.ticks);
            entry.tie = next.tie;
            entry.fermata = entry.fermata || next.fermata;
            entry.chord = entry.chord ?? next.chord;
            i += 1;
        }
        merged.push(entry);
    }

    // ── offsets ───────────────────────────────────────────────────────────────────────────────────
    const notes = [], durations = [], offsets = [], lyrics = [], fermatas = [];
    let cursor = anacrusis;
    for (const ev of merged) {
        const t = rint(ev.ticks);
        if (t == null) throw new Error(`${file}: non-integer duration ${ev.ticks.n}/${ev.ticks.d} on ${ev.pitch ?? 'rest'}`);
        notes.push(ev.type === 'rest' ? 'r' : ev.pitch);
        durations.push(t);
        offsets.push(cursor);
        lyrics.push(ev.lyric ?? BLANK);
        if (ev.fermata && ev.type === 'note') fermatas.push({ tick: cursor, hold: Math.round(t / 2) });
        cursor += t;
    }
    const numMeasures = Math.max(1, Math.ceil(cursor / ticksPerMeasure));

    // ── chords ────────────────────────────────────────────────────────────────────────────────────
    const chords = [];
    const symbolPositions = merged
        .map((ev, i) => ({ symbol: ev.chord, offset: offsets[i] }))
        .filter((c) => c.symbol);
    if (symbolPositions.length > 0) {
        // an unharmonised pickup gets an explicit N.C. so the progression covers the whole timeline
        if (symbolPositions[0].offset > 0) {
            chords.push({ offset: 0, duration: symbolPositions[0].offset, notes: [], root: '', type: 'nc', name: 'N.C.', suffix: '' });
        }
        symbolPositions.forEach((c, i) => {
            const end = i + 1 < symbolPositions.length ? symbolPositions[i + 1].offset : numMeasures * ticksPerMeasure;
            const built = buildChord(c.symbol, c.offset, end - c.offset);
            if (built && built.duration > 0) chords.push(built);
            else if (!built) warnings.push(`${file}: unparsable chord symbol "${c.symbol}" — skipped`);
        });
    } else {
        // decision 5 — one mechanical tonic triad per measure (a drone), never inferred from the melody.
        // NOTE: this minor/major check only recognizes the 4 minor-flavored DIATONIC mode names; a
        // non-Diatonic mode (e.g. "Pentatonic Minor") falls through to a MAJOR triad regardless of its
        // own diatonic reference. Harmless for every song shipped today (arirang's "Pentatonic Major"
        // correctly wants major; sakura provides real ABC chord symbols so never reaches this branch at
        // all) — but a future minor-flavored chordless pentatonic song would need this extended to check
        // `CHURCH_MODE_TO_FIFTHS_KEY[<that mode's diatonic field>]` instead of `key.mode` directly.
        const tonicSymbol = key.tonic.replace('♯', '#').replace('♭', 'b') + (key.mode === 'Minor' || key.mode === 'Dorian' || key.mode === 'Phrygian' || key.mode === 'Locrian' ? 'm' : '');
        for (let m = 0; m < numMeasures; m++) chords.push(buildChord(tonicSymbol, m * ticksPerMeasure, ticksPerMeasure));
    }

    // ── derived generator metadata ────────────────────────────────────────────────────────────────
    const pitched = notes.filter((n) => n !== 'r');
    const notesPerMeasure = Math.max(1, Math.round(pitched.length / numMeasures));
    const midi = (n) => {
        const m = n.match(/^([A-G])([♯♭𝄪𝄫]?)(-?\d+)$/u);
        const alt = m[2] === '♯' ? 1 : m[2] === '♭' ? -1 : m[2] === '𝄪' ? 2 : m[2] === '𝄫' ? -2 : 0;
        return NATURAL_PC[m[1]] + alt + (Number(m[3]) + 1) * 12;
    };
    const sorted = [...pitched].sort((a, b) => midi(a) - midi(b));
    const range = { min: sorted[0], max: sorted[sorted.length - 1] };

    const songId = id ?? path.basename(file, path.extname(file));
    const subtitleParts = [header.C, header.O, header.G, header.S].filter(Boolean);

    const song = {
        id: songId,
        title: (header.T ?? songId).trim(),
        subtitle: subtitleParts.length ? subtitleParts.join(' · ') : 'Traditional',
        category: 'traditional',
        timeSignature,
        defaultTempo,
        defaultTonic: key.tonic,
        numMeasures,
        _source: {
            abc: `src/songs/abc/${path.basename(file)}`,
            generatedBy: 'scripts/abc-to-song.mjs (#871) — re-run instead of hand-editing',
            decisions: [
                'Repeats (|: :|) are NOT expanded — each section is written once.',
                'Ties (-) are merged into the preceding note\'s duration.',
                'Slurs ( ) are ignored.',
                emitFermatas ? 'Fermatas (H) emitted as `fermatas`.' : 'Fermatas (H) parsed but NOT emitted (they shift audio without shifting offsets — would desync the side-scroll RPG layer).',
                symbolPositions.length > 0 ? 'Chords taken from the ABC chord symbols.' : 'No ABC chord symbols — one tonic triad per measure (drone).',
            ],
        },
        generator: {
            scaleFamily: key.scaleFamily,
            scaleMode: key.mode,
            chordSettings: { strategy: 'tonic-tonic-tonic', chordCount: 1, passingChordTypes: [] },
            // NOTE: deliberately NO `randomizationRule: 'fixed'` (#871) — resolveVoice's fixed+refMelody
            // branch rebuilds the melody and drops `.lyrics`/`.fermatas`/`.rhythmicGrouping`. Leaving the
            // default preserves the loaded Melody object by identity, lyrics included.
            trebleSettings: { notesPerMeasure },
            percussionSettings: null,
        },
        difficulties: {
            easy: {
                _comment: `Single fixed treble line converted from ${path.basename(file)} — ${pitched.length} notes over ${numMeasures} measures. One difficulty tier only (#871).`,
                ...(emitFermatas && fermatas.length ? { fermatas } : {}),
                treble: {
                    notes, durations, offsets,
                    ...(hasLyrics ? { lyrics } : {}),
                },
                bass: null,
                percussion: null,
                chords,
            },
        },
    };

    return {
        song, warnings, range, notesPerMeasure, ticksPerMeasure, anacrusis,
        stats: { notes: notes.length, pitched: pitched.length, rests: notes.length - pitched.length, bars: realBars.length, fermatas: fermatas.length },
    };
}

const DEFINITION_TEMPLATE = (song, srcName) => `// ${song.title} — score data lives in the sibling JSON so the pure note/lyric/chord arrays stay
// separate from any JS-only fields (same split as happyBirthday.js).
//
// AUTO-GENERATED from src/songs/abc/${srcName} by \`npm run abc:song\` (#871). Re-run the script rather
// than hand-editing the JSON. Conversion decisions (also recorded in the JSON's \`_source\`):
//   • repeats (|: :|) are NOT expanded — each section is written once;
//   • ties (-) are merged into the preceding note's duration;
//   • slurs ( ) are ignored.
// One difficulty tier ('easy'); no \`randomizationRule: 'fixed'\` so the loaded Melody (and its lyrics)
// survives randomizeAll by identity.
import data from '../data/${song.id}.json';

export default data;
`;

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
function main(argv) {
    const args = argv.filter((a) => a !== '--');
    const dry = args.includes('--dry');
    const emitFermatas = args.includes('--fermatas');
    const idFlag = args.indexOf('--id');
    const idOverride = idFlag !== -1 ? args[idFlag + 1] : null;
    const files = args.filter((a, i) => !a.startsWith('--') && !(idFlag !== -1 && i === idFlag + 1));

    if (files.length === 0) {
        console.error('usage: npm run abc:song -- <file.abc> [more.abc …] [--id <song-id>] [--dry] [--fermatas]');
        process.exitCode = 1;
        return;
    }

    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    for (const rel of files) {
        const file = path.resolve(rel);
        const source = fs.readFileSync(file, 'utf8');
        const result = convertAbc(source, { file, id: files.length === 1 ? idOverride : null, emitFermatas });
        const { song, warnings, range, stats } = result;
        console.log(`\n── ${song.id} — "${song.title}"`);
        console.log(`   ${song.timeSignature.join('/')}  key ${song.defaultTonic} ${song.generator.scaleMode}  q=${song.defaultTempo}`);
        console.log(`   ${stats.bars} bars → numMeasures ${song.numMeasures}, ${stats.pitched} notes (+${stats.rests} rests), notes/measure ${result.notesPerMeasure}`);
        console.log(`   range ${range.min}–${range.max}, chords ${song.difficulties.easy.chords.length}, lyrics ${song.difficulties.easy.treble.lyrics ? 'yes' : 'no'}, fermatas found ${stats.fermatas}${emitFermatas ? ' (emitted)' : ' (not emitted)'}`);
        for (const w of warnings) console.log(`   ⚠ ${w}`);
        if (dry) continue;
        const dataPath = path.join(root, 'src/songs/data', `${song.id}.json`);
        const defPath = path.join(root, 'src/songs/definitions', `${song.id}.js`);
        fs.writeFileSync(dataPath, JSON.stringify(song, null, 2) + '\n', 'utf8');
        fs.writeFileSync(defPath, DEFINITION_TEMPLATE(song, path.basename(file)), 'utf8');
        console.log(`   → ${path.relative(root, dataPath)}  +  ${path.relative(root, defPath)}`);
        console.log('   Remember to register the definition in src/songs/songIndex.js.');
    }
}

// Run the CLI unless we're being imported by the test runner (the parser itself is unit-tested).
// `process.argv[1]` is vite-node's own entry, not this file, so a filename check would never match.
if (!process.env.VITEST) main(process.argv.slice(2));
