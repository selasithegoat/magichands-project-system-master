import {
  getRealtimeClientId,
  isSameOriginRequest,
  REALTIME_CLIENT_HEADER,
} from "./realtimeClientIdentity";

export const MUTATION_FEEDBACK_EVENT = "mh:mutation-feedback";

const INSTALL_KEY = "__mhMutationFeedbackFetchInstalled";
const MINIMUM_VISIBLE_MS = 320;
let requestSequence = 0;

const getNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const isPassiveMutation = (url = "") => {
  const normalizedUrl = String(url).toLowerCase();
  return (
    normalizedUrl.includes("/api/notifications/") ||
    normalizedUrl.endsWith("/api/notifications") ||
    normalizedUrl.includes("/typing") ||
    normalizedUrl.includes("/read-receipt")
  );
};

const getFeedbackLabel = (method) => {
  if (method === "DELETE") return "Removing…";
  if (method === "PATCH" || method === "PUT") return "Applying changes…";
  return "Processing…";
};

const addRealtimeIdentity = (input, init, method, url) => {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(method) ||
    !isSameOriginRequest(url)
  ) {
    return init;
  }

  const headers = new Headers(input?.headers || undefined);
  new Headers(init?.headers || undefined).forEach((value, key) => {
    headers.set(key, value);
  });
  headers.set(REALTIME_CLIENT_HEADER, getRealtimeClientId());
  return { ...(init || {}), headers };
};

const dispatchFeedback = (detail) => {
  window.dispatchEvent(new CustomEvent(MUTATION_FEEDBACK_EVENT, { detail }));
};

export const waitForNextPaint = () =>
  new Promise((resolve) => {
    if (
      typeof window.requestAnimationFrame !== "function" ||
      document.visibilityState === "hidden"
    ) {
      setTimeout(resolve, 0);
      return;
    }

    let finished = false;
    const fallbackId = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve();
    }, 80);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (finished) return;
        finished = true;
        window.clearTimeout(fallbackId);
        resolve();
      });
    });
  });

const finishFeedback = async ({ id, startedAt }) => {
  const elapsed = getNow() - startedAt;
  const remaining = Math.max(0, MINIMUM_VISIBLE_MS - elapsed);
  if (remaining > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remaining));
  }
  dispatchFeedback({ phase: "finish", id });
};

export const installMutationFeedback = () => {
  if (
    typeof window === "undefined" ||
    typeof window.fetch !== "function" ||
    window[INSTALL_KEY]
  ) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const method = String(
      init?.method || input?.method || "GET",
    ).toUpperCase();
    const url = String(typeof input === "string" ? input : input?.url || "");
    const requestInit = addRealtimeIdentity(input, init, method, url);
    if (
      ["GET", "HEAD", "OPTIONS"].includes(method) ||
      isPassiveMutation(url)
    ) {
      return nativeFetch(input, requestInit);
    }

    const feedback = {
      id: `mutation-${Date.now()}-${requestSequence++}`,
      startedAt: getNow(),
    };
    dispatchFeedback({
      phase: "start",
      id: feedback.id,
      label: getFeedbackLabel(method),
    });
    await waitForNextPaint();

    try {
      const response = await nativeFetch(input, requestInit);
      await finishFeedback(feedback);
      return response;
    } catch (error) {
      await finishFeedback(feedback);
      throw error;
    }
  };

  window[INSTALL_KEY] = true;
};
