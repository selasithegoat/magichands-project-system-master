const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createReminder,
  getReminders,
  updateReminder,
  snoozeReminder,
  completeReminder,
  cancelReminder,
  deleteReminder,
} = require("../controllers/reminderController");

router.use(protect);

router.get("/", getReminders);
router.post("/", createReminder);
router.patch("/:id", updateReminder);
router.patch("/:id/snooze", snoozeReminder);
router.patch("/:id/complete", completeReminder);
router.patch("/:id/cancel", cancelReminder);
router.delete("/:id", deleteReminder);

module.exports = router;
