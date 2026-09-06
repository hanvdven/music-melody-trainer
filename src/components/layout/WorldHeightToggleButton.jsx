import React from 'react';

// UI world-height toggle (Han 2026-09-04): "als het 'wereld' beeld lager is dan 320 GPX, wil ik een
// knopje rechtsbovenin om het volle hoogte te geven ... bij volle hoogte moet het knopje weer terug
// naar standaardhoogte gaan" — a single toggle button, top-right of the world block. The actual
// height reallocation (which of content1/content2/nav survive) lives in `worldLayout.js`
// `computeWorldFullHeightLayout`; this component is pure chrome.
//
// A real DOM <button> — its own rendered box IS its hit box, so there is no separate debug-rect to
// draw (CLAUDE.md §3a exists for hit regions that DIVERGE from what is drawn; a plain button has none).
export default function WorldHeightToggleButton({ active, onToggle }) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            title={active ? 'Terug naar standaardhoogte' : 'Volledige hoogte'}
            aria-label={active ? 'Terug naar standaardhoogte' : 'Volledige hoogte'}
            style={{
                position: 'absolute', top: 4, right: 4, zIndex: 7,
                width: 22, height: 22, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4,
                fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13, lineHeight: 1,
                cursor: 'pointer',
            }}
        >
            {active ? '⤡' : '⤢'}
        </button>
    );
}
