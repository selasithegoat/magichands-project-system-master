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
      client,
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
      description, // [NEW]
      details, // [NEW]
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

    // [NEW] Handle File Uploads (Multiple Fields)
    let sampleImagePath = "";
    let attachmentPaths = [];

    if (req.files) {
      // Handle 'sampleImage' (single file)
      if (req.files.sampleImage && req.files.sampleImage.length > 0) {
        sampleImagePath = `/uploads/${req.files.sampleImage[0].filename}`;
      }

      // Handle 'attachments' (multiple files)
      if (req.files.attachments && req.files.attachments.length > 0) {
        attachmentPaths = req.files.attachments.map(
          (file) => `/uploads/${file.filename}`,
        );
      }
    } else if (req.file) {
      // Fallback for single file upload middleware (if used elsewhere)
      sampleImagePath = `/uploads/${req.file.filename}`;
    }

    // [NEW] Extract time from deliveryDate if deliveryTime is missing
    let finalDeliveryTime = getValue(deliveryTime);
    if (!finalDeliveryTime && deliveryDate && deliveryDate.includes("T")) {
      finalDeliveryTime = new Date(deliveryDate).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // [NEW] Handle items array (parsing from JSON string if needed for FormData)
    let finalItems = items;
    if (typeof items === "string") {
      try {
        finalItems = JSON.parse(items);
      } catch (e) {
        console.error("Failed to parse items JSON", e);
        finalItems = [];
      }
    } else if (!finalItems && description) {
      // Fallback for legacy calls or simple description
      finalItems = [{ description, breakdown: details, qty: 1 }];
    }

    // Create project
    const project = new Project({
      orderId: finalOrderId,
      orderDate: orderDate || Date.now(),
      receivedTime: getValue(receivedTime),
      details: {
        lead: lead?.label || lead?.value || lead, // Prefer label (name) over value (id) for lead
        client, // [NEW] Added client name
        projectName,
        briefOverview: getValue(req.body.briefOverview) || description, // [NEW] Map briefOverview, fallback to description if legacy
        deliveryDate,
        deliveryTime: finalDeliveryTime, // [NEW]
        deliveryLocation,
        contactType: getValue(contactType),
        supplySource: getValue(supplySource),
        sampleImage: sampleImagePath, // [NEW]
        attachments: attachmentPaths, // [NEW]
      },
      departments: departments || [],
      items: finalItems || [], // [NEW] Use parsed items
      uncontrollableFactors: uncontrollableFactors || [],
      productionRisks: productionRisks || [],
      productionRisks: productionRisks || [],
      currentStep: status ? 1 : 2, // If assigned status provided, likely Step 1 needs completion. Else Step 2.
      status: status || "Order Confirmed", // Default or Explicit
      createdBy: req.user._id,
      projectLeadId: projectLeadId || null,
      // [NEW] Project Type System
      projectType: req.body.projectType || "Standard",
      priority:
        req.body.priority ||
        (req.body.projectType === "Emergency" ? "Urgent" : "Normal"),
      quoteDetails: req.body.quoteDetails || {},
      updates: req.body.updates || [],
    });

    const savedProject = await project.save();

    // Log Activity
    await logActivity(
      savedProject._id,
      req.user.id,
      "create",
      `Created project #${savedProject.orderId || savedProject._id}`,
    );

    res.status(201).json(savedProject);
  } catch (error) {
    console.error("Error creating project:", error);
    // [DEBUG] Log full validation error details
    if (error.name === "ValidationError") {
      console.error(
        "Validation Details:",
        JSON.stringify(error.errors, null, 2),
      );
      return res.status(400).json({
        message: "Validation Error",
        error: error.message,
        details: error.errors,
      });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
    let query = {};

    // If user is not an admin, they only see projects where they are the assigned Lead
    // Unless they are Front Desk, who need to see everything for End of Day updates
    // Access Control Logic:
    // 1. Admins see everything ONLY IF using Admin Portal (source=admin).
    // 2. Front Desk trying to view "End of Day Updates" (report mode) sees everything.
    // 3. Otherwise (Client Portal), EVERYONE (including Admins) sees only their own projects.

    const isReportMode = req.query.mode === "report";
    const isAdminPortal = req.query.source === "admin";

    const canSeeAll =
      (req.user.role === "admin" && isAdminPortal) ||
      (isReportMode && req.user.department?.includes("Front Desk"));

    if (!canSeeAll) {
      query = {
        $or: [
          { projectLeadId: req.user._id },
          { createBy: req.user._id },
          { createdBy: req.user._id },
          { endOfDayUpdateBy: req.user._id },
        ],
      };
    }

    const projects = await Project.find(query)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName")
      .sort({ createdAt: -1 });

    if (isAdminPortal) {
      // Optional: Logic specific to admin portal if needed later
    }

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

    // Count all projects where user is the Lead
    const totalProjects = await Project.countDocuments({
      projectLeadId: userId,
    });

    // Count completed projects where user is the Lead
    const completedProjects = await Project.countDocuments({
      projectLeadId: userId,
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
    const project = await Project.findById(req.params.id)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email");

    if (project) {
      // Access Check: Admin OR Project Lead
      const isLead =
        project.projectLeadId &&
        (project.projectLeadId._id.toString() === req.user._id.toString() ||
          project.projectLeadId.toString() === req.user._id.toString());

      if (req.user.role !== "admin" && !isLead) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this project" });
      }

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
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.items = new Date();
    await project.save();

    await logActivity(
      project._id,
      req.user.id,
      "item_add",
      `Added order item: ${description} (Qty: ${qty})`,
      { item: newItem },
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
          "sectionUpdates.items": new Date(),
        },
      },
      { new: true, runValidators: false },
    );

    if (!project) {
      return res.status(404).json({ message: "Project or Item not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "item_update",
      `Updated order item: ${description}`,
      { itemId, description, qty },
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
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.items = new Date();
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
      { departments, "sectionUpdates.departments": new Date() },
      { new: true },
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "departments_update",
      `Updated engaged departments`,
      { departments },
    );

    res.json(project);
  } catch (error) {
    console.error("Error updating departments:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update project status
// @route   PATCH /api/projects/:id/status
// @access  Private (Admin only)
const updateProjectStatus = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not authorized. Only admins can update status." });
    }

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
        },
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

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      {
        $push: { challenges: newChallenge },
        "sectionUpdates.challenges": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      req.params.id,
      req.user.id,
      "challenge_add",
      `Reported new challenge: ${title}`,
      { challengeId: newChallenge._id },
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
const updateChallengeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id, challengeId } = req.params;

    let updateFields = {
      "challenges.$.status": status,
      "sectionUpdates.challenges": new Date(),
    };

    if (status === "Resolved") {
      updateFields["challenges.$.resolvedDate"] = new Date().toLocaleString();
    } else {
      updateFields["challenges.$.resolvedDate"] = "--";
    }

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, "challenges._id": challengeId },
      { $set: updateFields },
      { new: true, runValidators: false },
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
      { challengeId: challengeId, newStatus: status },
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

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id },
      {
        $pull: { challenges: { _id: challengeId } },
        "sectionUpdates.challenges": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "challenge_delete",
      `Deleted a challenge report`,
      { challengeId: challengeId },
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
      {
        $push: { productionRisks: newRisk },
        "sectionUpdates.productionRisks": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_add",
      `Added production risk: ${description}`,
      { risk: newRisk },
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
          "sectionUpdates.productionRisks": new Date(),
        },
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project or Risk not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_update",
      `Updated production risk: ${description}`,
      { riskId, description, preventive },
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
      {
        $pull: { productionRisks: { _id: riskId } },
        "sectionUpdates.productionRisks": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_update", // Using update/generic action as placeholder
      `Deleted production risk`,
      { riskId },
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
      {
        $push: { uncontrollableFactors: newFactor },
        "sectionUpdates.uncontrollableFactors": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_add",
      `Added uncontrollable factor: ${description}`,
      { factor: newFactor },
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
          "sectionUpdates.uncontrollableFactors": new Date(),
        },
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project or Factor not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_update",
      `Updated uncontrollable factor: ${description}`,
      { factorId, description },
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
      {
        $pull: { uncontrollableFactors: { _id: factorId } },
        "sectionUpdates.uncontrollableFactors": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_delete",
      `Deleted uncontrollable factor`,
      { factorId },
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
    let {
      orderId,
      orderDate,
      receivedTime,
      lead,
      client,
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
      projectLeadId,
      description,
      details,
      attachments, // Existing attachments (urls)
      quoteDetails, // [NEW]
      projectType, // [NEW]
      priority, // [NEW]
    } = req.body;

    // Parse JSON fields if they are strings (Multipart/form-data behavior)
    if (typeof items === "string") items = JSON.parse(items);
    if (typeof departments === "string") departments = JSON.parse(departments);
    if (typeof uncontrollableFactors === "string")
      uncontrollableFactors = JSON.parse(uncontrollableFactors);
    if (typeof productionRisks === "string")
      productionRisks = JSON.parse(productionRisks);
    if (typeof details === "string") details = JSON.parse(details);
    if (typeof attachments === "string") attachments = JSON.parse(attachments);
    if (typeof quoteDetails === "string")
      quoteDetails = JSON.parse(quoteDetails);
    if (typeof lead === "string" && lead.startsWith("{"))
      lead = JSON.parse(lead);

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Helper
    const getValue = (field) => (field && field.value ? field.value : field);

    // Capture old values for logging
    const oldValues = {
      client: project.details?.client,
      orderDate: project.orderDate,
      receivedTime: project.receivedTime,
      deliveryDate: project.details?.deliveryDate,
      deliveryTime: project.details?.deliveryTime,
      deliveryLocation: project.details?.deliveryLocation,
      contactType: project.details?.contactType,
      supplySource: project.details?.supplySource,
      lead: project.projectLeadId,
      status: project.status,
    };

    // Track if details changed for sectionUpdates
    let detailsChanged = false;

    // Update Top Level
    if (orderId) project.orderId = orderId;
    if (orderDate) {
      project.orderDate = orderDate;
      detailsChanged = true;
    }
    if (receivedTime) {
      project.receivedTime = getValue(receivedTime);
      detailsChanged = true;
    }
    if (projectLeadId) {
      project.projectLeadId = projectLeadId;
      detailsChanged = true;
    }

    // Update Details
    if (lead) {
      project.details.lead = lead?.label || lead?.value || lead;
      detailsChanged = true;
    }
    if (client) {
      project.details.client = client;
      detailsChanged = true;
    }
    if (projectName) {
      project.details.projectName = projectName;
      detailsChanged = true;
    }
    if (deliveryDate) {
      project.details.deliveryDate = deliveryDate;
      detailsChanged = true;
    }
    if (deliveryTime) {
      project.details.deliveryTime = getValue(deliveryTime);
      detailsChanged = true;
    }
    if (deliveryLocation) {
      project.details.deliveryLocation = deliveryLocation;
      detailsChanged = true;
    }
    if (contactType) {
      project.details.contactType = getValue(contactType);
      detailsChanged = true;
    }
    if (supplySource) {
      project.details.supplySource = getValue(supplySource);
      detailsChanged = true;
    }

    // Handle Files
    if (req.files) {
      if (req.files.sampleImage && req.files.sampleImage[0]) {
        project.details.sampleImage = req.files.sampleImage[0].path;
        detailsChanged = true;
      }

      const newAttachments = req.files.attachments
        ? req.files.attachments.map((file) => file.path)
        : [];

      // Combine existing and new attachments
      // If 'attachments' is sent in body, use it as the base (allows deletion)
      // If not sent, keep existing
      if (attachments && Array.isArray(attachments)) {
        project.details.attachments = [...attachments, ...newAttachments];
        detailsChanged = true;
      } else if (newAttachments.length > 0) {
        // If only new files sent and no body list, just append?
        // Or if attachments body is missing, do we assume no logical change to existing?
        project.details.attachments = [
          ...(project.details.attachments || []),
          ...newAttachments,
        ];
        detailsChanged = true;
      }
    } else if (attachments && Array.isArray(attachments)) {
      // Case: No new files, but attachments list updated (e.g. deletion)
      project.details.attachments = attachments;
      detailsChanged = true;
    }

    // Initialize sectionUpdates if not exists
    project.sectionUpdates = project.sectionUpdates || {};

    if (detailsChanged) {
      project.sectionUpdates.details = new Date();
    }

    // Update Arrays and their timestamps
    if (departments) {
      project.departments = departments;
      project.sectionUpdates.departments = new Date();
    }
    if (items) {
      project.items = items;
      project.sectionUpdates.items = new Date();
    }
    if (uncontrollableFactors) {
      project.uncontrollableFactors = uncontrollableFactors;
      project.sectionUpdates.uncontrollableFactors = new Date();
    }
    if (productionRisks) {
      project.productionRisks = productionRisks;
      project.sectionUpdates.productionRisks = new Date();
    }

    if (currentStep) project.currentStep = currentStep;
    if (status) project.status = status;
    if (projectType) project.projectType = projectType;
    if (priority) project.priority = priority;
    if (quoteDetails) project.quoteDetails = quoteDetails;

    const updatedProject = await project.save();

    // --- Activity Logging (Diff) ---
    const changes = [];
    if (oldValues.client !== updatedProject.details?.client)
      changes.push(`Client: ${updatedProject.details?.client}`);

    const oldOD = oldValues.orderDate
      ? new Date(oldValues.orderDate).toISOString().split("T")[0]
      : "";
    const newOD = updatedProject.orderDate
      ? new Date(updatedProject.orderDate).toISOString().split("T")[0]
      : "";
    if (oldOD !== newOD) changes.push(`Order Date: ${newOD}`);

    if (oldValues.receivedTime !== updatedProject.receivedTime)
      changes.push(`Received Time: ${updatedProject.receivedTime}`);

    const oldDD = oldValues.deliveryDate
      ? new Date(oldValues.deliveryDate).toISOString().split("T")[0]
      : "";
    const newDD = updatedProject.details?.deliveryDate
      ? new Date(updatedProject.details?.deliveryDate)
          .toISOString()
          .split("T")[0]
      : "";
    if (oldDD !== newDD) changes.push(`Delivery Date: ${newDD}`);

    if (oldValues.deliveryTime !== updatedProject.details?.deliveryTime)
      changes.push(`Delivery Time: ${updatedProject.details?.deliveryTime}`);
    if (oldValues.deliveryLocation !== updatedProject.details?.deliveryLocation)
      changes.push(`Location: ${updatedProject.details?.deliveryLocation}`);
    if (oldValues.status !== updatedProject.status)
      changes.push(`Status: ${updatedProject.status}`);

    if (changes.length > 0) {
      await logActivity(
        updatedProject._id,
        req.user._id,
        "update",
        `Updated details: ${changes.join(", ")}`,
        { changes },
      );
    } else {
      // Generic log if no specific changes detected but save occurred (e.g. arrays)
      await logActivity(
        updatedProject._id,
        req.user.id,
        "update",
        `Updated project #${updatedProject.orderId || updatedProject._id}`,
      );
    }

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get all clients with their projects
// @route   GET /api/projects/clients
// @access  Private (Admin only)
const getClients = async (req, res) => {
  try {
    // Only admins can access this endpoint
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not authorized. Only admins can view clients." });
    }

    // Aggregate clients from all projects
    const projects = await Project.find({})
      .populate("createdBy", "firstName lastName email")
      .populate("projectLeadId", "firstName lastName")
      .sort({ createdAt: -1 });

    // Group projects by client
    const clientsMap = new Map();

    projects.forEach((project) => {
      const clientName = project.details?.client || "Unknown Client";

      if (!clientsMap.has(clientName)) {
        clientsMap.set(clientName, {
          name: clientName,
          projects: [],
          projectCount: 0,
        });
      }

      const clientData = clientsMap.get(clientName);
      clientData.projects.push(project);
      clientData.projectCount++;
    });

    // Convert map to array and sort by name
    const clients = Array.from(clientsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Reopen a completed project
// @route   PATCH /api/projects/:id/reopen
// @access  Private
const reopenProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check if project is completed or delivered
    if (project.status !== "Completed" && project.status !== "Delivered") {
      return res.status(400).json({
        message: "Only completed or delivered projects can be reopened",
      });
    }

    const oldStatus = project.status;
    project.status = "In Progress";
    await project.save();

    // Log activity
    await logActivity(
      project._id,
      req.user.id,
      "status_change",
      `Project reopened from ${oldStatus} to In Progress`,
      {
        statusChange: { from: oldStatus, to: "In Progress" },
      },
    );

    res.json(project);
  } catch (error) {
    console.error("Error reopening project:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    await Project.deleteOne({ _id: req.params.id });
    // Cleanup activities
    await ActivityLog.deleteMany({ project: req.params.id });

    res.json({ message: "Project removed" });
  } catch (error) {
    console.error("Error deleting project:", error);
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
  updateProject, // Full Update
  deleteProject, // [NEW]
  getClients, // [NEW]
  reopenProject, // [NEW]
};
