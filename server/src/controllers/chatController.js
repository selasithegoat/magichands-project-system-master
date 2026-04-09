const mongoose = require("mongoose");
const ChatThread = require("../models/ChatThread");
const ChatMessage = require("../models/ChatMessage");
const Project = require("../models/Project");
const User = require("../models/User");
const { broadcastChatChange } = require("../utils/realtimeHub");

const TEAM_ROOM_SLUG = "team-room";
const TEAM_ROOM_NAME = "Team Room";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_REFERENCE_COUNT = 3;
const DEFAULT_MESSAGE_LIMIT = 50;
const USER_SEARCH_LIMIT = 20;
const PROJECT_SEARCH_LIMIT = 12;

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value?.toHexString === "function") {
    return value.toHexString();
  }
  if (typeof value?.toString === "function") {
    const stringValue = value.toString();
    if (stringValue && stringValue !== "[object Object]") {
      return stringValue;
    }
  }
  if (typeof value === "object") {
    if (value._id) return toIdString(value._id);
    if (typeof value.id === "string" || typeof value.id === "number") {
      return String(value.id);
    }
    if (value.id && !Buffer.isBuffer(value.id)) {
      return toIdString(value.id);
    }
  }
  return "";
};

const toText = (value) => String(value || "").trim();

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLimit = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 100);
};

const parseReferencesInput = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildProjectDisplayName = (project) => {
  const name = toText(project?.details?.projectName || project?.projectName);
  const indicator = toText(
    project?.details?.projectIndicator || project?.projectIndicator,
  );

  if (name && indicator) {
    return `${name} - ${indicator}`;
  }
  return name || indicator || "Untitled Project";
};

const getUserDisplayName = (user) => {
  const fullName = `${toText(user?.firstName)} ${toText(user?.lastName)}`.trim();
  return fullName || toText(user?.name) || "Unknown User";
};

const serializeUserSummary = (user) => ({
  _id: toIdString(user?._id || user?.id),
  name: getUserDisplayName(user),
  firstName: toText(user?.firstName),
  lastName: toText(user?.lastName),
  avatarUrl: toText(user?.avatarUrl),
  role: toText(user?.role),
  department: Array.isArray(user?.department)
    ? user.department.map((entry) => toText(entry)).filter(Boolean)
    : [],
});

const serializeProjectReference = (reference) => ({
  type: "project",
  projectId: toIdString(reference?.project),
  orderId: toText(reference?.orderId),
  projectName: toText(reference?.projectName),
  projectIndicator: toText(reference?.projectIndicator),
  client: toText(reference?.client),
  status: toText(reference?.status),
});

const serializeMessage = (message, senderMap = {}) => {
  const senderId = toIdString(message?.sender?._id || message?.sender);
  const sender =
    senderMap[senderId] ||
    (message?.sender && typeof message.sender === "object"
      ? serializeUserSummary(message.sender)
      : null);

  return {
    _id: toIdString(message?._id),
    threadId: toIdString(message?.thread),
    body: toText(message?.body),
    sender,
    references: Array.isArray(message?.references)
      ? message.references.map((entry) => serializeProjectReference(entry))
      : [],
    createdAt: message?.createdAt || null,
    updatedAt: message?.updatedAt || null,
  };
};

const hasThreadAccess = (thread, userId) => {
  if (!thread || !userId) return false;
  if (thread.type === "public") return true;
  const participants = Array.isArray(thread.participants) ? thread.participants : [];
  return participants.some((entry) => toIdString(entry) === userId);
};

const getLastReadAt = (thread, userId) => {
  const readState = Array.isArray(thread?.readState) ? thread.readState : [];
  return (
    readState.find((entry) => toIdString(entry?.user) === userId)?.lastReadAt ||
    null
  );
};

const upsertThreadReadState = (thread, userId, lastReadAt = new Date()) => {
  if (!thread || !userId) return;
  const nextReadAt = lastReadAt instanceof Date ? lastReadAt : new Date(lastReadAt);
  const readState = Array.isArray(thread.readState) ? [...thread.readState] : [];
  const index = readState.findIndex((entry) => toIdString(entry?.user) === userId);

  if (index >= 0) {
    readState[index] = {
      ...readState[index].toObject?.(),
      user: readState[index].user,
      lastReadAt: nextReadAt,
    };
  } else {
    readState.push({
      user: new mongoose.Types.ObjectId(userId),
      lastReadAt: nextReadAt,
    });
  }

  thread.readState = readState;
  thread.markModified("readState");
};

