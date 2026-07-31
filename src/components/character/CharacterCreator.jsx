import React, { useState, useMemo, useEffect } from 'react';
import './CharacterCreator.css';
import { CATEGORIES, FRAME, partsFor } from '../../model/characterAssets';
import { loadCharacter, saveCharacter, emptyCharacter } from '../../model/characterProfile';

// #645 POC character creator (Han). A fullscreen modal opened from the header. LEFT: a live paper-doll
// that stacks the selected layers (frame 0 of each 800x448 sprite sheet); RIGHT: gender + name + birthday
// + level, category tabs and a thumbnail grid to pick each layer. Saved to localStorage across sessions.

const PREVIEW_SCALE = 4;   // 80x64 frame shown at 4x
const THUMB_SCALE = 1;

// CSS to crop a sprite SHEET to one frame of row 0 (frameIndex) at a given scale (pixel-art crisp).
const frameStyle = (url, scale, frameIndex = 0) => ({
    width: FRAME.w * scale,
    height: FRAME.h * scale,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `${-frameIndex * FRAME.w * scale}px 0px`,
    backgroundSize: `${FRAME.sheetW * scale}px ${FRAME.sheetH * scale}px`,
    imageRendering: 'pixelated',
});

export default function CharacterCreator({ onClose }) {
    const [char, setChar] = useState(loadCharacter);
    const [activeCat, setActiveCat] = useState('skin');
    const [saved, setSaved] = useState(false);
    // Passive/idle animation (Han): cycle the row-0 idle frames in the preview.
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setFrame((f) => (f + 1) % FRAME.idle), 160);
        return () => clearInterval(id);
    }, []);

    const gender = char.gender;
    const options = useMemo(() => partsFor(activeCat, gender), [activeCat, gender]);

    // Resolve a category's selected part name → its current URL (graceful if the asset moved/renamed).
    const urlFor = (cat) => {
        const name = char.layers[cat];
        if (!name) return null;
        return partsFor(cat, gender).find((p) => p.name === name)?.url || null;
    };

    const setLayer = (cat, name) => { setChar((c) => ({ ...c, layers: { ...c.layers, [cat]: name } })); setSaved(false); };
    const patch = (p) => { setChar((c) => ({ ...c, ...p })); setSaved(false); };

    const randomize = () => {
        const layers = {};
        for (const c of CATEGORIES) {
            const list = partsFor(c.key, gender);
            // Always give a skin; other layers are optional (~55% chance) so the doll isn't over-stacked.
            if (list.length && (c.key === 'skin' || Math.random() < 0.55)) layers[c.key] = list[Math.floor(Math.random() * list.length)].name;
        }
        setChar((c) => ({ ...c, layers }));
        setSaved(false);
    };

    const onSave = () => { saveCharacter(char); setSaved(true); };
    const reset = () => { setChar((c) => ({ ...emptyCharacter(), gender: c.gender })); setSaved(false); };

    return (
        <div className="cc-overlay" onClick={onClose}>
            <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
                <button className="cc-close" onClick={onClose} aria-label="Close">✕</button>

                {/* LEFT — live paper-doll preview. scaleX(-1) → the character faces RIGHT (Han). */}
                <div className="cc-preview">
                    <div className="cc-doll" style={{ width: FRAME.w * PREVIEW_SCALE, height: FRAME.h * PREVIEW_SCALE, transform: 'scaleX(-1)' }}>
                        {CATEGORIES.map((c) => {
                            const url = urlFor(c.key);
                            if (!url) return null;
                            // Effects use a different (400x64) sheet — show them whole rather than frame-cropped.
                            if (c.key === 'effects') {
                                return <img key={c.key} className="cc-layer cc-effect" src={url} alt="" />;
                            }
                            return <div key={c.key} className="cc-layer" style={frameStyle(url, PREVIEW_SCALE, frame)} />;
                        })}
                    </div>
                    <div className="cc-level">LVL {char.level}</div>
                </div>

                {/* RIGHT — controls */}
                <div className="cc-controls">
                    <div className="cc-row cc-identity">
                        <div className="cc-gender">
                            {['male', 'female'].map((g) => (
                                <button key={g} className={`cc-gender-btn${gender === g ? ' active' : ''}`}
                                    onClick={() => patch({ gender: g })}>{g === 'male' ? '♂' : '♀'}</button>
                            ))}
                        </div>
                        <input className="cc-input" placeholder="name" value={char.name}
                            onChange={(e) => patch({ name: e.target.value })} maxLength={24} />
                        <input className="cc-input cc-date" type="date" value={char.birthday}
                            onChange={(e) => patch({ birthday: e.target.value })} />
                    </div>

                    {/* category tabs */}
                    <div className="cc-tabs">
                        {CATEGORIES.map((c) => (
                            <button key={c.key} className={`cc-tab${activeCat === c.key ? ' active' : ''}`}
                                onClick={() => setActiveCat(c.key)}>{c.label}</button>
                        ))}
                    </div>

                    {/* thumbnail grid for the active category (+ a None option) */}
                    <div className="cc-grid">
                        <button className={`cc-thumb cc-none${!char.layers[activeCat] ? ' active' : ''}`}
                            onClick={() => setLayer(activeCat, null)} title="None">∅</button>
                        {options.map((p) => (
                            <button key={p.name} title={p.name}
                                className={`cc-thumb${char.layers[activeCat] === p.name ? ' active' : ''}`}
                                onClick={() => setLayer(activeCat, p.name)}>
                                {activeCat === 'effects'
                                    ? <img className="cc-effect-thumb" src={p.url} alt="" />
                                    : <div style={frameStyle(p.url, THUMB_SCALE)} />}
                            </button>
                        ))}
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
