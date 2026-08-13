const { randomUUID } = require("crypto");
const UserSession = require("../models/UserSession");
const { getAuthCookieMaxAgeMs } = require("./cookieOptions");

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const SESSION_TOUCH_INTERVAL_MS = Math.max(
  10_000,
  parsePositiveInteger(process.env.SESSION_TOUCH_INTERVAL_MS, 60_000),
);

const resolveSessionExpiryDate = (fromDate = new Date()) => {
  const baseDate = fromDate instanceof Date ? fromDate : new Date(fromDate);
  return new Date(baseDate.getTime() + getAuthCookieMaxAgeMs());
};

const createUserSession = async ({
  userId,
  portal = "client",
  startedAt = new Date(),
} = {}) => {
  const createdAt = startedAt instanceof Date ? startedAt : new Date(startedAt);
  return UserSession.create({
    user: userId,
    sessionId: randomUUID(),
    portal: String(portal || "client").trim() || "client",
    startedAt: createdAt,
    lastSeenAt: createdAt,
    expiresAt: resolveSessionExpiryDate(createdAt),
  });
};

const touchUserSession = async (sessionId, touchedAt = new Date()) => {
  if (!sessionId) return null;

  const nextTouchedAt =
    touchedAt instanceof Date ? touchedAt : new Date(touchedAt);
  const activeFilter = {
    sessionId,
    loggedOutAt: null,
    expiresAt: { $gt: nextTouchedAt },
  };
  const select = "_id user sessionId expiresAt loggedOutAt lastSeenAt";
  const activeSession = await UserSession.findOne(activeFilter).select(select).lean();
  if (!activeSession) return null;

  const lastSeenAt = activeSession.lastSeenAt
    ? new Date(activeSession.lastSeenAt)
    : null;
  const shouldTouch =
    !lastSeenAt ||
    Number.isNaN(lastSeenAt.getTime()) ||
    nextTouchedAt.getTime() - lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;

  if (!shouldTouch) {
    return { ...activeSession, wasTouched: false };
  }

  const touchBefore = new Date(nextTouchedAt.getTime() - SESSION_TOUCH_INTERVAL_MS);
  const updatedSession = await UserSession.findOneAndUpdate(
    {
      ...activeFilter,
      $or: [
        { lastSeenAt: { $lte: touchBefore } },
        { lastSeenAt: null },
        { lastSeenAt: { $exists: false } },
      ],
    },
    {
      $set: {
        lastSeenAt: nextTouchedAt,
        expiresAt: resolveSessionExpiryDate(nextTouchedAt),
      },
    },
    {
      new: true,
      lean: true,
      select,
    },
  );

  if (updatedSession) return { ...updatedSession, wasTouched: true };

  const currentSession = await UserSession.findOne(activeFilter).select(select).lean();
  return currentSession ? { ...currentSession, wasTouched: false } : null;
};

const markUserSessionLoggedOut = async (sessionId, loggedOutAt = new Date()) => {
  if (!sessionId) return null;

  const nextLoggedOutAt =
    loggedOutAt instanceof Date ? loggedOutAt : new Date(loggedOutAt);
  return UserSession.findOneAndUpdate(
    {
      sessionId,
      loggedOutAt: null,
    },
    {
      $set: {
        loggedOutAt: nextLoggedOutAt,
        lastSeenAt: nextLoggedOutAt,
      },
    },
    {
      new: true,
      lean: true,
      select: "_id user sessionId expiresAt loggedOutAt",
    },
  );
};

module.exports = {
  resolveSessionExpiryDate,
  createUserSession,
  touchUserSession,
  markUserSessionLoggedOut,
};
