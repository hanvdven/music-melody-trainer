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
export default function CharacterDoll({ char, anim, frame, height }) {
    const zOrder = useMemo(() => [...CATEGORIES].sort((a, b) => a.z - b.z), []);
    const s = height / CROP.h;
    return (
        <div style={{ position: 'relative', overflow: 'visible', width: CROP.w * s, height }}>
            <div style={{ position: 'absolute', left: -CROP.x * s, top: -CROP.y * s, width: BODY_FRAME.w, height: BODY_FRAME.h, transform: `scale(${s})`, transformOrigin: 'top left' }}>
                <div style={{ position: 'absolute', inset: 0, transform: 'scaleX(-1)' }}>
                    {zOrder.map((c) => {
                        const layer = char.layers[c.key];
                        const url = urlOfLayer(c.key, layer);
                        return url ? <div key={c.key} style={layerStyle(url, c.key, frame, anim, layer?.name)} /> : null;
                    })}
                </div>
            </div>
        </div>
    );
}
