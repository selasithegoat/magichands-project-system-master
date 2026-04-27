const Project = require("../models/Project");
const ProjectComment = require("../models/ProjectComment");
const User = require("../models/User");
const { createNotification } = require("../utils/notificationService");
const { logActivity } = require("../utils/activityLogger");

const FRONT_DESK_DEPARTMENT = "Front Desk";
const AUTHOR_FIELDS = "firstName lastName name email role department avatarUrl";
const MENTION_USER_FIELDS =
  "_id firstName lastName name email employeeId role department avatarUrl createdAt";
const PROJECT_ACCESS_FIELDS =
  "orderId details.projectName details.projectNameRaw details.projectIndicator createdBy projectLeadId assistantLeadId departments";
const PROJECT_COMMENT_FEED_PROJECT_FIELDS = `${PROJECT_ACCESS_FIELDS} details.client projectType status`;

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value._id && value._id !== value) return toIdString(value._id);
    if (typeof value.id === "string" || typeof value.id === "number") {
      return String(value.id).trim();
    }
    if (typeof value.toString === "function") {
      const stringified = value.toString();
      if (stringified && stringified !== "[object Object]") return stringified;
    }
  }
  return "";
};

const toArray = (value) =>
  Array.isArray(value) ? value : value ? [value] : [];

const normalizeDepartmentToken = (value) => {
  const raw =
    value && typeof value === "object" ? value.value || value.label : value;
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
};

const canonicalizeDepartment = (value) => {
  const token = normalizeDepartmentToken(value);
  if (!token) return "";
  if (token === "front-desk") return "front-desk";
  if (
    [
      "production",
      "dtf",
      "uv-dtf",
      "uv-printing",
      "engraving",
      "large-format",
      "digital-press",
      "digital-heat-press",
      "offset-press",
      "screen-printing",
      "embroidery",
      "sublimation",
      "digital-cutting",
      "pvc-id",
      "business-cards",
      "installation",
      "overseas",
      "woodme",
      "fabrication",
      "signage",
      "local-outsourcing",
      "outside-production",
    ].includes(token)
  ) {
    return "production";
  }
  if (["graphics/design", "graphics", "design"].includes(token)) {
    return "graphics";
  }
  if (["stores", "stock", "packaging"].includes(token)) return "stores";
  if (token === "photography") return "photography";
  return token;
};

const getUserDisplayName = (user) => {
  const firstName = toText(user?.firstName);
  const lastName = toText(user?.lastName);
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return fullName || toText(user?.name) || toText(user?.email) || "Someone";
};

const getProjectDisplayName = (project) => {
  const details = project?.details || {};
  return (
    toText(details.projectName) ||
    toText(details.projectNameRaw) ||
    "Unnamed Project"
  );
};

const serializeProjectSummary = (project) => ({
  _id: toIdString(project?._id),
  orderId: toText(project?.orderId),
  projectName: getProjectDisplayName(project),
  projectIndicator: toText(project?.details?.projectIndicator),
  client: toText(project?.details?.client),
  projectType: toText(project?.projectType),
  status: toText(project?.status),
  departments: toArray(project?.departments),
});

const serializeCommentAuthor = (author) => ({
  _id: toIdString(author?._id || author?.id),
  firstName: toText(author?.firstName),
  lastName: toText(author?.lastName),
  name: toText(author?.name),
  email: toText(author?.email),
  role: author?.role || "user",
  avatarUrl: author?.avatarUrl || "",
});

const serializeCommentFeedItem = (comment, project) => ({
  _id: toIdString(comment?._id),
  project: serializeProjectSummary(project),
  author: serializeCommentAuthor(comment?.author),
  content: toText(comment?.content),
  parentComment: toIdString(comment?.parentComment),
  readBy: toArray(comment?.readBy).map(toIdString).filter(Boolean),
  createdAt: comment?.createdAt || null,
  updatedAt: comment?.updatedAt || null,
  editedAt: comment?.editedAt || null,
  isReply: Boolean(comment?.parentComment),
});

const normalizeCommentFeedLimit = (value) => {
  const rawValue = String(value || "").trim().toLowerCase();
  if (rawValue === "all") return null;

  const parsed = Number.parseInt(rawValue || "300", 10);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(parsed, 1), 1000);
};

