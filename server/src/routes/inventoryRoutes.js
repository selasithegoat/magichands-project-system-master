const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getClientItems,
  createClientItem,
  updateClientItem,
  deleteClientItem,
  getPurchasingOrders,
  createPurchasingOrder,
  updatePurchasingOrder,
  deletePurchasingOrder,
} = require("../controllers/inventoryController");

router.use(protect);

router.route("/client-items").get(getClientItems).post(createClientItem);
router
  .route("/client-items/:id")
  .put(updateClientItem)
  .delete(deleteClientItem);

router
  .route("/purchasing-orders")
  .get(getPurchasingOrders)
  .post(createPurchasingOrder);
router
  .route("/purchasing-orders/:id")
  .put(updatePurchasingOrder)
  .delete(deletePurchasingOrder);

module.exports = router;
