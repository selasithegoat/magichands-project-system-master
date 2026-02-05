const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  updateProfile,
  getUsers, // [NEW]
} = require("../controllers/authController");
const { protect, admin, checkAuth } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", checkAuth, getMe);
router.put("/profile", protect, updateProfile);
router.get("/users", protect, getUsers); // [NEW]
router.post("/logout", logoutUser);

module.exports = router;
