import React from 'react';
import RpgLevelBottomPanel from '../character/RpgLevelBottomPanel';
import WorldPiano from '../character/WorldPiano';
import WorldNavBar from './WorldNavBar';
import { CONTENT1_GPX_W_MIN, CONTENT2_GPX_W_MIN, CONTENT_GPX_H_MIN } from '../../utils/worldLayout';

// #UI-overhaul Stap 3 (Han 2026-08-27): the world-mode bottom area — the nav block + the two content
// blocks, placed by absolute position from computeWorldLayout's rects (viewport coords minus the
// world's screen height). Block 1 holds the conversation (RpgLevelBottomPanel, rendered at the
// world's level scale); block 2 is reserved.
//
// Debug (Han 2026-08-27): the blue tint marks only the EXTRA room — the centred minimum rectangle
// (256×64 gpx for block 1, 192×64 gpx for block 2) stays transparent, so the min size vs. the slack
// is visually distinct. Done with a `border` (blue only in the margin, nothing in the middle).
const PAD_TINT = 'rgba(33, 150, 243, 0.18)';

export default function WorldBottomArea({
    layout, rpgLevel, context, getConversationProfile, debugMode,
    screen, setScreen, onStartLevel, setDebugMode, onExitToClassic,
    pianoInstrument, onPianoNote, keyScale, pianoRangeMin, pianoRangeMax, midiHeld, qwertyActive,
}) {
    const { scale, world, nav, content } = layout;
    const offY = world.screenH;

    const place = (r) => ({
        position: 'absolute', left: r.x, top: r.y - offY, width: r.screenW, height: r.screenH,
        boxSizing: 'border-box', overflow: 'hidden',
    });

    // Blue frame that fills only the slack around the centred minimum rect (minWgpx×minHgpx · scale).
    const padFrame = (r, minGpxW) => {
        if (!debugMode) return null;
        const px = Math.max(0, (r.screenW - minGpxW * scale) / 2);
        const py = Math.max(0, (r.screenH - CONTENT_GPX_H_MIN * scale) / 2);
        return (
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', boxSizing: 'border-box',
                borderStyle: 'solid', borderColor: PAD_TINT,
                borderTopWidth: py, borderBottomWidth: py, borderLeftWidth: px, borderRightWidth: px,
            }} />
        );
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <div style={place(nav)}>
                <WorldNavBar
                    screen={screen} setScreen={setScreen} onStartLevel={onStartLevel}
                    debugMode={debugMode} setDebugMode={setDebugMode} onExitToClassic={onExitToClassic}
                    scale={scale} cols={nav.cols} rows={nav.rows}
                />
            </div>

            <div style={place(content.block1)}>
                {padFrame(content.block1, CONTENT1_GPX_W_MIN)}
                <RpgLevelBottomPanel
                    rpgLevel={rpgLevel} context={context} getConversationProfile={getConversationProfile}
                    worldScale={scale}
                />
            </div>

            <div style={place(content.block2)}>
                {padFrame(content.block2, CONTENT2_GPX_W_MIN)}
                <WorldPiano
                    instrument={pianoInstrument}
                    onNoteDown={(note) => onPianoNote?.(note, true)}
                    debugMode={debugMode}
                    scale={scale}
                    keyScale={keyScale}
                    rangeMin={pianoRangeMin}
                    rangeMax={pianoRangeMax}
                    midiHeld={midiHeld}
                    qwertyActive={qwertyActive}
                />
            </div>
        </div>
    );
}
