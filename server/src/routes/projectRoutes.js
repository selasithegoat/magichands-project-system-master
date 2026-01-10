const express = require("express");
const router = express.Router();
const {
  createProject,
  getProjects,
  getUserStats,
  getProjectById,
  addItemToProject,
  deleteItemFromProject,
} = require("../controllers/projectController");
const { protect } = require("../middleware/authMiddleware");

router.get("/stats", protect, getUserStats);
router.post("/:id/items", protect, addItemToProject);
router.delete("/:id/items/:itemId", protect, deleteItemFromProject);
router.get("/:id", protect, getProjectById);
router.post("/", protect, createProject);
router.get("/", protect, getProjects);

module.exports = router;
