import React from 'react';
import { PET_CROP } from './CharacterDoll';
import habboFontUrl from '../../assets/fonts/pixel_fonts/Habbo.ttf';
import wispUrl from '../../assets/ASSORTED/characters/animals/pets/GandalfHardcore Pet companion/GandalfHardcore Wisp.png';

// #693 (Han 2026-08-04, RPG Level tab, "Zet de whisp NPC neer. Als ik daarop klik loopt personage erheen, en
// verschijnt een pixel art tekstballon met pixel font: 'Hello there!' Tekstballon mag in bottom view"): the
// dialogue half of `useRpgLevelState` (App.jsx owns the one shared instance, also passed to RpgLevelPanel
// for the NPC/click-to-walk side) — rendered in the BOTTOM area, not floating over the scene, per Han's
// explicit placement. `Habbo.ttf` (already bundled under assets/fonts/pixel_fonts/, previously unused
// anywhere) is a plain, legible pixel-UI face — a reasonable pick among the ~40 pixel fonts shipped, flagged
// here as a first guess Han can swap via a follow-up if he had a specific one in mind.
// #693 round 3 ("maak een kader van 64 hoog, met links in het kader een avatar van het sprekende personage,
// dus nu de wisp. rechte hoeken, en breedte 256 exc de 64px portret"): 64px-tall frame, the SPEAKER's own
// portrait (currently always the Wisp — the only NPC that can start a dialogue) pinned to the left edge,
// square corners (no border-radius), text column a further 256px wide (320 total).
const PORTRAIT_SIZE = 64;
const TEXT_WIDTH = 256;

function SpeakerPortrait({ url }) {
    const scale = PORTRAIT_SIZE / PET_CROP.h;
    return (
        <div style={{ width: PORTRAIT_SIZE, height: PORTRAIT_SIZE, overflow: 'hidden', flexShrink: 0, borderRight: '3px solid var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: PET_CROP.w * scale, height: PET_CROP.h * scale, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: -PET_CROP.x * scale, top: -PET_CROP.y * scale, width: 32 * scale, height: 32 * scale, overflow: 'hidden' }}>
                    <div style={{
                        width: 32, height: 32, transform: `scale(${scale})`, transformOrigin: 'top left',
                        backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: 'auto',
                        backgroundPosition: '0px 0px', imageRendering: 'pixelated',
                    }} />
                </div>
            </div>
        </div>
    );
}

export default function RpgLevelBottomPanel({ rpgLevel }) {
    const { dialogue, closeDialogue } = rpgLevel;
    if (!dialogue) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13 }}>
                Loop naar de Whisp en klik erop.
            </div>
        );
    }
    return (
        <>
            <style>{`@font-face { font-family: 'HabboPixel'; src: url('${habboFontUrl}') format('truetype'); }`}</style>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div onClick={closeDialogue} style={{
                    display: 'flex', alignItems: 'stretch', height: PORTRAIT_SIZE,
                    background: 'var(--panel-bg)', border: '3px solid var(--text-primary)', borderRadius: 0,
                    cursor: 'pointer', imageRendering: 'pixelated',
                }}>
                    <SpeakerPortrait url={wispUrl} />
                    <div style={{ width: TEXT_WIDTH, display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                        <span style={{ fontFamily: 'HabboPixel, monospace', fontSize: 18, lineHeight: 1.4, color: 'var(--text-primary)' }}>
                            {dialogue.text}
                        </span>
                    </div>
                </div>
            </div>
        </>
    );
}
