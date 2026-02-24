const ProjectUpdate = require("../models/ProjectUpdate");
const Project = require("../models/Project");
const { createNotification } = require("../utils/notificationService");
const { logActivity } = require("../utils/activityLogger");
const { notifyAdmins } = require("../utils/adminNotificationUtils"); // [NEW]
const {
  isProjectOnHold,
  sendProjectOnHoldResponse,
} = require("../middleware/projectHoldMiddleware");
const { isEngagedPortalRequest } = require("../middleware/authMiddleware");
const { normalizeProjectUpdateContent } = require("../utils/projectUpdateText");

const normalizeObjectId = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const normalizeDepartments = (value) => {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
};

const normalizeDepartmentToken = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const optionValue = value.value || value.label;
    return String(optionValue || "").trim().toLowerCase();
  }
  return String(value).trim().toLowerCase();
};

const isUserFrontDesk = (user) => {
  if (!user) return false;
  const userDepartments = normalizeDepartments(user.department)
    .map(normalizeDepartmentToken)
    .filter(Boolean);
  return userDepartments.includes("front desk");
};

const syncProjectLatestUpdateSnapshot = async (projectId) => {
  if (!projectId) return null;

  const latestUpdate = await ProjectUpdate.findOne({ project: projectId })
    .sort({ createdAt: -1, _id: -1 })
    .select("content createdAt author");

  if (!latestUpdate) {
    await Project.findByIdAndUpdate(projectId, {
      $set: {
        endOfDayUpdate: "",
        endOfDayUpdateDate: null,
        endOfDayUpdateBy: null,
      },
    });
    return null;
  }

  const normalizedContent = normalizeProjectUpdateContent(
    latestUpdate.content || "",
  );

  if (normalizedContent && normalizedContent !== (latestUpdate.content || "")) {
    await ProjectUpdate.findByIdAndUpdate(latestUpdate._id, {
      $set: { content: normalizedContent },
    });
  }

  await Project.findByIdAndUpdate(projectId, {
    $set: {
      endOfDayUpdate: normalizedContent,
      endOfDayUpdateDate: latestUpdate.createdAt || new Date(),
      endOfDayUpdateBy: latestUpdate.author || null,
    },
  });

  latestUpdate.content = normalizedContent;
  return latestUpdate;
};

const canAccessProjectUpdates = (user, project) => {
  if (!user || !project) return false;
  if (user.role === "admin") return true;
  if (isUserFrontDesk(user)) return true;

  const userId = normalizeObjectId(user._id || user.id);
  const leadId = normalizeObjectId(project.projectLeadId);
  const assistantLeadId = normalizeObjectId(project.assistantLeadId);

  if (userId && (userId === leadId || userId === assistantLeadId)) {
    return true;
  }

  const userDepartments = new Set(
    normalizeDepartments(user.department)
      .map(normalizeDepartmentToken)
      .filter(Boolean),
  );

  if (userDepartments.size === 0) return false;

  const projectDepartments = normalizeDepartments(project.departments)
    .map(normalizeDepartmentToken)
    .filter(Boolean);

  return projectDepartments.some((dept) => userDepartments.has(dept));
};

const isUserAssignedProjectLead = (user, project) => {
  if (!user || !project) return false;
  const userId = normalizeObjectId(user._id || user.id);
  const leadId = normalizeObjectId(project.projectLeadId);
  return Boolean(userId && leadId && userId === leadId);
};

// Get all updates for a specific project
exports.getProjectUpdates = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).select(
      "projectLeadId assistantLeadId departments",
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (!canAccessProjectUpdates(req.user, project)) {
      return res
        .status(403)
        .json({ message: "Not authorized to access updates for this project" });
    }

    const updates = await ProjectUpdate.find({ project: projectId })
      .populate("author", "firstName lastName email role") // Populate author details
      .sort({ createdAt: -1 }); // Newest first

    const normalizationOps = [];
    const normalizedUpdates = updates.map((update) => {
      const normalizedContent = normalizeProjectUpdateContent(update.content || "");

      if (normalizedContent && normalizedContent !== (update.content || "")) {
        normalizationOps.push({
          updateOne: {
            filter: { _id: update._id },
            update: { $set: { content: normalizedContent } },
          },
        });
      }

      const payload = update.toObject({ depopulate: false });
      payload.content = normalizedContent;
      return payload;
    });

    if (normalizationOps.length > 0) {
      await ProjectUpdate.bulkWrite(normalizationOps, { ordered: false });
      await syncProjectLatestUpdateSnapshot(projectId);
    }

    res.status(200).json(normalizedUpdates);
  } catch (error) {
    console.error("Error fetching project updates:", error);
    res.status(500).json({ message: "Server error fetching updates" });
  }
};

