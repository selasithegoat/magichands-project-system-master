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
      enum: ["General", "Production", "Client", "Design"],
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
  { timestamps: true }
);

module.exports = mongoose.model("ProjectUpdate", ProjectUpdateSchema);
