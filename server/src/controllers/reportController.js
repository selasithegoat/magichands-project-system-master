const {
  DEFAULT_TIME_ZONE,
  generateEndOfDayReport,
  loadEndOfDayReportData,
} = require("../services/endOfDayReportService");

const isFrontDeskUser = (user) => {
  const departments = Array.isArray(user?.department)
    ? user.department
    : [user?.department];
  return departments.some(
    (department) =>
      String(department || "").trim().toLowerCase() === "front desk",
  );
};

const getUserDisplayName = (user) =>
  `${String(user?.firstName || "").trim()} ${String(
    user?.lastName || "",
  ).trim()}`.trim() || "Front Desk";

const downloadEndOfDayReport = async (req, res) => {
  if (!isFrontDeskUser(req.user)) {
    return res.status(403).json({
      message: "Only Front Desk can download the End of Day report.",
    });
  }

  try {
    const now = new Date();
    const reportData = await loadEndOfDayReportData({ now });
    if (reportData.projectCount === 0) {
      return res.status(404).json({
        message: "There are no active projects to include in the report.",
      });
    }

    const report = await generateEndOfDayReport({
      ...reportData,
      now,
      timeZone:
        String(process.env.EOD_REPORT_TIMEZONE || "").trim() ||
        DEFAULT_TIME_ZONE,
      generatedBy: getUserDisplayName(req.user),
    });

    res.setHeader("Content-Type", report.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.filename.replace(/"/g, "")}"`,
    );
    res.setHeader("Content-Length", report.buffer.length);
    res.setHeader("Cache-Control", "no-store");
    return res.send(report.buffer);
  } catch (error) {
    console.error("Failed to generate End of Day report:", error);
    return res.status(500).json({
      message: "Failed to generate the End of Day report.",
    });
  }
};

module.exports = {
  downloadEndOfDayReport,
};
