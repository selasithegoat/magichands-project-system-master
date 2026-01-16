const User = require("../models/User");

// @desc    Register a new employee (Admin)
// @route   POST /api/admin/employees
// @access  Private/Admin
const registerEmployee = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      employeeId,
      password,
      email,
      department,
      position,
      employeeType,
    } = req.body;

    // Validation
    if (
      !employeeId ||
      !password ||
      !firstName ||
      !lastName ||
      !department ||
      !position ||
      !employeeType
    ) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    const userExists = await User.findOne({ employeeId });
    if (userExists) {
      return res
        .status(400)
        .json({ message: "User with this ID already exists" });
    }

    const user = await User.create({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      employeeId,
      password, // Pre-save hook will hash this
      email,
      department,
      position,
      employeeType,
      role: "user", // Default to user
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        employeeId: user.employeeId,
        department: user.department,
        position: user.position,
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.error("Error registering employee:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get all employees
// @route   GET /api/admin/employees
// @access  Private/Admin
const getAllEmployees = async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update employee password
// @route   PUT /api/admin/employees/:id/password
// @access  Private/Admin
const updateEmployeePassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.body.password) {
      user.password = req.body.password; // Hook will hash
      await user.save();
      res.json({ message: "Password updated successfully" });
    } else {
      res.status(400).json({ message: "Password is required" });
    }
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = { registerEmployee, getAllEmployees, updateEmployeePassword };
