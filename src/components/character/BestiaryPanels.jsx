import React from 'react';
import { variantColor } from '../../model/characterAssets';
import { MOVE_ANIM_KEYS } from '../../model/bestiaryAssets';
import { BESTIARY_BEINGS, BESTIARY_FILTER_TAG_ROWS, BESTIARY_TOWNSFOLK_ROW } from './useBestiaryEditor';
// `PortraitImage`'s own oscillation wobble (below) — separate from CreatureSprite's flying-hover wobble,
// which moved to CreatureSprite.jsx along with its own oscillate import.
import { oscillate } from '../../utils/oscillate';
// #1028 follow-up (Han 2026-08-17, HMR bug fix): `CreatureSprite`/`Frame64Overlay`/`FRAME_SIZE` moved to
// their own file so this file and `CharacterDoll.jsx` (which also needs `CreatureSprite`, for its pet
// layer) can both import them without importing EACH OTHER — see CreatureSprite.jsx's header comment for
// why the previous circular-import setup broke Vite Fast Refresh (an infinite HMR update loop).
import { CreatureSprite, Frame64Overlay, FRAME_SIZE } from './CreatureSprite';
import CharacterDoll from './CharacterDoll';
import useBestiaryAnimationAudio from '../../hooks/useBestiaryAnimationAudio';
// #1028 follow-up (Han 2026-08-17, "ik wil graag een grid, zoals in debug achter de hero, van 4x4 grijs/wit
// blokken, achter de sprite"): reuses the EXACT canonical `.cc-checker` debug checkerboard (§6d,
// CharacterCreator.css) the character creator's avatar/equipment slots already apply in debugMode
// (CharacterAvatarPanel.jsx/CharacterOptionsPanel.jsx, via `characterEditorShared.js`'s `checker()` helper)
// — not a second hand-rolled grid pattern. Only the CSS class is needed here (applied directly below), not
// the helper function itself.
import './CharacterCreator.css';

