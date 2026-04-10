const { randomUUID } = require("crypto");
const UserSession = require("../models/UserSession");
const { getAuthCookieMaxAgeMs } = require("./cookieOptions");

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
  return UserSession.findOneAndUpdate(
    {
      sessionId,
      loggedOutAt: null,
      expiresAt: { $gt: nextTouchedAt },
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
      select: "_id user sessionId expiresAt loggedOutAt",
    },
  );
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
