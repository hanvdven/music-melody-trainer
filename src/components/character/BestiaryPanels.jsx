import React from 'react';
import { variantColor } from '../../model/characterAssets';
import { isFlyingAnim } from '../../model/bestiaryAssets';
import { BESTIARY_BEINGS, BESTIARY_FILTER_TAG_ROWS, BESTIARY_TOWNSFOLK_ROW } from './useBestiaryEditor';
import { oscillate, FLYING_HOVER_OSC_RANGE, FLYING_HOVER_OSC_SPEED } from '../../utils/oscillate';
import frame64Url from '../../assets/ASSORTED/icons/GandalfHardcore Pixel Art Game UI/64x64 frame.png';

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
const FRAME_SIZE = 64;
// #870 (Han 2026-08-12, "toon ook de tags links van het portet boven in beeld") — small pill label shared
// by the being tag and every subtractive tag shown next to the preview.
const PILL_STYLE = {
    fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '11px', padding: '2px 8px',
    borderRadius: '10px', border: '1px solid var(--text-secondary)', background: 'var(--panel-bg)',
    color: 'var(--text-primary)', whiteSpace: 'nowrap',
};
// #870 (Han 2026-08-12, "geef de tags kleuren (mature en flying consistent met de animatie/variant tags)"):
// `flying`/`bare` MUST stay the exact hex already used elsewhere (the flying animation-button tint, the bare
// swatch fill) — everything else is a fresh, thematically-grouped palette so the filter chips (and the
// pills next to the preview) are visually distinguishable at a glance. Shared by BestiaryFilterBar and the
// preview's tag-pill column below — one lookup, not two.
export const TAG_COLOR = {
    flying: '#16306b', bare: '#ff5fa8', mature: '#8e1c4a',
    magical: '#6a3fa0', hellish: '#8b0000', undead: '#3c5a4a',
    musician: '#a0522d', worker: '#5c4630', trader: '#b8860b', tavern: '#c07a1e', military: '#3a5a78',
    bathhouse: '#1e8a8a',
    oriental: '#7a2e2e', seasonal: '#1e7a5a', roman: '#a05a2e', christian: '#8a7a1e',
    pet: '#4a8a3a', critter: '#5a7a2e',
    portrait: '#4a4a6a', move: '#2e6a8a', attack: '#a03a2e', ranged: '#c05a1e',
    // #870 (Han 2026-08-13): the townsfolk/hostile/nature group (own row, see BESTIARY_TOWNSFOLK_ROW).
    townsfolk: '#2e7ab8', hostile: '#a01e1e', nature: '#4a9c3a',
    // #870 (Han 2026-08-13, "geef ook kleurtjes aan de human humanoid animal other tags"): the being row —
    // shares this SAME lookup/`tagPillStyle` helper (being/tag namespaces never collide) rather than a
    // second colour map.
    human: '#6b6b6b', humanoid: '#8a5a3b', animal: '#3a7a5a', other: '#7a5a1e',
};
const tagPillStyle = (tag) => (TAG_COLOR[tag] ? { ...PILL_STYLE, backgroundColor: TAG_COLOR[tag], color: '#fff', borderColor: TAG_COLOR[tag] } : PILL_STYLE);
// #693 (Han 2026-08-04, round 7, "we put a lot of work into classifying sprites and animations; so make
// use of that work when placing assets into the world"): exported so world-placement callers (e.g.
// RpgLevelPanel's pet/NPC sprites) reuse this SAME canonical renderer (§6d) instead of hand-rolling their
// own crop/animation-cell math — previously only used inside this file's own bestiary top/bottom panels.
export function CreatureSprite({ variant, anim, frame, scale, overlayUrls = [], framed = true }) {
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
            style={framed ? { width: box, height: box } : { position: 'relative', width: '100%', height: '100%' }}>
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

// #790 (Han 2026-08-09, "het grote kader mag in lijn met de andere kaders (bestiary)"): exported so the
// persona avatar preview (CharacterAvatarPanel) sizes its own hero/pet/frame at this SAME scale — one
// visual scale for every 64×64 frame, not a second guessed one.
// #790 round 6 (Han: "je hebt het verkeerd begrepen. alle bestiary portretten moeten ook op die schaal
// staan; d.w.z. preview_scale zelf moet groter"): round 5 introduced a SEPARATE `PERSONA_SCALE` multiplier
// used only by the persona preview — wrong; Han wants the WHOLE Bestiary UI (every top-view frame/portrait,
// not just the persona) 1.6× bigger, so the increase belongs on `PREVIEW_SCALE` itself.
export const PREVIEW_SCALE = 2.6 * 1.6;
// #682 (Han: "maak de previews 30% groter (maar houd de vakjes even groot)") — the SPRITE scale grows 30%;
// the thumb box itself (`.cc-enemy-thumb`, CSS) is untouched, so bigger previews now overflow it (allowed —
// see `.cc-enemy-thumb`'s `overflow: visible` below) instead of the box growing to fit.
const THUMB_SCALE = 1.3 * 1.3;

// #675 follow-up (Han: "toon het portret groot" — most portraits are a lone dedicated file, shown whole via
// a plain `<img>`; the Wizard's is an 8-colour grid (`portraitCell`+`portraitFrame` set), cropped to just
// the one cell matching the selected colour, same background-position technique as CreatureSprite).
// #682 (Han 2026-08-04, "portrait varianten tonen twee kaders van 64x64: een met het karakter, en een met de
// pixel art portrait"): the portrait gets its OWN `.cc-sprite-frame` box (same background/border as the
// sprite's frame, §6d — one visual language for both "kaders"), sized to match (`size` = 64×PREVIEW_SCALE).
// Unlike the sprite frame, this one clips (`overflow: hidden`) — portraits fill their box exactly, no
// overflow concept applies here.
// #691 (Han: after wiring up the archer/wizard projectile panel, "ik verwacht... een 64x64 vak met de pijl
// (gecentreerd)"): both branches now CENTER their content via flex instead of stretching/top-left-anchoring
// it to fill the box — a whole-file portrait (e.g. `arrow.png`, 30×5px) or a cropped sheet frame (e.g. the
// projectile's 48×16 flight frame) is rarely square, and Han's "gecentreerd" rules out both stretching it to
// fill AND leaving it pinned in a corner with dead space around it.
// #693 (Han 2026-08-04, round 3: "the portrait for the projectiles should be 64x64; as any other portrait.
// the projectile should be the same scale as the archer i.e. true size wrt the frame (30x5 (arrow) or
// 48x16 (magic) fitting into a 64x64 frame), centered, with mild oscillations"): supersedes round 2's
// "stretch to fill, no letterbox" approach — Han clarified he wants the OPPOSITE: every portrait (whole-file
// or cell-cropped) is a SQUARE 64-reference box like any other, the content shown at its OWN true pixel
// size scaled by the SAME factor the box itself uses (`size / 64` — never a per-content contain-fit ratio),
// centered on both axes, clipped if it overflows (Mind Blast's 96×32 frame is wider than 64 — Han: "center
// and clip"). `animCols`/`tick` (optional) cycle through multiple frames in the cell's row (the projectile's
// flight loop, Mind Blast's 5 frames) — genuinely animated, not frozen. A subtle oscillation (Han: "use the
// same oscillation as the one in the sheet music") nudges the centered content, reusing the EXACT wobble
// SheetRpgLayer's flying projectile uses (`src/utils/oscillate.js`, §6c/§6d — one implementation, not a
// second hand-copied one). `Frame64Overlay` (the same decorative pixel-art border every other 64×64 box
// now gets) draws on top.
// #693 round 9 (Han: "magic projectile: flip de richting (zowel in bestiary als in de song levels)"):
// `flip` mirrors the content horizontally — same direction change as SheetRpgLayer's Projectile component,
// applied here too so the Bestiary's preview and the actual in-level projectile always agree (§6d — one
// visual fact, not two independently-flipped copies that could drift apart again).
function PortraitImage({ url, cell, frame, size, animCols = 1, tick = 0, oscillateSeed = null, flip = false }) {
    const trueScale = size / 64;   // fixed 64×64 reference — NOT frame-dependent (Han: "true size")
    const [wobX, wobY] = oscillateSeed != null
        ? [oscillate(oscillateSeed, Date.now(), 4 * trueScale), oscillate(oscillateSeed + 1000, Date.now(), 4 * trueScale)]
        : [0, 0];
    const flipScale = flip ? -trueScale : trueScale;
    const inner = !cell
        ? <img src={url} alt="" style={{ imageRendering: 'pixelated', display: 'block', transform: `scale(${flipScale}, ${trueScale})`, transformOrigin: 'center' }} />
        : (() => {
            const col = animCols > 1 ? tick % animCols : cell.col;
            return (
                <div style={{
                    width: frame.w, height: frame.h,
                    backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
                    backgroundPosition: `${-col * frame.w}px ${-cell.row * frame.h}px`, backgroundSize: 'auto',
                    transform: `scale(${flipScale}, ${trueScale})`, transformOrigin: 'center', imageRendering: 'pixelated',
                }} />
            );
        })();
    // #693 round 8 (Han: "volgorde is daar nog verkeerd; moet zijn (van achter naar voor): witte rand,
    // portret, kader, game karakter/projectiel"): a plain white backing now sits behind everything (was
    // just the box's own `--panel-bg` CSS, not necessarily white), the portrait/projectile content sits
    // on top of that, and `Frame64Overlay` now draws LAST (in front of the content) — the opposite of the
    // previous order, where the frame sat behind the content.
    return (
        <div className="cc-sprite-frame" style={{ position: 'relative', width: size, height: size, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#fff' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translate(${wobX}px, ${wobY}px)` }}>
                {inner}
            </div>
            <Frame64Overlay box={size} />
        </div>
    );
}

export function BestiaryTopPanel({ editor, debugMode = false }) {
    const {
        creature, variant, variantIndex, setVariantIndex, anim, frame, animKey, setAnimKey, visibleAnimations,
        activeAccessories, toggleAccessory, hasHatOverlay, hasSwordAnims, swordOn, toggleSword,
        colorVariants, hasBareToggle, bareOn, toggleBare,
    } = editor;
    // #671 (Han: "kan je de kleur samplen?"): Doggy's swatch colour is SAMPLED per-file (variant.swatchColor,
    // §671), not a named colour keyword — checked alongside variantColor so both sources light up the same
    // swatch row. When NEITHER resolves for any variant (Covered/Uncovered, Wisp's Plain/Outline — a real
    // on/off pair, not a colour choice), render `.cc-tab` toggle-style pills instead of empty swatches —
    // Han: "gebruik ook zo'n toggler voor covered uncovered."
    const colorOf = (v) => variantColor(v.variant) || v.swatchColor;
    const anyColor = colorVariants.some(colorOf);
    // #870 (Han 2026-08-12, Maid "b/w + hat = toon de maid b/w en plak de hat sprite met de matchende
    // animatie erover"): `anim.hatUrl` (generator-resolved, matches THIS exact animation's cell layout) is
    // layered on top the same way a real accessory would be, gated on the SAME `activeAccessories.hat`
    // toggle used for the Hat button below — just resolved per-animation instead of a fixed creature URL.
    const overlayUrls = [
        ...creature.accessories.filter((a) => activeAccessories[a.key]).map((a) => a.url),
        ...(activeAccessories.hat && anim.hatUrl ? [anim.hatUrl] : []),
    ];
    // #870 (Han 2026-08-12, "verplaats de kleuren en togglers naar rechts van het portret... centreer het
    // portret... de tags links en de opties rechts mogen geen impact op de centrering hebben"): the colour
    // swatches + every toggler now render together in this ONE right-side column, gathered here so the JSX
    // below can drop them in as a single block instead of several separately-positioned ones.
    const optionsColumn = (
        <>
            {/* #668/#671 variant toggler — colour swatches when a colour is known (Slime, Archer, farm
                animals, Doggy's sampled colours); a segmented toggle-group otherwise (Covered/Uncovered,
                Wisp — #679: these are genuinely on/off pairs, so they get the SAME `.cc-toggle-group` chrome
                as the equipment/character on/off togglers, distinct from `.cc-anim`/`.cc-tab` navigation).
                #870 (Han 2026-08-12, "maak steeds bare een aparte toggler (naast kleur)"): only NON-bare
                variants show here now — Bare is its own toggle button below. */}
            {colorVariants.length > 1 && (
                anyColor ? (
                    <div className="cc-variants">
                        {colorVariants.map((v, i) => {
                            const col = colorOf(v);
                            // #690 (Han: "twee-kleuren vakje... diagonaal gesplitst links boven/rechts
                            // onder") — a second swatch colour (e.g. Maid's plain colours, the cow's
                            // Bw/Rw, or Lady Flower's un-named colour pairs, §870) renders as a diagonal
                            // split instead of a flat fill; single-colour variants are unaffected.
                            const bg = v.swatchColor2
                                ? `linear-gradient(135deg, ${col} 50%, ${v.swatchColor2} 50%)` : (col || 'transparent');
                            return (
                                <button key={`${v.variant}-${i}`} title={v.variant || 'plain'}
                                    className={`cc-swatch${i === variantIndex ? ' active' : ''}`}
                                    onClick={() => setVariantIndex(i)} style={{ background: bg }}>
                                    {col ? '' : (v.variant || '•')}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="cc-toggle-group">
                        {colorVariants.map((v, i) => (
                            <button key={`${v.variant}-${i}`} className={`cc-toggle${i === variantIndex ? ' active' : ''}`}
                                onClick={() => setVariantIndex(i)}>{v.variant || 'Plain'}</button>
                        ))}
                    </div>
                )
            )}
            {/* #671 accessory togglers (Han: "maak een toggler voor hat en backpack") — independent on/off
                layers, not mutually-exclusive variants, so each gets its own toggle button.
                #870 (Han 2026-08-12): Hat/Sword/Bare join this SAME row when applicable — Hat is a TRUE
                overlay (same accessory mechanism, resolved per-animation via `overlayUrls` above); Sword
                filters WHICH animations show (below) rather than swapping variant; Bare swaps the EFFECTIVE
                variant to its bare sibling (`useBestiaryEditor`'s `variant` already resolves this) — all
                generic (`hasHatOverlay`/`hasSwordAnims`/`hasBareToggle`), never hardcoded to one creature. */}
            {(creature.accessories.length > 0 || hasHatOverlay || hasSwordAnims || hasBareToggle) && (
                <div className="cc-toggle-group">
                    {creature.accessories.map((a) => (
                        <button key={a.key} className={`cc-toggle${activeAccessories[a.key] ? ' active' : ''}`}
                            onClick={() => toggleAccessory(a.key)}>{a.label}</button>
                    ))}
                    {hasHatOverlay && (
                        <button className={`cc-toggle${activeAccessories.hat ? ' active' : ''}`}
                            onClick={() => toggleAccessory('hat')}>Hat</button>
                    )}
                    {hasSwordAnims && (
                        <button className={`cc-toggle${swordOn ? ' active' : ''}`}
                            onClick={toggleSword}>Sword</button>
                    )}
                    {hasBareToggle && (
                        <button className={`cc-toggle${bareOn ? ' active' : ''}`}
                            onClick={toggleBare}
                            style={bareOn ? { backgroundColor: '#ff5fa8', color: '#fff' } : undefined}>Bare</button>
                    )}
                </div>
            )}
        </>
    );
    const tagsColumn = (creature.being || variant.tags?.length) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
            {creature.being && <span style={tagPillStyle(creature.being)}>{creature.being}</span>}
            {(variant.tags || []).filter((t) => t !== 'bare').map((t) => (
                <span key={t} style={tagPillStyle(t)}>{t}</span>
            ))}
        </div>
    );
    return (
        <div className="cc-enemy-preview" style={{ margin: '0 auto', width: '100%' }}>
            {/* #682 (Han 2026-08-04, "de titel / naam moet er boven staan") — moved above the frame(s). */}
            <div className="cc-enemy-name">{creature.name}</div>
            {/* #672/#675 (Han: "toon bij portrait characters links de avatar met animatievariaties, en
                rechts het portret (groot)") — character sprite LEFT, portrait crop RIGHT, sized to roughly
                match the avatar's own height so it reads as an equal-weight companion, not an afterthought.
                #870 (Han 2026-08-12, "toon ook de tags links van het portet"; follow-up: "verplaats de
                kleuren en togglers naar rechts van het portret... centreer het portret").
                #870 (Han 2026-08-13 bugfix, "na je herschikking staan de tags en varianten denk ik achter of
                over het portret... ik kan ze alleszins niet meer zien"): the PREVIOUS `position: absolute`
                approach anchored tags/options to this wrapper's own edges — but `.cc-enemy-stage`'s content
                (sprite + portrait boxes, each `FRAME_SIZE * PREVIEW_SCALE` ~266px, §148) is far WIDER than
                `.cc-enemy-preview`'s old 256px column (it already overflowed that box before this round, just
                harmlessly, since nothing else occupied the horizontal overflow space) — so `left:0`/`right:0`
                landed the side columns UNDERNEATH the oversized, already-overflowing stage instead of next to
                it. Fixed by (a) widening `.cc-enemy-preview` (CharacterCreator.css) so the stage usually fits
                without overflowing, and (b) putting tags/stage/options back in NORMAL flow as a wrapping flex
                row instead of absolute — this can never overlap (worst case it wraps to its own line on an
                extra-wide multi-box creature), trading Han's original "impact-free centering" guarantee for
                robustness against content wider than any fixed pixel guess. */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
                gap: '12px', width: '100%', minHeight: FRAME_SIZE * PREVIEW_SCALE,
            }}>
                {tagsColumn}
                <div className="cc-enemy-stage" style={{ gap: '16px' }}>
                    <CreatureSprite variant={variant} anim={anim} frame={frame} scale={PREVIEW_SCALE} overlayUrls={overlayUrls} />
                    {variant.portraitUrl && (
                        <PortraitImage url={variant.portraitUrl} cell={variant.portraitCell} frame={variant.portraitFrame}
                            size={64 * PREVIEW_SCALE} animCols={variant.portraitAnimCols || 1} tick={frame}
                            oscillateSeed={variant.portraitOscillate ? creature.id : null} />
                    )}
                    {/* #693 round 3 ("portait/wizard: add the animated projectile right of the portrait") — a
                        THIRD box for creatures whose primary portrait slot is already taken by something else
                        (Wizard (Portrait)'s own 8-colour portrait crop), so the projectile companion needs its
                        OWN independent slot instead of overwriting the existing portrait. */}
                    {/* #693 round 12 (Han: "you flipped the wrong one. Flip both, to make it right."): both the
                        bestiary preview AND the level's own `Projectile` (SheetRpgLayer.jsx) mirror the
                        projectile's direction. */}
                    {variant.sidePortraitUrl && (
                        <PortraitImage url={variant.sidePortraitUrl} cell={variant.sidePortraitCell} frame={variant.sidePortraitFrame}
                            size={64 * PREVIEW_SCALE} animCols={variant.sidePortraitAnimCols || 1} tick={frame}
                            oscillateSeed={creature.id} flip />
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>{optionsColumn}</div>
            </div>
            {/* #668 debug width×height overlay (Han: "toon de hxb van de spritesheet zodat ik kan checken")
                — the auto-scanned frame/crop guess is a PROPOSAL (no per-sheet hand measurement was
                possible for 289 files); this lets Han visually sanity-check it against the real sheet. */}
            {debugMode && (
                <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {variant.width ? `${variant.width}×${variant.height}px sheet, ` : ''}
                    {variant.frame.w}×{variant.frame.h} frame
                </div>
            )}
            {creature.blurb && <div className="cc-enemy-blurb">{creature.blurb}</div>}
            {/* #870 (Han 2026-08-12, "laat de animatie eronder staan, maar gebruik de volledige beschikbare
                breedte") — full width, below everything else (colours/togglers moved up into `optionsColumn`). */}
            <div className="cc-anims cc-enemy-anims" style={{ width: '100%' }}>
                {/* #790 (Han 2026-08-09, "tag alle flying animation, maak het vakje daarvan donkerblauw"):
                    a `flying`-tagged animation (generator-derived) gets a dark-blue tint so it reads as
                    "this one hovers/oscillates" at a glance, independent of which one is currently active. */}
                {visibleAnimations.map((a) => (
                    <button key={a.key} className={`cc-anim${animKey === a.key ? ' active' : ''}`}
                        onClick={() => setAnimKey(a.key)}
                        style={a.tags?.includes('flying') ? { backgroundColor: '#16306b', color: '#fff' } : undefined}>
                        {a.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// #679 (Han 2026-08-03, "verplaats de navigatieknopjes naar de regel boven de bottom view"): the category
// selector (passive/attack/.../musicians) used to live in AvatarSubHeader's header row — this component
// rendered whichever ONE category was active. #870 (Han 2026-08-12, "de oude 'passive, with portrait, etc.'
// pre-selecties zijn vervangen voor het tag-systeem"): that category-tab browsing model is gone entirely —
// this now renders the FULL creature set (`editor.visibleCreatures`), narrowed only by `BestiaryFilterBar`.
// #870 (Han 2026-08-12, full tag-system rewrite): the being group (human/humanoid/animal/other, additive/
// OR, always ≥1 active, EXHAUSTIVE — every creature has exactly one, so unlike every row below it, this one
// gets no 'All' button, Han 2026-08-13: "behalve de bovenste... want die is wel exhaustief"), the townsfolk/
// hostile/nature row directly under it, the subtractive tag-chip rows, Mature's 3-state cycle, and a search
// box. Reuses `.cc-toggle-group`/`.cc-toggle` — the SAME chrome as the accessory/hat/sword togglers above
// (§6d — one visual language for "on/off choice", not a second bespoke filter-bar style) — except the being
// group, which uses `.cc-swatch`-style solid-active buttons since "OR, ≥1 active" reads more like a swatch
// selection than a plain on/off toggle.
const MATURE_MODE_LABEL = { off: 'Mature: Off', show: 'Mature: Show', only: 'Mature: Only' };
// #870 (Han 2026-08-13, "maak de tags per rij additief... voeg aan het eind van elke rij een knopje 'all'
// toe"): one shared row renderer for the townsfolk/hostile/nature row AND every `BESTIARY_FILTER_TAG_ROWS`
// row — same OR-within/AND-across mechanics, same chrome, same grey-out/reset-and-activate/All behaviour, so
// there's exactly one place this logic lives (§6d) instead of two near-duplicate blocks.
function TagRow({ row, editor }) {
    const { activeTags, toggleTagFilter, tagHasMatches, selectOnlyTag, clearTagRow } = editor;
    const rowActive = row.some((tag) => activeTags.has(tag));
    return (
        <div className="cc-toggle-group" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {row.map((tag) => {
                const active = activeTags.has(tag);
                // #870 (Han 2026-08-12, "maak tags waar geen subset voor bestaat grijs... op grijze tag
                // klikken: reset alle filters, en zet de grijze tag aan"): a tag with ZERO matching creatures
                // under the current being/mature/OTHER-rows filters (Han's own example: Human selected → no
                // Critter matches) renders greyed-out — click still works, but RESETS everything else first
                // instead of combining (which would just show 0 results). A tag's OWN row never greys it out
                // for what's already active in that SAME row (it's an OR group — see `tagHasMatches`).
                const available = tagHasMatches(tag);
                return (
                    <button key={tag}
                        className={`cc-toggle${active ? ' active' : ''}`}
                        onClick={() => (available ? toggleTagFilter(tag) : selectOnlyTag(tag))}
                        style={{
                            ...(active ? { backgroundColor: TAG_COLOR[tag], borderColor: TAG_COLOR[tag], color: '#fff' } : undefined),
                            ...(available ? undefined : { opacity: 0.35 }),
                        }}>
                        {tag.charAt(0).toUpperCase() + tag.slice(1)}
                    </button>
                );
            })}
            {/* Han: "voeg aan het eind van elke rij een knopje 'all' toe, die alle tags uitzet, en de
                filtergroep afzet (want de groepen zijn niet exhaustief)" — clears just THIS row. */}
            <button className={`cc-toggle${rowActive ? '' : ' active'}`}
                onClick={() => clearTagRow(row)}>All</button>
        </div>
    );
}
function BestiaryFilterBar({ editor }) {
    const { activeBeings, toggleBeing, matureMode, cycleMatureMode, searchQuery, setSearchQuery } = editor;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
            <div className="cc-toggle-group">
                {BESTIARY_BEINGS.map((being) => (
                    <button key={being} className={`cc-toggle${activeBeings.has(being) ? ' active' : ''}`}
                        onClick={() => toggleBeing(being)}
                        style={activeBeings.has(being) ? { backgroundColor: TAG_COLOR[being], borderColor: TAG_COLOR[being], color: '#fff' } : undefined}>
                        {being.charAt(0).toUpperCase() + being.slice(1)}
                    </button>
                ))}
            </div>
            <TagRow row={BESTIARY_TOWNSFOLK_ROW} editor={editor} />
            {BESTIARY_FILTER_TAG_ROWS.map((row, i) => <TagRow key={i} row={row} editor={editor} />)}
            <div className="cc-toggle-group">
                <button className={`cc-toggle${matureMode !== 'off' ? ' active' : ''}`}
                    onClick={cycleMatureMode}>{MATURE_MODE_LABEL[matureMode]}</button>
            </div>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…" className="cc-search-input"
                style={{
                    fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '13px', padding: '4px 10px',
                    borderRadius: '6px', border: '1px solid var(--text-secondary)', background: 'var(--panel-bg)',
                    color: 'var(--text-primary)', width: '220px',
                }} />
        </div>
    );
}

export function BestiaryBottomPanel({ editor }) {
    const { visibleCreatures, selId, selectCreature } = editor;
    return (
        <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: '12px' }}>
            <BestiaryFilterBar editor={editor} />
            <div className="cc-enemy-grid" style={{ justifyContent: 'center' }}>
                {visibleCreatures.map((c) => {
                    const rep = c.variants[0];
                    const idle = rep.animations[0];
                    return (
                        <button key={c.id} title={c.name}
                            className={`cc-thumb cc-enemy-thumb${c.id === selId ? ' active' : ''}`}
                            onClick={() => selectCreature(c.id)}>
                            <CreatureSprite variant={rep} anim={idle} frame={0} scale={THUMB_SCALE} framed={false} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
