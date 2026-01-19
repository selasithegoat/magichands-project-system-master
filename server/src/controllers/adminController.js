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

    // Ensure department is an array
    const deptArray = Array.isArray(department) ? department : [department];

    const user = await User.create({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      employeeId,
      password, // Pre-save hook will hash this
      email: email || undefined, // Handle empty string to prevent duplicate key error
      department: deptArray,
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
        employeeType: user.employeeType,
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

// @desc    Update employee details
// @route   PUT /api/admin/employees/:id
// @access  Private/Admin
const updateEmployee = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.name = `${user.firstName} ${user.lastName}`;

    if (req.body.email !== undefined) {
      user.email = req.body.email || undefined;
    }

    user.employeeId = req.body.employeeId || user.employeeId;
    user.position = req.body.position || user.position;
    user.employeeType = req.body.employeeType || user.employeeType;

    if (req.body.department) {
      user.department = Array.isArray(req.body.department)
        ? req.body.department
        : [req.body.department];
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      employeeId: updatedUser.employeeId,
      department: updatedUser.department,
      position: updatedUser.position,
      employeeType: updatedUser.employeeType,
    });
  } catch (error) {
    console.error("Error updating employee:", error);

    // Handle Duplicate Key Error (e.g., Employee ID or Email already exists)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({ message: `${field} already exists.` });
    }

    // Handle Validation Errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete employee
// @route   DELETE /api/admin/employees/:id
// @access  Private/Admin
const deleteEmployee = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.deleteOne();
    res.json({ message: "User removed" });
  } catch (error) {
    console.error("Error deleting employee:", error);
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

module.exports = {
  registerEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  updateEmployeePassword,
};
