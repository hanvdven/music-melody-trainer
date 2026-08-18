import React from 'react';
import { TIMING_ORDER, GRADE_LABELS } from '../../levels/gradeHit';

// #661/#662/#825/#862 (Han, various 2026-08 dates): the "Well done!" splash's stats chart, hand-rolled
// (no charting library in this project) but following the SAME colour convention as the in-game
// judgment labels (SheetRpgLayer's JUDGMENT_COLOR) so a colour means the same thing on the sheet and on
// the splash (§6d). Originally two separate charts (timing precision + note correctness); Han 2026-08-10
// ("de note correctness mag weg, want alle info staat nu in timing accuracy") — the timing chart now
// carries EVERY outcome (note-when-none-due, all 5 timing tiers with a corrected-hits sub-stack, and a
// missed/wrong-not-corrected sub-stack), so the separate correctness bar was pure duplication and is
// removed (§7 — delete unused code, don't leave it commented out).
//
// Han 2026-08-02: text in this SVG is NEVER the Maestro notation font (see CLAUDE.md §1a) — every
// <text> below sets an explicit CSS font (TEXT_FONT), never inherits.
export const TEXT_FONT = "Georgia, 'Times New Roman', serif";

// #825 (Han 2026-08-10): sourced from the shared --judgment-* CSS custom properties (src/styles/App.css)
// — the SAME tokens SheetRpgLayer.jsx's live popup uses — instead of an independently hardcoded hex
// map (the two had already started to diverge, e.g. 'missed' was grey here but a different grey in the
// popup). One source of truth, §6d.
const TIER_COLOR = {
    perfect: 'var(--judgment-perfect)', tooFast: 'var(--judgment-near)', tooSlow: 'var(--judgment-near)',
    muchTooFast: 'var(--judgment-far)', muchTooSlow: 'var(--judgment-far)',
    missed: 'var(--judgment-missed)', extraNote: 'var(--judgment-extra)',
};

// Order + labels come from gradeHit.js (single source of truth, §6c) — Han 2026-08-02: "maak de
// timing-as logisch": much too early → too early → perfect → too late → much too late.
// `extraNote` ("note when none due", Han 2026-08-10: "links van much too early") is PREPENDED — a note
// played while nothing was due has no position on the early↔late axis, reads as the "before everything
// else" outlier.
// Han 2026-08-10 round 2 ("wrong,corrected + too early... moet bovenop de too early staan"): a corrected
// hit DOES have a real timing tier (when the correction itself landed — useLevel.js's `timingTier`
// stat), so each of the 5 timing tiers is a 2-segment stack: its own colour (first-try hits in that
// tier) + `--judgment-corrected` blue ON TOP (corrected hits whose OWN timing landed in that tier).
// Han 2026-08-10 round 3 ("zet wrong,not corrected onder missed"): `missed` is now ALSO a 2-segment
// stack — `wrongUncorrected` (purple) as the BASE ("onder"), `missed` (grey) on top — both are "final,
// never-resolved" outcomes with no meaningful timing delta (wrongUncorrected is only known at slime
// EXPIRY, by which point "how early/late" no longer applies), so they're paired in the trailing bar
// instead of wrongUncorrected needing an unrelated 7th bar of its own.
export const TIMING_TIERS = [
    { key: 'extraNote', label: 'note when none due', color: TIER_COLOR.extraNote },
    ...TIMING_ORDER.map((key) => ({
        key, label: GRADE_LABELS[key], stacked: [
            { key, color: TIER_COLOR[key] },
            { key: `${key}Corrected`, color: 'var(--judgment-corrected)' },
        ],
    })),
    {
        key: 'missed', label: GRADE_LABELS.missed, stacked: [
            { key: 'wrongUncorrected', color: 'var(--judgment-wrong)' },
            { key: 'missed', color: TIER_COLOR.missed },
        ],
    },
];

// Han 2026-08-10 ("dan kan de legenda apart, onder de timing accuracy grafiek"): every distinct colour
// meaning used above, once — not per-bar repetition. `near`/`far` each cover 2 tiers (early+late share a
// colour, §6c: same tokens TIMING_TIERS itself already uses, not a second hardcoded map).
const TIMING_LEGEND_ITEMS = [
    { label: 'note when none due', color: TIER_COLOR.extraNote },
    { label: 'much too early / much too late', color: TIER_COLOR.muchTooFast },
    { label: 'too early / too late', color: TIER_COLOR.tooFast },
    { label: 'perfect', color: TIER_COLOR.perfect },
    { label: 'wrong, corrected', color: 'var(--judgment-corrected)' },
    { label: 'wrong, not corrected', color: 'var(--judgment-wrong)' },
    { label: 'missed', color: TIER_COLOR.missed },
];

export function TimingLegend() {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 10 }}>
            {TIMING_LEGEND_ITEMS.map((it) => (
                <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color, flexShrink: 0 }} />
                    {it.label}
                </div>
            ))}
        </div>
    );
}

