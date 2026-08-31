// Smoke tests for useBestiaryAnimationAudio (#1096, Han 2026-08-20: "ik wil in de bestiary ook de
// animatie-audio horen"). Verifies it only fires for a creature/animation WORKER_SOUND_CONFIG actually
// covers, at the configured frame(s), and not on every render of an unrelated frame.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useBestiaryAnimationAudio from '../useBestiaryAnimationAudio';
import { createMelodicInstrument } from '../../audio/localInstruments';

vi.mock('../../audio/localInstruments', () => ({
    createMelodicInstrument: vi.fn(),
}));

const workAnim = { key: 'work', cells: ['a', 'b', 'c', 'd', 'e'] };
const idleAnim = { key: 'idle', cells: [1, 2, 3, 4, 5] };

function setup(props) {
    return renderHook(
        (p) => useBestiaryAnimationAudio(p.context, p.creatureName, p.anim, p.frame),
        { initialProps: props }
    );
}

describe('useBestiaryAnimationAudio', () => {
    let start, load, context;
    beforeEach(() => {
        start = vi.fn();
        load = Promise.resolve();
        createMelodicInstrument.mockReturnValue({ start, load });
        context = { currentTime: 42 };
    });

    it('does nothing for a creature with no WORKER_SOUND_CONFIG entry', async () => {
        const { rerender } = setup({ context, creatureName: 'Lumberjack', anim: workAnim, frame: 3 });
        rerender({ context, creatureName: 'Lumberjack', anim: workAnim, frame: 3 });
        await load;
        expect(createMelodicInstrument).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
    });

    it('does nothing while the idle animation is showing, even for a covered creature', async () => {
        setup({ context, creatureName: 'Blacksmith Woman', anim: idleAnim, frame: 3 });
        await load;
        expect(start).not.toHaveBeenCalled();
    });

    it('fires the configured note at the configured frame of the work animation', async () => {
        // 'Blacksmith Woman' -> { workAnimKey: 'work', hitFrameIndices: [3], note: 'G5' }
        setup({ context, creatureName: 'Blacksmith Woman', anim: workAnim, frame: 3 });
        await load;
        expect(start).toHaveBeenCalledWith({ note: 'G5', time: 42 });
    });

    it('does not fire at a frame outside hitFrameIndices', async () => {
        setup({ context, creatureName: 'Blacksmith Woman', anim: workAnim, frame: 1 });
        await load;
        expect(start).not.toHaveBeenCalled();
    });

    it('wraps frame by the animation cell count (loop repetition still fires)', async () => {
        // frame 8 % workLen(5) = 3 -> matches hitFrameIndices [3]
        setup({ context, creatureName: 'Blacksmith Woman', anim: workAnim, frame: 8 });
        await load;
        expect(start).toHaveBeenCalledWith({ note: 'G5', time: 42 });
    });

    it('does not re-fire for the identical (creature, frame) on a redundant re-render', async () => {
        const props = { context, creatureName: 'Blacksmith Woman', anim: workAnim, frame: 3 };
        const { rerender } = setup(props);
        await load;
        expect(start).toHaveBeenCalledTimes(1);
        rerender({ ...props });
        await load;
        expect(start).toHaveBeenCalledTimes(1);
    });
});
