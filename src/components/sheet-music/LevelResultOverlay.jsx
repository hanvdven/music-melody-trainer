import React from 'react';
import { renderStaffTierBars, extractHandStats, TEXT_FONT } from '../levels/LevelStatsCharts';
import { chordRootY } from './ChordLabelsLayer';

// #867 (Han 2026-08-18, "ik wil de info zien op de plaats van de bladmuziek... de notenbalk wordt de
// as"): level-complete result view, drawn INSIDE SheetMusic's own SVG (same component, same box) —
// replaces the old floating LevelSplash overlay card, which has been deleted entirely.
//
// Painted LAST in SheetMusic's return tree (after every other layer) so it sits on top in SVG paint
// order; a covering rect hides the real notation underneath instead of threading a suppression flag
// through SheetMusic's note-rendering tree, which forks per animation mode (pagination/wipe/scroll) and
// is one of the most invariant-sensitive parts of the app (CLAUDE.md §6/§6d). The covering approach is
// purely additive — zero changes to that existing tree, so none of its timing/opacity/transition
// invariants are at risk. The hidden notation still renders underneath (wasted paint), which is an
// acceptable trade — this is a level-result screen, not a 60fps-animated state.
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
export default function LevelResultOverlay({
    startX, endX, trebleStart, bassStart, isTrebleVisible, isBassVisible,
    coverX, coverY, coverWidth, coverHeight,
    stats, twoHanded, rows,
}) {
    const splitStats = twoHanded ? { bass: extractHandStats(stats, 'bass'), treble: extractHandStats(stats, 'treble') } : null;
    const trebleHandStats = twoHanded ? splitStats.treble : stats;
    const kpiSlotW = (endX - startX) / Math.max(1, rows.length);
    const kpiY = chordRootY(trebleStart);

    return (
        <g data-level-result-overlay="">
            <rect x={coverX} y={coverY} width={coverWidth} height={coverHeight} fill="var(--panel-bg)" />

            {isTrebleVisible && (
                <g transform={`translate(0, ${trebleStart})`}>
                    {[0, 10, 20, 30, 40].map((y) => (
                        <path key={`res-t-line-${y}`} d={`M 0 ${y} H ${endX}`} stroke="var(--text-primary)" strokeWidth="0.5" />
                    ))}
                    {renderStaffTierBars({ handStats: trebleHandStats, x0: startX, x1: endX, yTop: 0, yBottom: 40, keyPrefix: 'res-t' })}
                </g>
            )}

            {isBassVisible && (
                <g transform={`translate(0, ${bassStart})`}>
                    {[0, 10, 20, 30, 40].map((y) => (
                        <path key={`res-b-line-${y}`} d={`M 0 ${y} H ${endX}`} stroke="var(--text-primary)" strokeWidth="0.5" />
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
                        <text x={x} y={kpiY + 13} textAnchor="middle" fontFamily={TEXT_FONT} fontSize="8"
                            fill="var(--text-secondary)" style={{ userSelect: 'none' }}>{r.label}</text>
                    </g>
                );
            })}
        </g>
    );
}
