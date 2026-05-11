import { useEffect, useRef } from "react";

const REALTIME_STATUS_EVENT = "mh:realtime-status";

const getRealtimeConnected = () => {
  if (typeof window === "undefined") return false;
  return Boolean(window.__MH_REALTIME_STATUS__?.connected);
};

const useAdaptivePolling = (
  callback,
  {
    enabled = true,
    intervalMs = 15000,
    hiddenIntervalMs,
    runImmediately = true,
    refetchOnFocus = true,
    pauseWhenRealtimeHealthy = false,
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
    let realtimeHealthy = pauseWhenRealtimeHealthy && getRealtimeConnected();

    const clearScheduled = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const shouldPauseForRealtime = () =>
      pauseWhenRealtimeHealthy && realtimeHealthy;

    const scheduleNext = () => {
      if (cancelled) return;
      clearScheduled();
      if (shouldPauseForRealtime()) return;
      const isHidden = document.visibilityState === "hidden";
      timeoutId = window.setTimeout(
        () => {
          void runPoll();
        },
        isHidden ? hiddenDelay : visibleDelay,
      );
    };

    const runPoll = async ({ force = false } = {}) => {
      if (cancelled || running) return;
      if (!force && shouldPauseForRealtime()) {
        clearScheduled();
        return;
      }
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
      if (shouldPauseForRealtime()) {
        clearScheduled();
        return;
      }
      if (document.visibilityState === "visible" && refetchOnFocus) {
        clearScheduled();
        void runPoll();
        return;
      }
      scheduleNext();
    };

    const handleRealtimeStatus = (event) => {
      const wasRealtimeHealthy = realtimeHealthy;
      const nextRealtimeHealthy =
        typeof event?.detail?.connected === "boolean"
          ? event.detail.connected
          : getRealtimeConnected();
      realtimeHealthy = Boolean(nextRealtimeHealthy);

      if (realtimeHealthy) {
        clearScheduled();
        return;
      }

      if (wasRealtimeHealthy) {
        scheduleNext();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    window.addEventListener("focus", handleVisibilityRefresh);
    if (pauseWhenRealtimeHealthy) {
      window.addEventListener(REALTIME_STATUS_EVENT, handleRealtimeStatus);
    }

    if (runImmediately) {
      void runPoll({ force: true });
    } else {
      scheduleNext();
    }

    return () => {
      cancelled = true;
      clearScheduled();
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      window.removeEventListener("focus", handleVisibilityRefresh);
      if (pauseWhenRealtimeHealthy) {
        window.removeEventListener(REALTIME_STATUS_EVENT, handleRealtimeStatus);
      }
    };
  }, [
    enabled,
    hiddenIntervalMs,
    intervalMs,
    pauseWhenRealtimeHealthy,
    refetchOnFocus,
    runImmediately,
  ]);
};

export default useAdaptivePolling;
