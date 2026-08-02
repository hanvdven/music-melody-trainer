import React from 'react';
import { TIMING_ORDER, GRADE_LABELS } from '../../levels/gradeHit';

// #661 (Han 2026-08-02): two small SVG charts for the "Well done!" splash, hand-rolled (no charting
// library in this project) but following the SAME colour convention as the in-game judgment labels
// (SheetRpgLayer's JUDGMENT_COLOR) so a colour means the same thing on the sheet and on the splash (§6d).
// Han: "maken we meteen onderscheid tussen timing precision en note accuracy" — TWO separate charts:
//   1. TimingBarChart  — WHEN a correct note was played (5 timing tiers from gradeHit), counts only.
//   2. NoteCorrectnessGauge — WHETHER the pitch was right at all (4 outcomes), as a donut + centre %.
// "missed" (a note never attempted) is deliberately OUT of the correctness gauge (Han's 4-colour list
// omitted it) — it is a timing/attempt failure, not a pitch-accuracy question; it still shows in the
// plain stat rows above the charts.
//
// Han 2026-08-02: text in this SVG is NEVER the Maestro notation font (see CLAUDE.md §1a) — every
// <text> below sets an explicit CSS font (TEXT_FONT), never inherits.
const TEXT_FONT = "Georgia, 'Times New Roman', serif";

const TIER_COLOR = { perfect: '#2eb84d', tooFast: '#d4a800', tooSlow: '#d4a800', muchTooFast: '#e07818', muchTooSlow: '#e07818' };
// Order + labels come from gradeHit.js (single source of truth, §6c) — Han 2026-08-02: "maak de
// timing-as logisch": much too early → too early → perfect → too late → much too late.
const TIMING_TIERS = TIMING_ORDER.map((key) => ({ key, label: GRADE_LABELS[key], color: TIER_COLOR[key] }));

const CHART_W = 320, BAR_CHART_H = 120, BAR_GAP = 10;

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

const CORRECTNESS_SEGMENTS = [
    { key: 'correct', label: 'correct', color: '#2eb84d' },
    { key: 'secondAttemptCorrected', label: 'wrong, corrected', color: '#2e9bb8' },
    { key: 'wrongUncorrected', label: 'wrong within time', color: '#e63232' },
    { key: 'extraNote', label: 'note when none due', color: '#9b59b6' },
];

const GAUGE_SIZE = 140, GAUGE_R = 52, GAUGE_STROKE = 16;
const CIRC = 2 * Math.PI * GAUGE_R;

// Donut gauge — 4 pitch-correctness outcomes as coloured arc segments + overall accuracy % in the centre.
// `stats.correct` isn't stored directly (useLevel only tracks the 5 timing tiers) — it's every FIRST-TRY
// correct hit regardless of timing tier, i.e. defeated minus the corrected-on-second-try kills.
export function NoteCorrectnessGauge({ stats }) {
    const correct = Math.max(0, (stats.defeated || 0) - (stats.secondAttemptCorrected || 0));
    const values = { correct, ...stats };
    const total = CORRECTNESS_SEGMENTS.reduce((sum, s) => sum + (values[s.key] || 0), 0);
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 100;

    let offset = 0;
    const cx = GAUGE_SIZE / 2, cy = GAUGE_SIZE / 2;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <svg viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`} width={GAUGE_SIZE} height={GAUGE_SIZE} role="img" aria-label="Note accuracy">
                <circle cx={cx} cy={cy} r={GAUGE_R} fill="none" stroke="var(--text-dim)" strokeWidth={GAUGE_STROKE} opacity={0.25} />
                {total > 0 && CORRECTNESS_SEGMENTS.map((s) => {
                    const v = values[s.key] || 0;
                    if (v === 0) return null;
                    const frac = v / total;
                    const dash = frac * CIRC;
                    const el = (
                        <circle key={s.key} cx={cx} cy={cy} r={GAUGE_R} fill="none" stroke={s.color}
                            strokeWidth={GAUGE_STROKE} strokeDasharray={`${dash} ${CIRC - dash}`}
                            strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
                    );
                    offset += dash;
                    return el;
                })}
                <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="800" fontFamily={TEXT_FONT} fill="var(--text-primary)">{accuracy}%</text>
                <text x={cx} y={cy + 16} textAnchor="middle" fontSize="9" fontFamily={TEXT_FONT} fill="var(--text-secondary)">accuracy</text>
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
