const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  updateProfile,
  uploadProfileAvatar,
  getUsers, // [NEW]
} = require("../controllers/authController");
const { protect, admin, checkAuth } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const maxFileSizeMb = upload.maxFileSizeMb || 50;
const allowSelfRegistration =
  String(process.env.AUTH_ALLOW_SELF_REGISTRATION || "").toLowerCase() === "true";

const avatarUploadHandler = (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `File is too large. Maximum size is ${maxFileSizeMb}MB.`,
        });
      }
      return res.status(400).json({ message: err.message || "Upload failed" });
    }

    Promise.resolve(upload.scanRequestFiles(req))
      .then(() => next())
      .catch(async (scanError) => {
        await upload.cleanupRequestFiles(req);
        return res.status(400).json({
          message:
            scanError?.message ||
            "Uploaded file failed security checks. Please upload a different file.",
        });
      });
  });
};

router.post(
  "/register",
  ...(allowSelfRegistration ? [] : [protect, admin]),
  registerUser,
);
router.post("/login", loginUser);
router.get("/me", checkAuth, getMe);
router.put("/profile", protect, updateProfile);
router.post("/profile/avatar", protect, avatarUploadHandler, uploadProfileAvatar);
router.get("/users", protect, getUsers); // [NEW]
router.post("/logout", logoutUser);

module.exports = router;
