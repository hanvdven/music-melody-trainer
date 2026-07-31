import React, { useState, useMemo, useEffect, useCallback } from 'react';
import './CharacterCreator.css';
import { CATEGORIES, ANIMATIONS, BODY_FRAME, frameOf, basesFor, urlOfLayer, variantColor, counterpart, earForSkin } from '../../model/characterAssets';
import { loadCharacter, saveCharacter, emptyCharacter } from '../../model/characterProfile';

// #645 POC character creator (v2, Han). LEFT: live paper-doll (layers stacked in z-order, one sprite frame
// each, idle-animated). RIGHT: gender + name + birthday + level, category tabs, base-item grid (+ a colour/
// material variant setter when a base has variants) with an M/F watermark on wrong-gender items so their
// interchangeability can be eyeballed. Rendered at NATIVE sprite size + `transform: scale`, so a sheet's
// width never distorts it (fixes the ear drift). Saved to localStorage across sessions.

const SCALE = 6;                    // preview zoom (80x64 * 6)
const PET_OFFSET = { x: 40, y: 24 };   // pet beside the hero (native px; the doll flip mirrors it to the side)
const PET_COLS = 4, EFFECT_COLS = 5;   // frames in the pet/effect row-0 loops (own sheets)

// backgroundPosition for one frame: col from the animation, row from the animation. Pet/effect keep their
// own single-row loops (their sheets don't share the 7-row body layout).
const layerStyle = (url, cat, frame, anim) => {
    const f = frameOf(cat);
    let col = frame % anim.frames, row = anim.row;
    if (cat === 'pet') { col = frame % PET_COLS; row = 0; }
    else if (cat === 'effect') { col = frame % EFFECT_COLS; row = 0; }
    return {
        position: 'absolute',
        left: cat === 'pet' ? PET_OFFSET.x : 0,
        top: cat === 'pet' ? PET_OFFSET.y : 0,
        width: f.w,
        height: f.h,
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-col * f.w}px ${-row * f.h}px`,
        backgroundSize: 'auto',           // NATIVE sheet size → step works for any sheet width
        imageRendering: 'pixelated',
        // Extra flip so the pet faces the SAME way (right) as the char inside the flipped doll.
        transform: cat === 'pet' ? 'scaleX(-1)' : undefined,
        transformOrigin: 'center',
    };
};

// A cropped thumbnail (frame 0) of one part. `mult` scales it (1 = grid; ~0.55 = the small equipment slot).
// scaleX(-1) → faces RIGHT like the preview (Han). Fit-not-crop zoom so an item's top/bottom isn't cut.
const thumbStyle = (url, cat, mult = 1) => {
    const f = frameOf(cat);
    const base = (cat === 'pet' ? 1.8 : 1.1) * mult;
    return {
        width: f.w, height: f.h,
        backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
        backgroundPosition: '0 0', backgroundSize: 'auto', imageRendering: 'pixelated',
        transform: `scale(${-base}, ${base})`,
    };
};

export default function CharacterCreator({ onClose }) {
    const [char, setChar] = useState(loadCharacter);
    const [activeCat, setActiveCat] = useState('skin');
    const [saved, setSaved] = useState(false);
    const [frame, setFrame] = useState(0);
    const [animKey, setAnimKey] = useState('rest');   // Han: buttons for rest/walk/attack/death/…
    const anim = ANIMATIONS.find((a) => a.key === animKey) || ANIMATIONS[0];
    useEffect(() => {
        setFrame(0);
        const id = setInterval(() => setFrame((f) => (f + 1) % anim.frames), 150);
        return () => clearInterval(id);
    }, [anim.frames, animKey]);

    const gender = char.gender;
    const bases = useMemo(() => basesFor(activeCat, gender), [activeCat, gender]);
    const zOrder = useMemo(() => [...CATEGORIES].sort((a, b) => a.z - b.z), []);

    const setLayer = (cat, layer) => { setChar((c) => ({ ...c, layers: { ...c.layers, [cat]: layer } })); setSaved(false); };
    const patch = (p) => { setChar((c) => ({ ...c, ...p })); setSaved(false); };

    // skin is required — default it (to the current gender's first skin) whenever it is missing/mismatched.
    const ensureSkin = useCallback((g, layers) => {
        const cur = layers.skin;
        if (cur && cur.g === g) return layers;
        const first = basesFor('skin', g)[0]?.variants[0];
        return first ? { ...layers, skin: { g: first.g, name: first.name } } : layers;
    }, []);
    useEffect(() => { setChar((c) => ({ ...c, layers: ensureSkin(c.gender, c.layers) })); }, [ensureSkin]);

    // Han: force the ears to match the skin tone (Elven Ears{N} ↔ Skin{N}) whenever skin/gender changes.
    useEffect(() => {
        setChar((c) => {
            if (!c.layers.ears) return c;
            const t = earForSkin(c.gender, c.layers.skin?.name);
            return t && t.name !== c.layers.ears.name ? { ...c, layers: { ...c.layers, ears: t } } : c;
        });
    }, [char.layers.skin, char.gender]);

    // Swap gender AND keep the same outfit where a counterpart exists (Han); skin re-defaults to the gender.
    const setGender = (g) => setChar((c) => {
        const layers = {};
        for (const [cat, layer] of Object.entries(c.layers)) {
            const cp = counterpart(cat, layer, g);
            layers[cat] = cp || layer;   // no counterpart → keep the old (shown watermarked)
        }
        return { ...c, gender: g, layers: ensureSkin(g, layers) };
    });

    const selected = char.layers[activeCat];   // { g, name } | null
    const activeBase = bases.find((b) => b.variants.some((v) => v.name === selected?.name && v.g === selected?.g));

    const pickBase = (b) => {
        // Ears always take the skin tone (Han); any ear pick resolves to the skin-matched ear.
        if (activeCat === 'ears') {
            const forced = earForSkin(gender, char.layers.skin?.name);
            if (forced) { setLayer('ears', forced); return; }
        }
        const plain = b.variants.find((v) => !v.variant) || b.variants[0];
        setLayer(activeCat, { g: plain.g, name: plain.name });
    };

    const randomize = () => {
        const layers = {};
        for (const c of CATEGORIES) {
            const bs = basesFor(c.key, gender).filter((b) => !b.mismatch);
            if (!bs.length) continue;
            if (c.required || Math.random() < 0.5) {
                const b = bs[Math.floor(Math.random() * bs.length)];
                const v = b.variants[Math.floor(Math.random() * b.variants.length)];
                layers[c.key] = { g: v.g, name: v.name };
            }
        }
        setChar((c) => ({ ...c, layers: ensureSkin(c.gender, layers) }));
        setSaved(false);
    };

    const onSave = () => { saveCharacter(char); setSaved(true); };
    const reset = () => setChar((c) => ({ ...emptyCharacter(), gender: c.gender, layers: ensureSkin(c.gender, {}) }));

    return (
        <div className="cc-overlay" onClick={onClose}>
            <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
                <button className="cc-close" onClick={onClose} aria-label="Close">✕</button>

                {/* LEFT — live paper-doll. scaleX(-1) → faces RIGHT (Han). */}
                <div className="cc-preview">
                    <div className="cc-doll" style={{ width: BODY_FRAME.w * SCALE, height: BODY_FRAME.h * SCALE }}>
                        <div style={{ width: BODY_FRAME.w, height: BODY_FRAME.h, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
                            <div style={{ position: 'absolute', inset: 0, transform: 'scaleX(-1)' }}>
                                {zOrder.map((c) => {
                                    const url = urlOfLayer(c.key, char.layers[c.key]);
                                    return url ? <div key={c.key} style={layerStyle(url, c.key, frame, anim)} /> : null;
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="cc-level">LVL {char.level}</div>
                    {/* animation picker (Han): rest / walk / run / attack / … / death */}
                    <div className="cc-anims">
                        {ANIMATIONS.map((a) => (
                            <button key={a.key} className={`cc-anim${animKey === a.key ? ' active' : ''}`}
                                onClick={() => setAnimKey(a.key)}>{a.label}</button>
                        ))}
                    </div>
                </div>

                {/* RIGHT — controls */}
                <div className="cc-controls">
                    <div className="cc-identity">
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
                    </div>

                    {/* Diablo-style EQUIPMENT SLOTS (Han): each slot shows the equipped item; click to edit it. */}
                    <div className="cc-slots">
                        {CATEGORIES.map((c) => {
                            const url = urlOfLayer(c.key, char.layers[c.key]);
                            return (
                                <button key={c.key} title={c.label}
                                    className={`cc-slot${activeCat === c.key ? ' active' : ''}${url ? ' filled' : ''}`}
                                    onClick={() => setActiveCat(c.key)}>
                                    {url ? <div className="cc-slot-icon" style={thumbStyle(url, c.key, 0.55)} /> : null}
                                    <span className="cc-slot-label">{c.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* variant setter — a COLOUR swatch per colour/material variant (Han: a colour, not text) */}
                    {activeBase && activeBase.variants.length > 1 && (
                        <div className="cc-variants">
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

                    {/* base-item grid */}
                    <div className="cc-grid">
                        {!catByRequired(activeCat) && (
                            <button className={`cc-thumb cc-none${!selected ? ' active' : ''}`}
                                onClick={() => setLayer(activeCat, null)} title="None">∅</button>
                        )}
                        {bases.map((b) => {
                            const rep = b.variants.find((v) => !v.variant) || b.variants[0];
                            const isActive = activeBase && activeBase.id === b.id;
                            return (
                                <button key={b.id} title={b.base}
                                    className={`cc-thumb${isActive ? ' active' : ''}`} onClick={() => pickBase(b)}>
                                    <div style={thumbStyle(rep.url, activeCat)} />
                                </button>
                            );
                        })}
                    </div>

                    <div className="cc-actions">
                        <button className="cc-btn" onClick={randomize}>🎲 Random</button>
                        <button className="cc-btn" onClick={reset}>Reset</button>
                        <button className="cc-btn cc-save" onClick={onSave}>{saved ? '✓ Saved' : 'Save'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const catByRequired = (key) => CATEGORIES.find((c) => c.key === key)?.required;
