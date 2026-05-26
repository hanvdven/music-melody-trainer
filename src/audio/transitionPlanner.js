// transitionPlanner.js
//
// Pure functions that turn a sequence-block plan into a list of visual-block
// boundaries and per-boundary fade timings. Centralises ALL animation timing
// rekenkunde — the Sequencer and AnimationScheduler consume the output and do
// no per-mode arithmetic of their own.
//
// All times are in TICKS, relative to the start of the sequence block (tick 0).
// The caller converts ticks → AudioContext seconds via `audioStartTime + tick × timeFactor`.
//
// Sequence block = one melody played `repsPerMelody` times.
// Repeat        = one pass through the melody's `numMeasures` measures.
// Visual block  = the measures shown on screen at once (one entry of `musicalBlocks`).
//
// Boundaries within a sequence block:
//   • visual-flip — end of a visual block that is NOT the last in its repeat
//   • repeat-flip — end of a repeat that is NOT the last in the sequence block
//   • series-flip — end of the last repeat → next sequence block (new melody)

/**
 * Pagination crossfade variants.
 *
 *  generationLeadMeasures : how far before the series boundary a new melody
 *                           MUST be available (JIT generation deadline).
 *  fadeDurationMeasures   : how long the visual crossfade takes.
 *  fadeOvershootMeasures  : how far PAST the boundary tick the fade ends. For
 *                           `lang` this is 0.25m — the player keeps seeing the
 *                           old notes briefly while the new ones are already
 *                           fading in, easing the visual cognitive load.
 *
 *  fadeEndTick   = boundary.atTick + fadeOvershootMeasures × measureLengthTicks
 *  fadeStartTick = fadeEndTick − fadeDurationMeasures × measureLengthTicks
 *
 * For `lang`, generation completes at the start of the fade (no buffer).
 * For `snel` / `mid`, generation has a small buffer before the fade begins.
 */
export const PAGINATION_VARIANTS = {
    snel: { generationLeadMeasures: 0.5, fadeDurationMeasures: 0.25, fadeOvershootMeasures: 0,    label: 'kort' },
    mid:  { generationLeadMeasures: 1.0, fadeDurationMeasures: 0.5,  fadeOvershootMeasures: 0,    label: 'mid'  },
    lang: { generationLeadMeasures: 2.0, fadeDurationMeasures: 2.0,  fadeOvershootMeasures: 0.25, label: 'lang' },
};

// When the fade-duration would exceed the size of the visual block being left,
// fall back to this duration (in measures). Prevents the fade from starting
// before the block has even been shown.
export const PAGINATION_CLAMP_FALLBACK_MEASURES = 0.5;

/**
 * Walk through a sequence block and emit a flat list of boundaries.
 *
 * @param {object}   plan
 * @param {number}   plan.numMeasures        — measures per repeat
 * @param {number}   plan.repsPerMelody      — must be a positive finite integer (caller resolves -1)
 * @param {number}   plan.measureLengthTicks
 * @param {number[]} plan.musicalBlocks      — visual block sizes per repeat (must sum to numMeasures)
 *
 * @returns {Array<Boundary>} sorted by atTick ascending. Last entry is always 'series-flip'
 *   when repsPerMelody is finite.
 *
 * Boundary shape:
 *   {
 *     kind: 'visual-flip' | 'repeat-flip' | 'series-flip',
 *     atTick:                  number,   // tick where new content starts playing
 *     repeatIndex:             number,   // 0-based index of the repeat that is ENDING
 *     visualBlockIndex:        number,   // 0-based index within that repeat
 *     newWindowStartLocal:     number,   // tick offset within the NEW repeat of the new visual window start
 *     oldWindowSizeMeasures:   number,   // size of the visual block being left
 *     newWindowSizeMeasures:   number,   // size of the visual block being entered
 *   }
 */
