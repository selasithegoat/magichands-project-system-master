const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createOrderMeeting,
  updateOrderMeeting,
  cancelOrderMeeting,
  completeOrderMeeting,
  getOrderMeetingByNumber,
} = require("../controllers/projectController");

router.use(protect);

router.get("/order/:orderNumber", getOrderMeetingByNumber);
router.post("/", createOrderMeeting);
router.patch("/:id", updateOrderMeeting);
router.patch("/:id/cancel", cancelOrderMeeting);
router.patch("/:id/complete", completeOrderMeeting);

module.exports = router;
