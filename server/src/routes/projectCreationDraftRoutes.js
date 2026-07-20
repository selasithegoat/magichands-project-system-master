const express = require("express");
const upload = require("../middleware/upload");
const { protect } = require("../middleware/authMiddleware");
const {
  prepareNewDraftUpload,
  prepareExistingDraftUpload,
  createProjectCreationDraft,
  listProjectCreationDrafts,
  getProjectCreationDraft,
  updateProjectCreationDraft,
  deleteProjectCreationDraft,
  submitProjectCreationDraft,
} = require("../controllers/projectCreationDraftController");

const router = express.Router();
const draftUploadFields = [
  { name: "sampleImage", maxCount: 1 },
  { name: "clientMockup" },
  { name: "approvedMockup" },
  { name: "attachments" },
];

const handleDraftUploads = (req, res, next) => {
  upload.fields(draftUploadFields)(req, res, async (error) => {
    if (error) {
      await upload.cleanupRequestFiles(req).catch((cleanupError) => {
        console.error("Failed to clean up rejected draft uploads:", cleanupError);
      });
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `File too large. Max limit is ${upload.maxFileSizeMb}MB.`,
        });
      }
      if (error.code === "LIMIT_UNEXPECTED_FILE" && error.field === "sampleImage") {
        return res.status(400).json({
          message: "Only one sample image can be uploaded per draft.",
        });
      }
      return res.status(400).json({ message: error.message });
    }

    Promise.resolve(upload.scanRequestFiles(req))
      .then(() => next())
      .catch(async (scanError) => {
        await upload.cleanupRequestFiles(req);
        return res.status(400).json({
          message:
            scanError?.message ||
            "Uploaded file failed security checks. Please upload a different file.",
        });
      });
  });
};

router.get("/", protect, listProjectCreationDrafts);
router.post(
  "/",
  protect,
  prepareNewDraftUpload,
  handleDraftUploads,
  createProjectCreationDraft,
);
router.get("/:id", protect, getProjectCreationDraft);
router.put(
  "/:id",
  protect,
  prepareExistingDraftUpload,
  handleDraftUploads,
  updateProjectCreationDraft,
);
router.post(
  "/:id/submit",
  protect,
  prepareExistingDraftUpload,
  handleDraftUploads,
  submitProjectCreationDraft,
);
router.delete("/:id", protect, deleteProjectCreationDraft);

module.exports = router;
