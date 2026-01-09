const express = require("express");
const router = express.Router();
const { createProject } = require("../controllers/projectController");
const { protect } = require("../middleware/authMiddleware");

router.post("/", protect, createProject);

module.exports = router;
