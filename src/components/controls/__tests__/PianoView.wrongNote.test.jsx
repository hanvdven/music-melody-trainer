import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PianoView from '../PianoView';
import Scale from '../../../model/Scale';

// #990 regression (Han: "ik hoor het verschil tussen met en zonder 'fout' effect niet... ik denk
// altijd de correcte noot te horen"): the QWERTY key-listener effect's dependency array did not
// include `expectedNotes`/`wrongNoteInstrument`, so once registered it kept calling a STALE
// handlePointerDown closure — frozen at whatever those props were on the render that last changed
// qwertyKeyboardActive/qwertyNoteMap/trebleInstrument/onNoteInput. A later prop update (e.g. the
// practice melody's target note advancing) never re-registered the listener, so QWERTY input
// silently kept using the OLD (often null) expectedNotes forever and never routed through
// wrongNoteInstrument.
const makeFakeInstrument = () => ({
    context: { state: 'running', resume: vi.fn().mockResolvedValue() },
    start: vi.fn(),
    stop: vi.fn(),
});

describe('PianoView wrong-note instrument routing (#990 regression)', () => {
    it('routes a note NOT in expectedNotes through wrongNoteInstrument, not trebleInstrument', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const scale = Scale.defaultScale();
        render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotes={['C4']}
            />
        );

        // 'q' is the fixed QWERTY mapping's first key (C4 at zero transpose) per qwertyScheme.js —
        // play a DIFFERENT key so the pressed note is NOT the expected 'C4'.
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });

        expect(wrongNoteInstrument.start).toHaveBeenCalledTimes(1);
        expect(trebleInstrument.start).not.toHaveBeenCalled();
    });

    it('routes a note that IS in expectedNotes through trebleInstrument, not wrongNoteInstrument', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const scale = Scale.defaultScale();
        render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotes={['C4']}
            />
        );

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); });

        expect(trebleInstrument.start).toHaveBeenCalledTimes(1);
        expect(wrongNoteInstrument.start).not.toHaveBeenCalled();
    });

    it('QWERTY picks up a LATER expectedNotes update, not a stale one from first render (the actual #990 bug)', () => {
        const trebleInstrument = makeFakeInstrument();
        const wrongNoteInstrument = makeFakeInstrument();
        const scale = Scale.defaultScale();
        const { rerender } = render(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotes={null}
            />
        );

        // Target note advances (e.g. the practice melody moves to its next note) — a prop-only
        // update, exactly the kind the buggy dependency array missed.
        rerender(
            <PianoView
                scale={scale}
                qwertyKeyboardActive
                trebleInstrument={trebleInstrument}
                wrongNoteInstrument={wrongNoteInstrument}
                expectedNotes={['C4']}
            />
        );

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); });

        expect(wrongNoteInstrument.start).toHaveBeenCalledTimes(1);
        expect(trebleInstrument.start).not.toHaveBeenCalled();
    });

    it('falls back to trebleInstrument when wrongNoteInstrument/expectedNotes are not wired (every other PianoView call site)', () => {
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
});
