import React from 'react';
import { ANIMATIONS, CATEGORIES, variantColor, skinSwatchColor, earForSkin } from '../../model/characterAssets';
import { checker, thumbStyle, catByKeyLabel, catByRequired } from './characterEditorShared';
import { CreatureSprite } from './BestiaryPanels';
import { findVariantByUrl, findIdleAnim } from '../../model/bestiaryAssets';

// #790 (Han 2026-08-09, "zorg in de avatar view en equipment view de 'pet' ook uit de bestiary komt"): the
// pet-PICKER grid (below, `activeCat === 'pet'`) used the same generic `thumbStyle` every other equipment
// category uses — wrong for pets for the same reason `CharacterAvatarPanel`'s slot preview was (fixed
// alongside this, same ticket): a pet's real crop varies per creature, `thumbStyle`'s `PET_CROP` assumes one
// fixed size for all of them. Routes through the SAME `findVariantByUrl`/`CreatureSprite` lookup (§6c).
function PetThumb({ url }) {
    const variant = findVariantByUrl(url);
    if (!variant) return <div style={thumbStyle(url, 'pet')} />;
    const scale = 1.6;
    return (
        <div style={{ position: 'relative', width: variant.crop.w * scale, height: variant.crop.h * scale }}>
            <CreatureSprite variant={variant} anim={findIdleAnim(variant)} frame={0} scale={scale} framed={false} />
        </div>
    );
}