// #870 (Han 2026-08-12, "toon ook de tags links van het portet boven in beeld") — small pill label shared
// by the being tag and every subtractive tag shown next to the preview.
// #1028 follow-up (Han 2026-08-17, "font size van debug tekst is echt klein... alle tekst mag wel 1,5x zo
// groot. tags en filters graag zelfde stijl: sans serif, ronde hoeken"): 11px -> 16.5px (×1.5), serif ->
// sans-serif (same `Arial, sans-serif` stack already used elsewhere in the app, e.g. renderMelodyNotes.jsx)
// — deliberately NOT touching CLAUDE.md §1a's Georgia/serif rule for prose text elsewhere, this is Han's own
// explicit choice for THIS specific control. `TAG_ROW_BUTTON_STYLE` below reuses these same rounded-corner/
// sans-serif/font-size values so the filter-bar's tag chips (`.cc-toggle`, currently square-cornered/
// inherited-font) visually match these preview pills — applied via scoped inline style on JUST the tag-row
// buttons (TagRow), not the shared `.cc-toggle` CSS class itself, which CharacterOptionsPanel's unrelated
// outfit-picker toggles also use and must stay untouched.
const PILL_STYLE = {
    // #UI-overhaul (Han 2026-08-27): world-mode `.bestiary-pixel` sets `--pill-pad: 1px` +
    // `line-height: 1` so a pill/button is exactly one glyph tall + 2px ("de hoogte van de knoppen is
    // meer dan tekst + 2px"). Classic view has no `--pill-pad`, so the fallback keeps `2px 8px`.
    fontFamily: 'Arial, sans-serif', fontSize: '16.5px', padding: 'var(--pill-pad, 2px 8px)', lineHeight: 1,
    borderRadius: '10px', border: '1px solid var(--text-secondary)', background: 'var(--panel-bg)',
    color: 'var(--text-primary)', whiteSpace: 'nowrap',
};
// Merged onto TagRow's `.cc-toggle` buttons (see PILL_STYLE comment above) — keeps `.cc-toggle-group`'s
// shared layout/border chrome, only overrides the per-button radius/font to match the preview tag pills.
const TAG_ROW_BUTTON_STYLE = { borderRadius: '10px', fontFamily: 'Arial, sans-serif', fontSize: '16.5px' };
// #870 (Han 2026-08-12, "geef de tags kleuren (mature en flying consistent met de animatie/variant tags)"):
// `flying`/`bare` MUST stay the exact hex already used elsewhere (the flying animation-button tint, the bare
// swatch fill) — everything else is a fresh, thematically-grouped palette so the filter chips (and the
// pills next to the preview) are visually distinguishable at a glance. Shared by BestiaryFilterBar and the
// preview's tag-pill column below — one lookup, not two.
export const TAG_COLOR = {
    flying: '#16306b', bare: '#ff5fa8', mature: '#8e1c4a',
    // #1028 follow-up (Han 2026-08-17, "geef de nieuwe tags een kleurtje"): the new HABITAT row (flying
    // above, moved here from the combat-trait row) — water/ground/on_water each get a distinct tone so the
    // 4-chip row reads at a glance, not just 3 similar blues.
    water: '#1e5a8a', ground: '#6b5637', on_water: '#0e7a7a',
    magical: '#6a3fa0', hellish: '#8b0000', undead: '#3c5a4a', night: '#241454',
    musician: '#a0522d', worker: '#5c4630', trader: '#b8860b', tavern: '#c07a1e', military: '#3a5a78',
    bathhouse: '#1e8a8a',
    oriental: '#7a2e2e', seasonal: '#1e7a5a', roman: '#a05a2e', christian: '#8a7a1e',
    pet: '#4a8a3a', critter: '#5a7a2e', bird: '#c9a227',
    portrait: '#4a4a6a', move: '#2e6a8a', attack: '#a03a2e', ranged: '#c05a1e',
    // #1096 (Han 2026-08-20, "voeg een tag toe: audio") — same row as portrait/move/attack/ranged.
    audio: '#2e8a5a',
    // #870 (Han 2026-08-13): the townsfolk/hostile/nature group (own row, see BESTIARY_TOWNSFOLK_ROW).
    townsfolk: '#2e7ab8', hostile: '#a01e1e', nature: '#4a9c3a',
    // #870 (Han 2026-08-13, "geef ook kleurtjes aan de human humanoid animal other tags"): the being row —
    // shares this SAME lookup/`tagPillStyle` helper (being/tag namespaces never collide) rather than a
    // second colour map.
    human: '#6b6b6b', humanoid: '#8a5a3b', animal: '#3a7a5a', other: '#7a5a1e',
};
const tagPillStyle = (tag) => (TAG_COLOR[tag] ? { ...PILL_STYLE, backgroundColor: TAG_COLOR[tag], color: '#fff', borderColor: TAG_COLOR[tag] } : PILL_STYLE);
// #1028 follow-up (Han 2026-08-17, "haal de underscore overal weg", re: on_water showing as "On_water"):
// DISPLAY-only formatting — the underlying tag STRING stays `on_water` everywhere else in the codebase
// (RpgLevelPanel.jsx's habitat matching, the generator's ON_WATER_NAMES, etc. all key off the literal
// value; renaming it would mean auditing every one of those call sites for zero functional benefit). Every
// read-only tag label in this file routes through this one helper so a future multi-word tag never needs a
// second fix.
const formatTagLabel = (tag) => {
    const s = tag.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
};
// #1028 (Han 2026-08-17, "bestiary clean up" part 2 — tags add/remove/rename in debug mode): one pill per
// tag, click-to-rename (turns into a text input, commits on Enter/blur, Escape cancels) + an "x" to remove.
// Own local `editing` state (a hook, so this MUST be a component, not inlined into the plain-JSX `tagsColumn`
// expression in BestiaryTopPanel below).
function EditableTagChip({ tag, onRemove, onRename }) {
    const [editing, setEditing] = React.useState(false);
    const [text, setText] = React.useState(tag);
    if (editing) {
        return (
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
                onBlur={() => { setEditing(false); onRename(text); }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { setEditing(false); onRename(text); }
                    if (e.key === 'Escape') { setText(tag); setEditing(false); }
                }}
                style={{ ...PILL_STYLE, width: `${Math.max(text.length, 4)}ch` }} />
        );
    }
    return (
        <span style={{ ...tagPillStyle(tag), display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <span onClick={() => { setText(tag); setEditing(true); }} title="Klik om te hernoemen">{formatTagLabel(tag)}</span>
            <span onClick={onRemove} title="Verwijder tag" style={{ cursor: 'pointer', fontWeight: 'bold' }}>×</span>
        </span>
    );
}
// New-tag input: free text (any string, incl. hidden tags like "flip l/r" that never appear in the filter
// UI) with a `<datalist>` of every tag already used elsewhere in the roster as a convenience suggestion list.
function AddTagControl({ knownTags, onAdd }) {
    const [text, setText] = React.useState('');
    const commit = () => { if (text.trim()) { onAdd(text); setText(''); } };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            <input list="bestiary-known-tags" value={text} placeholder="+ tag" onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                style={{ ...PILL_STYLE, width: '9ch' }} />
            <datalist id="bestiary-known-tags">{knownTags.map((t) => <option key={t} value={t} />)}</datalist>
            <button onClick={commit} style={{ ...PILL_STYLE, cursor: 'pointer' }}>+</button>
        </span>
    );
}
// #1028 follow-up (Han 2026-08-17, "ik kan de naam niet aanpassen"): click-to-rename creature title, same
// commit-on-Enter/blur/Escape pattern as EditableTagChip — keeps `.cc-enemy-name`'s existing bold/yellow
// styling while editing (an `<input>` inheriting that className) rather than a visually different control.
function EditableNameTitle({ name, onRename }) {
    const [editing, setEditing] = React.useState(false);
    const [text, setText] = React.useState(name);
    if (editing) {
        return (
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
                onBlur={() => { setEditing(false); onRename(text); }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { setEditing(false); onRename(text); }
                    if (e.key === 'Escape') { setText(name); setEditing(false); }
                }}
                className="cc-enemy-name"
                style={{ fontFamily: 'Arial, sans-serif', fontSize: '16.5px', width: `${Math.max(text.length, 4)}ch`, textAlign: 'center' }} />
        );
    }
    return (
        <div className="cc-enemy-name" style={{ cursor: 'pointer' }}
            onClick={() => { setText(name); setEditing(true); }} title="Klik om te hernoemen">{name}</div>
    );
}
// #1028 follow-up round 3 (Han 2026-08-17, "maak p x q frame ook aanpasbaar... ik wil dat ook in de
// bestiary kunnen aanpassen"): click-to-edit the frame WxH, same commit-on-Enter/blur/Escape pattern as
// every other inline editor here. Accepts "WxH" or "W,H" — `setFrameSize`'s own parser handles either.
function FrameSizeText({ frame, onSetFrameSize }) {
    const [editing, setEditing] = React.useState(false);
    const [text, setText] = React.useState('');
    if (editing) {
        return (
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
                onBlur={() => { setEditing(false); onSetFrameSize(text); }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { setEditing(false); onSetFrameSize(text); }
                    if (e.key === 'Escape') setEditing(false);
                }}
                style={{ width: '8ch', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '16.5px' }} />
        );
    }
    return (
        <span onClick={() => { setText(`${frame.w}x${frame.h}`); setEditing(true); }}
            title="Klik om frame-grootte aan te passen" style={{ cursor: 'pointer' }}>
            {frame.w}×{frame.h} frame
        </span>
    );
}
// #1028 follow-up (Han 2026-08-17, "de porcupine-animaties zijn mislabeld... chicken heeft alle animaties
// onder 'idle'... geef me een manier, als is het via typen, de animatie labels aan te passen via de
// bestiary. ik wil ook specifieke animaties het label 'flying' kunnen geven"; round 2, same day: "ik kan
// niet de frames kiezen bij een animatie; of een animatie toevoegen/verwijderen... ik vind het prima om de
// frames/cells comma seperated in te voeren in een soort terminal"): debug-mode replacement for the plain
// `.cc-anim` selection button — label click still SELECTS the animation (unchanged behaviour), ✎ renames
// the key (typed), ▦ edits the cell list (typed, `row:col,row:col,...` — a direct typed form of the
// `cells:[{row,col}]` array every animation already is), ✈ toggles flying, × removes the animation. Outside
// debugMode the caller renders the original plain `<button>` unchanged (see call site).
function EditableAnimButton({ a, active, onSelect, onRename, onEditCells, formatCells, onToggleFlying, onRemove }) {
    const [editMode, setEditMode] = React.useState(null); // null | 'key' | 'cells'
    const [text, setText] = React.useState('');
    const flying = !!a.tags?.includes('flying');
    // #1028 follow-up (Han 2026-08-17, "maak ook de animatienamen sans serif, en maak alle info in de
    // animatievakjes 2x zo groot"): `.cc-anim`'s own CSS (font-size 11px, no font-family override, i.e.
    // ambient/serif) is untouched — this is a debug-mode-ONLY override, `EditableAnimButton` only ever
    // renders when `debugMode` is true (see BestiaryTopPanel's call site), so the plain-mode `.cc-anim`
    // buttons stay exactly as they were.
    const baseStyle = {
        fontFamily: 'Arial, sans-serif', fontSize: '22px',
        ...(active ? { backgroundColor: 'var(--accent-yellow)', color: '#000' } : undefined),
        ...(flying ? { backgroundColor: '#16306b', color: '#fff' } : undefined),
    };
    const commit = () => {
        if (editMode === 'key') onRename(text);
        if (editMode === 'cells') onEditCells(text);
        setEditMode(null);
    };
    if (editMode) {
        return (
            <span className="cc-anim" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', ...baseStyle }}>
                <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') setEditMode(null);
                    }}
                    placeholder={editMode === 'cells' ? 'rij:kolom,rij:kolom,...' : undefined}
                    style={{ width: `${Math.max(text.length, editMode === 'cells' ? 12 : 3)}ch`, fontFamily: 'Arial, sans-serif', fontSize: '22px' }} />
            </span>
        );
    }
    return (
        <span className={`cc-anim${active ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', ...baseStyle }}>
            <span onClick={onSelect}>{a.label}</span>
            <span onClick={() => { setText(a.label); setEditMode('key'); }} title="Klik om te hernoemen" style={{ cursor: 'pointer' }}>✎</span>
            <span onClick={() => { setText(formatCells(a.cells)); setEditMode('cells'); }} title="Frames/cells bewerken (rij:kolom,...)" style={{ cursor: 'pointer' }}>▦</span>
            <span onClick={onToggleFlying} title="Vlieg-animatie aan/uit" style={{ cursor: 'pointer', opacity: flying ? 1 : 0.4 }}>✈</span>
            <span onClick={onRemove} title="Animatie verwijderen" style={{ cursor: 'pointer', fontWeight: 'bold' }}>×</span>
        </span>
    );
}
// New-animation input: a key (typed) + a cells list (typed, same `row:col,row:col,...` format as the ▦
// editor above) — the same "type it in a terminal" approach Han asked for, symmetric with `AddTagControl`.
function AddAnimationControl({ onAdd }) {
    const [key, setKey] = React.useState('');
    const [cells, setCells] = React.useState('');
    const commit = () => { if (key.trim() && cells.trim()) { onAdd(key, cells); setKey(''); setCells(''); } };
    return (
        <span className="cc-anim" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontFamily: 'Arial, sans-serif', fontSize: '22px' }}>
            <input value={key} placeholder="naam" onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} style={{ width: '6ch', fontFamily: 'Arial, sans-serif', fontSize: '22px' }} />
            <input value={cells} placeholder="rij:kolom,..." onChange={(e) => setCells(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} style={{ width: '12ch', fontFamily: 'Arial, sans-serif', fontSize: '22px' }} />
            <span onClick={commit} title="Animatie toevoegen" style={{ cursor: 'pointer', fontWeight: 'bold' }}>+</span>
        </span>
    );
}
// #1028 (Han 2026-08-17, "bestiary clean up" part 3 — "bij run/walk in edit mode bewegen de debug-blokken
// opzij met constante snelheid. ik wil ook info kunnen aanpassen zoals snelheid: pixels/frame... ik zou
// animaties zo fijn willen kunnen afstellen - constant of per frame"): the debug block used to just move at
// an implicit fixed rate — now tunable, and (per-frame mode) able to express the SAME "pause on some frames,
// move on others" shape the level's slime hop already has hardcoded elsewhere (SheetRpgLayer.jsx), so that
// pattern becomes something Han can author/see here instead of only in code. `weights[i]` = how many
// `pxPerFrame` units frame `i` advances (0 = stand still that frame). Purely editor-side for now — no
// gameplay code reads this yet (§4b-approved phased migration, see docs/architecture.md).
// #1028 follow-up round 3 (Han 2026-08-17, "bij move animaties, verwacht ik nog steeds dat de achtergrond
// beweegt (checkerboard)"): factored out of `MovementDebugBlock` so `BestiaryTopPanel` can apply the SAME
// weight-accumulation math to the checkerboard background's scroll offset (see that call site) — one
// formula, two call sites, never duplicated.
function movementWeights(movement, frameCount) {
    return movement.frameWeights && movement.frameWeights.length === frameCount
        ? movement.frameWeights : Array.from({ length: frameCount }, () => 1);
}
function computeMovementOffsetPx(movement, frameCount, frame) {
    const weights = movementWeights(movement, frameCount);
    const cyclePos = frame % frameCount;
    return weights.slice(0, cyclePos).reduce((a, b) => a + b, 0) * movement.pxPerFrame;
}
function MovementDebugBlock({ movement, frameCount, frame, onSetPxPerFrame, onSetFrameWeight, onToggleMode }) {
    const weights = movementWeights(movement, frameCount);
    const offsetPx = computeMovementOffsetPx(movement, frameCount, frame);
    const trackWidthPx = Math.max(1, weights.reduce((a, b) => a + b, 0)) * movement.pxPerFrame;
    return (
        <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '16.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Movement:</span>
                <button onClick={onToggleMode} style={{ ...PILL_STYLE, cursor: 'pointer' }}>
                    {movement.frameWeights ? 'per frame' : 'constant'}
                </button>
                {!movement.frameWeights && (
                    <label>px/frame{' '}
                        <input type="number" min="0" value={movement.pxPerFrame}
                            onChange={(e) => onSetPxPerFrame(e.target.value)} style={{ width: '4ch' }} />
                    </label>
                )}
            </div>
            {movement.frameWeights && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {weights.map((w, i) => (
                        <label key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '13.5px' }}>
                            {i}
                            <input type="number" min="0" value={w}
                                onChange={(e) => onSetFrameWeight(i, e.target.value)} style={{ width: '3ch' }} />
                        </label>
                    ))}
                </div>
            )}
            <div style={{ position: 'relative', height: '12px', width: `${trackWidthPx + 16}px`, border: '1px solid var(--text-secondary)' }}>
                <div style={{ position: 'absolute', left: `${offsetPx}px`, top: '2px', width: '8px', height: '8px', background: 'var(--text-primary)' }} />
            </div>
        </div>
    );
}
// #790 (Han 2026-08-09, "het grote kader mag in lijn met de andere kaders (bestiary)"): exported so the
// persona avatar preview (CharacterAvatarPanel) sizes its own hero/pet/frame at this SAME scale — one
// visual scale for every 64×64 frame, not a second guessed one.
// #790 round 6 (Han: "je hebt het verkeerd begrepen. alle bestiary portretten moeten ook op die schaal
// staan; d.w.z. preview_scale zelf moet groter"): round 5 introduced a SEPARATE `PERSONA_SCALE` multiplier
// used only by the persona preview — wrong; Han wants the WHOLE Bestiary UI (every top-view frame/portrait,
// not just the persona) 1.6× bigger, so the increase belongs on `PREVIEW_SCALE` itself.
// #UI-overhaul Stap 3 (Han 2026-08-27): this is the CLASSIC-view fallback scale only. In world mode
// `BestiaryTopPanel` instead renders at the world's own integer scale `N` (see its `worldScale` prop)
// so a bestiary creature is the exact same on-screen size it has out in the open world.
export const PREVIEW_SCALE = 2.6 * 1.6;
// #682 (Han: "maak de previews 30% groter (maar houd de vakjes even groot)") — the SPRITE scale grows 30%;
// the thumb box itself (`.cc-enemy-thumb`, CSS) is untouched, so bigger previews now overflow it (allowed —
// see `.cc-enemy-thumb`'s `overflow: visible` below) instead of the box growing to fit.
const THUMB_SCALE = 1.3 * 1.3;

// #675 follow-up (Han: "toon het portret groot" — most portraits are a lone dedicated file, shown whole via
// a plain `<img>`; the Wizard's is an 8-colour grid (`portraitCell`+`portraitFrame` set), cropped to just
// the one cell matching the selected colour, same background-position technique as CreatureSprite).
// #682 (Han 2026-08-04, "portrait varianten tonen twee kaders van 64x64: een met het karakter, en een met de
// pixel art portrait"): the portrait gets its OWN `.cc-sprite-frame` box (same background/border as the
// sprite's frame, §6d — one visual language for both "kaders"), sized to match (`size` = 64×PREVIEW_SCALE).
// Unlike the sprite frame, this one clips (`overflow: hidden`) — portraits fill their box exactly, no
// overflow concept applies here.
// #691 (Han: after wiring up the archer/wizard projectile panel, "ik verwacht... een 64x64 vak met de pijl
// (gecentreerd)"): both branches now CENTER their content via flex instead of stretching/top-left-anchoring
// it to fill the box — a whole-file portrait (e.g. `arrow.png`, 30×5px) or a cropped sheet frame (e.g. the
// projectile's 48×16 flight frame) is rarely square, and Han's "gecentreerd" rules out both stretching it to
// fill AND leaving it pinned in a corner with dead space around it.
// #693 (Han 2026-08-04, round 3: "the portrait for the projectiles should be 64x64; as any other portrait.
// the projectile should be the same scale as the archer i.e. true size wrt the frame (30x5 (arrow) or
// 48x16 (magic) fitting into a 64x64 frame), centered, with mild oscillations"): supersedes round 2's
// "stretch to fill, no letterbox" approach — Han clarified he wants the OPPOSITE: every portrait (whole-file
// or cell-cropped) is a SQUARE 64-reference box like any other, the content shown at its OWN true pixel
// size scaled by the SAME factor the box itself uses (`size / 64` — never a per-content contain-fit ratio),
// centered on both axes, clipped if it overflows (Mind Blast's 96×32 frame is wider than 64 — Han: "center
// and clip"). `animCols`/`tick` (optional) cycle through multiple frames in the cell's row (the projectile's
// flight loop, Mind Blast's 5 frames) — genuinely animated, not frozen. A subtle oscillation (Han: "use the
// same oscillation as the one in the sheet music") nudges the centered content, reusing the EXACT wobble
// SheetRpgLayer's flying projectile uses (`src/utils/oscillate.js`, §6c/§6d — one implementation, not a
// second hand-copied one). `Frame64Overlay` (the same decorative pixel-art border every other 64×64 box
// now gets) draws on top.
// #693 round 9 (Han: "magic projectile: flip de richting (zowel in bestiary als in de song levels)"):
// `flip` mirrors the content horizontally — same direction change as SheetRpgLayer's Projectile component,
// applied here too so the Bestiary's preview and the actual in-level projectile always agree (§6d — one
// visual fact, not two independently-flipped copies that could drift apart again).
function PortraitImage({ url, cell, frame, size, animCols = 1, tick = 0, oscillateSeed = null, flip = false }) {
    const trueScale = size / 64;   // fixed 64×64 reference — NOT frame-dependent (Han: "true size")
    const [wobX, wobY] = oscillateSeed != null
        ? [oscillate(oscillateSeed, Date.now(), 4 * trueScale), oscillate(oscillateSeed + 1000, Date.now(), 4 * trueScale)]
        : [0, 0];
    const flipScale = flip ? -trueScale : trueScale;
    const inner = !cell
        ? <img src={url} alt="" style={{ imageRendering: 'pixelated', display: 'block', transform: `scale(${flipScale}, ${trueScale})`, transformOrigin: 'center' }} />
        : (() => {
            const col = animCols > 1 ? tick % animCols : cell.col;
            return (
                <div style={{
                    width: frame.w, height: frame.h,
                    backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
                    backgroundPosition: `${-col * frame.w}px ${-cell.row * frame.h}px`, backgroundSize: 'auto',
                    transform: `scale(${flipScale}, ${trueScale})`, transformOrigin: 'center', imageRendering: 'pixelated',
                }} />
            );
        })();
    // #693 round 8 (Han: "volgorde is daar nog verkeerd; moet zijn (van achter naar voor): witte rand,
    // portret, kader, game karakter/projectiel"): a plain white backing now sits behind everything (was
    // just the box's own `--panel-bg` CSS, not necessarily white), the portrait/projectile content sits
    // on top of that, and `Frame64Overlay` now draws LAST (in front of the content) — the opposite of the
    // previous order, where the frame sat behind the content.
    return (
        <div className="cc-sprite-frame" style={{ position: 'relative', width: size, height: size, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#fff' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translate(${wobX}px, ${wobY}px)` }}>
                {inner}
            </div>
            <Frame64Overlay box={size} />
        </div>
    );
}

