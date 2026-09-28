const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireSampleMovementAccess } = require("../utils/sampleMovementAccess");
const {
  approveOwnershipTransfer,
  authorizeSampleMovement,
  cancelSampleMovement,
  confirmSampleReceipt,
  createSampleMovement,
  getSampleMovement,
  getSampleMovements,
  recordSampleReturn,
  rejectOwnershipTransfer,
  rejectSampleMovement,
  releaseSampleMovement,
  requestOwnershipTransfer,
  requestSampleMovementChanges,
  submitSampleMovement,
  updateSampleMovement,
} = require("../controllers/sampleMovementController");

const router = express.Router();

router.use(protect);
router.use(requireSampleMovementAccess);

router.route("/").get(getSampleMovements).post(createSampleMovement);
router.route("/:id").get(getSampleMovement).patch(updateSampleMovement);
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
