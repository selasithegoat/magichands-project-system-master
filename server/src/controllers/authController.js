const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
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

    // Send HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: true, // Always secure for ngrok/cross-site
      sameSite: "none", // Allow cross-site for ngrok
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

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
    const { employeeId, password } = req.body;
    console.log("Login Attempt:", { employeeId, password }); // DEBUG LOG

    // Check for user email via employeeId
    const user = await User.findOne({ employeeId });
    console.log("User Found:", user ? "Yes" : "No"); // DEBUG LOG

    if (user && (await user.matchPassword(password))) {
      const token = generateToken(user._id);

      const cookieName = user.role === "admin" ? "token_admin" : "token_client";

      // Send HTTP-only cookie
      res.cookie(cookieName, token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 15 * 60 * 1000,
      });

      res.json({
        _id: user.id,
        name: user.name,
        employeeId: user.employeeId,
        role: user.role,
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
  res.status(200).json(req.user);
};

// @desc    Logout user / Clear cookie
// @route   POST /api/auth/logout
// @access  Public
const logoutUser = (req, res) => {
  res.cookie("token_admin", "", {
    httpOnly: true,
    expires: new Date(0),
  });
  res.cookie("token_client", "", {
    httpOnly: true,
    expires: new Date(0),
  });
  // Clear legacy token just in case
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });
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
    // user.bio = req.body.bio || user.bio; // Add if needed

    // If implementing avatar, handle it here usually with file upload middleware

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
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
};

// @desc    Get all users (for dropdowns)
// @route   GET /api/auth/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("name firstName lastName _id"); // Removed avatar as it might cause issues if not in schema
    res.json(users);
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
  getUsers, // [NEW]
};
