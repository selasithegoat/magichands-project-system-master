const mongoose = require("mongoose");
const DisciplinaryReport = require("../models/DisciplinaryReport");
const DisciplinaryReportCounter = require("../models/DisciplinaryReportCounter");
const Project = require("../models/Project");
const User = require("../models/User");
const {
  generateDisciplinaryReportDocument,
} = require("../services/disciplinaryReportDocumentService");

const SEVERITY_POINTS = Object.freeze({ minor: 1, moderate: 3, major: 5, critical: 8 });
const REPORT_STATUSES = new Set(["draft", "submitted", "finalized", "voided"]);
const toText = (value, max = 10000) => String(value || "").trim().slice(0, max);
const toId = (value) => {
  const candidate = typeof value === "object" ? value?._id || value?.user || value?.id : value;
  return mongoose.Types.ObjectId.isValid(String(candidate || "")) ? String(candidate) : "";
};
const displayName = (user) =>
  `${toText(user?.firstName, 100)} ${toText(user?.lastName, 100)}`.trim() ||
  toText(user?.name, 200) ||
  toText(user?.employeeId, 100) ||
  "Employee";

const actorEntry = (req, action, note = "") => ({
  action,
  actor: req.user._id,
  actorName: displayName(req.user),
  note: toText(note, 1000),
  at: new Date(),
});

