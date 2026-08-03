import React, { useMemo } from 'react';
import { CATEGORIES, BODY_FRAME, frameOf, urlOfLayer } from '../../model/characterAssets';

// #647 Shared paper-doll renderer — the SINGLE source of the layered character (§6d). Used by the character
// creator (big avatar) AND by the hero on the sheet music (via foreignObject), so the two can never drift.
// It stacks each equipped layer (one sprite frame, z-ordered back→front), cropped to the body region and
// scaled to `height`, facing RIGHT (scaleX(-1)) exactly like the creator. Rendered at NATIVE sprite size +
// `transform: scale` so a sheet's width never stretches a layer (fixes the ear drift — see §81).

// CROP: the body region within the 80×64 frame (measured x3..57 / y17..63). CHAR_DY / PET_DY: Han's
// pixel-perfect nudges to sit on the bottom edge. PET_OFFSET: where the 32×32 pet sits within the frame.
export const CROP = { x: 10, y: 6, w: 60, h: 58 };
export const PET_CROP = { x: 3, y: 2, w: 26, h: 28 };
// #664 (Han 2026-08-03, "de preview in het character menu mist wat pixels onderaan"): CROP was cutting off
// the bottom of some ASSORTED sprites in the big character-menu preview. `fullFrame` (below) shows the
// ENTIRE undistorted BODY_FRAME instead — nothing is ever clipped — plus a reference rectangle Han can use
// to eyeball where a sprite's "body" should sit within the 80×64 frame. Bottom-anchored, horizontally
// centred: x = (80-40)/2, y = 64-56.
const REF_FRAME = { w: 40, h: 56 };
const REF_FRAME_X = (BODY_FRAME.w - REF_FRAME.w) / 2;
const REF_FRAME_Y = BODY_FRAME.h - REF_FRAME.h;
const CHAR_DY = 1, PET_DY = 2;
const PET_OFFSET = { x: 40, y: 31 };
const EFFECT_COLS = 5;              // frames in the effect row-0 loop
const PET_IDLE = 5, PET_RUN = 6;    // pet sheets are 6×2 (row 0 idle 5, row 1 run 6); wisp has no run row

// backgroundPosition for one frame: col + row from the animation. Pet plays its RUN row when the character
// walks/runs (Han); effects keep their own single-row loop. Pet gets an extra flip to face right (Han).
export const layerStyle = (url, cat, frame, anim, name) => {
    const f = frameOf(cat);
    let col = frame % anim.frames, row = anim.row;
    if (cat === 'pet') {
        const canRun = !/wisp/i.test(name || '');
        const running = canRun && (anim.key === 'walk' || anim.key === 'run');
        row = running ? 1 : 0;
        col = frame % (running ? PET_RUN : PET_IDLE);
    } else if (cat === 'effect') { col = frame % EFFECT_COLS; row = 0; }
    return {
        position: 'absolute',
        left: cat === 'pet' ? PET_OFFSET.x : 0,
        top: cat === 'pet' ? PET_OFFSET.y + PET_DY : CHAR_DY,
        width: f.w,
        height: f.h,
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-col * f.w}px ${-row * f.h}px`,
        backgroundSize: 'auto',           // NATIVE sheet size → step works for any sheet width
        imageRendering: 'pixelated',
        transform: cat === 'pet' ? 'scaleX(-1)' : undefined,
        transformOrigin: 'center',
    };
};

// The stacked paper-doll, cropped to the body region and scaled so CROP.h → `height`. Styling is fully
// inline (no CSS dependency) so it works on the sheet music where CharacterCreator.css is not loaded.
// #664 (Han 2026-08-03): `fullFrame` opts into showing the ENTIRE undistorted 80×64 BODY_FRAME instead of
// the CROP subregion — scoped to the character-menu's big avatar preview only (its only caller so far);
// the sheet-music hero and the equipment-grid thumbnails keep the CROP behaviour (default false).
export default function CharacterDoll({ char, anim, frame, height, fullFrame = false }) {
    const zOrder = useMemo(() => [...CATEGORIES].sort((a, b) => a.z - b.z), []);
    const s = height / (fullFrame ? BODY_FRAME.h : CROP.h);
    const offX = fullFrame ? 0 : -CROP.x * s;
    const offY = fullFrame ? 0 : -CROP.y * s;
    const outerW = (fullFrame ? BODY_FRAME.w : CROP.w) * s;
    return (
        <div style={{ position: 'relative', overflow: 'visible', width: outerW, height }}>
            <div style={{ position: 'absolute', left: offX, top: offY, width: BODY_FRAME.w, height: BODY_FRAME.h, transform: `scale(${s})`, transformOrigin: 'top left' }}>
                <div style={{ position: 'absolute', inset: 0, transform: 'scaleX(-1)' }}>
                    {zOrder.map((c) => {
                        const layer = char.layers[c.key];
                        const url = urlOfLayer(c.key, layer);
                        return url ? <div key={c.key} style={layerStyle(url, c.key, frame, anim, layer?.name)} /> : null;
                    })}
                </div>
                {fullFrame && (
                    <div style={{
                        position: 'absolute', left: REF_FRAME_X, top: REF_FRAME_Y, width: REF_FRAME.w, height: REF_FRAME.h,
                        border: '1px solid red', boxSizing: 'border-box', pointerEvents: 'none',
                    }} />
                )}
            </div>
        </div>
    );
}
