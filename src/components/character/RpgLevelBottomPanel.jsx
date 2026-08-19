import React, { useMemo } from 'react';
import { PET_CROP } from './CharacterDoll';
import DialogueBox from './DialogueBox';
import useConversationDialogue from '../../hooks/useConversationDialogue';
import { WORLD_BPM, WORLD_TIME_SIGNATURE } from '../../audio/worldClock';
import { SLIME_CROP, SLIME_FRAME, SLIME_COLORS, SLIME_IDLE } from '../../model/enemyAssets';
import { findVariantByUrl } from '../../model/bestiaryAssets';
// #955 (boot-slowness initiative, Han 2026-08-13): this file moved to public/ASSORTED (a plain
// static-file server, not part of Vite's module graph) — a static `import` is no longer possible;
// public/ URLs are just fixed strings, fetched only when the browser actually renders the <img>.
const wispUrl = '/ASSORTED/characters/animals/pets/Pet companion/Wisp.png';
// #1088 (Han 2026-08-19, "gebruik de unit zelf, met idle animatie"): DialogueBox's SpeakerPortrait now
// takes a bestiary-variant-shaped object (frame/crop/url/animations) and feeds it straight to the
// canonical `CreatureSprite` renderer (§6d) for a real idle loop, replacing the old static single-cell
// crop. The slime fallback reuses SLIME_IDLE (enemyAssets.js) the same way App.jsx's level-result portrait
// does (§6c, one shared construction, not two).
const SLIME_PORTRAIT_VARIANT = {
    url: SLIME_COLORS.green, crop: SLIME_CROP, frame: SLIME_FRAME,
    animations: [{ key: 'idle', cells: Array.from({ length: SLIME_IDLE.frames }, (_, i) => ({ row: SLIME_IDLE.row, col: i })) }],
};

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
// #1088: the Wisp's variant is looked up from the bestiary by its own URL (findVariantByUrl, the SAME
// match CharacterDoll's PetLayer already uses for the equipped-pet preview, §6c) so it gets its REAL idle
// animation; falls back to a static single-frame shape (identical to the old hard-coded behaviour) only
// if the wisp sheet somehow isn't in the scanned bestiary.
const WISP_FALLBACK_VARIANT = { url: wispUrl, crop: PET_CROP, frame: { w: 32, h: 32 }, animations: [{ key: 'idle', cells: [{ row: 0, col: 0 }] }] };

// #924 round 4 (Han: "alles op een klok geldt ook voor de tekst... Is die uberhaupt hetzelfde tempo..?"):
// the wisp/slime conversation is open-world chrome, not tied to whatever song/level the user last played —
// it now ALWAYS runs at WORLD_BPM/WORLD_TIME_SIGNATURE (worldClock.js), the same fixed tempo the ambient
// music, bird songs, and debug metronome all share, instead of the app's live (and irrelevant here) song
// bpm that used to be threaded down from TabView/App.jsx.
export default function RpgLevelBottomPanel({ rpgLevel, context, getConversationProfile }) {
    const { dialogue, closeDialogue, autoContinue, toggleAutoContinue } = rpgLevel;
    const profile = dialogue ? getConversationProfile(dialogue.entity) : null;
    const { visibleText, hasNextPage, handleTextClick } = useConversationDialogue({
        pages: dialogue?.pages, active: !!dialogue, context, bpm: WORLD_BPM, timeSignature: WORLD_TIME_SIGNATURE,
        profile, autoContinue, onClosed: closeDialogue,
    });
    const wispVariant = useMemo(() => findVariantByUrl(wispUrl), []);

    if (!dialogue) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13 }}>
                Loop naar de Whisp of de Slime en klik erop.
            </div>
        );
    }
    const portraitVariant = dialogue.entity === 'wisp'
        ? (wispVariant || WISP_FALLBACK_VARIANT)
        : SLIME_PORTRAIT_VARIANT;
    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <DialogueBox
                portraitVariant={portraitVariant}
                text={visibleText}
                onClick={handleTextClick}
                autoContinue={autoContinue} onToggleAutoContinue={toggleAutoContinue}
                hasMorePages={hasNextPage}
            />
        </div>
    );
}
