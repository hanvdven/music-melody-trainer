import React from 'react';
import { PET_CROP } from './CharacterDoll';
import DialogueBox from './DialogueBox';
import useConversationDialogue from '../../hooks/useConversationDialogue';
import { SLIME_CROP, SLIME_FRAME, SLIME_COLORS } from '../../model/enemyAssets';
import wispUrl from '../../assets/ASSORTED/characters/animals/pets/GandalfHardcore Pet companion/GandalfHardcore Wisp.png';

// #693/#864 (Han 2026-08-04 → 2026-08-10): the pixel-art dialogue box originally built for the RPG-world
// Wisp NPC (RpgLevelBottomPanel.jsx), extracted into a reusable component so a second caller (LevelSplash
// — the level-complete panel, "beneden een dialoogveld, zoals de wisp heeft") gets the EXACT same box,
// not a hand-rolled second copy (§6d). Only the portrait's sprite (url/crop/cell size/frame) and the text
// vary per caller — the frame chrome (square corners, proportional columns) is fixed.
//
// #922 (Han 2026-08-12, "conversation system"): the dialogue text is now revealed character-by-character
// with a musical "typewriter" (useConversationDialogue, orchestrating #923's tempo-scaled clickMs, the
// entity's own instrument+tone pool, the world-clock start-of-beat sync, and an own soft metronome click).
// #922 follow-up ("ik wou de lorem ipsum op de slime van de RPG-wereld"): this panel now speaks for TWO
// possible open-world speakers (`dialogue.entity`) — the Wisp, and the open-world decorative Slime.
const SPEAKER_PORTRAIT_BY_ENTITY = {
    wisp: { url: wispUrl, crop: PET_CROP },
    slime: { url: SLIME_COLORS.green, crop: SLIME_CROP, cellW: SLIME_FRAME.w, cellH: SLIME_FRAME.h },
};

export default function RpgLevelBottomPanel({ rpgLevel, context, bpm, timeSignature, instruments, getConversationProfile }) {
    const { dialogue, closeDialogue, autoContinue, toggleAutoContinue } = rpgLevel;
    const profile = dialogue ? getConversationProfile(dialogue.entity) : null;
    const { visibleText, hasNextPage, handleTextClick } = useConversationDialogue({
        pages: dialogue?.pages, active: !!dialogue, context, bpm, timeSignature, profile,
        metronomeInstrument: instruments?.metronome, autoContinue, onClosed: closeDialogue,
    });

    if (!dialogue) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13 }}>
                Loop naar de Whisp of de Slime en klik erop.
            </div>
        );
    }
    const portrait = SPEAKER_PORTRAIT_BY_ENTITY[dialogue.entity] || SPEAKER_PORTRAIT_BY_ENTITY.slime;
    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <DialogueBox
                portraitUrl={portrait.url} portraitCrop={portrait.crop}
                portraitCellW={portrait.cellW} portraitCellH={portrait.cellH}
                text={visibleText}
                onClick={handleTextClick}
                autoContinue={autoContinue} onToggleAutoContinue={toggleAutoContinue}
                hasMorePages={hasNextPage}
            />
        </div>
    );
}
