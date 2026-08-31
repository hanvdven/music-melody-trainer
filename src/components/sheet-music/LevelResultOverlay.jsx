import React from 'react';
import { renderStaffTierBars, extractHandStats, TEXT_FONT } from '../levels/LevelStatsCharts';
import { chordRootY } from './ChordLabelsLayer';

// #867 (Han 2026-08-18, "ik wil de info zien op de plaats van de bladmuziek... de notenbalk wordt de
// as"): level-complete result view, drawn INSIDE SheetMusic's own SVG (same component, same box) —
// replaces the old floating LevelSplash overlay card, which has been deleted entirely.
//
// #1096 rework (Han 2026-08-20, "waarom gebruik je niet exact de settings overlay logica... veel
// cleaner"): this is now a first-class member of the SAME in-staff overlay family as
// InstrumentStaffOverlay/NoteColoringStaffOverlay/etc. — its own `useRangeMorph` "surface" (`kind:
// 'levelResult'`, SheetMusic.jsx), the SAME fade/fly transition those get, the SAME `className`-matched
// group `groupsForKind` looks up (`.level-result-overlay`), and the SAME "clicks inside never bubble to
// the sheet's close handler" convention (`stopPropagation` + a transparent full-bounds hit-rect,
// mirrored from SettingsOverlay.jsx). The bespoke covering `<rect fill="var(--panel-bg)">` this used to
// paint over the real notation is GONE — hiding the real content is now the shared
// `melodyHiddenDuringOverlay`/`overlayEditMode` mechanism's job (SheetMusic.jsx also gates the RPG layer
// on it now), not a hand-rolled rect that only ever covered PART of the scene ("een blok half over
// personage" — the RPG hero sprite lives outside `.notes-transition`, so the old rect's own bounds could
// never fully cover it).
//
// The treble/bass staff's 5 lines double as the chart's 0/25/50/75/100% axis (§6c/§6d: reuses
// LevelStatsCharts.jsx's TIMING_TIERS/renderStaffTierBars, the exact same tier/color logic the old
// modal chart used — not reimplemented). Two-handed levels: treble staff = right-hand bars, bass staff =
// left-hand bars (mirrors §862's L/R split, one staff per hand instead of one bar split in two).
// Single-hand levels: one combined chart on the treble staff; bass stays plain lines (or is omitted
// entirely if the level doesn't show a bass staff during play).
//
// KPI rows render at the canonical chord-label baseline (ChordLabelsLayer.chordRootY, §6d single source
// of truth) instead of a new position — Han: "je mag de KPI's op de chords regel zetten".
//
// Replay/Sluiten live here (top view, not the bottom DialogueBox panel — Han: "die horen bij de top
// view"), rendered via `<foreignObject>` so the existing `.ls-btn`/`.ls-actions` HTML chrome (App.css)
// can be reused as-is (§6d, not hand-rolled SVG buttons).
export default function LevelResultOverlay({
    startX, endX, trebleStart, bassStart, isTrebleVisible, isBassVisible,
    coverX, coverY, coverWidth, coverHeight,
    stats, twoHanded, rows, onReplay, onClose,
}) {
    const splitStats = twoHanded ? { bass: extractHandStats(stats, 'bass'), treble: extractHandStats(stats, 'treble') } : null;
    const trebleHandStats = twoHanded ? splitStats.treble : stats;
    const kpiSlotW = (endX - startX) / Math.max(1, rows.length);
    const kpiY = chordRootY(trebleStart);

    return (
        // stopPropagation here prevents all child-element clicks from bubbling to handleSheetMusicClick,
        // exactly like SettingsOverlay's own root `<g>` (§6d) — necessary now that this overlay's clicks
        // (the Opnieuw/Sluiten buttons especially) must never fall through to the sheet's own click
        // handling underneath.
        <g className="level-result-overlay" onClick={(e) => e.stopPropagation()}>
            {/* Transparent hit-zone covering the full overlay area — same purpose as SettingsOverlay's
                own: clicks on empty space INSIDE the overlay also stop propagation instead of falling
                through, without needing to paint over (and potentially mis-cover) anything underneath. */}
            <rect x={coverX} y={coverY} width={coverWidth} height={coverHeight} fill="transparent" style={{ cursor: 'default' }} />

            {isTrebleVisible && (
                <g transform={`translate(0, ${trebleStart})`}>
                    {/* #867 rework round 2 (Han 2026-08-20, "sleutels links in beeld houden"): these
                        synthetic lines only need to span the COVERED region (startX..endX) now — the real
                        staff lines + clef to the left of startX are left unobstructed (see coverX above),
                        so painting over them here (this overlay is last in paint order) would hide the
                        clef again despite the cover rect no longer covering it. */}
                    {[0, 10, 20, 30, 40].map((y) => (
                        <path key={`res-t-line-${y}`} d={`M ${startX} ${y} H ${endX}`} stroke="var(--text-primary)" strokeWidth="0.5" />
                    ))}
                    {renderStaffTierBars({ handStats: trebleHandStats, x0: startX, x1: endX, yTop: 0, yBottom: 40, keyPrefix: 'res-t' })}
                </g>
            )}

            {isBassVisible && (
                <g transform={`translate(0, ${bassStart})`}>
                    {[0, 10, 20, 30, 40].map((y) => (
                        <path key={`res-b-line-${y}`} d={`M ${startX} ${y} H ${endX}`} stroke="var(--text-primary)" strokeWidth="0.5" />
                    ))}
                    {twoHanded && renderStaffTierBars({ handStats: splitStats.bass, x0: startX, x1: endX, yTop: 0, yBottom: 40, keyPrefix: 'res-b' })}
                </g>
            )}

            {rows.map((r, i) => {
                const x = startX + i * kpiSlotW + kpiSlotW / 2;
                return (
                    <g key={r.label}>
                        <text x={x} y={kpiY} textAnchor="middle" fontFamily={TEXT_FONT} fontSize="20" fontWeight="700"
                            fill="var(--accent-yellow)" style={{ userSelect: 'none' }}>{r.value}</text>
                        {/* #867 rework round 2 (Han 2026-08-20, "Enemies vanquished... moet dezelfde stijl
                            hebben als label CHROMATONE"): the descriptive KPI label (not the big value
                            above) takes the SAME SVG-native carousel-label styling as the tier labels
                            below the bars — fontSize 11, sans-serif bold, ALL CAPS (§6c/§6d, one styling
                            source, not a second invented size). */}
                        <text x={x} y={kpiY + 16} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="bold"
                            fill="var(--text-secondary)" style={{ userSelect: 'none' }}>{r.label.toUpperCase()}</text>
                    </g>
                );
            })}

            <foreignObject x={startX} y={coverY + coverHeight - 40} width={endX - startX} height={34}>
                <div className="ls-actions" xmlns="http://www.w3.org/1999/xhtml">
                    <button className="ls-btn ls-replay" onClick={onReplay}>↻ Opnieuw</button>
                    <button className="ls-btn" onClick={onClose}>Sluiten</button>
                </div>
            </foreignObject>
        </g>
    );
}
