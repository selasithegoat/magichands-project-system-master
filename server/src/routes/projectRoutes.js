const express = require("express");
const router = express.Router();
const {
  createProject,
  getProjects,
  getOrderGroups,
  getOrderGroupByNumber,
  getUserStats,
  getProjectById,
  addItemToProject,
  deleteItemFromProject,
  setProjectHold,
  updateProjectStatus,
  uploadProjectMockup,
  addFeedbackToProject,
  deleteFeedbackFromProject,
  addChallengeToProject,
  updateChallengeStatus,
  deleteChallenge,
  getProjectActivity,
  suggestProductionRisks,
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
  undoAcknowledgeProject,
  markInvoiceSent,
  verifyPayment,
  undoInvoiceSent,
  undoPaymentVerification,
} = require("../controllers/projectController");
const { protect } = require("../middleware/authMiddleware");
const {
  requireProjectNotOnHold,
} = require("../middleware/projectHoldMiddleware");

const upload = require("../middleware/upload"); // [NEW]
const enforceProjectNotOnHold = requireProjectNotOnHold({ paramName: "id" });

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

const handleMockupUpload = (req, res, next) => {
  upload.single("mockup")(req, res, (err) => {
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

router.delete("/activities/me/cleanup", protect, deleteOldUserActivity);
router.get("/activities/me", protect, getUserActivity); // [NEW] - Must be before /:id routes
router.get("/clients", protect, getClients); // [NEW] - Get all clients with their projects
router.get("/orders", protect, getOrderGroups);
router.get("/orders/:orderNumber", protect, getOrderGroupByNumber);
router.get("/stats", protect, getUserStats);
router.post(
  "/ai/production-risk-suggestions",
  protect,
  suggestProductionRisks,
);
router.get("/:id/activity", protect, getProjectActivity);
router.post("/:id/items", protect, enforceProjectNotOnHold, addItemToProject);
router.patch(
  "/:id/items/:itemId",
  protect,
  enforceProjectNotOnHold,
  updateItemInProject,
); // New
router.delete(
  "/:id/items/:itemId",
  protect,
  enforceProjectNotOnHold,
  deleteItemFromProject,
);

router.put(
  "/:id/departments",
  protect,
  enforceProjectNotOnHold,
  updateProjectDepartments,
); // New
router.post("/:id/challenges", protect, enforceProjectNotOnHold, addChallengeToProject);
router.patch(
  "/:id/challenges/:challengeId/status",
  protect,
  enforceProjectNotOnHold,
  updateChallengeStatus,
);
router.delete(
  "/:id/challenges/:challengeId",
  protect,
  enforceProjectNotOnHold,
  deleteChallenge,
);

// Feedback
router.post("/:id/feedback", protect, enforceProjectNotOnHold, addFeedbackToProject);
router.delete(
  "/:id/feedback/:feedbackId",
  protect,
  enforceProjectNotOnHold,
  deleteFeedbackFromProject,
);

// Production Risks
router.post(
  "/:id/production-risks",
  protect,
  enforceProjectNotOnHold,
  addProductionRisk,
);
router.patch(
  "/:id/production-risks/:riskId",
  protect,
  enforceProjectNotOnHold,
  updateProductionRisk,
);
router.delete(
  "/:id/production-risks/:riskId",
  protect,
  enforceProjectNotOnHold,
  deleteProductionRisk,
);

// Uncontrollable Factors
router.post(
  "/:id/uncontrollable-factors",
  protect,
  enforceProjectNotOnHold,
  addUncontrollableFactor,
);
router.patch(
  "/:id/uncontrollable-factors/:factorId",
  protect,
  enforceProjectNotOnHold,
  updateUncontrollableFactor,
);
router.delete(
  "/:id/uncontrollable-factors/:factorId",
  protect,
  enforceProjectNotOnHold,
  deleteUncontrollableFactor,
);

router.patch("/:id/hold", protect, setProjectHold);
router.post(
  "/:id/mockup",
  protect,
  enforceProjectNotOnHold,
  handleMockupUpload,
  uploadProjectMockup,
);
router.patch("/:id/status", protect, enforceProjectNotOnHold, updateProjectStatus);
router.patch("/:id/reopen", protect, enforceProjectNotOnHold, reopenProject); // [NEW] - Reopen completed project
router.post(
  "/:id/acknowledge",
  protect,
  enforceProjectNotOnHold,
  acknowledgeProject,
); // [NEW] - Acknowledge engagement
router.delete(
  "/:id/acknowledge",
  protect,
  enforceProjectNotOnHold,
  undoAcknowledgeProject,
); // [NEW] - Undo acknowledgement (Admin)
router.post("/:id/invoice-sent", protect, enforceProjectNotOnHold, markInvoiceSent);
router.post(
  "/:id/payment-verification",
  protect,
  enforceProjectNotOnHold,
  verifyPayment,
);
router.post(
  "/:id/invoice-sent/undo",
  protect,
  enforceProjectNotOnHold,
  undoInvoiceSent,
);
router.post(
  "/:id/payment-verification/undo",
  protect,
  enforceProjectNotOnHold,
  undoPaymentVerification,
);
router.get("/:id", protect, getProjectById);
router.delete("/:id", protect, enforceProjectNotOnHold, deleteProject); // Delete Project
router.put(
  "/:id",
  protect,
  enforceProjectNotOnHold,
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
