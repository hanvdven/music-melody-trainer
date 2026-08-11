import React from 'react';
import { PET_CROP } from './CharacterDoll';
import DialogueBox from './DialogueBox';
import wispUrl from '../../assets/ASSORTED/characters/animals/pets/GandalfHardcore Pet companion/GandalfHardcore Wisp.png';

// #693 (Han 2026-08-04, RPG Level tab, "Zet de whisp NPC neer. Als ik daarop klik loopt personage erheen, en
// verschijnt een pixel art tekstballon met pixel font: 'Hello there!' Tekstballon mag in bottom view"): the
// dialogue half of `useRpgLevelState` (App.jsx owns the one shared instance, also passed to RpgLevelPanel
// for the NPC/click-to-walk side) — rendered in the BOTTOM area, not floating over the scene, per Han's
// explicit placement.
// #864 (Han 2026-08-10): the dialogue-box CHROME itself (64px frame, portrait, 256px text column) moved to
// the shared `DialogueBox.jsx` — a second caller (LevelSplash) needed the exact same box, not a hand-rolled
// copy (§6d). This file now only supplies the Wisp-specific portrait (PET_CROP, wispUrl) and dialogue text.
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
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <DialogueBox portraitUrl={wispUrl} portraitCrop={PET_CROP} text={dialogue.text} onClick={closeDialogue} />
        </div>
    );
}
