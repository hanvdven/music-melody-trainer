import React from 'react';
import habboFontUrl from '../../assets/fonts/pixel_fonts/Habbo.ttf';

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
export function SpeakerPortrait({ url, crop, cellW = 32, cellH = 32, row = 0, col = 0 }) {
    const scale = PORTRAIT_SIZE / crop.h;
    return (
        <div style={{ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, overflow: 'hidden', flexShrink: 0, borderRight: '3px solid var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: crop.w * scale, height: crop.h * scale, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: -crop.x * scale, top: -crop.y * scale, width: cellW * scale, height: cellH * scale, overflow: 'hidden' }}>
                    <div style={{
                        width: cellW, height: cellH, transform: `scale(${scale})`, transformOrigin: 'top left',
                        backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'auto',
                        backgroundPosition: `${-col * cellW}px ${-row * cellH}px`, imageRendering: 'pixelated',
                    }} />
                </div>
            </div>
        </div>
    );
}

export default function DialogueBox({
    portraitUrl, portraitCrop, portraitCellW, portraitCellH, portraitRow, portraitCol, text, onClick,
}) {
    return (
        <>
            <style>{`@font-face { font-family: 'HabboPixel'; src: url('${habboFontUrl}') format('truetype'); }`}</style>
            <div onClick={onClick} style={{
                display: 'flex', alignItems: 'stretch', height: PORTRAIT_SIZE,
                background: 'var(--panel-bg)', border: '3px solid var(--text-primary)', borderRadius: 0,
                cursor: onClick ? 'pointer' : 'default', imageRendering: 'pixelated',
            }}>
                <SpeakerPortrait url={portraitUrl} crop={portraitCrop} cellW={portraitCellW} cellH={portraitCellH} row={portraitRow} col={portraitCol} />
                <div style={{ width: TEXT_WIDTH, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                    <span style={{ fontFamily: 'HabboPixel, monospace', fontSize: 18, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                        {text}
                    </span>
                </div>
            </div>
        </>
    );
}
