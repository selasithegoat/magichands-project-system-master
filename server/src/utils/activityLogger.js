const ActivityLog = require("../models/ActivityLog");
const { createNotification } = require("./notificationService");
const Project = require("../models/Project");

/**
 * Log a project activity
 * @param {string} projectId - ID of the project
 * @param {string} userId - ID of the user performing the action
 * @param {string} action - Action type enum
 * @param {string} description - Human readable description
 * @param {object} details - Optional details about changes
 */
const logActivity = async (
  projectId,
  userId,
  action,
  description,
  details = {},
) => {
  try {
    await ActivityLog.create({
      project: projectId,
      user: userId,
      action,
      description,
      details,
    });

    // [New] Notify Lead of status changes or other important actions
    if (action === "status_change" || action === "update") {
      const project = await Project.findById(projectId);
      if (project && project.projectLeadId) {
        await createNotification(
          project.projectLeadId,
          userId,
          projectId,
          "ACTIVITY",
          "Project Activity Updated",
          description,
        );
      }
    }
  } catch (err) {
    console.error("Failed to log activity:", err);
    // Silent fail to not block main flow
  }
};

module.exports = { logActivity };
