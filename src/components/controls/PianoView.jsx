// components/PianoView.jsx
import React, { useMemo, useEffect, useRef, useState } from 'react';
import logger from '../../utils/logger';
import playSound, { resolveNotePitch } from '../../audio/playSound';
import { standardizeTonic, getRelativeNoteName } from '../../theory/convertToDisplayNotes';
import { scaleKeyDisplayPC } from '../../theory/scaleKeyLabel';
import generateAllNotesArray from '../../theory/allNotesArray';
import { getCanonicalNote, ENHARMONIC_PAIRS, getNoteSemitone, chromatoneMix } from '../../theory/noteUtils';
import { transposeNoteBySemitones } from '../../theory/musicUtils';
import { deriveQwertyScheme } from '../../utils/qwertyScheme';

// Fold a semitone offset into the nearest octave, range [-6, +6]. Keyboard transposition is a
// PITCH-CLASS rotation (Han 2026-06-13: "−1 and +11 are the same — the height comes from the range
// setter"), so we keep the sounded/relabelled note close to the physical key instead of jumping a
// whole octave for large offsets.
export const foldShift = (s) => { const r = ((s % 12) + 12) % 12; return r > 6 ? r - 12 : r; };


// QWERTY → piano key mapping (standard GarageBand/DAW layout)
// White keys: Q W E R T Y U I O P [ ]
// Black keys (number row, by physical gap position): 2 3 _ 5 6 7 _ 9 0 _ =
const QWERTY_WHITE_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'];
// #FR (Han 2026-08-10, "ik merk dat ik het als speler verwarrend vind dat de toetsen steeds
// verplaatsen"): QWERTY used to map POSITIONALLY (QWERTY_WHITE_KEYS[i] = the i-th currently VISIBLE
// white key) — so the same physical key played a different pitch on every level, depending on where
// the visible range happened to start. Replaced with a FIXED, pitch-anchored mapping: Q is always C4,
// and the sequence repeats up from there (C=Q,D=W,E=E,F=R,G=T,A=Y,B=U, then C=I,D=O,E=P,F=[,G=]) —
// confirmed via interview to be ABSOLUTE pitch (not tonic-relative): level 102 (tonic G Mixolydian,
// range G4-D5) only lands on T,Y,U,I,O — Han's own worked example — because C is always Q regardless
// of key. Covers exactly the same 12 QWERTY_WHITE_KEYS slots as before, just a fixed note list instead
// of a range-derived one. A note outside this ~2-octave window simply gets no QWERTY key (click-to-play
// still works) — confirmed acceptable, not a regression to "chase" with more keys.
const FIXED_ANCHOR_WHITE_KEYS = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'];

// #FR2 (Han 2026-08-10, Level 15 "twee toetsen!!!"): additional FIXED qwerty schemes for a SECOND,
// simultaneously-visible keyboard (the two-handed level's bass/left hand), selected via the new
// `qwertyScheme` prop. Each entry is { whiteNotes, whiteKeys, blackGapKeys } — `blackGapKeys[i]` is the
// physical key for the gap between `whiteNotes[i]` and `whiteNotes[i+1]` (undefined = no black key
// there, e.g. an E-F/B-C boundary) — same shape/convention as the app-wide 'app' scheme below.
const QWERTY_SCHEMES = {
  // Default / app-wide fixed mapping (Q=C4..], see FIXED_ANCHOR_WHITE_KEYS above).
  app: {
    whiteNotes: FIXED_ANCHOR_WHITE_KEYS,
    whiteKeys: QWERTY_WHITE_KEYS,
    blackGapKeys: ['2', '3', undefined, '5', '6', '7', undefined, '9', '0', undefined, '='],
  },
  // Level 15 keyboard-layout "option 1" (Han: "klavier 2 heeft voorkeur a2=z b2=x c3=c d3=v, ..., c4=/,
  // en bb2 = s etc"): the bass/left-hand keyboard, on the ZXCV.../ row (+ ASDFGHJKL for flats, mirroring
  // the 'app' scheme's number-row-above-white-keys convention one row down).
  bassRow: {
    whiteNotes: ['A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'],
    whiteKeys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
    blackGapKeys: ['s', undefined, 'd', 'f', undefined, 'h', 'j', 'k', undefined],
  },
  // Level 15 keyboard-layout "option 2" (Han: "gesplitst klavier (links/rechts) met de noten c3-g3 en
  // c4-g4... in dat geval: q-t, i-]"): LEFT half of a single split keyboard, C3-G3 on Q W E R T.
  splitLeft: {
    whiteNotes: ['C3', 'D3', 'E3', 'F3', 'G3'],
    whiteKeys: ['q', 'w', 'e', 'r', 't'],
    blackGapKeys: ['2', '3', undefined, '5'],
  },
  // Level 15 keyboard-layout "option 2" — RIGHT half, C4-G4 on I O P [ ].
  splitRight: {
    whiteNotes: ['C4', 'D4', 'E4', 'F4', 'G4'],
    whiteKeys: ['i', 'o', 'p', '[', ']'],
    blackGapKeys: ['9', '0', undefined, '='],
  },
};

