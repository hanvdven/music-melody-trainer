import React from 'react';
import { TIMING_ORDER, GRADE_LABELS } from '../../levels/gradeHit';

// #661/#662 (Han 2026-08-02): two SVG charts for the "Well done!" splash, hand-rolled (no charting
// library in this project) but following the SAME colour convention as the in-game judgment labels
// (SheetRpgLayer's JUDGMENT_COLOR) so a colour means the same thing on the sheet and on the splash (§6d).
// Han: "maken we meteen onderscheid tussen timing precision en note accuracy" — TWO separate charts,
// both now full-width and stacked (§662 removed the redundant KPI stat rows to make room, see LevelSplash):
//   1. TimingBarChart — WHEN a correct note was played (5 timing tiers from gradeHit + trailing 'missed').
//   2. NoteCorrectnessBar — WHETHER the pitch was right at all (4 outcomes), as a single stacked bar
//      (was a donut gauge with a centre %; Han 2026-08-02: "stacked bar ipv pie", drop the % — the
//      segments/counts speak for themselves).
// "missed" (a note never attempted) is deliberately OUT of the correctness bar (Han's 4-colour list
// omitted it) — it's a timing/attempt failure, not a pitch-accuracy question; it still has its own bar
// in TimingBarChart.
//
// Han 2026-08-02: text in this SVG is NEVER the Maestro notation font (see CLAUDE.md §1a) — every
// <text> below sets an explicit CSS font (TEXT_FONT), never inherits.
const TEXT_FONT = "Georgia, 'Times New Roman', serif";

const TIER_COLOR = {
    perfect: '#2eb84d', tooFast: '#d4a800', tooSlow: '#d4a800', muchTooFast: '#e07818', muchTooSlow: '#e07818',
    missed: '#888888',
};
// Order + labels come from gradeHit.js (single source of truth, §6c) — Han 2026-08-02: "maak de
// timing-as logisch": much too early → too early → perfect → too late → much too late. `missed` (Han:
// "voeg aan timing accuracy toe: missed") is appended as its own trailing bar — a note that was never
// attempted at all has no timing/position on the early↔late axis, so it sits outside the 5-tier order.
const TIMING_TIERS = [...TIMING_ORDER, 'missed'].map((key) => ({ key, label: GRADE_LABELS[key], color: TIER_COLOR[key] }));

const CHART_W = 360, BAR_CHART_H = 120, BAR_GAP = 8;

// Bar chart of the 5 gradeHit timing tiers (counts only — Han confirmed bars over a raw-ms box plot).
export function TimingBarChart({ stats }) {
    const counts = TIMING_TIERS.map((t) => stats[t.key] || 0);
    const max = Math.max(1, ...counts);
    const barW = (CHART_W - BAR_GAP * (TIMING_TIERS.length - 1)) / TIMING_TIERS.length;
    const plotH = BAR_CHART_H - 34;   // leave room for the count + label below each bar
    return (
        <svg viewBox={`0 0 ${CHART_W} ${BAR_CHART_H}`} width="100%" height={BAR_CHART_H} role="img" aria-label="Timing accuracy">
            {TIMING_TIERS.map((t, i) => {
                const h = (counts[i] / max) * plotH;
                const x = i * (barW + BAR_GAP);
                const y = plotH - h;
                return (
                    <g key={t.key}>
                        <rect x={x} y={y} width={barW} height={Math.max(h, counts[i] > 0 ? 2 : 0)} rx={2} fill={t.color} />
                        <text x={x + barW / 2} y={plotH - h - 4} textAnchor="middle" fontSize="11" fontWeight="700"
                            fontFamily={TEXT_FONT} fill="var(--text-primary)">{counts[i]}</text>
                        <text x={x + barW / 2} y={BAR_CHART_H - 4} textAnchor="middle" fontSize="8.5"
                            fontFamily={TEXT_FONT} fill="var(--text-secondary)">{t.label}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// #662 (Han 2026-08-02): "note when none due" (extraNote) reuses the SAME neutral grey as Timing
// accuracy's 'missed' bar (TIER_COLOR.missed above) — both are "outside the score" outcomes (a note
// that was never attempted / a keypress with no note due), not a graded timing or pitch result.
const CORRECTNESS_SEGMENTS = [
    { key: 'correct', label: 'correct', color: '#2eb84d' },
    { key: 'secondAttemptCorrected', label: 'wrong, corrected', color: '#2e9bb8' },
    { key: 'wrongUncorrected', label: 'wrong within time', color: '#e63232' },
    { key: 'extraNote', label: 'note when none due', color: TIER_COLOR.missed },
];

const BAR_H = 28;

// #662 (Han 2026-08-02, "Note correctness, stacked bar ipv pie"): a single full-width bar split into
// the 4 pitch-correctness outcomes, proportional to their share of the total — replaces the old donut
// gauge (no more centre accuracy %, Han: "weglaten" — the counts/segments speak for themselves).
// `stats.correct` isn't stored directly (useLevel only tracks the 5 timing tiers) — it's every FIRST-TRY
// correct hit regardless of timing tier, i.e. defeated minus the corrected-on-second-try kills.
export function NoteCorrectnessBar({ stats }) {
    const correct = Math.max(0, (stats.defeated || 0) - (stats.secondAttemptCorrected || 0));
    const values = { correct, ...stats };
    const total = CORRECTNESS_SEGMENTS.reduce((sum, s) => sum + (values[s.key] || 0), 0);

    let x = 0;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <svg viewBox={`0 0 ${CHART_W} ${BAR_H}`} width="100%" height={BAR_H} role="img" aria-label="Note accuracy">
                <rect x={0} y={0} width={CHART_W} height={BAR_H} rx={4} fill="var(--text-dim)" opacity={0.25} />
                {total > 0 && CORRECTNESS_SEGMENTS.map((s) => {
                    const v = values[s.key] || 0;
                    if (v === 0) return null;
                    const w = (v / total) * CHART_W;
                    const el = <rect key={s.key} x={x} y={0} width={w} height={BAR_H} fill={s.color} />;
                    x += w;
                    return el;
                })}
            </svg>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 10 }}>
                {CORRECTNESS_SEGMENTS.map((s) => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        {s.label} ({values[s.key] || 0})
                    </div>
                ))}
            </div>
        </div>
    );
}
