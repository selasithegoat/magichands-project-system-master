const clients = new Set();
const clientsByUserId = new Map();
const clientsBySessionId = new Map();
const clientUserLookup = new Map();
const clientSessionLookup = new Map();
const clientRealtimeIdLookup = new Map();
let heartbeat = null;

const writeEvent = (eventName, payload = {}, options = {}) => {
  if (clients.size === 0) return;

  const broadcast = Boolean(options?.broadcast);
  const rawUserIds = Array.isArray(options?.userIds) ? options.userIds : [];
  const userIds = Array.from(
    new Set(rawUserIds.map((entry) => String(entry || "").trim()).filter(Boolean)),
  );

  if (!broadcast && userIds.length === 0) {
    return;
  }

  const data = JSON.stringify({ ts: Date.now(), ...payload });
  const message = `event: ${eventName}\ndata: ${data}\n\n`;

  if (broadcast) {
    for (const res of clients) {
      res.write(message);
    }
    return;
  }

  const delivered = new Set();
  for (const userId of userIds) {
    const bucket = clientsByUserId.get(userId);
    if (!bucket) continue;
    for (const res of bucket) {
      if (delivered.has(res)) continue;
      delivered.add(res);
      res.write(message);
    }
  }
};

const startHeartbeat = () => {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    const payload = `: ping ${Date.now()}\n\n`;
    for (const res of clients) {
      res.write(payload);
    }
  }, 25000);
};

const stopHeartbeat = () => {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
};

const addClient = (res, options = {}) => {
  clients.add(res);
  const userId = String(options?.userId || "").trim();
  if (userId) {
    clientUserLookup.set(res, userId);
    const bucket = clientsByUserId.get(userId) || new Set();
    bucket.add(res);
    clientsByUserId.set(userId, bucket);
  }
  const sessionId = String(options?.sessionId || "").trim();
  if (sessionId) {
    clientSessionLookup.set(res, sessionId);
    const bucket = clientsBySessionId.get(sessionId) || new Set();
    bucket.add(res);
    clientsBySessionId.set(sessionId, bucket);
  }
  const clientId = String(options?.clientId || "").trim();
  if (clientId) {
    clientRealtimeIdLookup.set(res, clientId);
  }
  startHeartbeat();
};

const removeClient = (res) => {
  clients.delete(res);
  const userId = clientUserLookup.get(res);
  if (userId) {
    const bucket = clientsByUserId.get(userId);
    if (bucket) {
      bucket.delete(res);
      if (bucket.size === 0) {
        clientsByUserId.delete(userId);
      }
    }
    clientUserLookup.delete(res);
  }
  const sessionId = clientSessionLookup.get(res);
  if (sessionId) {
    const bucket = clientsBySessionId.get(sessionId);
    if (bucket) {
      bucket.delete(res);
      if (bucket.size === 0) {
        clientsBySessionId.delete(sessionId);
      }
    }
    clientSessionLookup.delete(res);
  }
  clientRealtimeIdLookup.delete(res);
  if (clients.size === 0) {
    stopHeartbeat();
  }
};

const disconnectSessionClients = (sessionId) => {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return 0;

  const bucket = clientsBySessionId.get(normalizedSessionId);
  if (!bucket?.size) return 0;

  const sessionClients = Array.from(bucket);
  const data = JSON.stringify({ ts: Date.now(), reason: "logout" });
  const message = `event: session_ended\ndata: ${data}\n\n`;

  for (const res of sessionClients) {
    try {
      res.write(message);
      res.end();
    } catch {
      // A disconnected response is still removed from the realtime registry.
    } finally {
      removeClient(res);
    }
  }

  return sessionClients.length;
};

const broadcastDataChange = (payload = {}) => {
  if (clients.size === 0) return;
  const data = JSON.stringify({ ts: Date.now(), ...payload });
  const message = `event: data_changed\ndata: ${data}\n\n`;
  const sourceClientId = String(payload?.sourceClientId || "").trim();
  for (const res of clients) {
    if (
      sourceClientId &&
      clientRealtimeIdLookup.get(res) === sourceClientId
    ) {
      continue;
    }
    res.write(message);
  }
};

const broadcastNotificationChange = (payload = {}) => {
  if (clients.size === 0) return;
  const data = JSON.stringify({ ts: Date.now(), ...payload });
  const message = `event: notification_changed\ndata: ${data}\n\n`;
  for (const res of clients) {
    res.write(message);
  }
};

const broadcastChatChange = (payload = {}, options = {}) => {
  writeEvent("chat_changed", payload, options);
};

const broadcastChatTyping = (payload = {}, options = {}) => {
  writeEvent("chat_typing", payload, options);
};

const broadcastPresenceChange = (payload = {}) => {
  if (clients.size === 0) return;
  const data = JSON.stringify({ ts: Date.now(), ...payload });
  const message = `event: presence_changed\ndata: ${data}\n\n`;
  for (const res of clients) {
    res.write(message);
  }
};

module.exports = {
  addClient,
  removeClient,
  broadcastDataChange,
  broadcastNotificationChange,
  broadcastChatChange,
  broadcastChatTyping,
  broadcastPresenceChange,
  disconnectSessionClients,
};
