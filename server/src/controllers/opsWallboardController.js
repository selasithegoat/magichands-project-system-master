const { getOpsWallboardOverview } = require("../utils/opsWallboardService");

// @desc    Get wallboard session user
// @route   GET /api/ops/wallboard/session
// @access  Private (Admin)
const getWallboardSession = async (req, res) => {
  return res.status(200).json({
    authenticated: true,
    user: {
      _id: req.user?._id || null,
      role: req.user?.role || null,
      firstName: req.user?.firstName || "",
      lastName: req.user?.lastName || "",
      employeeId: req.user?.employeeId || "",
      email: req.user?.email || "",
    },
  });
};

// @desc    Get operational wallboard overview
// @route   GET /api/ops/wallboard/overview
// @access  Private (Admin)
const getWallboardOverview = async (_req, res) => {
  try {
    const overview = await getOpsWallboardOverview();
    return res.status(200).json(overview);
  } catch (error) {
    console.error("Error loading ops wallboard overview:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getWallboardSession,
  getWallboardOverview,
};