const PianoView = ({
  scale,
  trebleInstrument = null,
  // #990 (Han 2026-08-14): when the about-to-be-played note is among `expectedNotesRef.current()`
  // (called FRESH at press time — see resolveInstrumentFor below), play it normally; otherwise (a
  // "wrong" note) route it through `wrongNoteInstrument` instead — a dedicated instance with
  // chorus+tremolo permanently baked in (see useInstruments.js's trebleWrongRef). A REF, not a
  // plain array/prop: the expected-note set can change continuously during RPG combat (slimes
  // scrolling through a timing window), not just on discrete index-advance events, so it must be
  // read live rather than trusted as a snapshot — see App.jsx's getExpectedTrebleNotesRef. Both
  // props optional; when either is null/absent this is a no-op and behaviour is unchanged (every
  // other PianoView call site — range setters, tone recognizer, etc. — never passes them). The
  // wrong note keeps sounding through its OWN instrument/effect chain for exactly as long as it's
  // held, independent of any other note playing at the same time.
  wrongNoteInstrument = null,
  expectedNotesRef = null,
  // #1052 fourth follow-up (Han 2026-08-18, "give a glow outline to the piano key to be played in
  // levels 1-3"): reuses the SAME `expectedNotesRef` #990 already threads down for wrong-note-instrument
  // routing (§6c — no second "what note is due" mechanism) but only for the GATED levels this was asked
  // for — a continuously-scrolling level's hittable window changes every fraction of a beat, so glowing
  // it there would flicker distractingly; a gated level holds the SAME note for as long as the player
  // needs, which is exactly when a steady visual hint is useful. App.jsx passes this true only while
  // `level.current?.gatedScroll` is active.
  showExpectedNoteGlow = false,
  interactionMode = 'play',
  onTonicSelect = null,
  // 'set-transpose' interaction (keyboard transposition setter): clicking a key makes THAT key
  // the new C — i.e. sets the transposition to the clicked key's pitch class (Han 2026-06-13).
  onTransposeSelect = null,
  minNote = null, // optional
  maxNote = null, // optional
  isHighlightActive = true,
  colorScheme = 'none', // 'none', 'chroma', 'subtle-chroma', 'root', 'highlight' (#1103)
  colorScope = 'all',   // 'all', 'scale', 'chord', 'tonic' (#1103)
  // 'chords' colouring with no playback: the representative chord ({ root, notes }) + theme.
  activeChord = null,
  theme = 'dark',
  onNoteInput = null,
  qwertyKeyboardActive = false,
  // #FR2 (Han 2026-08-10, Level 15): which QWERTY_SCHEMES entry drives the fixed key mapping — 'app'
  // (default, every existing call site) or one of the Level 15 two-keyboard schemes ('bassRow',
  // 'splitLeft', 'splitRight'). Lets a SECOND, simultaneously-rendered PianoView instance use its own
  // physical keys without colliding with the first instance's 'app' mapping.
  qwertyScheme = 'app',
  // #871 (Han 2026-08-11 UAT): OPTIONAL, default false. When true AND `qwertyScheme` is left at its
  // default 'app', derive the QWERTY mapping from `minNote`/`maxNote` (see utils/qwertyScheme.js)
  // instead of the fixed C4=Q window. Only the main practice/level keyboard (TabView.jsx) opts in —
  // every other call site keeps the predictable fixed window.
  useRangeDerivedScheme = false,
  // Compact mode (e.g. the range-setter selector): suppress the note-name labels,
  // which are too large/cluttered on a small windowed keyboard.
  hideLabels = false,
  // Tone Recognizer: highlights a single detected note (e.g. 'A4') or
  // a set of pitch-class indices (0-11) for chord mode
  activeNote = null,
  activePitchClasses = null,
  // Keyboard transposition: pitch-class offset 0-11 (0 = concert). When non-zero the whole
  // keyboard is relabelled (pitch-class only, no octave number), and click/QWERTY sound + scale
  // highlights shift with it, so a transposing-instrument player sees & hears their own keys.
  transpose = 0,
}) => {
  const tonic = scale?.tonic ? standardizeTonic(scale.tonic) : 'C4';

  const notes = useMemo(() => generateAllNotesArray(), []);

  const canonicalTonic = getCanonicalNote(tonic);

  const findNoteIndex = (note) => notes.findIndex((n) => n === note);
  const tonicIndex = findNoteIndex(canonicalTonic);
  const tonicNotFound = tonicIndex === -1;

  if (tonicNotFound) {
    logger.error('PianoView', 'E019-TONIC-NOT-FOUND', null, { tonic, canonicalTonic });
  }

  // Refs must be declared before any early return (Rules of Hooks)
  const pressTimesRef = useRef({});
  const activeKeysRef = useRef(new Set());
  // #661 (Han): the physically-played notes (click / QWERTY / MIDI) so their keys light up on the piano —
  // "highlight de juiste noot op klavier". activeKeysRef alone is a ref (no re-render); this state drives the
  // highlight class in getKeyClass. Updated in handlePointerDown/Up/Cancel so ALL input methods light up.
  const [playedNotes, setPlayedNotes] = useState(() => new Set());
  const activeStopsRef = useRef({});
  const ringingTapsRef = useRef(new Set());
  const tapsTimeoutRef = useRef({});

  /* =========================
     NOTE DISPLAY
  ========================= */
  // Concert→physical mapping for keyboard transposition. `tn(physicalNote)` returns the CONCERT
  // note shown on / sounded by / highlighted at that physical key. Identity when transpose=0, so
  // the normal keyboard is untouched (no regression). One shared transform keeps the label, sound
  // and highlight sites in lock-step (Han 2026-06-13).
  const tShift = transpose ? foldShift(-transpose) : 0;
  const tn = (note) => (tShift && note !== 'halfKey' && note !== 'placeholder')
    ? transposeNoteBySemitones(note, tShift) : note;

  const getNoteLabel = (note) => {
    if (note === 'placeholder' || note === 'halfKey') return '';

    const src = tn(note);
    const notePC = src.replace(/\d+$/, '');
    // Octave numbers show on ALL keyboards EXCEPT the transposition setter (Han 2026-06-14:
    // "_index visible always on the keys, except in the transposition keyboard").
    const dropOctave = interactionMode === 'set-transpose';
    const octave = dropOctave ? '' : (src.match(/\d+$/)?.[0] || '');

    // Scale-aware spelling — shared with WorldPiano so the two keyboards never drift (§6d).
    const idx = scale.notes.findIndex(s => s.replace(/\d+$/, '') === notePC);
    const displayPC = scaleKeyDisplayPC(src, scale);
    if (idx !== -1) return displayPC + octave;

    // Out-of-scale fallback: keep the historical quirk that `getRelativeNoteName`'s own octave shift
    // (B→C♭ up, C→B♯ down) is preserved when NOT transposing, and dropped when a transpose is active.
    const rel = getRelativeNoteName(src, scale.tonic);
    return tShift ? displayPC : rel;
  };

  const formatNoteLabel = (label, isBlack = false) => {
    if (!label) return null;

    // Split label into note name and octave (e.g. "C♯4")
    const match = label.match(/^(.+?)(-?\d+)$/);
    const noteName = match ? match[1] : label;
    const octave = match ? match[2] : '';

    const isTonicSelector = interactionMode === 'select-tonic';

    const labelStyle = {
      fontSize: isTonicSelector ? '0.65em' : (isBlack ? '0.75em' : 'clamp(10px, 4vw, 22px)'),
      lineHeight: '1',
      width: '100%',
      textAlign: 'center',
      display: 'flex', // Changed to flex for alignment control
      flexDirection: 'column',
      justifyContent: 'flex-end', // Always bottom align
      alignItems: 'center',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      overflow: 'visible', // Allow transform to push slightly out if needed
      paddingBottom: isTonicSelector ? '0px' : '5px', // Push tonic selector further down
      transform: isTonicSelector ? 'translateY(5px)' : 'none', // Move down further 5px
      height: '100%'
    };

    const octaveStyle = {
      fontSize: '0.6em',
      verticalAlign: 'baseline',
      position: 'relative',
      bottom: '-0.2em'
    };

    // If NOT in tonic selector, just return standard label.
    if (!isTonicSelector) {
      return (
        <span style={labelStyle} className="piano-key-label">
          {/* #409 (Han): BLACK keys drop the octave subscript — the sharps/flats are cramped and the
              transposition keyboard read as cluttered. White keys keep their octave. */}
          <span>{noteName}{!isBlack && <sub style={octaveStyle}>{octave}</sub>}</span>
        </span>
      );
    }

    // --- TONIC SELECTOR MODE ---

    const currentTonicPC = scale.tonic ? scale.tonic.replace(/\d+$/, '') : '';
    const isCurrentTonic = (noteName === currentTonicPC) || (ENHARMONIC_PAIRS[noteName] === currentTonicPC);

    // Check for enharmonic pairs
    if (ENHARMONIC_PAIRS[noteName]) {
      let primary = noteName;
      let primaryOctave = parseInt(octave, 10);

      let secondary = ENHARMONIC_PAIRS[noteName];
      let secondaryOctave = primaryOctave;

      // Handle Octave Shifts for B#/C and Cb/B
      if (primary === 'C' && secondary === 'B♯') {
        secondaryOctave = primaryOctave - 1;
      } else if (primary === 'B♯' && secondary === 'C') {
        secondaryOctave = primaryOctave + 1;
      } else if (primary === 'B' && secondary === 'C♭') {
        secondaryOctave = primaryOctave + 1;
      } else if (primary === 'C♭' && secondary === 'B') {
        secondaryOctave = primaryOctave - 1;
      }

      // Determine placement: Active tonic is always primary (bottom)
      if (isCurrentTonic && ENHARMONIC_PAIRS[currentTonicPC]) {
        // If the current tonic matches the secondary name, swap them to put tonic at bottom
        if (currentTonicPC === secondary) {
          [primary, secondary] = [secondary, primary];
          [primaryOctave, secondaryOctave] = [secondaryOctave, primaryOctave];
        }
      }

      return (
        <span style={labelStyle} className="piano-key-label">
          <span style={{ fontSize: '0.85em', opacity: 0.5 }}>
            {secondary}<sub style={octaveStyle}>{secondaryOctave}</sub>
          </span>
          <span style={{ fontWeight: isCurrentTonic && primary === currentTonicPC ? 'bold' : 'normal' }}>
            {primary}<sub style={octaveStyle}>{primaryOctave}</sub>
          </span>
        </span>
      );
    }

    // Single label keys (e.g. D, G, A) in selector mode
    // Still align bottom for consistency
    return (
      <span style={labelStyle} className="piano-key-label">
        <span>{noteName}<sub style={octaveStyle}>{octave}</sub></span>
      </span>
    );
  };

  /* =========================
     KEY GENERATION
     ========================= */
  const startNote = minNote || scale.displayNotes[0];
  const endNote = maxNote || scale.displayNotes[scale.displayNotes.length - 1];

  // Find indices in the complete notes array
  let startIndex = findNoteIndex(startNote);
  let endIndex = findNoteIndex(endNote);

  // Safety check
  if (startIndex === -1) startIndex = 0;
  if (endIndex === -1) endIndex = notes.length - 1;

  // If startNote is black, go one white key to the left
  const isBlackKey = (note) => note.includes('♯') || note.includes('♭');
  if (isBlackKey(notes[startIndex]) && startIndex > 0) {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (!isBlackKey(notes[i])) {
        startIndex = i;
        break;
      }
    }
  }

  // If endNote is black, go one white key to the right
  if (isBlackKey(notes[endIndex]) && endIndex < notes.length - 1) {
    for (let i = endIndex + 1; i < notes.length; i++) {
      if (!isBlackKey(notes[i])) {
        endIndex = i;
        break;
      }
    }
  }

  // Build white and black keys (memoized for performance)
  const { whiteKeys, blackKeys } = useMemo(() => {
    if (tonicNotFound) return { whiteKeys: [], blackKeys: [] };
    const pianoWhiteKeys = [];
    for (let i = startIndex; i <= endIndex; i++) {
      // Only push if it's white. 
      // Note: isBlackKey check handles strict character check.
      // What if notes array contains C# but we want to display Db?
      // generateAllNotesArray returns fixed list: C, Db, D... 
      // So the "keys" themselves are fixed physical entities.
      if (!isBlackKey(notes[i])) pianoWhiteKeys.push(notes[i]);
    }

    const pianoBlackKeys = ['halfKey'];
    for (let i = 0; i < pianoWhiteKeys.length - 1; i++) {
      const currentIndex = findNoteIndex(pianoWhiteKeys[i]);
      const nextNote = notes[currentIndex + 1];
      if (
        !nextNote ||
        pianoWhiteKeys[i].startsWith('E') ||
        pianoWhiteKeys[i].startsWith('B')
      ) {
        pianoBlackKeys.push('placeholder');
      } else {
        // Physical key
        pianoBlackKeys.push(nextNote);
      }
    }
    pianoBlackKeys.push('halfKey');

    return { whiteKeys: pianoWhiteKeys, blackKeys: pianoBlackKeys };
  // tonicNotFound is derived from notes/startIndex via tonicIndex — already covered
  // by the notes dep. Adding it would require memoizing findNoteIndex/isBlackKey.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, startIndex, endIndex, findNoteIndex, isBlackKey]);

  // #FR2 (Han 2026-08-10): resolved scheme for this instance (defaults to the app-wide 'app' mapping).
  // Bug fix (Han 2026-08-11, #871 UAT: "Sakura: de keyboard range past niet... die regel moet
  // flexibeler"): the plain fixed C4=Q window silently left most of a melody unmapped when its range
  // sat elsewhere. When the caller left `qwertyScheme` at its default ('app' — every explicitly-named
  // scheme like 'bassRow'/'splitLeft'/'splitRight' is UNCHANGED, this only affects the default path)
  // and passed a `minNote`/`maxNote` range, derive a scheme from THAT range instead via the fallback
  // ladder in utils/qwertyScheme.js — falls back to the unchanged default when no range is given (e.g.
  // KeyboardRangeSetter/KeyboardTransposeSetter/ScaleSelector, which intentionally always show the
  // fixed C4-anchored window regardless of any melody).
  // OPT-IN (`useRangeDerivedScheme`, default false): several OTHER PianoView call sites also pass
  // minNote/maxNote (KeyboardRangeSetter, KeyboardTransposeSetter, ScaleSelector, ToneRecognizer) but
  // intentionally want the PREDICTABLE fixed C4-anchored window regardless of range — only the main
  // practice/level keyboard (TabView.jsx) opts in.
  const scheme = useMemo(() => {
    if (qwertyScheme !== 'app') return QWERTY_SCHEMES[qwertyScheme] || QWERTY_SCHEMES.app;
    if (useRangeDerivedScheme && minNote && maxNote) return deriveQwertyScheme(minNote, maxNote);
    return QWERTY_SCHEMES.app;
  }, [qwertyScheme, useRangeDerivedScheme, minNote, maxNote]);

  // The FIXED black-key note NAMES for the resolved scheme's white-key gaps, built with the EXACT SAME
  // gap-scan algorithm the visible-range `blackKeys` above uses (reused, not re-derived by hand — §6c)
  // so accidental spelling (e.g. D♭ vs C♯) matches the app's canonical note list exactly. Index i = the
  // gap between scheme.whiteNotes[i] and [i+1]; null when that gap has no black key (E-F/B-C boundary)
  // or the scheme's own blackGapKeys[i] doesn't assign a physical key there.
  const fixedBlackNotes = useMemo(() => {
    return scheme.whiteNotes.slice(0, -1).map((note, i) => {
      if (!scheme.blackGapKeys[i]) return null;
      const currentIndex = findNoteIndex(note);
      const nextNote = notes[currentIndex + 1];
      if (!nextNote || note.startsWith('E') || note.startsWith('B')) return null;
      return nextNote;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, scheme]);

  // A note only gets a QWERTY key if it's both in the scheme's fixed window AND actually part of the
  // CURRENT playable range — otherwise a key could trigger a pitch entirely outside the level's range
  // (e.g. Q always resolving to C4 even on a level whose range doesn't include C4 at all).
  const playableNotes = useMemo(() => new Set([...whiteKeys, ...blackKeys]), [whiteKeys, blackKeys]);

  // Build note→qwerty label map (for rendering labels on keys) — FIXED pitch-anchored, not positional.
  const noteQwertyLabel = useMemo(() => {
    const map = {};
    scheme.whiteKeys.forEach((key, i) => {
      const note = scheme.whiteNotes[i];
      if (note && playableNotes.has(note)) map[note] = key.toUpperCase();
    });
    fixedBlackNotes.forEach((note, i) => {
      const key = scheme.blackGapKeys[i];
      if (note && key && playableNotes.has(note)) map[note] = key;
    });
    return map;
  }, [scheme, fixedBlackNotes, playableNotes]);

  // Build qwerty→note map (for keyboard event handler) — FIXED pitch-anchored, not positional.
  const qwertyNoteMap = useMemo(() => {
    const map = {};
    scheme.whiteKeys.forEach((key, i) => {
      const note = scheme.whiteNotes[i];
      if (note && playableNotes.has(note)) map[key] = note;
    });
    fixedBlackNotes.forEach((note, i) => {
      const key = scheme.blackGapKeys[i];
      if (note && key && playableNotes.has(note)) map[key] = note;
    });
    return map;
  }, [scheme, fixedBlackNotes, playableNotes]);

  // Cleanup timeouts on unmount.
  // Capture tapsTimeoutRef.current at effect-setup time so the cleanup function
  // holds a stable reference to the timeout map even if .current changes before
  // cleanup runs (React ref-cleanup best-practice per exhaustive-deps rule).
  useEffect(() => {
    const timeouts = tapsTimeoutRef.current;
    return () => {
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  // Keyboard event listener for QWERTY piano input
  useEffect(() => {
    if (!qwertyKeyboardActive) return;

    const handleKeyDown = async (e) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const note = qwertyNoteMap[e.key.toLowerCase()];
      if (!note) return;
      e.preventDefault();

      if (activeKeysRef.current && activeKeysRef.current.has(note)) return;

      handlePointerDown(note, null);
      if (onNoteInput) onNoteInput(note, true);
    };

    const handleKeyUp = (e) => {
      const note = qwertyNoteMap[e.key.toLowerCase()];
      if (!note) return;
      if (activeKeysRef.current && activeKeysRef.current.has(note)) {
        // BUG FIX (Han 2026-08-02, "loslaten van keys geeft ook 'miss'"): handleKeyDown above already
        // fires onNoteInput explicitly (line ~341) the instant the key goes down. handlePointerUp's
        // DEFAULT (fireInput=true) is for the on-screen piano, where pointerDown does NOT fire input —
        // only pointerUp does (single source there). For QWERTY, keydown is the single legitimate
        // input event; passing the default here double-fired combat on every keyup — a held note could
        // even kill a LATER same-pitch slime on release. fireInput=false only releases audio/highlight.
        handlePointerUp(note, false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  // handlePointerDown/Up are functions defined in the render body. They are effectively
  // stable (their own deps — instruments, context, etc. — rarely change), so adding
  // them to deps here would require wrapping them in useCallback to prevent spurious
  // re-runs. That refactor is tracked separately; for now, intentionally omitted.
  // #990 BUG FIX (Han: "ik denk altijd de correcte noot te horen" — QWERTY never picked up the
  // wrong-note instrument): a first attempt passed `expectedNotes` as a plain array/prop, which
  // was NOT in this dep list — the registered listener kept calling a STALE handlePointerDown
  // closure, frozen at whatever that array was on the render this effect last actually re-ran
  // (often still null, before the first melody note loaded). Switching to `expectedNotesRef` (a
  // REF — see its prop doc above) fixes this at the root: a ref's IDENTITY never changes across
  // renders, so listing it here is inert/always-satisfied rather than a real dependency, and
  // `resolveInstrumentFor` reads `expectedNotesRef.current()` fresh on every call regardless of
  // which render's closure is holding it. `wrongNoteInstrument` DOES still need to be listed for
  // real — its identity changes when the dedicated instrument is rebuilt (slug change).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qwertyKeyboardActive, qwertyNoteMap, trebleInstrument, onNoteInput, expectedNotesRef, wrongNoteInstrument]);

  // NOTE: Web-MIDI input is handled GLOBALLY now (src/hooks/useMidiInput.js, wired in App) so it works in any
  // view, not only while this piano is mounted. The played-note highlight below (playedNotes) still covers
  // click + QWERTY here; MIDI highlight on the piano is a separate follow-up.

  // All hooks have been called above — safe to early-return now
  if (tonicNotFound) return null;

  /* =========================
     STYLING (CSS classes)
     ========================= */
  // getNoteSemitone imported from noteUtils — handles all accidentals and ASCII normalisation.

  // Pitch-class semitone index (0-11) for a note string
  const getNotePc = (note) => {
    const pc = note.replace(/\d+$/, '');
    const map = { 'C': 0, 'C♯': 1, 'D♭': 1, 'D': 2, 'D♯': 3, 'E♭': 3, 'E': 4, 'F': 5, 'F♯': 6, 'G♭': 6, 'G': 7, 'G♯': 8, 'A♭': 8, 'A': 9, 'A♯': 10, 'B♭': 10, 'B': 11 };
    return map[pc] ?? -1;
  };

  // Tone Recognizer active-key helpers
  const activeNoteStr = activeNote ? activeNote : null;
  const isActiveNote = (note) => {
    if (!activeNoteStr) return false;
    return note === activeNoteStr;
  };
  const isActivePc = (note) => {
    if (!activePitchClasses || activePitchClasses.length === 0) return false;
    const pc = getNotePc(note);
    return activePitchClasses.includes(pc);
  };

  const getKeyClass = (note) => {
    if (note === 'halfKey') return 'half-key';
    if (note === 'placeholder') return 'placeholder-key';

    const isBlack = note.includes('♯') || note.includes('♭');   // physical key shape (untransposed)

    // #661 (Han): a physically-played note (click / QWERTY / MIDI) lights its key up. Highest priority so the
    // player sees immediate feedback for what they just played, over scale/tonic/colouring highlights.
    if (playedNotes.has(note)) return isBlack ? 'black-key tone-active-key' : 'white-key tone-active-key';

    const cmp = tn(note);   // concert note this key represents — drives all highlight decisions
    const notePC = cmp.replace(/\d+$/, '');
    const tonicPC = getCanonicalNote(scale.tonic).replace(/\d+$/, '');
    const isTonic = notePC === tonicPC;
    const isInScale = scale.notes.some(s => s.replace(/\d+$/, '') === notePC);

    // Tone Recognizer active classes take priority
    if (isActiveNote(cmp)) return isBlack ? 'black-key tone-active-key' : 'white-key tone-active-key';
    if (isActivePc(cmp)) return isBlack ? 'black-key tone-chord-key' : 'white-key tone-chord-key';

    // #1103: colorScope gates eligibility the same way it does for the canonical staff helper
    // (noteUtils.js melodicNoteColor) — 'scale' scope includes the tonic (it's always in its own
    // scale), matching the OLD tonic_scale_keys mode's own two-tier tonic/scale-degree distinction.
    const scopeEligible = colorScope === 'all' ? true
      : colorScope === 'tonic' ? isTonic
      : colorScope === 'scale' ? (isTonic || isInScale)
      : colorScope === 'chord' ? !!activeChord?.notes?.some(cn => getNoteSemitone(cn) === getNoteSemitone(cmp))
      : false;
    const highlightTonic = isHighlightActive && isTonic && scopeEligible;
    const highlightScale = isHighlightActive && isInScale && scopeEligible;

    // If specific coloring is active (other than 'highlight'), we strip the highlighted classes to
    // avoid CSS overrides — getKeyStyle's inline background wins visually for those schemes anyway.
    if (colorScheme !== 'highlight' && colorScheme !== 'none') {
      return isBlack ? 'black-key' : 'white-key';
    }

    if (colorScheme === 'none') {
      return isBlack ? 'black-key' : 'white-key';
    }

    if (isBlack) {
      if (highlightTonic) return 'black-key tonic-black-key';
      if (highlightScale) return 'black-key highlighted-black-key';
      return 'black-key';
    } else {
      if (highlightTonic) return 'white-key tonic-white-key';
      if (highlightScale) return 'white-key highlighted-white-key';
      return 'white-key';
    }
  };

  const getKeyStyle = (note) => {
    if (note === 'halfKey' || note === 'placeholder') return {};

    const isBlack = note.includes('♯') || note.includes('♭');
    const cmp = tn(note);   // concert note this key represents — drives all highlight decisions
    const notePC = cmp.replace(/\d+$/, '');
    const tonicPC = getCanonicalNote(scale.tonic).replace(/\d+$/, '');
    const isTonic = notePC === tonicPC;
    const isInScale = scale.notes.some(s => s.replace(/\d+$/, '') === notePC);

    // Default text colors: always black on white, always white on black
    const defaultTextColor = isBlack ? '#fff' : '#000';

    // Tone Recognizer highlighted keys
    if (isActiveNote(cmp)) {
      return {
        background: 'linear-gradient(to bottom, #f2c879, #e6a030)',
        color: '#000',
        boxShadow: '0 0 14px 4px rgba(242,200,121,0.8)',
        zIndex: 10,
      };
    }
    if (isActivePc(cmp)) {
      return {
        background: isBlack
          ? 'linear-gradient(to bottom, #6a4400, #3a2700)'
          : 'linear-gradient(to bottom, #c08040, #8a5a20)',
        color: '#fff',
        boxShadow: '0 0 8px 2px rgba(192,128,64,0.5)',
      };
    }

    // TRANSPOSE SETTER: glow the reference C key so it reads at a glance (Han 2026-06-19).
    // The C key here is the PHYSICAL C (chromatone 0 / the key labelled 'C' in this concert-pitch
    // octave), which is the literal reset target ("click C resets to concert"). We reuse the same
    // box-shadow glow the canonical Tone-Recognizer active key uses (the SVG #note-glow-subtle is
    // scoped to the sheet-music SVG and unusable on these HTML keys). Declared before the colouring
    // branches so it composes with whatever background each mode (chords/chromatone/scale) returns.
    const transposeSetterCGlow = (interactionMode === 'set-transpose' && getNoteSemitone(note) === 0)
      ? { boxShadow: '0 0 14px 4px rgba(242,200,121,0.8)', zIndex: 10 }
      : null;

    // #1052 fourth follow-up: the key currently due in a gated level (see `showExpectedNoteGlow`'s own
    // comment) — SAME glow treatment as the transpose-setter's reference key above (§6d: one canonical
    // "this key matters right now" visual, not a second hand-rolled one), read fresh via
    // `resolveNotePitch` (the SAME octave-aware comparison #990's wrong-note routing already uses,
    // §6c) rather than a raw string/enharmonic-unsafe comparison.
    const expectedNoteGlow = (showExpectedNoteGlow && expectedNotesRef?.current)
      ? (() => {
          const expected = expectedNotesRef.current();
          const pitch = resolveNotePitch(cmp);
          return expected?.length && expected.some((n) => resolveNotePitch(n) === pitch)
            ? { boxShadow: '0 0 14px 4px rgba(242,200,121,0.8)', zIndex: 10 }
            : null;
        })()
      : null;

    // #1103 (Han 2026-08-22, coloring 2.0): colorScope gates ELIGIBILITY (which keys get coloured at
    // all — same test getKeyClass's own #1103 comment uses), colorScheme picks WHICH color. This file
    // still computes colour independently from the staff's canonical `melodicNoteColor` (noteUtils.js)
    // — an existing pattern (§6d note in the old scale-subtle-chroma branch this replaces), not
    // something newly introduced here.
    const scopeEligible = colorScope === 'all' ? true
      : colorScope === 'tonic' ? isTonic
      : colorScope === 'scale' ? (isTonic || isInScale)
      : colorScope === 'chord' ? !!activeChord?.notes?.some(cn => getNoteSemitone(cn) === getNoteSemitone(cmp))
      : false;

    // ROOT SCHEME (old 'chords' mode, no playback): tint eligible keys with the representative
    // chord's root colour. Uses the CONCERT note (cmp) so it stays correct under keyboard transposition.
    if (colorScheme === 'root') {
      if (scopeEligible && activeChord?.root) {
        return {
          ...transposeSetterCGlow, ...expectedNoteGlow,
          background: chromatoneMix(getNoteSemitone(activeChord.root), 30, theme),
          color: defaultTextColor,
        };
      }
      return { ...transposeSetterCGlow, ...expectedNoteGlow, color: defaultTextColor };
    }

    // CHROMA / SUBTLE-CHROMA SCHEMES
    if (colorScheme === 'chroma' || colorScheme === 'subtle-chroma') {
      if (!scopeEligible) return { ...transposeSetterCGlow, ...expectedNoteGlow, color: defaultTextColor };
      // Colour follows the TRANSPOSED ('sounds-as') note, not the physical key (Han 2026-06-19):
      // when the keyboard is transposed so a physical key becomes 'C', that key takes chromatone 0
      // and the rest shift accordingly. `cmp` (= tn(note)) is the concert note this key represents;
      // when transpose===0, cmp===note so colours are identical to concert pitch (no regression).
      const semitone = getNoteSemitone(cmp);
      const baseColor = `var(--chromatone-${semitone})`;
      const mixTarget = isBlack ? 'black' : 'white';

      const mixRatioTop = colorScheme === 'subtle-chroma' ? '60%' : '20%';
      const mixRatioBottom = colorScheme === 'subtle-chroma' ? '85%' : '75%';

      const topColor = `color-mix(in srgb, ${baseColor}, ${mixTarget} ${mixRatioTop})`;
      const bottomColor = `color-mix(in srgb, ${baseColor}, ${mixTarget} ${mixRatioBottom})`;

      return {
        ...transposeSetterCGlow, ...expectedNoteGlow,
        background: `linear-gradient(to bottom, ${topColor}, ${bottomColor})`,
        color: defaultTextColor
      };
    }

    // HIGHLIGHT SCHEME (old 'tonic_scale_keys' mode)
    if (colorScheme === 'highlight' && isHighlightActive) {
      if (isTonic && scopeEligible) {
        return {
          ...transposeSetterCGlow, ...expectedNoteGlow,
          backgroundColor: 'var(--white-key-color-tonic)',
          color: defaultTextColor
        };
      }
      if (isInScale && scopeEligible) {
        return {
          ...transposeSetterCGlow, ...expectedNoteGlow,
          backgroundColor: isBlack ? 'var(--black-key-color-highlight)' : 'var(--white-key-color-highlight)',
          color: defaultTextColor
        };
      }
    }

    return { ...transposeSetterCGlow, ...expectedNoteGlow, color: defaultTextColor };
  };

  /* =========================
     INTERACTION HANDLER
     ========================= */
  const stopNote = (note) => {
    if (activeStopsRef.current[note]) {
      activeStopsRef.current[note]();
      delete activeStopsRef.current[note];
    }
  };

  // #990: pick which instrument a just-pressed CONCERT note (already run through `tn()`) plays
  // through. Calls `expectedNotesRef.current()` FRESH — never trusts a value captured earlier —
  // then compares via `resolveNotePitch`, the SAME octave-aware pitch resolution `playSound`
  // itself uses (CLAUDE.md §6c: reuse, don't reimplement), so an enharmonic respelling (e.g.
  // expected "D♭4", played "C♯4") still matches, and a same-letter-different-octave note (D4 vs
  // D5) correctly does NOT. Falls back to the normal instrument whenever expectedNotesRef/
  // wrongNoteInstrument aren't wired for this PianoView instance (every call site except the
  // main practice keyboard), the current expected set is empty/unknown, or the note matches.
  const resolveInstrumentFor = (concertNote) => {
    if (!expectedNotesRef?.current || !wrongNoteInstrument) return trebleInstrument;
    const expectedNotes = expectedNotesRef.current();
    // #990 (Han, quick pass): `null` = no judgment context — play normally. `[]` (a context IS
    // active but nothing is due right now) is the "extra note" case and counts as wrong too.
    if (expectedNotes == null) return trebleInstrument;
    if (!expectedNotes.length) return wrongNoteInstrument;
    const pitch = resolveNotePitch(concertNote);
    const isExpected = expectedNotes.some((n) => resolveNotePitch(n) === pitch);
    return isExpected ? trebleInstrument : wrongNoteInstrument;
  };

  const handlePointerDown = async (note, e) => {
    if (note === 'halfKey' || note === 'placeholder') return;
    // Transposition setter: a click sets the transposition (clicked key → C) and plays nothing.
    if (interactionMode === 'set-transpose') {
      if (onTransposeSelect) onTransposeSelect(getNotePc(note));
      return;
    }
    if (activeKeysRef.current.has(note)) return;
    if (e && e.currentTarget) e.currentTarget.setPointerCapture(e.pointerId);

    // Stop all currently ringing taps because a new note is played
    ringingTapsRef.current.forEach(ringingNote => {
      stopNote(ringingNote);
      clearTimeout(tapsTimeoutRef.current[ringingNote]);
      delete tapsTimeoutRef.current[ringingNote];
    });
    ringingTapsRef.current.clear();

    const ctx = trebleInstrument?.context;
    if (!ctx) return;
    if (ctx.state !== 'running') await ctx.resume();

    pressTimesRef.current[note] = Date.now();
    activeKeysRef.current.add(note);
    setPlayedNotes((s) => { const n = new Set(s); n.add(note); return n; });   // light up the key
    // Start with long sustain (null duration), store the stop function! Sound the CONCERT note
    // (tn) so a transposed key plays what its label says; press-tracking still keys off `note`.
    // #990: a "wrong" note (relative to expectedNotesRef.current()) plays through wrongNoteInstrument
    // instead — resolved once here so it stays sounding, effected, through this exact note's whole hold.
    const concertNote = tn(note);
    const stopFn = playSound(concertNote, resolveInstrumentFor(concertNote), ctx, ctx.currentTime, null);
    if (stopFn) {
      activeStopsRef.current[note] = stopFn;
    }
  };

  // fireInput=false releases the key (audio + highlight) WITHOUT re-firing onNoteInput — used by MIDI note-off,
  // which already fired combat on note-ON (so the note isn't double-counted). Pointer/QWERTY keep the default.
  const handlePointerUp = (note, fireInput = true) => {
    if (!activeKeysRef.current.has(note)) return;
    activeKeysRef.current.delete(note);
    setPlayedNotes((s) => { if (!s.has(note)) return s; const n = new Set(s); n.delete(note); return n; });

    const pressStart = pressTimesRef.current[note];
    delete pressTimesRef.current[note];

    const duration = pressStart != null ? (Date.now() - pressStart) : 0;
    const isTap = pressStart != null && duration < 50; // 0.05s

    if (!isTap) {
      // Held for >= 0.05s, stop immediately upon release
      stopNote(note);
    } else {
      // Tapped for < 0.05s, let it ring up to 1 second total (so 1000 - duration ms more)
      ringingTapsRef.current.add(note);
      tapsTimeoutRef.current[note] = setTimeout(() => {
        stopNote(note);
        ringingTapsRef.current.delete(note);
        delete tapsTimeoutRef.current[note];
      }, Math.max(0, 1000 - duration));
    }

    if (fireInput && onNoteInput) onNoteInput(note, isTap);

    if (interactionMode === 'select-tonic' && onTonicSelect) {
      const notePC = note.replace(/\d+$/, '');
      const currentTonicPC = scale.tonic.replace(/\d+$/, '');
      const isSameKey = (notePC === currentTonicPC) || (ENHARMONIC_PAIRS[notePC] === currentTonicPC);
      if (isSameKey) {
        const currentOctave = parseInt(scale.tonic.match(/\d+$/)?.[0] || '4', 10);
        const newPC = ENHARMONIC_PAIRS[currentTonicPC];
        if (newPC) {
          let newOctave = currentOctave;
          if (currentTonicPC === 'C' && newPC === 'B♯') newOctave--;
          else if (currentTonicPC === 'B♯' && newPC === 'C') newOctave++;
          else if (currentTonicPC === 'B' && newPC === 'C♭') newOctave++;
          else if (currentTonicPC === 'C♭' && newPC === 'B') newOctave--;
          onTonicSelect(newPC + newOctave, true);
          return;
        }
      }
      onTonicSelect(note);
    }
  };

  const handlePointerCancel = (note) => {
    if (!activeKeysRef.current.has(note)) return;
    activeKeysRef.current.delete(note);
    setPlayedNotes((s) => { if (!s.has(note)) return s; const n = new Set(s); n.delete(note); return n; });
    delete pressTimesRef.current[note];
    stopNote(note);
  };

  /* =========================
     RENDER
     ========================= */

  const qwertyLabelStyle = {
    position: 'absolute',
    bottom: '40px', // sit just above the note name label
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 'clamp(14px, 2.4vw, 22px)',
    color: 'rgba(128,128,128,0.85)',
    pointerEvents: 'none',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    lineHeight: 1,
    zIndex: 3,
  };

  return (
    <div className="piano-container">
      <div className="piano-white">
        {whiteKeys.map((note, i) => (
          <div
            key={i}
            className={getKeyClass(note)}
            style={{ ...getKeyStyle(note), position: 'relative', touchAction: 'none' }}
            onPointerDown={(e) => handlePointerDown(note, e)}
            onPointerUp={() => handlePointerUp(note)}
            onPointerCancel={() => handlePointerCancel(note)}
          >
            {qwertyKeyboardActive && noteQwertyLabel[note] && (
              <span style={qwertyLabelStyle}>{noteQwertyLabel[note]}</span>
            )}
            {!hideLabels && formatNoteLabel(getNoteLabel(note), false)}
          </div>
        ))}
      </div>

      <div className="piano-black">
        {blackKeys.map((note, i) => (
          <div
            key={i}
            className={getKeyClass(note)}
            style={{ ...getKeyStyle(note), position: 'relative', touchAction: 'none' }}
            onPointerDown={(e) => handlePointerDown(note, e)}
            onPointerUp={() => handlePointerUp(note)}
            onPointerCancel={() => handlePointerCancel(note)}
          >
            {qwertyKeyboardActive && noteQwertyLabel[note] && (
              <span style={qwertyLabelStyle}>{noteQwertyLabel[note]}</span>
            )}
            {!hideLabels && formatNoteLabel(getNoteLabel(note), true)}
          </div>
        ))}
      </div>
    </div>
  );
};

// Perf (#1161, Han 2026-08-26): PianoView was the only major render surface still un-memoized while
// SheetMusic/MelodyNotesLayer already got this treatment. App.jsx's `combatNote` (and other RPG-combat
// state) changes on EVERY note played, forcing a full App re-render — without a memo boundary here, the
// whole on-screen keyboard (every key, every label, every colour) reconciled from scratch on every single
// note, even though PianoView's own key-press visuals are already driven by its OWN local `playedNotes`
// state and its own window `keydown` listener, not by anything App passes down. A stress-test CPU profile
// (button-mashing during active RPG combat, 4x-throttled mobile emulation) showed this file among the
// hot self-time contributors purely from re-render churn, not from the keyboard's own logic changing.
export default React.memo(PianoView);
