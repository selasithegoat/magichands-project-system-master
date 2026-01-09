const Project = require("../models/Project");

// @desc    Create a new project (Step 1)
// @route   POST /api/projects
// @access  Private
const createProject = async (req, res) => {
  try {
    const {
      orderId, // Optional, can be auto-generated
      orderDate,
      receivedTime,
      lead,
      projectName,
      deliveryDate,
      deliveryTime,
      deliveryLocation,
      contactType,
      supplySource,
      departments, // [NEW] Step 2
      items, // [NEW] Step 3
    } = req.body;

    // Basic validation
    if (!projectName) {
      return res.status(400).json({ message: "Project name is required" });
    }

    // Auto-generate orderId if not provided (Format: ORD-[Timestamp])
    const finalOrderId = orderId || `ORD-${Date.now().toString().slice(-6)}`;

    // Create project
    const project = new Project({
      orderId: finalOrderId,
      orderDate: orderDate || Date.now(),
      receivedTime,
      details: {
        lead,
        projectName,
        deliveryDate,
        deliveryTime,
        deliveryLocation,
        contactType,
        supplySource,
      },
      departments: departments || [],
      items: items || [],
      currentStep: 2, // Move to step 2 after creation
      createdBy: req.user._id, // Assumes auth middleware populates req.user
    });

    const savedProject = await project.save();

    res.status(201).json(savedProject);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = {
  createProject,
};
