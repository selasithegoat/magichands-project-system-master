import { useEffect, useRef } from "react";
import { getRealtimeClientId } from "../utils/realtimeClientIdentity";

const useRealtimeRefresh = (onRefresh, options = {}) => {
  const { enabled = true, debounceMs = 500 } = options;
  const callbackRef = useRef(onRefresh);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    let timerId;
    let pendingHiddenDetail = null;
    const scheduleRefresh = (detail) => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        if (document.visibilityState === "hidden") {
          pendingHiddenDetail = detail;
          return;
        }
        if (callbackRef.current) {
          callbackRef.current(detail);
        }
      }, debounceMs);
    };

    const handler = (event) => {
      const detail = event?.detail || {};
      if (
        detail.sourceClientId &&
        detail.sourceClientId === getRealtimeClientId()
      ) {
        return;
      }

      if (document.visibilityState === "hidden") {
        pendingHiddenDetail = detail;
        return;
      }

      scheduleRefresh(detail);
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState !== "visible" ||
        !pendingHiddenDetail
      ) {
        return;
      }

      const detail = pendingHiddenDetail;
      pendingHiddenDetail = null;
      scheduleRefresh(detail);
    };

    window.addEventListener("mh:ops-data-changed", handler);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mh:ops-data-changed", handler);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerId) clearTimeout(timerId);
    };
  }, [enabled, debounceMs]);
};

export default useRealtimeRefresh;
