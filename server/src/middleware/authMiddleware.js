const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { resolveCookieOptions } = require("../utils/cookieOptions");

const isAdminPortalRequest = (req) => {
  const referer = req.headers.referer || "";
  const originalUrl = req.originalUrl || "";
  const baseUrl = req.baseUrl || "";
  const hostHeader =
    req.headers["x-forwarded-host"] || req.headers.host || "";
  const requestHost = hostHeader.split(":")[0].toLowerCase();
  const adminHost = (process.env.ADMIN_HOST || "").toLowerCase();

  return (
    (adminHost && requestHost === adminHost) ||
    baseUrl.startsWith("/api/admin") ||
    originalUrl.startsWith("/api/admin") ||
    referer.includes("/admin")
  );
};

const selectAuthToken = (req) => {
  if (isAdminPortalRequest(req)) {
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

module.exports = { protect, admin, checkAuth, requireRole };
