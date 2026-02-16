const mongoose = require("mongoose");

const ProjectUpdateSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      enum: [
        "General",
        "Production",
        "Design",
        "Graphics",
        "Graphics/Design",
        "Photography",
        "Stores",
        "IT Department",
        "Client",
      ],
      default: "General",
    },
    content: {
      type: String,
      required: true,
    },
    attachments: [
      {
        name: String, // Original filename
        url: String, // Path or URL to file
        fileType: String, // MIME type or file extension
      },
    ],
  },
  { timestamps: true },
);

// Optimizes GET /api/updates/project/:projectId sorted by newest first
ProjectUpdateSchema.index({ project: 1, createdAt: -1 });

module.exports = mongoose.model("ProjectUpdate", ProjectUpdateSchema);
