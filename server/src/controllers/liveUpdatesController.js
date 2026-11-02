const mongoose = require("mongoose");
const Project = require("../models/Project");
const ProjectUpdate = require("../models/ProjectUpdate");
const MaterialRequest = require("../models/MaterialRequest");
const User = require("../models/User");
const { normalizeProjectUpdateContent } = require("../utils/projectUpdateText");

const CURRENT_PROJECT_FILTER = {
  projectLeadId: { $ne: null },
  isLatestVersion: { $ne: false },
  versionState: { $nin: ["superseded", "archived"] },
};
const CLOSED_STATUSES = new Set(["Completed", "Finished", "Declined"]);

const toId = (value) => String(value?._id || value || "");
const displayName = (user, fallback = "Unknown lead") =>
  [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
  user?.employeeId ||
  fallback;
const isActive = (project) =>
  !project?.cancellation?.isCancelled && !CLOSED_STATUSES.has(project?.status);
const asTime = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

exports.getLeadProfiles = async (_req, res) => {
  try {
    const projects = await Project.find(CURRENT_PROJECT_FILTER)
      .select("_id projectLeadId status cancellation.isCancelled hold.isOnHold")
      .lean();
    const activeProjects = projects.filter(isActive);
    const requests = await MaterialRequest.find({
      requestType: "project",
      project: { $in: activeProjects.map((project) => project._id) },
      status: { $nin: ["Fulfilled", "Declined"] },
    }).select("project priority").lean();
    const requestsByProject = new Map();
    for (const request of requests) {
      const key = toId(request.project);
      if (!requestsByProject.has(key)) requestsByProject.set(key, []);
      requestsByProject.get(key).push(request);
    }
    const groups = new Map();
    for (const project of projects) {
      const key = toId(project.projectLeadId);
      if (!groups.has(key)) groups.set(key, {
        id: key,
        totalProjects: 0,
        activeProjects: 0,
        attentionProjects: 0,
        openRequests: 0,
      });
      const group = groups.get(key);
      group.totalProjects += 1;
      if (!isActive(project)) continue;
      group.activeProjects += 1;
      const projectRequests = requestsByProject.get(toId(project)) || [];
      group.openRequests += projectRequests.length;
      if (project.hold?.isOnHold || projectRequests.some((request) => ["High", "Urgent"].includes(request.priority))) {
        group.attentionProjects += 1;
      }
    }

    const users = await User.find({ _id: { $in: [...groups.keys()] } })
      .select("firstName lastName employeeId avatarUrl department")
      .lean();
    const userById = new Map(users.map((user) => [toId(user), user]));
    const leads = [...groups.values()]
      .map((group) => {
        const user = userById.get(group.id);
        return {
          id: group.id,
          name: user ? displayName(user) : "Former lead",
          employeeId: user?.employeeId || "",
          avatarUrl: user?.avatarUrl || "",
          department: user?.department || [],
          totalProjects: group.totalProjects,
          activeProjects: group.activeProjects,
          attentionProjects: group.attentionProjects,
          openRequests: group.openRequests,
        };
      })
      .sort((left, right) =>
        right.attentionProjects - left.attentionProjects ||
        right.activeProjects - left.activeProjects ||
        left.name.localeCompare(right.name),
      );

    res.json({
      leads,
      summary: {
        leadCount: leads.length,
        activeProjects: activeProjects.length,
        attentionProjects: leads.reduce((count, lead) => count + lead.attentionProjects, 0),
        openRequests: requests.length,
      },
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load live update leads:", error);
    res.status(500).json({ message: "Failed to load project leads." });
  }
};

exports.getLeadProjects = async (req, res) => {
  try {
    const { leadId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ message: "Invalid lead ID." });
    }
    const lead = await User.findById(leadId)
      .select("firstName lastName employeeId avatarUrl department")
      .lean();
    const leadName = lead ? displayName(lead) : "Former lead";

    const projects = await Project.find({
      ...CURRENT_PROJECT_FILTER,
      projectLeadId: new mongoose.Types.ObjectId(leadId),
    })
      .select(
        "orderId details.projectName details.projectNameRaw details.projectIndicator details.client clientName status statusChangedAt hold cancellation assistantLeadId createdAt updatedAt",
      )
      .populate("assistantLeadId", "firstName lastName employeeId")
      .lean();
    const projectIds = projects.map((project) => project._id);
    if (!projectIds.length) {
      return res.json({ lead: { id: leadId, name: leadName }, projects: [], asOf: new Date().toISOString() });
    }

    const [updates, requests] = await Promise.all([
      ProjectUpdate.aggregate([
        { $match: { project: { $in: projectIds } } },
        { $sort: { project: 1, createdAt: -1, _id: -1 } },
        { $group: { _id: "$project", latest: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$latest" } },
        { $project: { project: 1, author: 1, content: 1, category: 1, createdAt: 1 } },
      ]),
      MaterialRequest.find({ requestType: "project", project: { $in: projectIds } })
        .select("project materialName items.materialName items.fulfillmentStatus items.purchaseStatus items.purchaseUpdatedAt items.fulfilledAt status statusNote statusUpdatedAt createdAt priority")
        .lean(),
    ]);
    const authors = await User.find({ _id: { $in: updates.map((update) => update.author) } })
      .select("firstName lastName employeeId")
      .lean();
    const authorById = new Map(authors.map((author) => [toId(author), author]));
    const updateByProject = new Map(updates.map((update) => [toId(update.project), update]));
    const requestsByProject = new Map();
    for (const request of requests) {
      const key = toId(request.project);
      if (!requestsByProject.has(key)) requestsByProject.set(key, []);
      requestsByProject.get(key).push(request);
    }

    const responseProjects = projects.map((project) => {
      const latest = updateByProject.get(toId(project));
      const projectRequests = (requestsByProject.get(toId(project)) || []).map((request) => {
        const itemDates = (request.items || []).flatMap((item) => [item.purchaseUpdatedAt, item.fulfilledAt]);
        const activityAt = new Date(Math.max(asTime(request.statusUpdatedAt), asTime(request.createdAt), ...itemDates.map(asTime))).toISOString();
        return {
          id: toId(request),
          materialName: request.materialName,
          status: request.status,
          statusNote: request.statusNote || "",
          priority: request.priority,
          activityAt,
          statusAt: request.statusUpdatedAt || request.createdAt || null,
          items: (request.items || []).map((item) => ({
            id: toId(item),
            materialName: item.materialName,
            fulfillmentStatus: item.fulfillmentStatus,
            purchaseStatus: item.purchaseStatus,
          })),
        };
      }).sort((left, right) => asTime(right.activityAt) - asTime(left.activityAt));
      const latestActivity = Math.max(
        asTime(project.statusChangedAt || project.createdAt),
        asTime(latest?.createdAt),
        ...projectRequests.map((request) => asTime(request.activityAt)),
      );
      return {
        id: toId(project),
        orderId: project.orderId || "",
        name: project.details?.projectNameRaw || project.details?.projectName || project.orderId || "Untitled project",
        indicator: project.details?.projectIndicator || "",
        client: project.details?.client || project.clientName || "",
        status: project.status || "Unknown",
        statusChangedAt: project.statusChangedAt || project.createdAt || null,
        isActive: isActive(project),
        isOnHold: Boolean(project.hold?.isOnHold),
        isCancelled: Boolean(project.cancellation?.isCancelled),
        assistantLead: project.assistantLeadId
          ? { id: toId(project.assistantLeadId), name: displayName(project.assistantLeadId) }
          : null,
        latestUpdate: latest
          ? {
              id: toId(latest),
              content: normalizeProjectUpdateContent(latest.content || ""),
              category: latest.category || "General",
              createdAt: latest.createdAt,
              author: displayName(authorById.get(toId(latest.author)), "Unknown author"),
            }
          : null,
        requests: projectRequests,
        lastActivityAt: latestActivity ? new Date(latestActivity).toISOString() : null,
      };
    }).sort((left, right) => asTime(right.lastActivityAt) - asTime(left.lastActivityAt));

    res.json({
      lead: { id: leadId, name: leadName, avatarUrl: lead?.avatarUrl || "" },
      projects: responseProjects,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load lead live updates:", error);
    res.status(500).json({ message: "Failed to load lead projects." });
  }
};
