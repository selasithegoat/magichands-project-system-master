const express = require("express");
const {
  getThreads,
  getThreadMessages,
  startDirectThread,
  sendMessage,
  deleteMessage,
  updateMessage,
  markThreadRead,
  clearThreadMessages,
  searchUsers,
  searchProjects,
  getProjectRoutes,
} = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const router = express.Router();
const maxFileSizeMb = upload.maxFileSizeMb || 50;

const handleChatUploads = (req, res, next) => {
  upload.array("chatAttachments", 6)(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ message: `File too large. Max limit is ${maxFileSizeMb}MB.` });
      }
      return res.status(400).json({ message: err.message });
    }

    Promise.resolve(upload.scanRequestFiles(req))
      .then(() => next())
      .catch(async (scanError) => {
        await upload.cleanupRequestFiles(req);
        return res.status(400).json({
          message:
            scanError?.message ||
            "Uploaded file failed security checks. Please upload a different file.",
        });
      });
  });
};

router.get("/threads", protect, getThreads);
router.get("/users", protect, searchUsers);
router.get("/projects", protect, searchProjects);
router.get("/projects/:id/routes", protect, getProjectRoutes);
router.post("/direct", protect, startDirectThread);
router.get("/threads/:id/messages", protect, getThreadMessages);
router.post("/threads/:id/messages", protect, handleChatUploads, sendMessage);
router.patch("/threads/:id/messages/:messageId", protect, updateMessage);
router.post("/threads/:id/messages/:messageId", protect, updateMessage);
router.delete("/threads/:id/messages/:messageId", protect, deleteMessage);
router.post("/threads/:id/read", protect, markThreadRead);
router.post("/threads/:id/clear", protect, clearThreadMessages);

module.exports = router;
