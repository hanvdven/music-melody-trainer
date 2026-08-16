// #925 follow-up (Han 2026-08-16, "Graag stereo: in beeld: tot 50%-100% L-R, buiten beeld 0-50% L
// (afstandsgebaseerd)"): one shared pan/proximity mapping for every env-audio voice (birds, water) —
// CLAUDE.md §6c, a single formula instead of two hand-copied ones.
//
// While the entity's own screenX sits inside the viewport (0..viewportWidth): pan swings from 50% at
// screen-center out to 100% at either edge — never dead-center, per Han's own "50%-100%" range.
// Once off-screen (screenX < 0 or > viewportWidth): pan holds at whichever side it left on, and
// `proximity` (1 = just off-screen, 0 = at/beyond `maxOffscreenPx`) scales down toward 0 — the caller
// uses `proximity` to fade GAIN toward silence (and eventually unload) as the entity gets further away,
// while `pan` itself only ever reaches 50% out of view, per "buiten beeld 0-50%".
export function computeSpatialPan(screenX, viewportWidth, maxOffscreenPx) {
    if (screenX >= 0 && screenX <= viewportWidth) {
        const center = viewportWidth / 2;
        const sign = screenX >= center ? 1 : -1;
        const edgeFraction = center > 0 ? Math.abs(screenX - center) / center : 0;
        return { pan: sign * (0.5 + 0.5 * Math.min(1, edgeFraction)), proximity: 1 };
    }
    const offscreenBy = screenX < 0 ? -screenX : screenX - viewportWidth;
    const sign = screenX < 0 ? -1 : 1;
    const proximity = Math.max(0, 1 - offscreenBy / Math.max(1, maxOffscreenPx));
    return { pan: sign * 0.5 * proximity, proximity };
}
