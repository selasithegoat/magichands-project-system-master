const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  getConfig,
  subscribe,
  unsubscribe,
  sendTest,
} = require("../controllers/pushController");

const router = express.Router();
router.use(protect);
router.get("/config", getConfig);
router.post("/subscriptions", subscribe);
router.delete("/subscriptions", unsubscribe);
router.post("/test", sendTest);

module.exports = router;
