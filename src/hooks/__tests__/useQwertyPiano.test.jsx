import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import useQwertyPiano from '../useQwertyPiano';

function Harness({ active = true, onNoteOn, onNoteOff }) {
    useQwertyPiano({ active, keysToNotes: { q: 'C4', w: 'D4' }, onNoteOn, onNoteOff });
    return null;
}

const key = (type, k) => new KeyboardEvent(type, { key: k, bubbles: true });

describe('useQwertyPiano', () => {
    it('maps keydown/keyup to note on/off and dedupes auto-repeat', () => {
        const on = vi.fn(); const off = vi.fn();
        render(<Harness onNoteOn={on} onNoteOff={off} />);

        window.dispatchEvent(key('keydown', 'q'));
        window.dispatchEvent(key('keydown', 'q'));   // repeat while held → ignored
        expect(on).toHaveBeenCalledTimes(1);
        expect(on).toHaveBeenCalledWith('C4');

        window.dispatchEvent(key('keyup', 'q'));
        expect(off).toHaveBeenCalledWith('C4');

        window.dispatchEvent(key('keydown', 'z'));   // unmapped key → nothing
        expect(on).toHaveBeenCalledTimes(1);
        cleanup();
    });

    it('does nothing while inactive', () => {
        const on = vi.fn();
        render(<Harness active={false} onNoteOn={on} onNoteOff={vi.fn()} />);
        window.dispatchEvent(key('keydown', 'q'));
        expect(on).not.toHaveBeenCalled();
        cleanup();
    });

    it('releases held notes on window blur', () => {
        const off = vi.fn();
        render(<Harness onNoteOn={vi.fn()} onNoteOff={off} />);
        window.dispatchEvent(key('keydown', 'w'));
        window.dispatchEvent(new Event('blur'));
        expect(off).toHaveBeenCalledWith('D4');
        cleanup();
    });
});
