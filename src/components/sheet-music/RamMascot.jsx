import React, { useEffect, useRef, useState } from 'react';
import { useRoundState } from '../../contexts/RoundStateContext';

// ── RAM mascot (#297, Han: "clippy maar dan een ram") ────────────────────────
//
// A small anime-style ram living in the SVG header ABOVE the BPM display
// (Han Q2: "svg header"; the viewBox starts at y=−30, so the ram occupies the
// band above the tempo term). Hand-drawn vector artwork (Han Q1: yes, Claude
// draws it) — line-art in the sheet's own colours so it works in every theme:
// strokes var(--text-primary), horns var(--accent-yellow).
//
// EXPRESSIONS follow the input test (RoundStateContext.inputTestState):
//   happy — a note was just answered correctly (successes flash)
//   proud — every 10th correct note (streak milestone)
//   oef   — a miss / TOO SLOW (lastMissAt bumped)
//   neutral otherwise; a slow idle bob keeps him alive (CSS keyframes — our own
//   element, NOT one of the rAF-animated melody layers, so §6 doesn't apply).
//
// SPEECH is deliberately sparse (Han Q3: "af en toe"): at most one bubble per
// SPEECH_COOLDOWN_MS, 2.5 s long. Tapping the ram always answers with a bleat
// (its own shorter cooldown). Coupling to the adaptive-difficulty engine
// ("let's slow down…") is ticket #307 — it waits for #144.
//
// §3a: the tap target renders its debug hit box in debugMode.

const EXPRESSION_MS = { happy: 1200, proud: 2200, oef: 1600 };
const SPEECH_MS = 2500;
const SPEECH_COOLDOWN_MS = 20000;
const TAP_COOLDOWN_MS = 5000;

// Anchor: above the BPM block (tempo term baseline sits at trebleStart−89 = 11).
const RAM_X = 30;
const RAM_Y = -27;   // top of the artwork; it spans ~30 units down to y≈3
const HIT = { x: RAM_X - 6, y: RAM_Y - 2, w: 44, h: 34 };

const PRIMARY = 'var(--text-primary)';
const HORN = 'var(--accent-yellow, #e0b64d)';

