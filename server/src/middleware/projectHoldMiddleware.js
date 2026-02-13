const Project = require("../models/Project");

const HOLD_MESSAGE =
  "This project is currently on hold. Release it before making changes.";

const isProjectOnHold = (project) =>
  Boolean(project?.hold?.isOnHold) || project?.status === "On Hold";

const buildHoldPayload = (project) => ({
  reason: project?.hold?.reason || "",
  heldAt: project?.hold?.heldAt || null,
  heldBy: project?.hold?.heldBy || null,
  previousStatus: project?.hold?.previousStatus || null,
});

const sendProjectOnHoldResponse = (res, project) =>
  res.status(423).json({
    code: "PROJECT_ON_HOLD",
    message: HOLD_MESSAGE,
    hold: buildHoldPayload(project),
  });

const requireProjectNotOnHold =
  ({ paramName = "id" } = {}) =>
  async (req, res, next) => {
    try {
      const projectId = req.params?.[paramName];

      if (!projectId) {
        return res.status(400).json({ message: "Project id is required." });
      }

      const project = await Project.findById(projectId).select("status hold");
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (isProjectOnHold(project)) {
        return sendProjectOnHoldResponse(res, project);
      }

      return next();
    } catch (error) {
      console.error("Error checking project hold state:", error);
      return res.status(500).json({ message: "Server Error" });
    }
  };

module.exports = {
  isProjectOnHold,
  sendProjectOnHoldResponse,
  requireProjectNotOnHold,
};
