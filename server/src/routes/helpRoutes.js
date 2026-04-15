const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getHelpArticles,
  askHelpQuestion,
} = require("../controllers/helpController");

router.use(protect);

router.get("/articles", getHelpArticles);
router.post("/ask", askHelpQuestion);

module.exports = router;
