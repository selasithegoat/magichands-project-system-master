const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  resolveCookieOptions,
  resolveClearCookieOptions,
} = require("../utils/cookieOptions");
const generateToken = require("../utils/generateToken");
const {
  createUserSession,
  touchUserSession,
} = require("../utils/userSessionService");
const { broadcastPresenceChange } = require("../utils/realtimeHub");

const ADMIN_DEPARTMENT_KEY = "administration";
const INVENTORY_ALLOWED_DEPARTMENTS = new Set([
  "front desk",
  "stores",
  "stock",
  "packaging",
]);

const toLowerTrimmed = (value) => String(value || "").trim().toLowerCase();

const normalizeDepartmentValues = (value) =>
  (Array.isArray(value) ? value : [value])
    .map((entry) => toLowerTrimmed(entry))
    .filter(Boolean);

const hasAdministrationDepartment = (user) =>
  normalizeDepartmentValues(user?.department).includes(ADMIN_DEPARTMENT_KEY);

const hasAdminPortalAccess = (user) =>
  user?.role === "admin" || hasAdministrationDepartment(user);

const hasInventoryPortalAccess = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;

  return normalizeDepartmentValues(user?.department).some((dept) =>
    INVENTORY_ALLOWED_DEPARTMENTS.has(dept),
  );
};

const getRequestHost = (req) => {
  const hostHeader =
    String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "")
      .split(",")[0]
      .trim();
  return hostHeader.split(":")[0].toLowerCase();
};

const readRefererPath = (req) => {
  const referer = String(req?.headers?.referer || "").trim();
  if (!referer) return "";

  try {
    return new URL(referer).pathname.toLowerCase();
  } catch {
    return referer.toLowerCase();
  }
};

const isAdminPortalRequest = (req) => {
  const refererPath = readRefererPath(req);
  const originalUrl = String(req?.originalUrl || "").toLowerCase();
  const baseUrl = String(req?.baseUrl || "").toLowerCase();
  const requestHost = getRequestHost(req);
  const adminHost = (process.env.ADMIN_HOST || "").toLowerCase();
  const source = toLowerTrimmed(req?.query?.source);

  return (
    (adminHost && requestHost === adminHost) ||
    baseUrl.startsWith("/api/admin") ||
    originalUrl.startsWith("/api/admin") ||
    source === "admin" ||
    refererPath === "/admin" ||
    refererPath.startsWith("/admin/")
  );
};

const isOpsPortalRequest = (req) => {
  const refererPath = readRefererPath(req);
  const originalUrl = String(req?.originalUrl || "").toLowerCase();
  const baseUrl = String(req?.baseUrl || "").toLowerCase();
  const requestHost = getRequestHost(req);
  const opsHost = (process.env.OPS_HOST || "").toLowerCase();

  return (
    (opsHost && requestHost === opsHost) ||
    baseUrl.startsWith("/api/ops") ||
    originalUrl.startsWith("/api/ops") ||
    refererPath === "/ops" ||
    refererPath.startsWith("/ops/")
  );
};

const isInventoryPortalRequest = (req) => {
  const refererPath = readRefererPath(req);
  const originalUrl = String(req?.originalUrl || "").toLowerCase();
  const baseUrl = String(req?.baseUrl || "").toLowerCase();
  const requestHost = getRequestHost(req);
  const inventoryHost = (process.env.INVENTORY_HOST || "").toLowerCase();
  const source = toLowerTrimmed(req?.query?.source);

  return (
    (inventoryHost && requestHost === inventoryHost) ||
    baseUrl.startsWith("/api/inventory") ||
    originalUrl.startsWith("/api/inventory") ||
    source === "inventory" ||
    refererPath === "/inventory" ||
    refererPath.startsWith("/inventory/")
  );
};

const isEngagedPortalRequest = (req) => {
  const refererPath = readRefererPath(req);
  const source = toLowerTrimmed(req?.query?.source);

  return (
    source === "engaged" ||
    refererPath === "/engaged-projects" ||
    refererPath.startsWith("/engaged-projects/")
  );
};

const isPrivilegedPortalRequest = (req) =>
  isAdminPortalRequest(req) || isOpsPortalRequest(req);

const getSessionPortalSource = (req) => {
  if (isAdminPortalRequest(req)) return "admin";
  if (isOpsPortalRequest(req)) return "ops";
  if (isInventoryPortalRequest(req)) return "inventory";
  if (isEngagedPortalRequest(req)) return "engaged";
  return "client";
};

