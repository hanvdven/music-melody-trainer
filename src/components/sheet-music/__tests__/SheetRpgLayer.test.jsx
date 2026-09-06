import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SheetRpgLayer from '../SheetRpgLayer';
// #991 — keep the real DAMAGED_FILES array (assert its shape) but spy on the play function itself so we
// don't need a real AudioContext/decode in jsdom.
vi.mock('../../../audio/playOneShotSfx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
import playOneShotSfx, { DAMAGED_FILES } from '../../../audio/playOneShotSfx';
// Bug fix (Han 2026-08-25 UAT, "het gebeurt altijd, in de oneven maten"): to verify the call/response
// hide/reveal split without reverse-engineering Maestro glyph rendering, spy on MelodyNotesLayer itself
// and inspect the TRANSFORMED `melody.notes` array each of SheetRpgLayer's two layers (Rest/Real) builds
// — the exact data the bug corrupted — instead of asserting on rendered glyph shapes. A pass-through spy
// wrapping the REAL component's underlying function (unwrapped from its own `React.memo`, so `vi.fn` gets
// a genuine callable) — the existing Maestro-glyph tests above/below still get the REAL rendering.
vi.mock('../MelodyNotesLayer', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn(actual.default.type) };
});
import MelodyNotesLayer from '../MelodyNotesLayer';

// #647 — a slime under each treble note (coloured by duration), the hero bottom-left. pixelsPerTick is null
// in the real render (the bug that hid every slime); the index-based fallback via allOffsets + noteWidth
// must place them. Exercise that (null ppt) path here.
const wrap = (props) => render(
    <svg>
        <SheetRpgLayer startX={20} pixelsPerTick={null} allOffsets={[0, 12, 18, 24]} noteWidth={20}
            trebleStart={100} staffHeight={40} viewBottom={220} {...props} />
    </svg>,
);

