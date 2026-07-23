const express = require("express");
const {
  downloadEndOfDayReport,
} = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/end-of-day.docx", protect, downloadEndOfDayReport);

module.exports = router;
