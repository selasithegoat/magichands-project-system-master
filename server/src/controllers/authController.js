const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { name, employeeId, password } = req.body;

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
  });

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      employeeId: user.employeeId,
      token: generateToken(user._id),
    });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { employeeId, password } = req.body;

  // Check for user email via employeeId
  const user = await User.findOne({ employeeId });

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user.id,
      name: user.name,
      employeeId: user.employeeId,
      token: generateToken(user._id),
    });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  // req.user is set in authMiddleware by verifying token
  res.status(200).json(req.user);
};

// @desc    Reset Password (Simplified)
// @route   POST /api/auth/reset-password
// @access  Public (In reality, this should be more secure)
const resetPassword = async (req, res) => {
  const { employeeId, newPassword } = req.body;

  const user = await User.findOne({ employeeId });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // Set new password (pre-save hook will hash it)
  user.password = newPassword;
  await user.save();

  res.status(200).json({ message: "Password updated successfully" });
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  resetPassword,
};
