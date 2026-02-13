const express = require("express");
const router = express.Router();
const {
  getWallboardSession,
  getWallboardOverview,
} = require("../controllers/opsWallboardController");
const { protect, requireRole } = require("../middleware/authMiddleware");

router.use(protect);
router.use(requireRole("admin"));

router.get("/session", getWallboardSession);
router.get("/overview", getWallboardOverview);

module.exports = router;
