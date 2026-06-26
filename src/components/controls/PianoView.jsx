// components/PianoView.jsx
import React, { useMemo, useEffect, useRef } from 'react';
import logger from '../../utils/logger';
import playSound from '../../audio/playSound';
import { standardizeTonic, getRelativeNoteName } from '../../theory/convertToDisplayNotes';
import generateAllNotesArray from '../../theory/allNotesArray';
import { getCanonicalNote, ENHARMONIC_PAIRS, getNoteSemitone, chordNoteColor } from '../../theory/noteUtils';
import { transposeNoteBySemitones } from '../../theory/musicUtils';

// Fold a semitone offset into the nearest octave, range [-6, +6]. Keyboard transposition is a
// PITCH-CLASS rotation (Han 2026-06-13: "−1 and +11 are the same — the height comes from the range
// setter"), so we keep the sounded/relabelled note close to the physical key instead of jumping a
// whole octave for large offsets.
export const foldShift = (s) => { const r = ((s % 12) + 12) % 12; return r > 6 ? r - 12 : r; };


// QWERTY → piano key mapping (standard GarageBand/DAW layout)
// White keys: Q W E R T Y U I O P [ ]
// Black keys (number row, by physical gap position): 2 3 _ 5 6 7 _ 9 0 _ =
const QWERTY_WHITE_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'];
// Map: keyboard character → blackKeys array index (1-based slots between white keys).
// All 11 gap positions are covered so the mapping is correct regardless of starting note.
// Slots that land on a placeholder (E-F or B-C boundary) are ignored by the filter below.
const QWERTY_BLACK_SLOTS = [
  ['2', 1], ['3', 2], ['4', 3],
  ['5', 4], ['6', 5], ['7', 6],
  ['8', 7], ['9', 8], ['0', 9],
  ['-', 10], ['=', 11],
];

