import React, { useState, useEffect, useMemo } from 'react';
import { ENEMIES, enemyById } from '../../model/enemyAssets';

// #648 Bestiary — a navigator UNDER the hero in the character menu. Enemies are switched "as if they were
// equippable items" (Han): a thumbnail grid picks the enemy, a big animated preview + name + blurb shows the
// selection, and animation buttons (idle/walk/attack/…) play each animation — mirroring the hero's own
// animation picker. Sprites are rendered with the SAME crop-and-scale technique as the hero paper-doll
// (native-size background + `transform: scale`, never stretched — §6d), so tiny (100×100) and gandalf
// (64×64) sheets both render crisp and correctly framed.

// One sprite frame, CROPPED to the enemy's content region and scaled so the crop height maps to `height`.
// Mirrors CharacterCreator's doll: an outer clip box, an inner frame-sized layer scaled from top-left.
function EnemySprite({ enemy, anim, frame, height }) {
    const { frame: f, crop } = enemy;
    const s = height / crop.h;
    const col = frame % anim.frames;
    return (
        <div style={{ position: 'relative', width: crop.w * s, height, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: -crop.x * s, top: -crop.y * s, width: f.w, height: f.h, transform: `scale(${s})`, transformOrigin: 'top left' }}>
                <div style={{
                    position: 'absolute', inset: 0, width: f.w, height: f.h,
                    backgroundImage: `url("${anim.url}")`, backgroundRepeat: 'no-repeat',
                    // native-size background stepped by whole frames → any sheet width steps correctly (§6d)
                    backgroundPosition: `${-col * f.w}px ${-anim.row * f.h}px`, backgroundSize: 'auto',
                    imageRendering: 'pixelated',
                }} />
            </div>
        </div>
    );
}

const PREVIEW_H = 160;   // preview sprite height in px (crop.h → this)
const THUMB_H = 70;      // enemy-picker thumbnail height

export default function Bestiary() {
    const [selId, setSelId] = useState(ENEMIES[0].id);
    const [animKey, setAnimKey] = useState('idle');
    const [frame, setFrame] = useState(0);

    const enemy = enemyById(selId) || ENEMIES[0];
    // Fall back to the enemy's first animation if the current key is missing (e.g. a 2-row gandalf has no
    // 'attack'/'death') — keeps the preview alive when switching between differently-equipped enemies.
    const anim = useMemo(() => enemy.animations.find((a) => a.key === animKey) || enemy.animations[0], [enemy, animKey]);

    useEffect(() => {
        setFrame(0);
        const id = setInterval(() => setFrame((fr) => (fr + 1) % anim.frames), 150);
        return () => clearInterval(id);
    }, [anim.frames, anim.url, anim.row]);

    return (
        <div className="cc-bestiary">
            <div className="cc-bestiary-head">Bestiary</div>
            <div className="cc-bestiary-body">
                {/* left: big animated preview + name + blurb */}
                <div className="cc-enemy-preview">
                    <div className="cc-enemy-stage"><EnemySprite enemy={enemy} anim={anim} frame={frame} height={PREVIEW_H} /></div>
                    <div className="cc-enemy-name">{enemy.name}</div>
                    <div className="cc-enemy-blurb">{enemy.blurb}</div>
                    <div className="cc-anims cc-enemy-anims">
                        {enemy.animations.map((a) => (
                            <button key={a.key} className={`cc-anim${anim.key === a.key ? ' active' : ''}`}
                                onClick={() => setAnimKey(a.key)}>{a.label}</button>
                        ))}
                    </div>
                </div>
                {/* right: enemy picker — switch enemies like equippable items (thumbnail grid) */}
                <div className="cc-enemy-grid">
                    {ENEMIES.map((e) => {
                        const idle = e.animations[0];
                        return (
                            <button key={e.id} title={e.name}
                                className={`cc-thumb cc-enemy-thumb${e.id === selId ? ' active' : ''}`}
                                onClick={() => setSelId(e.id)}>
                                <EnemySprite enemy={e} anim={idle} frame={0} height={THUMB_H} />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
