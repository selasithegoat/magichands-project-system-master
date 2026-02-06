import { useEffect, useRef } from "react";

const useRealtimeRefresh = (onRefresh, options = {}) => {
  const { enabled = true, debounceMs = 400 } = options;
  const callbackRef = useRef(onRefresh);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    let timerId;
    const handler = (event) => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        if (callbackRef.current) {
          callbackRef.current(event?.detail);
        }
      }, debounceMs);
    };

    window.addEventListener("mh:data-changed", handler);
    return () => {
      window.removeEventListener("mh:data-changed", handler);
      if (timerId) clearTimeout(timerId);
    };
  }, [enabled, debounceMs]);
};

export default useRealtimeRefresh;
