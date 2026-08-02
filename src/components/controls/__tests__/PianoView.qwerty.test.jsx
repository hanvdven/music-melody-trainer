import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PianoView from '../PianoView';
import Scale from '../../../model/Scale';

// Regression test for the #661 combat double-count bug (Han 2026-08-02: "loslaten van keys geeft ook
// 'miss'"; "meer misser dan noten"). handleKeyDown fires onNoteInput explicitly the instant a QWERTY key
// goes down; handleKeyUp used to ALSO fire it (via handlePointerUp's default fireInput=true), so every
// physical keypress produced TWO combat events — the second (on release) found the slime already resolved
// and was scored as a spurious miss/wrong-note. Fixed by handleKeyUp calling handlePointerUp(note, false).
describe('PianoView QWERTY input (#661 regression)', () => {
    it('fires onNoteInput exactly once per keypress, not again on keyup', () => {
        const onNoteInput = vi.fn();
        const scale = Scale.defaultScale();
        render(<PianoView scale={scale} qwertyKeyboardActive onNoteInput={onNoteInput} />);

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); });
        expect(onNoteInput).toHaveBeenCalledTimes(1);

        act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q' })); });
        expect(onNoteInput).toHaveBeenCalledTimes(1);   // keyup must NOT fire a second combat event
    });

    it('a held key does not re-fire on OS key-repeat, and release still only counts once', () => {
        const onNoteInput = vi.fn();
        const scale = Scale.defaultScale();
        render(<PianoView scale={scale} qwertyKeyboardActive onNoteInput={onNoteInput} />);

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); });
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', repeat: true })); });
        act(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'q' })); });
        expect(onNoteInput).toHaveBeenCalledTimes(1);
    });
});
