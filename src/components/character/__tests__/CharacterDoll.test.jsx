import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CharacterDoll, { CROP, layerStyle, PetLayer } from '../CharacterDoll';
import { BODY_FRAME } from '../../../model/characterAssets';

const char = { gender: 'male', layers: {} };

// #664 (Han 2026-08-03, "de preview in het character menu mist wat pixels onderaan"): `fullFrame` shows
// the whole undistorted 80×64 BODY_FRAME (nothing clipped) + a red 40×56 reference box, instead of the
// CROP subregion every other caller (sheet-music hero, equipment thumbnails) still uses.
describe('CharacterDoll — fullFrame (#664)', () => {
    it('default (fullFrame=false, unchanged): sizes off CROP and renders no reference box', () => {
        const height = 336;
        const { container } = render(<CharacterDoll char={char} anim={{ row: 0, frames: 5, key: 'idle' }} frame={0} height={height} />);
        const outer = container.firstChild;
        expect(outer.style.height).toBe(`${height}px`);
        expect(outer.style.width).toBe(`${CROP.w * (height / CROP.h)}px`);
        expect(container.querySelector('[style*="border: 1px solid red"]')).toBeNull();
    });

    it('fullFrame=true: sizes off the whole BODY_FRAME and renders the red reference box', () => {
        const height = 336;
        const { container } = render(<CharacterDoll char={char} anim={{ row: 0, frames: 5, key: 'idle' }} frame={0} height={height} fullFrame />);
        const outer = container.firstChild;
        expect(outer.style.width).toBe(`${BODY_FRAME.w * (height / BODY_FRAME.h)}px`);
        expect(container.querySelector('[style*="border: 1px solid red"]')).toBeTruthy();
    });

    // #664 (Han 2026-08-03, "het kader valt over de avatar, verplaats het naar de achtergrond"): the
    // reference box must be a PRECEDING sibling of the sprite-layer stack, so later (layer) paint wins.
    it('fullFrame=true: the reference box is a preceding sibling of the sprite-layer stack (renders behind it)', () => {
        const height = 336;
        const { container } = render(<CharacterDoll char={char} anim={{ row: 0, frames: 5, key: 'idle' }} frame={0} height={height} fullFrame />);
        const frameParent = container.querySelector('[style*="border: 1px solid red"]').parentElement;
        const children = Array.from(frameParent.children);
        const refIdx = children.findIndex((el) => el.style.border === '1px solid red');
        const layerStackIdx = children.findIndex((el) => el.style.transform === 'scaleX(-1)');
        expect(refIdx).toBeLessThan(layerStackIdx);
    });

    // #693 round 12 zeroed CHAR_DY out (see the comment above its declaration in CharacterDoll.jsx) — this
    // assertion previously expected the OLD +1 nudge and was left stale; corrected to match current reality.
    it('layerStyle: no bottom nudge in either mode (CHAR_DY was zeroed by #693 round 12)', () => {
        expect(layerStyle('u', 'chest', 0, { row: 0, frames: 5 }, null, false).top).toBe(0);
        expect(layerStyle('u', 'chest', 0, { row: 0, frames: 5 }, null, true).top).toBe(0);
    });
});

// #790 (Han 2026-08-09): the pet layer no longer goes through `layerStyle` — it routes through the
// bestiary's canonical `CreatureSprite` via `findVariantByUrl` (§6c/§6d, see CharacterDoll.jsx). Smoke test
// per §7b for the extracted behaviour.
describe('CharacterDoll — PetLayer (#790)', () => {
    it('renders nothing when the equipped pet sheet has no bestiary match', () => {
        const { container } = render(<PetLayer url="not-a-real-sprite-url.png" moving={false} frame={0} />);
        expect(container.firstChild).toBeNull();
    });
});
