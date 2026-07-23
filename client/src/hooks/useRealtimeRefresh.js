import { useEffect, useRef } from "react";
import { getRealtimeClientId } from "../utils/realtimeClientIdentity";

const normalizePath = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  let pathname = rawValue;
  try {
    pathname = new URL(rawValue, window.location.origin).pathname;
  } catch {
    pathname = rawValue.split("?")[0];
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
};

const matchesPathPrefix = (pathValue, prefixValue) => {
  const path = normalizePath(pathValue);
  const prefix = normalizePath(prefixValue);
  if (!path || !prefix) return false;
  return path === prefix || path.startsWith(`${prefix}/`);
};

const useRealtimeRefresh = (onRefresh, options = {}) => {
  const {
    enabled = true,
    debounceMs = 400,
    paths = [],
    excludePaths = [],
    shouldRefresh,
    ignoreActorId = "",
  } = options;
  const callbackRef = useRef(onRefresh);
  const optionsRef = useRef({
    paths,
    excludePaths,
    shouldRefresh,
    ignoreActorId,
  });

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    optionsRef.current = {
      paths,
      excludePaths,
      shouldRefresh,
      ignoreActorId,
    };
  }, [excludePaths, ignoreActorId, paths, shouldRefresh]);

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
      const {
        paths: activePaths,
        excludePaths: activeExcludePaths,
        shouldRefresh: activeShouldRefresh,
        ignoreActorId: activeIgnoreActorId,
      } = optionsRef.current;
      const detail = event?.detail || {};
      const normalizedDetail = {
        ...detail,
        path: normalizePath(detail?.path),
        actorId: String(detail?.actorId || "").trim(),
      };

      if (
        normalizedDetail.sourceClientId &&
        normalizedDetail.sourceClientId === getRealtimeClientId()
      ) {
        return;
      }

      if (
        activeIgnoreActorId &&
        normalizedDetail.actorId &&
        normalizedDetail.actorId === String(activeIgnoreActorId).trim()
      ) {
        return;
      }

      if (
        activeExcludePaths.some((prefix) =>
          matchesPathPrefix(normalizedDetail.path, prefix),
        )
      ) {
        return;
      }

      if (
        activePaths.length > 0 &&
        !activePaths.some((prefix) =>
          matchesPathPrefix(normalizedDetail.path, prefix),
        )
      ) {
        return;
      }

      if (
        typeof activeShouldRefresh === "function" &&
        !activeShouldRefresh(normalizedDetail)
      ) {
        return;
      }

      if (document.visibilityState === "hidden") {
        pendingHiddenDetail = normalizedDetail;
        return;
      }

      scheduleRefresh(normalizedDetail);
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

    window.addEventListener("mh:data-changed", handler);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mh:data-changed", handler);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerId) clearTimeout(timerId);
    };
  }, [enabled, debounceMs]);
};

export default useRealtimeRefresh;
