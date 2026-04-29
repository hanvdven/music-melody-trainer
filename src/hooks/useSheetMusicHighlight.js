// useSheetMusicHighlight.js
// Drives 60fps animations and note-active highlighting via direct DOM mutations.
// Zero React overhead per frame — all animation writes bypass the React reconciler.
//
// ═══════════════════════════════════════════════════════════════════════════════
// TRANSITION SEQUENCE (applies to all animation modes)
// ═══════════════════════════════════════════════════════════════════════════════
//
//  0. TRIGGER — Sequencer fires a timed callback at the transition start time:
//       • Pagination : 0.25 measures before block end
//       • Wipe       : 0.5  measures before block end
//       • Scroll     : 1 measure before block end (side-scroll, see note below)
//
//  1. NEXT MELODY HIDDEN — The incoming content is invisible in the DOM.
//       • Pagination : CSS class `.pagination-new-hidden` keeps `[data-pagination-new]` at opacity 0.
//       • Wipe       : CSS class `.wipe-new-hidden` keeps `[data-wipe-role="new"]` at opacity 0;
//                      useLayoutEffect immediately applies a fully-opaque HIDDEN mask so the rAF
//                      can sweep it from left to right without a flash.
//
//  2. RENDER NEXT MELODY — Sequencer calls setNextLayer('yellow'|'red') + setPreviewMelody().
//       React renders the incoming overlay group into the DOM (still invisible per step 1).
//       React is triggered ~50ms before the audio startTime so the element exists in DOM
//       before the rAF begins animating it.
//
//  3. TRANSITION ANIMATION — rAF loop drives opacity / mask changes:
//       • Pagination : crossfade — old fades 1→0, new fades 0→1, both over 0.2 s ease-in-out.
//       • Wipe       : mask sweep — a linear-gradient mask moves left→right, revealing new
//                      content and hiding old content simultaneously.
//       • Scroll     : NOTE — scroll is NOT a block transition; notes flow continuously at
//                      constant speed (pixelsPerTick). Treat separately once pagination/wipe perfect.
//
//  4–6. SWAP CONTENT — At block end, Sequencer calls applyResult() which:
//       4. Calls hideOldGroup() — imperatively sets the old layer opacity to 0 before React
//          commits the new melody (prevents 1-frame flash of new content in old layout).
//       5. Fires React state setters (setTrebleMelody, setBassMelody, etc.) — React re-renders
//          the [data-wipe-role="old"] / [data-pagination-old] group with the new melody notes.
//       6. Sets the old layer opacity back to 1 (new content now in place).
//
//  7–8. CLEAR OVERLAY — applyResult() also calls setNextLayer(null) and setPreviewMelody(null).
//       React removes the incoming overlay from the DOM.
//       useLayoutEffect fires synchronously (before paint) on nextLayer→null and:
//       7. Clears any remaining rAF-set opacity from [data-pagination-old] elements.
//       8. Clears wipe masks and timing refs so rAF stops re-applying them.
//
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useLayoutEffect, startTransition } from 'react';

/**
 * @param {object} params
 * @param {React.RefObject} params.sequencerRef
 * @param {React.RefObject} params.svgRef
 * @param {React.RefObject} params.layoutRef
 * @param {AudioContext}    params.context
 * @param {boolean}         params.isPlaying
 * @param {object}          params.melodies               — triggers stale-highlight scrub on change
 * @param {React.RefObject} params.showNoteHighlightRef
 * @param {React.RefObject} params.clearHighlightStateRef
 * @param {function}        params.setCurrentMeasureIndex — driven by AudioContext clock (no setTimeout drift)
 * @param {React.RefObject} params.wipeTransitionRef      — {startTime, endTime} for wipe mask sweep
 * @param {React.RefObject} params.scrollTransitionRef    — {startTime, endTime} for scroll slide
 * @param {React.RefObject} params.pendingScrollTransitionRef — queued next scroll (applied when current finishes)
 * @param {React.RefObject} params.paginationFadeRef      — {startTime, totalEnd} for pagination crossfade
 */
