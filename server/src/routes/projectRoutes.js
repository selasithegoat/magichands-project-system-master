const express = require("express");
const router = express.Router();
const {
  createProject,
  getProjects,
  getUserStats,
  getProjectById,
  addItemToProject,
  deleteItemFromProject,
  updateProjectStatus,
  addChallengeToProject,
  updateChallengeStatus,
  deleteChallenge,
  getProjectActivity,
  addProductionRisk,
  updateProductionRisk,
  deleteProductionRisk,
  addUncontrollableFactor,
  updateUncontrollableFactor,
  deleteUncontrollableFactor,
  updateItemInProject, // [FIX]
  updateProjectDepartments, // [FIX]
  getUserActivity, // [NEW]
  deleteOldUserActivity, // [NEW] - Fix for reference error
  updateProject, // [NEW] - Full Update
  deleteProject, // [NEW]
  getClients, // [NEW]
  reopenProject, // [NEW]
  acknowledgeProject,
} = require("../controllers/projectController");
const { protect } = require("../middleware/authMiddleware");

const upload = require("../middleware/upload"); // [NEW]

const maxFileSizeMb = upload.maxFileSizeMb || 50;
const projectUploadFields = [
  { name: "sampleImage", maxCount: 1 },
  { name: "attachments", maxCount: 10 },
];

const handleProjectUploads = (req, res, next) => {
  upload.fields(projectUploadFields)(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ message: `File too large. Max limit is ${maxFileSizeMb}MB.` });
      }
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

router.delete("/activities/me/cleanup", protect, deleteOldUserActivity);
router.get("/activities/me", protect, getUserActivity); // [NEW] - Must be before /:id routes
router.get("/clients", protect, getClients); // [NEW] - Get all clients with their projects
router.get("/stats", protect, getUserStats);
router.get("/:id/activity", protect, getProjectActivity);
router.post("/:id/items", protect, addItemToProject);
router.patch("/:id/items/:itemId", protect, updateItemInProject); // New
router.delete("/:id/items/:itemId", protect, deleteItemFromProject);

router.put("/:id/departments", protect, updateProjectDepartments); // New
router.post("/:id/challenges", protect, addChallengeToProject);
router.patch(
  "/:id/challenges/:challengeId/status",
  protect,
  updateChallengeStatus,
);
router.delete("/:id/challenges/:challengeId", protect, deleteChallenge);

// Production Risks
router.post("/:id/production-risks", protect, addProductionRisk);
router.patch("/:id/production-risks/:riskId", protect, updateProductionRisk);
router.delete("/:id/production-risks/:riskId", protect, deleteProductionRisk);

// Uncontrollable Factors
router.post("/:id/uncontrollable-factors", protect, addUncontrollableFactor);
router.patch(
  "/:id/uncontrollable-factors/:factorId",
  protect,
  updateUncontrollableFactor,
);
router.delete(
  "/:id/uncontrollable-factors/:factorId",
  protect,
  deleteUncontrollableFactor,
);

router.patch("/:id/status", protect, updateProjectStatus);
router.patch("/:id/reopen", protect, reopenProject); // [NEW] - Reopen completed project
router.post("/:id/acknowledge", protect, acknowledgeProject); // [NEW] - Acknowledge engagement
router.get("/:id", protect, getProjectById);
router.delete("/:id", protect, deleteProject); // Delete Project
router.put(
  "/:id",
  protect,
  handleProjectUploads,
  updateProject,
); // Full update (Step 1-5)
router.post(
  "/",
  protect,
  handleProjectUploads,
  createProject,
);
router.get("/", protect, getProjects);

module.exports = router;
