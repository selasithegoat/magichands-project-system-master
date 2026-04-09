const clients = new Set();
const clientsByUserId = new Map();
const clientUserLookup = new Map();
let heartbeat = null;

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
  if (clients.size === 0) {
    stopHeartbeat();
  }
};

const broadcastDataChange = (payload = {}) => {
  if (clients.size === 0) return;
  const data = JSON.stringify({ ts: Date.now(), ...payload });
  const message = `event: data_changed\ndata: ${data}\n\n`;
  for (const res of clients) {
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
  const message = `event: chat_changed\ndata: ${data}\n\n`;

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

module.exports = {
  addClient,
  removeClient,
  broadcastDataChange,
  broadcastNotificationChange,
  broadcastChatChange,
};
