const UserSession = require("../models/UserSession");

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value?.toHexString === "function") {
    return value.toHexString();
  }
  if (typeof value?.toString === "function") {
    const stringValue = value.toString();
    if (stringValue && stringValue !== "[object Object]") {
      return stringValue;
    }
  }
  if (typeof value === "object") {
    if (value._id) return toIdString(value._id);
    if (value.id) return toIdString(value.id);
  }
  return "";
};

const buildPresenceMap = (userIds = [], sessions = [], now = new Date()) => {
  const presenceMap = Array.from(new Set(userIds.map((entry) => toIdString(entry)).filter(Boolean))).reduce(
    (acc, userId) => {
      acc[userId] = {
        isOnline: false,
        lastOnlineAt: null,
      };
      return acc;
    },
    {},
  );

  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    const userId = toIdString(session?.user);
    if (!userId || !presenceMap[userId]) {
      return;
    }

    const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null;
    const loggedOutAt = session?.loggedOutAt ? new Date(session.loggedOutAt) : null;
    const isExpired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now;
    const isActive = !loggedOutAt && !isExpired;

    if (isActive) {
      presenceMap[userId] = {
        isOnline: true,
        lastOnlineAt: null,
      };
      return;
    }

    const endedAt =
      loggedOutAt && !Number.isNaN(loggedOutAt.getTime())
        ? loggedOutAt
        : expiresAt && !Number.isNaN(expiresAt.getTime())
          ? expiresAt
          : null;

    if (!endedAt || presenceMap[userId].isOnline) {
      return;
    }

    const previousEndedAt = presenceMap[userId].lastOnlineAt
      ? new Date(presenceMap[userId].lastOnlineAt)
      : null;

    if (
      !previousEndedAt ||
      Number.isNaN(previousEndedAt.getTime()) ||
      endedAt > previousEndedAt
    ) {
      presenceMap[userId] = {
        isOnline: false,
        lastOnlineAt: endedAt.toISOString(),
      };
    }
  });

  return presenceMap;
};

const resolvePresenceMap = async (userIds = []) => {
  const dedupedIds = Array.from(
    new Set(userIds.map((entry) => toIdString(entry)).filter(Boolean)),
  );

  if (dedupedIds.length === 0) {
    return {};
  }

  const sessions = await UserSession.find({
    user: { $in: dedupedIds },
  })
    .select("user expiresAt loggedOutAt")
    .lean();

  return buildPresenceMap(dedupedIds, sessions, new Date());
};

module.exports = {
  resolvePresenceMap,
};
