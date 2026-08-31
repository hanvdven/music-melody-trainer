import React from 'react';
import { Swords, Bug, Music } from 'lucide-react';
import { SCREENS } from './AvatarSubHeader';
import { NAV_GPX } from '../../utils/worldLayout';

// #UI-overhaul Stap 1/3 (Han 2026-08-27): world-mode navigation. Without `scale` it's the normal
// 52px header row (used by world sub-screens like bestiary). With `scale` (the world's integer N) it
// becomes a pixel-perfect BLOCK of 16×16 game-px icons laid out in a `cols × rows` grid
// (computeWorldLayout decides: 1×8 = 16×128 gpx, 2×4 = 32×64 gpx, or 8×1 = 128×16 gpx horizontal
// strip). Chrome is stripped: bare icon buttons, no `app-header-btn` padding. Han will swap the
// placeholder lucide icons for pixel art.
//
// The 9 icons: the 6 screen buttons (character / stats / equipment / bestiary / scales / rpg-level —
// from AvatarSubHeader's shared SCREENS list, §6d) then Start level, Debug, Music view (→ classic
// root). Keep NAV_ICON_COUNT in worldLayout.js in sync with this count.
export default function WorldNavBar({
    screen, setScreen, onStartLevel, debugMode, setDebugMode, onExitToClassic,
    scale = null, cols = 8, rows = 1,
}) {
    const pixel = typeof scale === 'number' && scale > 0;
    const iconPx = pixel ? NAV_GPX * scale : 22;

    const items = [
        ...SCREENS.map(({ key, label, Icon }) => ({ key, title: label, Icon, active: screen === key, onClick: () => setScreen(key) })),
        { key: 'start-level', title: 'Start level', Icon: Swords, active: false, onClick: onStartLevel },
        { key: 'debug', title: 'Toggle debug mode (shows clickable zones)', Icon: Bug, active: !!debugMode, onClick: () => setDebugMode?.((d) => !d) },
        { key: 'music-view', title: 'Music view', Icon: Music, active: false, onClick: onExitToClassic },
    ];

    if (!pixel) {
        return (
            <div style={{
                width: '100%', minHeight: '52px', display: 'flex', flexWrap: 'wrap',
                alignItems: 'center', justifyContent: 'center', gap: '8px', borderBottom: '1px solid #333',
            }}>
                {items.map(({ key, title, Icon, active, onClick }) => (
                    <button key={key} onClick={onClick} title={title}
                        className={`tab-button secondary app-header-btn${active ? ' active' : ''}`}
                        style={{ color: active ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>
                        <Icon size={iconPx} />
                    </button>
                ))}
            </div>
        );
    }

    // Both orientations SPREAD the 8 icons `space-evenly` across the full available extent (Han
    // 2026-08-27): horizontal (rows === 1) = a full-width row; vertical = a full-height column
    // (`width` = cols·iconPx, wrapping to a 2nd column only when the 2×4 grid was chosen because
    // 1×8 didn't fit the height).
    const horizontalStrip = rows === 1;
    return (
        <div style={horizontalStrip ? {
            display: 'flex', width: '100%', height: iconPx,
            alignItems: 'center', justifyContent: 'space-evenly',
            imageRendering: 'pixelated',
        } : {
            display: 'flex', flexDirection: 'column', flexWrap: cols > 1 ? 'wrap' : 'nowrap',
            width: cols * iconPx, height: '100%',
            justifyContent: 'space-evenly', alignContent: 'space-evenly', alignItems: 'center',
            imageRendering: 'pixelated',
        }}>
            {items.map(({ key, title, Icon, active, onClick }) => (
                <button key={key} onClick={onClick} title={title}
                    style={{
                        width: iconPx, height: iconPx, padding: 0, border: 'none', background: 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        color: active ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                    }}>
                    <Icon size={iconPx} />
                </button>
            ))}
        </div>
    );
}
