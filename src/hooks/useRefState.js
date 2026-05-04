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
  const ref = useRef(initialValue);
  const [state, _setState] = useState(initialValue);

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
