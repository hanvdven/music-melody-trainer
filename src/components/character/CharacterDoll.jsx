import React, { useMemo } from 'react';
import { CATEGORIES, BODY_FRAME, PET_FRAME, frameOf, urlOfLayer } from '../../model/characterAssets';
import { CreatureSprite } from './BestiaryPanels';
import { findVariantByUrl, findMoveAnim, findIdleAnim } from '../../model/bestiaryAssets';

// #647 Shared paper-doll renderer — the SINGLE source of the layered character (§6d). Used by the character
// creator (big avatar) AND by the hero on the sheet music (via foreignObject), so the two can never drift.
// It stacks each equipped layer (one sprite frame, z-ordered back→front), cropped to the body region and
// scaled to `height`, facing RIGHT (scaleX(-1)) exactly like the creator. Rendered at NATIVE sprite size +
// `transform: scale` so a sheet's width never stretches a layer (fixes the ear drift — see §81).

// CROP: the body region within the 80×64 frame (measured x3..57 / y17..63). CHAR_DY / PET_DY: Han's
// pixel-perfect nudges to sit on the bottom edge. PET_OFFSET: where the pet sits within the frame.
export const CROP = { x: 10, y: 6, w: 60, h: 58 };
export const PET_CROP = { x: 3, y: 2, w: 26, h: 28 };
// #664 (Han 2026-08-03, "de preview in het character menu mist wat pixels onderaan"): CROP was cutting off
// the bottom of some ASSORTED sprites in the big character-menu preview. `fullFrame` (below) shows the
// ENTIRE undistorted BODY_FRAME instead — nothing is ever clipped.
// #790 round 4 (Han: "het rode kader mag weg"): the one-time measurement reference rectangle this comment
// used to describe is removed — it had served its purpose (measuring CROP itself) and was left rendering
// unconditionally in the persona preview ever since.
// #693 round 12 (Han: "mijn character anchor is 1px lower than the others, e.g. pet, tent, grass, sprite,
// tree — both in the bestiary and in the level"): CHAR_DY/PET_DY's shared +1 nudge (round 10) was tuned
// back when there was no single global ground-anchor convention — now that `worldAnchor.js`'s
// `GROUND_ANCHOR_PX` anchors every sprite consistently, this leftover nudge just pushes the hero (and its
// glued-on pet layer) 1px BELOW everything else instead of matching it. Zeroed out — the doll now sits
// flush with its own frame, same as every other sprite.
const CHAR_DY = 0;
const PET_OFFSET = { x: 40, y: 31 };
const EFFECT_COLS = 5;              // frames in the effect row-0 loop

// backgroundPosition for one frame: col + row from the animation. Effects keep their own single-row loop.
// #664 (Han 2026-08-03, "in het voorbeeld mis ik één pixel aan de onderkant"): CHAR_DY nudges every layer
// 1px DOWN — tuned for the CROPPED view, which had slack below CROP's own bottom edge to absorb it. In
// fullFrame mode there's no such slack (the frame IS the full 64px), so that same nudge pushed the sprite
// 1px past the frame's bottom edge, clipped by `.cc-avatar`'s overflow:hidden. `fullFrame` skips the nudge.
// #790 (Han 2026-08-09): the 'pet' category no longer goes through this generic style-object path — see
// `PetLayer` below, which routes through the SAME canonical `CreatureSprite` (§6d) the Bestiary tab and
// RPG level already use, so the persona-preview pet can never again drift from the bestiary's own
// animation/anchor/oscillation definition.
export const layerStyle = (url, cat, frame, anim, name, fullFrame = false) => {
    const f = frameOf(cat);
    let col = frame % anim.frames, row = anim.row;
    if (cat === 'effect') { col = frame % EFFECT_COLS; row = 0; }
    return {
        position: 'absolute',
        left: 0,
        top: fullFrame ? 0 : CHAR_DY,
        width: f.w,
        height: f.h,
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-col * f.w}px ${-row * f.h}px`,
        backgroundSize: 'auto',           // NATIVE sheet size → step works for any sheet width
        imageRendering: 'pixelated',
        transformOrigin: 'center',
    };
};

// #790 (Han 2026-08-09, "the pet in the persona preview... does not match the bestiary animation"): the
// equipped pet used to hand-roll its own frame math (fixed 5/6-frame idle/run row guess, uniform 32×32
// crop) independently of the Bestiary tab's classification — replaced with the SAME `findVariantByUrl` +
// `findMoveAnim`/`findIdleAnim` + `CreatureSprite` lookup RpgLevelPanel's WorldCreature uses (§6c/§6d), so
// re-classifying a pet in the Bestiary editor updates the persona preview automatically, with no separate
// code path to fall out of sync. Falls back to nothing (no pet layer) if the equipped sheet has no bestiary
// match — mirrors WorldPet's own fallback rationale, kept minimal here since a missing-match pet sheet is
// the rare case, not the common one.
// #790 round 4 (Han: "dog animatie klopt niet, en de uitlijning ook niet"): the wrapper box was a FIXED
// `PET_FRAME` (32×32) regardless of the equipped pet's actual measured crop — `CreatureSprite`'s internal
// centering (`left: calc(50% - cropW/2)`) is relative to WHATEVER box it's given, so a pet whose crop isn't
// ~32×32 (Doggy's is 30×22) centered against the WRONG reference size. `RpgLevelPanel`'s `WorldCreature`
// never had this bug — it already sizes its own wrapper off `variant.crop` — so this now does the same:
// bottom-center-anchored at the SAME fixed screen point `PET_OFFSET` + the old `PET_FRAME` box used to
// occupy, but sized to the pet's own real crop instead of a generic guess.
const PET_ANCHOR_X = PET_OFFSET.x + PET_FRAME.w / 2;   // horizontal center of the old fixed box
const PET_ANCHOR_BOTTOM = PET_OFFSET.y + PET_FRAME.h;  // bottom edge of the old fixed box
export function PetLayer({ url, moving, frame }) {
    const variant = useMemo(() => findVariantByUrl(url), [url]);
    if (!variant) return null;
    const anim = (moving && findMoveAnim(variant)) || findIdleAnim(variant);
    const cropW = variant.crop.w, cropH = variant.crop.h;
    return (
        <div style={{
            position: 'absolute', left: PET_ANCHOR_X - cropW / 2, top: PET_ANCHOR_BOTTOM - cropH,
            width: cropW, height: cropH, transform: 'scaleX(-1)', transformOrigin: 'center',
        }}>
            <CreatureSprite variant={variant} anim={anim} frame={frame} scale={1} framed={false} />
        </div>
    );
}

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
                        if (!url) return null;
                        if (c.key === 'pet') {
                            return <PetLayer key={c.key} url={url} moving={anim?.key === 'walk' || anim?.key === 'run'} frame={frame} />;
                        }
                        return <div key={c.key} style={layerStyle(url, c.key, frame, anim, layer?.name, fullFrame)} />;
                    })}
                </div>
            </div>
        </div>
    );
}
