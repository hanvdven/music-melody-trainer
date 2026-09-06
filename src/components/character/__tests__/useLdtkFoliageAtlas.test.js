import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useLdtkFoliageAtlas from '../useLdtkFoliageAtlas';

// jsdom has no real <canvas> 2D context or image decoding (the same reason the sibling hook
// `useLdtkWaterInstances` has no tests) — mock just enough of `runtimeNormalMap.js` and
// `document.createElement('canvas')` to exercise this hook's own logic (dedup, batching, UV-rect
// computation, incremental publish) without needing real rendering.
vi.mock('../../../utils/runtimeNormalMap', () => ({
    loadImageEl: vi.fn((url) => Promise.resolve({ src: url })),
    normalMapCanvasFromCrop: vi.fn(() => ({ width: 32, height: 32 })),
}));

function makeTile(tilesetUrl, srcX, srcY) {
    return { tilesetUrl, src: [srcX, srcY], worldX: 0, worldY: 0 };
}

describe('useLdtkFoliageAtlas', () => {
    it('returns null when given no tiles', () => {
        const { result } = renderHook(
            ({ tiles }) => useLdtkFoliageAtlas(tiles, 32),
            { initialProps: { tiles: [] } },
        );
        expect(result.current).toBeNull();
    });

    it('packs unique crops into a shared atlas with one UV entry per distinct crop', async () => {
        const origCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag !== 'canvas') return origCreateElement(tag);
            return {
                width: 0, height: 0,
                getContext: () => ({ drawImage: vi.fn() }),
            };
        });

        // 3 placements, only 2 DISTINCT (tilesetUrl, src) crops — the third repeats the first.
        const tiles = [
            makeTile('trees.png', 0, 0),
            makeTile('trees.png', 32, 0),
            makeTile('trees.png', 0, 0),
        ];
        const { result } = renderHook(() => useLdtkFoliageAtlas(tiles, 32));

        await waitFor(() => expect(result.current).not.toBeNull());
        expect(result.current.uvByKey.size).toBe(2);
        expect(result.current.uvByKey.get('trees.png|0,0')).toHaveLength(4);
        expect(result.current.uvByKey.get('trees.png|32,0')).toHaveLength(4);
        expect(result.current.gridSize).toBe(32);

        document.createElement.mockRestore?.();
    });
});
