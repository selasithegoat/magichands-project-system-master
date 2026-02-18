const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearNotifications,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const NOTIFICATION_READ_LIMIT_WINDOW_MS = toPositiveInt(
  process.env.NOTIFICATION_READ_LIMIT_WINDOW_MS,
  60 * 1000,
);
const NOTIFICATION_READ_LIMIT_MAX = toPositiveInt(
  process.env.NOTIFICATION_READ_LIMIT_MAX,
  240,
);

const notificationReadLimiter = rateLimit({
  windowMs: NOTIFICATION_READ_LIMIT_WINDOW_MS,
  max: NOTIFICATION_READ_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?._id
      ? `user:${String(req.user._id)}`
      : `ip:${ipKeyGenerator(req.ip)}`,
  message: {
    message:
      "Too many notification refresh requests. Please wait a moment and try again.",
  },
});

router.use(protect);

router.get("/", notificationReadLimiter, getNotifications);
router.delete("/", clearNotifications);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

module.exports = router;
