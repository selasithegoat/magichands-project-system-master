const express = require("express");
const {
  createMaterialRequest,
  deleteMaterialRequest,
  getMaterialRequestInventoryMatches,
  getMaterialRequests,
  fulfillMaterialRequestItem,
  updateMaterialRequestItemPurchase,
  updateMaterialRequest,
  updateMaterialRequestStatus,
} = require("../controllers/materialRequestController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getMaterialRequests).post(createMaterialRequest);
router.get("/inventory-matches", getMaterialRequestInventoryMatches);
router.route("/:id").patch(updateMaterialRequest).delete(deleteMaterialRequest);
router.post("/:id/delete", deleteMaterialRequest);
router.post("/:id/items/:itemId/fulfill", fulfillMaterialRequestItem);
router.patch("/:id/items/:itemId/purchase", updateMaterialRequestItemPurchase);
router.patch("/:id/status", updateMaterialRequestStatus);

module.exports = router;