const normalizeMentionHandle = (value) =>
  toText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");

const buildBaseMentionHandle = (user) => {
  const fullName = `${toText(user?.firstName)} ${toText(user?.lastName)}`
    .trim()
    .replace(/\s+/g, " ");
  const emailLocalPart = toText(user?.email).split("@")[0] || "";
  return normalizeMentionHandle(
    fullName || toText(user?.name) || emailLocalPart || toText(user?.employeeId),
  );
};

const extractMentionHandles = (value) => {
  const content = toText(value);
  if (!content) return [];

  const handles = [];
  const seenHandles = new Set();
  const mentionPattern = /(^|[\s(])@([a-z0-9._-]{1,60})/gi;
  let match;

  while ((match = mentionPattern.exec(content)) !== null) {
    const handle = normalizeMentionHandle(match[2]);
    if (!handle || seenHandles.has(handle)) continue;
    seenHandles.add(handle);
    handles.push(handle);
  }

  return handles;
};

const buildMentionDirectory = (users = []) => {
  const entries = users
    .map((user) => ({
      user,
      baseHandle: buildBaseMentionHandle(user),
      userId: toIdString(user?._id || user?.id),
    }))
    .filter((entry) => entry.userId && entry.baseHandle);

  const baseCounts = entries.reduce((acc, entry) => {
    acc.set(entry.baseHandle, (acc.get(entry.baseHandle) || 0) + 1);
    return acc;
  }, new Map());
  const usedHandles = new Set();

  return entries
    .map((entry) => {
      let handle = entry.baseHandle;
      if ((baseCounts.get(entry.baseHandle) || 0) > 1) {
        handle = normalizeMentionHandle(
          `${entry.baseHandle}.${toText(entry.user?.employeeId) || entry.userId.slice(-5)}`,
        );
      }

      let collisionIndex = 2;
      while (usedHandles.has(handle)) {
        handle = normalizeMentionHandle(
          `${entry.baseHandle}.${entry.userId.slice(-6)}.${collisionIndex}`,
        );
        collisionIndex += 1;
      }

      usedHandles.add(handle);
      return {
        ...entry.user,
        handle,
      };
    })
    .filter((entry) => entry.handle);
};

const serializeMentionUser = (user) => ({
  _id: toIdString(user?._id || user?.id),
  firstName: toText(user?.firstName),
  lastName: toText(user?.lastName),
  name: toText(user?.name),
  email: toText(user?.email),
  role: user?.role || "user",
  department: toArray(user?.department),
  avatarUrl: user?.avatarUrl || "",
  handle: user?.handle || buildBaseMentionHandle(user),
});

const isFrontDeskUser = (user) =>
  toArray(user?.department)
    .map(canonicalizeDepartment)
    .includes("front-desk");

const hasDepartmentOverlap = (userDepartments, projectDepartments) => {
  const userTokens = new Set(
    toArray(userDepartments).map(canonicalizeDepartment).filter(Boolean),
  );
  if (userTokens.size === 0) return false;
  return toArray(projectDepartments)
    .map(canonicalizeDepartment)
    .filter(Boolean)
    .some((department) => userTokens.has(department));
};

const canAccessProjectComments = (user, project) => {
  if (!user || !project) return false;
  if (user.role === "admin") return true;
  if (isFrontDeskUser(user)) return true;

  const userId = toIdString(user._id || user.id);
  const stakeholderIds = new Set(
    [
      toIdString(project.createdBy),
      toIdString(project.projectLeadId),
      toIdString(project.assistantLeadId),
    ].filter(Boolean),
  );
  if (userId && stakeholderIds.has(userId)) return true;

  return hasDepartmentOverlap(user.department, project.departments);
};

const canManageComment = (user, comment) => {
  if (!user || !comment) return false;
  if (user.role === "admin") return true;
  return toIdString(user._id || user.id) === toIdString(comment.author);
};

const getProjectForComments = async (projectId) =>
  Project.findById(projectId).select(PROJECT_ACCESS_FIELDS);

const loadProjectCommentMentionUsers = async (project) => {
  const users = await User.find({})
    .select(MENTION_USER_FIELDS)
    .sort({ firstName: 1, lastName: 1, name: 1, createdAt: 1 })
    .lean();

  return buildMentionDirectory(
    users.filter((user) => canAccessProjectComments(user, project)),
  );
};

const resolveMentionedUsers = async ({
  project,
  content,
  excludedUserId = "",
}) => {
  const mentionHandles = extractMentionHandles(content);
  if (mentionHandles.length === 0) return [];

  const handleSet = new Set(mentionHandles);
  const users = await loadProjectCommentMentionUsers(project);
  const excludedId = toIdString(excludedUserId);
  const seenUserIds = new Set();

  return users.filter((user) => {
    const userId = toIdString(user?._id || user?.id);
    if (!userId || userId === excludedId || seenUserIds.has(userId)) {
      return false;
    }
    if (!handleSet.has(user.handle)) return false;

    seenUserIds.add(userId);
    return true;
  });
};

const normalizeCommentPayload = (comment) => {
  const payload = comment.toObject ? comment.toObject({ depopulate: false }) : comment;
  if (payload.isDeleted) {
    payload.content = "";
  }
  return payload;
};

const nestComments = (comments = []) => {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    const payload = normalizeCommentPayload(comment);
    payload.replies = [];
    byId.set(toIdString(payload._id), payload);
  });

  byId.forEach((comment) => {
    const parentId = toIdString(comment.parentComment);
    const parent = parentId ? byId.get(parentId) : null;
    if (parent) {
      parent.replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots;
};

const notifyProjectCommentRecipients = async ({
  project,
  actor,
  comment,
  parentComment = null,
  mentionedUsers = [],
  notifyAll = true,
}) => {
  try {
    const actorId = toIdString(actor?._id || actor?.id);
    const projectId = toIdString(project?._id);
    if (!actorId || !projectId) return;

    const users = await User.find({})
      .select("_id firstName lastName name email role department")
      .lean();
    const recipientIds = users
      .filter((user) => canAccessProjectComments(user, project))
      .map((user) => toIdString(user._id))
      .filter((id) => id && id !== actorId);

    const mentionedUserIds = Array.from(
      new Set(
        toArray(mentionedUsers)
          .map((user) => toIdString(user?._id || user?.id || user))
          .filter((id) => id && id !== actorId),
      ),
    );
    const mentionedUserIdSet = new Set(mentionedUserIds);
    const uniqueRecipientIds = notifyAll
      ? Array.from(new Set(recipientIds)).filter((id) => !mentionedUserIdSet.has(id))
      : [];

    const actorName = getUserDisplayName(actor);
    const projectRef = toText(project.orderId) || projectId.slice(-6).toUpperCase();
    const projectName = getProjectDisplayName(project);
    const isReply = Boolean(parentComment);
    const title = isReply ? "Project Comment Reply" : "Project Comment Added";
    const contentPreview = toText(comment?.content).slice(0, 160);
    const message = `${actorName} ${isReply ? "replied on" : "commented on"} project #${projectRef} (${projectName}): ${contentPreview}`;

    const notificationJobs = uniqueRecipientIds.map((recipientId) =>
      createNotification(
        recipientId,
        actorId,
        projectId,
        "UPDATE",
        title,
        message,
        { source: "project_comments" },
      ),
    );

    notificationJobs.push(
      ...mentionedUserIds.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "UPDATE",
          "You were mentioned in a project comment",
          `${actorName} mentioned you on project #${projectRef} (${projectName}): ${contentPreview}`,
          { source: `project_comment_mention:${toIdString(comment?._id)}` },
        ),
      ),
    );

    if (notificationJobs.length === 0) return;

    await Promise.all(notificationJobs);
  } catch (error) {
    console.error("Error notifying project comment recipients:", error);
  }
};

