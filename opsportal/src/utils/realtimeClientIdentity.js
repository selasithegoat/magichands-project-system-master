export const REALTIME_CLIENT_HEADER = "X-MH-Realtime-Client";

let runtimeClientId = "";

const createClientId = () => {
  const randomId =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ops-${randomId}`;
};

export const getRealtimeClientId = () => {
  if (!runtimeClientId) {
    runtimeClientId = createClientId();
  }
  return runtimeClientId;
};

export const addRealtimeClientIdToUrl = (url) => {
  const value = String(url || "");
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}clientId=${encodeURIComponent(
    getRealtimeClientId(),
  )}`;
};

export const isSameOriginRequest = (url) => {
  if (typeof window === "undefined") return false;
  try {
    return new URL(String(url || ""), window.location.origin).origin ===
      window.location.origin;
  } catch {
    return false;
  }
};
