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
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getInventoryCategories,
  getInventoryCategoryOptions,
  getInventoryWarehouseOptions,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
  getInventoryRecords,
  createInventoryRecord,
  updateInventoryRecord,
  deleteInventoryRecord,
  purgeInventoryData,
  getStockTransactions,
  createStockTransaction,
  updateStockTransaction,
  deleteStockTransaction,
  getReports,
  createReport,
  deleteReport,
  getInventorySettings,
  updateInventorySettings,
} = require("../controllers/inventoryController");

router.use(protect);

router.route("/client-items").get(getClientItems).post(createClientItem);
router
  .route("/client-items/:id")
  .put(updateClientItem)
  .patch(updateClientItem)
  .delete(deleteClientItem);

router
  .route("/purchasing-orders")
  .get(getPurchasingOrders)
  .post(createPurchasingOrder);
router
  .route("/purchasing-orders/:id")
  .put(updatePurchasingOrder)
  .patch(updatePurchasingOrder)
  .delete(deletePurchasingOrder);

router.route("/purchase-orders").get(getPurchasingOrders).post(createPurchasingOrder);
router
  .route("/purchase-orders/:id")
  .put(updatePurchasingOrder)
  .patch(updatePurchasingOrder)
  .delete(deletePurchasingOrder);

router.route("/suppliers").get(getSuppliers).post(createSupplier);
router
  .route("/suppliers/:id")
  .put(updateSupplier)
  .patch(updateSupplier)
  .delete(deleteSupplier);

router.route("/categories/options").get(getInventoryCategoryOptions);
router.route("/warehouses/options").get(getInventoryWarehouseOptions);
router.route("/categories").get(getInventoryCategories).post(createInventoryCategory);
router
  .route("/categories/:id")
  .put(updateInventoryCategory)
  .patch(updateInventoryCategory)
  .delete(deleteInventoryCategory);

router
  .route("/inventory-records")
  .get(getInventoryRecords)
  .post(createInventoryRecord);
router
  .route("/inventory-records/:id")
  .put(updateInventoryRecord)
  .patch(updateInventoryRecord)
  .delete(deleteInventoryRecord);

router
  .route("/stock-transactions")
  .get(getStockTransactions)
  .post(createStockTransaction);
router
  .route("/stock-transactions/:id")
  .put(updateStockTransaction)
  .patch(updateStockTransaction)
  .delete(deleteStockTransaction);

router.route("/reports").get(getReports).post(createReport);
router.route("/reports/:id").delete(deleteReport);

router.route("/settings").get(getInventorySettings).patch(updateInventorySettings);
router.delete("/data", purgeInventoryData);

module.exports = router;
