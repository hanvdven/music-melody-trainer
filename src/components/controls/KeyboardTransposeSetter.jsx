import React from 'react';
import PianoView from './PianoView';

// ── Keyboard transposition setter (Han 2026-06-13) ──────────────────────────
// Shown on the keyboard tab in NOTATION/TRANSPOSITION mode (clefEditMode), as the
// keyboard-side sibling of the staff's "concert C =" notation setter. The two are
// INDEPENDENT: the staff setter transposes the NOTATION; this transposes the input
// KEYBOARD (labels + sound + scale highlights), via `keyboardTranspose` (pitch class 0-11).
//
// UI: a single C4–C5 octave shown "as a normal keyboard" but WITHOUT octave subindex
// numbers. Clicking any key makes THAT key the new C — i.e. sets the transposition to the
// clicked key's pitch class. The playable RANGE is untouched; on close the real range keys
// are simply relabelled in the new transposition. Clicking C resets to concert (0).
const KeyboardTransposeSetter = ({
    scale, instrument, keyboardTranspose = 0, setKeyboardTranspose,
}) => (
    <div className="kbd-transpose-setter" data-settings-keepalive=""
        style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
            textAlign: 'center', padding: '6px 0 2px', color: 'var(--text-primary)',
            fontSize: 13, opacity: 0.8,
        }}>
            tap a key to make it <strong>C</strong> (transpose the input keyboard)
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
            <PianoView
                scale={scale}
                trebleInstrument={instrument}
                minNote="C4"
                maxNote="C5"
                interactionMode="set-transpose"
                transpose={keyboardTranspose}
                onTransposeSelect={setKeyboardTranspose}
                isHighlightActive={false}
            />
        </div>
    </div>
);

export default KeyboardTransposeSetter;
