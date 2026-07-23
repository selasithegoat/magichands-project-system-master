import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const normalizePath = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    return new URL(rawValue, window.location.origin).pathname.replace(/\/+$/, "");
  } catch {
    return rawValue.split("?")[0].replace(/\/+$/, "");
  }
};

const matchesPath = (changedPath, watchedPath) =>
  changedPath === watchedPath || changedPath.startsWith(`${watchedPath}/`);

const queryMatchesChange = (query, detail) => {
  const changedPath = normalizePath(detail?.path);
  if (!changedPath) return false;

  const watchedPaths = Array.isArray(query?.meta?.realtimePaths)
    ? query.meta.realtimePaths.map(normalizePath).filter(Boolean)
    : [];
  if (!watchedPaths.some((path) => matchesPath(changedPath, path))) {
    return false;
  }

  const watchedProjectId = String(query?.meta?.projectId || "").trim();
  const changedProjectId = String(detail?.projectId || "").trim();
  if (
    watchedProjectId &&
    changedProjectId &&
    watchedProjectId !== changedProjectId
  ) {
    return false;
  }

  const shouldRefresh = query?.meta?.realtimeShouldRefresh;
  return typeof shouldRefresh !== "function" || shouldRefresh(detail);
};

const RealtimeQuerySync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let hasPendingChanges = false;

    const invalidate = (detail, refetchType = "active") =>
      queryClient.invalidateQueries({
        predicate: (query) => queryMatchesChange(query, detail),
        refetchType,
      });

    const handleChange = (event) => {
      const detail = event?.detail || {};
      if (document.visibilityState === "hidden") {
        hasPendingChanges = true;
        void invalidate(detail, "none");
        return;
      }
      void invalidate(detail);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !hasPendingChanges) return;
      hasPendingChanges = false;
      void queryClient.refetchQueries({ type: "active", stale: true });
    };

    window.addEventListener("mh:data-changed", handleChange);
    window.addEventListener("mh:mutation-succeeded", handleChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mh:data-changed", handleChange);
      window.removeEventListener("mh:mutation-succeeded", handleChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient]);

  return null;
};

export default RealtimeQuerySync;
