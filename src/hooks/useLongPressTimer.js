import { useRef } from 'react';

/**
 * Long-press utility hook that distinguishes a short tap from a held press.
 * Unlike useLongPress (which wires event handlers for you), this hook exposes
 * imperative start/end/cancel calls so you can pass different callbacks per
 * call site (useful when one element handles multiple actions).
 *
 * Usage:
 *   const lp = useLongPressTimer();
 *   onMouseDown={() => lp.start(handleLongPress)}
 *   onMouseUp={(e) => lp.end(e, handleClick)}
 *   onMouseLeave={() => lp.cancel()}
 */
const useLongPressTimer = (ms = 500) => {
    const timerRef = useRef(null);
    const isLongPress = useRef(false);

    const start = (callback) => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            if (callback) callback();
        }, ms);
    };

    const end = (e, onClick) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!isLongPress.current && onClick) {
            onClick(e);
        }
    };

    const cancel = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    return { start, end, cancel };
};

export default useLongPressTimer;
