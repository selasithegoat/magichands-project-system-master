const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { resolveCookieOptions } = require("../utils/cookieOptions");

const ADMIN_DEPARTMENT_KEY = "administration";

const toLowerTrimmed = (value) => String(value || "").trim().toLowerCase();

const normalizeDepartmentValues = (value) =>
  (Array.isArray(value) ? value : [value])
    .map((entry) => toLowerTrimmed(entry))
    .filter(Boolean);

const hasAdministrationDepartment = (user) =>
  normalizeDepartmentValues(user?.department).includes(ADMIN_DEPARTMENT_KEY);

const hasAdminPortalAccess = (user) =>
  user?.role === "admin" && hasAdministrationDepartment(user);

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

const isPrivilegedPortalRequest = (req) =>
  isAdminPortalRequest(req) || isOpsPortalRequest(req);

const selectAuthToken = (req) => {
  if (isPrivilegedPortalRequest(req)) {
    return req.cookies.token_admin;
  }

  // Client portal: allow admin tokens to access client routes too
  return req.cookies.token_client || req.cookies.token_admin;
};

const protect = async (req, res, next) => {
  let token;

  // Check for token in cookies specifically, prioritizing based on expected context if possible,
  // but for now we check all.
  // Note: This middleware protects both Admin and Client routes.
  // We need to decide which token to use if BOTH exist.
  // Usually, valid token wins.

  // Prefer token_admin if we are hitting an admin route?
  // We don't know easily without checking URL.
  // Let's just grab whichever exists.

  token = selectAuthToken(req);

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select("-password");
      if (!req.user) {
        return res.status(401).json({ message: "Not authorized" });
      }

      if (isAdminPortalRequest(req) && !hasAdminPortalAccess(req.user)) {
        return res.status(403).json({
          message:
            "Access denied: admin portal is restricted to Administration department admins.",
        });
      }

      // Decide which cookie updated
      // If user is admin, refresh token_admin. Else token_client.
      const cookieName =
        req.user.role === "admin" ? "token_admin" : "token_client";

      // Sliding Expiration
      res.cookie(cookieName, token, resolveCookieOptions());

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: "Not authorized" });
    }
  } else {
    res.status(401).json({ message: "Not authorized, no token" });
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
  let token;
  token = selectAuthToken(req);

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
      if (!req.user) {
        return next();
      }

      if (isAdminPortalRequest(req) && !hasAdminPortalAccess(req.user)) {
        req.user = null;
        return next();
      }

      // Sliding Expiration (keep session alive)
      const cookieName =
        req.user.role === "admin" ? "token_admin" : "token_client";

      res.cookie(cookieName, token, resolveCookieOptions());
    } catch (error) {
      // Invalid token - typically we just ignore and treat as guest
      // but strictly speaking we could clear the cookie here too?
    }
  }
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
};
