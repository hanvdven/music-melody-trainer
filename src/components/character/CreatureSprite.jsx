import React from 'react';
import { isFlyingAnim } from '../../model/bestiaryAssets';
import { oscillate, FLYING_HOVER_OSC_RANGE, FLYING_HOVER_OSC_SPEED } from '../../utils/oscillate';
import frame64Url from '../../assets/ASSORTED/icons/Pixel Art Game UI/64x64 frame.png';
// #1028 follow-up (Han 2026-08-17, HMR bug: "Could not Fast Refresh ('CROP' export is incompatible)",
// looping constantly): `CreatureSprite`/`Frame64Overlay` used to live in `BestiaryPanels.jsx`, which
// `CharacterDoll.jsx` already imported `CreatureSprite` FROM (for its own pet layer) — when avatar-as-
// bestiary-entry (§245) made `BestiaryPanels.jsx` import `CharacterDoll` back, that created an ES module
// CYCLE. It "worked" for `npm run build`/tests (hoisted function declarations, only called from inside a
// render — see the now-removed comment that justified this), but broke Vite's React Fast Refresh: mixing a
// cyclic import with `CharacterDoll.jsx`'s non-component named exports (`CROP`, `PET_CROP`, `layerStyle`)
// made Fast Refresh unable to hot-swap either file, invalidating and re-evaluating the whole chain on every
// edit anywhere in it — an infinite HMR update loop. Moving the two canonical renderers BOTH files actually
// need into this THIRD, dependency-free file breaks the cycle for real instead of relying on evaluation-
// order luck: `BestiaryPanels.jsx` and `CharacterDoll.jsx` both import FROM here, neither imports the other.

// #648 Bestiary sprite renderer + #667 TOP/BOTTOM split + #668 (Han 2026-08-03, "scan de map characters en
// maak een bestiary met alle niet-hero personages ... voor beesten met varianten zoals de slime, zet in de
// top-view een toggler ... in de bottom view, gebruik de bottom view selector [voor de 6 categorieën]"):
// renders a `variant` (one sprite of a `creature`, which may have several colour variants) — shared by both
// the curated (hand-animated) and the newly auto-scanned creatures via useBestiaryEditor's unified shape.
// #671 (Han: "maak een toggler voor hat en backpack") — `overlayUrls` stacks additional sprite layers (same
// frame/crop/cell alignment as the base — Doggy's hat/backpack sheets are drawn on the identical 32×32/6-
// col/2-row grid) on top of the base sprite, mirroring how CharacterDoll layers hero equipment (§6d).
// #682 (Han 2026-08-04, "maak de kaders achter karakters in de bestiary units 64x64, 'achter' de unit. anker
// op midden onder... grote units mogen 'over het portret' heen. doe hetzelfde bij de previews onderaan —
// anker op midden onder"): the sprite is now anchored bottom-CENTER inside a `FRAME_SIZE`-square box (top
// view: a real visible 64×64 "kader", `framed=true`) instead of being clipped to exactly its own crop size —
// a creature bigger than 64×64 simply overflows past the frame (never clipped) instead of being force-fit.
// `framed=false` (bottom-view thumbnails) skips drawing its OWN frame — the parent `.cc-enemy-thumb` button
// already IS the visual box/border — but keeps the identical bottom-center anchor + un-clipped overflow,
// filling whatever size the parent gives it (100%) rather than a fixed 64px.
export const FRAME_SIZE = 64;

// #693 (Han 2026-08-04, round 3: "voor de 64x64 frames, use icons/gandalfhardcore pixel art game ui/64x64
// frame as an overlay to all 64x64 frames, with the appropriate scale"; round 4: "centreer center-center met
// het 64x64 kader. zet het één laag achter het dier, en boven het kader"): a decorative pixel-art border,
// native 64×64 scaled the SAME as the box itself so it always lines up with the box edge. Positioned via
// explicit center-center (50%/50% + translate(-50%,-50%), not `inset:0`) so it's centred on the box
// regardless of whether the box is exactly square in every call site. `pointerEvents: 'none'` so it never
// blocks swatch/animation buttons layered around it. Rendered as the FIRST child at each call site (see
// CreatureSprite/PortraitImage below) — paints BEHIND the creature/portrait content but ABOVE the box's own
// `.cc-sprite-frame` background, i.e. "one layer behind the animal, above the frame".
// #790 (Han 2026-08-09): exported so CharacterAvatarPanel's persona preview can reuse the identical 64×64
// frame instead of a second copy of the frame image/positioning (§6d).
export function Frame64Overlay({ box }) {
    return <img src={frame64Url} alt="" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: box, height: box, imageRendering: 'pixelated', pointerEvents: 'none' }} />;
}

