import React from 'react';

// ── useRevealOnInteraction — hidden-carousel reveal state machine (#428, Han 2026-07-13) ──────────
//
// Han wants the in-staff setter carousels HIDDEN at rest (only the active value shows) and revealed
// on interaction, with a PRESS-AND-HOLD that starts dragging in the same gesture and a 3s idle
// auto-hide that FADES the side items back out. Both the generation `CarouselField` and the
// instrument `StaffCarousel` need identical behaviour, so this lives in ONE hook (§6d — no
// copy-paste of the timer logic into each overlay). It pairs with the `collapsed` / `onReveal` /
// `mountAllItems` props on `NonLinearCarousel`, which do the actual per-frame fade + the hold-drag.
//
// The returned flags map straight onto those props:
//   • collapsed      → carousel fades every off-centre item to 0 (only the active item paints)
//   • mountAllItems  → when false, only the active item's content is in the DOM (rest stays cheap)
//   • chromeVisible  → whether the field's brackets/labels should be shown (fade with the field)
// and the callbacks drive the state:
//   • reveal         → fired from the carousel's onReveal (first press): open + (re)start the timer
//   • resetHideTimer → fired on any interaction (drag frame, selection): restart the 3s countdown
//   • closeNow       → explicit close (tap-away): fade out immediately
//
// `open` mounts the side items; `closing` keeps them mounted while they fade, then a short timer
// unmounts them — so the re-hide is a real fade, not a hard pop, yet at rest only the active item
// is in the DOM. When `hidden` is false the hook is inert (collapsed=false, everything always on),
// so always-open consumers are unchanged.
//
// #432 NOTE — TWO "hidden" mechanisms coexist deliberately (Han 2026-07-14: keep as-is):
//   • THIS hook (collapse the NonLinearCarousel) — the HORIZONTAL setters: colour, instrument,
//     generation. Reveal on press, 3s idle fade-out.
//   • `LeftFanCarousel` `compact` (fanCarousels.jsx) — the VERTICAL tanh fans: playback volume /
//     measures / repeats, BPM. At rest only the active value shows; the fan opens under the finger
//     while the drag band is held. It has no idle timer (the fan re-collapses the instant the drag
//     ends), which suits a momentary vertical drag. Unifying the two was considered and declined —
//     the interaction models differ (press-to-open-and-linger vs drag-to-fan). Documented, not a bug.
export function useRevealOnInteraction(hidden, { fadeMs = 280, idleMs = 3000 } = {}) {
    const [open, setOpen] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    const hideTimerRef = React.useRef(null);   // the idle (3s) timer
    const fadeTimerRef = React.useRef(null);   // the fade-duration unmount timer

    const clearHideTimer = () => {
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
    const clearFadeTimer = () => {
        if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
    };
    // Fade the side items out (collapsed=true keeps them mounted for the transition), then unmount.
    const beginHide = () => {
        setClosing(true);
        clearFadeTimer();
        fadeTimerRef.current = setTimeout(() => { setOpen(false); setClosing(false); }, fadeMs);
    };
    // (Re)start the 3s idle countdown; a fresh interaction also cancels an in-flight fade-out.
    const resetHideTimer = () => {
        if (!hidden) return;
        clearHideTimer();
        clearFadeTimer();
        setClosing(false);
        hideTimerRef.current = setTimeout(beginHide, idleMs);
    };
    const reveal = () => { setOpen(true); resetHideTimer(); };
    const closeNow = () => { clearHideTimer(); beginHide(); };

    React.useEffect(() => () => { clearHideTimer(); clearFadeTimer(); }, []);

    return {
        open, closing,
        collapsed: hidden && (!open || closing),
        mountAllItems: !hidden || open,
        chromeVisible: !hidden || (open && !closing),
        reveal, resetHideTimer, closeNow,
    };
}

export default useRevealOnInteraction;