// #UI-overhaul Stap 3 (Han 2026-08-27, "schaal op dezelfde schaal als 'world'"): in world mode App
// passes `worldScale` — the integer N computed for the world level (utils/worldLayout.js) — so a
// creature in the bestiary renders at the SAME on-screen game-pixel size it has in the open world.
// Falls back to the fixed `PREVIEW_SCALE` (4) in the classic view, where there is no world scale.
export function BestiaryTopPanel({ editor, debugMode = false, context, worldScale = null }) {
    const previewScale = worldScale ?? PREVIEW_SCALE;
    const {
        creature, variant, variantIndex, setVariantIndex, anim, frame, animKey, setAnimKey, visibleAnimations,
        activeAccessories, toggleAccessory, hasHatOverlay, hasSwordAnims, swordOn, toggleSword,
        colorVariants, hasBareToggle, bareOn, toggleBare,
        displayTags, knownTags, addTag, removeTag, editTag,
        avatarChar,
        currentMovement, movementFrameCount, setMovementPxPerFrame, setFrameWeight, toggleMovementMode,
        currentFacing, toggleFacing, displayName, setDisplayName,
        setAnimKeyOverride, toggleAnimFlying,
        formatCellsInput, setAnimCells, removeAnimation, addAnimation, setFrameSize,
    } = editor;
    // #1096 (Han 2026-08-20, "ik wil in de bestiary ook de animatie-audio horen") — plays the worker's
    // bell/hammer note in sync with whichever animation/frame is currently showing, same source of truth
    // (workerSoundConfig.js) the real level and the 'audio' filter tag use.
    useBestiaryAnimationAudio(context, creature.name, anim, frame);
    // #671 (Han: "kan je de kleur samplen?"): Doggy's swatch colour is SAMPLED per-file (variant.swatchColor,
    // §671), not a named colour keyword — checked alongside variantColor so both sources light up the same
    // swatch row. When NEITHER resolves for any variant (Covered/Uncovered, Wisp's Plain/Outline — a real
    // on/off pair, not a colour choice), render `.cc-tab` toggle-style pills instead of empty swatches —
    // Han: "gebruik ook zo'n toggler voor covered uncovered."
    const colorOf = (v) => variantColor(v.variant) || v.swatchColor;
    const anyColor = colorVariants.some(colorOf);
    // #870 (Han 2026-08-12, Maid "b/w + hat = toon de maid b/w en plak de hat sprite met de matchende
    // animatie erover"): `anim.hatUrl` (generator-resolved, matches THIS exact animation's cell layout) is
    // layered on top the same way a real accessory would be, gated on the SAME `activeAccessories.hat`
    // toggle used for the Hat button below — just resolved per-animation instead of a fixed creature URL.
    const overlayUrls = [
        ...creature.accessories.filter((a) => activeAccessories[a.key]).map((a) => a.url),
        ...(activeAccessories.hat && anim.hatUrl ? [anim.hatUrl] : []),
    ];
    // #1028 follow-up round 3 (Han 2026-08-17, "bij move animaties, verwacht ik nog steeds dat de
    // achtergrond beweegt (checkerboard)"): the ORIGINAL ticket ask ("bij run/walk in edit mode bewegen de
    // debug-blokken opzij") — `MovementDebugBlock`'s own small track (Follow-up 1) satisfied it literally
    // but not what Han actually pictured: the big reference checkerboard BEHIND the sprite (added Follow-up
    // 2) should itself scroll during a move-type animation, using the SAME speed/weights profile, so the
    // creature visibly "walks across" it instead of a separate tiny widget moving elsewhere on screen. Only
    // for move-type animations (`MOVE_ANIM_KEYS` — the same canonical list `findMoveAnim` uses, §6c) —
    // idle/attack/death keep a static grid.
    const checkerScrollPx = MOVE_ANIM_KEYS.includes(anim.key)
        ? computeMovementOffsetPx(currentMovement, movementFrameCount, frame) : 0;
    // #870 (Han 2026-08-12, "verplaats de kleuren en togglers naar rechts van het portret... centreer het
    // portret... de tags links en de opties rechts mogen geen impact op de centrering hebben"): the colour
    // swatches + every toggler now render together in this ONE right-side column, gathered here so the JSX
    // below can drop them in as a single block instead of several separately-positioned ones.
    const optionsColumn = (
        <>
            {/* #668/#671 variant toggler — colour swatches when a colour is known (Slime, Archer, farm
                animals, Doggy's sampled colours); a segmented toggle-group otherwise (Covered/Uncovered,
                Wisp — #679: these are genuinely on/off pairs, so they get the SAME `.cc-toggle-group` chrome
                as the equipment/character on/off togglers, distinct from `.cc-anim`/`.cc-tab` navigation).
                #870 (Han 2026-08-12, "maak steeds bare een aparte toggler (naast kleur)"): only NON-bare
                variants show here now — Bare is its own toggle button below. */}
            {colorVariants.length > 1 && (
                anyColor ? (
                    // #1028 (Han 2026-08-17, part 4: "stapel de kleuren verticaal ipv horizontaal. als er twee
                    // rijen kleuren nodig zijn, probeer dan door twee te delen zodat de kleuren netjes verdeeld
                    // zijn"): `.cc-variants`' shared CSS (CharacterCreator.css) stays row/wrap — it's also used
                    // by CharacterOptionsPanel's own (unrelated) variant chips — so this override is scoped
                    // inline, here only. `flex-direction: column` + `flex-wrap: wrap` naturally stacks
                    // vertically; capping `maxHeight` at ceil(n/2) rows once there are more than 6 swatches is
                    // what makes a long list split into two EVEN columns instead of one tall one (n ≤ 6 gets no
                    // cap at all, i.e. a single column — the common case for most creatures).
                    <div className="cc-variants" style={colorVariants.length > 6
                        ? { flexDirection: 'column', maxHeight: `${Math.ceil(colorVariants.length / 2) * 32}px`, alignContent: 'flex-start' }
                        : { flexDirection: 'column' }}>
                        {colorVariants.map((v, i) => {
                            const col = colorOf(v);
                            // #690 (Han: "twee-kleuren vakje... diagonaal gesplitst links boven/rechts
                            // onder") — a second swatch colour (e.g. Maid's plain colours, the cow's
                            // Bw/Rw, or Lady Flower's un-named colour pairs, §870) renders as a diagonal
                            // split instead of a flat fill; single-colour variants are unaffected.
                            const bg = v.swatchColor2
                                ? `linear-gradient(135deg, ${col} 50%, ${v.swatchColor2} 50%)` : (col || 'transparent');
                            return (
                                <button key={`${v.variant}-${i}`} title={v.variant || 'plain'}
                                    className={`cc-swatch${i === variantIndex ? ' active' : ''}`}
                                    onClick={() => setVariantIndex(i)} style={{ background: bg }}>
                                    {col ? '' : (v.variant || '•')}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="cc-toggle-group">
                        {colorVariants.map((v, i) => (
                            <button key={`${v.variant}-${i}`} className={`cc-toggle${i === variantIndex ? ' active' : ''}`}
                                onClick={() => setVariantIndex(i)}>{v.variant || 'Plain'}</button>
                        ))}
                    </div>
                )
            )}
            {/* #671 accessory togglers (Han: "maak een toggler voor hat en backpack") — independent on/off
                layers, not mutually-exclusive variants, so each gets its own toggle button.
                #870 (Han 2026-08-12): Hat/Sword/Bare join this SAME row when applicable — Hat is a TRUE
                overlay (same accessory mechanism, resolved per-animation via `overlayUrls` above); Sword
                filters WHICH animations show (below) rather than swapping variant; Bare swaps the EFFECTIVE
                variant to its bare sibling (`useBestiaryEditor`'s `variant` already resolves this) — all
                generic (`hasHatOverlay`/`hasSwordAnims`/`hasBareToggle`), never hardcoded to one creature. */}
            {(creature.accessories.length > 0 || hasHatOverlay || hasSwordAnims || hasBareToggle) && (
                <div className="cc-toggle-group">
                    {creature.accessories.map((a) => (
                        <button key={a.key} className={`cc-toggle${activeAccessories[a.key] ? ' active' : ''}`}
                            onClick={() => toggleAccessory(a.key)}>{a.label}</button>
                    ))}
                    {hasHatOverlay && (
                        <button className={`cc-toggle${activeAccessories.hat ? ' active' : ''}`}
                            onClick={() => toggleAccessory('hat')}>Hat</button>
                    )}
                    {hasSwordAnims && (
                        <button className={`cc-toggle${swordOn ? ' active' : ''}`}
                            onClick={toggleSword}>Sword</button>
                    )}
                    {hasBareToggle && (
                        <button className={`cc-toggle${bareOn ? ' active' : ''}`}
                            onClick={toggleBare}
                            style={bareOn ? { backgroundColor: '#ff5fa8', color: '#fff' } : undefined}>Bare</button>
                    )}
                </div>
            )}
        </>
    );
    // #1028 (Han 2026-08-17, part 2): `displayTags` (useBestiaryEditor) already layers this creature's
    // add/remove/rename edits on top of the generator-derived `variant.tags` — read-only view uses it
    // identically to the old `variant.tags`, debug mode additionally renders the ×/rename/+ controls.
    // `being` (human/humanoid/animal/other) is NOT editable here — it's a required, mutually-exclusive
    // classification driving other UI (BESTIARY_BEINGS filter row), out of scope for a free-text tag editor.
    const tagsColumn = (creature.being || displayTags.length || debugMode) && (
        // Right-aligned within its own column (see the justifySelf:'end' wrapper at the call site) — hugs
        // the portrait, not the panel's outer edge.
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
            {creature.being && <span style={tagPillStyle(creature.being)}>{creature.being}</span>}
            {displayTags.filter((t) => t !== 'bare').map((t) => (
                debugMode
                    ? <EditableTagChip key={t} tag={t} onRemove={() => removeTag(t)} onRename={(nt) => editTag(t, nt)} />
                    : <span key={t} style={tagPillStyle(t)}>{formatTagLabel(t)}</span>
            ))}
            {debugMode && <AddTagControl knownTags={knownTags} onAdd={addTag} />}
        </div>
    );
    return (
        <div
            className={`cc-enemy-preview${worldScale != null ? ' bestiary-pixel' : ''}`}
            style={{ margin: '0 auto', width: '100%', ...(worldScale != null ? { '--bpx': `${worldScale}px` } : null) }}
        >
            {/* #682 (Han 2026-08-04, "de titel / naam moet er boven staan") — moved above the frame(s). */}
            {/* #1028 follow-up (Han: "ik kan de naam niet aanpassen"): click-to-rename in debug mode, same
                commit-on-Enter/blur pattern as EditableTagChip. Read-only outside debug mode. */}
            {debugMode
                ? <EditableNameTitle name={displayName} onRename={setDisplayName} />
                : <div className="cc-enemy-name">{displayName}</div>}
            {/* #672/#675 (Han: "toon bij portrait characters links de avatar met animatievariaties, en
                rechts het portret (groot)") — character sprite LEFT, portrait crop RIGHT, sized to roughly
                match the avatar's own height so it reads as an equal-weight companion, not an afterthought.
                #870 (Han 2026-08-12, "toon ook de tags links van het portet"; follow-up: "verplaats de
                kleuren en togglers naar rechts van het portret... centreer het portret").
                #870 (Han 2026-08-13 bugfix, "na je herschikking staan de tags en varianten denk ik achter of
                over het portret... ik kan ze alleszins niet meer zien"): the PREVIOUS `position: absolute`
                approach anchored tags/options to this wrapper's own edges — but `.cc-enemy-stage`'s content
                (sprite + portrait boxes, each `FRAME_SIZE * PREVIEW_SCALE` ~266px, §148) is far WIDER than
                `.cc-enemy-preview`'s old 256px column (it already overflowed that box before this round, just
                harmlessly, since nothing else occupied the horizontal overflow space) — so `left:0`/`right:0`
                landed the side columns UNDERNEATH the oversized, already-overflowing stage instead of next to
                it. Fixed by (a) widening `.cc-enemy-preview` (CharacterCreator.css) so the stage usually fits
                without overflowing, and (b) putting tags/stage/options back in NORMAL flow as a wrapping flex
                row instead of absolute — this can never overlap (worst case it wraps to its own line on an
                extra-wide multi-box creature), trading Han's original "impact-free centering" guarantee for
                robustness against content wider than any fixed pixel guess.
                #1028 (Han 2026-08-17, part 4, re-opening that tradeoff: "portret moet in het midden staan.
                momenteel wordt positie van portret beinvloed door de breedte van tags links en kleuren
                rechts"): the flex-row above only centers the STAGE relative to the leftover space after the
                side columns — unequal tag/option widths visibly push it off-center, exactly what Han flagged.
                A 3-column CSS GRID (`1fr auto stage-content 1fr`) fixes this for real: the two side columns
                are FORCED equal width (both `1fr`) regardless of their own content, so the middle (`auto`)
                column is always the true horizontal center of the row — not just "whatever's left over".
                `minWidth: 0` on the side columns stops their content from blowing out the equal-fr sizing (the
                default grid-item min-width is `auto`, which would otherwise let a wide tag list expand its
                column past its `1fr` share). Wrapping is no longer needed for the overflow case §870 solved —
                an extra-wide stage simply overflows its own `auto` column (same "never clipped" contract as
                before), it just doesn't ALSO drag the grid's column widths out of sync anymore. */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
                gap: '12px', width: '100%', minHeight: FRAME_SIZE * previewScale,
            }}>
                {/* #1028 follow-up (Han 2026-08-17, "tags en kleuren zijn goed, maar mogen ipv aligned tegen
                    de schermrand, strak tegen portret. (dus wissel rechts/links alignment van de tags en de
                    kleuren om.)"): each side column now hugs the CENTER (the portrait), not its own outer
                    grid-cell edge — tags right-align within their (left) cell, options left-align within
                    theirs (right) — swapped from the original edge-hugging layout. */}
                <div style={{ minWidth: 0, justifySelf: 'end' }}>{tagsColumn}</div>
                <div className="cc-enemy-stage" style={{ gap: '16px', justifySelf: 'center' }}>
                    {/* #1028 (part 3): avatar entries are a 13-layer paper doll, not a single spritesheet —
                        CharacterDoll (the SAME renderer the character creator/hero-on-staff use, §6d) replaces
                        CreatureSprite for exactly these two synthetic entries. `anim` here is already the
                        `{row,frames}` shape CharacterDoll expects (avatarCreature's `animations: ANIMATIONS`,
                        useBestiaryEditor.js — no `cells` conversion needed, unlike every other creature). */}
                    {creature.isAvatar
                        ? <CharacterDoll char={avatarChar} anim={anim} frame={frame} height={FRAME_SIZE * previewScale} />
                        : <CreatureSprite variant={variant} anim={anim} frame={frame} scale={previewScale} overlayUrls={overlayUrls} mirror={currentFacing !== 'right'} debugMode={debugMode} checkerScrollPx={checkerScrollPx} />}
                    {variant.portraitUrl && (
                        <PortraitImage url={variant.portraitUrl} cell={variant.portraitCell} frame={variant.portraitFrame}
                            size={64 * previewScale} animCols={variant.portraitAnimCols || 1} tick={frame}
                            oscillateSeed={variant.portraitOscillate ? creature.id : null} />
                    )}
                    {/* #693 round 3 ("portait/wizard: add the animated projectile right of the portrait") — a
                        THIRD box for creatures whose primary portrait slot is already taken by something else
                        (Wizard (Portrait)'s own 8-colour portrait crop), so the projectile companion needs its
                        OWN independent slot instead of overwriting the existing portrait. */}
                    {/* #693 round 12 (Han: "you flipped the wrong one. Flip both, to make it right."): both the
                        bestiary preview AND the level's own `Projectile` (SheetRpgLayer.jsx) mirror the
                        projectile's direction. */}
                    {variant.sidePortraitUrl && (
                        <PortraitImage url={variant.sidePortraitUrl} cell={variant.sidePortraitCell} frame={variant.sidePortraitFrame}
                            size={64 * previewScale} animCols={variant.sidePortraitAnimCols || 1} tick={frame}
                            oscillateSeed={creature.id} flip />
                    )}
                </div>
                {/* Left-aligned within its own column, mirroring tagsColumn's swap above — hugs the
                    portrait from the right side instead of the panel's outer edge. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start', minWidth: 0, justifySelf: 'start' }}>{optionsColumn}</div>
            </div>
            {/* #668 debug width×height overlay (Han: "toon de hxb van de spritesheet zodat ik kan checken")
                — the auto-scanned frame/crop guess is a PROPOSAL (no per-sheet hand measurement was
                possible for 289 files); this lets Han visually sanity-check it against the real sheet. */}
            {debugMode && (
                <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '16.5px', color: 'var(--text-secondary)' }}>
                    {variant.width ? `${variant.width}×${variant.height}px sheet, ` : ''}
                    {/* #1028 follow-up (Han: "maak p x q frame ook aanpasbaar... voor giant bat staat er
                        72x72, moet zijn 16x24"): click the WxH text to type a corrected frame size —
                        same click-to-edit pattern as the name title/tags above. */}
                    <FrameSizeText frame={variant.frame} onSetFrameSize={setFrameSize} />
                    {/* #1028 follow-up (Han: "creator/artist tag, enkel zichtbaar in debug mode") — asset
                        attribution, debug-only, never part of the tags/filter system. */}
                    {variant.artist ? ` — art: ${variant.artist}` : ''}
                </div>
            )}
            {/* #1028 follow-up (Han: "ik kan de kijkrichting niet aanpassen" — "een simpele links/rechts-
                mirror toggle per creature"). */}
            {debugMode && (
                <button onClick={toggleFacing} style={{ ...PILL_STYLE, cursor: 'pointer', alignSelf: 'center' }}>
                    Facing: {currentFacing === 'right' ? 'Right' : 'Left'}
                </button>
            )}
            {debugMode && (
                <MovementDebugBlock movement={currentMovement} frameCount={movementFrameCount} frame={frame}
                    onSetPxPerFrame={setMovementPxPerFrame} onSetFrameWeight={setFrameWeight} onToggleMode={toggleMovementMode} />
            )}
            {creature.blurb && <div className="cc-enemy-blurb">{creature.blurb}</div>}
            {/* #870 (Han 2026-08-12, "laat de animatie eronder staan, maar gebruik de volledige beschikbare
                breedte") — full width, below everything else (colours/togglers moved up into `optionsColumn`). */}
            <div className="cc-anims cc-enemy-anims" style={{ width: '100%' }}>
                {/* #790 (Han 2026-08-09, "tag alle flying animation, maak het vakje daarvan donkerblauw"):
                    a `flying`-tagged animation (generator-derived) gets a dark-blue tint so it reads as
                    "this one hovers/oscillates" at a glance, independent of which one is currently active. */}
                {visibleAnimations.map((a) => (
                    debugMode
                        ? <EditableAnimButton key={a.key} a={a} active={animKey === a.key}
                            onSelect={() => setAnimKey(a.key)}
                            onRename={(newKey) => setAnimKeyOverride(a, newKey)}
                            onEditCells={(cellsStr) => setAnimCells(a, cellsStr)}
                            formatCells={formatCellsInput}
                            onToggleFlying={() => toggleAnimFlying(a)}
                            onRemove={() => removeAnimation(a)} />
                        : (
                            <button key={a.key} className={`cc-anim${animKey === a.key ? ' active' : ''}`}
                                onClick={() => setAnimKey(a.key)}
                                style={a.tags?.includes('flying') ? { backgroundColor: '#16306b', color: '#fff' } : undefined}>
                                {a.label}
                            </button>
                        )
                ))}
                {debugMode && <AddAnimationControl onAdd={addAnimation} />}
            </div>
        </div>
    );
}

// #679 (Han 2026-08-03, "verplaats de navigatieknopjes naar de regel boven de bottom view"): the category
// selector (passive/attack/.../musicians) used to live in AvatarSubHeader's header row — this component
// rendered whichever ONE category was active. #870 (Han 2026-08-12, "de oude 'passive, with portrait, etc.'
// pre-selecties zijn vervangen voor het tag-systeem"): that category-tab browsing model is gone entirely —
// this now renders the FULL creature set (`editor.visibleCreatures`), narrowed only by `BestiaryFilterBar`.
// #870 (Han 2026-08-12, full tag-system rewrite): the being group (human/humanoid/animal/other, additive/
// OR, always ≥1 active, EXHAUSTIVE — every creature has exactly one, so unlike every row below it, this one
// gets no 'All' button, Han 2026-08-13: "behalve de bovenste... want die is wel exhaustief"), the townsfolk/
// hostile/nature row directly under it, the subtractive tag-chip rows, Mature's 3-state cycle, and a search
// box. Reuses `.cc-toggle-group`/`.cc-toggle` — the SAME chrome as the accessory/hat/sword togglers above
// (§6d — one visual language for "on/off choice", not a second bespoke filter-bar style) — except the being
// group, which uses `.cc-swatch`-style solid-active buttons since "OR, ≥1 active" reads more like a swatch
// selection than a plain on/off toggle.
const MATURE_MODE_LABEL = { off: 'Mature: Off', show: 'Mature: Show', only: 'Mature: Only' };
// #870 (Han 2026-08-13, "maak de tags per rij additief... voeg aan het eind van elke rij een knopje 'all'
// toe"): one shared row renderer for the townsfolk/hostile/nature row AND every `BESTIARY_FILTER_TAG_ROWS`
// row — same OR-within/AND-across mechanics, same chrome, same grey-out/reset-and-activate/All behaviour, so
// there's exactly one place this logic lives (§6d) instead of two near-duplicate blocks.
function TagRow({ row, editor }) {
    const { activeTags, toggleTagFilter, tagHasMatches, selectOnlyTag, clearTagRow } = editor;
    const rowActive = row.some((tag) => activeTags.has(tag));
    return (
        <div className="cc-toggle-group" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {row.map((tag) => {
                const active = activeTags.has(tag);
                // #870 (Han 2026-08-12, "maak tags waar geen subset voor bestaat grijs... op grijze tag
                // klikken: reset alle filters, en zet de grijze tag aan"): a tag with ZERO matching creatures
                // under the current being/mature/OTHER-rows filters (Han's own example: Human selected → no
                // Critter matches) renders greyed-out — click still works, but RESETS everything else first
                // instead of combining (which would just show 0 results). A tag's OWN row never greys it out
                // for what's already active in that SAME row (it's an OR group — see `tagHasMatches`).
                const available = tagHasMatches(tag);
                return (
                    <button key={tag}
                        className={`cc-toggle${active ? ' active' : ''}`}
                        onClick={() => (available ? toggleTagFilter(tag) : selectOnlyTag(tag))}
                        style={{
                            ...TAG_ROW_BUTTON_STYLE,
                            ...(active ? { backgroundColor: TAG_COLOR[tag], borderColor: TAG_COLOR[tag], color: '#fff' } : undefined),
                            ...(available ? undefined : { opacity: 0.35 }),
                        }}>
                        {formatTagLabel(tag)}
                    </button>
                );
            })}
            {/* Han: "voeg aan het eind van elke rij een knopje 'all' toe, die alle tags uitzet, en de
                filtergroep afzet (want de groepen zijn niet exhaustief)" — clears just THIS row. */}
            <button className={`cc-toggle${rowActive ? '' : ' active'}`} style={TAG_ROW_BUTTON_STYLE}
                onClick={() => clearTagRow(row)}>All</button>
        </div>
    );
}
function BestiaryFilterBar({ editor }) {
    const { activeBeings, toggleBeing, matureMode, cycleMatureMode, searchQuery, setSearchQuery } = editor;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
            <div className="cc-toggle-group">
                {/* #1028 follow-up (Han 2026-08-17, "kijk eens goed naar hoe de labels eruit zien, maak
                    consistent"): the being row and Mature button below were still plain `.cc-toggle`
                    (square corners, smaller/serif-inherited text) while every tag-row chip now gets
                    `TAG_ROW_BUTTON_STYLE` — the whole filter bar reads as one cohesive control now. */}
                {BESTIARY_BEINGS.map((being) => (
                    <button key={being} className={`cc-toggle${activeBeings.has(being) ? ' active' : ''}`}
                        onClick={() => toggleBeing(being)}
                        style={{ ...TAG_ROW_BUTTON_STYLE, ...(activeBeings.has(being) ? { backgroundColor: TAG_COLOR[being], borderColor: TAG_COLOR[being], color: '#fff' } : undefined) }}>
                        {being.charAt(0).toUpperCase() + being.slice(1)}
                    </button>
                ))}
            </div>
            <TagRow row={BESTIARY_TOWNSFOLK_ROW} editor={editor} />
            {BESTIARY_FILTER_TAG_ROWS.map((row, i) => <TagRow key={i} row={row} editor={editor} />)}
            <div className="cc-toggle-group">
                <button className={`cc-toggle${matureMode !== 'off' ? ' active' : ''}`} style={TAG_ROW_BUTTON_STYLE}
                    onClick={cycleMatureMode}>{MATURE_MODE_LABEL[matureMode]}</button>
            </div>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…" className="cc-search-input"
                style={{
                    fontFamily: 'Arial, sans-serif', fontSize: '16.5px', padding: '4px 10px',
                    borderRadius: '10px', border: '1px solid var(--text-secondary)', background: 'var(--panel-bg)',
                    color: 'var(--text-primary)', width: '220px',
                }} />
        </div>
    );
}

