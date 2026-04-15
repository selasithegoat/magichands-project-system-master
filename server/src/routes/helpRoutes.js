const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getHelpArticles,
  askHelpQuestion,
  getHelpProjects,
  submitHelpFeedback,
} = require("../controllers/helpController");

router.use(protect);

router.get("/articles", getHelpArticles);
router.get("/projects", getHelpProjects);
router.post("/ask", askHelpQuestion);
router.post("/feedback", submitHelpFeedback);

module.exports = router;
