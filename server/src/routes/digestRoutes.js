const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getLatestDigest } = require("../controllers/digestController");

router.get("/latest", protect, getLatestDigest);

module.exports = router;
