const express = require("express");
const router = express.Router();
const {
  registerEmployee,
  getAllEmployees,
  updateEmployeePassword,
} = require("../controllers/adminController");
const { protect, admin } = require("../middleware/authMiddleware");

// All routes are protected and admin-only
router.use(protect);
router.use(admin);

router.route("/employees").post(registerEmployee).get(getAllEmployees);
router.route("/employees/:id/password").put(updateEmployeePassword);

module.exports = router;