const RamMascot = ({ debugMode = false }) => {
    const { inputTestState } = useRoundState();

    const [expression, setExpression] = useState('neutral');
    const [speech, setSpeech] = useState(null);
    const exprTimerRef = useRef(null);
    const speechTimerRef = useRef(null);
    const lastSpeechAtRef = useRef(0);
    const lastTapAtRef = useRef(0);
    const prevMissAtRef = useRef(null);
    const prevCorrectRef = useRef(0);
    const missStreakRef = useRef(0);

    const show = (expr, ms) => {
        setExpression(expr);
        if (exprTimerRef.current) clearTimeout(exprTimerRef.current);
        exprTimerRef.current = setTimeout(() => setExpression('neutral'), ms);
    };
    // Sparse speech (Han Q3): silently dropped while cooling down.
    const say = (text, cooldownMs = SPEECH_COOLDOWN_MS) => {
        const now = Date.now();
        if (now - lastSpeechAtRef.current < cooldownMs) return;
        lastSpeechAtRef.current = now;
        setSpeech(text);
        if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
        speechTimerRef.current = setTimeout(() => setSpeech(null), SPEECH_MS);
    };

    // React to the input test: misses → oef; correct notes → happy, every 10th → proud.
    useEffect(() => {
        const s = inputTestState;
        if (!s) return;
        if (s.lastMissAt && s.lastMissAt !== prevMissAtRef.current) {
            prevMissAtRef.current = s.lastMissAt;
            missStreakRef.current += 1;
            show('oef', EXPRESSION_MS.oef);
            if (missStreakRef.current >= 3) { say('Oef…'); missStreakRef.current = 0; }
            return;
        }
        const correct = s.correctNotes || 0;
        if (correct > prevCorrectRef.current) {
            prevCorrectRef.current = correct;
            missStreakRef.current = 0;
            if (correct % 10 === 0) {
                show('proud', EXPRESSION_MS.proud);
                say('Well done!');
            } else {
                show('happy', EXPRESSION_MS.happy);
            }
        } else if (correct < prevCorrectRef.current) {
            prevCorrectRef.current = correct; // test reset
        }
    }, [inputTestState]);

    useEffect(() => () => {
        if (exprTimerRef.current) clearTimeout(exprTimerRef.current);
        if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    }, []);

    const handleTap = (e) => {
        e.stopPropagation();
        const now = Date.now();
        if (now - lastTapAtRef.current < TAP_COOLDOWN_MS) return;
        lastTapAtRef.current = now;
        show('happy', EXPRESSION_MS.happy);
        say('Beh!', 0);
    };

    // ── Facial features per expression (all authored around the face centre) ──
    const cx = RAM_X + 16, cy = RAM_Y + 18; // face centre
    const eyes = () => {
        switch (expression) {
            case 'happy': // ∪-curved happy eyes
                return (
                    <>
                        <path d={`M ${cx - 7.5} ${cy - 2} q 2.5 3 5 0`} stroke={PRIMARY} strokeWidth="1.1" fill="none" />
                        <path d={`M ${cx + 2.5} ${cy - 2} q 2.5 3 5 0`} stroke={PRIMARY} strokeWidth="1.1" fill="none" />
                    </>
                );
            case 'proud': // smug closed lids + blush
                return (
                    <>
                        <path d={`M ${cx - 7.5} ${cy - 1.5} h 5`} stroke={PRIMARY} strokeWidth="1.1" />
                        <path d={`M ${cx + 2.5} ${cy - 1.5} h 5`} stroke={PRIMARY} strokeWidth="1.1" />
                        <circle cx={cx - 8} cy={cy + 3.5} r={1.6} fill={HORN} opacity={0.5} />
                        <circle cx={cx + 8} cy={cy + 3.5} r={1.6} fill={HORN} opacity={0.5} />
                    </>
                );
            case 'oef': // >< squeezed eyes
                return (
                    <>
                        <path d={`M ${cx - 8} ${cy - 4} l 4.5 2.5 l -4.5 2.5`} stroke={PRIMARY} strokeWidth="1" fill="none" />
                        <path d={`M ${cx + 8} ${cy - 4} l -4.5 2.5 l 4.5 2.5`} stroke={PRIMARY} strokeWidth="1" fill="none" />
                    </>
                );
            default: // neutral dots
                return (
                    <>
                        <circle cx={cx - 5} cy={cy - 1.5} r={1.2} fill={PRIMARY} />
                        <circle cx={cx + 5} cy={cy - 1.5} r={1.2} fill={PRIMARY} />
                    </>
                );
        }
    };
    const mouth = () => {
        switch (expression) {
            case 'happy':
            case 'proud':
                return <path d={`M ${cx - 3} ${cy + 4.5} q 3 3 6 0`} stroke={PRIMARY} strokeWidth="1" fill="none" />;
            case 'oef':
                return <ellipse cx={cx} cy={cy + 5.5} rx={1.8} ry={2.4} stroke={PRIMARY} strokeWidth="1" fill="none" />;
            default:
                return <path d={`M ${cx - 2} ${cy + 5} h 4`} stroke={PRIMARY} strokeWidth="1" fill="none" />;
        }
    };

    return (
        <g className="ram-mascot" data-settings-keepalive="">
            {/* Idle bob lives on an inner group so the tap hit rect stays put. */}
            <g className="ram-mascot-bob" style={{ pointerEvents: 'none' }}>
                {/* Curled horns — the ram's signature, in the accent colour. */}
                <path d={`M ${cx - 9} ${cy - 8} c -6 -2 -8 4 -4 7 c 3 2 6 0 5 -3`}
                    stroke={HORN} strokeWidth="1.6" fill="none" strokeLinecap="round" />
                <path d={`M ${cx + 9} ${cy - 8} c 6 -2 8 4 4 7 c -3 2 -6 0 -5 -3`}
                    stroke={HORN} strokeWidth="1.6" fill="none" strokeLinecap="round" />
                {/* Wool cap: a cloud of arcs over the crown. */}
                <path d={`M ${cx - 8} ${cy - 9}
                          a 4 4 0 0 1 5 -3.5 a 4.5 4.5 0 0 1 6 0 a 4 4 0 0 1 5 3.5`}
                    stroke={PRIMARY} strokeWidth="1.2" fill="none" strokeLinecap="round" />
                {/* Ears, slightly droopy. */}
                <path d={`M ${cx - 10} ${cy - 6} q -5 1 -4.5 5 q 3.5 0.5 5 -2.5`}
                    stroke={PRIMARY} strokeWidth="1.1" fill="none" strokeLinecap="round" />
                <path d={`M ${cx + 10} ${cy - 6} q 5 1 4.5 5 q -3.5 0.5 -5 -2.5`}
                    stroke={PRIMARY} strokeWidth="1.1" fill="none" strokeLinecap="round" />
                {/* Face: soft rounded muzzle. */}
                <path d={`M ${cx - 9} ${cy - 7}
                          q -2 8 2 12 q 3.5 4 7 4 q 3.5 0 7 -4 q 4 -4 2 -12`}
                    stroke={PRIMARY} strokeWidth="1.2" fill="none" strokeLinecap="round" />
                {eyes()}
                {mouth()}
            </g>

            {/* Speech bubble — sparse by design (Han Q3). */}
            {speech && (
                <g style={{ pointerEvents: 'none' }}>
                    <rect x={cx + 16} y={cy - 14} width={speech.length * 4.4 + 10} height={13}
                        rx={6} fill="var(--panel-bg, #1c1c1c)" stroke={PRIMARY} strokeWidth="0.5" />
                    <path d={`M ${cx + 17} ${cy - 3} l -4 4 l 6 -1 z`} fill="var(--panel-bg, #1c1c1c)"
                        stroke={PRIMARY} strokeWidth="0.5" />
                    <text x={cx + 21} y={cy - 4.8} fontSize={7.5} fontFamily="sans-serif"
                        fill={PRIMARY}>{speech}</text>
                </g>
            )}

            {/* Tap target + §3a debug hit box. */}
            <rect x={HIT.x} y={HIT.y} width={HIT.w} height={HIT.h} fill="transparent"
                style={{ cursor: 'pointer' }} onClick={handleTap} />
            {debugMode && (
                <rect x={HIT.x} y={HIT.y} width={HIT.w} height={HIT.h}
                    fill="orange" fillOpacity={0.4} stroke="orange" strokeWidth={1}
                    style={{ pointerEvents: 'none' }} />
            )}
        </g>
    );
};

export default RamMascot;