const getProjectComments = async (req, res) => {
  try {
    const project = await getProjectForComments(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!canAccessProjectComments(req.user, project)) {
      return res.status(403).json({
        message: "Not authorized to view comments for this project.",
      });
    }

    const comments = await ProjectComment.find({ project: project._id })
      .populate("author", AUTHOR_FIELDS)
      .populate("mentions", AUTHOR_FIELDS)
      .populate("deletedBy", AUTHOR_FIELDS)
      .sort({ createdAt: 1, _id: 1 });

    return res.json({
      comments: nestComments(comments),
      count: comments.filter((comment) => !comment.isDeleted).length,
    });
  } catch (error) {
    console.error("Error fetching project comments:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const getProjectCommentMentionUsers = async (req, res) => {
  try {
    const project = await getProjectForComments(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!canAccessProjectComments(req.user, project)) {
      return res.status(403).json({
        message: "Not authorized to view comment mentions for this project.",
      });
    }

    const users = await loadProjectCommentMentionUsers(project);
    return res.json({
      users: users.map(serializeMentionUser),
    });
  } catch (error) {
    console.error("Error fetching project comment mention users:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const getProjectCommentFeed = async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const projects = await Project.find({})
      .select(PROJECT_COMMENT_FEED_PROJECT_FIELDS)
      .lean();
    const accessibleProjects = projects.filter((project) =>
      canAccessProjectComments(req.user, project),
    );
    const projectById = new Map(
      accessibleProjects.map((project) => [toIdString(project._id), project]),
    );
    const projectIds = accessibleProjects.map((project) => project._id);

    if (projectIds.length === 0) {
      return res.json({ comments: [], count: 0 });
    }

    const filter = {
      project: { $in: projectIds },
      isDeleted: false,
      author: { $ne: currentUserId },
      readBy: { $ne: currentUserId },
    };
    const limit = normalizeCommentFeedLimit(req.query?.limit);
    const commentsQuery = ProjectComment.find(filter)
      .populate("author", AUTHOR_FIELDS)
      .sort({ createdAt: -1, _id: -1 });

    if (limit) {
      commentsQuery.limit(limit);
    }

    const [count, comments] = await Promise.all([
      ProjectComment.countDocuments(filter),
      commentsQuery,
    ]);

    return res.json({
      comments: comments
        .map((comment) =>
          serializeCommentFeedItem(
            comment,
            projectById.get(toIdString(comment.project)),
          ),
        )
        .filter((comment) => comment.project?._id && comment.content),
      count,
    });
  } catch (error) {
    console.error("Error fetching project comment feed:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const normalizeCommentIds = (value) =>
  toArray(value)
    .map(toIdString)
    .filter(Boolean);

const markProjectCommentsRead = async (req, res) => {
  try {
    const project = await getProjectForComments(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!canAccessProjectComments(req.user, project)) {
      return res.status(403).json({
        message: "Not authorized to read comments for this project.",
      });
    }

    const currentUserId = req.user?._id || req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const commentIds = normalizeCommentIds(req.body?.commentIds);
    const filter = {
      project: project._id,
      isDeleted: false,
      author: { $ne: currentUserId },
      readBy: { $ne: currentUserId },
    };

    if (commentIds.length > 0) {
      filter._id = { $in: commentIds };
    }

    const result = await ProjectComment.updateMany(filter, {
      $addToSet: { readBy: currentUserId },
    });

    return res.json({
      markedRead: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("Error marking project comments read:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const markProjectCommentRead = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    commentIds: [req.params.commentId],
  };
  return markProjectCommentsRead(req, res);
};

const createProjectComment = async (req, res) => {
  try {
    const project = await getProjectForComments(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!canAccessProjectComments(req.user, project)) {
      return res.status(403).json({
        message: "Not authorized to comment on this project.",
      });
    }

    const content = toText(req.body?.content);
    if (!content) {
      return res.status(400).json({ message: "Comment cannot be empty." });
    }
    if (content.length > 3000) {
      return res.status(400).json({
        message: "Comment is too long. Keep it under 3000 characters.",
      });
    }

    let parentComment = null;
    const requestedParentId = toIdString(
      req.body?.parentComment || req.body?.parentCommentId || req.body?.replyTo,
    );
    if (requestedParentId) {
      const requestedParent = await ProjectComment.findOne({
        _id: requestedParentId,
        project: project._id,
      });
      if (!requestedParent || requestedParent.isDeleted) {
        return res.status(400).json({ message: "Reply target was not found." });
      }
      parentComment = requestedParent.parentComment
        ? await ProjectComment.findById(requestedParent.parentComment)
        : requestedParent;
    }

    const mentionedUsers = await resolveMentionedUsers({
      project,
      content,
      excludedUserId: req.user._id || req.user.id,
    });

    const comment = await ProjectComment.create({
      project: project._id,
      parentComment: parentComment?._id || null,
      author: req.user._id || req.user.id,
      content,
      mentions: mentionedUsers.map((user) => user._id),
      readBy: [req.user._id || req.user.id],
    });

    await comment.populate("author", AUTHOR_FIELDS);
    await comment.populate("mentions", AUTHOR_FIELDS);

    await logActivity(
      project._id,
      req.user._id || req.user.id,
      "comment_post",
      parentComment ? "Replied to a project comment" : "Posted a project comment",
      {
        commentId: comment._id,
        parentCommentId: parentComment?._id || null,
      },
    );

    await notifyProjectCommentRecipients({
      project,
      actor: req.user,
      comment,
      parentComment,
      mentionedUsers,
    });

    return res.status(201).json(normalizeCommentPayload(comment));
  } catch (error) {
    console.error("Error creating project comment:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const updateProjectComment = async (req, res) => {
  try {
    const project = await getProjectForComments(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!canAccessProjectComments(req.user, project)) {
      return res.status(403).json({
        message: "Not authorized to update comments for this project.",
      });
    }

    const comment = await ProjectComment.findOne({
      _id: req.params.commentId,
      project: project._id,
    });
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (comment.isDeleted) {
      return res.status(400).json({ message: "Deleted comments cannot be edited." });
    }
    if (!canManageComment(req.user, comment)) {
      return res.status(403).json({
        message: "Only the comment author or an admin can edit this comment.",
      });
    }

    const content = toText(req.body?.content);
    if (!content) {
      return res.status(400).json({ message: "Comment cannot be empty." });
    }
    if (content.length > 3000) {
      return res.status(400).json({
        message: "Comment is too long. Keep it under 3000 characters.",
      });
    }

    const previousMentionIds = new Set(toArray(comment.mentions).map(toIdString));
    const mentionedUsers = await resolveMentionedUsers({
      project,
      content,
      excludedUserId: req.user._id || req.user.id,
    });
    const newlyMentionedUsers = mentionedUsers.filter(
      (user) => !previousMentionIds.has(toIdString(user?._id || user?.id)),
    );

    comment.content = content;
    comment.mentions = mentionedUsers.map((user) => user._id);
    comment.editedAt = new Date();
    await comment.save();
    await comment.populate("author", AUTHOR_FIELDS);
    await comment.populate("mentions", AUTHOR_FIELDS);

    await logActivity(
      project._id,
      req.user._id || req.user.id,
      "comment_update",
      "Edited a project comment",
      { commentId: comment._id },
    );

    if (newlyMentionedUsers.length > 0) {
      await notifyProjectCommentRecipients({
        project,
        actor: req.user,
        comment,
        mentionedUsers: newlyMentionedUsers,
        notifyAll: false,
      });
    }

    return res.json(normalizeCommentPayload(comment));
  } catch (error) {
    console.error("Error updating project comment:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const deleteProjectComment = async (req, res) => {
  try {
    const project = await getProjectForComments(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!canAccessProjectComments(req.user, project)) {
      return res.status(403).json({
        message: "Not authorized to delete comments for this project.",
      });
    }

    const comment = await ProjectComment.findOne({
      _id: req.params.commentId,
      project: project._id,
    });
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }
    if (!canManageComment(req.user, comment)) {
      return res.status(403).json({
        message: "Only the comment author or an admin can delete this comment.",
      });
    }

    comment.isDeleted = true;
    comment.content = "";
    comment.deletedAt = new Date();
    comment.deletedBy = req.user._id || req.user.id;
    await comment.save();

    await logActivity(
      project._id,
      req.user._id || req.user.id,
      "comment_delete",
      "Deleted a project comment",
      { commentId: comment._id },
    );

    return res.json({ message: "Comment deleted." });
  } catch (error) {
    console.error("Error deleting project comment:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getProjectCommentFeed,
  getProjectComments,
  getProjectCommentMentionUsers,
  markProjectCommentsRead,
  markProjectCommentRead,
  createProjectComment,
  updateProjectComment,
  deleteProjectComment,
};
