const ProjectUpdate = require("../models/ProjectUpdate");
const Project = require("../models/Project");
const { createNotification } = require("../utils/notificationService");
const { logActivity } = require("../utils/activityLogger");
const { notifyAdmins } = require("../utils/adminNotificationUtils"); // [NEW]
const {
  isProjectOnHold,
  sendProjectOnHoldResponse,
} = require("../middleware/projectHoldMiddleware");

// Get all updates for a specific project
exports.getProjectUpdates = async (req, res) => {
  try {
    const { projectId } = req.params;

    const updates = await ProjectUpdate.find({ project: projectId })
      .populate("author", "firstName lastName email role") // Populate author details
      .sort({ createdAt: -1 }); // Newest first

    res.status(200).json(updates);
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

    // If marked as End of Day Update, update the Project document

    const isEOD =
      req.body.isEndOfDayUpdate === "true" ||
      req.body.isEndOfDayUpdate === true ||
      req.body.isEndOfDayUpdate === "on";

    if (isEOD) {
      project.endOfDayUpdate = content;
      project.endOfDayUpdateDate = new Date();
      project.endOfDayUpdateBy = req.user._id;
      await project.save();
    } else {
    }

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

    // [New] Notify Front Desk if this is a Final (End of Day) update
    if (isEOD) {
      const User = require("../models/User"); // Import if not already at top
      const frontDeskUsers = await User.find({ department: "Front Desk" });
      for (const fdUser of frontDeskUsers) {
        await createNotification(
          fdUser._id,
          req.user._id,
          project._id,
          "UPDATE",
          "Final Update Posted",
          `Project #${project.orderId}: ${req.user.firstName} ${req.user.lastName} has posted a final (End of Day) update for project: ${project.details.projectName}`,
        );
      }

      // [New] Notify Admins of EOD Update
      await notifyAdmins(
        req.user._id,
        project._id,
        "UPDATE",
        "End of Day Update Posted",
        `${req.user.firstName} ${req.user.lastName} posted a final (End of Day) update for project #${project.orderId || project._id}: ${project.details.projectName}`,
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
      { category, updateId: newUpdate._id, isEndOfDay: isEOD },
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

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to edit this update" });
    }

    const project = await Project.findById(update.project).select("status hold");
    if (project && isProjectOnHold(project)) {
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

    const project = await Project.findById(update.project).select("status hold");
    if (project && isProjectOnHold(project)) {
      return sendProjectOnHoldResponse(res, project);
    }

    // Check authorization (optional: only author or admin can delete)
    // if (update.author.toString() !== req.user.userId && req.user.role !== 'admin') {
    //   return res.status(403).json({ message: "Not authorized to delete this update" });
    // }

    await update.deleteOne();

    res.status(200).json({ message: "Update deleted successfully" });
  } catch (error) {
    console.error("Error deleting project update:", error);
    res.status(500).json({ message: "Server error deleting update" });
  }
};
