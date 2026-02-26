const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const {
  resolveCookieOptions,
  resolveClearCookieOptions,
} = require("../utils/cookieOptions");
const { validatePasswordStrength } = require("../utils/passwordPolicy");

const normalizeDepartmentArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((department) => String(department || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const parseDepartmentAllowlist = (rawValue, fallback) => {
  const parsed = String(rawValue || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (parsed.length > 0) return new Set(parsed);
  return new Set(fallback.map((entry) => entry.toLowerCase()));
};

const GLOBAL_DIRECTORY_DEPARTMENT_ALLOWLIST = parseDepartmentAllowlist(
  process.env.AUTH_USERS_GLOBAL_DEPARTMENTS,
  ["Administration", "Front Desk", "Stores"],
);

const getDisplayName = (user) => {
  const firstName = String(user?.firstName || "").trim();
  const lastName = String(user?.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  const fallbackName = String(user?.name || "").trim();
  return fullName || fallbackName || "Unnamed User";
};

const toNonEmptyString = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
};

const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const getPasswordValue = (value) =>
  typeof value === "string" ? value : "";

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public (when AUTH_ALLOW_SELF_REGISTRATION=true) / Private Admin
const registerUser = async (req, res) => {
  const { name, employeeId, password, email, firstName, lastName } = req.body;

  if (!name || !employeeId || !password) {
    return res.status(400).json({ message: "Please add all fields" });
  }

  // Check if user exists
  const userExists = await User.findOne({ employeeId });

  if (userExists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }

  // Create user
  const user = await User.create({
    name,
    employeeId,
    password,
    email: email || undefined,
    firstName,
    lastName,
  });

  if (user) {
    const token = generateToken(user._id);

    // Determine cookie name based on role
    const cookieName = user.role === "admin" ? "token_admin" : "token_client";

    // Send HTTP-only cookie
    res.cookie(cookieName, token, resolveCookieOptions());

    // [REMOVED] Clear any existing opposite token to prevent session leak
    // const oppositeCookie =
    //   user.role === "admin" ? "token_client" : "token_admin";
    // res.clearCookie(oppositeCookie);

    res.status(201).json({
      _id: user.id,
      name: user.name,
      employeeId: user.employeeId,
      role: user.role,
    });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const loginIdentifier = toNonEmptyString(
      req.body?.employeeId || req.body?.email || req.body?.username,
    );
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        message: "Employee ID or email and password are required",
      });
    }

    const normalizedEmail = normalizeEmail(loginIdentifier);
    const user = await User.findOne({
      $or: [
        { employeeId: { $eq: loginIdentifier } },
        { email: { $eq: normalizedEmail } },
      ],
    });

    if (user && (await user.matchPassword(password))) {
      const token = generateToken(user._id);

      const cookieName = user.role === "admin" ? "token_admin" : "token_client";

      // Send HTTP-only cookie
      res.cookie(cookieName, token, resolveCookieOptions());

      // [REMOVED] Strictly clear the opposite token to prevent cross-portal auto-login
      // const oppositeCookie =
      //   user.role === "admin" ? "token_client" : "token_admin";
      // res.clearCookie(oppositeCookie);
      // Also clear legacy token
      res.clearCookie("token");

      res.json({
        _id: user.id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
        department: user.department,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        notificationSettings: user.notificationSettings,
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    console.error("Error in loginUser:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  // req.user is set in authMiddleware by verifying token
  // If checkAuth is used and no token, req.user will be undefined. Return null safely.
  res.set("Cache-Control", "no-store");
  res.status(200).json(req.user || null);
};

// @desc    Logout user / Clear cookie
// @route   POST /api/auth/logout
// @access  Public
const logoutUser = (req, res) => {
  const clearOptions = resolveClearCookieOptions();
  const cookiesToClear = ["token_admin", "token_client", "token"];

  cookiesToClear.forEach((cookieName) => {
    res.clearCookie(cookieName, clearOptions);
    res.cookie(cookieName, "", clearOptions);
  });

  res.set("Cache-Control", "no-store");
  res.status(200).json({ message: "Logged out successfully" });
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.email = req.body.email || user.email; // Note: add validation/uniqueness check if critical
    user.department = req.body.department || user.department;
    user.employeeType = req.body.employeeType || user.employeeType;
    user.contact = req.body.contact || user.contact;

    if (req.body.notificationSettings) {
      const email =
        req.body.notificationSettings.email !== undefined
          ? req.body.notificationSettings.email
          : (user.notificationSettings?.email ?? false);
      const push =
        req.body.notificationSettings.push !== undefined
          ? req.body.notificationSettings.push
          : (user.notificationSettings?.push ?? true);
      const sound =
        req.body.notificationSettings.sound !== undefined
          ? req.body.notificationSettings.sound
          : (user.notificationSettings?.sound ?? true);

      // Enforce at least one channel active
      if (!email && !push) {
        return res.status(400).json({
          message: "At least one notification channel must be active",
        });
      }

      user.notificationSettings = { email, push, sound };
      user.markModified("notificationSettings");
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      employeeId: updatedUser.employeeId,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      department: updatedUser.department,
      employeeType: updatedUser.employeeType,
      contact: updatedUser.contact,
      avatarUrl: updatedUser.avatarUrl,
      notificationSettings: updatedUser.notificationSettings,
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
};

// @desc    Change current user's password
// @route   PUT /api/auth/profile/password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const currentPassword = getPasswordValue(req.body?.currentPassword);
    const newPassword = getPasswordValue(req.body?.newPassword);
    const confirmPassword = getPasswordValue(req.body?.confirmPassword);

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Current password, new password, and confirmation are required.",
      });
    }

    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirmation do not match.",
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        message: "New password must be different from current password.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isCurrentPasswordValid = await user.matchPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Error in changePassword:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Upload profile avatar
// @route   POST /api/auth/profile/avatar
// @access  Private
const uploadProfileAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please select an image to upload" });
    }

    if (!req.file.mimetype || !req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({
        message: "Only image files are allowed for avatar upload",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.avatarUrl = `/uploads/${req.file.filename}`;
    const updatedUser = await user.save();

    return res.json({
      _id: updatedUser._id,
      avatarUrl: updatedUser.avatarUrl,
    });
  } catch (error) {
    console.error("Error uploading avatar:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get all users (for dropdowns)
// @route   GET /api/auth/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const requesterDepartments = normalizeDepartmentArray(req.user.department);
    const requesterDepartmentKeys = requesterDepartments.map((department) =>
      department.toLowerCase(),
    );
    const hasGlobalDirectoryAccess =
      req.user.role === "admin" ||
      requesterDepartmentKeys.some((department) =>
        GLOBAL_DIRECTORY_DEPARTMENT_ALLOWLIST.has(department),
      );

    const query = hasGlobalDirectoryAccess
      ? {}
      : requesterDepartments.length > 0
        ? {
            $or: [
              { _id: req.user._id },
              { department: { $in: requesterDepartments } },
            ],
          }
        : { _id: req.user._id };

    const users = await User.find(query).select("_id firstName lastName name").lean();

    const sanitizedUsers = (Array.isArray(users) ? users : [])
      .map((user) => ({
        _id: user._id,
        firstName: String(user.firstName || "").trim(),
        lastName: String(user.lastName || "").trim(),
        name: getDisplayName(user),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    res.json(sanitizedUsers);
  } catch (error) {
    console.error("Error in getUsers:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  updateProfile,
  changePassword,
  uploadProfileAvatar,
  getUsers, // [NEW]
};
