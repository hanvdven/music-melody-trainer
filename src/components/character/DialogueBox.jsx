import React, { useState, useEffect } from 'react';
import bitfantasyFontUrl from '../../assets/fonts/pixel_fonts/Bitfantasy.ttf';
// #1028 follow-up (Han 2026-08-17, HMR bug fix): moved to its own file — see CreatureSprite.jsx header.
import { Frame64Overlay, CreatureSprite } from './CreatureSprite';
import OscillatingText from './OscillatingText';

// #1088 (Han 2026-08-19, "als geen portret bestaat, gebruik de unit zelf, met idle animatie"): a simple,
// always-running frame counter driving every fallback-sprite portrait's idle loop — not tempo-synced
// (this is a static conversation screen, not gameplay), just a steady pixel-art idle cadence. Matches the
// interval-driven idle-frame convention RpgLevelPanel.jsx already uses for its own world sprites (§6c),
// scaled down since a conversation portrait has no BPM to sync to.
const IDLE_FRAME_INTERVAL_MS = 200;
function useIdleFrame() {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setFrame((f) => f + 1), IDLE_FRAME_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);
    return frame;
}

// #693/#864 (Han 2026-08-04 → 2026-08-10): the pixel-art dialogue box originally built for the RPG-world
// Wisp NPC (RpgLevelBottomPanel.jsx), extracted into a reusable component so a second caller (LevelSplash
// — the level-complete panel, "beneden een dialoogveld, zoals de wisp heeft") gets the EXACT same box,
// not a hand-rolled second copy (§6d). Only the portrait's sprite (url/crop/cell size/frame) and the text
// vary per caller — the frame chrome (square corners, proportional portrait/text columns) is fixed.
// #922 (Han 2026-08-12, "het vak is veel te klein, ik had je gevraagd het ongeveer 2,5x groter te maken.
// kijk eens hoeveel ruimte er is in de bottom view"): the ENTIRE box (portrait + text + font) scales
// uniformly by `DIALOGUE_SCALE` off the original #693-round-3 base sizes (64×64 portrait / 256-wide text) —
// a single scale constant so nothing drifts out of proportion. The RPG-level bottom view is ~215–395px
// tall depending on window size (useAppLayout.js's `btmPanelHeight`/`rpgLevelTopHeight`), comfortably
// fitting the resulting 160px-tall box.
const DIALOGUE_SCALE = 2.5;
export const PORTRAIT_SIZE = 64 * DIALOGUE_SCALE;
export const TEXT_WIDTH = 256 * DIALOGUE_SCALE;

// #922 round 6 (Han 2026-08-12, "gebruik bit-fantasy als font. T is 8 'pixels' hoog, e is 6 'pixels' hoog.
// Probeer ze hetzelfde te schalen als de afbeelding ernaast"): Bitfantasy.ttf's ACTUAL glyph metrics
// (measured via fontTools — unitsPerEm=1024, capital 'T' glyph height=448 units) confirm Han's own "8
// native pixels" measurement (448/1024 em = 0.4375 em; a 6-pixel 'e' at 384 units checks out too: 384/56 ≈
// 6.86, matching within hand-measurement rounding, where 56 = 448/8 units-per-native-pixel). Deriving
// FONT_SIZE from these numbers (rather than an eyeballed literal) means a capital letter renders at exactly
// `CAP_HEIGHT_NATIVE_PX * DIALOGUE_SCALE` px tall — the SAME per-native-pixel zoom as the portrait sprite
// next to it (`trueScale = PORTRAIT_SIZE / 64`, also DIALOGUE_SCALE).
const BITFANTASY_UNITS_PER_EM = 1024;
const BITFANTASY_CAP_HEIGHT_UNITS = 448;   // measured 'T' glyph height
const CAP_HEIGHT_NATIVE_PX = 8;            // Han's own measurement of 'T' on the font's native pixel grid
// #922 round 7 (Han: "tekst mag 50% kleiner (ondanks mijn eerder regel)"): overrides the pixel-perfect
// derivation above by half — Han's own explicit call, made with full knowledge of the earlier "match the
// portrait's per-pixel zoom" rule.
// #924 round 7 (Han: "font van tekst mag 50% groter"): bumps the round-7 0.5 back up by half again (0.5 *
// 1.5 = 0.75), a further explicit override on top of the same base derivation — not a revert.
const FONT_SIZE_OVERRIDE_MULTIPLIER = 0.5 * 1.5;
const FONT_SIZE = ((CAP_HEIGHT_NATIVE_PX * DIALOGUE_SCALE * BITFANTASY_UNITS_PER_EM) / BITFANTASY_CAP_HEIGHT_UNITS) * FONT_SIZE_OVERRIDE_MULTIPLIER;