// #667 (Han 2026-08-03): the BOTTOM-of-screen content for the 'character' and 'equipment' avatar-context
// screens — renders where the piano/bottom panel normally renders (Han: "item opties en kleuren staan in de
// bottom view ... alles behalve avatar+equipment-slots zelf verhuist naar bottom, incl. identity/acties").
// #679 (Han 2026-08-03, "verplaats de navigatieknopjes naar de regel boven de bottom view"): the category
// tab row (skin/ears/hair for 'character'; the slot grid up top already does this for 'equipment') moved OUT
// of this panel into AvatarSubHeader — this component now only renders the picker CONTENT for whichever
// category is already active (owned by `editor.activeCat`, set from the header row now).
export default function CharacterOptionsPanel({ editor, debugMode = false }) {
    const {
        char, gender, activeCat, selected, activeBase, bases,
        setLayer, patch, pickBase, randomize, reset, onSave, saved, setGender, animKey, setAnimKey, anim,
    } = editor;

    // #667 (Han 2026-08-03): "skin: color palette (geen equipment preview)" — the 10 skin sprites have no
    // colour-variant data of their own, so each option is shown as a hand-picked representative swatch
    // (skinSwatchColor) instead of a cropped body thumbnail.
    const isSkin = activeCat === 'skin';
    // #667: "ears: normal / long (toggler)" — the only ear asset is a skin-matched "Elven Ears" overlay
    // (earForSkin), so there is no real style CHOICE to grid-pick — just on/off. "Long" resolves to the
    // skin-matched ear (falling back to the first available one for non-numbered skins like Zombie/Orc,
    // which earForSkin can't match); "Normal" is simply no ears layer (the ∅ option, same as before).
    const isEars = activeCat === 'ears';
    const pickEarsLong = () => {
        const forced = earForSkin(gender, char.layers.skin?.name);
        if (forced) { setLayer('ears', forced); return; }
        const fallback = bases[0]?.variants?.[0];
        if (fallback) setLayer('ears', { g: fallback.g, name: fallback.name });
    };

    return (
        // #679 (Han: "centreer de elementen in bottom view") — `align-items: center` centers every row as a
        // block; the genuinely full-width rows (identity, item grid, actions) opt back OUT via their own
        // `alignSelf: 'stretch'` below so the grid still fills the panel instead of shrinking to content.
        <div className="cc-picker" style={{
            width: '100%', height: '100%', overflowY: 'auto', padding: '12px', alignItems: 'center',
        }}>
            <div className="cc-identity" style={{ alignSelf: 'stretch' }}>
                <div className="cc-gender">
                    {['male', 'female'].map((g) => (
                        <button key={g} className={`cc-gender-btn${gender === g ? ' active' : ''}`}
                            onClick={() => setGender(g)}>{g === 'male' ? '♂' : '♀'}</button>
                    ))}
                </div>
                <input className="cc-input" placeholder="name" value={char.name}
                    onChange={(e) => patch({ name: e.target.value })} maxLength={24} />
                <input className="cc-input cc-date" type="date" value={char.birthday}
                    onChange={(e) => patch({ birthday: e.target.value })} />
                <span className="cc-level">LVL {char.level}</span>
            </div>

            <div className="cc-anims">
                {ANIMATIONS.map((a) => (
                    <button key={a.key} className={`cc-anim${animKey === a.key ? ' active' : ''}`}
                        onClick={() => setAnimKey(a.key)}>{a.label}</button>
                ))}
            </div>

            <div className="cc-picker-head">{catByKeyLabel(activeCat, CATEGORIES)}</div>
            {isSkin ? (
                <div className="cc-variants" style={{ justifyContent: 'center' }}>
                    {bases.map((b) => {
                        const isActive = activeBase && activeBase.id === b.id;
                        return (
                            <button key={b.id} title={b.base}
                                className={`cc-swatch${isActive ? ' active' : ''}`}
                                onClick={() => pickBase(b)}
                                style={{ background: skinSwatchColor(b.base) }} />
                        );
                    })}
                </div>
            ) : isEars ? (
                // #679 (Han: item toggle knopjes moeten duidelijk verschillen van animatieknopjes) —
                // segmented on/off pair, NOT `.cc-anim`/`.cc-tab` (those read as navigation/animation).
                <div className="cc-toggle-group">
                    <button className={`cc-toggle${!selected ? ' active' : ''}`}
                        onClick={() => setLayer('ears', null)}>Normal</button>
                    <button className={`cc-toggle${selected ? ' active' : ''}`}
                        onClick={pickEarsLong}>Long</button>
                </div>
            ) : (
                <>
                    <div className={checker('cc-grid', debugMode)} style={{ justifyContent: 'center', alignSelf: 'stretch' }}>
                        {!catByRequired(activeCat, CATEGORIES) && (
                            <button className={checker(`cc-thumb cc-none${!selected ? ' active' : ''}`, debugMode)}
                                onClick={() => setLayer(activeCat, null)} title="None">∅</button>
                        )}
                        {bases.map((b) => {
                            const rep = b.variants.find((v) => !v.variant) || b.variants[0];
                            const isActive = activeBase && activeBase.id === b.id;
                            return (
                                <button key={b.id} title={b.base}
                                    className={checker(`cc-thumb${isActive ? ' active' : ''}`, debugMode)} onClick={() => pickBase(b)}>
                                    {activeCat === 'pet' ? <PetThumb url={rep.url} /> : <div style={thumbStyle(rep.url, activeCat)} />}
                                </button>
                            );
                        })}
                    </div>
                    {/* #679 (Han: "plaats de kleurenvakjes ook onder de preview van het item... dus niet
                        boven"): the colour/material swatches for the selected item now render AFTER the
                        thumbnail grid (pick the item first, then refine its colour), not before it. */}
                    {activeBase && activeBase.variants.length > 1 && (
                        <div className="cc-variants" style={{ justifyContent: 'center' }}>
                            {activeBase.variants.map((v) => {
                                const col = variantColor(v.variant);
                                return (
                                    <button key={v.name} title={v.variant || 'plain'}
                                        className={`cc-swatch${selected?.name === v.name ? ' active' : ''}`}
                                        onClick={() => setLayer(activeCat, { g: v.g, name: v.name })}
                                        style={{ background: col || 'transparent' }}>
                                        {col ? '' : (v.variant || '•')}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <div className="cc-actions" style={{ alignSelf: 'stretch' }}>
                <button className="cc-btn" onClick={randomize}>🎲 Random</button>
                <button className="cc-btn" onClick={reset}>Reset</button>
                <button className="cc-btn cc-save" onClick={onSave}>{saved ? '✓ Saved' : 'Save'}</button>
            </div>
        </div>
    );
}
