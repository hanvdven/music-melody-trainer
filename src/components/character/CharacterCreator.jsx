import React, { useState, useMemo, useEffect, useCallback } from 'react';
import './CharacterCreator.css';
import { CATEGORIES, ANIMATIONS, BODY_FRAME, frameOf, basesFor, urlOfLayer, variantColor, counterpart, earForSkin, CATEGORY_ICON } from '../../model/characterAssets';
import { loadCharacter, saveCharacter, emptyCharacter } from '../../model/characterProfile';
import Bestiary from './Bestiary';

// #645 POC character creator (v2, Han). LEFT: live paper-doll (layers stacked in z-order, one sprite frame
// each, idle-animated). RIGHT: gender + name + birthday + level, category tabs, base-item grid (+ a colour/
// material variant setter when a base has variants) with an M/F watermark on wrong-gender items so their
// interchangeability can be eyeballed. Rendered at NATIVE sprite size + `transform: scale`, so a sheet's
// width never distorts it (fixes the ear drift). Saved to localStorage across sessions.

// CROP: the character body region within the 80x64 frame (measured x3..57 / y17..63). Rendering only this
// region removes the "suuuper veel lege ruimte" so the preview is much bigger. Centred on x40 so the flip
// keeps it centred. CHAR_DY / PET_DY are Han's pixel-perfect nudges (art px) to sit on the bottom edge.
const CROP = { x: 10, y: 6, w: 60, h: 58 };
const CHAR_DY = 1, PET_DY = 2;
const AVATAR_H = 336;              // avatar height; each equipment slot is ⅓ of it (Han)
// The 4×3 equipment grid, in Han's exact order (skin is the avatar itself, not a grid slot).
const GRID = ['ears', 'hair', 'head', 'back', 'effect', 'weapon', 'chest', 'offhand', 'pet', 'hands', 'legs', 'feet'];
const PET_OFFSET = { x: 40, y: 31 };
const EFFECT_COLS = 5;              // frames in the effect row-0 loop
// Pet sheets are 6x2 (32x32): row 0 = idle (5 frames), row 1 = run (6). Wisp is a single row (no run).
const PET_IDLE = 5, PET_RUN = 6;

