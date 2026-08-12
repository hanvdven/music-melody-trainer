import React from 'react';
import { PET_CROP } from './CharacterDoll';
import DialogueBox from './DialogueBox';
import useConversationDialogue from '../../hooks/useConversationDialogue';
import wispUrl from '../../assets/ASSORTED/characters/animals/pets/GandalfHardcore Pet companion/GandalfHardcore Wisp.png';

// #693/#864 (Han 2026-08-04 → 2026-08-10): the pixel-art dialogue box originally built for the RPG-world
// Wisp NPC (RpgLevelBottomPanel.jsx), extracted into a reusable component so a second caller (LevelSplash
// — the level-complete panel, "beneden een dialoogveld, zoals de wisp heeft") gets the EXACT same box,
// not a hand-rolled second copy (§6d). Only the portrait's sprite (url/crop/cell size/frame) and the text
// vary per caller — the frame chrome (64px-tall box, square corners, 256px text column) is fixed.
// #693 round 3 spec (still authoritative): 64px-tall frame, portrait pinned to the left edge at exactly
// 64×64 (Han: "het linkervak moet 64x64 zijn"), square corners (no border-radius), text column a further
// 256px wide (Han: "het rechtervak met tekst moet 64 hoog en 256 breed, voor toepassing van scaling
// factor" — 256 is a clean power-of-2 multiple of the 32px pixel-art grid every sprite here is drawn on).
//
// #922 (Han 2026-08-12, "conversation system"): the dialogue text is now revealed character-by-character
// with a musical "typewriter" (useConversationDialogue, orchestrating #923's tempo-scaled clickMs, the
// entity's own instrument+octave, the world-clock start-of-measure sync, and an own soft metronome click).
export default function RpgLevelBottomPanel({ rpgLevel, context, bpm, timeSignature, instruments, getConversationProfile }) {
    const { dialogue, closeDialogue, autoContinue, toggleAutoContinue } = rpgLevel;
    const profile = dialogue ? getConversationProfile(dialogue.entity) : null;
    const { visibleText, handleTextClick } = useConversationDialogue({
        pages: dialogue?.pages, active: !!dialogue, context, bpm, timeSignature, profile,
        metronomeInstrument: instruments?.metronome, autoContinue, onClosed: closeDialogue,
    });

    if (!dialogue) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13 }}>
                Loop naar de Whisp en klik erop.
            </div>
        );
    }
    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <DialogueBox
                portraitUrl={wispUrl} portraitCrop={PET_CROP} text={visibleText}
                onClick={handleTextClick}
                autoContinue={autoContinue} onToggleAutoContinue={toggleAutoContinue}
            />
        </div>
    );
}
