const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const {
  requireDisciplinaryAccess,
  requireDisciplinaryAdmin,
} = require("../utils/disciplinaryAccess");
const controller = require("../controllers/disciplinaryReportController");

const router = express.Router();

const handleEvidenceUpload = (req, res, next) => {
  upload.array("disciplinaryEvidence", 8)(req, res, (error) => {
    if (error) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `File too large. Maximum size is ${upload.maxFileSizeMb}MB.`,
        });
      }
      return res.status(400).json({ message: error.message });
    }
    Promise.resolve(upload.scanRequestFiles(req))
      .then(() => next())
      .catch(async (scanError) => {
        await upload.cleanupRequestFiles(req);
        return res.status(400).json({
          message: scanError?.message || "Uploaded evidence failed security checks.",
        });
      });
  });
};

router.use(protect);
router.use(requireDisciplinaryAccess);

router.get("/directory", controller.listDirectory);
router.get("/projects", controller.searchProjects);
router.get("/ranking", controller.getRanking);
router.route("/").get(controller.listReports).post(controller.createReport);
router.route("/:id").get(controller.getReport).put(controller.updateReport);
router.post("/:id/submit", controller.submitReport);
router.post("/:id/finalize", requireDisciplinaryAdmin, controller.finalizeReport);
router.post("/:id/reopen", requireDisciplinaryAdmin, controller.reopenReport);
router.post("/:id/void", requireDisciplinaryAdmin, controller.voidReport);
router.post("/:id/evidence", handleEvidenceUpload, controller.addAttachments);
router.get("/:id/export.docx", controller.downloadReport);

module.exports = router;
