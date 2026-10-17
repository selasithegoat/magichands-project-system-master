self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "You have a new update." };
  }

  const title = payload.title || "MagicHands update";
  const tag = payload.tag || "mh-update";
  const autoCloseMs = Math.min(
    15000,
    Math.max(4000, Number(payload.autoCloseMs) || 9000),
  );

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body: payload.body || "You have a new update.",
        icon: payload.icon || "/mhlogo.png",
        badge: payload.badge || "/favicon-32x32.png",
        tag,
        renotify: false,
        requireInteraction: false,
        data: {
          actionUrl: payload.actionUrl || "/",
          notificationId: payload.notificationId || "",
        },
      })
      .then(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, autoCloseMs);
          }),
      )
      .then(() => self.registration.getNotifications({ tag }))
      .then((notifications) => notifications.forEach((notification) => notification.close())),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.actionUrl || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        return existing.navigate(targetUrl).then((client) => client?.focus());
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
