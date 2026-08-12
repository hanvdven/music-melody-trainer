import React from 'react';
import habboFontUrl from '../../assets/fonts/pixel_fonts/Habbo.ttf';
import { Frame64Overlay } from './BestiaryPanels';

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
const FONT_SIZE = 18 * DIALOGUE_SCALE;

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
export function SpeakerPortrait({ url, crop, cellW = 32, cellH = 32, row = 0, col = 0 }) {
    const trueScale = PORTRAIT_SIZE / 64;
    const cropW = crop.w * trueScale, cropH = crop.h * trueScale;
    return (
        <div style={{ position: 'relative', width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, overflow: 'hidden', flexShrink: 0, borderRight: '3px solid var(--text-primary)' }}>
            <div style={{ position: 'absolute', left: `calc(50% - ${cropW / 2}px)`, bottom: 0, width: cropW, height: cropH, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: -crop.x * trueScale, top: -crop.y * trueScale, width: cellW * trueScale, height: cellH * trueScale, overflow: 'hidden' }}>
                    <div style={{
                        width: cellW, height: cellH, transform: `scale(${trueScale})`, transformOrigin: 'top left',
                        backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'auto',
                        backgroundPosition: `${-col * cellW}px ${-row * cellH}px`, imageRendering: 'pixelated',
                    }} />
                </div>
            </div>
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
                fontFamily: 'HabboPixel, monospace', padding: '4px 6px',
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
    portraitUrl, portraitCrop, portraitCellW, portraitCellH, portraitRow, portraitCol,
    dedicatedPortraitUrl, dedicatedPortraitCell, dedicatedPortraitFrame, text, onClick,
    autoContinue, onToggleAutoContinue, hasMorePages,
}) {
    return (
        <>
            <style>{`
                @font-face { font-family: 'HabboPixel'; src: url('${habboFontUrl}') format('truetype'); }
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
                        : <SpeakerPortrait url={portraitUrl} crop={portraitCrop} cellW={portraitCellW} cellH={portraitCellH} row={portraitRow} col={portraitCol} />}
                    <div style={{ position: 'relative', width: TEXT_WIDTH, display: 'flex', alignItems: 'center', padding: `0 ${14 * DIALOGUE_SCALE / 2}px` }}>
                        <span style={{ fontFamily: 'HabboPixel, monospace', fontSize: FONT_SIZE, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                            {text}
                        </span>
                        {hasMorePages && <MorePagesIndicator />}
                    </div>
                </div>
                {onToggleAutoContinue && <AutoContinueToggle on={autoContinue} onToggle={onToggleAutoContinue} />}
            </div>
        </>
    );
}
