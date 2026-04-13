const express = require("express");
const router = express.Router();
const {
  createProject,
  getProjects,
  getDashboardCounts,
  getStageBottlenecks,
  getOrderGroups,
  getOrderGroupByNumber,
  getUserStats,
  getProjectById,
  addItemToProject,
  deleteItemFromProject,
  setProjectHold,
  cancelProject,
  reactivateProject,
  updateProjectStatus,
  transitionQuoteRequirement,
  updateQuoteCostVerification,
  updateQuoteBidSubmissionDocuments,
  updateQuoteDecision,
  uploadProjectMockup,
  deleteProjectMockupVersion,
  validateClientProjectMockup,
  undoClientProjectMockupValidation,
  approveProjectMockup,
  rejectProjectMockup,
  getPendingSmsPrompts,
  getProjectSmsPrompts,
  createProjectSmsPrompt,
  updateProjectSmsPrompt,
  sendProjectSmsPrompt,
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
  updateSampleRequirement,
  updateCorporateEmergency,
  updateProjectType,
  updateMeetingOverride,
  confirmProjectSampleApproval,
  resetProjectSampleApproval,
  createProjectBatch,
  updateProjectBatch,
  updateProjectBatchStatus,
  resetQuoteMockup,
  resetQuotePreviousSamples,
  resetQuoteSampleProduction,
  resetProjectMockupDecision,
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
  { name: "clientMockup", maxCount: 10 },
  { name: "approvedMockup", maxCount: 10 },
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
  upload.array("mockup", 10)(req, res, (err) => {
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

const handleFeedbackUploads = (req, res, next) => {
  upload.array("feedbackAttachments", 6)(req, res, (err) => {
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

const handleAttachmentUpload = (req, res, next) => {
  upload.array("attachment", 10)(req, res, (err) => {
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

const handleBidSubmissionUploads = (req, res, next) => {
  upload.array("bidDocuments", 10)(req, res, (err) => {
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
router.get("/dashboard-counts", protect, getDashboardCounts);
router.get("/bottlenecks/stage", protect, getStageBottlenecks);
router.get("/sms-prompts/pending", protect, getPendingSmsPrompts);
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
router.post(
  "/:id/batches",
  protect,
  enforceProjectNotOnHold,
  createProjectBatch,
);
router.patch(
  "/:id/batches/:batchId",
  protect,
  enforceProjectNotOnHold,
  updateProjectBatch,
);
router.patch(
  "/:id/batches/:batchId/status",
  protect,
  enforceProjectNotOnHold,
  updateProjectBatchStatus,
);
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
router.post(
  "/:id/feedback",
  protect,
  enforceProjectNotOnHold,
  handleFeedbackUploads,
  addFeedbackToProject,
);
router.delete(
  "/:id/feedback/:feedbackId",
  protect,
  enforceProjectNotOnHold,
  deleteFeedbackFromProject,
);

// SMS Prompts
router.get("/:id/sms-prompts", protect, getProjectSmsPrompts);
router.post("/:id/sms-prompts", protect, createProjectSmsPrompt);
router.patch("/:id/sms-prompts/:promptId", protect, updateProjectSmsPrompt);
router.post("/:id/sms-prompts/:promptId/send", protect, sendProjectSmsPrompt);

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
router.patch("/:id/cancel", protect, cancelProject);
router.patch("/:id/reactivate", protect, reactivateProject);
router.post(
  "/:id/mockup",
  protect,
  enforceProjectNotOnHold,
  handleMockupUpload,
  uploadProjectMockup,
);
router.delete(
  "/:id/mockup/:version",
  protect,
  enforceProjectNotOnHold,
  deleteProjectMockupVersion,
);
router.post(
  "/:id/mockup/validate-client",
  protect,
  enforceProjectNotOnHold,
  validateClientProjectMockup,
);
router.post(
  "/:id/mockup/undo-client-validation",
  protect,
  enforceProjectNotOnHold,
  undoClientProjectMockupValidation,
);
router.post(
  "/:id/mockup/approve",
  protect,
  enforceProjectNotOnHold,
  approveProjectMockup,
);
router.post(
  "/:id/mockup/reject",
  protect,
  enforceProjectNotOnHold,
  handleAttachmentUpload,
  rejectProjectMockup,
);
router.post(
  "/:id/mockup/reset",
  protect,
  enforceProjectNotOnHold,
  resetProjectMockupDecision,
);
router.patch(
  "/:id/quote-requirements/:requirementKey/transition",
  protect,
  enforceProjectNotOnHold,
  transitionQuoteRequirement,
);
router.patch(
  "/:id/quote-cost",
  protect,
  enforceProjectNotOnHold,
  updateQuoteCostVerification,
);
router.patch(
  "/:id/quote-mockup",
  protect,
  enforceProjectNotOnHold,
  resetQuoteMockup,
);
router.patch(
  "/:id/quote-previous-samples",
  protect,
  enforceProjectNotOnHold,
  resetQuotePreviousSamples,
);
router.patch(
  "/:id/quote-sample-production",
  protect,
  enforceProjectNotOnHold,
  resetQuoteSampleProduction,
);
router.patch(
  "/:id/quote-bid-documents",
  protect,
  enforceProjectNotOnHold,
  handleBidSubmissionUploads,
  updateQuoteBidSubmissionDocuments,
);
router.patch(
  "/:id/quote-decision",
  protect,
  enforceProjectNotOnHold,
  updateQuoteDecision,
);
router.patch("/:id/status", protect, enforceProjectNotOnHold, updateProjectStatus);
router.patch(
  "/:id/meeting-override",
  protect,
  enforceProjectNotOnHold,
  updateMeetingOverride,
);
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
router.patch(
  "/:id/sample-requirement",
  protect,
  enforceProjectNotOnHold,
  updateSampleRequirement,
);
router.patch(
  "/:id/corporate-emergency",
  protect,
  enforceProjectNotOnHold,
  updateCorporateEmergency,
);
router.patch(
  "/:id/project-type",
  protect,
  enforceProjectNotOnHold,
  updateProjectType,
);
router.post(
  "/:id/sample-approval/confirm",
  protect,
  enforceProjectNotOnHold,
  confirmProjectSampleApproval,
);
router.post(
  "/:id/sample-approval/reset",
  protect,
  enforceProjectNotOnHold,
  resetProjectSampleApproval,
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
