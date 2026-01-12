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

// @desc    Get user project stats
// @route   GET /api/projects/stats
// @access  Private
const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Count all projects created by user
    const totalProjects = await Project.countDocuments({ createdBy: userId });

    // Count completed projects
    const completedProjects = await Project.countDocuments({
      createdBy: userId,
      status: "Completed",
    });

    // Estimate hours: 8 hours per completed project (mock calculation)
    const hoursLogged = completedProjects * 8;

    res.json({
      totalProjects,
      completedProjects,
      hoursLogged,
    });
  } catch (error) {
    console.error("Error fetching project stats:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get project by ID
// @route   GET /api/projects/:id
// @access  Private
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate(
      "createdBy",
      "firstName lastName"
    );

    if (project) {
      res.json(project);
    } else {
      res.status(404).json({ message: "Project not found" });
    }
  } catch (error) {
    console.error("Error fetching project by ID:", error);
    if (error.kind === "ObjectId") {
      res.status(404).json({ message: "Project not found" });
    } else {
      res.status(500).json({ message: "Server Error" });
    }
  }
};

// @desc    Add item to project
// @route   POST /api/projects/:id/items
// @access  Private
const addItemToProject = async (req, res) => {
  try {
    const { description, breakdown, qty } = req.body;

    // Basic validation
    if (!description || !qty) {
      return res
        .status(400)
        .json({ message: "Description and Quantity are required" });
    }

    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const newItem = {
      description,
      breakdown: breakdown || "",
      qty: Number(qty),
    };

    project.items.push(newItem);
    await project.save();

    res.json(project);
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete item from project
// @route   DELETE /api/projects/:id/items/:itemId
// @access  Private
const deleteItemFromProject = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Pull item from array
    project.items.pull({ _id: itemId });
    await project.save();

    res.json(project);
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update project status
// @route   PATCH /api/projects/:id/status
// @access  Private
const updateProjectStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    project.status = status;
    await project.save();

    res.json(project);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add challenge to project
// @route   POST /api/projects/:id/challenges
// @access  Private
const addChallengeToProject = async (req, res) => {
  try {
    const { title, description, assistance, status } = req.body;
    // Debug logging
    console.log("User reporting challenge:", req.user);

    const newChallenge = {
      title,
      description,
      assistance,
      status: status || "Open",
      reporter: {
        name: `${req.user.firstName} ${req.user.lastName}`,
        initials: `${req.user.firstName[0]}${req.user.lastName[0]}`,
        initialsColor: "blue", // Default color for now
        date: new Date().toLocaleString(),
        userId: req.user._id,
      },
      resolvedDate: status === "Resolved" ? new Date().toLocaleString() : "--",
    };

    // Use findByIdAndUpdate to avoid validation errors on other fields (like existing invalid status)
    // and to automatically handle creating the array if it doesn't exist via $push
    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      { $push: { challenges: newChallenge } },
      { new: true, runValidators: false } // runValidators: false helps if current doc has issues, but we constructed newChallenge manually so it's safe-ish
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding challenge:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update challenge status
// @route   PATCH /api/projects/:id/challenges/:challengeId/status
// @access  Private
// @desc    Update challenge status
// @route   PATCH /api/projects/:id/challenges/:challengeId/status
// @access  Private
const updateChallengeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id, challengeId } = req.params;

    let updateFields = {
      "challenges.$.status": status,
    };

    if (status === "Resolved") {
      updateFields["challenges.$.resolvedDate"] = new Date().toLocaleString();
    } else {
      // We can't easily check the current value here without a fetch,
      // implies blind update or we accept we might overwrite "--" with "--".
      // It's safer to just set it to "--" if not Resolved.
      updateFields["challenges.$.resolvedDate"] = "--";
    }

    // Use findOneAndUpdate to target the specific challenge subdocument
    // and bypass document-level validation
    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, "challenges._id": challengeId },
      { $set: updateFields },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res
        .status(404)
        .json({ message: "Project or Challenge not found" });
    }

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating challenge status:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete a challenge
// @route   DELETE /api/projects/:id/challenges/:challengeId
// @access  Private
const deleteChallenge = async (req, res) => {
  try {
    const { id, challengeId } = req.params;

    // Use findOneAndUpdate to remove the challenge from the array
    // using $pull operator
    const updatedProject = await Project.findOneAndUpdate(
      { _id: id },
      { $pull: { challenges: { _id: challengeId } } },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting challenge:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  createProject,
  getProjects,
  getUserStats,
  getProjectById,
  addItemToProject,
  deleteItemFromProject,
  updateProjectStatus,
  addChallengeToProject,
  updateChallengeStatus,
  deleteChallenge,
};