const useSheetMusicHighlight = ({
    sequencerRef,
    svgRef,
    layoutRef,
    context,
    isPlaying,
    melodies,
    showNoteHighlightRef,
    clearHighlightStateRef,
    setCurrentMeasureIndex,
    wipeTransitionRef,
    scrollTransitionRef,
    pendingScrollTransitionRef,
    paginationFadeRef,
}) => {

    // ── Main rAF loop ──────────────────────────────────────────────────────────
    useEffect(() => {
        const clearActive = () => {
            svgRef.current?.querySelectorAll('[data-measure-index].note-active')
                .forEach(el => el.classList.remove('note-active'));
            svgRef.current?.querySelectorAll('[data-mel="chord"].chord-label-active')
                .forEach(el => el.classList.remove('chord-label-active'));
        };

        if (!isPlaying) {
            clearActive();
            return;
        }

        let rafId;
        let lastActiveKeys = new Set();
        let lastActiveKey = '';
        let lastChordActiveKeys = new Set();
        let lastChordActiveKey = '';
        let lastSetMeasureIndex = -1;

        // ── Cached DOM refs ────────────────────────────────────────────────────
        // Querying the SVG every frame is expensive. We cache stable elements once
        // and re-query only when the relevant transition object changes.
        //
        // scrollGroup    : stable for the lifetime of playback.
        // wipeOlds/New   : cached per wipe transition, invalidated when wipeTransitionRef changes.
        // paginationOld/New : cached per pagination fade, cleared when fade ends.
        let scrollGroupCached = svgRef.current?.querySelector('[data-scroll-group]');
        let wipeOldsCached = null;
        let wipeNewCached = null;
        let lastWipeT = null;
        let paginationOldCached = null;
        let paginationNewCached = null;

        const getScrollGroup = () => {
            if (!scrollGroupCached) {
                scrollGroupCached = svgRef.current?.querySelector('[data-scroll-group]');
            }
            return scrollGroupCached;
        };

        // ── WIPE ANIMATION ─────────────────────────────────────────────────────
        // Drives a left-to-right mask sweep on [data-wipe-role="old"] and ["new"].
        // The mask is a linear-gradient that moves across the SVG width:
        //   old  → transparent on the left (hidden), black on the right (visible)
        //   new  → black on the left (visible), transparent on the right (hidden)
        // As the sweep progresses, old content disappears left-to-right while
        // new content appears left-to-right — a classic wipe transition.
        const runWipeAnimation = (svg) => {
            const wipeT = wipeTransitionRef?.current;
            if (!svg) return;
            if (wipeT) {
                const layout = layoutRef.current;
                if (layout) {
                    if (wipeT !== lastWipeT || !wipeNewCached) {
                        // New wipe started, or React hasn't committed the new element yet — refresh cache.
                        wipeOldsCached = svg.querySelectorAll('[data-wipe-role="old"]');
                        wipeNewCached = svg.querySelector('[data-wipe-role="new"]');
                        // Only lock the cache once the new element is in the DOM.
                        // wipeTransitionRef is set before React's early render fires (~100ms delay),
                        // so wipeNewCached may be null on the first few ticks — must keep re-querying.
                        if (wipeNewCached) lastWipeT = wipeT;
                    }
                    const now = context.currentTime;
                    const raw = (now - wipeT.startTime) / (wipeT.endTime - wipeT.startTime);
                    const p = Math.max(0, Math.min(1, raw));
                    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                    // Sweep from -4% to 104% so the wipe fully clears notes near the edges.
                    const sweepPct = -4 + eased * 108;
                    const edge1 = `${(sweepPct - 4).toFixed(4)}%`;
                    const edge2 = `${(sweepPct + 4).toFixed(4)}%`;
                    const oldMask = `linear-gradient(to right, transparent ${edge1}, black ${edge2})`;
                    const newMask = `linear-gradient(to right, black ${edge1}, transparent ${edge2})`;
                    wipeOldsCached?.forEach(g => {
                        g.style.maskImage = oldMask;
                        g.style.webkitMaskImage = oldMask;
                    });
                    if (wipeNewCached) {
                        wipeNewCached.style.maskImage = newMask;
                        wipeNewCached.style.webkitMaskImage = newMask;
                    }
                }
            } else {
                if (lastWipeT !== null) {
                    // Wipe just ended — clear masks and drop cache.
                    wipeOldsCached?.forEach(g => {
                        if (g.style.maskImage) {
                            g.style.maskImage = '';
                            g.style.webkitMaskImage = '';
                        }
                    });
                    if (wipeNewCached?.style.maskImage) {
                        wipeNewCached.style.maskImage = '';
                        wipeNewCached.style.webkitMaskImage = '';
                    }
                    wipeOldsCached = null;
                    wipeNewCached = null;
                    lastWipeT = null;
                }
            }
        };

        // ── PAGINATION CROSSFADE ────────────────────────────────────────────────
        // Drives opacity animation on [data-pagination-old] and [data-pagination-new].
        //
        // paginationFadeRef.current shape:
        //   { startTime, totalEnd }                  — regular crossfade (old 1→0, new 0→1)
        //   { startTime, totalEnd, fadeOutOnly }     — block-flip phase 1: old 1→0, no overlay
        //   { startTime, totalEnd, fadeInOnly }      — block-flip phase 2: old 0→1, no overlay
        //   { ..., phaseComplete: true }             — fade-out done; waiting for useLayoutEffect
        //                                              to replace ref with the fadeInOnly phase
        //
        // Block-flip lifecycle (two-phase, fully rAF-driven):
        //   Phase 1 — Sequencer sets fadeOutOnly ref; rAF fades old 1→0.
        //             On completion: sets phaseComplete=true (keeps ref alive for duration read).
        //   Gap     — useLayoutEffect on nextLayer→null reads duration, forces element to opacity 0,
        //             replaces ref with { fadeInOnly, startTime=now, totalEnd=now+duration }.
        //   Phase 2 — rAF fades old 0→1 (new content already committed by React).
        //             On completion: clears inline opacity so CSS class takes over at 1.
        //
        // Same ease-in-out curve is used for both phases, making the flip visually symmetric.
        const runPaginationFade = () => {
            const fadeT = paginationFadeRef?.current;
            if (!fadeT) {
                // No active fade — release cached refs.
                paginationOldCached = null;
                paginationNewCached = null;
                return;
            }

            // Phase-complete guard: fade-out is done; waiting for useLayoutEffect to set up
            // the fade-in ref. Do nothing until that happens so rAF doesn't re-animate.
            if (fadeT.phaseComplete) return;

            const svg = svgRef.current;
            if (!svg) return;

            const now = context.currentTime;
            const elapsed = now - fadeT.startTime;
            const fadeDuration = fadeT.totalEnd - fadeT.startTime;
            const t = Math.max(0, Math.min(1, elapsed / fadeDuration));
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            // ── PHASE 2: FADE IN (block-flip) ────────────────────────────────────
            // Old group already holds new block content (committed by React during the gap).
            // Animate its opacity 0→1 with same easing as the fade-out.
            if (fadeT.fadeInOnly) {
                if (!paginationOldCached) paginationOldCached = svg.querySelector('[data-pagination-old]');
                if (paginationOldCached) {
                    paginationOldCached.style.opacity = eased.toFixed(4);
                    if (elapsed >= fadeDuration) {
                        // Fade-in complete. Clear inline opacity — CSS class (.pagination-old-visible)
                        // takes over at opacity:1. Using '' (not '1') avoids leaving a stale inline
                        // value that could block future rAF writes.
                        paginationOldCached.style.opacity = '';
                        if (paginationFadeRef) paginationFadeRef.current = null;
                        paginationOldCached = null;
                    }
                }
                return;
            }

            // ── PHASE 1: FADE OUT / REGULAR CROSSFADE ────────────────────────────
            if (!paginationOldCached) paginationOldCached = svg.querySelector('[data-pagination-old]');

            // For regular crossfades (not fadeOutOnly), guard against animating old before
            // new is in the DOM. If new hasn't been committed yet, hold old at full opacity
            // this frame — both will animate together once React commits the overlay.
            // This prevents the asymmetric "old fades out but new never appears" flash on
            // slow devices where React takes > 50ms to commit after setNextLayer fires.
            if (!fadeT.fadeOutOnly) {
                if (!paginationNewCached) paginationNewCached = svg.querySelector('[data-pagination-new]');
                if (!paginationNewCached) return; // new not in DOM yet — hold and retry next frame
            }

            // Old group: 1 → 0
            if (paginationOldCached) {
                paginationOldCached.style.opacity = (1 - eased).toFixed(4);
            }

            // New group: 0 → 1 (regular crossfades only — block-flip has no overlay)
            if (!fadeT.fadeOutOnly && paginationNewCached) {
                paginationNewCached.style.opacity = eased.toFixed(4);
            }

            if (elapsed >= fadeDuration) {
                if (paginationOldCached) paginationOldCached.style.opacity = '0';
                if (!fadeT.fadeOutOnly && paginationNewCached) paginationNewCached.style.opacity = '1';

                if (fadeT.fadeOutOnly) {
                    // Block-flip phase 1 done. Mark complete so rAF stops re-animating,
                    // but keep the ref alive so useLayoutEffect can read startTime/totalEnd
                    // to compute the matching fade-in duration for phase 2.
                    fadeT.phaseComplete = true;
                } else {
                    // Regular crossfade complete. Disable further rAF updates.
                    // useLayoutEffect (nextLayer→null) clears style.opacity on old group.
                    if (paginationFadeRef) paginationFadeRef.current = null;
                }
                paginationOldCached = null;
                paginationNewCached = null;
            }
        };

        // ── SCROLL SLIDE ────────────────────────────────────────────────────────
        // NOTE: scroll is NOT a block transition — it is a continuous side-scroll where
        // notes flow at constant speed. It does not follow the transition sequence above.
        // TODO: redesign as constant-speed playhead once pagination and wipe are stable.
        const runScrollAnimation = () => {
            const scrollGroup = getScrollGroup();
            if (!scrollGroup) return;
            const scrollT = scrollTransitionRef?.current;
            if (scrollT) {
                const pageWidth = layoutRef.current?.pageWidth;
                if (pageWidth) {
                    const now = context.currentTime;
                    const raw = (now - scrollT.startTime) / (scrollT.endTime - scrollT.startTime);
                    const p = Math.max(0, Math.min(1, raw));
                    // Playhead at 25%: at p=0 the first note starts at 25% from left;
                    // at p=1 the last note of old content and first note of new content
                    // both arrive at 25% simultaneously — seamless handoff.
                    const tx = ((0.25 - p) * pageWidth).toFixed(2);
                    scrollGroup.setAttribute('transform', `translate(${tx}, 0)`);
                    if (raw >= 1) {
                        // Apply queued animation (or snap to identity if none pending).
                        const pending = pendingScrollTransitionRef?.current ?? null;
                        if (scrollTransitionRef) scrollTransitionRef.current = pending;
                        if (pendingScrollTransitionRef) pendingScrollTransitionRef.current = null;
                        // Pre-position at p=0 of the next animation (0.25*pageWidth) so
                        // the very first rAF tick of the new animation has no jump.
                        if (pending && pageWidth) {
                            scrollGroup.setAttribute('transform', `translate(${(0.25 * pageWidth).toFixed(2)}, 0)`);
                        } else {
                            scrollGroup.setAttribute('transform', 'translate(0, 0)');
                        }
                    }
                }
            } else {
                if (scrollGroup.hasAttribute('transform')) {
                    scrollGroup.setAttribute('transform', 'translate(0, 0)');
                }
            }
        };

        const tick = () => {
            const svg = svgRef.current;

            if (!showNoteHighlightRef.current) {
                if (lastActiveKeys.size > 0 || lastChordActiveKeys.size > 0) {
                    clearActive();
                    lastActiveKeys = new Set(); lastActiveKey = '';
                    lastChordActiveKeys = new Set(); lastChordActiveKey = '';
                }
                runWipeAnimation(svg);
                runScrollAnimation();
                runPaginationFade();
                rafId = requestAnimationFrame(tick);
                return;
            }

            // ── NOTE-ACTIVE HIGHLIGHTING ──────────────────────────────────────────
            if (clearHighlightStateRef.current) {
                lastActiveKeys = new Set();
                lastActiveKey = '';
                // Also reset chord tracking so the chord diff re-evaluates from scratch
                // after a melody transition. Without this, stale lastChordActiveKeys entries
                // will attempt to deactivate elements that may no longer exist in the DOM,
                // silently skipping any chord that should be deactivated.
                lastChordActiveKeys = new Set();
                lastChordActiveKey = '';
                clearHighlightStateRef.current = false;
            }

            // Use ?? [] so that when stop() sets scheduledNotes=null the diff
            // still runs with an empty activeKeys set and immediately removes
            // note-active from whatever was last highlighted — no stuck notes.
            if (svg) {
                const notes = sequencerRef.current?.scheduledNotes ?? [];
                const now = context.currentTime;
                const activeKeys = new Set();
                for (const n of notes) {
                    if (now >= n.audioTime && now < n.audioTime + n.duration)
                        activeKeys.add(`${n.measureIndex}:${n.mel}:${n.localSlot}`);
                }
                const key = [...activeKeys].sort().join(',');
                if (key !== lastActiveKey) {
                    for (const k of lastActiveKeys) {
                        if (!activeKeys.has(k)) {
                            const [measureIndex, mel, localSlot] = k.split(':');
                            svg.querySelectorAll(`[data-measure-index="${measureIndex}"][data-local-slot="${localSlot}"][data-mel="${mel}"]`)
                                .forEach(el => el.classList.remove('note-active'));
                        }
                    }
                    for (const k of activeKeys) {
                        if (!lastActiveKeys.has(k)) {
                            const [measureIndex, mel, localSlot] = k.split(':');
                            svg.querySelectorAll(`[data-measure-index="${measureIndex}"][data-local-slot="${localSlot}"][data-mel="${mel}"]`)
                                .forEach(el => el.classList.add('note-active'));
                        }
                    }
                    lastActiveKeys = activeKeys;
                    lastActiveKey = key;
                }
            }

            // ── MEASURE INDEX ─────────────────────────────────────────────────────
            // Driven by AudioContext clock instead of setTimeout to avoid 10–50ms drift
            // that would cause stale data-measure-index lookups and broken highlighting.
            // startTransition marks the React update as low-priority so it never blocks
            // the compositor frame.
            // Computed at tick scope so chord-label highlighting can reuse it.
            let currentGlobalMeasure = -1;
            {
                const scheduledMeasures = sequencerRef.current?.scheduledMeasures;
                if (scheduledMeasures?.length) {
                    const now = context.currentTime;
                    let latestTime = -Infinity;
                    for (const m of scheduledMeasures) {
                        if (now >= m.audioTime && m.audioTime > latestTime) {
                            latestTime = m.audioTime;
                            currentGlobalMeasure = m.globalMeasureIndex;
                        }
                    }
                    if (setCurrentMeasureIndex && currentGlobalMeasure !== -1 && currentGlobalMeasure !== lastSetMeasureIndex) {
                        lastSetMeasureIndex = currentGlobalMeasure;
                        startTransition(() => setCurrentMeasureIndex(currentGlobalMeasure));
                    }
                }
            }

            // ── CHORD LABEL HIGHLIGHTING ──────────────────────────────────────
            // Exact same diff-based pattern as note-active: compare scheduledChords
            // audioTime against context.currentTime. Matches DOM elements by
            // data-measure-index + data-local-slot for exact parity with note timing.
            {
                const scheduledChords = sequencerRef.current?.scheduledChords ?? [];
                if (svg) {
                    const nowC = context.currentTime;
                    const chordActiveKeys = new Set();
                    for (const c of scheduledChords) {
                        if (nowC >= c.audioTime && nowC < c.audioTime + c.duration)
                            chordActiveKeys.add(`${c.measureIndex}:${c.localSlot}`);
                    }
                    const chordKey = [...chordActiveKeys].sort().join(',');
                    if (chordKey !== lastChordActiveKey) {
                        for (const k of lastChordActiveKeys) {
                            if (!chordActiveKeys.has(k)) {
                                const [mi, ls] = k.split(':');
                                svg.querySelectorAll(`[data-measure-index="${mi}"][data-local-slot="${ls}"][data-mel="chord"]`)
                                    .forEach(el => el.classList.remove('chord-label-active'));
                            }
                        }
                        for (const k of chordActiveKeys) {
                            if (!lastChordActiveKeys.has(k)) {
                                const [mi, ls] = k.split(':');
                                svg.querySelectorAll(`[data-measure-index="${mi}"][data-local-slot="${ls}"][data-mel="chord"]`)
                                    .forEach(el => el.classList.add('chord-label-active'));
                            }
                        }
                        lastChordActiveKeys = chordActiveKeys;
                        lastChordActiveKey = chordKey;
                    }
                }
            }

            runWipeAnimation(svg);
            runScrollAnimation();
            runPaginationFade();

            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(rafId); clearActive(); };
    }, [isPlaying, context]);

    // ── Scrub stale highlights after every melody commit ──────────────────────
    // Both note and chord classes must be cleared: the rAF diff will skip stale DOM
    // elements after a melody transition (they may be gone or have new content), so
    // any class left by the previous block stays on screen until this explicit scrub.
    useLayoutEffect(() => {
        if (!isPlaying) return;
        const svg = svgRef.current;
        if (!svg) return;
        svg.querySelectorAll('.note-active').forEach(el => el.classList.remove('note-active'));
        svg.querySelectorAll('.chord-label-active').forEach(el => el.classList.remove('chord-label-active'));
        clearHighlightStateRef.current = true;
    }, [melodies, isPlaying]);
};

export default useSheetMusicHighlight;
