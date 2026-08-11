import { useEffect, useRef, useCallback, useState } from 'react';
import { LEVEL_LEAD_IN_BARS, TICKS_PER_WHOLE, secondsPerTick } from '../constants/timing';
import { getNoteSemitone } from '../theory/noteUtils';

// #FR2 (Han 2026-08-10, Level 15 "twee toetsen!!!"): the bass/left-hand keyboard's own SIMPLE grading —
// deliberately NOT SheetRpgLayer's graded-timing combat system (perfect/too-early/too-late tiers,
// slime spawn/flight). Han's spec for the bass part is coarse by design ("roots on one, 1 noot per
// maat") — one expected root per measure, playable any time during that measure. A per-measure
// hit/miss check is the right-sized mechanism for that, not a second copy of the treble combat engine.
//
// PURE timing logic + a stats callback — no rendering. Reuses `level.onHit`/`level.onMiss` (useLevel.js)
// so bass hits contribute to the SAME combined stats treble combat already reports through, rather than
// inventing a parallel stats surface Han never asked for.
export default function useTwoHandedBass({
  active,           // level.active && !!level.current?.twoHanded
  context,
  levelAudioStart,
  bpm,
  timeSignature,
  bassMelody,       // the level's growing bass Melody (App.jsx's levelBackingStream.bass)
  onHit,            // level.onHit
  onMiss,           // level.onMiss
}) {
  const measureRef = useRef(-1);      // last-seen content measure index (0-based), -1 = lead-in/not started
  const hitThisMeasureRef = useRef(false);
  // #862 (Han 2026-08-10, "doe maar meteen - ik wil 15 volledig kunnen testen"): a nonce-keyed hit/miss
  // EVENT so SheetRpgLayer can drive its OWN purely-visual bass-slime feedback (dying animation,
  // judgment popup, hero attack) off the SAME hit/miss determination this hook already makes — not a
  // second, independently-derived grading system (§6c). `measureIndex` lets SheetRpgLayer resolve the
  // matching bass-slime entry by position rather than re-deriving timing.
  const [event, setEvent] = useState(null);
  const eventNonceRef = useRef(0);

  // Resolve the expected root note for content-measure `m` (0-based) — the bass melody's own note
  // whose absolute offset falls within that measure's tick range (LEVEL_BASS_SIMPLE generates exactly
  // one note per measure, ranked onto the downbeat — same recipe levels 2-7's auto-played cello already
  // uses, proven correct there, §6c: reused, not re-derived).
  const expectedRootFor = useCallback((m) => {
    if (!bassMelody?.offsets?.length) return null;
    const barBeats = timeSignature[0] || 4;
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    const lo = (LEVEL_LEAD_IN_BARS + m) * measureLengthTicks;
    const hi = lo + measureLengthTicks;
    for (let i = 0; i < bassMelody.offsets.length; i++) {
      const o = bassMelody.offsets[i];
      if (o != null && o >= lo && o < hi && bassMelody.notes[i] !== 'r') return bassMelody.notes[i];
    }
    return null;
  }, [bassMelody, timeSignature]);
  // The tick effect below intentionally does NOT depend on `bassMelody` (it would restart the whole rAF
  // loop/measure counter every time a JIT chunk arrives) — so it must read `expectedRootFor` through a
  // ref, not close over it directly, or its "was there a real root" check would stay bound to whatever
  // melody existed when the effect last (re)started, silently swallowing real misses for measures whose
  // content arrived in a LATER chunk. Same stale-closure fix class as §188's `sideScroll` bug.
  const expectedRootForRef = useRef(expectedRootFor); expectedRootForRef.current = expectedRootFor;

  useEffect(() => {
    if (!active || !context || levelAudioStart == null) return;
    let raf;
    const barBeats = timeSignature[0] || 4;
    const measureLengthTicks = (TICKS_PER_WHOLE * barBeats) / (timeSignature[1] || 4);
    const barSec = measureLengthTicks * secondsPerTick(bpm || 80);
    const contentStartTime = levelAudioStart + LEVEL_LEAD_IN_BARS * barSec;

    const tick = () => {
      const elapsed = context.currentTime - contentStartTime;
      const m = Math.floor(elapsed / barSec);
      if (m !== measureRef.current) {
        // A real content measure just ended without the player hitting its root — a miss. Guarded so
        // the very first tick (measureRef starts at -1, still in the lead-in) never counts a spurious
        // miss, and so we never score a measure that hasn't actually started yet.
        // Bug fix (Han 2026-08-10, "na voltooiing level blijven er 'missed' noten bijkomen"): this loop
        // has no natural upper bound — `m` just keeps incrementing forever as long as `active` stays
        // true (App.jsx now also gates `active` off on `level.done`, the PRIMARY fix, but this is a
        // defensive second layer): only score a miss for a measure that actually HAD a real expected
        // root. A measure past the song's real end (or a rest measure, if `emphasize_roots` ever leaves
        // one empty) has none — `expectedRootFor` returns null — so there is nothing to have missed.
        if (measureRef.current >= 0 && !hitThisMeasureRef.current && expectedRootForRef.current(measureRef.current) != null) {
          // Bug fix (Han 2026-08-10, #861, "ze registreren allemaal als missed"): the reason string
          // passed here MUST match one of the shared stat keys emptyStats/onMiss expect ('missed' /
          // 'wrongUncorrected' / 'extraNote', see useLevel.js) — the previous 'missedBassRoot' created
          // its OWN untracked stat key, invisible in both charts, rather than counting toward the
          // normal 'missed' bucket every chart already reads.
          onMiss?.('missed', 'bass');
          setEvent({ type: 'miss', measureIndex: measureRef.current, nonce: ++eventNonceRef.current });
        }
        measureRef.current = m;
        hitThisMeasureRef.current = false;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      measureRef.current = -1;
      hitThisMeasureRef.current = false;
    };
  }, [active, context, levelAudioStart, bpm, timeSignature, onMiss]);

  // PianoView's onNoteInput for the bass keyboard — compares by SEMITONE (not string equality), since
  // the generator's enharmonic spelling for the expected root need not match the fixed keyboard's own
  // canonical spelling for the same pitch class.
  const handleBassNoteInput = useCallback((note) => {
    if (!active || measureRef.current < 0 || hitThisMeasureRef.current) return;
    const expected = expectedRootFor(measureRef.current);
    if (expected == null) return;
    if (getNoteSemitone(note) === getNoteSemitone(expected)) {
      hitThisMeasureRef.current = true;
      onHit?.({ category: 'perfect', points: 1, hand: 'bass' });
      setEvent({ type: 'hit', measureIndex: measureRef.current, note: expected, nonce: ++eventNonceRef.current });
    }
  }, [active, expectedRootFor, onHit]);

  // Reset on deactivation (level end/quit) so a stale event from a PREVIOUS run never resolves a
  // slime in a fresh one — mirrors measureRef/hitThisMeasureRef's own reset in the tick effect's cleanup.
  useEffect(() => { if (!active) setEvent(null); }, [active]);

  return { handleBassNoteInput, event };
}
