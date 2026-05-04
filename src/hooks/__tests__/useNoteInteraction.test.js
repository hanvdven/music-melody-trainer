import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useNoteInteraction from '../useNoteInteraction';

vi.mock('../../audio/playSound', () => ({
    default: vi.fn(),
}));

import playSound from '../../audio/playSound';
import Melody from '../../model/Melody';

const makeContext = (state = 'running') => ({
    state,
    currentTime: 0,
    resume: vi.fn().mockResolvedValue(undefined),
});

const makeInstruments = () => ({
    treble: { id: 'treble' },
    bass: { id: 'bass' },
    percussion: { id: 'percussion' },
    metronome: { id: 'metronome' },
});

const makeDeps = (overrides = {}) => ({
    context: makeContext(),
    instruments: makeInstruments(),
    customPercussionMappingRef: { current: null },
    sequencerRef: { current: null },
    trebleMelody: null,
    bassMelody: null,
    setTrebleMelody: vi.fn(),
    setBassMelody: vi.fn(),
    ...overrides,
});

describe('useNoteInteraction.handleNoteClick', () => {
    beforeEach(() => {
        playSound.mockClear();
    });

    it('routes treble notes to the treble instrument', async () => {
        const deps = makeDeps();
        const { result } = renderHook(() => useNoteInteraction(deps));

        await act(async () => {
            await result.current.handleNoteClick(['C4', 'E4'], 'treble');
        });

        expect(playSound).toHaveBeenCalledTimes(2);
        expect(playSound.mock.calls[0][1]).toBe(deps.instruments.treble);
        expect(playSound.mock.calls[1][1]).toBe(deps.instruments.treble);
    });

    it('routes bass notes to the bass instrument', async () => {
        const deps = makeDeps();
        const { result } = renderHook(() => useNoteInteraction(deps));

        await act(async () => {
            await result.current.handleNoteClick(['G3'], 'bass');
        });

        expect(playSound).toHaveBeenCalledTimes(1);
        expect(playSound.mock.calls[0][1]).toBe(deps.instruments.bass);
    });

    it('routes metronome-class percussion notes to the metronome instrument', async () => {
        const deps = makeDeps();
        const { result } = renderHook(() => useNoteInteraction(deps));

        // METRONOME_NOTE_IDS includes 'wh' (woodblock high), 'wm', 'wl'
        await act(async () => {
            await result.current.handleNoteClick(['wh'], 'percussion');
        });

        expect(playSound).toHaveBeenCalledTimes(1);
        expect(playSound.mock.calls[0][1]).toBe(deps.instruments.metronome);
    });

    it('routes regular percussion notes to the percussion instrument', async () => {
        const deps = makeDeps();
        const { result } = renderHook(() => useNoteInteraction(deps));

        await act(async () => {
            await result.current.handleNoteClick(['k', 's'], 'percussion');
        });

        expect(playSound).toHaveBeenCalledTimes(2);
        expect(playSound.mock.calls[0][1]).toBe(deps.instruments.percussion);
        expect(playSound.mock.calls[1][1]).toBe(deps.instruments.percussion);
    });

    it('passes custom percussion mapping when staff is percussion', async () => {
        const customMapping = { k: 36 };
        const deps = makeDeps({
            customPercussionMappingRef: { current: customMapping },
        });
        const { result } = renderHook(() => useNoteInteraction(deps));

        await act(async () => {
            await result.current.handleNoteClick(['k'], 'percussion');
        });

        // 8th argument is the customMapping
        expect(playSound.mock.calls[0][6]).toBe(customMapping);
    });

    it('does not pass mapping for non-percussion staffs', async () => {
        const deps = makeDeps({
            customPercussionMappingRef: { current: { foo: 'bar' } },
        });
        const { result } = renderHook(() => useNoteInteraction(deps));

        await act(async () => {
            await result.current.handleNoteClick(['C4'], 'treble');
        });

        expect(playSound.mock.calls[0][6]).toBe(null);
    });

    it('resumes a suspended AudioContext before playing', async () => {
        const ctx = makeContext('suspended');
        const deps = makeDeps({ context: ctx });
        const { result } = renderHook(() => useNoteInteraction(deps));

        await act(async () => {
            await result.current.handleNoteClick(['C4'], 'treble');
        });

        expect(ctx.resume).toHaveBeenCalled();
    });

    it('exits silently if context is missing', async () => {
        const deps = makeDeps({ context: null });
        const { result } = renderHook(() => useNoteInteraction(deps));

        await act(async () => {
            await result.current.handleNoteClick(['C4'], 'treble');
        });

        expect(playSound).not.toHaveBeenCalled();
    });
});

