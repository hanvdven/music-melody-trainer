import React, { useMemo } from 'react';
import { buildScaleGrid } from '../../theory/scaleIcons';
import { scaleDefinitions } from '../../theory/scaleHandler';

// #352 (Han 2026-08-29): the world "Scales" view — a gallery with one ability-icon per scale,
// grouped by family (rows), mode I–VII as the column for the 5 genuinely-modal families. A white
// pixel-font Roman numeral (§351) sits over each modal icon. Clicking a cell selects it; details
// render in the bottom panel.
//
// Layout (Han r2–r4): icons render at the WORLD's game-pixel scale (32 gpx → `32·worldScale`
// screen-px); a plain 9-wide 32×32 grid, NO borders / frames / gaps / cell background. The icons
// are RE-COLOURED at build time into their scale's hepta-ref class palette
// (`scripts/build-scale-icon-map.mjs`), so the grid is colour-grouped by the art itself — no
// legend needed. Row (family) names in the pixel font.
//
// Data: `src/assets/ASSET DROP/ability icons/Animals-Icons-scalesl.csv` → baked into
// `scaleIconMap.generated.js` + `src/assets/scale-icons/` + `src/styles/classPalettes.generated.css`.

const TEXT_FONT = 'Georgia, "Times New Roman", serif';   // §1a — plain text never uses a notation font
const PIXEL_FONT = "'BestiaryPixel', Georgia, serif";    // carries the Ⅰ–Ⅶ mode glyphs (§351)
const COLS = 9;              // 9 columns so the widest non-modal families (9 scales) sit on one row
const ICON_GPX = 32;         // each icon is 32 game-pixels, drawn at ICON_GPX · scale
const DEFAULT_SCALE = 2;     // outside world mode (classic avatar context) there is no worldScale

// Ⅰ..Ⅶ (U+2160+) — the real Unicode Roman-numeral codepoints the pixel font was extended with (§351).
const romanGlyph = (mode) => (mode ? String.fromCodePoint(0x215f + mode) : '');

function Cell({ cell, cellPx, scale, selected, onSelect, debugMode }) {
    if (!cell) return <div style={{ width: cellPx, height: cellPx }} aria-hidden />;
    const isSel = selected && selected.family === cell.family && selected.name === cell.name;
    return (
        <div
            role="button"
            tabIndex={0}
            title={cell.name}
            onClick={() => onSelect(cell)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(cell); } }}
            style={{
                // gpx-perfect: an integer cellPx square, no border / frame / background / transform
                // (Han) — the re-coloured art carries the colour. Selection shows in the header +
                // bottom panel only.
                position: 'relative', width: cellPx, height: cellPx,
                display: 'block', cursor: 'pointer',
                outline: isSel ? `${scale}px solid var(--accent-yellow)` : 'none',
                outlineOffset: `-${scale}px`,
            }}
        >
            {cell.url
                ? <img src={cell.url} width={cellPx} height={cellPx} alt={cell.animal || cell.name}
                    style={{ imageRendering: 'pixelated', display: 'block' }} />
                : <span style={{ fontFamily: TEXT_FONT, fontSize: 9, color: 'var(--text-secondary)' }}>?</span>}

            {cell.roman && (
                <span style={{
                    // BestiaryPixel's native size is 16px (1 design-px = 1px there), so `16·scale`
                    // keeps the glyph gpx-perfect: 1 design-px == 1 game-pixel. Sits 2 gpx in from
                    // the cell's left and bottom edge (Han r6); no drop shadow.
                    position: 'absolute', left: 2 * scale, bottom: 2 * scale, fontFamily: PIXEL_FONT,
                    fontSize: 16 * scale, lineHeight: 1, color: '#fff', pointerEvents: 'none',
                }}>{romanGlyph(cell.mode) || cell.roman}</span>
            )}

            {/* §3a hit-box: debug-only, thin outline (no wash) so it doesn't drown the grid */}
            {debugMode && (
                <div style={{
                    position: 'absolute', inset: 0, border: `1px solid rgba(255,140,0,0.5)`,
                    pointerEvents: 'none',
                }} />
            )}
        </div>
    );
}

export function ScalesTopPanel({ debugMode = false, worldScale = null, selected = null, onSelect = () => {} }) {
    const grid = useMemo(() => buildScaleGrid(), []);
    const scale = worldScale || DEFAULT_SCALE;
    const cellPx = ICON_GPX * scale;

    return (
        <div style={{
            width: '100%', height: '100%', overflow: 'auto', boxSizing: 'border-box', padding: '10px 14px',
            fontFamily: TEXT_FONT, color: 'var(--text-primary)',
        }}>
            <div style={{ fontSize: 14, marginBottom: 8, color: 'var(--text-secondary)' }}>
                {selected
                    ? <><strong style={{ color: 'var(--accent-yellow)' }}>{selected.name}</strong>{' — '}{selected.family}
                        {selected.roman ? ` · ${selected.roman}` : ''}</>
                    : 'Kies een toonladder'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 'max-content' }}>
                {grid.map((row) => (
                    <div key={row.family} style={{ display: 'flex', alignItems: 'center', gap: 4 * scale }}>
                        <div style={{
                            // row (family) names also scale with the game pixel (Han r6) — BestiaryPixel
                            // native 16px, so `8·scale` is gpx-clean at even scales.
                            width: 52 * scale, flexShrink: 0, fontFamily: PIXEL_FONT, fontSize: 8 * scale,
                            textAlign: 'right', color: 'var(--text-secondary)', lineHeight: 1.15,
                        }}>{row.family}</div>
                        <div style={{
                            display: 'grid', gap: 0,
                            gridTemplateColumns: `repeat(${COLS}, ${cellPx}px)`,
                        }}>
                            {row.cells.map((cell, i) => (
                                <Cell key={cell ? cell.name : `empty-${row.family}-${i}`}
                                    cell={cell} cellPx={cellPx} scale={scale}
                                    selected={selected} onSelect={onSelect} debugMode={debugMode} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ScalesBottomPanel({ selected = null }) {
    const def = selected
        ? (scaleDefinitions[selected.family] || []).find((d) => d.name === selected.name)
        : null;

    if (!selected || !def) {
        return (
            <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: TEXT_FONT, fontSize: 13, color: 'var(--text-secondary)',
            }}>Selecteer een toonladder hierboven.</div>
        );
    }
    return (
        <div style={{
            width: '100%', height: '100%', boxSizing: 'border-box', padding: '14px 18px',
            fontFamily: TEXT_FONT, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
            <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                {selected.roman ? `${selected.roman}. ` : ''}{selected.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {selected.family}{def.diatonic ? ` · parent ${def.diatonic}` : ''}
                {selected.animal ? ` · ${selected.animal}` : ''}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                intervals: {Array.isArray(def.intervals) ? def.intervals.join('–') : '—'}
            </div>
        </div>
    );
}
