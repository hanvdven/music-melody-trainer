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
const TEXT_FONT = "Georgia, 'Times New Roman', serif";

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
const TIMING_TIERS = [
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

function tierTotal(tierDef, s) {
    return tierDef.stacked ? tierDef.stacked.reduce((sum, seg) => sum + (s[seg.key] || 0), 0) : (s[tierDef.key] || 0);
}

const CHART_W = 360, BAR_CHART_H = 220, BAR_GAP = 8, AXIS_W = 22;

// One bar (or, in split mode, one L/R pair) per TIMING_TIERS entry. `splitStats` (#862, twoHanded levels
// only — App.jsx only passes it when the level is twoHanded) = `{ bass, treble }`, each a stats-shaped
// object (via extractHandStats). When present, every slot renders TWO sub-bars side by side, each scaled
// to a PERCENTAGE of THAT HAND's own total notes (Han: "links 8x perfect = 100%, en rechts 121x perfect
// en toch maar 30%, want veel meer noten") — a shared 0–100% axis makes the two comparable despite wildly
// different note counts. Without `splitStats`, renders exactly as before: one bar per slot, raw counts,
// self-scaled to the chart's own max.
export function TimingBarChart({ stats, splitStats }) {
    const plotH = BAR_CHART_H - 40;   // room for the count/label row below + a little headroom above
    const leftMargin = splitStats ? AXIS_W : 0;
    const usableW = CHART_W - leftMargin;
    const slotW = (usableW - BAR_GAP * (TIMING_TIERS.length - 1)) / TIMING_TIERS.length;
    const combinedMax = splitStats ? 1 : Math.max(1, ...TIMING_TIERS.map((t) => tierTotal(t, stats)));
    const bassTotal = splitStats ? Math.max(1, computeTotalNotes(splitStats.bass)) : 1;
    const trebleTotal = splitStats ? Math.max(1, computeTotalNotes(splitStats.treble)) : 1;

    // Renders one bar (stacked or plain) at (x, width w) for stats object `s`, scaled by `toHeight(count)
    // -> px`. `maxScale` is the value that counts as "100%/full height" for the near-max label check
    // (Han: "bovenste label... geclipt door de titel-regel; als max/2 zet het label dan in de bar" — a
    // TALL bar's count label moves INSIDE it instead of floating above, where it'd clip the title row
    // above the chart).
    const renderBar = (tierDef, s, x, w, toHeight, maxScale, key) => {
        const total = tierTotal(tierDef, s);
        const totalH = toHeight(total);
        const topY = plotH - totalH;
        const segs = tierDef.stacked || [{ key: tierDef.key, color: tierDef.color }];
        let segY = plotH;
        const rects = segs.map((seg) => {
            const segCount = s[seg.key] || 0;
            const segH = toHeight(segCount);
            segY -= segH;
            return segCount > 0 ? <rect key={seg.key} x={x} y={segY} width={w} height={Math.max(segH, 2)} fill={seg.color} /> : null;
        });
        const nearMax = total >= maxScale / 2;
        const labelY = nearMax ? topY + 13 : topY - 4;
        return (
            <g key={key}>
                {rects}
                {total > 0 && (
                    <text x={x + w / 2} y={labelY} textAnchor="middle" fontSize="10" fontWeight="700"
                        fontFamily={TEXT_FONT} fill={nearMax ? '#fff' : 'var(--text-primary)'}>{total}</text>
                )}
            </g>
        );
    };

    return (
        <svg viewBox={`0 0 ${CHART_W} ${BAR_CHART_H}`} width="100%" height={BAR_CHART_H} role="img" aria-label="Timing accuracy">
            {/* #862 split-mode axis: 0/25/50/75/100% gridlines, so two very different note counts (e.g.
                8 bass notes vs 121 treble notes) read as directly comparable proportions. */}
            {splitStats && [0, 25, 50, 75, 100].map((pct) => {
                const y = plotH - (pct / 100) * plotH;
                return (
                    <g key={pct}>
                        <line x1={leftMargin} y1={y} x2={CHART_W} y2={y} stroke="var(--text-dim)" strokeWidth={0.5} strokeOpacity={pct === 0 ? 0.8 : 0.35} />
                        <text x={leftMargin - 4} y={y + 3} textAnchor="end" fontSize="7" fontFamily={TEXT_FONT} fill="var(--text-secondary)">{pct}</text>
                    </g>
                );
            })}
            {TIMING_TIERS.map((t, i) => {
                const slotX = leftMargin + i * (slotW + BAR_GAP);
                return (
                    <g key={t.key}>
                        {splitStats ? (() => {
                            const gap = 2;
                            const halfW = (slotW - gap) / 2;
                            const toHeightBass = (v) => (v / bassTotal) * plotH;
                            const toHeightTreble = (v) => (v / trebleTotal) * plotH;
                            return (
                                <>
                                    {renderBar(t, splitStats.bass, slotX, halfW, toHeightBass, 100, `${t.key}-L`)}
                                    {renderBar(t, splitStats.treble, slotX + halfW + gap, halfW, toHeightTreble, 100, `${t.key}-R`)}
                                    <text x={slotX + halfW / 2} y={plotH + 10} textAnchor="middle" fontSize="7" fontWeight="700"
                                        fontFamily={TEXT_FONT} fill="var(--text-dim)">L</text>
                                    <text x={slotX + halfW + gap + halfW / 2} y={plotH + 10} textAnchor="middle" fontSize="7" fontWeight="700"
                                        fontFamily={TEXT_FONT} fill="var(--text-dim)">R</text>
                                </>
                            );
                        })() : renderBar(t, stats, slotX, slotW, (v) => (v / combinedMax) * plotH, combinedMax, t.key)}
                        <text x={slotX + slotW / 2} y={BAR_CHART_H - (splitStats ? 4 : 4)} textAnchor="middle" fontSize="8.5"
                            fontFamily={TEXT_FONT} fill="var(--text-secondary)">{t.label}</text>
                    </g>
                );
            })}
        </svg>
    );
}
