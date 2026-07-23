export const MUTATION_FEEDBACK_EVENT = "mh:mutation-feedback";

const FETCH_INSTALL_KEY = "__mhMutationFeedbackFetchInstalled";
const AXIOS_INSTALL_KEY = "__mhMutationFeedbackAxiosInstalled";
const MINIMUM_VISIBLE_MS = 320;
let requestSequence = 0;

const getNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const getMethod = (input, init = {}) =>
  String(init?.method || input?.method || "GET").toUpperCase();

const getRequestUrl = (input) =>
  String(typeof input === "string" ? input : input?.url || "");

const isPassiveMutation = (url = "") => {
  const normalizedUrl = String(url).toLowerCase();
  return (
    normalizedUrl.includes("/api/notifications/") ||
    normalizedUrl.endsWith("/api/notifications") ||
    normalizedUrl.includes("/typing") ||
    normalizedUrl.includes("/read-receipt")
  );
};

const shouldTrackMutation = (method, url) =>
  !["GET", "HEAD", "OPTIONS"].includes(method) && !isPassiveMutation(url);

const getFeedbackLabel = (method) => {
  if (method === "DELETE") return "Removing…";
  if (method === "PATCH" || method === "PUT") return "Applying changes…";
  return "Processing…";
};

const dispatchFeedback = (detail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MUTATION_FEEDBACK_EVENT, { detail }));
};

const waitForRemainingVisibility = async (startedAt) => {
  const elapsed = getNow() - startedAt;
  const remaining = Math.max(0, MINIMUM_VISIBLE_MS - elapsed);
  if (remaining > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remaining));
  }
};

export const waitForNextPaint = () =>
  new Promise((resolve) => {
    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function" ||
      typeof document === "undefined" ||
      document.visibilityState === "hidden"
    ) {
      globalThis.setTimeout(resolve, 0);
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

const beginFeedback = (method) => {
  const id = `mutation-${Date.now()}-${requestSequence++}`;
  const startedAt = getNow();
  dispatchFeedback({
    phase: "start",
    id,
    label: getFeedbackLabel(method),
  });
  return { id, startedAt };
};

const finishFeedback = async ({ id, startedAt }) => {
  await waitForRemainingVisibility(startedAt);
  dispatchFeedback({ phase: "finish", id });
};

const installFetchFeedback = () => {
  if (
    typeof window === "undefined" ||
    typeof window.fetch !== "function" ||
    window[FETCH_INSTALL_KEY]
  ) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const method = getMethod(input, init);
    const url = getRequestUrl(input);
    if (!shouldTrackMutation(method, url)) {
      return nativeFetch(input, init);
    }

    const feedback = beginFeedback(method);
    await waitForNextPaint();

    try {
      const response = await nativeFetch(input, init);
      await finishFeedback(feedback);
      return response;
    } catch (error) {
      await finishFeedback(feedback);
      throw error;
    }
  };

  window[FETCH_INSTALL_KEY] = true;
};

const installAxiosFeedback = (axios) => {
  if (!axios?.interceptors || axios[AXIOS_INSTALL_KEY]) return;

  axios.interceptors.request.use(async (config) => {
    const method = String(config?.method || "GET").toUpperCase();
    if (!shouldTrackMutation(method, config?.url)) return config;

    const feedback = beginFeedback(method);
    config.mhMutationFeedback = feedback;
    await waitForNextPaint();
    return config;
  });

  const finishAxiosFeedback = async (value) => {
    const feedback = value?.config?.mhMutationFeedback;
    if (feedback) await finishFeedback(feedback);
    return value;
  };

  axios.interceptors.response.use(
    finishAxiosFeedback,
    async (error) => {
      const feedback = error?.config?.mhMutationFeedback;
      if (feedback) await finishFeedback(feedback);
      return Promise.reject(error);
    },
  );

  axios[AXIOS_INSTALL_KEY] = true;
};

export const installMutationFeedback = ({ axios } = {}) => {
  installFetchFeedback();
  installAxiosFeedback(axios);
};