export function BestiaryBottomPanel({ editor, worldScale = null }) {
    const { visibleCreatures, selId, selectCreature } = editor;
    return (
        <div
            className={worldScale != null ? 'bestiary-pixel' : undefined}
            style={{ width: '100%', height: '100%', overflowY: 'auto', padding: '12px', ...(worldScale != null ? { '--bpx': `${worldScale}px` } : null) }}
        >
            <BestiaryFilterBar editor={editor} />
            <div className="cc-enemy-grid" style={{ justifyContent: 'center' }}>
                {visibleCreatures.map((c) => {
                    const rep = c.variants[0];
                    const idle = rep.animations[0];
                    return (
                        <button key={c.id} title={c.name}
                            className={`cc-thumb cc-enemy-thumb${c.id === selId ? ' active' : ''}`}
                            onClick={() => selectCreature(c.id)}>
                            {/* #1028 (part 3): avatar entries carry `{row,frames}` animations (CharacterDoll's
                                shape), not the `{cells}` shape every other creature's CreatureSprite expects —
                                same branch as BestiaryTopPanel, needed here too since this grid renders EVERY
                                visible creature's thumbnail, avatars included. */}
                            {c.isAvatar
                                ? <CharacterDoll char={{ gender: c.avatarGender, layers: { skin: rep.skinLayer } }} anim={idle} frame={0} height={FRAME_SIZE * THUMB_SCALE} />
                                : <CreatureSprite variant={rep} anim={idle} frame={0} scale={THUMB_SCALE} framed={false} mirror={rep.facing !== 'right'} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
