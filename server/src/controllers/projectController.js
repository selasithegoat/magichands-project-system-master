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
      uncontrollableFactors,
      productionRisks,
    } = req.body;

    // Basic validation
    if (!projectName) {
      return res.status(400).json({ message: "Project name is required" });
    }

    // Verify user is authenticated
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "User not found or not authorized" });
    }

    // Auto-generate orderId if not provided (Format: ORD-[Timestamp])
    const finalOrderId = orderId || `ORD-${Date.now().toString().slice(-6)}`;

    // Helper to extract value if object
    const getValue = (field) => (field && field.value ? field.value : field);

    // Create project
    const project = new Project({
      orderId: finalOrderId,
      orderDate: orderDate || Date.now(),
      receivedTime: getValue(receivedTime),
      details: {
        lead: lead?.label || lead?.value || lead, // Prefer label (name) over value (id) for lead
        projectName,
        deliveryDate,
        deliveryTime: getValue(deliveryTime),
        deliveryLocation,
        contactType: getValue(contactType),
        supplySource: getValue(supplySource),
      },
      departments: departments || [],
      items: items || [],
      uncontrollableFactors: uncontrollableFactors || [],
      productionRisks: productionRisks || [],
      currentStep: 2, // Move to step 2 after creation
      createdBy: req.user._id,
    });

    const savedProject = await project.save();

    res.status(201).json(savedProject);
  } catch (error) {
    console.error("Error creating project:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Validation Error", error: error.message });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({})
      .populate("createdBy", "firstName lastName")
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  createProject,
  getProjects,
};
