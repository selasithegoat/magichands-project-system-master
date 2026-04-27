const express = require("express");
const { getSystemVersionInfo } = require("../controllers/systemController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/version", protect, getSystemVersionInfo);

module.exports = router;
