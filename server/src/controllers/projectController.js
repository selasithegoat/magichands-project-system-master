const Project = require("../models/Project");
const ActivityLog = require("../models/ActivityLog");
const { logActivity } = require("../utils/activityLogger");

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
      projectLeadId, // [NEW] For Admin Assignment
      status, // [NEW] Allow explicit status setting (e.g. "Pending Scope Approval")
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
      currentStep: status ? 1 : 2, // If assigned status provided, likely Step 1 needs completion. Else Step 2.
      status: status || "Order Confirmed", // Default or Explicit
      createdBy: req.user._id,
      projectLeadId: projectLeadId || null,
    });

    const savedProject = await project.save();

    // Log Activity
    await logActivity(
      savedProject._id,
      req.user.id,
      "create",
      `Created project #${savedProject.orderId || savedProject._id}`
    );

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

    await logActivity(
      project._id,
      req.user.id,
      "item_add",
      `Added order item: ${description} (Qty: ${qty})`,
      { item: newItem }
    );

    res.json(project);
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update item in project
// @route   PATCH /api/projects/:id/items/:itemId
// @access  Private
const updateItemInProject = async (req, res) => {
  try {
    const { description, breakdown, qty } = req.body;
    const { id, itemId } = req.params;

    const project = await Project.findOneAndUpdate(
      { _id: id, "items._id": itemId },
      {
        $set: {
          "items.$.description": description,
          "items.$.breakdown": breakdown,
          "items.$.qty": Number(qty),
        },
      },
      { new: true, runValidators: false }
    );

    if (!project) {
      return res.status(404).json({ message: "Project or Item not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "item_update",
      `Updated order item: ${description}`,
      { itemId, description, qty }
    );

    res.json(project);
  } catch (error) {
    console.error("Error updating item:", error);
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

    await logActivity(id, req.user.id, "item_delete", `Deleted order item`, {
      itemId,
    });

    res.json(project);
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update project departments
// @route   PUT /api/projects/:id/departments
// @access  Private
const updateProjectDepartments = async (req, res) => {
  try {
    const { departments } = req.body; // Expecting array of strings
    const { id } = req.params;

    const project = await Project.findByIdAndUpdate(
      id,
      { departments },
      { new: true }
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "departments_update",
      `Updated engaged departments`,
      { departments }
    );

    res.json(project);
  } catch (error) {
    console.error("Error updating departments:", error);
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

    const oldStatus = project.status;
    project.status = status;
    await project.save();

    // Log Acyivity
    if (oldStatus !== status) {
      await logActivity(
        project._id,
        req.user.id,
        "status_change",
        `Project status updated to ${status}`,
        {
          statusChange: { from: oldStatus, to: status },
        }
      );
    }

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

    await logActivity(
      req.params.id,
      req.user.id,
      "challenge_add",
      `Reported new challenge: ${title}`,
      { challengeId: newChallenge._id }
    );

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

    await logActivity(
      id,
      req.user.id,
      "challenge_update",
      `Challenge status updated to ${status}`,
      { challengeId: challengeId, newStatus: status }
    );

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

    await logActivity(
      id,
      req.user.id,
      "challenge_delete",
      `Deleted a challenge report`,
      { challengeId: challengeId }
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting challenge:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get project activity log
// @route   GET /api/projects/:id/activity
// @access  Private
const getProjectActivity = async (req, res) => {
  try {
    const activities = await ActivityLog.find({ project: req.params.id })
      .populate("user", "firstName lastName") // Get user details
      .sort({ createdAt: -1 }); // Newest first

    res.json(activities);
  } catch (error) {
    console.error("Error fetching activity:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add production risk
// @route   POST /api/projects/:id/production-risks
// @access  Private
const addProductionRisk = async (req, res) => {
  try {
    const { description, preventive } = req.body;
    const { id } = req.params;

    const newRisk = {
      description,
      preventive,
    };

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      { $push: { productionRisks: newRisk } },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_add",
      `Added production risk: ${description}`,
      { risk: newRisk }
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding production risk:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update production risk
// @route   PATCH /api/projects/:id/production-risks/:riskId
// @access  Private
const updateProductionRisk = async (req, res) => {
  try {
    const { description, preventive } = req.body;
    const { id, riskId } = req.params;

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, "productionRisks._id": riskId },
      {
        $set: {
          "productionRisks.$.description": description,
          "productionRisks.$.preventive": preventive,
        },
      },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project or Risk not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_update",
      `Updated production risk: ${description}`,
      { riskId, description, preventive }
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating production risk:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete production risk
// @route   DELETE /api/projects/:id/production-risks/:riskId
// @access  Private
const deleteProductionRisk = async (req, res) => {
  try {
    const { id, riskId } = req.params;

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      { $pull: { productionRisks: { _id: riskId } } },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_update", // Using update/generic action as placeholder
      `Deleted production risk`,
      { riskId }
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting production risk:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add uncontrollable factor
// @route   POST /api/projects/:id/uncontrollable-factors
// @access  Private
const addUncontrollableFactor = async (req, res) => {
  try {
    const { description, responsible, status } = req.body;
    const { id } = req.params;

    const newFactor = {
      description,
      responsible, // Expecting { label, value } or string
      status, // Expecting { label, value } or string
    };

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      { $push: { uncontrollableFactors: newFactor } },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_add",
      `Added uncontrollable factor: ${description}`,
      { factor: newFactor }
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding uncontrollable factor:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update uncontrollable factor
// @route   PATCH /api/projects/:id/uncontrollable-factors/:factorId
// @access  Private
const updateUncontrollableFactor = async (req, res) => {
  try {
    const { description, responsible, status } = req.body;
    const { id, factorId } = req.params;

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, "uncontrollableFactors._id": factorId },
      {
        $set: {
          "uncontrollableFactors.$.description": description,
          "uncontrollableFactors.$.responsible": responsible,
          "uncontrollableFactors.$.status": status,
        },
      },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project or Factor not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_update",
      `Updated uncontrollable factor: ${description}`,
      { factorId, description }
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating uncontrollable factor:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete uncontrollable factor
// @route   DELETE /api/projects/:id/uncontrollable-factors/:factorId
// @access  Private
const deleteUncontrollableFactor = async (req, res) => {
  try {
    const { id, factorId } = req.params;

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      { $pull: { uncontrollableFactors: { _id: factorId } } },
      { new: true, runValidators: false }
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_delete",
      `Deleted uncontrollable factor`,
      { factorId }
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting uncontrollable factor:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Get user specific activity
const getUserActivity = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await ActivityLog.countDocuments({ user: req.user.id });
    const activities = await ActivityLog.find({ user: req.user.id })
      .populate("project", "details.projectName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      activities,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalActivities: total,
    });
  } catch (error) {
    console.error("Error fetching user activity:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete activities for completed projects
const deleteOldUserActivity = async (req, res) => {
  try {
    // Find all completed projects
    const completedProjects = await Project.find({
      status: "Completed",
    }).select("_id");
    const completedProjectIds = completedProjects.map((p) => p._id);

    if (completedProjectIds.length === 0) {
      return res
        .status(200)
        .json({ message: "No completed projects found to clean up." });
    }

    // Delete activities where project is in completedProjectIds AND user is current user
    const result = await ActivityLog.deleteMany({
      user: req.user.id,
      project: { $in: completedProjectIds },
    });

    res.json({
      message: "Cleanup successful",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error cleaning up activities:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Update entire project details (e.g. from Step 1-5 Wizard)
// @route   PUT /api/projects/:id
// @access  Private
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      orderId,
      orderDate,
      receivedTime,
      lead,
      projectName,
      deliveryDate,
      deliveryTime,
      deliveryLocation,
      contactType,
      supplySource,
      departments,
      items,
      uncontrollableFactors,
      productionRisks,
      status,
      currentStep,
    } = req.body;

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Helper to extract value if object
    const getValue = (field) => (field && field.value ? field.value : field);

    // Update fields
    if (orderId) project.orderId = orderId;
    if (orderDate) project.orderDate = orderDate;
    if (receivedTime) project.receivedTime = getValue(receivedTime);
    if (lead) project.details.lead = lead?.label || lead?.value || lead;
    if (projectName) project.details.projectName = projectName;
    if (deliveryDate) project.details.deliveryDate = deliveryDate;
    if (deliveryTime) project.details.deliveryTime = getValue(deliveryTime);
    if (deliveryLocation) project.details.deliveryLocation = deliveryLocation;
    if (contactType) project.details.contactType = getValue(contactType);
    if (supplySource) project.details.supplySource = getValue(supplySource);

    // Arrays replacement (assuming full sync from wizard state)
    if (departments) project.departments = departments;
    if (items) project.items = items;
    if (uncontrollableFactors)
      project.uncontrollableFactors = uncontrollableFactors;
    if (productionRisks) project.productionRisks = productionRisks;

    if (currentStep) project.currentStep = currentStep;

    // Status update logic: If accepting ("Pending Scope Approval" -> "Order Confirmed")
    // or specifically passed status
    if (status) {
      project.status = status;
    } else if (project.status === "Pending Scope Approval") {
      // If simply saving/updating from wizard without explicit status, assume moving to active
      project.status = "Order Confirmed";
    }

    const updatedProject = await project.save();

    await logActivity(
      updatedProject._id,
      req.user.id,
      "update",
      `Updated project details for #${
        updatedProject.orderId || updatedProject._id
      }`
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
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
  getProjectActivity,
  addProductionRisk,
  updateProductionRisk,
  deleteProductionRisk,
  addUncontrollableFactor,
  updateUncontrollableFactor,
  deleteUncontrollableFactor,
  updateItemInProject,
  updateProjectDepartments,
  getUserActivity,
  deleteOldUserActivity,
  updateProject, // New export
};