const getAuthCookieNameForUser = (user) =>
  user?.role === "admin" ? "token_admin" : "token_client";

const selectAuthCookie = (req) => {
  if (isPrivilegedPortalRequest(req)) {
    return {
      token: req.cookies.token_admin,
      cookieName: "token_admin",
    };
  }

  if (req.cookies.token_client) {
    return {
      token: req.cookies.token_client,
      cookieName: "token_client",
    };
  }

  if (req.cookies.token_admin) {
    return {
      token: req.cookies.token_admin,
      cookieName: "token_admin",
    };
  }

  return {
    token: "",
    cookieName: "",
  };
};

const clearAuthCookieByName = (res, cookieName) => {
  if (!cookieName) return;

  const clearOptions = resolveClearCookieOptions();
  res.clearCookie(cookieName, clearOptions);
  res.cookie(cookieName, "", clearOptions);
};

const authenticateRequest = async (req, res, { optional = false } = {}) => {
  const { token, cookieName } = selectAuthCookie(req);

  if (!token) {
    req.user = null;
    if (optional) {
      return false;
    }
    res.status(401).json({ message: "Not authorized, no token" });
    return false;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      clearAuthCookieByName(res, cookieName);
      req.user = null;
      if (optional) {
        return false;
      }
      res.status(401).json({ message: "Not authorized" });
      return false;
    }

    if (isAdminPortalRequest(req) && !hasAdminPortalAccess(user)) {
      req.user = null;
      if (optional) {
        return false;
      }
      res.status(403).json({
        message:
          "Access denied: admin portal is restricted to Administration department admins.",
      });
      return false;
    }

    if (isInventoryPortalRequest(req) && !hasInventoryPortalAccess(user)) {
      req.user = null;
      if (optional) {
        return false;
      }
      res.status(403).json({
        message:
          "Access denied: inventory portal is restricted to Admin, Front Desk, and Stores users.",
      });
      return false;
    }

    const now = new Date();
    const rawSessionId =
      typeof decoded?.sid === "string" ? decoded.sid.trim() : "";
    let sessionId = rawSessionId;
    const isLegacyUpgrade = !sessionId;

    if (isLegacyUpgrade) {
      const createdSession = await createUserSession({
        userId: user._id,
        portal: getSessionPortalSource(req),
        startedAt: now,
      });
      sessionId = String(createdSession?.sessionId || "").trim();

      broadcastPresenceChange({
        userId: String(user._id),
        isOnline: true,
        lastOnlineAt: null,
      });
    } else {
      const activeSession = await touchUserSession(sessionId, now);
      if (!activeSession || String(activeSession.user || "") !== String(user._id)) {
        clearAuthCookieByName(
          res,
          cookieName || getAuthCookieNameForUser(user),
        );
        req.user = null;
        if (optional) {
          return false;
        }
        res.status(401).json({ message: "Not authorized" });
        return false;
      }
    }

    const nextCookieName = getAuthCookieNameForUser(user);
    res.cookie(
      nextCookieName,
      generateToken(user._id, sessionId),
      resolveCookieOptions(),
    );

    req.user = user;
    req.authSession = {
      sessionId,
      cookieName: nextCookieName,
      isLegacyUpgrade,
    };
    return true;
  } catch (error) {
    console.error(error);
    clearAuthCookieByName(res, cookieName);
    req.user = null;
    if (optional) {
      return false;
    }
    res.status(401).json({ message: "Not authorized" });
    return false;
  }
};

const protect = async (req, res, next) => {
  const isAuthorized = await authenticateRequest(req, res);
  if (isAuthorized) {
    next();
  }
};

// Middleware for admin access
const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(401).json({ message: "Not authorized as an admin" });
  }
};

const checkAuth = async (req, res, next) => {
  await authenticateRequest(req, res, { optional: true });
  next();
};

// Middleware for admin access
const requireRole = (role) => (req, res, next) => {
  if (req.user && req.user.role === role) {
    return next();
  }
  return res.status(401).json({ message: "Not authorized" });
};

module.exports = {
  protect,
  admin,
  checkAuth,
  requireRole,
  hasAdminPortalAccess,
  hasInventoryPortalAccess,
  isAdminPortalRequest,
  isInventoryPortalRequest,
  isEngagedPortalRequest,
  getSessionPortalSource,
  getAuthCookieNameForUser,
  selectAuthCookie,
};