export function computeSequenceBoundaries({ numMeasures, repsPerMelody, measureLengthTicks, musicalBlocks }) {
    if (!Number.isFinite(numMeasures) || numMeasures <= 0) return [];
    if (!Number.isFinite(repsPerMelody) || repsPerMelody <= 0) return [];
    if (!Array.isArray(musicalBlocks) || musicalBlocks.length === 0) return [];

    const sumBlocks = musicalBlocks.reduce((a, b) => a + b, 0);
    // Invariant: musicalBlocks sums to numMeasures. We don't throw — silently use the
    // sum so the planner is total. The caller should pre-validate.
    const effectiveNumMeasures = sumBlocks === numMeasures ? numMeasures : sumBlocks;

    const out = [];

    for (let r = 0; r < repsPerMelody; r++) {
        // Cumulative tick at the start of this repeat (within the sequence block).
        const repeatStartTick = r * effectiveNumMeasures * measureLengthTicks;
        let cumulativeMeasuresInRepeat = 0;

        for (let v = 0; v < musicalBlocks.length; v++) {
            const blockSize = musicalBlocks[v];
            cumulativeMeasuresInRepeat += blockSize;
            const boundaryTick = repeatStartTick + cumulativeMeasuresInRepeat * measureLengthTicks;

            const isLastVisualInRepeat = (v === musicalBlocks.length - 1);
            const isLastRepeat = (r === repsPerMelody - 1);

            if (!isLastVisualInRepeat) {
                // Visual-flip within the same repeat: next visual block starts at the
                // cumulative offset we just reached.
                const nextBlockSize = musicalBlocks[v + 1];
                out.push({
                    kind: 'visual-flip',
                    atTick: boundaryTick,
                    repeatIndex: r,
                    visualBlockIndex: v,
                    newWindowStartLocal: cumulativeMeasuresInRepeat * measureLengthTicks,
                    oldWindowSizeMeasures: blockSize,
                    newWindowSizeMeasures: nextBlockSize,
                });
            } else if (!isLastRepeat) {
                // Repeat-flip: next repeat starts at local tick 0.
                out.push({
                    kind: 'repeat-flip',
                    atTick: boundaryTick,
                    repeatIndex: r,
                    visualBlockIndex: v,
                    newWindowStartLocal: 0,
                    oldWindowSizeMeasures: blockSize,
                    newWindowSizeMeasures: musicalBlocks[0],
                });
            } else {
                // Series-flip: end of last repeat → new melody.
                out.push({
                    kind: 'series-flip',
                    atTick: boundaryTick,
                    repeatIndex: r,
                    visualBlockIndex: v,
                    newWindowStartLocal: 0,
                    oldWindowSizeMeasures: blockSize,
                    // newWindowSizeMeasures depends on the NEXT melody's musicalBlocks
                    // which we don't know here. Caller substitutes when known.
                    newWindowSizeMeasures: musicalBlocks[0],
                });
            }
        }
    }

    return out;
}

/**
 * Plan the fade window for one pagination boundary.
 *
 * Returns the audio-tick window during which the rAF crossfade runs, plus the
 * generation deadline (only meaningful for series-flip).
 *
 *   fadeStartTick = boundary.atTick − fadeDurationMeasures × measureLengthTicks
 *   fadeEndTick   = boundary.atTick                                            (ends at audio swap)
 *   generationDeadlineTick = boundary.atTick − generationLeadMeasures × measureLengthTicks
 *
 * Clamping rule: if `fadeDurationMeasures >= oldWindowSizeMeasures`, the fade
 * would start before the old block is even shown. Fall back to
 * `PAGINATION_CLAMP_FALLBACK_MEASURES` so the fade always begins after the
 * block has been visible for a moment.
 *
 * @param {object}   args
 * @param {Boundary} args.boundary
 * @param {string}   args.variant            — 'snel' | 'mid' | 'lang'
 * @param {number}   args.measureLengthTicks
 *
 * @returns {FadeTiming}
 *   {
 *     fadeStartTick:          number,
 *     fadeEndTick:            number,
 *     generationDeadlineTick: number,
 *     fadeDurationMeasures:   number,   // after clamping
 *     isClamped:              boolean,
 *   }
 */
export function planPaginationFade({ boundary, variant, measureLengthTicks }) {
    const v = PAGINATION_VARIANTS[variant] ?? PAGINATION_VARIANTS.mid;
    const requested = v.fadeDurationMeasures;
    const overshoot  = v.fadeOvershootMeasures;
    const oldBlockMeasures = boundary.oldWindowSizeMeasures;

    // The fade visually starts `requested - overshoot` measures BEFORE the boundary
    // (the rest extends past it). Clamp only if that pre-boundary portion would
    // begin before the old block was shown at all.
    const preBoundary = requested - overshoot;
    let durationMeasures = requested;
    let isClamped = false;
    if (preBoundary > oldBlockMeasures) {
        durationMeasures = Math.min(PAGINATION_CLAMP_FALLBACK_MEASURES, oldBlockMeasures);
        isClamped = true;
    }

    const overshootTicks = overshoot * measureLengthTicks;
    const fadeEndTick = boundary.atTick + overshootTicks;
    const fadeStartTick = fadeEndTick - durationMeasures * measureLengthTicks;
    const generationDeadlineTick = boundary.atTick - v.generationLeadMeasures * measureLengthTicks;

    return {
        fadeStartTick,
        fadeEndTick,
        generationDeadlineTick,
        fadeDurationMeasures: durationMeasures,
        isClamped,
    };
}

/**
 * Convenience: plan all boundaries + fades for a sequence block in pagination mode.
 *
 * @param {object} args
 * @param {object} args.plan     — see computeSequenceBoundaries
 * @param {string} args.variant  — 'snel' | 'mid' | 'lang'
 *
 * @returns {Array<{ boundary, fade }>}
 */
export function planPaginationSequence({ plan, variant }) {
    const boundaries = computeSequenceBoundaries(plan);
    return boundaries.map(boundary => ({
        boundary,
        fade: planPaginationFade({
            boundary,
            variant,
            measureLengthTicks: plan.measureLengthTicks,
        }),
    }));
}