// Crops (and, for a multi-frame/multi-row spritesheet, offsets to a specific `row`/`col` cell — default
// {0,0}, the sheet's first/idle frame) EXACTLY the way SheetRpgLayer/CharacterDoll already render sprites
// — the same `background-position` + inner-crop-then-scale technique, not a new one (§6d).
// #922 fix (Han 2026-08-12, "de slime portret is veel groter dan 64x64 schaal"): this used to scale the
// CROP to exactly fill the box (`scale = PORTRAIT_SIZE / crop.h`), which zooms different sprites by
// DIFFERENT factors depending on their own crop height. Switched to the SAME fixed "true size" convention
// the Bestiary's `PortraitImage` uses (§6d): `trueScale = box / 64`, independent of crop size.
// #922 round 2 (Han: "hoe kan het dat de slime anders in het frame geankerd is in de conversatie dan in de
// bestiary? ik eis consistentie"): this was centering the crop on BOTH axes, like the Bestiary's
// `PortraitImage` (dedicated portraits — headshots, correctly center-anchored). But a SpeakerPortrait shows
// a raw SPRITE CROP, not a dedicated portrait — the Bestiary's convention for THAT case is `CreatureSprite`,
// which anchors bottom-CENTER (a creature standing on the ground, §6d "#682... anker op midden onder").
// Centering a sprite crop instead of bottom-anchoring it is exactly the kind of category mix-up §6d warns
// about: two different content types (portrait vs. sprite) need their OWN matching Bestiary convention, not
// one convention borrowed for both. Fixed to bottom-center, matching `CreatureSprite` exactly.
// #1088 fix (Han 2026-08-19): used to draw a STATIC single-cell crop by hand — no animation, and a second,
// slightly different re-implementation of the exact same "true-size, bottom-anchored sprite crop"
// rendering `CreatureSprite` (the canonical renderer, §6d) already does everywhere else in the Bestiary/
// world. Now a thin wrapper: builds the `anim` CreatureSprite expects from `variant.animations` (falls
// back to whichever animation is first if there's no 'idle' key) and drives it off the shared idle-frame
// counter, so every fallback portrait (npc sprite AND the no-enemy slime) animates instead of freezing on
// one frame.
export function SpeakerPortrait({ variant }) {
    const idleFrame = useIdleFrame();
    const anim = variant.animations?.find((a) => a.key === 'idle') || variant.animations?.[0] || { cells: [{ row: 0, col: 0 }] };
    return (
        <div style={{ position: 'relative', width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, overflow: 'hidden', flexShrink: 0, borderRight: '3px solid var(--text-primary)' }}>
            <CreatureSprite variant={variant} anim={anim} frame={idleFrame} scale={PORTRAIT_SIZE / 64} framed={false} />
            <Frame64Overlay box={PORTRAIT_SIZE} />
        </div>
    );
}

