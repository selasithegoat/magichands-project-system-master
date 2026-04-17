const SESSION_TIMEOUT_NOTICE_KEY = "mh-admin-session-timeout-notice";

export const buildSessionTimeoutMessage = (timeoutMs = 5 * 60 * 1000) => {
  const minutes = Math.max(1, Math.round(timeoutMs / 60000));
  return `Your session expired after ${minutes} minutes of inactivity. You were logged out. Please sign in again.`;
};

export const setSessionTimeoutNotice = (timeoutMs) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    SESSION_TIMEOUT_NOTICE_KEY,
    buildSessionTimeoutMessage(timeoutMs),
  );
};

export const consumeSessionTimeoutNotice = () => {
  if (typeof window === "undefined") return "";
  const message =
    window.sessionStorage.getItem(SESSION_TIMEOUT_NOTICE_KEY) || "";
  if (message) {
    window.sessionStorage.removeItem(SESSION_TIMEOUT_NOTICE_KEY);
  }
  return message;
};

export const clearSessionTimeoutNotice = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_TIMEOUT_NOTICE_KEY);
};