// #989 (Han 2026-08-14, "bestiary pass": "laat alle wezens uit de bestiary naar rechts kijken, zodat ik
// meteen kan zien of ze correct georiënteerd zijn"): `mirror` — opt-in, defaults false — flips the WHOLE
// rendered box horizontally around its own center. Deliberately a prop the CALLER passes, not baked into
// this canonical renderer itself: CreatureSprite is also used by movement-direction-aware placements
// (RpgLevelPanel's WorldCreature, which already computes its own facing flip from actual walk direction ×
// the sprite's native orientation) where forcing "always right" would fight that logic. Only the Bestiary's
// own top/bottom preview call sites pass `mirror={currentFacing !== 'right'}` — every OTHER consumer
// (persona preview, character doll, world placements) is unaffected, same prop, default off.
export function CreatureSprite({ variant, anim, frame, scale, overlayUrls = [], framed = true, mirror = false, debugMode = false, checkerScrollPx = 0 }) {
    const { frame: f, crop, url } = variant;
    // #687 (Han 2026-08-04, knight "green knight + green knight run als één set animaties"): an animation
    // may be sourced from a DIFFERENT file than the variant's own (`anim.url`, resolved in
    // bestiaryAssets.js) — falls back to the variant's own `url` for every other creature (unchanged).
    const spriteUrl = anim.url || url;
    // #669: steps through the animation's explicit `cells` list rather than a fixed row + frame%N — needed
    // for animations stitched across row boundaries (the horse), and works identically for the simple
    // single-row case (cells = that row's columns in order).
    // #790 (Han 2026-08-09, crash at level start): `frame` can be NEGATIVE during a level's pre-roll (e.g.
    // SheetRpgLayer's `gFrame`/`heroFrame`, documented at their own definition) — plain `%` in JS preserves
    // the dividend's sign, so a negative frame produced a negative array index (`undefined`), crashing on
    // `cell.col` below. Same fix pattern already used for the Wizard's own frame-index math in
    // SheetRpgLayer.jsx: force a non-negative result via `((n % m) + m) % m`. Fixed HERE (the one canonical
    // renderer, §6d) so every caller — WorldCreature, CharacterDoll's PetLayer, the Bestiary preview itself
    // — is protected, not just whichever call site happened to trip over it first.
    const cellIndex = ((frame % anim.cells.length) + anim.cells.length) % anim.cells.length;
    const cell = anim.cells[cellIndex];
    const layerStyle = (layerUrl) => ({
        position: 'absolute', inset: 0, width: f.w, height: f.h,
        backgroundImage: `url("${layerUrl}")`, backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-cell.col * f.w}px ${-cell.row * f.h}px`, backgroundSize: 'auto',
        imageRendering: 'pixelated',
    });
    // #684 (Han 2026-08-04, "in 'preview' onderin beeld: als unit > 64 hoog of breed: schaal af tot het in
    // het vak past"): the TOP view (`framed`) deliberately allows overflow (§682 — a big unit may spill past
    // its 64×64 kader — Han 2026-08-09, round 5: "ok laat de allowance voor de top view dan maar staan!",
    // confirming this stays after briefly considering a cap). The BOTTOM view has no such allowance: a
    // creature that exceeds the FRAME_SIZE reference in either dimension is scaled DOWN so its larger
    // dimension lands back at exactly `FRAME_SIZE * scale` instead of blowing past the thumbnail box.
    const maxDim = Math.max(crop.w, crop.h);
    const effectiveScale = (!framed && maxDim > FRAME_SIZE) ? scale * (FRAME_SIZE / maxDim) : scale;
    const box = FRAME_SIZE * scale;
    const cropW = crop.w * effectiveScale, cropH = crop.h * effectiveScale;
    // #693 round 12 (Han: "i do not see the floating as required, e.g. in the bestiary: none of the animals
    // with a fly/float are centered in the preview frame"): flying creatures get the SAME center-in-the-box
    // + light oscillation treatment the RPG level's WorldCreature/Critter already apply — this is the ONE
    // canonical renderer (§6d), so putting it here covers the bestiary preview AND every world placement at
    // once, rather than re-deriving it per call site. Bottom-anchored sprites are unaffected.
    const flying = isFlyingAnim(anim, variant);
    const vPos = flying
        ? { top: `calc(50% - ${cropH / 2}px)` }
        : { bottom: 0 };
    let flyTransform;
    if (flying) {
        const seed = crop.x * 31 + crop.y;
        const tMs = frame * 120;
        const dx = oscillate(seed, tMs, FLYING_HOVER_OSC_RANGE, FLYING_HOVER_OSC_SPEED);
        const dy = oscillate(seed + 1, tMs, FLYING_HOVER_OSC_RANGE, FLYING_HOVER_OSC_SPEED);
        flyTransform = `translate(${dx}px, ${dy}px)`;
    }
    return (
        <div className={framed ? 'cc-sprite-frame' : undefined}
            style={framed
                ? { width: box, height: box, transform: mirror ? 'scaleX(-1)' : undefined }
                : { position: 'relative', width: '100%', height: '100%', transform: mirror ? 'scaleX(-1)' : undefined }}>
            {/* #1028 follow-up (Han: "ik wil graag een grid, zoals in debug achter de hero, van 4x4 grijs/wit
                blokken, achter de sprite"): the SAME canonical `.cc-checker` debug pattern (§6d) the
                character creator's avatar/equipment slots use — layered behind everything else so movement
                against it is visible without hiding the sprite. Requires `CharacterCreator.css` to be
                imported somewhere in the app (already is, via `BestiaryPanels.jsx`/`characterEditorShared.js`).
                #1028 follow-up round 3 (Han: "bij move animaties, verwacht ik nog steeds dat de achtergrond
                beweegt (checkerboard)"): `checkerScrollPx` (caller-computed, 0 for non-move animations)
                shifts the checker's own 4-gradient-layer `background-position` (its CSS default is
                `0 0, 0 32px, 32px -32px, -32px 0px`, see CharacterCreator.css's `.cc-checker`) by the SAME
                X amount on every layer — a pure background-position scroll, no element movement/clipping
                needed, so it can never spill past the box. */}
            {debugMode && (
                <div className="cc-checker" style={{
                    position: 'absolute', inset: 0,
                    ...(checkerScrollPx ? { backgroundPosition: `${checkerScrollPx}px 0, ${checkerScrollPx}px 32px, ${checkerScrollPx + 32}px -32px, ${checkerScrollPx - 32}px 0px` } : {}),
                }} />
            )}
            {framed && <Frame64Overlay box={box} />}
            <div style={{ position: 'absolute', left: `calc(50% - ${cropW / 2}px)`, ...vPos, width: cropW, height: cropH, overflow: 'hidden', transform: flyTransform }}>
                <div style={{ position: 'absolute', left: -crop.x * effectiveScale, top: -crop.y * effectiveScale, width: f.w, height: f.h, transform: `scale(${effectiveScale})`, transformOrigin: 'top left' }}>
                    <div style={layerStyle(spriteUrl)} />
                    {overlayUrls.map((u) => <div key={u} style={layerStyle(u)} />)}
                </div>
                {/* #689 (Han: "zet het lantern frame ook in beeld: dat is gewoon lantern.png") — a STATIC
                    prop badge for the current animation (e.g. Medieval's harp animations showing the
                    lantern set down beside her) — a fixed small icon, not per-cell-matched like overlayUrls
                    above, so it's drawn once in a corner rather than tracking the sprite's own frame. */}
                {anim.propUrl && (
                    <img src={anim.propUrl} alt="" style={{
                        position: 'absolute', left: 4, bottom: 4, width: 16 * effectiveScale, height: 16 * effectiveScale,
                        imageRendering: 'pixelated', pointerEvents: 'none',
                    }} />
                )}
            </div>
        </div>
    );
}
