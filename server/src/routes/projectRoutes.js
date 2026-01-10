const express = require("express");
const router = express.Router();
const {
  createProject,
  getProjects,
  getUserStats,
} = require("../controllers/projectController");
const { protect } = require("../middleware/authMiddleware");

router.get("/stats", protect, getUserStats);
router.post("/", protect, createProject);
router.get("/", protect, getProjects);

module.exports = router;
