const typingSessions = new Map();

const buildSessionKey = (threadId, userId) =>
  `${String(threadId || "").trim()}:${String(userId || "").trim()}`;

const startTypingSession = ({
  threadId = "",
  userId = "",
  ttlMs = 4000,
  onExpire,
} = {}) => {
  const sessionKey = buildSessionKey(threadId, userId);
  if (!sessionKey || sessionKey === ":") {
    return false;
  }

  const existingSession = typingSessions.get(sessionKey);
  if (existingSession?.timeoutId) {
    clearTimeout(existingSession.timeoutId);
  }

  const timeoutId = setTimeout(() => {
    typingSessions.delete(sessionKey);
    if (typeof onExpire === "function") {
      onExpire();
    }
  }, Math.max(500, Number(ttlMs) || 0));

  typingSessions.set(sessionKey, { timeoutId });
  return Boolean(existingSession);
};

const stopTypingSession = ({ threadId = "", userId = "" } = {}) => {
  const sessionKey = buildSessionKey(threadId, userId);
  if (!sessionKey || sessionKey === ":") {
    return false;
  }

  const existingSession = typingSessions.get(sessionKey);
  if (!existingSession) {
    return false;
  }

  if (existingSession.timeoutId) {
    clearTimeout(existingSession.timeoutId);
  }

  typingSessions.delete(sessionKey);
  return true;
};

module.exports = {
  startTypingSession,
  stopTypingSession,
};