const buildDirectKey = (userA, userB) =>
  [toIdString(userA), toIdString(userB)].filter(Boolean).sort().join(":");

const buildMessagePreview = (body, references = []) => {
  const trimmedBody = toText(body);
  if (trimmedBody) {
    return trimmedBody.length > 160 ? `${trimmedBody.slice(0, 157)}...` : trimmedBody;
  }

  const firstReference = Array.isArray(references) ? references[0] : null;
  if (firstReference?.orderId) {
    return `Shared project #${firstReference.orderId}`;
  }
  if (firstReference?.projectName) {
    return `Shared ${firstReference.projectName}`;
  }
  return "Shared a project";
};

const ensureTeamRoom = async (actorId) => {
  let room = await ChatThread.findOne({ slug: TEAM_ROOM_SLUG });
  if (room) return room;

  try {
    room = await ChatThread.create({
      type: "public",
      name: TEAM_ROOM_NAME,
      slug: TEAM_ROOM_SLUG,
      createdBy: actorId,
      readState: actorId
        ? [{ user: actorId, lastReadAt: new Date() }]
        : [],
    });
    return room;
  } catch (error) {
    if (error?.code === 11000) {
      return ChatThread.findOne({ slug: TEAM_ROOM_SLUG });
    }
    throw error;
  }
};

const loadUsersById = async (userIds = []) => {
  const dedupedIds = Array.from(
    new Set(userIds.map((entry) => toIdString(entry)).filter(Boolean)),
  );

  if (dedupedIds.length === 0) {
    return {};
  }

  const users = await User.find({ _id: { $in: dedupedIds } })
    .select("_id firstName lastName name avatarUrl role department")
    .lean();

  return users.reduce((acc, user) => {
    acc[toIdString(user._id)] = serializeUserSummary(user);
    return acc;
  }, {});
};

const countUnreadMessages = async (threadId, userId, lastReadAt) => {
  if (
    !mongoose.Types.ObjectId.isValid(threadId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    return 0;
  }

  const query = {
    thread: threadId,
    sender: { $ne: new mongoose.Types.ObjectId(userId) },
  };

  if (lastReadAt) {
    query.createdAt = { $gt: lastReadAt };
  }

  return ChatMessage.countDocuments(query);
};

const serializeThreadSummary = async (thread, currentUserId, userMap = {}) => {
  const participantIds = Array.isArray(thread?.participants)
    ? thread.participants.map((entry) => toIdString(entry)).filter(Boolean)
    : [];
  const counterpartId =
    thread?.type === "direct"
      ? participantIds.find((entry) => entry !== currentUserId) || currentUserId
      : "";
  const counterpart = counterpartId ? userMap[counterpartId] || null : null;
  const lastMessageSenderId = toIdString(thread?.lastMessageSender);
  const lastReadAt = getLastReadAt(thread, currentUserId);
  const unreadCount = await countUnreadMessages(thread._id, currentUserId, lastReadAt);

  return {
    _id: toIdString(thread?._id),
    type: toText(thread?.type),
    name:
      thread?.type === "public"
        ? toText(thread?.name) || TEAM_ROOM_NAME
        : counterpart?.name || "Direct Message",
    slug: toText(thread?.slug),
    counterpart,
    participants: participantIds
      .map((entry) => userMap[entry])
      .filter(Boolean),
    lastMessagePreview: toText(thread?.lastMessagePreview),
    lastMessageAt: thread?.lastMessageAt || thread?.updatedAt || thread?.createdAt || null,
    lastMessageSender: lastMessageSenderId ? userMap[lastMessageSenderId] || null : null,
    unreadCount,
  };
};

const getThreads = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    if (!currentUserId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await ensureTeamRoom(req.user._id);

    const threads = await ChatThread.find({
      $or: [{ type: "public" }, { participants: req.user._id }],
    })
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    const userIds = [];
    threads.forEach((thread) => {
      if (Array.isArray(thread.participants)) {
        userIds.push(...thread.participants);
      }
      if (thread.lastMessageSender) {
        userIds.push(thread.lastMessageSender);
      }
    });

    const userMap = await loadUsersById(userIds);
    const serializedThreads = await Promise.all(
      threads.map((thread) =>
        serializeThreadSummary(thread, currentUserId, userMap),
      ),
    );

    const unreadCount = serializedThreads.reduce(
      (sum, thread) => sum + (Number(thread.unreadCount) || 0),
      0,
    );

    return res.json({
      threads: serializedThreads,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching chat threads:", error);
    return res.status(500).json({ message: "Server error fetching chat threads." });
  }
};

const getThreadMessages = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ message: "Invalid chat thread." });
    }

    const thread = await ChatThread.findById(threadId).lean();
    if (!thread || !hasThreadAccess(thread, currentUserId)) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    const limit = normalizeLimit(req.query?.limit, DEFAULT_MESSAGE_LIMIT);
    const messages = await ChatMessage.find({ thread: threadId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "_id firstName lastName name avatarUrl role department")
      .lean();

    const userIds = [
      ...new Set(
        messages.map((message) => toIdString(message?.sender?._id || message?.sender)).filter(Boolean),
      ),
    ];
    const userMap = await loadUsersById(userIds);
    const participantUserMap = await loadUsersById([
      ...(Array.isArray(thread.participants) ? thread.participants : []),
      thread.lastMessageSender,
    ]);

    const serializedThread = await serializeThreadSummary(
      thread,
      currentUserId,
      participantUserMap,
    );
    const serializedMessages = messages
      .reverse()
      .map((message) => serializeMessage(message, userMap));

    return res.json({
      thread: serializedThread,
      messages: serializedMessages,
    });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return res.status(500).json({ message: "Server error fetching chat messages." });
  }
};

