import React from 'react';
import habboFontUrl from '../../assets/fonts/pixel_fonts/Habbo.ttf';
import { Frame64Overlay } from './BestiaryPanels';

// #693/#864 (Han 2026-08-04 → 2026-08-10): the pixel-art dialogue box originally built for the RPG-world
// Wisp NPC (RpgLevelBottomPanel.jsx), extracted into a reusable component so a second caller (LevelSplash
// — the level-complete panel, "beneden een dialoogveld, zoals de wisp heeft") gets the EXACT same box,
// not a hand-rolled second copy (§6d). Only the portrait's sprite (url/crop/cell size/frame) and the text
// vary per caller — the frame chrome (64px-tall box, square corners, 256px text column) is fixed.
// #693 round 3 spec (still authoritative): 64px-tall frame, portrait pinned to the left edge at exactly
// 64×64 (Han: "het linkervak moet 64x64 zijn"), square corners (no border-radius), text column a further
// 256px wide (Han: "het rechtervak met tekst moet 64 hoog en 256 breed, voor toepassing van scaling
// factor" — 256 is a clean power-of-2 multiple of the 32px pixel-art grid every sprite here is drawn on).
export const PORTRAIT_SIZE = 64;
export const TEXT_WIDTH = 256;

// Crops (and, for a multi-frame/multi-row spritesheet, offsets to a specific `row`/`col` cell — default
// {0,0}, the sheet's first/idle frame) EXACTLY the way SheetRpgLayer/CharacterDoll already render sprites
// — the same `background-position` + inner-crop-then-scale technique, not a new one (§6d).
// #922 fix (Han 2026-08-12, "de slime portret is veel groter dan 64x64 schaal"): this used to scale the
// CROP to exactly fill the 64px box (`scale = PORTRAIT_SIZE / crop.h`), which zooms different sprites by
// DIFFERENT factors depending on their own crop height — the slime's small 29px-tall crop got blown up
// ~2.2x vs the wizard's 52px-tall crop at ~1.23x, so entities looked inconsistently sized next to each
// other despite both being "64x64 portraits". Switched to the SAME fixed "true size" convention the
// Bestiary's `PortraitImage` already uses (§6d): `trueScale = box / 64`, independent of crop size — every
// entity renders at ONE shared RPG-pixel-art-pixel zoom, centered, clipped if it overflows the box (never
// stretched to fill). Also now draws the same `Frame64Overlay` decorative kader every other 64x64 box in
// the app uses, instead of a plain border (Han: full visual consistency with the Bestiary).
export function SpeakerPortrait({ url, crop, cellW = 32, cellH = 32, row = 0, col = 0 }) {
    const trueScale = PORTRAIT_SIZE / 64;
    return (
        <div style={{ position: 'relative', width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, overflow: 'hidden', flexShrink: 0, borderRight: '3px solid var(--text-primary)' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: crop.w * trueScale, height: crop.h * trueScale, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: -crop.x * trueScale, top: -crop.y * trueScale, width: cellW * trueScale, height: cellH * trueScale, overflow: 'hidden' }}>
                        <div style={{
                            width: cellW, height: cellH, transform: `scale(${trueScale})`, transformOrigin: 'top left',
                            backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'auto',
                            backgroundPosition: `${-col * cellW}px ${-row * cellH}px`, imageRendering: 'pixelated',
                        }} />
                    </div>
                </div>
            </div>
            <Frame64Overlay box={PORTRAIT_SIZE} />
        </div>
    );
}

// #922 (Han 2026-08-12, "de wizard heeft een portret, in dat geval: toon het portret, niet de sprite.
// schaal mag ongeveer 2x zo groot; probeer horizontaal te vullen"): when an entity has its OWN dedicated
// portrait image (the Bestiary's `portraitUrl` + `portraitCell`/`portraitFrame`, e.g. the Wizard's 64x64
// colour-crop portrait strip — see bestiaryAssets.js), show THAT instead of a cropped sprite frame, at 2x
// scale, reusing the Bestiary's `PortraitImage` true-size/center/clip/white-backing convention (§6d) rather
// than a hand-rolled third rendering technique. The portrait asset is itself a 64x64 square, so 2x scale
// (`PORTRAIT_SCALE_2X`) both fills the widened slot horizontally AND grows it vertically to match — the
// whole dialogue-box row grows to this height for a dedicated-portrait speaker (see DialogueBox below).
export const PORTRAIT_SCALE_2X = 2;

function DedicatedPortrait({ url, cell, frame }) {
    const size = PORTRAIT_SIZE * PORTRAIT_SCALE_2X;
    const trueScale = size / 64;
    return (
        <div style={{ position: 'relative', width: size, height: size, overflow: 'hidden', flexShrink: 0, borderRight: '3px solid var(--text-primary)' }}>
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
            <Frame64Overlay box={size} />
        </div>
    );
}

export default function DialogueBox({
    portraitUrl, portraitCrop, portraitCellW, portraitCellH, portraitRow, portraitCol,
    dedicatedPortraitUrl, dedicatedPortraitCell, dedicatedPortraitFrame, text, onClick,
}) {
    // #922 (Han 2026-08-12): a speaker with its OWN dedicated portrait (wizard) renders at 2x scale, which
    // grows the whole row height to match — every other speaker (wisp/slime, sprite-crop mode) keeps the
    // original 64px row.
    const rowHeight = dedicatedPortraitUrl ? PORTRAIT_SIZE * PORTRAIT_SCALE_2X : PORTRAIT_SIZE;
    return (
        <>
            <style>{`@font-face { font-family: 'HabboPixel'; src: url('${habboFontUrl}') format('truetype'); }`}</style>
            <div onClick={onClick} style={{
                display: 'flex', alignItems: 'stretch', height: rowHeight,
                background: 'var(--panel-bg)', border: '3px solid var(--text-primary)', borderRadius: 0,
                cursor: onClick ? 'pointer' : 'default', imageRendering: 'pixelated',
            }}>
                {dedicatedPortraitUrl
                    ? <DedicatedPortrait url={dedicatedPortraitUrl} cell={dedicatedPortraitCell} frame={dedicatedPortraitFrame} />
                    : <SpeakerPortrait url={portraitUrl} crop={portraitCrop} cellW={portraitCellW} cellH={portraitCellH} row={portraitRow} col={portraitCol} />}
                <div style={{ width: TEXT_WIDTH, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                    <span style={{ fontFamily: 'HabboPixel, monospace', fontSize: 18, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                        {text}
                    </span>
                </div>
            </div>
        </>
    );
}