describe('useNoteInteraction.handleNoteEnharmonicToggle', () => {
    it('flips C♯ ↔ D♭ in displayNotes for treble', () => {
        const treble = new Melody(
            ['C♯4', 'E4'],
            [240, 240],
            [0, 240],
            ['C♯4', 'E4'],
        );
        const setTrebleMelody = vi.fn();
        const deps = makeDeps({ trebleMelody: treble, setTrebleMelody });
        const { result } = renderHook(() => useNoteInteraction(deps));

        act(() => {
            result.current.handleNoteEnharmonicToggle('treble', 0);
        });

        expect(setTrebleMelody).toHaveBeenCalledTimes(1);
        const newMelody = setTrebleMelody.mock.calls[0][0];
        expect(newMelody.displayNotes[0]).toBe('D♭4');
        // Audio pitch (notes) is unchanged
        expect(newMelody.notes[0]).toBe('C♯4');
    });

    it('does nothing for natural notes with no enharmonic', () => {
        const treble = new Melody(
            ['C4'],
            [240],
            [0],
            ['C4'],
        );
        const setTrebleMelody = vi.fn();
        const deps = makeDeps({ trebleMelody: treble, setTrebleMelody });
        const { result } = renderHook(() => useNoteInteraction(deps));

        act(() => {
            result.current.handleNoteEnharmonicToggle('treble', 0);
        });

        // C has B♯ as enharmonic per ENHARMONIC_PAIRS, so it WILL toggle.
        // To test "no enharmonic", use a rest.
        // Reset for a real "no-op" case:
        setTrebleMelody.mockClear();
        const restMelody = new Melody(['r'], [240], [0], ['r']);
        const deps2 = makeDeps({ trebleMelody: restMelody, setTrebleMelody });
        const { result: r2 } = renderHook(() => useNoteInteraction(deps2));

        act(() => r2.current.handleNoteEnharmonicToggle('treble', 0));
        expect(setTrebleMelody).not.toHaveBeenCalled();
    });

    it('does nothing when offset does not match', () => {
        const treble = new Melody(['C♯4'], [240], [0], ['C♯4']);
        const setTrebleMelody = vi.fn();
        const deps = makeDeps({ trebleMelody: treble, setTrebleMelody });
        const { result } = renderHook(() => useNoteInteraction(deps));

        act(() => result.current.handleNoteEnharmonicToggle('treble', 999));
        expect(setTrebleMelody).not.toHaveBeenCalled();
    });

    it('routes to bass setter when staff is bass', () => {
        const bass = new Melody(['F♯3'], [240], [0], ['F♯3']);
        const setBassMelody = vi.fn();
        const deps = makeDeps({ bassMelody: bass, setBassMelody });
        const { result } = renderHook(() => useNoteInteraction(deps));

        act(() => result.current.handleNoteEnharmonicToggle('bass', 0));
        expect(setBassMelody).toHaveBeenCalled();
        expect(setBassMelody.mock.calls[0][0].displayNotes[0]).toBe('G♭3');
    });

    it('preserves smallestNoteDenom on the new Melody', () => {
        const treble = new Melody(['C♯4'], [240], [0], ['C♯4']);
        treble.smallestNoteDenom = 8;
        const setTrebleMelody = vi.fn();
        const deps = makeDeps({ trebleMelody: treble, setTrebleMelody });
        const { result } = renderHook(() => useNoteInteraction(deps));

        act(() => result.current.handleNoteEnharmonicToggle('treble', 0));
        expect(setTrebleMelody.mock.calls[0][0].smallestNoteDenom).toBe(8);
    });
});
