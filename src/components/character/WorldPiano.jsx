import React, { useRef, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { noteToMidi, getNoteSemitone } from '../../theory/noteUtils';
import { scaleKeyDisplayPC } from '../../theory/scaleKeyLabel';
import { deriveQwertyScheme } from '../../utils/qwertyScheme';
import { buildPianoWindow } from '../../theory/pianoKeyboardWindow';
import useQwertyPiano from '../../hooks/useQwertyPiano';

// #UI-overhaul (Han 2026-08-27/28): a pixel-art piano for world content-block 2, showing the keys
// that cover the active clef's SET RANGE (≥ 1 octave; out-of-range keys greyed — see
// pianoKeyboardWindow.js). From the "Pixel Piano 1.0" pack (src/assets/pixel-piano/, RagnaPixel,
// free/commercial). Han's brief
// (2026-08-28): "ik wil eigenlijk gewoon echt een kopie van pianoview hebben, maar met pixel art i.p.v.
// svg-toetsen" — so this shares PianoView's ACTUAL label spelling (`scaleKeyDisplayPC`), QWERTY
// mapping (`deriveQwertyScheme`) and highlight colours (`--white/black-key-color-*` CSS vars); only
// the key VISUAL is a sprite instead of an SVG rect.
//  - white keys = flat `White1` sprite (4×27 game px); black keys = `White` sprite (3×16), top-aligned.
//  - each key: the QWERTY letter in gray ABOVE the scale-aware note letter (both like PianoView), plus
//    a `mix-blend-mode: multiply` tint for tonic / in-scale keys.
//  - felt strip sits DIRECTLY on the keys (no gap). Above it the gold pixel "Melody" wordmark, and
//    above THAT an upside-down key reflection that fades out — never behind the wordmark itself.
// Fills its container at the LARGEST INTEGER scale per axis, independently. Playable via the SAME path
// the classic keyboard uses (`onNoteDown` + the shared `instrument` .start/.stop). Pointer + QWERTY +
// (App-owned, display-only) MIDI all light the keys.

const KEY_URLS = import.meta.glob('../../assets/pixel-piano/keys/*.png', { eager: true, query: '?url', import: 'default' });
const BLACK_URLS = import.meta.glob('../../assets/pixel-piano/black-keys/*.png', { eager: true, query: '?url', import: 'default' });
import feltUrl from '../../assets/pixel-piano/felt/Felt.png';

const keyUrl = (name) => KEY_URLS[`../../assets/pixel-piano/keys/${name}.png`];
const blackUrl = (name) => BLACK_URLS[`../../assets/pixel-piano/black-keys/${name}.png`];

const WHITE_W = 4, WHITE_H = 27;         // game px
const BLACK_W = 3, BLACK_H = 16;
const FELT_H = 2;
const BAND_H = 12;                       // band above the felt, holds the "Melody Hill" name
const REFL_H = Math.round(WHITE_H / 4);  // reflection ≈ quarter a key height (Han 2026-08-28: "minder")
const KEYS_MIN_GPX = 60;                 // HARD floor: the keys are never smaller than 60 world game px —
                                        // the reflection + wordmark clip off the top instead (Han 2026-08-28).
// The notional "fixed box" centred in content block 2 — block 2 minus its top/bottom padding. The
// piano stretches so the felt's top edge meets this box's top edge (Han 2026-08-28 round 4). Matches
// worldLayout's CONTENT_GPX_H_MIN (the conversation box in block 1 is exactly this tall).
const CENTRE_BOX_GPX = 64;
const OUT_OF_RANGE_TINT = 'rgba(128,128,128,0.62)';   // greys keys outside the set range (Han 2026-08-28)

const SEAM_COLOR = '#000';
const GOLD = '#e8b923';
const WHITE_LABEL_COLOR = '#3a3a3a';
const BLACK_LABEL_COLOR = '#c9ccd2';
const QWERTY_LABEL_COLOR = 'rgba(128,128,128,0.9)';   // PianoView's gray QWERTY label
// Note-letter size: match the bestiary text (`font-size: calc(--bpx * 13.72)`, --bpx = world scale N).
const BESTIARY_FONT_PER_SCALE = 13.72;

function Img({ url, w, h }) {
    if (!url) return null;
    return <img src={url} alt="" draggable={false} style={{ width: w, height: h, imageRendering: 'pixelated', display: 'block', pointerEvents: 'none' }} />;
}

export default function WorldPiano({
    instrument, onNoteDown, onNoteUp, debugMode = false, scale = 1, keyScale = null,
    // The active clef's set note range (`{min,max}` note names). The keyboard shows the keys covering
    // it (≥ 1 octave); keys outside the range are greyed. Omitted → a plain C4→C5 octave.
    rangeMin = null, rangeMax = null,
    // QWERTY input: 'auto' = on when the device has a fine pointer (i.e. a real keyboard).
    qwertyActive = 'auto',
    // Notes currently held via GLOBAL MIDI (owned by App's useMidiInput) — for key-light only; App
    // already plays the sound + routes combat, so WorldPiano must NOT re-trigger those.
    midiHeld = null,
}) {
    // The visible key window for the set range (Han 2026-08-28 — see pianoKeyboardWindow.js).
    const { whites, blacks, rangeLoMidi, rangeHiMidi } = useMemo(
        () => buildPianoWindow(rangeMin || 'C4', rangeMax || 'C5', keyScale?.tonic || 'C4'),
        [rangeMin, rangeMax, keyScale?.tonic],
    );
    const outOfRange = (note) => {
        const m = noteToMidi(note);
        return m != null && (m < rangeLoMidi || m > rangeHiMidi);
    };
    const wrapRef = useRef(null);
    const [finePointer] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches);
    const qwertyOn = qwertyActive === 'auto' ? finePointer : !!qwertyActive;
    const [box, setBox] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const [held, setHeld] = useState({});
    const press = useCallback((note) => {
        setHeld((h) => ({ ...h, [note]: true }));
        const midi = noteToMidi(note);
        if (instrument && midi != null) { try { instrument.start({ note: midi, velocity: 100 }); } catch { /* smplr not ready */ } }
        onNoteDown?.(note, true);
    }, [instrument, onNoteDown]);
    const release = useCallback((note) => {
        setHeld((h) => { const n = { ...h }; delete n[note]; return n; });
        const midi = noteToMidi(note);
        if (instrument && midi != null) { try { instrument.stop({ note: midi }); } catch { /* */ } }
        onNoteUp?.(note, false);
    }, [instrument, onNoteUp]);
    const hit = (note) => ({
        onPointerDown: (e) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); press(note); },
        onPointerUp: (e) => { e.stopPropagation(); release(note); },
        onPointerLeave: () => release(note),   // release() is a no-op if the note isn't held
        onPointerCancel: () => release(note),
    });

    // QWERTY: derive the key→note mapping from the SAME window, via the app's canonical
    // `deriveQwertyScheme` (§6d — no second table).
    const { keysToNotes, noteToKey } = useMemo(() => {
        const first = `${whites[0].pc}${whites[0].oct}`;
        const last = `${whites[whites.length - 1].pc}${whites[whites.length - 1].oct}`;
        const sc = deriveQwertyScheme(first, last);
        const k2n = {}, n2k = {};
        whites.forEach(({ pc, oct }, i) => { const key = sc.whiteKeys[i]; if (key) { k2n[key] = `${pc}${oct}`; n2k[`${pc}${oct}`] = key.toUpperCase(); } });
        blacks.forEach(({ pc, oct, after }) => { const key = sc.blackGapKeys?.[after]; if (key) { k2n[key] = `${pc}${oct}`; n2k[`${pc}${oct}`] = String(key).toUpperCase(); } });
        return { keysToNotes: k2n, noteToKey: n2k };
    }, [whites, blacks]);
    useQwertyPiano({ active: qwertyOn, keysToNotes, onNoteOn: press, onNoteOff: release });

    // Vertical scale (Han 2026-08-28 round 4). The keys ALWAYS bottom-anchor to block 2's bottom edge
    // (the wrapper's `flex-end`); the board stretches UP so the FELT's top reaches the top of the
    // notional CENTRE_BOX_GPX-tall box centred in block 2 (block 2 minus its top/bottom padding):
    //   feltTop ≈ (box.h − CENTRE_BOX_GPX·scale) / 2  from block 2's top
    //   ⇒ keysH + feltH ≈ (box.h + CENTRE_BOX_GPX·scale) / 2,  keysH = WHITE_H·sy, feltH = FELT_H·sy
    // `sy` solves that, then SNAPS to a whole multiple of the world scale so every key edge sits on a
    // game-pixel boundary ("natuurlijk gpx-perfect"), and to keys ≥ KEYS_MIN_GPX game px. If block 2
    // is too short to also fit the band + reflection above the felt, those clip off the top
    // (`overflow: hidden` on the wrapper) — allowed (Han: "weerkaatsing en Melody Hill mag afgesneden
    // worden").
    const kMin = Math.ceil(KEYS_MIN_GPX / WHITE_H);                    // keys ≥ 60 gpx ⇒ k ≥ 3
    const kIdeal = box.h > 0
        ? (box.h + CENTRE_BOX_GPX * scale) / (2 * (WHITE_H + FELT_H) * scale)
        : kMin;
    // Cap so the keys themselves never exceed block 2's height (they'd clip off the top, which is
    // fine for the band/reflection but not the keys). If even `kMin` doesn't fit, the keys win and
    // drop below the 60-gpx floor.
    const kFit = box.h > 0 ? Math.floor(box.h / (WHITE_H * scale)) : Infinity;
    const k = Math.max(1, Math.min(Math.max(kMin, Math.round(kIdeal)), kFit || 1));
    const sy = k * scale;
    // Seam = 1 game px at the WORLD scale N (Han 2026-08-28: "1 gpx, niet 1px … maar zonder de extra
    // piano schalingsfactor") — NOT multiplied by the piano's own fill-scale sx.
    const SEAM = Math.max(1, Math.round(scale));
    const nWhite = whites.length;
    // Largest integer white-key scale that fits the block width once the REAL seam width is accounted
    // for (was over-reserved, leaving a visible centred gutter).
    const sx = Math.max(1, Math.floor((box.w - (nWhite - 1) * SEAM) / (nWhite * WHITE_W)));
    const whiteW = WHITE_W * sx, whiteH = WHITE_H * sy;
    const blackW = BLACK_W * sx, blackH = BLACK_H * sy;
    const blackRaise = 1 * sy;   // black keys sit 1 game-px·sy higher — they spill onto the felt.
    const keysW = nWhite * whiteW + (nWhite - 1) * SEAM;
    const boardW = keysW;
    // Han 2026-08-28: "je mag de HELE breedte van content 1 gebruiken" — stretch the (integer-scaled)
    // board horizontally to fill the block exactly, so there's no leftover gutter. Vertical scale
    // stays strictly integer.
    const fillX = boardW > 0 && box.w > 0 ? Math.max(1, box.w / boardW) : 1;
    const bandH = BAND_H * sy, feltH = FELT_H * sy;
    const reflZoneH = REFL_H * sy;
    const letterPx = Math.max(6, Math.round(BESTIARY_FONT_PER_SCALE * scale));
    const qwertyPx = Math.max(5, Math.round(letterPx * 0.72));

    // Scale-aware display letter for a physical note ("C4" → "c"; "A♭4" → "a♭" in F major, "g♯" in D).
    const letterFor = (note) => (keyScale ? scaleKeyDisplayPC(note, keyScale) : note.replace(/-?\d+$/, '')).toLowerCase();
    // Tonic / in-scale tint, same CSS vars + rule as PianoView's 'highlight' scheme (multiply blend
    // over the white sprite). null = no tint.
    const tonicSt = keyScale?.tonic != null ? getNoteSemitone(keyScale.tonic) : null;
    const tintFor = (note, isBlack) => {
        if (!keyScale || !Array.isArray(keyScale.notes)) return null;
        const st = getNoteSemitone(note);
        if (tonicSt != null && st === tonicSt) return 'var(--white-key-color-tonic)';
        if (keyScale.notes.some((s) => getNoteSemitone(s) === st)) {
            return isBlack ? 'var(--black-key-color-highlight)' : 'var(--white-key-color-highlight)';
        }
        return null;
    };

    // The two stacked labels every key carries — QWERTY key (gray) above the note name. `oor` (out of
    // range) dims both.
    const keyLabels = (note, down, black, oor) => (
        <>
            {qwertyOn && noteToKey[note] && (
                <span style={{
                    position: 'absolute', left: 0, right: 0, bottom: (down ? 3 : 4) * sy + letterPx + Math.max(1, sy),
                    textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: qwertyPx,
                    lineHeight: 1, color: QWERTY_LABEL_COLOR, opacity: oor ? 0.4 : 1,
                    pointerEvents: 'none', whiteSpace: 'nowrap',
                }}>{noteToKey[note]}</span>
            )}
            <span style={{
                position: 'absolute', left: 0, right: 0, bottom: (down ? 3 : 4) * sy,
                textAlign: 'center', fontFamily: "'BestiaryPixel', monospace", fontSize: letterPx,
                lineHeight: 1, color: black ? BLACK_LABEL_COLOR : WHITE_LABEL_COLOR, opacity: oor ? 0.4 : 1,
                pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'visible',
            }}>{letterFor(note)}</span>
        </>
    );

    // The playable keys (white row + black overlay). Reflected above (mirror=true) and drawn for real
    // below; the reflection tracks `held`/`midiHeld` too so a pressed key lights up in the mirror.
    const keysBoard = (mirror = false) => (
        <div style={{ position: 'relative', width: keysW, height: whiteH, pointerEvents: mirror ? 'none' : 'auto' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: SEAM }}>
                {whites.map(({ pc, oct }, i) => {
                    const note = `${pc}${oct}`;
                    const down = !!held[note] || !!(midiHeld && midiHeld[note]);
                    const oor = outOfRange(note);
                    const tint = oor ? null : tintFor(note, false);
                    return (
                        <div key={i} {...(mirror ? {} : hit(note))} style={{ width: whiteW, height: whiteH, cursor: mirror ? 'default' : 'pointer', flexShrink: 0, position: 'relative' }}>
                            <Img url={keyUrl(`White1${down ? 'Pressed' : ''}`) || keyUrl('White1')} w={whiteW} h={whiteH} />
                            {tint && <div style={{ position: 'absolute', inset: 0, background: tint, mixBlendMode: 'multiply', pointerEvents: 'none' }} />}
                            {oor && <div style={{ position: 'absolute', inset: 0, background: OUT_OF_RANGE_TINT, pointerEvents: 'none' }} />}
                            {!mirror && keyLabels(note, down, false, oor)}
                            {debugMode && !mirror && <div style={{ position: 'absolute', inset: 0, outline: '1px solid rgba(255,140,0,0.6)' }} />}
                        </div>
                    );
                })}
            </div>
            {/* black 1-game-px (world scale N) seams between white keys — drawn explicitly, never a
                container background (which bled through the sprites' transparent top edge). */}
            {whites.slice(1).map((_, k) => {
                const j = k + 1;
                return <div key={`seam${j}`} style={{ position: 'absolute', top: 0, bottom: 0, left: j * whiteW + (j - 1) * SEAM, width: SEAM, background: SEAM_COLOR, pointerEvents: 'none' }} />;
            })}
            {blacks.map(({ pc, oct, after }, i) => {
                const note = `${pc}${oct}`;
                const down = !!held[note] || !!(midiHeld && midiHeld[note]);
                const oor = outOfRange(note);
                const tint = oor ? null : tintFor(note, true);
                const bx = (after + 1) * whiteW + after * SEAM + SEAM / 2 - blackW / 2;
                return (
                    // Raised `blackRaise` px so the black key spills up onto the felt (Han 2026-08-28).
                    <div key={i} {...(mirror ? {} : hit(note))} style={{ position: 'absolute', left: bx, top: -blackRaise, width: blackW, height: blackH, cursor: mirror ? 'default' : 'pointer', zIndex: 3 }}>
                        {/* the black key body fades to 30% alpha over its bottom 2·sy so the white key
                            underneath shows through — a glossy "reflection" on the key's lip
                            (Han 2026-08-28). Seam lines + labels stay outside this mask. */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            WebkitMaskImage: `linear-gradient(to bottom, #000 0, #000 calc(100% - ${2 * sy}px), rgba(0,0,0,0.30) 100%)`,
                            maskImage: `linear-gradient(to bottom, #000 0, #000 calc(100% - ${2 * sy}px), rgba(0,0,0,0.30) 100%)`,
                        }}>
                            <Img url={blackUrl(`White${down ? 'Pressed' : ''}`) || blackUrl('White')} w={blackW} h={blackH} />
                            {/* black sprite is near-black, so `multiply` would swallow the tint —
                                `screen` lets the highlight colour show (Han: "andere blend mode nodig"). */}
                            {tint && <div style={{ position: 'absolute', inset: 0, background: tint, mixBlendMode: 'screen', pointerEvents: 'none' }} />}
                            {oor && <div style={{ position: 'absolute', inset: 0, background: OUT_OF_RANGE_TINT, pointerEvents: 'none' }} />}
                        </div>
                        {/* 1-game-px seam flanking the black key, ONLY beside the white keys (from the
                            white-key top down) — none on the raised bit that sits over the felt
                            (Han 2026-08-28). May sit over the white key. */}
                        <div style={{ position: 'absolute', top: blackRaise, bottom: 0, left: -SEAM, width: SEAM, background: SEAM_COLOR, pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', top: blackRaise, bottom: 0, right: -SEAM, width: SEAM, background: SEAM_COLOR, pointerEvents: 'none' }} />
                        {/* and one along the black key's bottom edge (Han 2026-08-28) */}
                        <div style={{ position: 'absolute', left: -SEAM, right: -SEAM, bottom: -SEAM, height: SEAM, background: SEAM_COLOR, pointerEvents: 'none' }} />
                        {!mirror && keyLabels(note, down, true, oor)}
                        {debugMode && !mirror && <div style={{ position: 'absolute', inset: 0, outline: '1px solid rgba(255,140,0,0.8)' }} />}
                    </div>
                );
            })}
        </div>
    );

    // "Melody Hill" — sized to the key letters (Han 2026-08-28 round 2: "de tekst Melody Hill is ook
    // heel erg groot t.o.v. de piano"). Was `max(5·sy, letterPx)`, which ballooned when `sy` grew to
    // fill a tall block; now `sy` is bounded (see above) and the wordmark just tracks `letterPx`.
    const melodyPx = letterPx;
    const melodyTop = Math.round((bandH - melodyPx) / 2);

    return (
        <div ref={wrapRef} style={{
            position: 'relative', width: '100%', height: '100%',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden',
        }}>
            <div style={{ position: 'relative', width: boardW, flexShrink: 0, transform: `scaleX(${fillX})`, transformOrigin: 'bottom center' }}>
                {/* upside-down mirror of the keys — bottom edge at the felt's top, rising up BEHIND the
                    "Melody" band (`zIndex: 1` < the band's `zIndex: 3`). The band background is
                    transparent, so the reflection shows around the wordmark while the opaque gold text
                    renders OVER it (Han 2026-08-28: "de tekst moet OVER de weerkaatsing"). The mirror
                    never contains the wordmark itself, and the wordmark has no shadow. Fades to fully
                    transparent by half a key height. */}
                <div aria-hidden style={{
                    position: 'absolute', left: 0, bottom: whiteH + feltH + sy, width: keysW, height: reflZoneH,
                    overflow: 'hidden', pointerEvents: 'none', zIndex: 1,
                    WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.30) 0%, transparent 100%)',
                    maskImage: 'linear-gradient(to top, rgba(0,0,0,0.30) 0%, transparent 100%)',
                }}>
                    <div style={{ position: 'absolute', left: 0, bottom: 0, width: keysW, height: whiteH, transform: 'scaleY(-1)' }}>
                        {keysBoard(true)}
                    </div>
                </div>

                {/* gold "Melody Hill" name — whole-pixel position for the pixel font, no shadow, above
                    the reflection. */}
                <div style={{ position: 'relative', zIndex: 3, width: boardW, height: bandH, pointerEvents: 'none' }}>
                    <span style={{
                        position: 'absolute', left: 0, right: 0, top: melodyTop, textAlign: 'center',
                        fontFamily: "'BestiaryPixel', monospace", color: GOLD, letterSpacing: Math.max(1, sx),
                        fontSize: melodyPx, lineHeight: 1, whiteSpace: 'nowrap',
                    }}>Melody Hill</span>
                </div>
                {/* felt strip — sits DIRECTLY on the keys, no margin (Han 2026-08-28). */}
                <div style={{
                    position: 'relative', zIndex: 2, width: boardW, height: feltH,
                    backgroundImage: `url("${feltUrl}")`, backgroundRepeat: 'repeat-x',
                    backgroundSize: `auto ${feltH}px`, imageRendering: 'pixelated',
                }} />
                {/* the keys */}
                {keysBoard(false)}
            </div>
        </div>
    );
}
