import { useState, useCallback, useRef } from 'react';

/**
 * useState that keeps a ref synchronised with the current value.
 *
 * The ref is readable synchronously inside AudioContext callbacks and Sequencer
 * closures without stale-closure risk. The state value drives React re-renders
 * as normal.
 *
 * Returns [value, setter, ref] — identical calling convention to useState
 * except for the extra ref as the third element.
 */
const useRefState = (initialValue) => {
  // useRef does NOT call lazy initializer functions — unlike useState.
  // If initialValue is a function (React lazy-init pattern), ref.current would be set to
  // the function itself rather than its return value, causing crashes in Sequencer callbacks
  // that read refs directly. Fix: wrap both in a single lazy-init so React evaluates the
  // function once and we synchronously assign the result to ref.current.
  const ref = useRef(null);
  const [state, _setState] = useState(() => {
    const val = typeof initialValue === 'function' ? initialValue() : initialValue;
    ref.current = val;
    return val;
  });

  const setState = useCallback((val) => {
    if (typeof val === 'function') {
      _setState((prev) => {
        const next = val(prev);
        ref.current = next;
        return next;
      });
    } else {
      ref.current = val;
      _setState(val);
    }
  }, []);

  return [state, setState, ref];
};

export default useRefState;
