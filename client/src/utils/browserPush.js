const STATUS_EVENT = "mh:browser-push-status";

const getBasePath = () => {
  const base = String(import.meta.env.BASE_URL || "/");
  return base.endsWith("/") ? base : `${base}/`;
};

const emitStatus = (status, message = "") => {
  window.dispatchEvent(
    new CustomEvent(STATUS_EVENT, { detail: { status, message } }),
  );
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
};

export const getBrowserPushStatus = () => {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (!window.isSecureContext) return "insecure";
  return Notification.permission;
};

const registerWorker = () => {
  const basePath = getBasePath();
  return navigator.serviceWorker.register(`${basePath}sw.js`, {
    scope: basePath,
    updateViaCache: "none",
  });
};

const saveSubscription = async (subscription) => {
  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...subscription.toJSON(),
      portal: window.__MH_PORTAL__ === "admin" ? "admin" : "client",
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Could not save browser notification access.");
  }
};

export const syncBrowserPushSubscription = async ({ enabled = true } = {}) => {
  const initialStatus = getBrowserPushStatus();
  if (["unsupported", "insecure"].includes(initialStatus)) {
    emitStatus(initialStatus);
    return { status: initialStatus };
  }

  const registration = await registerWorker();
  const existing = await registration.pushManager.getSubscription();

  if (!enabled) {
    if (existing) {
      await fetch("/api/push/subscriptions", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: existing.endpoint }),
      }).catch(() => {});
      await existing.unsubscribe().catch(() => {});
    }
    emitStatus("disabled");
    return { status: "disabled" };
  }

  if (Notification.permission !== "granted") {
    emitStatus(Notification.permission);
    return { status: Notification.permission };
  }

  let subscription = existing;
  if (!subscription) {
    const configResponse = await fetch("/api/push/config", {
      credentials: "include",
      cache: "no-store",
    });
    const config = await configResponse.json().catch(() => ({}));
    if (!configResponse.ok || !config.publicKey) {
      throw new Error(config.message || "Browser notifications are unavailable.");
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  }

  await saveSubscription(subscription);
  emitStatus("subscribed");
  return { status: "subscribed", subscription };
};

export const requestBrowserPushPermission = async () => {
  const initialStatus = getBrowserPushStatus();
  if (["unsupported", "insecure"].includes(initialStatus)) {
    emitStatus(initialStatus);
    return { status: initialStatus };
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    emitStatus(permission);
    return { status: permission };
  }

  try {
    return await syncBrowserPushSubscription({ enabled: true });
  } catch (error) {
    emitStatus("error", error?.message || "Could not enable browser notifications.");
    return { status: "error", error };
  }
};

export const sendBrowserPushTest = async () => {
  const response = await fetch("/api/push/test", {
    method: "POST",
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Could not send test notification.");
  return data;
};

export const removeBrowserPushSubscription = async () => {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(getBasePath());
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    keepalive: true,
  }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
  emitStatus("disabled");
};

export { STATUS_EVENT as BROWSER_PUSH_STATUS_EVENT };
