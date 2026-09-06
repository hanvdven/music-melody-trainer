import React, { useState, useEffect } from 'react';
import bitfantasyFontUrl from '../../assets/fonts/pixel_fonts/Bitfantasy.ttf';
// #weather (Han 2026-09-04, "Gebruik SandyForest als tekst ... Bitfantasy in de tekstvakken voor
// benadrukte woorden"): the dialogue body + name plate now render in SandyForest; Bitfantasy is kept
// only for *asterisk-wrapped* emphasis runs (OscillatingText.parseEmphasis).
import sandyForestFontUrl from '../../assets/fonts/pixel_fonts/SandyForest.ttf';
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
// #922 (Han 2026-08-12): the ENTIRE box (portrait + text + font) scales uniformly by one factor off the
// #693-round-3 base sizes (64×64 portrait, 256-wide text) so nothing drifts out of proportion.
// #UI-overhaul (Han 2026-08-27, "voelt alsof de conv box een andere schaal heeft. zou 64 hoog en 256
// breed moeten zijn"): the scale and the text column width are now PROPS. In world mode
// `RpgLevelBottomPanel` passes `scale = N` (the world's integer level scale) and a narrower `textCols`
// so the whole box is exactly 64 game px tall and fits the 256-game-px content block. `DIALOGUE_SCALE`
// (2.5) stays the default for the level-result caller, which sizes to a much bigger panel.
export const DIALOGUE_SCALE = 2.5;
const BASE_PORTRAIT = 64;         // game px — the portrait column is always square, 64 native px
const BASE_TEXT_COLS = 256;       // game px — default text column width (level-result caller)

// #922 round 6/7: FONT_SIZE derived from Bitfantasy's real metrics (unitsPerEm 1024, cap-height 448
// units ≈ 8 native px) so a capital renders `8 · scale` px tall — the SAME per-native-pixel zoom as
// the portrait — then × 0.75 (Han's explicit "50% smaller, then 50% bigger" overrides).
const BITFANTASY_UNITS_PER_EM = 1024;
const BITFANTASY_CAP_HEIGHT_UNITS = 448;
const CAP_HEIGHT_NATIVE_PX = 8;
const FONT_SIZE_OVERRIDE_MULTIPLIER = 0.5 * 1.5;
const fontSizeFor = (scale) =>
    ((CAP_HEIGHT_NATIVE_PX * scale * BITFANTASY_UNITS_PER_EM) / BITFANTASY_CAP_HEIGHT_UNITS) * FONT_SIZE_OVERRIDE_MULTIPLIER;

// Crops (and, for a multi-frame/multi-row spritesheet, offsets to a specific `row`/`col` cell — default
// {0,0}, the sheet's first/idle frame) EXACTLY the way SheetRpgLayer/CharacterDoll already render sprites
// — the same `background-position` + inner-crop-then-scale technique, not a new one (§6d).
// #922 fix (Han 2026-08-12): `trueScale = box / 64`, independent of crop size (was per-crop, zooming
// different sprites by different factors). #922 round 2: bottom-center anchored (matching CreatureSprite),
// not center-center. #1088: a thin wrapper over the canonical CreatureSprite renderer with a real idle loop.
export function SpeakerPortrait({ variant, size, divider = true }) {
    const idleFrame = useIdleFrame();
    const anim = variant.animations?.find((a) => a.key === 'idle') || variant.animations?.[0] || { cells: [{ row: 0, col: 0 }] };
    return (
        <div style={{ position: 'relative', width: size, height: size, overflow: 'hidden', flexShrink: 0, borderRight: divider ? '3px solid var(--text-primary)' : undefined }}>
            <CreatureSprite variant={variant} anim={anim} frame={idleFrame} scale={size / 64} framed={false} />
            <Frame64Overlay box={size} />
        </div>
    );
}

