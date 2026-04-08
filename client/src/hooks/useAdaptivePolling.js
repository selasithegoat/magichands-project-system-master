import { useEffect, useRef } from "react";

const useAdaptivePolling = (
  callback,
  {
    enabled = true,
    intervalMs = 15000,
    hiddenIntervalMs,
    runImmediately = true,
    refetchOnFocus = true,
  } = {},
) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const visibleDelay = Math.max(1000, Number(intervalMs) || 15000);
    const hiddenDelay = Math.max(
      visibleDelay,
      Number(hiddenIntervalMs) || visibleDelay * 4,
    );

    let timeoutId;
    let cancelled = false;
    let running = false;

    const clearScheduled = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      clearScheduled();
      const isHidden = document.visibilityState === "hidden";
      timeoutId = window.setTimeout(
        () => {
          void runPoll();
        },
        isHidden ? hiddenDelay : visibleDelay,
      );
    };

    const runPoll = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        await callbackRef.current?.();
      } finally {
        running = false;
        scheduleNext();
      }
    };

    const handleVisibilityRefresh = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible" && refetchOnFocus) {
        clearScheduled();
        void runPoll();
        return;
      }
      scheduleNext();
    };

    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    window.addEventListener("focus", handleVisibilityRefresh);

    if (runImmediately) {
      void runPoll();
    } else {
      scheduleNext();
    }

    return () => {
      cancelled = true;
      clearScheduled();
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      window.removeEventListener("focus", handleVisibilityRefresh);
    };
  }, [enabled, hiddenIntervalMs, intervalMs, refetchOnFocus, runImmediately]);
};

export default useAdaptivePolling;
