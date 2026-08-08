import React from 'react';
import { User, BarChart2, Shirt, BookOpen, Trees } from 'lucide-react';

// #667 (Han 2026-08-03, "de sub-header row krijgt nieuwe iconen, dus kunnen navigeren tussen avatar en
// bestiary"): replaces the normal <SubHeader> row while avatar-context is active (screen is one of
// 'character'/'stats'/'equipment'/'bestiary'). Reuses the app's existing tab-button chrome (§6d — same
// classes as every other header icon button) rather than inventing new styling.
// #679/#681 (Han 2026-08-03/04 — CORRECTION: "ik bedoelde dat de subtypes in de navigator kwamen te staan
// waar nu staat top bottom percussion... die bottom view settings zijn redundant in bestiary mode"): the
// category tabs do NOT belong in this row (an earlier round put them here — reverted). Han meant the OTHER
// nav row — the app's main bottom-panel tab bar (TOP/BOTTOM/PERCUSSION/.../PROFILE, App.jsx's `TABS`) — see
// App.jsx's MENU SELECTOR column, which now swaps to category tabs while avatar-context is active.
// #691 (Han 2026-08-04, "maak een extra tab: 'rpg level'"): a 5th avatar-context screen, a dev/preview
// tile-scene tab (Han's own framing when asked: "dev/preview tab naast Bestiary... nog niet gewired in
// echte gameplay") — sits alongside Bestiary, not replacing anything.
const SCREENS = [
    { key: 'character', label: 'Character', Icon: User },
    { key: 'stats', label: 'Stats', Icon: BarChart2 },
    { key: 'equipment', label: 'Equipment', Icon: Shirt },
    { key: 'bestiary', label: 'Bestiary', Icon: BookOpen },
    { key: 'rpg-level', label: 'RPG Level', Icon: Trees },
];

export default function AvatarSubHeader({ screen, setScreen }) {
    return (
        // Matches SubHeader's own root box height (52px, unscaled) so swapping the two rows never jumps
        // the layout below it.
        <div style={{
            width: '100%', height: '52px', boxSizing: 'border-box', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
            {SCREENS.map(({ key, label, Icon }) => (
                <button key={key}
                    className={`tab-button secondary app-header-btn${screen === key ? ' active' : ''}`}
                    onClick={() => setScreen(key)}
                    title={label}
                    style={{ color: screen === key ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>
                    <Icon size={22} />
                </button>
            ))}
        </div>
    );
}