// Create a new update
exports.createProjectUpdate = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { content, category, attachments } = req.body;

    const authorId = req.user._id; // Auth middleware attaches user doc to req.user

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (!canAccessProjectUpdates(req.user, project)) {
      return res
        .status(403)
        .json({ message: "Not authorized to post updates for this project" });
    }

    if (
      isEngagedPortalRequest(req) &&
      isUserAssignedProjectLead(req.user, project)
    ) {
      return res.status(403).json({
        message:
          "Project Leads cannot perform engagement actions on their own projects from the engaged departments page.",
      });
    }

    if (isProjectOnHold(project)) {
      return sendProjectOnHoldResponse(res, project);
    }

    let attachmentsArray = [];
    if (req.file) {
      attachmentsArray.push({
        name: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        fileType: req.file.mimetype,
      });
    }

    const newUpdate = new ProjectUpdate({
      project: projectId,
      author: authorId,
      content,
      category,
      attachments: attachmentsArray,
    });

    await newUpdate.save();

    // Keep Front Desk End-of-Day table snapshot synced to latest project update.
    await syncProjectLatestUpdateSnapshot(project._id);
    const isLeadUpdate = isUserAssignedProjectLead(req.user, project);

    // Populate author for immediate return
    await newUpdate.populate("author", "firstName lastName email role");

    // [New] Notify Lead if update is from a department
    if (category !== "General" && project.projectLeadId) {
      await createNotification(
        project.projectLeadId,
        req.user._id,
        project._id,
        "UPDATE",
        `${category} Update Posted`,
        `Project #${project.orderId}: A new update has been posted in the ${category} category for project: ${project.details.projectName}`,
      );
    }

    // Notify Front Desk if this update is from the assigned lead
    if (isLeadUpdate) {
      const User = require("../models/User"); // Import if not already at top
      const frontDeskUsers = await User.find({ department: "Front Desk" });
      for (const fdUser of frontDeskUsers) {
        await createNotification(
          fdUser._id,
          req.user._id,
          project._id,
          "UPDATE",
          "Lead End of Day Update Posted",
          `Project #${project.orderId}: ${req.user.firstName} ${req.user.lastName} has posted an End of Day update for project: ${project.details.projectName}`,
        );
      }

      // Notify Admins of lead EOD update
      await notifyAdmins(
        req.user._id,
        project._id,
        "UPDATE",
        "End of Day Update Posted",
        `${req.user.firstName} ${req.user.lastName} posted an End of Day update for project #${project.orderId || project._id}: ${project.details.projectName}`,
      );
    } else {
      // [New] Notify Admins of Regular Update
      await notifyAdmins(
        req.user._id,
        project._id,
        "UPDATE",
        "Project Update Posted",
        `${req.user.firstName} ${req.user.lastName} posted a new update in ${category} for project #${project.orderId || project._id}: ${content.substring(0, 100)}...`,
      );
    }

    // [New] Log activity for this update
    await logActivity(
      project._id,
      req.user.id,
      "update_post",
      `Posted a new update in ${category} category`,
      { category, updateId: newUpdate._id, syncsToEndOfDay: true, isLeadUpdate },
    );

    res.status(201).json(newUpdate);
  } catch (error) {
    console.error("Error creating project update:", error);
    res.status(500).json({ message: "Server error creating update" });
  }
};

// Update an existing project update
exports.updateProjectUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, category } = req.body;

    const update = await ProjectUpdate.findById(id);
    if (!update) {
      return res.status(404).json({ message: "Update not found" });
    }

    const currentUserId = req.user?._id?.toString();
    const isAuthor = update.author?.toString() === currentUserId;
    const isAdmin = req.user?.role === "admin";

    const project = await Project.findById(update.project).select(
      "status hold projectLeadId assistantLeadId departments",
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (!canAccessProjectUpdates(req.user, project)) {
      return res
        .status(403)
        .json({ message: "Not authorized to access updates for this project" });
    }

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to edit this update" });
    }

    if (isProjectOnHold(project)) {
      return sendProjectOnHoldResponse(res, project);
    }

    if (typeof content === "string") {
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        return res.status(400).json({ message: "Update content is required" });
      }
      update.content = trimmedContent;
    }

    if (typeof category === "string" && category.trim()) {
      update.category = category.trim();
    }

    await update.save();
    await syncProjectLatestUpdateSnapshot(update.project);
    await update.populate("author", "firstName lastName email role");

    if (project?._id) {
      await logActivity(
        project._id,
        req.user.id,
        "update_edit",
        `Edited a project update in ${update.category} category`,
        { category: update.category, updateId: update._id },
      );
    }

    res.status(200).json(update);
  } catch (error) {
    console.error("Error updating project update:", error);
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error updating update" });
  }
};

// Delete an update
exports.deleteProjectUpdate = async (req, res) => {
  try {
    const { id } = req.params;

    const update = await ProjectUpdate.findById(id);
    if (!update) {
      return res.status(404).json({ message: "Update not found" });
    }

    const project = await Project.findById(update.project).select(
      "status hold projectLeadId assistantLeadId departments",
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (!canAccessProjectUpdates(req.user, project)) {
      return res
        .status(403)
        .json({ message: "Not authorized to access updates for this project" });
    }

    if (isProjectOnHold(project)) {
      return sendProjectOnHoldResponse(res, project);
    }

    const currentUserId = req.user?._id?.toString();
    const isAuthor = update.author?.toString() === currentUserId;
    const isAdmin = req.user?.role === "admin";

    if (!isAuthor && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this update" });
    }

    await update.deleteOne();
    await syncProjectLatestUpdateSnapshot(update.project);

    res.status(200).json({ message: "Update deleted successfully" });
  } catch (error) {
    console.error("Error deleting project update:", error);
    res.status(500).json({ message: "Server error deleting update" });
  }
};
