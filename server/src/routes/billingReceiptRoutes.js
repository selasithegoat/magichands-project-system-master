const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireBillingDocumentAccess } = require("../controllers/billingDocumentController");
const {
  getBillingReceipts,
  getBillingReceiptById,
  createBillingReceipt,
  updateBillingReceipt,
  deleteBillingReceipt,
} = require("../controllers/billingReceiptController");

const router = express.Router();

router.use(protect);
router.use(requireBillingDocumentAccess);

router.route("/").get(getBillingReceipts).post(createBillingReceipt);
router
  .route("/:id")
  .get(getBillingReceiptById)
  .put(updateBillingReceipt)
  .patch(updateBillingReceipt)
  .delete(deleteBillingReceipt);

module.exports = router;
