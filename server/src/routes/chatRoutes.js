const express = require("express");
const {
  getThreads,
  getThreadMessages,
  startDirectThread,
  sendMessage,
  markThreadRead,
  searchUsers,
  searchProjects,
  getProjectRoutes,
} = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/threads", protect, getThreads);
router.get("/users", protect, searchUsers);
router.get("/projects", protect, searchProjects);
router.get("/projects/:id/routes", protect, getProjectRoutes);
router.post("/direct", protect, startDirectThread);
router.get("/threads/:id/messages", protect, getThreadMessages);
router.post("/threads/:id/messages", protect, sendMessage);
router.post("/threads/:id/read", protect, markThreadRead);

module.exports = router;
