import React, { useState, useMemo, useEffect, useCallback } from 'react';
import './CharacterCreator.css';
import { CATEGORIES, IDLE, BODY_FRAME, frameOf, basesFor, urlOfLayer, variantColor, counterpart } from '../../model/characterAssets';
import { loadCharacter, saveCharacter, emptyCharacter } from '../../model/characterProfile';

// #645 POC character creator (v2, Han). LEFT: live paper-doll (layers stacked in z-order, one sprite frame
// each, idle-animated). RIGHT: gender + name + birthday + level, category tabs, base-item grid (+ a colour/
// material variant setter when a base has variants) with an M/F watermark on wrong-gender items so their
// interchangeability can be eyeballed. Rendered at NATIVE sprite size + `transform: scale`, so a sheet's
// width never distorts it (fixes the ear drift). Saved to localStorage across sessions.

const SCALE = 6;                    // preview zoom (80x64 * 6)
const PET_OFFSET = { x: 40, y: 30 };   // pet stands just behind, to the (native-left, becomes right) side

const layerStyle = (url, cat, frame, animate) => {
    const f = frameOf(cat);
    const idx = animate ? frame % IDLE : 0;
    return {
        position: 'absolute',
        left: cat === 'pet' ? PET_OFFSET.x : 0,
        top: cat === 'pet' ? PET_OFFSET.y : 0,
        width: f.w,
        height: f.h,
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-idx * f.w}px 0px`,
        backgroundSize: 'auto',           // NATIVE sheet size → step by f.w works for any sheet width
        imageRendering: 'pixelated',
        // The pet gets an extra flip so it faces the SAME way (right) as the char inside the flipped doll.
        transform: cat === 'pet' ? 'scaleX(-1)' : undefined,
        transformOrigin: 'center',
    };
};

// A cropped thumbnail (frame 0) of one part — scaled UP so the small sprite fills the cell (Han: bigger).
const thumbStyle = (url, cat) => {
    const f = frameOf(cat);
    return {
        width: f.w, height: f.h,
        backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
        backgroundPosition: '0 0', backgroundSize: 'auto', imageRendering: 'pixelated',
        transform: cat === 'pet' ? 'scale(2.4)' : 'scale(1.5)',
    };
};

export default function CharacterCreator({ onClose }) {
    const [char, setChar] = useState(loadCharacter);
    const [activeCat, setActiveCat] = useState('skin');
    const [saved, setSaved] = useState(false);
    const [frame, setFrame] = useState(0);
    const [animOn, setAnimOn] = useState(true);   // Han: toggle the idle animation
    useEffect(() => {
        if (!animOn) return undefined;
        const id = setInterval(() => setFrame((f) => (f + 1) % IDLE), 170);
        return () => clearInterval(id);
    }, [animOn]);

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
                                    return url ? <div key={c.key} style={layerStyle(url, c.key, frame, animOn)} /> : null;
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="cc-level">LVL {char.level}</div>
                    <button className="cc-btn cc-anim" onClick={() => setAnimOn((a) => !a)}>
                        {animOn ? '⏸ Anim' : '▶ Anim'}
                    </button>
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

                    <div className="cc-tabs">
                        {CATEGORIES.map((c) => (
                            <button key={c.key} className={`cc-tab${activeCat === c.key ? ' active' : ''}`}
                                onClick={() => setActiveCat(c.key)}>{c.label}</button>
                        ))}
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
                                <button key={b.id} title={`${b.base}${b.mismatch ? ` (${b.g === 'female' ? 'F' : 'M'})` : ''}`}
                                    className={`cc-thumb${isActive ? ' active' : ''}`} onClick={() => pickBase(b)}>
                                    <div style={thumbStyle(rep.url, activeCat)} />
                                    {b.mismatch && <span className="cc-wm">{b.g === 'female' ? 'F' : 'M'}</span>}
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
