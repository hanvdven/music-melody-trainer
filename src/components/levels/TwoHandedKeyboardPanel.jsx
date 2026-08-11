import React from 'react';
import PianoView from '../controls/PianoView';

// #FR2 (Han 2026-08-10, Level 15 "twee toetsen!!!"): replaces the normal single-keyboard TabView content
// while a `twoHanded` level (levels.json's `twoHanded: true`, currently only Level 15) is active — the
// player needs BOTH hands' keyboards visible simultaneously, which the app's existing one-keyboard-per-
// tab layout (TabView.jsx) has no room for. Two layouts, both required (Han, confirmed via interview):
//   'separate' — two FULL keyboards: the normal app-wide treble keyboard (unchanged, still rendered by
//     TabView elsewhere is NOT the case here — see below) plus a dedicated bass keyboard on the ZXCV.../
//     row (PianoView's 'bassRow' qwertyScheme).
//   'split'    — ONE keyboard visually split into a C3-G3 half (Q-T) and a C4-G4 half (I-]).
// Since TabView's normal tab bar is already suppressed while a level is active (`level.active ? null :
// ...` in App.jsx), replacing its content outright (not layering on top of it) is safe — there is no
// other tab content the player could otherwise reach mid-level.
export default function TwoHandedKeyboardPanel({
    scale, trebleInstrument, bassInstrument, noteColoringMode, theme,
    qwertyKeyboardActive, onTrebleNoteInput, onBassNoteInput,
    layout, onLayoutChange,
    // Bug fix (Han 2026-08-10, "twee klavieren: die tonen opeens full range, niet de level range"): the
    // visible keyboard range must ALWAYS be the level's own configured range (trebleSettings.range /
    // bassSettings.range) — for BOTH layouts, not just 'split'. There's no separate hardcoded range for
    // 'separate' mode; the QWERTY scheme (bassRow/app) can cover a wider physical-key span than what's
    // actually shown/playable — the scheme and the visible range are independent (PianoView's own
    // `playableNotes` gate already only assigns a key within whatever range is passed here).
    trebleRange, bassRange,
}) {
    // #861 (Han 2026-08-10, "hernoem 'gestapeld klavier': ik wil dat de twee klavieren boven elkaar
    // gerenderd worden, met basklavier onder treble klavier"): the 'separate' layout (two FULL
    // keyboards) is renamed to read "Gestapeld klavier" and now stacks vertically (treble on top, bass
    // below) instead of side by side. The 'split' layout (one keyboard divided into two note-range
    // halves) is UNCHANGED — a left/right split has no natural "stacked" reading, and Han's request was
    // specifically about the two-FULL-keyboards mode.
    const split = layout === 'split';
    const bassKeyboard = (
        <div key="bass" style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
            <PianoView
                scale={scale}
                trebleInstrument={bassInstrument}
                minNote={bassRange?.min}
                maxNote={bassRange?.max}
                noteColoringMode={noteColoringMode}
                onNoteInput={onBassNoteInput}
                qwertyKeyboardActive={qwertyKeyboardActive}
                qwertyScheme={split ? 'splitLeft' : 'bassRow'}
                theme={theme}
            />
        </div>
    );
    const trebleKeyboard = (
        <div key="treble" style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
            <PianoView
                scale={scale}
                trebleInstrument={trebleInstrument}
                minNote={trebleRange?.min}
                maxNote={trebleRange?.max}
                noteColoringMode={noteColoringMode}
                onNoteInput={onTrebleNoteInput}
                qwertyKeyboardActive={qwertyKeyboardActive}
                qwertyScheme={split ? 'splitRight' : 'app'}
                theme={theme}
            />
        </div>
    );
    return (
        <div className="two-handed-keyboard-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px' }}>
                <button
                    className="ls-btn"
                    onClick={() => onLayoutChange(split ? 'separate' : 'split')}
                    title="Wissel toetsenbord-indeling (gestapeld klavier / één gesplitst klavier)"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                >
                    {split ? '⌨ Gesplitst klavier' : '⌨⌨ Gestapeld klavier'}
                </button>
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 8, flexDirection: split ? 'row' : 'column' }}>
                {split ? <>{bassKeyboard}{trebleKeyboard}</> : <>{trebleKeyboard}{bassKeyboard}</>}
            </div>
        </div>
    );
}
