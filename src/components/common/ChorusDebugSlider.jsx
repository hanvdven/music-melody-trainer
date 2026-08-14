import React, { useState } from 'react';

/**
 * #990 (Han 2026-08-14): debug-only chorus-strength knob.
 *
 * Han asked for "in debugmode een handmatige chorus-strength regelaar zodat ik met keyboard kan
 * testen hoe het klinkt" — i.e. hear the effect with the piano/QWERTY/MIDI alone, completely
 * independent of any wrong-note judgment logic (that wiring is a follow-up ticket).
 *
 * The slider drives ONLY the currently-active clef/instrument-type (Han's explicit correction to
 * the plan's first proposal of "treble + bass simultaneously"): `staff` comes from
 * `resolveActiveInputStaff(activeTab, activeClef)` in App.jsx — the same input-mode resolution
 * Input Test Mode uses — so whatever you are actually playing is what you hear chorused.
 *
 * Styling deliberately mirrors the sibling MIDI debug dump in App.jsx (fixed top-right,
 * rgba(0,0,0,0.72), 10px monospace). CLAUDE.md §3a's SVG hit-box `<rect>` convention doesn't
 * apply to an HTML control, so the app's HTML-side debug convention is used instead: a cyan
 * outline (as App.jsx already does for its HTML hit targets) marks the real hit region.
 */
const ChorusDebugSlider = ({ staff, onChange }) => {
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
            position: 'fixed', top: 44, right: 4, zIndex: 99999,
            background: 'rgba(0,0,0,0.72)', color: '#6cf', font: '10px monospace',
            padding: '3px 6px', borderRadius: 4, pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', gap: 6,
            outline: '2px solid cyan',
        }}>
            <span>{`chorus:${staff}`}</span>
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
