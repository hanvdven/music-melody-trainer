import React, { useState } from 'react';

/**
 * #990 (Han 2026-08-14): debug-only chorus-strength knob.
 *
 * Han asked for "in debugmode een handmatige chorus-strength regelaar zodat ik met keyboard kan
 * testen hoe het klinkt" — i.e. hear the effect with the piano/QWERTY/MIDI alone, completely
 * independent of any wrong-note judgment logic (that wiring is a follow-up ticket).
 *
 * REWORK (Han 2026-08-14, UAT bounce on the first cut): the original design was ONE slider that
 * dynamically targeted "the currently active clef/instrument-type" via `resolveActiveInputStaff`.
 * That broke in practice — `activeTab` is the top-level nav tab, not which staff is enabled for
 * practice, so toggling the bass staff on/off from within the sheet-music view never changed
 * `activeTab` and the slider stayed stuck on treble. Han's concrete fix: "maak voor debug 4
 * sliders: chord, treble, bas, perc" — four independent, always-visible (while debugMode is on)
 * sliders, one per channel, each driving that ONE channel directly. This removes the whole class
 * of "which channel is active" bug for the debug UI. `resolveActiveInputStaff` /
 * `activeInputStaff.js` is left in place (unused here) — it may still be useful for non-debug
 * wiring later (e.g. the wrong-note follow-up ticket).
 *
 * This component is now a single reusable slider taking an explicit `label`/`type` — App.jsx
 * renders it 4 times (chords, treble, bass, percussion — NOT metronome), each instance calling
 * `setChorusStrength(type, value)` directly. No dynamic target resolution happens here or at the
 * call site anymore.
 *
 * Styling deliberately mirrors the sibling MIDI debug dump in App.jsx (fixed top-right,
 * rgba(0,0,0,0.72), 10px monospace). CLAUDE.md §3a's SVG hit-box `<rect>` convention doesn't
 * apply to an HTML control, so the app's HTML-side debug convention is used instead: a cyan
 * outline (as App.jsx already does for its HTML hit targets) marks the real hit region.
 */
const ChorusDebugSlider = ({ label, onChange, top = 44 }) => {
    // React state holds the slider POSITION only. This is legitimate here (a drag is a UI
    // gesture, not a per-note audio event) — but the audio call below is made IMPERATIVELY in
    // the same handler, never from a useEffect. Do not "optimise" it into one: routing an
    // AudioParam through a render pass is exactly the CLAUDE.md §6 invariant this app keeps
    // breaking (see chorusEffect.js setStrength).
    const [value, setValue] = useState(0);

    const handleInput = (e) => {
        const v = Number(e.target.value);
        setValue(v);
        onChange(v);
    };

    return (
        <div style={{
            position: 'fixed', top, right: 4, zIndex: 99999,
            background: 'rgba(0,0,0,0.72)', color: '#6cf', font: '10px monospace',
            padding: '3px 6px', borderRadius: 4, pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: 6,
            outline: '2px solid cyan',
        }}>
            <span>{`chorus:${label}`}</span>
            <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={value}
                onChange={handleInput}
                style={{ width: 90 }}
            />
            <span style={{ width: 26, textAlign: 'right' }}>{value.toFixed(2)}</span>
        </div>
    );
};

export default ChorusDebugSlider;