const allocateReportNumber = async (meetingDate = new Date()) => {
  const parsed = new Date(meetingDate);
  const year = Number.isNaN(parsed.getTime()) ? new Date().getUTCFullYear() : parsed.getUTCFullYear();
  const counter = await DisciplinaryReportCounter.findOneAndUpdate(
    { key: `disciplinary-report-${year}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return `DCMR-${year}-${String(counter.value).padStart(4, "0")}`;
};

const getUsersByIds = async (ids = []) => {
  const validIds = Array.from(new Set(ids.map(toId).filter(Boolean)));
  if (!validIds.length) return new Map();
  const users = await User.find({ _id: { $in: validIds } })
    .select("firstName lastName name employeeId department position")
    .lean();
  return new Map(users.map((user) => [String(user._id), user]));
};

const snapshotUser = (user, roleOverride = "") => ({
  user: user?._id || null,
  name: displayName(user),
  employeeId: toText(user?.employeeId, 100),
  department: Array.isArray(user?.department)
    ? user.department.map((entry) => toText(entry, 100)).filter(Boolean)
    : [],
  role: toText(roleOverride || user?.position, 150),
});

const parseDate = (value, required = false) => {
  if (!value) return required ? null : undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildReportPayload = async (body, req) => {
  const projectId = toId(body?.project || body?.projectId);
  const project = projectId
    ? await Project.findById(projectId)
        .select("orderId details.projectName details.clientName clientName client createdAt")
        .lean()
    : null;
  if (!project) throw Object.assign(new Error("Select a valid project."), { statusCode: 400 });

  const attendeeInput = Array.isArray(body?.attendees) ? body.attendees : [];
  const accountabilityInput = Array.isArray(body?.accountability) ? body.accountability : [];
  const moderatorId = toId(body?.moderator?.user || body?.moderator || req.user._id);
  const correctiveOwnerIds = accountabilityInput.map((entry) => toId(entry?.correctiveOwner?.user || entry?.correctiveOwner));
  const usersById = await getUsersByIds([
    moderatorId,
    ...attendeeInput.map((entry) => toId(entry?.user || entry)),
    ...accountabilityInput.map((entry) => toId(entry?.user || entry)),
    ...correctiveOwnerIds,
  ]);
  const moderatorUser = usersById.get(moderatorId);
  if (!moderatorUser) throw Object.assign(new Error("Select a valid Scrum Lead or moderator."), { statusCode: 400 });

  const startedAt = parseDate(body?.meeting?.startedAt || body?.startedAt, true);
  const endedAt = parseDate(body?.meeting?.endedAt || body?.endedAt);
  if (!startedAt) throw Object.assign(new Error("Enter a valid meeting start date and time."), { statusCode: 400 });
  if (endedAt === null || (endedAt && endedAt < startedAt)) {
    throw Object.assign(new Error("Meeting end time must be after the start time."), { statusCode: 400 });
  }

  const challengeTitle = toText(body?.challengeTitle, 300);
  const challengeBrief = toText(body?.challengeBrief, 20000);
  if (!challengeTitle || !challengeBrief) {
    throw Object.assign(new Error("Challenge title and challenge brief are required."), { statusCode: 400 });
  }

  const attendees = attendeeInput
    .map((entry) => {
      const id = toId(entry?.user || entry);
      const user = usersById.get(id);
      if (!user) return null;
      return {
        ...snapshotUser(user, entry?.role),
        attendanceStatus: ["present", "absent", "apology"].includes(entry?.attendanceStatus)
          ? entry.attendanceStatus
          : "present",
      };
    })
    .filter(Boolean);

  const findings = (Array.isArray(body?.findings) ? body.findings : [])
    .map((entry) => ({
      title: toText(entry?.title, 300),
      discussion: toText(entry?.discussion, 20000),
      evidence: toText(entry?.evidence, 10000),
      conclusion: toText(entry?.conclusion, 10000),
    }))
    .filter((entry) => entry.title && entry.conclusion);

  const proposals = (Array.isArray(body?.proposals) ? body.proposals : [])
    .map((entry) => ({
      recommendation: toText(entry?.recommendation, 10000),
      votesFor: Math.max(0, Number.parseInt(entry?.votesFor, 10) || 0),
      votesAgainst: Math.max(0, Number.parseInt(entry?.votesAgainst, 10) || 0),
      abstentions: Math.max(0, Number.parseInt(entry?.abstentions, 10) || 0),
      selected: Boolean(entry?.selected),
    }))
    .filter((entry) => entry.recommendation);

  const accountability = accountabilityInput
    .map((entry) => {
      const user = usersById.get(toId(entry?.user || entry));
      const severity = Object.hasOwn(SEVERITY_POINTS, entry?.severity) ? entry.severity : "minor";
      if (!user || !toText(entry?.summary, 10000)) return null;
      const penalized = Boolean(entry?.penalized);
      const penaltyTypes = new Set(["none", "coaching", "verbal_warning", "written_warning", "restitution", "suspension", "other"]);
      const penaltyStatuses = new Set(["not_applicable", "pending", "active", "completed", "cancelled"]);
      const correctiveStatuses = new Set(["not_required", "open", "in_progress", "completed", "overdue"]);
      const owner = usersById.get(toId(entry?.correctiveOwner?.user || entry?.correctiveOwner));
      return {
        ...snapshotUser(user, entry?.role),
        summary: toText(entry.summary, 10000),
        severity,
        penalized,
        penaltyType: penalized && penaltyTypes.has(entry?.penaltyType) ? entry.penaltyType : "none",
        penaltyDetails: penalized ? toText(entry?.penaltyDetails, 10000) : "",
        effectiveDate: penalized ? parseDate(entry?.effectiveDate) || null : null,
        penaltyStatus: penalized && penaltyStatuses.has(entry?.penaltyStatus)
          ? entry.penaltyStatus
          : "not_applicable",
        correctiveAction: toText(entry?.correctiveAction, 10000),
        correctiveOwner: owner ? snapshotUser(owner) : null,
        correctiveDueDate: parseDate(entry?.correctiveDueDate) || null,
        correctiveStatus: correctiveStatuses.has(entry?.correctiveStatus)
          ? entry.correctiveStatus
          : entry?.correctiveAction
            ? "open"
            : "not_required",
      };
    })
    .filter(Boolean);

  return {
    project: project._id,
    projectSnapshot: {
      orderId: toText(project.orderId, 150) || String(project._id),
      projectName: toText(project?.details?.projectName, 300) || "Untitled project",
      clientName:
        toText(project?.details?.clientName, 300) ||
        toText(project?.clientName, 300) ||
        toText(project?.client?.name, 300),
    },
    challengeTitle,
    moderator: snapshotUser(moderatorUser, body?.moderator?.role || "Scrum Lead / Moderator"),
    meeting: {
      startedAt,
      endedAt: endedAt || null,
      location: toText(body?.meeting?.location || body?.location, 300),
    },
    attendees,
    challengeBrief,
    projectImpact: toText(body?.projectImpact, 10000),
    findings,
    proposals,
    accountability,
    committeeConclusion: toText(body?.committeeConclusion, 20000),
    managementDecision: toText(body?.managementDecision, 20000),
  };
};

const isOwnerOrAdmin = (req, report) =>
  req.user?.role === "admin" || String(report?.createdBy) === String(req.user?._id);

const populateReport = (query) =>
  query
    .populate("createdBy submittedBy finalizedBy voidedBy", "firstName lastName employeeId")
    .populate("evidenceFiles.uploadedBy", "firstName lastName employeeId");

const listReports = async (req, res) => {
  try {
    const query = {};
    const status = toText(req.query.status, 30).toLowerCase();
    if (REPORT_STATUSES.has(status)) query.status = status;
    if (toId(req.query.employeeId)) query["accountability.user"] = req.query.employeeId;
    if (toId(req.query.projectId)) query.project = req.query.projectId;
    const search = toText(req.query.search, 150);
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { reportNumber: { $regex: escaped, $options: "i" } },
        { challengeTitle: { $regex: escaped, $options: "i" } },
        { "projectSnapshot.orderId": { $regex: escaped, $options: "i" } },
        { "projectSnapshot.projectName": { $regex: escaped, $options: "i" } },
        { "accountability.name": { $regex: escaped, $options: "i" } },
      ];
    }
    const reports = await populateReport(
      DisciplinaryReport.find(query).sort({ "meeting.startedAt": -1, createdAt: -1 }).limit(300),
    ).lean();
    return res.json(reports);
  } catch (error) {
    console.error("Failed to list disciplinary reports:", error);
    return res.status(500).json({ message: "Failed to load disciplinary reports." });
  }
};

const getReport = async (req, res) => {
  try {
    const report = await populateReport(DisciplinaryReport.findById(req.params.id)).lean();
    if (!report) return res.status(404).json({ message: "Report not found." });
    return res.json(report);
  } catch (error) {
    return res.status(400).json({ message: "Invalid report reference." });
  }
};

const createReport = async (req, res) => {
  try {
    const payload = await buildReportPayload(req.body, req);
    const reportNumber = await allocateReportNumber(payload.meeting.startedAt);
    const report = await DisciplinaryReport.create({
      ...payload,
      reportNumber,
      createdBy: req.user._id,
      auditTrail: [actorEntry(req, "created")],
    });
    return res.status(201).json(await populateReport(DisciplinaryReport.findById(report._id)).lean());
  } catch (error) {
    console.error("Failed to create disciplinary report:", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Failed to create report." });
  }
};

const updateReport = async (req, res) => {
  try {
    const report = await DisciplinaryReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found." });
    if (!isOwnerOrAdmin(req, report)) return res.status(403).json({ message: "You can only edit reports you created." });
    if (report.status !== "draft") return res.status(409).json({ message: "Only draft reports can be edited." });
    const payload = await buildReportPayload(req.body, req);
    report.set(payload);
    report.version += 1;
    report.auditTrail.push(actorEntry(req, "updated"));
    await report.save();
    return res.json(await populateReport(DisciplinaryReport.findById(report._id)).lean());
  } catch (error) {
    console.error("Failed to update disciplinary report:", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Failed to update report." });
  }
};

const submitReport = async (req, res) => {
  const report = await DisciplinaryReport.findById(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found." });
  if (!isOwnerOrAdmin(req, report)) return res.status(403).json({ message: "You can only submit reports you created." });
  if (report.status !== "draft") return res.status(409).json({ message: "Only draft reports can be submitted." });
  if (!report.committeeConclusion || report.findings.length === 0) {
    return res.status(400).json({ message: "Add at least one finding and the committee conclusion before submission." });
  }
  report.status = "submitted";
  report.submittedBy = req.user._id;
  report.submittedAt = new Date();
  report.auditTrail.push(actorEntry(req, "submitted"));
  await report.save();
  return res.json(await populateReport(DisciplinaryReport.findById(report._id)).lean());
};

const finalizeReport = async (req, res) => {
  const report = await DisciplinaryReport.findById(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found." });
  if (report.status !== "submitted") return res.status(409).json({ message: "Only submitted reports can be finalized." });
  const decision = toText(req.body?.managementDecision || report.managementDecision, 20000);
  if (!decision) return res.status(400).json({ message: "Enter the management decision before finalizing." });
  report.managementDecision = decision;
  report.status = "finalized";
  report.finalizedBy = req.user._id;
  report.finalizedAt = new Date();
  report.auditTrail.push(actorEntry(req, "finalized"));
  await report.save();
  return res.json(await populateReport(DisciplinaryReport.findById(report._id)).lean());
};

const reopenReport = async (req, res) => {
  const report = await DisciplinaryReport.findById(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found." });
  if (!["submitted", "finalized"].includes(report.status)) return res.status(409).json({ message: "This report cannot be reopened." });
  report.status = "draft";
  report.version += 1;
  report.auditTrail.push(actorEntry(req, "reopened", req.body?.reason));
  await report.save();
  return res.json(await populateReport(DisciplinaryReport.findById(report._id)).lean());
};

const voidReport = async (req, res) => {
  const reason = toText(req.body?.reason, 2000);
  if (!reason) return res.status(400).json({ message: "A reason is required to void a report." });
  const report = await DisciplinaryReport.findById(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found." });
  report.status = "voided";
  report.voidedBy = req.user._id;
  report.voidedAt = new Date();
  report.voidReason = reason;
  report.auditTrail.push(actorEntry(req, "voided", reason));
  await report.save();
  return res.json(await populateReport(DisciplinaryReport.findById(report._id)).lean());
};

const listDirectory = async (_req, res) => {
  const users = await User.find({}).select("firstName lastName name employeeId department position accessTags avatarUrl").sort({ firstName: 1, lastName: 1 }).lean();
  return res.json(users.map((user) => ({ ...snapshotUser(user), accessTags: user.accessTags || [], avatarUrl: user.avatarUrl || "" })));
};

const searchProjects = async (req, res) => {
  const search = toText(req.query.search, 100);
  const query = search
    ? { $or: [
        { orderId: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        { "details.projectName": { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      ] }
    : {};
  const projects = await Project.find(query)
    .select("orderId details.projectName details.clientName status")
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();
  return res.json(projects);
};

const getRanking = async (req, res) => {
  const query = { status: "finalized" };
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ""))) {
    to.setUTCHours(23, 59, 59, 999);
  }
  if (from || to) {
    query.finalizedAt = {};
    if (from) query.finalizedAt.$gte = from;
    if (to) query.finalizedAt.$lte = to;
  }
  const reports = await DisciplinaryReport.find(query)
    .select("reportNumber challengeTitle finalizedAt accountability")
    .lean();
  const departmentFilter = toText(req.query.department, 100).toLowerCase();
  const ranking = new Map();
  reports.forEach((report) => {
    (report.accountability || []).forEach((entry) => {
      if (!entry.user) return;
      if (departmentFilter && !(entry.department || []).some((department) => String(department).toLowerCase() === departmentFilter)) return;
      const key = String(entry.user);
      const current = ranking.get(key) || {
        user: entry.user,
        name: entry.name,
        employeeId: entry.employeeId,
        department: entry.department || [],
        score: 0,
        findingCount: 0,
        penaltiesIssued: 0,
        openCorrectiveActions: 0,
        severityCounts: { minor: 0, moderate: 0, major: 0, critical: 0 },
        latestIncidentAt: null,
        reports: [],
      };
      current.findingCount += 1;
      current.score += SEVERITY_POINTS[entry.severity] || 0;
      current.severityCounts[entry.severity] = (current.severityCounts[entry.severity] || 0) + 1;
      if (entry.penalized) current.penaltiesIssued += 1;
      if (["open", "in_progress", "overdue"].includes(entry.correctiveStatus)) current.openCorrectiveActions += 1;
      if (!current.latestIncidentAt || new Date(report.finalizedAt) > new Date(current.latestIncidentAt)) current.latestIncidentAt = report.finalizedAt;
      current.reports.push({ _id: report._id, reportNumber: report.reportNumber, challengeTitle: report.challengeTitle, severity: entry.severity, finalizedAt: report.finalizedAt });
      ranking.set(key, current);
    });
  });
  return res.json(Array.from(ranking.values()).sort((left, right) => right.score - left.score || right.findingCount - left.findingCount || left.name.localeCompare(right.name)));
};

const addAttachments = async (req, res) => {
  try {
    const report = await DisciplinaryReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found." });
    if (!isOwnerOrAdmin(req, report) || report.status !== "draft") {
      return res.status(403).json({ message: "Evidence can only be added to an editable draft." });
    }
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ message: "Choose at least one evidence file." });
    report.evidenceFiles.push(...files.map((file) => ({
      fileUrl: `/uploads/${String(file.filename || "").replace(/\\/g, "/")}`,
      originalName: toText(file.originalname, 300),
      mimeType: toText(file.mimetype, 150),
      size: Number(file.size) || 0,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
    })));
    report.auditTrail.push(actorEntry(req, "attachment_added", `${files.length} evidence file(s)`));
    await report.save();
    return res.json(await populateReport(DisciplinaryReport.findById(report._id)).lean());
  } catch (error) {
    console.error("Failed to add disciplinary evidence:", error);
    return res.status(500).json({ message: "Failed to attach evidence." });
  }
};

const downloadReport = async (req, res) => {
  const report = await populateReport(DisciplinaryReport.findById(req.params.id)).lean();
  if (!report) return res.status(404).json({ message: "Report not found." });
  const document = await generateDisciplinaryReportDocument(report);
  res.setHeader("Content-Type", document.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
  res.setHeader("Cache-Control", "no-store");
  return res.send(document.buffer);
};

module.exports = {
  listReports,
  getReport,
  createReport,
  updateReport,
  submitReport,
  finalizeReport,
  reopenReport,
  voidReport,
  listDirectory,
  searchProjects,
  getRanking,
  addAttachments,
  downloadReport,
};
