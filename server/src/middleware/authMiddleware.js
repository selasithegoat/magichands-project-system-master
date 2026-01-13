const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  // Check for token in cookies specifically
  token = req.cookies.token;

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "dev_secret_key_12345"
      );

      // Get user from the token
      req.user = await User.findById(decoded.id).select("-password");

      // Sliding Expiration: Refresh the cookie if the token is valid
      // Note: We are re-setting the same token but extending the cookie lifetime
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 15 * 60 * 1000, // Reset to 15 minutes
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
