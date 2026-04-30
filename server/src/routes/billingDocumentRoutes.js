const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  requireBillingDocumentAccess,
  getBillingDocuments,
  getBillingDocumentById,
  getWaybillSourceDocument,
  createBillingDocument,
  updateBillingDocument,
  convertQuoteToInvoice,
  deleteBillingDocument,
} = require("../controllers/billingDocumentController");

const router = express.Router();

router.use(protect);
router.use(requireBillingDocumentAccess);

router.route("/").get(getBillingDocuments).post(createBillingDocument);
router.get("/waybill-source", getWaybillSourceDocument);
router
  .route("/:id")
  .get(getBillingDocumentById)
  .put(updateBillingDocument)
  .patch(updateBillingDocument)
  .delete(deleteBillingDocument);
router.post("/:id/convert-to-invoice", convertQuoteToInvoice);

module.exports = router;
