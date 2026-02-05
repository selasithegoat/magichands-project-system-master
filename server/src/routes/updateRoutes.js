const express = require("express");
const router = express.Router();
const updateController = require("../controllers/updateController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const maxFileSizeMb = upload.maxFileSizeMb || 50;

// Get updates for a project
// GET /api/updates/project/:projectId
router.get("/project/:projectId", protect, updateController.getProjectUpdates);

// Create update for a project
// POST /api/updates/project/:projectId
router.post(
  "/project/:projectId",
  protect,
  (req, res, next) => {
    upload.single("attachment")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({
              message: `File too large. Max limit is ${maxFileSizeMb}MB.`,
            });
        }
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  updateController.createProjectUpdate,
);

// Delete an update
// DELETE /api/updates/:id
router.delete("/:id", protect, updateController.deleteProjectUpdate);

module.exports = router;