// backgroundPosition for one frame: col + row from the animation. Pet plays its RUN row when the character
// walks/runs (Han); effects keep their own single-row loop. `flipPet` re-mirrors the pet to face right.
const layerStyle = (url, cat, frame, anim, name) => {
    const f = frameOf(cat);
    let col = frame % anim.frames, row = anim.row;
    if (cat === 'pet') {
        const canRun = !/wisp/i.test(name || '');
        const running = canRun && (anim.key === 'walk' || anim.key === 'run');
        row = running ? 1 : 0;
        col = frame % (running ? PET_RUN : PET_IDLE);
    } else if (cat === 'effect') { col = frame % EFFECT_COLS; row = 0; }
    return {
        position: 'absolute',
        left: cat === 'pet' ? PET_OFFSET.x : 0,
        top: cat === 'pet' ? PET_OFFSET.y + PET_DY : CHAR_DY,
        width: f.w,
        height: f.h,
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-col * f.w}px ${-row * f.h}px`,
        backgroundSize: 'auto',           // NATIVE sheet size → step works for any sheet width
        imageRendering: 'pixelated',
        // Extra flip so the pet faces the SAME way (right) as the char (Han: it was reversed).
        transform: cat === 'pet' ? 'scaleX(-1)' : undefined,
        transformOrigin: 'center',
    };
};

// A frame-0 thumbnail, CROPPED to the body region so the item fills the cell (Han: 3× bigger, less empty
// space). `k` scales it. The char faces RIGHT (scaleX -1); the pet faces right natively so it is NOT flipped.
const PET_CROP = { x: 3, y: 2, w: 26, h: 28 };
const thumbStyle = (url, cat, k = 1.6) => {
    const isPet = cat === 'pet';
    const crop = isPet ? PET_CROP : CROP;
    const flip = isPet ? 1 : -1;
    return {
        width: crop.w, height: crop.h,
        backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-crop.x}px ${-crop.y}px`, backgroundSize: 'auto', imageRendering: 'pixelated',
        transform: `scale(${flip * k}, ${k})`,
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

    // Required layers: skin (default first skin of the gender) and legs (default = underwear, colourable —
    // Han: "no legs" shows the underwear). Applied whenever a required layer is missing/gender-mismatched.
    const ensureSkin = useCallback((g, layers) => {
        let out = layers;
        if (!(out.skin && out.skin.g === g)) {
            const s = basesFor('skin', g)[0]?.variants[0];
            if (s) out = { ...out, skin: { g: s.g, name: s.name } };
        }
        if (!out.legs) {
            const und = basesFor('legs', g).find((b) => /underwear|panties/i.test(b.base)) || basesFor('legs', g)[0];
            const v = und?.variants.find((x) => !x.variant) || und?.variants[0];
            if (v) out = { ...out, legs: { g: v.g, name: v.name } };
        }
        return out;
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

    // the stacked paper-doll, CROPPED to the body region + scaled to AVATAR_H (Han: much bigger, no empty
    // space). scaleX(-1) → faces RIGHT. Clicking the avatar selects the SKIN.
    const s = AVATAR_H / CROP.h;
    const doll = (
        <div className="cc-doll" style={{ width: CROP.w * s, height: AVATAR_H }}>
            <div style={{ position: 'absolute', left: -CROP.x * s, top: -CROP.y * s, width: BODY_FRAME.w, height: BODY_FRAME.h, transform: `scale(${s})`, transformOrigin: 'top left' }}>
                <div style={{ position: 'absolute', inset: 0, transform: 'scaleX(-1)' }}>
                    {zOrder.map((c) => {
                        const layer = char.layers[c.key];
                        const url = urlOfLayer(c.key, layer);
                        return url ? <div key={c.key} style={layerStyle(url, c.key, frame, anim, layer?.name)} /> : null;
                    })}
                </div>
            </div>
        </div>
    );

    return (
        <div className="cc-overlay" onClick={onClose}>
            <div className="cc-modal cc-modal-diablo" onClick={(e) => e.stopPropagation()}>
                <button className="cc-close" onClick={onClose} aria-label="Close">✕</button>

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
                    <span className="cc-level">LVL {char.level}</span>
                </div>

                {/* Diablo layout (Han): the big avatar (= skin slot) on the LEFT, a 4×3 grid of equal square
                    equipment slots on the RIGHT (each slot ~⅓ of the avatar height). */}
                <div className="cc-body">
                    <button className={`cc-avatar${activeCat === 'skin' ? ' active' : ''}`}
                        title="Skin" onClick={() => setActiveCat('skin')}>{doll}</button>
                    <div className="cc-equip" style={{ height: AVATAR_H }}>
                        {GRID.map((key) => {
                            const c = CATEGORIES.find((x) => x.key === key);
                            const url = urlOfLayer(key, char.layers[key]);
                            const icon = CATEGORY_ICON[key];   // 16×16 type glyph (only for categories with a match)
                            return (
                                <button key={key} title={c.label}
                                    className={`cc-slot${activeCat === key ? ' active' : ''}${url ? ' filled' : ''}`}
                                    onClick={() => setActiveCat(key)}>
                                    {/* Han: the type icon sits BEHIND the equipped sprite — a clear hint when empty
                                        (opacity high), a subtle backdrop when something is equipped (opacity low). */}
                                    {icon && <img className="cc-slot-typeicon" src={icon} alt=""
                                        style={{ opacity: url ? 0.28 : 0.8 }} />}
                                    {url ? <div className="cc-slot-icon" style={thumbStyle(url, key, 1.7)} /> : null}
                                    <span className="cc-slot-label">{c.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* animation picker (Han): rest / walk / run / air-up / air-down / attack / death */}
                <div className="cc-anims">
                    {ANIMATIONS.map((a) => (
                        <button key={a.key} className={`cc-anim${animKey === a.key ? ' active' : ''}`}
                            onClick={() => setAnimKey(a.key)}>{a.label}</button>
                    ))}
                </div>

                {/* the active slot's picker: colour/material swatches + all its items */}
                <div className="cc-picker">
                    <div className="cc-picker-head">{catByKeyLabel(activeCat)}</div>
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
                </div>

                <div className="cc-actions">
                    <button className="cc-btn" onClick={randomize}>🎲 Random</button>
                    <button className="cc-btn" onClick={reset}>Reset</button>
                    <button className="cc-btn cc-save" onClick={onSave}>{saved ? '✓ Saved' : 'Save'}</button>
                </div>

                {/* #648 enemy navigator — UNDER the hero (Han). Its own animation state; own component. */}
                <Bestiary />
            </div>
        </div>
    );
}

const catByKeyLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label || '';

const catByRequired = (key) => CATEGORIES.find((c) => c.key === key)?.required;