// `stats.correct` isn't stored directly (useLevel only tracks the 5 timing tiers) — it's every FIRST-TRY
// correct hit regardless of timing tier, i.e. defeated minus the corrected-on-second-try kills.
export function computeCorrectCount(stats) {
    return Math.max(0, (stats.defeated || 0) - (stats.secondAttemptCorrected || 0));
}

// Total notes across all 5 mutually-exclusive FINAL verdicts (note-when-none-due / correct / corrected /
// wrong-not-corrected / missed) — the shared denominator for accuracy % (below) and, per-hand, for the
// #862 L/R split chart's percentage scaling.
export function computeTotalNotes(stats) {
    return (stats.extraNote || 0) + computeCorrectCount(stats) + (stats.secondAttemptCorrected || 0)
        + (stats.wrongUncorrected || 0) + (stats.missed || 0);
}

// Han 2026-08-10 — weighted accuracy, replaces the old `defeated/(defeated+misses)` formula:
//   score = perfect + (muchTooEarly + tooEarly + wrongCorrected + tooLate + muchTooLate) / 2
//   total = noteWhenNoneDue + correct + wrongCorrected + wrongNotCorrected + missed
// Perfect-timed correct notes count fully; correct-but-imperfectly-timed notes AND corrected-wrong
// notes count half; wrong (uncorrected) / missed / note-when-none-due count zero.
export function computeAccuracyPercent(stats) {
    const score = (stats.perfect || 0) + (
        (stats.muchTooFast || 0) + (stats.tooFast || 0) + (stats.secondAttemptCorrected || 0)
        + (stats.tooSlow || 0) + (stats.muchTooSlow || 0)
    ) / 2;
    const total = computeTotalNotes(stats);
    return total > 0 ? Math.round((score / total) * 100) : 100;
}

// #862 (Han 2026-08-10, "elke balk in twee gesplitst... L R"): useLevel.js's onHit/onMiss additionally
// bump a `${category}_${hand}` stat alongside the combined one (see useLevel.js's own comment) — this
// pulls the `_bass`/`_treble` slice back out into a plain stats-shaped object (same key names, suffix
// stripped) so TIMING_TIERS' existing per-key lookups work UNCHANGED against either the combined stats
// or one hand's slice (§6c — one rendering path, not two).
export function extractHandStats(stats, hand) {
    const suffix = `_${hand}`;
    const out = {};
    Object.keys(stats).forEach((k) => {
        if (k.endsWith(suffix)) out[k.slice(0, -suffix.length)] = stats[k];
    });
    return out;
}

export function tierTotal(tierDef, s) {
    return tierDef.stacked ? tierDef.stacked.reduce((sum, seg) => sum + (s[seg.key] || 0), 0) : (s[tierDef.key] || 0);
}

// #867 (Han 2026-08-18, "de notenbalk wordt de as"): renders the 7 TIMING_TIERS as bars scaled between
// explicit pixel bounds instead of a fixed chart box — lets the SAME tier/color/stacking logic that used
// to drive the floating LevelSplash modal chart (now deleted) instead draw directly onto the sheet-music
// staff lines (LevelResultOverlay.jsx passes yTop/yBottom = the staff's own top/bottom line, so the 5
// staff lines double as the 0/25/50/75/100% gridlines — exact match, no new axis needed). `handStats` is
// a stats-shaped object: pass `stats` for a combined chart, or `extractHandStats(stats, 'bass'|'treble')`
// for a per-hand chart (twoHanded levels, §862's L/R split — now one staff per hand instead of one bar
// split in two).
export function renderStaffTierBars({ handStats, x0, x1, yTop, yBottom, keyPrefix }) {
    const gap = 3;
    const slotW = (x1 - x0 - gap * (TIMING_TIERS.length - 1)) / TIMING_TIERS.length;
    const maxScale = Math.max(1, ...TIMING_TIERS.map((t) => tierTotal(t, handStats)));
    const plotH = yBottom - yTop;
    const toHeight = (v) => (v / maxScale) * plotH;
    return TIMING_TIERS.map((t, i) => {
        const x = x0 + i * (slotW + gap);
        const total = tierTotal(t, handStats);
        const totalH = toHeight(total);
        const topY = yBottom - totalH;
        const segs = t.stacked || [{ key: t.key, color: t.color }];
        let segY = yBottom;
        const rects = segs.map((seg) => {
            const segCount = handStats[seg.key] || 0;
            const segH = toHeight(segCount);
            segY -= segH;
            return segCount > 0 ? (
                <rect key={`${keyPrefix}-${t.key}-${seg.key}`} x={x} y={segY} width={slotW} height={Math.max(segH, 0.5)} fill={seg.color} />
            ) : null;
        });
        return (
            <g key={`${keyPrefix}-${t.key}`}>
                {rects}
                {total > 0 && (
                    <text x={x + slotW / 2} y={topY - 1.5} textAnchor="middle" fontSize="7" fontWeight="700"
                        fontFamily={TEXT_FONT} fill="var(--text-primary)">{total}</text>
                )}
            </g>
        );
    });
}
