import { useCallback, useRef } from 'react';

const useLongPress = (callback, ms = 500) => {
    const timerRef = useRef();

    const start = useCallback((e) => {
        // Only handle primary button
        if (e.type === 'mousedown' && e.button !== 0) return;

        timerRef.current = setTimeout(() => {
            callback(e);
        }, ms);
    }, [callback, ms]);

    const stop = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
    }, []);

    return {
        onMouseDown: start,
        onMouseUp: stop,
        onMouseLeave: stop,
        onTouchStart: start,
        onTouchEnd: stop,
    };
};

export default useLongPress;
