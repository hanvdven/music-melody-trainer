import { useState, useMemo, useEffect, useCallback } from 'react';
import { CATEGORIES, ANIMATIONS, basesFor, urlOfLayer, variantColor, counterpart, earForSkin } from '../../model/characterAssets';
import { loadCharacter, saveCharacter, emptyCharacter } from '../../model/characterProfile';

// #667 (Han 2026-08-03, "geen popup meer — geïntegreerd in sheet music/bottom view"): all character-editing
// STATE + HANDLERS extracted out of the old CharacterCreator.jsx modal into this hook, so the avatar/equip
// TOP panel and the options/picker BOTTOM panel — now separate components living in separate parts of the
// App.jsx layout (top = sheet-music slot, bottom = tab-panel slot) — can share one character/gender/layer
// state without prop-drilling through a modal component boundary. Logic is UNCHANGED from the old modal;
// only the component boundary moved.
export default function useCharacterEditor() {
    const [char, setChar] = useState(loadCharacter);
    const [activeCat, setActiveCat] = useState('skin');
    const [saved, setSaved] = useState(false);
    const [frame, setFrame] = useState(0);
    const [animKey, setAnimKey] = useState('rest');
    const anim = ANIMATIONS.find((a) => a.key === animKey) || ANIMATIONS[0];
    useEffect(() => {
        setFrame(0);
        const id = setInterval(() => setFrame((f) => (f + 1) % anim.frames), 150);
        return () => clearInterval(id);
    }, [anim.frames, animKey]);

    const gender = char.gender;
    const bases = useMemo(() => basesFor(activeCat, gender), [activeCat, gender]);

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

    return {
        char, setChar, activeCat, setActiveCat, saved, frame, anim, animKey, setAnimKey,
        gender, bases, selected, activeBase, setLayer, patch, pickBase, randomize, onSave, reset, setGender,
        urlOfLayer, variantColor,
    };
}
