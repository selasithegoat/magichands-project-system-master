const router = require("express").Router();
const mongoose = require("mongoose");
const { protect } = require("../middleware/authMiddleware");
const service = require("../services/productionFollowUpService");

router.use(protect);
router.get("/", async (req, res) => {
  try { res.json({ projects: await service.listForUser(req.user, { source: req.query.source }) }); }
  catch (error) { console.error("Production follow-up list:", error); res.status(500).json({ message: "Could not load production follow-up." }); }
});
router.post("/:id/:action", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid project ID." });
  try { res.json(await service.act(req.params.id, req.user, req.params.action, req.body, { source: req.query.source })); }
  catch (error) {
    const status = error.status || (error.name === "CastError" || error.name === "ValidationError" ? 400 : 500);
    if (status === 500) console.error("Production follow-up action:", error);
    res.status(status).json({ message: status === 500 ? "Could not update production follow-up." : error.message });
  }
});
module.exports = router;
