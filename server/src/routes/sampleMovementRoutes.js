const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  canOperateSampleMovements,
  requireSampleMovementAccess,
} = require("../utils/sampleMovementAccess");
const upload = require("../middleware/upload");
const {
  approveOwnershipTransfer,
  authorizeSampleMovement,
  cancelSampleMovement,
  confirmSampleReceipt,
  createSampleMovement,
  deleteSampleMovement,
  getSampleMovement,
  getSampleMovements,
  getSampleRetrievalUpdates,
  recordSampleReturn,
  rejectOwnershipTransfer,
  rejectSampleMovement,
  releaseSampleMovement,
  requestOwnershipTransfer,
  requestSampleMovementChanges,
  submitSampleMovement,
  updateSampleRetrievalDate,
  updateSampleMovement,
  uploadSampleDocuments,
  uploadSampleItemPhotos,
} = require("../controllers/sampleMovementController");

const router = express.Router();

const requireSampleMovementOperator = (req, res, next) => {
  if (canOperateSampleMovements(req.user)) return next();
  return res.status(403).json({
    message: "Only Front Desk can upload sample custody evidence.",
  });
};

const handleUpload = (fieldName, maxCount) => (req, res, next) => {
  upload.array(fieldName, maxCount)(req, res, (error) => {
    if (error) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `File too large. Maximum size is ${upload.maxFileSizeMb}MB.`,
        });
      }
      return res.status(400).json({ message: error.message });
    }

    Promise.resolve(upload.scanRequestFiles(req))
      .then(() => next())
      .catch(async (scanError) => {
        await upload.cleanupRequestFiles(req);
        return res.status(400).json({
          message:
            scanError?.message ||
            "Uploaded file failed security checks. Please select another file.",
        });
      });
  });
};

router.use(protect);
router.use(requireSampleMovementAccess);

router.route("/").get(getSampleMovements).post(createSampleMovement);
router.get("/retrieval-updates", getSampleRetrievalUpdates);
router
  .route("/:id")
  .get(getSampleMovement)
  .patch(updateSampleMovement)
  .delete(deleteSampleMovement);
router.patch("/:id/retrieval-date", updateSampleRetrievalDate);
router.post(
  "/:id/items/:itemId/photos",
  requireSampleMovementOperator,
  handleUpload("samplePhotos", 8),
  uploadSampleItemPhotos,
);
router.post(
  "/:id/documents",
  requireSampleMovementOperator,
  handleUpload("sampleDocuments", 6),
  uploadSampleDocuments,
);
router.post("/:id/submit", submitSampleMovement);
router.post("/:id/authorize", authorizeSampleMovement);
router.post("/:id/request-changes", requestSampleMovementChanges);
router.post("/:id/reject", rejectSampleMovement);
router.post("/:id/release", releaseSampleMovement);
router.post("/:id/confirm-receipt", confirmSampleReceipt);
router.post("/:id/record-return", recordSampleReturn);
router.post("/:id/request-ownership-transfer", requestOwnershipTransfer);
router.post("/:id/approve-ownership-transfer", approveOwnershipTransfer);
router.post("/:id/reject-ownership-transfer", rejectOwnershipTransfer);
router.post("/:id/cancel", cancelSampleMovement);

module.exports = router;
