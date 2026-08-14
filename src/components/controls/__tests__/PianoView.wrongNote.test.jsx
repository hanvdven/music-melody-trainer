import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PianoView from '../PianoView';
import Scale from '../../../model/Scale';

// #990 regression (Han: "ik hoor het verschil tussen met en zonder 'fout' effect niet... ik denk
// altijd de correcte noot te horen"): a first attempt passed the expected note(s) as a plain
// array/prop. The QWERTY key-listener effect's dependency array did not include it, so once
// registered it kept calling a STALE handlePointerDown closure — frozen at whatever that array was
// on the render that last changed qwertyKeyboardActive/qwertyNoteMap/trebleInstrument/onNoteInput.
// Fixed at the root by switching to `expectedNotesRef` (a REF holding a getter FUNCTION, called
// fresh at press time) — a ref's identity never changes across renders, so it can't go stale the
// same way, and it doubles as the mechanism RPG combat needs (the hittable-note set changes
// continuously as slimes scroll through the timing window, not just on discrete note-advance
// events like input-test mode).
const makeFakeInstrument = () => ({
    context: { state: 'running', resume: vi.fn().mockResolvedValue() },
    start: vi.fn(),
    stop: vi.fn(),
});

describe('PianoView wrong-note instrument routing (#990 regression)', () => {
    it('routes a note NOT returned by expectedNotesRef.current() through wrongNoteInstrument, not trebleInstrument', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const expectedNotesRef = { current: () => ['C4'] };
        const scale = Scale.defaultScale();
        render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotesRef={expectedNotesRef}
            />
        );

        // 'q' is the fixed QWERTY mapping's first key (C4 at zero transpose) per qwertyScheme.js —
        // play a DIFFERENT key so the pressed note is NOT the expected 'C4'.
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });

        expect(wrongNoteInstrument.start).toHaveBeenCalledTimes(1);
        expect(trebleInstrument.start).not.toHaveBeenCalled();
    });

    it('routes a note that IS returned by expectedNotesRef.current() through trebleInstrument, not wrongNoteInstrument', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const expectedNotesRef = { current: () => ['C4'] };
        const scale = Scale.defaultScale();
        render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotesRef={expectedNotesRef}
            />
        );

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); });

        expect(trebleInstrument.start).toHaveBeenCalledTimes(1);
        expect(wrongNoteInstrument.start).not.toHaveBeenCalled();
    });

    it('picks up a LATER expectedNotesRef.current mutation with no rerender needed (RPG combat case: the hittable set changes continuously, not just on prop updates)', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const expectedNotesRef = { current: () => null }; // nothing hittable yet
        const scale = Scale.defaultScale();
        render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotesRef={expectedNotesRef}
            />
        );

        // Mutate the ref's function directly — exactly what SheetRpgLayer's per-frame-readable
        // getter and App.jsx's per-render-reassigned getter both do, with NO React rerender.
        expectedNotesRef.current = () => ['C4'];

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });

        expect(wrongNoteInstrument.start).toHaveBeenCalledTimes(1);
        expect(trebleInstrument.start).not.toHaveBeenCalled();
    });

    it('QWERTY still picks up a rerender-driven prop update too (the original #990 failure mode)', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const scale = Scale.defaultScale();
        const { rerender } = render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotesRef={{ current: () => null }}
            />
        );

        rerender(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotesRef={{ current: () => ['C4'] }}
            />
        );

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });

        expect(wrongNoteInstrument.start).toHaveBeenCalledTimes(1);
        expect(trebleInstrument.start).not.toHaveBeenCalled();
    });

    it('falls back to trebleInstrument when wrongNoteInstrument/expectedNotesRef are not wired (every other PianoView call site)', () => {
        const trebleInstrument = makeFakeInstrument();
        const scale = Scale.defaultScale();
        render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
            />
        );

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });

        expect(trebleInstrument.start).toHaveBeenCalledTimes(1);
    });

    it('falls back to trebleInstrument when expectedNotesRef.current() returns null/empty (nothing currently hittable)', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const scale = Scale.defaultScale();
        render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotesRef={{ current: () => [] }}
            />
        );

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });

        expect(trebleInstrument.start).toHaveBeenCalledTimes(1);
        expect(wrongNoteInstrument.start).not.toHaveBeenCalled();
    });
});