const startDirectThread = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const recipientId = toIdString(req.body?.recipientId);

    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ message: "Please choose a valid teammate." });
    }
    if (recipientId === currentUserId) {
      return res.status(400).json({ message: "You cannot message yourself." });
    }

    const recipient = await User.findById(recipientId)
      .select("_id firstName lastName name avatarUrl role department")
      .lean();
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found." });
    }

    const directKey = buildDirectKey(currentUserId, recipientId);
    let thread = await ChatThread.findOne({ directKey });

    if (!thread) {
      try {
        thread = await ChatThread.create({
          type: "direct",
          directKey,
          participants: [
            new mongoose.Types.ObjectId(currentUserId),
            new mongoose.Types.ObjectId(recipientId),
          ],
          createdBy: req.user._id,
          readState: [{ user: req.user._id, lastReadAt: new Date() }],
        });
      } catch (error) {
        if (error?.code === 11000) {
          thread = await ChatThread.findOne({ directKey });
        } else {
          throw error;
        }
      }
    }

    const userMap = await loadUsersById([req.user._id, recipient._id]);
    const serializedThread = await serializeThreadSummary(
      thread.toObject ? thread.toObject() : thread,
      currentUserId,
      userMap,
    );

    return res.status(201).json({ thread: serializedThread });
  } catch (error) {
    console.error("Error starting direct chat:", error);
    return res.status(500).json({ message: "Server error creating direct chat." });
  }
};

