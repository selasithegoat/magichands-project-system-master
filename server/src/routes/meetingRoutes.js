const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createOrderMeeting,
  updateOrderMeeting,
  completeOrderMeeting,
  getOrderMeetingByNumber,
} = require("../controllers/projectController");

router.use(protect);

router.get("/order/:orderNumber", getOrderMeetingByNumber);
router.post("/", createOrderMeeting);
router.patch("/:id", updateOrderMeeting);
router.patch("/:id/complete", completeOrderMeeting);

module.exports = router;
