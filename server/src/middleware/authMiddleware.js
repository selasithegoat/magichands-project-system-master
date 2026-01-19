const jwt = require("jsonwebtoken");
const User = require("../models/User");

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

  // Determine origin to prevent session interference on localhost
  const origin = req.headers.origin || req.headers.referer || "";

  // Specific port checks for development/local environment
  if (origin.includes("3000")) {
    // Admin Portal
    token = req.cookies.token_admin || req.cookies.token; // Allow legacy 'token' fallback if needed, or strictly token_admin?
    // If we fallback to 'token', and 'token' is shared, we risk contamination if 'token' was set by Client.
    // Ideally we migrate to just token_admin.
    // For now, let's prefer token_admin.
    token = req.cookies.token_admin;
  } else if (origin.includes("5173")) {
    // Client Portal
    // Allow token_admin fallback for admins testing client view
    token =
      req.cookies.token_client || req.cookies.token_admin || req.cookies.token;
  } else {
    // Unknown origin (Postman, production domain, etc.)
    token =
      req.cookies.token_admin || req.cookies.token_client || req.cookies.token;
  }

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "dev_secret_key_12345"
      );

      // Get user from the token
      req.user = await User.findById(decoded.id).select("-password");

      // Decide which cookie updated
      // If user is admin, refresh token_admin. Else token_client.
      const cookieName =
        req.user.role === "admin" ? "token_admin" : "token_client";

      // Sliding Expiration
      res.cookie(cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 15 * 60 * 1000,
      });

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

module.exports = { protect, admin };
