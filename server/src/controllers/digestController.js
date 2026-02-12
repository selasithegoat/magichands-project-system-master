const WeeklyDigest = require("../models/WeeklyDigest");
const Project = require("../models/Project");

const getLatestDigest = async (req, res) => {
  try {
    const digest = await WeeklyDigest.findOne({
      recipient: req.user._id,
    })
      .sort({ periodStart: -1 })
      .lean();

    if (!digest) {
      return res.json({ digest: null });
    }

    if (Array.isArray(digest.actionRequired) && digest.actionRequired.length) {
      const projectIds = digest.actionRequired
        .map((item) => item.project)
        .filter(Boolean);

      if (projectIds.length) {
        const projects = await Project.find({ _id: { $in: projectIds } })
          .select("details.deliveryDate details.deliveryTime")
          .lean();

        const projectMap = new Map(
          projects.map((project) => [project._id.toString(), project]),
        );

        const updatedActionRequired = digest.actionRequired.map((item) => {
          const project = item.project
            ? projectMap.get(item.project.toString())
            : null;
          if (!project) return item;
          const deliveryDate =
            item.deliveryDate || project.details?.deliveryDate || null;
          const deliveryTime =
            item.deliveryTime || project.details?.deliveryTime || "";
          return {
            ...item,
            deliveryDate,
            deliveryTime,
          };
        });

        const changed = updatedActionRequired.some((item, index) => {
          const existing = digest.actionRequired[index] || {};
          return (
            String(item.deliveryDate || "") !==
              String(existing.deliveryDate || "") ||
            String(item.deliveryTime || "") !==
              String(existing.deliveryTime || "")
          );
        });

        if (changed) {
          await WeeklyDigest.updateOne(
            { _id: digest._id },
            { $set: { actionRequired: updatedActionRequired } },
          );
          digest.actionRequired = updatedActionRequired;
        }
      }
    }

    res.json({ digest });
  } catch (error) {
    console.error("Error fetching weekly digest:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getLatestDigest,
};
