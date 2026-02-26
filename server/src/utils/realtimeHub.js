const clients = new Set();
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

const addClient = (res) => {
  clients.add(res);
  startHeartbeat();
};

const removeClient = (res) => {
  clients.delete(res);
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

module.exports = {
  addClient,
  removeClient,
  broadcastDataChange,
  broadcastNotificationChange,
};
