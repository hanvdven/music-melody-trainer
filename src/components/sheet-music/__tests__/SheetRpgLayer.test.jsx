import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SheetRpgLayer from '../SheetRpgLayer';

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
            clef: 'treble', noteColoringMode: 'none', tonic: 'C4', scaleNotes: [], processedChords: [],
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
            clef: 'treble', noteColoringMode: 'none', tonic: 'C4', scaleNotes: [], processedChords: [],
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
            clef: 'treble', noteColoringMode: 'none', tonic: 'C4', scaleNotes: [], processedChords: [],
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
});
