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

    const tabBtnScale = windowSize.width >= 550 ? 1 : Math.max(0.5, windowSize.width / 550);
    const sheetWidth = windowSize.width;
    // Ideal visible measures: how many fit in the viewport at ~120px each.
    // Clamped to [2, numMeasures] — minimum 2 ensures prev+current are always visible.
    const idealVisibleMeasures = Math.max(2, Math.min(
        numMeasures,
        Math.round((sheetWidth - APPROX_HEADER_WIDTH) / APPROX_PX_PER_MEASURE)
    ));

    return { isDualView, sheetHeight, btmPanelHeight, tabBtnScale, sheetWidth, idealVisibleMeasures };
};

export default useAppLayout;
