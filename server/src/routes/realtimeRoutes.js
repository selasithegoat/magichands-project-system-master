const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { addClient, removeClient } = require("../utils/realtimeHub");

router.get("/", protect, (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  res.write(`event: connected\ndata: {"ok": true}\n\n`);
  addClient(res);

  req.on("close", () => {
    removeClient(res);
  });
});

module.exports = router;
