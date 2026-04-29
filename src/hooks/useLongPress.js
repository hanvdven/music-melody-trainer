import { useState, useCallback, useRef } from 'react';

const useLongPress = (callback, ms = 500) => {
    const [startLongPress, setStartLongPress] = useState(false);
    const timerRef = useRef();

    const start = useCallback((e) => {
        // Only handle primary button
        if (e.type === 'mousedown' && e.button !== 0) return;

        setStartLongPress(true);
        timerRef.current = setTimeout(() => {
            callback(e);
            setStartLongPress(false);
        }, ms);
    }, [callback, ms]);

    const stop = useCallback(() => {
        setStartLongPress(false);
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
