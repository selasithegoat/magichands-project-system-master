const ProjectUpdate = require("../models/ProjectUpdate");
const Project = require("../models/Project");

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
    console.log("createProjectUpdate body:", req.body); // DEBUG
    const authorId = req.user._id; // Auth middleware attaches user doc to req.user

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
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
    console.log("isEndOfDayUpdate flag:", req.body.isEndOfDayUpdate); // DEBUG

    const isEOD =
      req.body.isEndOfDayUpdate === "true" ||
      req.body.isEndOfDayUpdate === true ||
      req.body.isEndOfDayUpdate === "on";

    if (isEOD) {
      console.log("Updating Project with End of Day Update:", content); // DEBUG
      project.endOfDayUpdate = content;
      project.endOfDayUpdateDate = new Date();
      project.endOfDayUpdateBy = req.user._id;
      await project.save();
    } else {
      console.log("Not updating project (isEOD false)"); // DEBUG
    }

    // Populate author for immediate return
    await newUpdate.populate("author", "firstName lastName email role");

    res.status(201).json(newUpdate);
  } catch (error) {
    console.error("Error creating project update:", error);
    res.status(500).json({ message: "Server error creating update" });
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