// #922 (Han 2026-08-12): when an entity has its OWN dedicated portrait image (the Bestiary's `portraitUrl`
// + `portraitCell`/`portraitFrame`), show THAT instead of a cropped sprite frame, reusing the Bestiary's
// `PortraitImage` true-size/center/clip/white-backing convention (§6d).
function DedicatedPortrait({ url, cell, frame, size, divider = true }) {
    const trueScale = size / 64;
    return (
        <div style={{ position: 'relative', width: size, height: size, overflow: 'hidden', flexShrink: 0, borderRight: divider ? '3px solid var(--text-primary)' : undefined }}>
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

// #922 (Han 2026-08-12, "zet rechts van de tekstbox een toggler (in pixel art stijl): auto-continue"): a
// small pixel-art switch, matching the dialogue box's own chrome. Rendered as a sibling to the box, not
// inside it. #UI-overhaul (Han 2026-08-27): only shown when `onToggleAutoContinue` is passed — the world
// conversation box now omits it ("haal AUTO off weg van de conv box").
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

// #922 (Han 2026-08-12, "ik wil wel het driehoekje"): the classic "more text below" indicator, bouncing.
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
    // #weather (Han 2026-09-04, "je ziet de naam (linksboven tekstvak)"): an optional speaker name plate,
    // a standalone pixel-art tab overhanging the box's top-left corner — classic JRPG. Same chrome as the
    // box (square, `var(--text-primary)` border on `var(--panel-bg)`), Bitfantasy font. Callers that don't
    // pass it (LevelSplash) get no plate.
    speakerName = null,
    scale = DIALOGUE_SCALE,
    textCols = BASE_TEXT_COLS,
    // #UI-overhaul (Han 2026-08-27): compact mode — the box is EXACTLY `(64 + textCols) · scale` wide
    // and the frame is drawn as an inset box-shadow (zero layout cost) instead of a border that adds
    // to the width. The text column keeps `4 · scale` game-px of INTERNAL padding (Han 2026-08-28:
    // "voeg 4 gpx interne marge toe") via `box-sizing: border-box`, so the box stays the same size.
    // The default (level-result caller) keeps its 3px border + 14px text pad.
    compact = false,
}) {
    const portraitSize = BASE_PORTRAIT * scale;
    const textWidth = textCols * scale;
    const fontSize = fontSizeFor(scale);
    return (
        <>
            <style>{`
                @font-face { font-family: 'Bitfantasy'; src: url('${bitfantasyFontUrl}') format('truetype'); }
                @font-face { font-family: 'SandyForest'; src: url('${sandyForestFontUrl}') format('truetype'); }
                @keyframes dialogue-more-pages-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
            `}</style>
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                {/* Name plate — a tab centred over the portrait column, sitting ON the box's top edge
                    (bottom border dropped so it reads as attached). A flow sibling (not absolutely
                    positioned) so the bottom panel's `overflow: hidden` in compact/world mode can never
                    clip it; `translateX(-50%)` off the portrait's centre keeps it centred at ANY width.
                    Font: the name is ALWAYS Bitfantasy (Han 2026-09-04, "naam is altijd BF"), at the SAME
                    `fontSize` as the body — so name and body letters are the same size and the plate is
                    pixel-perfect (`fontSizeFor` is built so a Bitfantasy capital is `8·scale` px = a whole
                    number of screen px at every real scale, integer or the 1.5 half-step). `minWidth:
                    portraitSize` keeps it "even breed als het portret (64px)" as a floor; it only grows
                    past that for a long name (Prosperus / Modulatus), staying centred. */}
                {speakerName && (
                    <div style={{
                        marginLeft: portraitSize / 2, transform: 'translateX(-50%)',
                        minWidth: portraitSize, width: 'fit-content', boxSizing: 'border-box',
                        background: 'var(--panel-bg)', color: 'var(--text-primary)',
                        border: '3px solid var(--text-primary)', borderBottom: 'none',
                        fontFamily: 'Bitfantasy, monospace', fontSize, lineHeight: 1,
                        padding: `${2 * scale}px ${3 * scale}px`, textAlign: 'center',
                        whiteSpace: 'nowrap', imageRendering: 'pixelated', pointerEvents: 'none',
                    }}>
                        {speakerName.charAt(0).toUpperCase() + speakerName.slice(1)}
                    </div>
                )}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
                    <div onClick={onClick} style={{
                        display: 'flex', alignItems: 'stretch', height: portraitSize,
                        background: 'var(--panel-bg)', borderRadius: 0,
                        ...(compact
                            ? { boxShadow: 'inset 0 0 0 3px var(--text-primary)' }
                            : { border: '3px solid var(--text-primary)' }),
                        cursor: onClick ? 'pointer' : 'default', imageRendering: 'pixelated',
                    }}>
                        {dedicatedPortraitUrl
                            ? <DedicatedPortrait url={dedicatedPortraitUrl} cell={dedicatedPortraitCell} frame={dedicatedPortraitFrame} size={portraitSize} divider={!compact} />
                            : <SpeakerPortrait variant={portraitVariant} size={portraitSize} divider={!compact} />}
                        <div style={{ position: 'relative', width: textWidth, boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: compact ? `${4 * scale}px` : `0 ${7 * scale}px`, overflow: 'hidden' }}>
                            <OscillatingText
                                text={text} scale={scale}
                                style={{ fontFamily: 'SandyForest, monospace', fontSize, lineHeight: 0.92, color: 'var(--text-primary)' }}
                            />
                            {hasMorePages && <MorePagesIndicator />}
                        </div>
                    </div>
                    {onToggleAutoContinue && <AutoContinueToggle on={autoContinue} onToggle={onToggleAutoContinue} />}
                </div>
            </div>
        </>
    );
}
