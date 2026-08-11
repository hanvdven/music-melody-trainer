import { APPROX_HEADER_WIDTH, APPROX_PX_PER_MEASURE } from '../constants/musicLayout';

// Derives all viewport-dependent layout values from window dimensions and numMeasures.
// Pure computation — no side effects, no state mutations.
const useAppLayout = (windowSize, numMeasures) => {
    const isDualView = windowSize.height >= 700;
    const usableHeight = windowSize.height - 100; // subtract header

    let sheetHeight, btmPanelHeight;
    if (!isDualView) {
        sheetHeight = usableHeight;
        btmPanelHeight = usableHeight;
    } else if (usableHeight <= 700) {
        btmPanelHeight = 300;
        sheetHeight = usableHeight - 300;
    } else if (usableHeight <= 800) {
        sheetHeight = 400;
        btmPanelHeight = usableHeight - 400;
    } else {
        btmPanelHeight = usableHeight / 2;
        sheetHeight = usableHeight / 2;
    }

    // Han 2026-08-01 (rev): FORCE the sheet music to 45% of the screen height, and give the bottom control
    // panel the rest (relaxes the earlier hard 40% bottom cap, which left empty space under the keyboard —
    // the sheet must fill the space between header and sub-header, not shrink and leave a gap). Dual view only.
    if (isDualView) {
        sheetHeight = Math.round(windowSize.height * 0.45);
        btmPanelHeight = usableHeight - sheetHeight;
    }

    // #RAM-level (Han 2026-08-11, "zoom in/uit zodat de hoogte van het level precies in de viewbox past.
    // je mag bottom view iets kleiner maken om ruimte te maken"): the RPG hub level wants more vertical
    // room than the sheet-music split gives it — 65% instead of the shared 45%, dual-view only (single
    // view already gives the top panel the FULL usable height, same as every other tab).
    const rpgLevelTopHeight = isDualView ? Math.round(windowSize.height * 0.65) : sheetHeight;

    const tabBtnScale = windowSize.width >= 550 ? 1 : Math.max(0.5, windowSize.width / 550);
    const sheetWidth = windowSize.width;
    // Ideal visible measures: how many fit in the viewport at ~120px each.
    // Clamped to [2, numMeasures] — minimum 2 ensures prev+current are always visible.
    const idealVisibleMeasures = Math.max(2, Math.min(
        numMeasures,
        Math.round((sheetWidth - APPROX_HEADER_WIDTH) / APPROX_PX_PER_MEASURE)
    ));

    return { isDualView, sheetHeight, btmPanelHeight, rpgLevelTopHeight, tabBtnScale, sheetWidth, idealVisibleMeasures };
};

export default useAppLayout;