// #922 (Han 2026-08-12, "de wizard heeft een portret, in dat geval: toon het portret, niet de sprite"):
// when an entity has its OWN dedicated portrait image (the Bestiary's `portraitUrl` + `portraitCell`/
// `portraitFrame`, e.g. the Wizard's 64x64 colour-crop portrait strip — see bestiaryAssets.js), show THAT
// instead of a cropped sprite frame, reusing the Bestiary's `PortraitImage` true-size/center/clip/
// white-backing convention (§6d) rather than a hand-rolled third rendering technique. Since the box-wide
// 2.5× scale above (round 2) now applies to EVERY speaker uniformly, this no longer needs its own separate
// multiplier — it fills the exact same `PORTRAIT_SIZE` box as `SpeakerPortrait`.
function DedicatedPortrait({ url, cell, frame }) {
    const trueScale = PORTRAIT_SIZE / 64;
    return (
        <div style={{ position: 'relative', width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, overflow: 'hidden', flexShrink: 0, borderRight: '3px solid var(--text-primary)' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#fff' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!cell
                    ? <img src={url} alt="" style={{ imageRendering: 'pixelated', display: 'block', transform: `scale(${trueScale})`, transformOrigin: 'center' }} />
                    : (
                        <div style={{
                            width: frame.w, height: frame.h,
                            backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
                            backgroundPosition: `${-cell.col * frame.w}px ${-cell.row * frame.h}px`, backgroundSize: 'auto',
                            transform: `scale(${trueScale})`, transformOrigin: 'center', imageRendering: 'pixelated',
                        }} />
                    )}
            </div>
            <Frame64Overlay box={PORTRAIT_SIZE} />
        </div>
    );
}

// #922 (Han 2026-08-12, "zet rechts van de tekstbox een toggler (in pixel art stijl): auto-continue"): a
// small pixel-art switch, matching the dialogue box's own chrome (square corners, `var(--text-primary)`
// border, HabboPixel font) — rendered as a sibling to the box, not inside it.
export function AutoContinueToggle({ on, onToggle }) {
    return (
        <button
            onClick={onToggle}
            style={{
                marginLeft: 10, minWidth: 56, alignSelf: 'stretch', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer',
                background: on ? 'var(--text-primary)' : 'var(--panel-bg)',
                color: on ? 'var(--panel-bg)' : 'var(--text-primary)',
                border: '3px solid var(--text-primary)', borderRadius: 0, imageRendering: 'pixelated',
                fontFamily: 'Bitfantasy, monospace', padding: '4px 6px',
            }}
        >
            <span style={{ fontSize: 10, letterSpacing: 1 }}>AUTO</span>
            <span style={{ fontSize: 14 }}>{on ? 'ON' : 'OFF'}</span>
        </button>
    );
}

// #922 (Han 2026-08-12, "ik wil wel het driehoekje" — reinstated after an earlier round dropped it in
// favour of the AutoContinueToggle): the classic RPG-dialogue "more text below" indicator — a small
// triangle, bottom-right of the text column, bouncing continuously. Only rendered when `hasMorePages` is
// true (the hook's own `hasNextPage`) — matches the AUTO toggle's chrome (`var(--text-primary)`), not a
// separately-coloured decoration.
function MorePagesIndicator() {
    return (
        <div style={{
            position: 'absolute', right: 12, bottom: 10, width: 0, height: 0,
            borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
            borderTop: '9px solid var(--text-primary)', animation: 'dialogue-more-pages-bounce 0.8s infinite',
            pointerEvents: 'none',
        }} />
    );
}

export default function DialogueBox({
    portraitVariant,
    dedicatedPortraitUrl, dedicatedPortraitCell, dedicatedPortraitFrame, text, onClick,
    autoContinue, onToggleAutoContinue, hasMorePages,
}) {
    return (
        <>
            <style>{`
                @font-face { font-family: 'Bitfantasy'; src: url('${bitfantasyFontUrl}') format('truetype'); }
                @keyframes dialogue-more-pages-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
            `}</style>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <div onClick={onClick} style={{
                    display: 'flex', alignItems: 'stretch', height: PORTRAIT_SIZE,
                    background: 'var(--panel-bg)', border: '3px solid var(--text-primary)', borderRadius: 0,
                    cursor: onClick ? 'pointer' : 'default', imageRendering: 'pixelated',
                }}>
                    {dedicatedPortraitUrl
                        ? <DedicatedPortrait url={dedicatedPortraitUrl} cell={dedicatedPortraitCell} frame={dedicatedPortraitFrame} />
                        : <SpeakerPortrait variant={portraitVariant} />}
                    <div style={{ position: 'relative', width: TEXT_WIDTH, display: 'flex', alignItems: 'center', padding: `0 ${14 * DIALOGUE_SCALE / 2}px` }}>
                        {/* #922 round 6 ("regelafstand mag iets kleiner", 1.4->1.15) + round 7 ("regelafstand
                            mag 20% kleiner", 1.15->0.92). */}
                        <OscillatingText
                            text={text} scale={DIALOGUE_SCALE}
                            style={{ fontFamily: 'Bitfantasy, monospace', fontSize: FONT_SIZE, lineHeight: 0.92, color: 'var(--text-primary)' }}
                        />
                        {hasMorePages && <MorePagesIndicator />}
                    </div>
                </div>
                {onToggleAutoContinue && <AutoContinueToggle on={autoContinue} onToggle={onToggleAutoContinue} />}
            </div>
        </>
    );
}
