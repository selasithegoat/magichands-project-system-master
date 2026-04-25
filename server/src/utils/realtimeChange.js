const jwt = require("jsonwebtoken");
const { selectAuthCookie } = require("../middleware/authMiddleware");

const PROJECT_STATIC_SEGMENTS = new Set([
  "activities",
  "ai",
  "bottlenecks",
  "clients",
  "department-updates",
  "dashboard-counts",
  "delivery-calendar",
  "orders",
  "sms-prompts",
  "stats",
]);

const normalizeRealtimePath = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  let pathname = rawValue;
  try {
    pathname = new URL(rawValue, "http://localhost").pathname;
  } catch {
    pathname = rawValue.split("?")[0];
  }

  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }

  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
};

const extractProjectIdFromPath = (pathValue) => {
  const pathname = normalizeRealtimePath(pathValue);
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "api" || segments[1] !== "projects") {
    return "";
  }

  const candidate = String(segments[2] || "").trim();
  if (!candidate || PROJECT_STATIC_SEGMENTS.has(candidate)) {
    return "";
  }

  return candidate;
};

const getActorIdFromRequest = (req) => {
  const tokenSecret = process.env.JWT_SECRET;
  if (!tokenSecret) return "";

  try {
    const { token } = selectAuthCookie(req);
    if (!token) return "";

    const decoded = jwt.verify(token, tokenSecret);
    return String(decoded?.id || "").trim();
  } catch {
    return "";
  }
};

const buildRealtimeChangePayload = (req, extra = {}) => {
  const path = normalizeRealtimePath(extra.path || req?.originalUrl || "");
  const method = String(extra.method || req?.method || "").trim().toUpperCase();
  const projectId = String(
    extra.projectId || extractProjectIdFromPath(path) || "",
  ).trim();
  const actorId = String(extra.actorId || getActorIdFromRequest(req) || "").trim();

  return {
    ...(path ? { path } : {}),
    ...(method ? { method } : {}),
    ...(projectId ? { projectId } : {}),
    ...(actorId ? { actorId } : {}),
    ...extra,
  };
};

module.exports = {
  normalizeRealtimePath,
  extractProjectIdFromPath,
  getActorIdFromRequest,
  buildRealtimeChangePayload,
};
