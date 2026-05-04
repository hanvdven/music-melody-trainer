import { useLayoutEffect } from 'react';
import { useAnimationRefs } from '../contexts/AnimationRefsContext';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';

/**
 * Manages synchronous DOM cleanup for wipe/pagination/scroll transitions
 * in SheetMusic. Fires before browser paint on every nextLayer or animationMode change.
 *
 * Steps mirrored from the transition sequence in useSheetMusicHighlight.js:
 *   nextLayer → non-null  : incoming content appears in DOM (step 1-2)
 *   nextLayer → null      : overlay removed, new content committed (steps 7-8)
 *
 * @param {*} nextLayer  - 'yellow' | 'red' | 'block-flip' | null (from PlaybackStateContext or prop)
 * @param {object} layoutRef - ref to the layout object exposing pageWidth (from useSheetMusicHighlight)
 */
const useSheetMusicTransitions = (nextLayer, layoutRef) => {
    const { svgRef, wipeTransitionRef, paginationFadeRef, context } = useAnimationRefs();
    const { animationMode } = useDisplaySettings();

    // ── Transition lifecycle: synchronous DOM cleanup before browser paint ────────
    //
    // This effect mirrors steps 1 and 7-8 of the transition sequence documented in
    // useSheetMusicHighlight.js. It fires synchronously after every React commit that
    // changes nextLayer or animationMode — before the browser paints.
    //
    // nextLayer → non-null  (step 1-2: incoming content appears in DOM)
    //   • wipe  : apply a fully-opaque HIDDEN mask to [data-wipe-role="new"] so the rAF
    //             can sweep it open without a 1-frame flash. Set opacity:1 so the mask
    //             (not opacity) controls visibility. The element starts with CSS class
    //             .wipe-new-hidden (opacity:0); setting style.opacity='1' here overrides
    //             the class — React won't fight it because opacity is not in the JSX style prop.
    //   • pagination : no mask needed. paginationFadeRef was already set by Sequencer.
    //                  The rAF will animate [data-pagination-new] once it finds it in DOM.
    //
    // nextLayer → null  (steps 7-8: overlay removed, new content committed)
    //   • all modes : clear wipe masks, clear wipeTransitionRef so rAF stops re-applying them.
    //   • pagination : the rAF locked [data-pagination-old].style.opacity='0' after the fade.
    //                  Clear it now so the new melody content (just committed by React) is
    //                  visible at full opacity. The CSS class takes over after clearing.
    //   • scroll    : reset scroll-group transform synchronously if no animation is queued.
    useLayoutEffect(() => {
        if (!svgRef.current) return;

        if (nextLayer !== null && animationMode === 'wipe') {
            // Step 1 (wipe): hide incoming content behind a fully-opaque mask, then set
            // opacity:1 so the mask — not opacity — controls visibility as the rAF sweeps it open.
            const HIDDEN = 'linear-gradient(to right, black -8%, transparent 0%)';
            svgRef.current.querySelectorAll('[data-wipe-role="new"]').forEach(g => {
                g.style.maskImage = HIDDEN;
                g.style.webkitMaskImage = HIDDEN;
                g.style.opacity = '1'; // overrides .wipe-new-hidden class; React won't reset (no JSX opacity prop)
            });

        } else if (nextLayer === 'block-flip') {
            // Step 1 (block-flip): arm the pending fade-in marker on the old group.
            // When nextLayer→null fires (same React batch as setStartMeasureIndex), the null
            // cleanup sees this attribute and adds the CSS fade-in animation for the new block.
            svgRef.current.querySelectorAll('[data-pagination-old]').forEach(g => {
                g.setAttribute('data-block-flip-pending', '');
            });

        } else if (nextLayer === null) {
            // Steps 7-8: overlay removed — clean up all transition state before next paint.

            // Clear wipe masks so rAF stops re-applying the "old fully transparent" mask.
            svgRef.current.querySelectorAll('[data-wipe-role]').forEach(g => {
                if (g.style.maskImage) {
                    g.style.maskImage = '';
                    g.style.webkitMaskImage = '';
                }
            });
            if (wipeTransitionRef) wipeTransitionRef.current = null;

            // Pagination: the rAF left [data-pagination-old].style.opacity='0' to hold the
            // faded-out state. Clear it now so the new content React just committed is visible.
            //
            // Regular crossfades (yellow/red): restore instantly — the overlay already showed
            // the incoming content, so no fade-in is needed.
            //
            // Block-flips: the old group now holds new block content (committed by React during
            // the phase-complete gap). Keep the element at opacity 0 and start the rAF fade-in
            // (phase 2) so the new block appears with the same easing as the fade-out.
            // The fade-in duration matches the fade-out duration, making the transition symmetric.
            let anyBlockFlip = false;
            svgRef.current.querySelectorAll('[data-pagination-old]').forEach(g => {
                const isBlockFlip = g.hasAttribute('data-block-flip-pending');
                g.removeAttribute('data-block-flip-pending');
                if (isBlockFlip) {
                    anyBlockFlip = true;
                    // Force opacity to 0 as the explicit starting point for the rAF fade-in,
                    // regardless of whether the fade-out rAF completed or the setTimeout fired
                    // slightly early (in which case the rAF may not have reached exactly 0 yet).
                    if (g.style.opacity !== '0') g.style.opacity = '0';
                } else {
                    // Regular crossfade: clear inline opacity — CSS class restores instantly to 1.
                    if (g.style.opacity !== '') g.style.opacity = '';
                }
            });
            if (paginationFadeRef) {
                if (anyBlockFlip && context) {
                    // Read the fade-out duration from the (still-live) ref before replacing it.
                    // The ref has phaseComplete=true (or is still mid-fade-out if setTimeout fired
                    // slightly early), but startTime/totalEnd are always valid.
                    const prevFade = paginationFadeRef.current;
                    const fadeInDuration = prevFade ? (prevFade.totalEnd - prevFade.startTime) : 0;
                    // Replace with the fade-in ref. rAF picks it up on the next tick and animates
                    // [data-pagination-old] from 0→1 using the same ease-in-out curve as phase 1.
                    paginationFadeRef.current = fadeInDuration > 0 ? {
                        startTime: context.currentTime,
                        totalEnd: context.currentTime + fadeInDuration,
                        fadeInOnly: true,
                    } : null;
                } else {
                    paginationFadeRef.current = null;
                }
            }

            // Scroll: reset transform synchronously before paint so the new melody content
            // is never visible at the old (scrolled) offset for even one frame.
            // Set to 0.25*pageWidth (= p=0 of the new animation) so the first note of the
            // new melody starts at the playhead position immediately.
            // Do NOT touch scrollTransitionRef here — the Sequencer owns it and may have
            // already set the next animation synchronously (timing race with rAF promotion).
            if (animationMode === 'scroll') {
                const scrollGroup = svgRef.current.querySelector('[data-scroll-group]');
                if (scrollGroup) {
                    const pageWidth = layoutRef.current?.pageWidth;
                    if (pageWidth) {
                        scrollGroup.setAttribute('transform', `translate(${(0.25 * pageWidth).toFixed(2)}, 0)`);
                    } else {
                        scrollGroup.setAttribute('transform', 'translate(0, 0)');
                    }
                }
            }
        }
    }, [nextLayer, animationMode]);
};

export default useSheetMusicTransitions;