const PianoView = ({
  scale,
  trebleInstrument = null,
  interactionMode = 'play',
  onTonicSelect = null,
  // 'set-transpose' interaction (keyboard transposition setter): clicking a key makes THAT key
  // the new C — i.e. sets the transposition to the clicked key's pitch class (Han 2026-06-13).
  onTransposeSelect = null,
  minNote = null, // optional
  maxNote = null, // optional
  isHighlightActive = true,
  noteColoringMode = 'none', // 'none', 'tonic_keys', 'tonic', 'chromatone_keys', 'chromatone', 'subtle-chroma', 'chords'
  // 'chords' colouring with no playback: the representative chord ({ root, notes }) + theme.
  activeChord = null,
  theme = 'dark',
  onNoteInput = null,
  qwertyKeyboardActive = false,
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

    // Find index in internal scale by pitch class
    const idx = scale.notes.findIndex(s => s.replace(/\d+$/, '') === notePC);
    if (idx !== -1) {
      // Return the scale's preferred display name with the current octave
      const displayPC = scale.displayNotes[idx].replace(/\d+$/, '');
      return displayPC + octave;
    }

    const rel = getRelativeNoteName(src, scale.tonic);
    return tShift ? rel.replace(/-?\d+$/, '') : rel;
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

    // If NOT in tonic selector, just return standard label
    if (!isTonicSelector) {
      return (
        <span style={labelStyle} className="piano-key-label">
          <span>{noteName}<sub style={octaveStyle}>{octave}</sub></span>
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

  // Build note→qwerty label map (for rendering labels on keys)
  const noteQwertyLabel = useMemo(() => {
    const map = {};
    QWERTY_WHITE_KEYS.forEach((key, i) => {
      if (i < whiteKeys.length) map[whiteKeys[i]] = key.toUpperCase();
    });
    QWERTY_BLACK_SLOTS.forEach(([key, idx]) => {
      if (idx < blackKeys.length && blackKeys[idx] !== 'placeholder' && blackKeys[idx] !== 'halfKey') {
        map[blackKeys[idx]] = key;
      }
    });
    return map;
  }, [whiteKeys, blackKeys]);

  // Build qwerty→note map (for keyboard event handler)
  const qwertyNoteMap = useMemo(() => {
    const map = {};
    QWERTY_WHITE_KEYS.forEach((key, i) => {
      if (i < whiteKeys.length) map[key] = whiteKeys[i];
    });
    QWERTY_BLACK_SLOTS.forEach(([key, idx]) => {
      if (idx < blackKeys.length && blackKeys[idx] !== 'placeholder' && blackKeys[idx] !== 'halfKey') {
        map[key] = blackKeys[idx];
      }
    });
    return map;
  }, [whiteKeys, blackKeys]);

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
        handlePointerUp(note);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qwertyKeyboardActive, qwertyNoteMap, trebleInstrument, onNoteInput]);

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

    const cmp = tn(note);   // concert note this key represents — drives all highlight decisions
    const notePC = cmp.replace(/\d+$/, '');
    const tonicPC = getCanonicalNote(scale.tonic).replace(/\d+$/, '');
    const isTonic = notePC === tonicPC;
    const isInScale = scale.notes.some(s => s.replace(/\d+$/, '') === notePC);

    // Tone Recognizer active classes take priority
    if (isActiveNote(cmp)) return isBlack ? 'black-key tone-active-key' : 'white-key tone-active-key';
    if (isActivePc(cmp)) return isBlack ? 'black-key tone-chord-key' : 'white-key tone-chord-key';

    const highlightTonic = isHighlightActive && isTonic;
    const highlightScale = isHighlightActive && isInScale;

    // If specific coloring is active (other than tonic_scale_keys), we strip the highlighted classes to avoid CSS overrides
    if (noteColoringMode !== 'tonic_scale_keys' && noteColoringMode !== 'none') {
      return isBlack ? 'black-key' : 'white-key';
    }

    if (noteColoringMode === 'none') {
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

    // CHORDS MODE (no playback): tint keys belonging to the representative chord with the chord
    // root's colour. Uses the CONCERT note (cmp) so it stays correct under keyboard transposition.
    if (noteColoringMode === 'chords') {
      const c = chordNoteColor(cmp, activeChord, theme);
      return c
        ? { ...transposeSetterCGlow, background: c, color: defaultTextColor }
        : { ...transposeSetterCGlow, color: defaultTextColor };
    }

    // CHROMATONE MODE
    if (noteColoringMode === 'chromatone' || noteColoringMode === 'chromatone_keys' || noteColoringMode === 'subtle-chroma') {
      // Colour follows the TRANSPOSED ('sounds-as') note, not the physical key (Han 2026-06-19):
      // when the keyboard is transposed so a physical key becomes 'C', that key takes chromatone 0
      // and the rest shift accordingly. `cmp` (= tn(note)) is the concert note this key represents;
      // when transpose===0, cmp===note so colours are identical to concert pitch (no regression).
      const semitone = getNoteSemitone(cmp);
      const baseColor = `var(--chromatone-${semitone})`;
      const mixTarget = isBlack ? 'black' : 'white';

      const mixRatioTop = noteColoringMode === 'subtle-chroma' ? '60%' : '20%';
      const mixRatioBottom = noteColoringMode === 'subtle-chroma' ? '85%' : '75%';

      const topColor = `color-mix(in srgb, ${baseColor}, ${mixTarget} ${mixRatioTop})`;
      const bottomColor = `color-mix(in srgb, ${baseColor}, ${mixTarget} ${mixRatioBottom})`;

      return {
        ...transposeSetterCGlow,
        background: `linear-gradient(to bottom, ${topColor}, ${bottomColor})`,
        color: defaultTextColor
      };
    }

    // TONIC + SCALE KEYS MODE
    if (noteColoringMode === 'tonic_scale_keys') {
      if (isTonic && isHighlightActive) {
        return {
          ...transposeSetterCGlow,
          backgroundColor: 'var(--white-key-color-tonic)',
          color: defaultTextColor
        };
      }
      if (isInScale && isHighlightActive) {
        return {
          ...transposeSetterCGlow,
          backgroundColor: isBlack ? 'var(--black-key-color-highlight)' : 'var(--white-key-color-highlight)',
          color: defaultTextColor
        };
      }
    }

    return { ...transposeSetterCGlow, color: defaultTextColor };
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
    // Start with long sustain (null duration), store the stop function! Sound the CONCERT note
    // (tn) so a transposed key plays what its label says; press-tracking still keys off `note`.
    const stopFn = playSound(tn(note), trebleInstrument, ctx, ctx.currentTime, null);
    if (stopFn) {
      activeStopsRef.current[note] = stopFn;
    }
  };

  const handlePointerUp = (note) => {
    if (!activeKeysRef.current.has(note)) return;
    activeKeysRef.current.delete(note);

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

    if (onNoteInput) onNoteInput(note, isTap);

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

export default PianoView;
