import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CreatureSprite } from '../BestiaryPanels';

// #790 (Han 2026-08-09, crash reported at level start: "Cannot read properties of undefined (reading
// 'col')" in CreatureSprite/layerStyle): `frame` can be NEGATIVE during a level's pre-roll (e.g.
// SheetRpgLayer's `gFrame`/`heroFrame`) — plain `%` in JS preserves the dividend's sign, producing a
// negative array index into `anim.cells`. Regression test for the fix (non-negative modulo).
describe('CreatureSprite — negative frame (#790)', () => {
    const variant = {
        frame: { w: 32, h: 32 },
        crop: { x: 0, y: 0, w: 32, h: 32 },
        url: 'fake-sprite.png',
    };
    const anim = { key: 'idle', cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] };

    it('does not throw for a negative frame (pre-roll)', () => {
        expect(() => render(
            <CreatureSprite variant={variant} anim={anim} frame={-7} scale={1} framed={false} />
        )).not.toThrow();
    });

    it('renders the same cell for frame -1 and frame (cells.length - 1)', () => {
        const { container: negContainer } = render(
            <CreatureSprite variant={variant} anim={anim} frame={-1} scale={1} framed={false} />
        );
        const { container: posContainer } = render(
            <CreatureSprite variant={variant} anim={anim} frame={anim.cells.length - 1} scale={1} framed={false} />
        );
        const bgOf = (c) => c.querySelector('[style*="background-image"]').style.backgroundPosition;
        expect(bgOf(negContainer)).toBe(bgOf(posContainer));
    });
});