const sendMessage = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ message: "Invalid chat thread." });
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread || !hasThreadAccess(thread, currentUserId)) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    const body = toText(req.body?.body).slice(0, MAX_MESSAGE_LENGTH);
    const rawReferences = parseReferencesInput(req.body?.references);

    const requestedProjectIds = rawReferences
      .slice(0, MAX_REFERENCE_COUNT)
      .map((entry) => toIdString(entry?.projectId || entry?.project))
      .filter((entry) => mongoose.Types.ObjectId.isValid(entry));

    const projects =
      requestedProjectIds.length > 0
        ? await Project.find({ _id: { $in: requestedProjectIds } })
            .select(
              "_id orderId status details.projectName details.projectIndicator details.client",
            )
            .lean()
        : [];

    const projectMap = projects.reduce((acc, project) => {
      acc[toIdString(project._id)] = project;
      return acc;
    }, {});

    const references = requestedProjectIds
      .map((projectId) => projectMap[projectId])
      .filter(Boolean)
      .map((project) => ({
        type: "project",
        project: project._id,
        orderId: toText(project.orderId),
        projectName: toText(project?.details?.projectName),
        projectIndicator: toText(project?.details?.projectIndicator),
        client: toText(project?.details?.client),
        status: toText(project?.status),
      }));

    if (!body && references.length === 0) {
      return res
        .status(400)
        .json({ message: "Add a message or attach a project reference." });
    }

    const message = await ChatMessage.create({
      thread: thread._id,
      sender: req.user._id,
      body,
      references,
    });

    upsertThreadReadState(thread, currentUserId, message.createdAt || new Date());
    thread.lastMessageAt = message.createdAt || new Date();
    thread.lastMessagePreview = buildMessagePreview(body, references);
    thread.lastMessageSender = req.user._id;
    await thread.save();

    const senderSummary = serializeUserSummary(req.user);
    const serializedMessage = serializeMessage(
      {
        ...message.toObject(),
        sender: req.user,
      },
      { [senderSummary._id]: senderSummary },
    );

    const participantIds = Array.isArray(thread.participants)
      ? thread.participants.map((entry) => toIdString(entry)).filter(Boolean)
      : [];
    const targetUserIds =
      thread.type === "public" ? [] : Array.from(new Set(participantIds));

    broadcastChatChange(
      {
        threadId: toIdString(thread._id),
        threadType: thread.type,
        messageId: toIdString(message._id),
        senderId: currentUserId,
      },
      {
        userIds: targetUserIds,
        broadcast: thread.type === "public",
      },
    );

    return res.status(201).json({ message: serializedMessage });
  } catch (error) {
    console.error("Error sending chat message:", error);
    return res.status(500).json({ message: "Server error sending message." });
  }
};

const markThreadRead = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ message: "Invalid chat thread." });
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread || !hasThreadAccess(thread, currentUserId)) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    upsertThreadReadState(thread, currentUserId, new Date());
    await thread.save();

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error marking chat thread as read:", error);
    return res.status(500).json({ message: "Server error updating chat read state." });
  }
};

const searchUsers = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const queryText = toText(req.query?.q);
    const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
    const filter = {
      _id: { $ne: req.user._id },
    };

    if (regex) {
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { employeeId: regex },
        { email: regex },
      ];
    }

    const users = await User.find(filter)
      .select("_id firstName lastName name avatarUrl role department")
      .sort({ firstName: 1, lastName: 1, createdAt: 1 })
      .limit(USER_SEARCH_LIMIT)
      .lean();

    const serializedUsers = users
      .map((user) => serializeUserSummary(user))
      .filter((user) => user._id !== currentUserId);

    return res.json({ users: serializedUsers });
  } catch (error) {
    console.error("Error searching chat users:", error);
    return res.status(500).json({ message: "Server error searching teammates." });
  }
};

const searchProjects = async (req, res) => {
  try {
    const queryText = toText(req.query?.q);
    const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
    const filter = regex
      ? {
          $or: [
            { orderId: regex },
            { "details.projectName": regex },
            { "details.projectIndicator": regex },
            { "details.client": regex },
          ],
        }
      : {};

    const projects = await Project.find(filter)
      .select(
        "_id orderId status details.projectName details.projectIndicator details.client",
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(PROJECT_SEARCH_LIMIT)
      .lean();

    const serializedProjects = projects.map((project) => ({
      _id: toIdString(project._id),
      orderId: toText(project.orderId),
      projectName: toText(project?.details?.projectName),
      projectIndicator: toText(project?.details?.projectIndicator),
      client: toText(project?.details?.client),
      status: toText(project?.status),
      displayName: buildProjectDisplayName(project),
    }));

    return res.json({ projects: serializedProjects });
  } catch (error) {
    console.error("Error searching chat projects:", error);
    return res.status(500).json({ message: "Server error searching projects." });
  }
};

module.exports = {
  getThreads,
  getThreadMessages,
  startDirectThread,
  sendMessage,
  markThreadRead,
  searchUsers,
  searchProjects,
};
