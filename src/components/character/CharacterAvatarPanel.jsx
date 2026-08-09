import React from 'react';
import CharacterDoll from './CharacterDoll';
import { CreatureSprite, Frame64Overlay } from './BestiaryPanels';
import { findVariantByUrl, findIdleAnim } from '../../model/bestiaryAssets';
import { CATEGORIES, urlOfLayer, CATEGORY_ICON } from '../../model/characterAssets';
import { AVATAR_H, GRID, checker, thumbStyle } from './characterEditorShared';

// #790 (Han 2026-08-09, "zorg in de avatar view en equipment view de 'pet' ook uit de bestiary komt (de
// animatie en pixelhoogte komen nu niet goed overeen met de spritesheet)"): the equipment-grid slot icon
// used `thumbStyle`'s fixed `PET_CROP` (26×28, assumed same for every pet sheet) same as every other
// equipment category — wrong for a pet whose actual bestiary crop differs (exactly the clipping bug
// `RpgLevelPanel`'s `WorldPet`→`WorldCreature` migration fixed for the RPG level, §693 round 12, never
// applied here). Routes through the SAME `findVariantByUrl`/`CreatureSprite` lookup as the persona-preview
// pet (CharacterDoll's `PetLayer`) instead — a 2nd hand-tuned crop for the same creature (§6c). Falls back
// to the old `thumbStyle` box only if the equipped sheet has no bestiary match.
function PetSlotIcon({ url }) {
    const variant = findVariantByUrl(url);
    if (!variant) return <div className="cc-slot-icon" style={thumbStyle(url, 'pet', 1.7)} />;
    const scale = 1.7;
    return (
        <div className="cc-slot-icon" style={{ position: 'relative', width: variant.crop.w * scale, height: variant.crop.h * scale }}>
            <CreatureSprite variant={variant} anim={findIdleAnim(variant)} frame={0} scale={scale} framed={false} />
        </div>
    );
}

// #667 (Han 2026-08-03, "geen popup meer — geïntegreerd in sheet music/bottom view"): the TOP-of-screen
// content for the 'character' and 'equipment' avatar-context screens — renders where <SheetMusic> normally
// renders. 'character' shows just the avatar (skin/ears/hair are picked via CharacterOptionsPanel's category
// tabs below); 'equipment' ALSO shows the 4×3 equipment-slot grid (Han's other 10 categories), each slot
// clickable to make it the active category for the picker below — same as the old popup's `.cc-body`.
export default function CharacterAvatarPanel({ editor, screen, debugMode = false }) {
    const { char, anim, frame, activeCat, setActiveCat } = editor;

    // #664: fullFrame shows the whole 80×64 frame (nothing clipped) + the red reference box.
    const doll = <CharacterDoll char={char} anim={anim} frame={frame} height={AVATAR_H} fullFrame />;

    return (
        <div className={checker('cc-body', debugMode)}>
            <button className={checker(`cc-avatar${activeCat === 'skin' ? ' active' : ''}`, debugMode)}
                title="Skin" onClick={() => setActiveCat('skin')}>
                {/* #790 (Han 2026-08-09, "give the persona a 64x64 frame, same style as the other bestiary
                    assets"): the SAME decorative pixel-art border every bestiary portrait/creature box
                    uses (§6d) — rendered first so it paints behind the doll, matching that convention. */}
                <Frame64Overlay box={AVATAR_H} />
                {doll}
            </button>
            {screen === 'equipment' && (
                <div className="cc-equip">
                    {GRID.map((key) => {
                        const c = CATEGORIES.find((x) => x.key === key);
                        const url = urlOfLayer(key, char.layers[key]);
                        const icon = CATEGORY_ICON[key];
                        return (
                            <button key={key} title={c.label}
                                className={checker(`cc-slot${activeCat === key ? ' active' : ''}${url ? ' filled' : ''}`, debugMode)}
                                onClick={() => setActiveCat(key)}>
                                {icon && <img className="cc-slot-typeicon" src={icon} alt=""
                                    style={{ opacity: url ? 0.28 : 0.8 }} />}
                                {url ? (key === 'pet' ? <PetSlotIcon url={url} /> : <div className="cc-slot-icon" style={thumbStyle(url, key, 1.7)} />) : null}
                                <span className="cc-slot-label">{c.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
