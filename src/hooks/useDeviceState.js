import { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';

/**
 * Tracks device/viewport state that is independent of music logic:
 *   - fullscreen (enters/exits via browser API)
 *   - orientation (landscape vs portrait via matchMedia)
 *   - pointer type (touch vs mouse via matchMedia)
 */
const useDeviceState = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLandscape, setIsLandscape] = useState(() => window.matchMedia('(orientation: landscape)').matches);
    const [isTouch, setIsTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                logger.error('useDeviceState', 'E015-FULLSCREEN', err);
            });
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    }, []);

    useEffect(() => {
        const handleFS = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFS);
        return () => document.removeEventListener('fullscreenchange', handleFS);
    }, []);

    useEffect(() => {
        const lQuery = window.matchMedia('(orientation: landscape)');
        const tQuery = window.matchMedia('(pointer: coarse)');
        const handleL = (e) => setIsLandscape(e.matches);
        const handleT = (e) => setIsTouch(e.matches);
        lQuery.addEventListener('change', handleL);
        tQuery.addEventListener('change', handleT);
        return () => {
            lQuery.removeEventListener('change', handleL);
            tQuery.removeEventListener('change', handleT);
        };
    }, []);

    return { isFullscreen, toggleFullscreen, isLandscape, isTouch };
};

export default useDeviceState;
