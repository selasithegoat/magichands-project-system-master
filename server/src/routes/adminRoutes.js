const express = require("express");
const router = express.Router();
const {
  registerEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  updateEmployeePassword,
} = require("../controllers/adminController");
const {
  getStageDurations,
  getProjectAnalytics,
} = require("../controllers/analyticsController");
const { protect, requireRole } = require("../middleware/authMiddleware");

// All routes are protected and admin-only
router.use(protect);
router.use(requireRole("admin"));

router.route("/employees").post(registerEmployee).get(getAllEmployees);
router.route("/employees/:id").put(updateEmployee).delete(deleteEmployee);
router.route("/employees/:id/password").put(updateEmployeePassword);
router.get("/analytics/stage-durations", getStageDurations);
router.get("/analytics/project/:id", getProjectAnalytics);

module.exports = router;