describe('SheetRpgLayer (#647)', () => {
    it('renders one slime per non-rest treble note (via the ppt=null fallback), coloured by length, plus a hero', () => {
        // Han: red = short, blue = long, green = middle. C4 quarter(12)=green, rest(skip), E4 eighth(6)=red,
        // G4 half(24)=blue.
        const melody = { notes: ['C4', 'r', 'E4', 'G4'], offsets: [0, 12, 18, 24], durations: [12, 6, 6, 24] };
        const { container } = wrap({ trebleMelody: melody });
        const hrefs = [...container.querySelectorAll('image')].map((im) => im.getAttribute('href') || '');
        expect(hrefs).toHaveLength(3);               // 4 notes − 1 rest
        expect(hrefs[0]).toContain('slime-green');   // quarter (middle)
        expect(hrefs[1]).toContain('slime-red');     // eighth (short)
        expect(hrefs[2]).toContain('slime-blue');    // half (long)
        expect(container.querySelector('foreignObject')).toBeTruthy();   // hero
    });

    it('skips the spacer note "c" and renders no slimes without a treble melody', () => {
        expect(wrap({ trebleMelody: null }).container.querySelectorAll('image')).toHaveLength(0);
        const spacer = { notes: ['c', 'D4'], offsets: [0, 12], durations: [12, 12] };
        expect(wrap({ trebleMelody: spacer }).container.querySelectorAll('image')).toHaveLength(1);
    });

    it('tied notes get ONE slime — only the first — coloured by the TOTAL length', () => {
        // C4 quarter tied to a quarter continuation (total = half = LONG → blue), then D4 quarter (green).
        const tied = { notes: ['C4', 'C4', 'D4'], offsets: [0, 12, 24], durations: [12, 12, 12], ties: ['tie', null, null] };
        const hrefs = [...wrap({ trebleMelody: tied }).container.querySelectorAll('image')].map((im) => im.getAttribute('href') || '');
        expect(hrefs).toHaveLength(2);               // tied pair = 1 slime, + D4
        expect(hrefs[0]).toContain('slime-blue');    // tied total = half → long
        expect(hrefs[1]).toContain('slime-green');   // D4 quarter → middle
    });

    it('combat: exact-pitch match kills the leftmost slime; a wrong note does not; clearing all fires onSlimesCleared', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onSlimesCleared = vi.fn();
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0, 12], noteWidth: 20,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, onSlimesCleared,
            trebleMelody: { notes: ['C4', 'D4'], offsets: [0, 12], durations: [12, 12] },
        };
        let container, rerender;
        act(() => { const r = render(<svg><SheetRpgLayer {...base} combatNote={null} /></svg>); container = r.container; rerender = r.rerender; });
        const play = (note, nonce) => act(() => rerender(<svg><SheetRpgLayer {...base} combatNote={{ note, nonce }} /></svg>));
        const settle = () => act(() => vi.advanceTimersByTime(160 * 8));   // > death-animation frames
        expect(container.querySelectorAll('image')).toHaveLength(2);

        play('C4', 1); settle();                                          // leftmost matches → dies
        expect(container.querySelectorAll('image')).toHaveLength(1);
        expect(onSlimesCleared).not.toHaveBeenCalled();

        play('F4', 2); settle();                                          // wrong note → nothing dies
        expect(container.querySelectorAll('image')).toHaveLength(1);

        play('D4', 3); settle();                                          // last slime → cleared
        expect(onSlimesCleared).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('#663: two correct notes played rapidly (before the first death animation finishes) both register — static combat is not consistency-blocked by an in-progress animation', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onHit = vi.fn(); const onSlimesCleared = vi.fn();
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0, 12], noteWidth: 20,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, onHit, onSlimesCleared,
            trebleMelody: { notes: ['C4', 'D4'], offsets: [0, 12], durations: [12, 12] },
        };
        let container, rerender;
        act(() => { const r = render(<svg><SheetRpgLayer {...base} combatNote={null} /></svg>); container = r.container; rerender = r.rerender; });
        const play = (note, nonce) => act(() => rerender(<svg><SheetRpgLayer {...base} combatNote={{ note, nonce }} /></svg>));
        const tick = () => act(() => vi.advanceTimersByTime(16));   // one rAF-ish frame, well short of the death animation

        play('C4', 1); tick();          // first slime struck, starts dying — animation NOT finished yet
        play('D4', 2); tick();          // second slime played immediately after — must still register

        expect(onHit).toHaveBeenCalledTimes(2);
        act(() => vi.advanceTimersByTime(160 * 8));   // let both animations finish
        expect(container.querySelectorAll('image')).toHaveLength(0);
        expect(onSlimesCleared).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('side-scroll (#661): reuses the REAL staff — a scrollNotation bundle renders canonical Maestro noteheads', () => {
        // Instead of hand-rolled glyphs, the moving staff is drawn via MelodyNotesLayer (font-family="Maestro").
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const notation = {
            melody: { notes: ['C4', 'E4'], offsets: [0, 12], durations: [12, 12], ties: [null, null] },
            numAccidentals: 0, noteGroupSize: 12, measureLengthSlots: 48, timeSignature: [4, 4],
            clef: 'treble', colorScheme: 'none', colorScope: 'all', tonic: 'C4', scaleNotes: [], processedChords: [],
            theme: 'default', startMeasureIndex: 0, transpositionSemitones: 0, courtesyAccidentals: true,
        };
        const { container } = render(
            <svg><SheetRpgLayer startX={20} pixelsPerTick={null} allOffsets={[0, 12]} noteWidth={20}
                trebleStart={100} staffHeight={40} viewBottom={220} bpm={80} sideScroll viewRight={500}
                trebleMelody={notation.melody} scrollNotation={notation} /></svg>,
        );
        const maestro = [...container.querySelectorAll('text')].filter((t) => (t.getAttribute('font-family') || '') === 'Maestro');
        expect(maestro.length).toBeGreaterThan(0);   // canonical noteheads from MelodyNotesLayer, not hand-rolled
        vi.useRealTimers();
    });

    it('side-scroll (#661 "3 lijnen zichtbaar"): bass + percussion ALSO scroll via their own bundles', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const trebleNotation = {
            melody: { notes: ['C4'], offsets: [0], durations: [12], ties: [null] },
            numAccidentals: 0, noteGroupSize: 12, measureLengthSlots: 48, timeSignature: [4, 4],
            clef: 'treble', colorScheme: 'none', colorScope: 'all', tonic: 'C4', scaleNotes: [], processedChords: [],
            theme: 'default', startMeasureIndex: 0, transpositionSemitones: 0, courtesyAccidentals: true,
        };
        const bassNotation = { ...trebleNotation, melody: { notes: ['C2'], offsets: [0], durations: [12], ties: [null] }, clef: 'bass' };
        const percNotation = { ...trebleNotation, melody: { notes: ['k'], offsets: [0], durations: [12], ties: [null] }, staff: 'percussion', clef: null };
        const { container } = render(
            <svg><SheetRpgLayer startX={20} pixelsPerTick={null} allOffsets={[0]} noteWidth={20}
                trebleStart={100} bassStart={140} percussionStart={180} staffHeight={40} viewBottom={260}
                bpm={80} sideScroll viewRight={500}
                trebleMelody={trebleNotation.melody} scrollNotation={trebleNotation}
                scrollNotationBass={bassNotation} scrollNotationPercussion={percNotation} /></svg>,
        );
        // 3 staves worth of Maestro noteheads (treble + bass + percussion) — more than the treble-only case.
        const maestro = [...container.querySelectorAll('text')].filter((t) => (t.getAttribute('font-family') || '') === 'Maestro');
        expect(maestro.length).toBeGreaterThanOrEqual(3);
        vi.useRealTimers();
    });

    it('side-scroll: bass/percussion bundles are absent (null) when not visible — no extra staves render', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const notation = {
            melody: { notes: ['C4'], offsets: [0], durations: [12], ties: [null] },
            numAccidentals: 0, noteGroupSize: 12, measureLengthSlots: 48, timeSignature: [4, 4],
            clef: 'treble', colorScheme: 'none', colorScope: 'all', tonic: 'C4', scaleNotes: [], processedChords: [],
            theme: 'default', startMeasureIndex: 0, transpositionSemitones: 0, courtesyAccidentals: true,
        };
        const { container } = render(
            <svg><SheetRpgLayer startX={20} pixelsPerTick={null} allOffsets={[0]} noteWidth={20}
                trebleStart={100} bassStart={140} percussionStart={180} staffHeight={40} viewBottom={260}
                bpm={80} sideScroll viewRight={500}
                trebleMelody={notation.melody} scrollNotation={notation}
                scrollNotationBass={null} scrollNotationPercussion={null} /></svg>,
        );
        const maestro = [...container.querySelectorAll('text')].filter((t) => (t.getAttribute('font-family') || '') === 'Maestro');
        expect(maestro.length).toBeGreaterThan(0);   // treble alone still renders
        vi.useRealTimers();
    });

    it('side-scroll (#660): playing the correct note before the slime reaches the hit-zone is a MISS', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onHit = vi.fn(); const onMiss = vi.fn();
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500, sideScroll: true, onHit, onMiss,
            trebleMelody: { notes: ['C4'], offsets: [0], durations: [12] },
        };
        let rerender;
        act(() => { rerender = render(<svg><SheetRpgLayer {...base} combatNote={null} /></svg>).rerender; });
        // at the wave start the slime is at the far right (viewRight=500), far from the hit-zone
        // (startX..startX+70) → the correct note is TOO EARLY → a miss, not a kill.
        act(() => rerender(<svg><SheetRpgLayer {...base} combatNote={{ note: 'C4', nonce: 1 }} /></svg>));
        expect(onMiss).toHaveBeenCalledTimes(1);
        expect(onHit).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    // #871 (Han 2026-08-11, "abc music en level namen"): a decorative NPC (levels.json's `npc` bestiary-
    // name field), rendered via the generalized Critter component — purely visual, no combat coupling.
    it('#871: npc="Monk" renders an extra sprite image; npc=null renders none (beyond the hero/slime images already present)', () => {
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500, sideScroll: true,
            trebleMelody: { notes: ['C4'], offsets: [0], durations: [12] },
        };
        const without = render(<svg><SheetRpgLayer {...base} npc={null} /></svg>);
        const withoutHrefs = [...without.container.querySelectorAll('image')].map((im) => im.getAttribute('href') || '');

        const withNpc = render(<svg><SheetRpgLayer {...base} npc="Monk" /></svg>);
        const withHrefs = [...withNpc.container.querySelectorAll('image')].map((im) => im.getAttribute('href') || '');

        expect(withHrefs.length).toBe(withoutHrefs.length + 1);
        // #869 (Han 2026-08-17, asset rename): this used to check for the literal brand-name substring
        // "gandalfhardcore" that happened to appear in nearly every asset path at the time — a weak "is this a
        // real, non-empty asset URL" sanity check, not something semantically tied to the Monk NPC or that
        // brand specifically. Now checks for the actual static-asset URL prefix every renamed file still
        // serves under (public/ASSORTED/, see RpgLevelBottomPanel.jsx's wispUrl for the same convention) —
        // robust to any future asset rename, unlike a specific pack's brand name.
        expect(withHrefs.some((h) => h.toLowerCase().includes('/assorted/'))).toBe(true);
    });

    it('#991: DAMAGED_FILES has 3 entries; a never-played (expired) treble slime plays a damaged sfx on its "missed" judgment', () => {
        expect(DAMAGED_FILES).toHaveLength(3);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onMiss = vi.fn();
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500, sideScroll: true, onMiss,
            // scrollStartTime=0 (not null) unfreezes the visual clock immediately — see the "don't advance
            // the clock AT ALL until scrollStartTime is real" comment near SheetRpgLayer's rAF loop (~line
            // 1045); leaving it null (the default) would leave tickRef frozen at 0 forever and the expiry
            // effect would never fire.
            scrollStartTime: 0,
            trebleMelody: { notes: ['C4'], offsets: [0], durations: [12] }, context: {},
        };
        act(() => { render(<svg><SheetRpgLayer {...base} combatNote={null} /></svg>); });
        // never play the note — advance well past (beatsOnScreen + MUCH_TOO_BEATS) * beatMs so the slime's
        // window closes with zero attempts (the frameTick expiry effect, SheetRpgLayer.jsx ~line 1494-1517).
        act(() => vi.advanceTimersByTime(8000));
        expect(onMiss).toHaveBeenCalledWith('missed', 'treble');
        expect(playOneShotSfx).toHaveBeenCalledWith(base.context, DAMAGED_FILES, expect.any(Number));
        vi.useRealTimers();
    });

    it('#990: hittableNotesRef.current() returns the lowest-index not-yet-struck slime in non-side-scroll mode', () => {
        const hittableNotesRef = { current: null };
        wrap({
            trebleMelody: { notes: ['C4', 'D4'], offsets: [0, 12], durations: [12, 12] },
            hittableNotesRef,
        });
        expect(typeof hittableNotesRef.current).toBe('function');
        expect(hittableNotesRef.current()).toEqual(['C4']);
    });

    it('#990: hittableNotesRef.current() reflects side-scroll\'s graded timing window (empty before arrival, populated once inside it)', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const hittableNotesRef = { current: null };
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500, sideScroll: true,
            scrollStartTime: 0, // unfreezes the visual clock immediately, see #991's test above
            trebleMelody: { notes: ['C4'], offsets: [0], durations: [12] },
            hittableNotesRef,
        };
        act(() => { render(<svg><SheetRpgLayer {...base} /></svg>); });
        // Right at wave start the slime is far from the hit-zone — not yet in the graded window.
        expect(hittableNotesRef.current()).toEqual([]);
        // Advance to roughly when the slime is due at the strike line (mirrors the #660 test's own
        // timing above — well within MUCH_TOO_BEATS of arrival for an 80bpm, beatsOnScreen=8 wave).
        act(() => { vi.advanceTimersByTime(6000); });
        expect(hittableNotesRef.current()).toEqual(['C4']);
        vi.useRealTimers();
    });

    it('#871: an unknown npc name renders nothing extra (findCreatureByName returns null, guarded)', () => {
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500, sideScroll: true,
            trebleMelody: { notes: ['C4'], offsets: [0], durations: [12] },
        };
        const without = render(<svg><SheetRpgLayer {...base} npc={null} /></svg>);
        const withUnknown = render(<svg><SheetRpgLayer {...base} npc="Nonexistent Creature Xyz" /></svg>);
        expect(withUnknown.container.querySelectorAll('image').length).toBe(without.container.querySelectorAll('image').length);
    });

    it('#1052: gated scroll freezes on arrival (never expires while waiting), grades a correct hit "perfect" regardless of delay, and resumes to reveal the next note only after that hit', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onHit = vi.fn(); const onMiss = vi.fn();
        const hittableNotesRef = { current: null };
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0, 12], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500,
            sideScroll: true, gatedScroll: true, onHit, onMiss, hittableNotesRef,
            scrollStartTime: 0,
            trebleMelody: { notes: ['C4', 'D4'], offsets: [0, 12], durations: [12, 12] },
        };
        let rerender;
        act(() => { const r = render(<svg><SheetRpgLayer {...base} combatNote={null} /></svg>); rerender = r.rerender; });
        const play = (note, nonce) => act(() => rerender(<svg><SheetRpgLayer {...base} combatNote={{ note, nonce }} /></svg>));

        // Advance to roughly when C4 is due (same timing #990's side-scroll test uses for an identical
        // 80bpm/beatsOnScreen=8 wave), then FAR beyond — well past the non-gated MUCH_TOO_BEATS expiry
        // window a normal side-scroll level would have declared this note "missed" at.
        act(() => vi.advanceTimersByTime(6000));
        expect(hittableNotesRef.current()).toEqual(['C4']);
        act(() => vi.advanceTimersByTime(20000));   // gated: still waiting, never expires
        expect(onMiss).not.toHaveBeenCalled();
        expect(hittableNotesRef.current()).toEqual(['C4']);   // still the SAME note — clock never advanced

        // A correct hit, arbitrarily late, still grades "perfect" (no time pressure while gated).
        play('C4', 1);
        expect(onHit).toHaveBeenCalledTimes(1);
        expect(onHit.mock.calls[0][0].category).toBe('perfect');

        // Only NOW does the clock resume — the second note becomes due only after real time elapses again.
        expect(hittableNotesRef.current()).toEqual([]);
        act(() => vi.advanceTimersByTime(6000));
        expect(hittableNotesRef.current()).toEqual(['D4']);
        vi.useRealTimers();
    });

    it('FR (Han 2026-08-21): a near-perfect gated hit (<1/16 note late) catches up — the next note becomes due sooner than the full lateness would predict, instead of permanently carrying that lateness forward', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onHit = vi.fn(); const onMiss = vi.fn();
        const hittableNotesRef = { current: null };
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0, 12], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500,
            sideScroll: true, gatedScroll: true, onHit, onMiss, hittableNotesRef,
            scrollStartTime: 0,
            trebleMelody: { notes: ['C4', 'D4'], offsets: [0, 12], durations: [12, 12] },
        };
        let rerender;
        act(() => { const r = render(<svg><SheetRpgLayer {...base} combatNote={null} /></svg>); rerender = r.rerender; });
        const play = (note, nonce) => act(() => rerender(<svg><SheetRpgLayer {...base} combatNote={{ note, nonce }} /></svg>));

        // beatMs at bpm=80 is 750ms (60000/80); C4 (beat 0) is due at (0+8)*750 = 6000ms, matching the
        // #1052 test above. D4 (beat 1, offset 12 = one quarter note) is due at (1+8)*750 = 6750ms — 750ms
        // of ADDITIONAL real time after a hit that resumes with ZERO recovered lateness.
        act(() => vi.advanceTimersByTime(6000));
        expect(hittableNotesRef.current()).toEqual(['C4']);
        // 100ms of real lateness — comfortably under the 1/16-note threshold (750/4 = 187.5ms) that
        // qualifies for catch-up (Han: "als input <1/16 noot te laat is, kan je dan 'inhalen'?").
        act(() => vi.advanceTimersByTime(100));
        play('C4', 1);
        expect(onHit.mock.calls[0][0].category).toBe('perfect');   // gated grading is unaffected (Han: score stays honest, this is purely a timing/pacing smoothing)

        // Without catch-up, D4 would need the FULL 750ms of additional real time (the freeze always
        // resumes with zero jump, so the 100ms of lateness would otherwise be carried forward forever).
        // With the 220ms catch-up ramp clawing back the full 100ms, only ~650ms is actually needed — 700ms
        // sits clearly between the two, so seeing D4 already due here falsifies the old (no catch-up)
        // behaviour and confirms the new one.
        act(() => vi.advanceTimersByTime(700));
        expect(hittableNotesRef.current()).toEqual(['D4']);
        vi.useRealTimers();
    });

    it('bug fix (#1159, Han 2026-08-25/26, "visuele scroll-positie loopt ~1.5 kwartnoot achter"): time spent paused (e.g. the level-result screen) before a FRESH level anchor arrives must not permanently offset the new level\'s visual clock', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const hittableNotesRef = { current: null };
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500,
            sideScroll: true, hittableNotesRef,
            trebleMelody: { notes: ['C4'], offsets: [0], durations: [12] },
        };
        let rerender;
        // Level 1 finishes and its result screen shows (SheetMusic.jsx: `paused={overlayEditMode ||
        // levelPaused}`, `overlayEditMode` includes `levelResultEditMode`) — SheetRpgLayer stays mounted
        // (it always does, across level changes) with level 1's own anchor still active while paused.
        act(() => { const r = render(<svg><SheetRpgLayer {...base} scrollStartTime={0} paused={true} /></svg>); rerender = r.rerender; });
        act(() => vi.advanceTimersByTime(5000));   // player lingers on the result screen for 5s
        // Player hits Replay/next level: a genuinely NEW audio anchor arrives (~"now", same convention as
        // App.jsx picking `levelAudioStart` off the live AudioContext clock once instruments are ready)
        // and play resumes.
        act(() => rerender(<svg><SheetRpgLayer {...base} scrollStartTime={5} paused={false} /></svg>));
        // C4 (beat 0, beatsOnScreen=8, bpm=80) is due 6000ms after the NEW anchor — exactly like the
        // #1052 test above. Before the #1159 fix, the 5000ms leaked into `externalPauseAccumMsRef` while
        // paused was never reset on the new anchor, so the new level's clock still read ~1000ms in after
        // a full 6000ms had really elapsed — C4 would not be due yet.
        act(() => vi.advanceTimersByTime(6000));
        expect(hittableNotesRef.current()).toEqual(['C4']);
        vi.useRealTimers();
    });

    it('bug fix (Han 2026-08-21, "80x MISSED"/"2-/4 enemies" — gated multi-wave levels): a correctly-hit note from an EARLIER wave is never re-judged as missed once a LATER wave begins', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onHit = vi.fn(); const onMiss = vi.fn();
        const hittableNotesRef = { current: null };
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0, 12], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500,
            sideScroll: true, gatedScroll: true, onHit, onMiss, hittableNotesRef,
            scrollStartTime: 0, levelWaveIndex: 0, levelTotalWaves: 2,
            trebleMelody: { notes: ['C4', 'D4'], offsets: [0, 12], durations: [12, 12] },
        };
        let rerender;
        act(() => { const r = render(<svg><SheetRpgLayer {...base} combatNote={null} /></svg>); rerender = r.rerender; });
        const play = (note, nonce) => act(() => rerender(<svg><SheetRpgLayer {...base} combatNote={{ note, nonce }} /></svg>));

        act(() => vi.advanceTimersByTime(6000));
        play('C4', 1);   // correctly defeats C4 while wave 0 is still current
        expect(onHit).toHaveBeenCalledTimes(1);

        // A later, genuine wave begins (levelWaveIndex 0 -> 1, still below levelTotalWaves=2 — NOT the
        // terminal content-less increment the existing #867 guard already covers). Before this fix, the
        // combat-state reset ran unconditionally here and wiped `resolvedRef`, making the ALREADY-DEFEATED
        // C4 look unresolved again — the very next frame's expiry check then marked it MISSED, even though
        // the player had already correctly hit it moments earlier.
        act(() => rerender(<svg><SheetRpgLayer {...base} levelWaveIndex={1} combatNote={null} /></svg>));
        act(() => vi.advanceTimersByTime(20000));   // well past C4's own due time, however it's re-measured
        expect(onMiss).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('regression (Han 2026-08-21, "na passeren van end of song measure line stopt het level nooit"): onSlimesCleared fires again for a SECOND gated wave, not just the first', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        const onHit = vi.fn(); const onSlimesCleared = vi.fn();
        const hittableNotesRef = { current: null };
        const wave1Melody = { notes: ['C4', 'D4'], offsets: [0, 12], durations: [12, 12] };
        // JIT streaming appends more content (offsets 24/36 = beats 2/3) once the app's own wave counter
        // has advanced — mirrors what `useLevelTrebleStream`'s continuous growth actually does; SheetRpgLayer
        // itself never "knows" about wave 2 as a separate concept, it just sees more content arrive.
        const wave2Melody = { notes: ['C4', 'D4', 'E4', 'F4'], offsets: [0, 12, 24, 36], durations: [12, 12, 12, 12] };
        const base = {
            startX: 20, pixelsPerTick: null, allOffsets: [0, 12, 24, 36], noteWidth: 20, bpm: 80,
            trebleStart: 100, staffHeight: 40, viewBottom: 220, viewRight: 500,
            sideScroll: true, gatedScroll: true, onHit, onSlimesCleared, hittableNotesRef,
            scrollStartTime: 0, levelWaveIndex: 0, levelTotalWaves: 5,   // Level 3's own real wave count
        };
        let rerender;
        act(() => { const r = render(<svg><SheetRpgLayer {...base} trebleMelody={wave1Melody} combatNote={null} /></svg>); rerender = r.rerender; });
        const play = (note, nonce, extraProps = {}) => act(() => rerender(
            <svg><SheetRpgLayer {...base} {...extraProps} combatNote={{ note, nonce }} /></svg>,
        ));

        // beatMs=750ms, beatsOnScreen=8: C4 (beat 0) due at 6000ms, D4 (beat 1) due at 6750ms.
        act(() => vi.advanceTimersByTime(6000));
        play('C4', 1, { trebleMelody: wave1Melody });
        act(() => vi.advanceTimersByTime(750));
        play('D4', 2, { trebleMelody: wave1Melody });
        expect(onHit).toHaveBeenCalledTimes(2);
        expect(onSlimesCleared).toHaveBeenCalledTimes(1);   // wave 1's own content fully cleared

        // The app's wave counter has now advanced (levelWaveIndex 0→1, still well below levelTotalWaves=5 —
        // NOT the terminal content-less increment) and more JIT content has streamed in. Before this fix,
        // this transition permanently locked `clearedRef` — `onSlimesCleared` could never fire again for
        // ANY later wave, so `level.wave` got stuck, the level's `pendingSongEndRef`/`onSongEnd`/`done`
        // chain never advanced, and the level could never complete however far the visual scroll travelled.
        act(() => rerender(<svg><SheetRpgLayer {...base} levelWaveIndex={1} trebleMelody={wave2Melody} combatNote={null} /></svg>));

        // E4 (beat 2) due at 7500ms, F4 (beat 3) due at 8250ms — both measured from the SAME absolute
        // wave-start anchor as C4/D4 (`waveStartRef` correctly stays untouched across this transition).
        act(() => vi.advanceTimersByTime(750));   // now at 7500ms
        play('E4', 3, { trebleMelody: wave2Melody, levelWaveIndex: 1 });
        act(() => vi.advanceTimersByTime(750));   // now at 8250ms
        play('F4', 4, { trebleMelody: wave2Melody, levelWaveIndex: 1 });

        expect(onHit).toHaveBeenCalledTimes(4);
        expect(onSlimesCleared).toHaveBeenCalledTimes(2);   // fires AGAIN for the second wave's content
        vi.useRealTimers();
    });

    // Bug fix (Han 2026-08-25 UAT, Level 11/letter e — call-response is ear-training, so BOTH the call
    // and response measures must show only a rhythm-guide rest outside debugMode, never a real pitch;
    // Han confirmed this design intent during triage): the call/response boundary used to be a raw
    // (measureIndex+1)%2 parity check, correct only for a 1-measure call/response group. For a 2-measure
    // group (letter e), the FIRST response measure is still "odd" by that stale parity, so its real note
    // leaked into the always-visible layer on every single cycle — "het gebeurt altijd, in de oneven
    // maten". `callResponseGroupMeasures` makes the split derive the boundary from the level's ACTUAL
    // group size instead (same `computeCallResponseLabel` cycle math as the #1155/#308 labeling fix).
    it('bug fix (Han 2026-08-25): call/response split respects callResponseGroupMeasures, not raw measure parity', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        MelodyNotesLayer.mockClear();
        const mls = 48;
        // 2-measure call/response group: measures 0,1 = call (ALREADY collapsed to 'r' at generation time,
        // per collapseToCallRests — real data never has live pitches here); measures 2,3 = response (real
        // notes, since #1155 sliceSongCallResponseBlock/generateLevel9CallResponseBlock always writes the
        // response as the call's raw, uncollapsed pitches).
        const notation = {
            melody: {
                notes: ['r', 'r', 'E4', 'F4'],
                offsets: [0, mls, 2 * mls, 3 * mls],
                durations: [mls, mls, mls, mls],
                ties: [null, null, null, null],
            },
            numAccidentals: 0, noteGroupSize: 12, measureLengthSlots: mls, timeSignature: [4, 4],
            clef: 'treble', colorScheme: 'none', colorScope: 'all', tonic: 'C4', scaleNotes: [], processedChords: [],
            theme: 'default', startMeasureIndex: 0, transpositionSemitones: 0, courtesyAccidentals: true,
        };
        render(
            <svg><SheetRpgLayer startX={20} pixelsPerTick={null} allOffsets={[0, mls, 2 * mls, 3 * mls]} noteWidth={20}
                trebleStart={100} staffHeight={40} viewBottom={220} bpm={80} sideScroll viewRight={500}
                enemyType="Wizard" callResponseGroupMeasures={2} debugMode={false}
                trebleMelody={notation.melody} scrollNotation={notation} /></svg>,
        );
        const trebleCalls = MelodyNotesLayer.mock.calls.map(([props]) => props).filter((p) => p.staff === 'treble');
        expect(trebleCalls).toHaveLength(2);   // the Rest layer + the debug-only Real layer
        // Identified by RENDER ORDER (SheetRpgLayer's JSX places the Rest layer's <g> before the Real
        // layer's), NOT by content — the whole point under test is which layer measure 2's content ends
        // up in, so a content-based discriminator would silently mislabel the two under the very bug
        // being tested (confirmed by hand: doing so passed a mislabeled assertion against the pre-fix code).
        const [restLayerProps, realLayerProps] = trebleCalls;
        // THE BUG: measure index 2 (the FIRST response measure) is "odd" by raw 1-based parity — the old
        // code treated it as still-the-call and passed its real pitch straight through here, always
        // visible. Fixed: it must be suppressed ('c'), exactly like measure 3 (the second response measure,
        // already correctly classified even before this fix — included as a same-file sanity check).
        expect(restLayerProps.melody.notes[2]).toBe('c');
        expect(restLayerProps.melody.notes[3]).toBe('c');
        // The call measures (already whole-rests in the real data) stay visible rhythm-guides regardless.
        expect(restLayerProps.melody.notes[0]).toBe('r');
        expect(restLayerProps.melody.notes[1]).toBe('r');
        // The debug-only layer still correctly reveals BOTH response measures' real pitches.
        expect(realLayerProps.melody.notes[2]).toBe('E4');
        expect(realLayerProps.melody.notes[3]).toBe('F4');
        vi.useRealTimers();
    });

    // "Yellow wizard" (Han 2026-09-03/04): its OWN mechanic. The level renders the NORMAL single
    // notehead layer (NOT the black wizard's Rest+Real call-response split), a static YELLOW wizard
    // sprite, and hides each notehead behind the `rpgYellowCastGate` mask — which MUST live on a
    // NON-translated wrapper (a mask inside the per-frame translate would scroll the "stationary gate"
    // away with the notes and hide everything, the v2 bug Han reported).
    it('yellow wizard: ONE normal notehead layer + a non-translated rpgYellowCastGate mask wrapper + the yellow sprite', () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
        MelodyNotesLayer.mockClear();
        const mls = 48;
        const notation = {
            melody: { notes: ['C4', 'E4', 'G4', 'C5'], offsets: [0, mls, 2 * mls, 3 * mls], durations: [mls, mls, mls, mls], ties: [null, null, null, null] },
            numAccidentals: 0, noteGroupSize: 12, measureLengthSlots: mls, timeSignature: [4, 4],
            clef: 'treble', colorScheme: 'none', colorScope: 'all', tonic: 'C4', scaleNotes: [], processedChords: [],
            theme: 'default', startMeasureIndex: 0, transpositionSemitones: 0, courtesyAccidentals: true,
        };
        const { container } = render(
            <svg><SheetRpgLayer startX={20} pixelsPerTick={null} allOffsets={[0, mls, 2 * mls, 3 * mls]} noteWidth={20}
                trebleStart={100} staffHeight={40} viewBottom={220} bpm={80} sideScroll viewRight={500}
                enemyType="YellowWizard" wizardSpawnLeadMeasures={1} debugMode={false}
                trebleMelody={notation.melody} scrollNotation={notation} /></svg>,
        );

        // Exactly ONE treble MelodyNotesLayer — the normal layer, NOT the Rest+Real pair.
        const trebleCalls = MelodyNotesLayer.mock.calls.map(([p]) => p).filter((p) => p.staff === 'treble');
        expect(trebleCalls).toHaveLength(1);
        // Real generated pitches pass straight through (no call/response collapse to 'r'/'c').
        expect(trebleCalls[0].melody.notes).toEqual(['C4', 'E4', 'G4', 'C5']);

        // The mask def exists, and the element that references it is NOT inside a translate — its OWN
        // transform is null, and the scrolling group sits INSIDE it.
        expect(container.querySelector('mask#rpgYellowCastGate')).toBeTruthy();
        const masked = container.querySelector('g[mask="url(#rpgYellowCastGate)"]');
        expect(masked).toBeTruthy();
        expect(masked.getAttribute('transform')).toBeNull();
        const innerScroll = masked.querySelector('g[transform]');
        expect(innerScroll).toBeTruthy();
        expect(innerScroll.getAttribute('transform')).toContain('translate');
        // No translate transform anywhere on the path from `masked` up to the SVG root.
        for (let el = masked.parentElement; el && el.tagName.toLowerCase() !== 'svg'; el = el.parentElement) {
            expect((el.getAttribute('transform') || '')).not.toContain('translate');
        }

        // The static wizard sprite is the YELLOW variant sheet, not the black one.
        const wizHref = [...container.querySelectorAll('image')].map((im) => im.getAttribute('href') || '')
            .find((h) => /Yellow Wizard sheet|wizard-black/.test(h));
        expect(wizHref).toMatch(/Yellow Wizard sheet/);
        vi.useRealTimers();
    });
});
