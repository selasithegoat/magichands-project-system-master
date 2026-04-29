const fs = require("fs");
const mongoose = require("mongoose");
const ChatThread = require("../models/ChatThread");
const ChatMessage = require("../models/ChatMessage");
const Project = require("../models/Project");
const User = require("../models/User");
const upload = require("../middleware/upload");
const {
  CHAT_ARCHIVE_AFTER_DAYS,
  countArchivedMessages,
  getArchivedMessages,
  getLatestArchivedMessage,
  maybeArchiveThreadMessages,
  removeChatAttachmentIndexEntries,
  toMessageShapeFromArchiveRecord,
  upsertChatAttachmentIndexEntries,
} = require("../services/chatArchiveService");
const {
  broadcastChatChange,
  broadcastChatTyping,
} = require("../utils/realtimeHub");
const {
  startTypingSession,
  stopTypingSession,
} = require("../utils/chatTypingService");
const { createNotification } = require("../utils/notificationService");
const { resolvePresenceMap } = require("../utils/presenceService");

const TEAM_ROOM_SLUG = "team-room";
const TEAM_ROOM_NAME = "Team Room";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_REFERENCE_COUNT = 3;
const MAX_ATTACHMENT_COUNT = 6;
const DEFAULT_MESSAGE_LIMIT = 50;
const USER_SEARCH_LIMIT = 20;
const MAX_USER_SEARCH_LIMIT = 500;
const PROJECT_SEARCH_LIMIT = 12;
const DELETED_MESSAGE_BODY = "message was deleted.";
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const CHAT_ARCHIVE_WINDOW_MS = CHAT_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
const CHAT_MENTION_NOTIFICATION_SOURCE_PREFIX = "chat_mention";
const CHAT_MENTION_NOTIFICATION_PREVIEW_LENGTH = 160;
const CHAT_TYPING_IDLE_MS = 4200;
const CHAT_REACTION_EMOJIS = [
  "\u{1f44d}",
  "\u2764\ufe0f",
  "\u{1f602}",
  "\u{1f62e}",
  "\u{1f622}",
  "\u{1f389}",
  "\u{1f525}",
  "\u2705",
];
const CHAT_REACTION_MAX_LENGTH = 64;
const CHAT_REACTION_EMOJI_ORDER = new Map(
  CHAT_REACTION_EMOJIS.map((emoji, index) => [
    emoji.replace(/\ufe0f/g, ""),
    index,
  ]),
);
const CHAT_REACTION_BLOCKED_TEXT_REGEX = /[\p{Control}\p{White_Space}]/u;
const CHAT_REACTION_EMOJI_SIGNAL_REGEX =
  /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|[#*0-9]\ufe0f?\u20e3/u;
const PRODUCTION_SUB_DEPARTMENTS = new Set([
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
]);
const GRAPHICS_SUB_DEPARTMENTS = new Set(["graphics"]);
const STORES_SUB_DEPARTMENTS = new Set(["stock", "packaging"]);
const PHOTOGRAPHY_SUB_DEPARTMENTS = new Set(["photography"]);

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

const toDepartmentArray = (value) =>
  Array.isArray(value) ? value : value ? [value] : [];

const normalizeDepartmentValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized.replace(/\s+/g, "-") === "outside-production"
    ? "local-outsourcing"
    : normalized;
};

const normalizePortalSource = (value) => {
  const normalized = toText(value).toLowerCase();
  return normalized === "admin" ? "admin" : "";
};

const getRequestPortalSource = (req) =>
  normalizePortalSource(req?.query?.source || req?.body?.source);

const isFrontDeskUser = (user) =>
  toDepartmentArray(user?.department)
    .map((entry) => normalizeDepartmentValue(entry))
    .includes("front desk");

const resolveEngagedRouteDepartments = (departments = []) => {
  const normalizedDepartments = toDepartmentArray(departments)
    .map((entry) => normalizeDepartmentValue(entry))
    .filter(Boolean);

  const hasProductionParent = normalizedDepartments.includes("production");
  const hasGraphicsParent = normalizedDepartments.includes("graphics/design");
  const hasStoresParent = normalizedDepartments.includes("stores");
  const hasPhotographyParent = normalizedDepartments.includes("photography");
  const productionSubDepartments = hasProductionParent
    ? Array.from(PRODUCTION_SUB_DEPARTMENTS)
    : normalizedDepartments.filter((entry) => PRODUCTION_SUB_DEPARTMENTS.has(entry));
  const hasGraphics =
    hasGraphicsParent ||
    normalizedDepartments.some((entry) => GRAPHICS_SUB_DEPARTMENTS.has(entry));
  const hasStores =
    hasStoresParent ||
    normalizedDepartments.some((entry) => STORES_SUB_DEPARTMENTS.has(entry));
  const hasPhotography =
    hasPhotographyParent ||
    normalizedDepartments.some((entry) =>
      PHOTOGRAPHY_SUB_DEPARTMENTS.has(entry),
    );

  const routeDepartments = [...productionSubDepartments];
  if (hasGraphics) {
    routeDepartments.push(...GRAPHICS_SUB_DEPARTMENTS);
  }
  if (hasStores) {
    routeDepartments.push(...STORES_SUB_DEPARTMENTS);
  }
  if (hasPhotography) {
    routeDepartments.push(...PHOTOGRAPHY_SUB_DEPARTMENTS);
  }

  return Array.from(new Set(routeDepartments));
};

const hasEngagedDepartmentOverlap = (user, projectDepartments = []) => {
  const routeDepartments = new Set(resolveEngagedRouteDepartments(user?.department));
  if (routeDepartments.size === 0) return false;

  return toDepartmentArray(projectDepartments)
    .map((entry) => normalizeDepartmentValue(entry))
    .some((entry) => routeDepartments.has(entry));
};

const isProjectDetailUser = (user, project) => {
  const currentUserId = toIdString(user?._id || user?.id);
  const projectLeadId = toIdString(project?.projectLeadId?._id || project?.projectLeadId);
  const assistantLeadId = toIdString(
    project?.assistantLeadId?._id || project?.assistantLeadId,
  );
  return Boolean(
    currentUserId &&
      ((projectLeadId && currentUserId === projectLeadId) ||
        (assistantLeadId && currentUserId === assistantLeadId)),
  );
};

const buildProjectRouteOptions = (user, project, { source = "" } = {}) => {
  const projectId = toIdString(project?._id);
  if (!projectId) return [];

  const routes = [];
  const portalSource = normalizePortalSource(source);

  if (portalSource === "admin" && user?.role === "admin") {
    routes.push({
      key: "admin-detail",
      label: "Admin Project",
      path: `/projects/${projectId}`,
    });
  } else if (isProjectDetailUser(user, project)) {
    routes.push({
      key: "detail",
      label: "Lead Project",
      path: `/detail/${projectId}`,
    });
  }

  if (hasEngagedDepartmentOverlap(user, project?.departments)) {
    routes.push({
      key: "engaged",
      label: "Department",
      path: `/engaged-projects/actions/${projectId}`,
    });
  }

  if (isFrontDeskUser(user)) {
    routes.push({
      key: "frontdesk",
      label: "Front Desk",
      path: `/new-orders/actions/${projectId}`,
    });
  }

  return routes;
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLimit = (value, fallback, max = 100) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
};

const normalizeMentionHandle = (value) =>
  toText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");

const buildMentionHandle = (user) =>
  normalizeMentionHandle(
    `${toText(user?.firstName)} ${toText(user?.lastName)}`.trim() ||
      toText(user?.name),
  );

const extractMentionHandles = (value) => {
  const content = toText(value);
  if (!content) return [];

  const handles = [];
  const seenHandles = new Set();
  const mentionPattern = /(^|[\s(])@([a-z0-9._-]{1,40})/gi;
  let match;

  while ((match = mentionPattern.exec(content)) !== null) {
    const handle = normalizeMentionHandle(match[2]);
    if (!handle || seenHandles.has(handle)) {
      continue;
    }

    seenHandles.add(handle);
    handles.push(handle);
  }

  return handles;
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

const parseReplyInput = (value) => {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const resolveAttachmentName = (attachment) => {
  const explicitName = toText(attachment?.fileName || attachment?.name);
  if (explicitName) return explicitName;

  const fileUrl = toText(attachment?.fileUrl || attachment?.url);
  if (!fileUrl) return "";

  const rawName = fileUrl.split("?")[0].split("/").pop() || fileUrl;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const getAttachmentKind = (attachment) => {
  const mimeType = toText(attachment?.fileType || attachment?.type).toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";

  const fileName = resolveAttachmentName(attachment).toLowerCase();
  if (/\.(jpg|jpeg|png|webp|bmp|svg)$/i.test(fileName)) return "image";
  if (/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(fileName)) return "audio";
  if (/\.(mp4|mov|avi|mkv|m4v|webm)$/i.test(fileName)) return "video";
  return "file";
};

const serializeAttachment = (attachment) => ({
  fileUrl: toText(attachment?.fileUrl || attachment?.url),
  fileName: resolveAttachmentName(attachment),
  fileType: toText(attachment?.fileType || attachment?.type),
  uploadedAt: attachment?.uploadedAt || null,
});

const mapChatAttachments = (req, userId) => {
  const files = Array.isArray(req.files) ? req.files : [];
  return files
    .filter((file) => file?.filename)
    .slice(0, MAX_ATTACHMENT_COUNT)
    .map((file) => ({
      fileUrl: `/uploads/${file.filename}`,
      fileName: file.originalname || "",
      fileType: file.mimetype || "",
      uploadedBy: userId || undefined,
      uploadedAt: new Date(),
    }));
};

const cleanupUploadedFilesSafely = async (req) => {
  try {
    await upload.cleanupRequestFiles(req);
  } catch (cleanupError) {
    console.error("Failed to clean up chat uploads:", cleanupError);
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

const getChatThreadDisplayName = (thread) =>
  toText(thread?.name) ||
  (toText(thread?.slug) === TEAM_ROOM_SLUG ? TEAM_ROOM_NAME : "Public chat");

const getUserDisplayName = (user) => {
  const fullName = `${toText(user?.firstName)} ${toText(user?.lastName)}`.trim();
  return fullName || toText(user?.name) || "Unknown User";
};

const buildChatMentionNotificationTitle = (thread) =>
  `You were mentioned in ${getChatThreadDisplayName(thread)}`;

const buildChatMentionNotificationMessage = (thread, sender, body) => {
  const senderName = getUserDisplayName(sender);
  const threadName = getChatThreadDisplayName(thread);
  const compactBody = toText(body).replace(/\s+/g, " ");

  if (!compactBody) {
    return `${senderName} mentioned you in ${threadName}.`;
  }

  const preview =
    compactBody.length > CHAT_MENTION_NOTIFICATION_PREVIEW_LENGTH
      ? `${compactBody.slice(0, CHAT_MENTION_NOTIFICATION_PREVIEW_LENGTH - 3)}...`
      : compactBody;

  return `${senderName} mentioned you in ${threadName}: "${preview}"`;
};

const serializeUserSummary = (user, presenceMap = {}) => {
  const userId = toIdString(user?._id || user?.id);
  const presence = presenceMap[userId] || {
    isOnline: false,
    lastOnlineAt: null,
  };

  return {
    _id: userId,
    name: getUserDisplayName(user),
    firstName: toText(user?.firstName),
    lastName: toText(user?.lastName),
    avatarUrl: toText(user?.avatarUrl),
    role: toText(user?.role),
    department: Array.isArray(user?.department)
      ? user.department.map((entry) => toText(entry)).filter(Boolean)
      : [],
    presence: {
      isOnline: Boolean(presence?.isOnline),
      lastOnlineAt: presence?.isOnline ? null : presence?.lastOnlineAt || null,
    },
  };
};

const serializeMessageSenderSummary = (user) => ({
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

const serializeReplyTo = (replyTo) => {
  if (!replyTo) return null;

  const preview = toText(replyTo?.preview);
  const senderName = toText(replyTo?.senderName);
  const messageId = toIdString(replyTo?.messageId);
  const senderId = toIdString(replyTo?.senderId);

  if (!preview && !senderName && !messageId) {
    return null;
  }

  return {
    messageId,
    senderId,
    senderName,
    preview,
  };
};

const getGraphemeSegments = (value) => {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value),
      (entry) => entry.segment,
    );
  }

  return Array.from(value);
};

const normalizeReactionEmoji = (value) => {
  const emoji = toText(value).normalize("NFC");
  if (
    !emoji ||
    emoji.length > CHAT_REACTION_MAX_LENGTH ||
    CHAT_REACTION_BLOCKED_TEXT_REGEX.test(emoji) ||
    !CHAT_REACTION_EMOJI_SIGNAL_REGEX.test(emoji)
  ) {
    return "";
  }

  return getGraphemeSegments(emoji).length === 1 ? emoji : "";
};

const getReactionSortIndex = (emoji) => {
  const sortKey = toText(emoji).replace(/\ufe0f/g, "");
  return CHAT_REACTION_EMOJI_ORDER.has(sortKey)
    ? CHAT_REACTION_EMOJI_ORDER.get(sortKey)
    : Number.MAX_SAFE_INTEGER;
};

const serializeReactions = (reactions = []) =>
  (Array.isArray(reactions) ? reactions : [])
    .map((entry) => {
      const emoji = normalizeReactionEmoji(entry?.emoji);
      const userIds = Array.from(
        new Set(
          (Array.isArray(entry?.users) ? entry.users : [])
            .map((userId) => toIdString(userId))
            .filter(Boolean),
        ),
      );

      if (!emoji || userIds.length === 0) {
        return null;
      }

      return {
        emoji,
        userIds,
        count: userIds.length,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      const leftSortIndex = getReactionSortIndex(left.emoji);
      const rightSortIndex = getReactionSortIndex(right.emoji);
      if (leftSortIndex !== rightSortIndex) {
        return leftSortIndex - rightSortIndex;
      }
      return left.emoji.localeCompare(right.emoji);
    });

const applyReactionToggleToMessage = (message, actorId, emoji) => {
  const normalizedEmoji = normalizeReactionEmoji(emoji);
  const normalizedActorId = toIdString(actorId);
  if (!message || !normalizedEmoji || !normalizedActorId) {
    return false;
  }

  const reactionEntries = Array.isArray(message.reactions)
    ? message.reactions.map((entry) =>
        entry?.toObject ? entry.toObject() : entry,
      )
    : [];
  const existingReactionIndex = reactionEntries.findIndex(
    (entry) => normalizeReactionEmoji(entry?.emoji) === normalizedEmoji,
  );

  if (existingReactionIndex >= 0) {
    const nextUsers = Array.from(
      new Set(
        (Array.isArray(reactionEntries[existingReactionIndex]?.users)
          ? reactionEntries[existingReactionIndex].users
          : []
        )
          .map((userId) => toIdString(userId))
          .filter(Boolean),
      ),
    );
    const alreadyReacted = nextUsers.includes(normalizedActorId);

    reactionEntries[existingReactionIndex] = {
      ...reactionEntries[existingReactionIndex],
      emoji: normalizedEmoji,
      users: alreadyReacted
        ? nextUsers.filter((userId) => userId !== normalizedActorId)
        : [...nextUsers, normalizedActorId],
    };
  } else {
    reactionEntries.push({
      emoji: normalizedEmoji,
      users: [normalizedActorId],
    });
  }

  message.reactions = reactionEntries.filter(
    (entry) =>
      normalizeReactionEmoji(entry?.emoji) &&
      Array.isArray(entry?.users) &&
      entry.users.length > 0,
  );
  message.markModified("reactions");
  return true;
};

const serializeMessage = (message, senderMap = {}) => {
  const senderId = toIdString(message?.sender?._id || message?.sender);
  const sender =
    senderMap[senderId] ||
    (message?.sender && typeof message.sender === "object"
      ? serializeMessageSenderSummary(message.sender)
      : null);

  return {
    _id: toIdString(message?._id),
    threadId: toIdString(message?.thread),
    body: toText(message?.body),
    sender,
    references: Array.isArray(message?.references)
      ? message.references.map((entry) => serializeProjectReference(entry))
      : [],
    attachments: Array.isArray(message?.attachments)
      ? message.attachments.map((entry) => serializeAttachment(entry))
      : [],
    replyTo: serializeReplyTo(message?.replyTo),
    reactions: serializeReactions(message?.reactions),
    isDeleted: Boolean(message?.isDeleted),
    deletedAt: message?.deletedAt || null,
    editedAt: message?.editedAt || null,
    isArchived: Boolean(message?.isArchived),
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

const getThreadParticipantIds = (thread) =>
  Array.isArray(thread?.participants)
    ? thread.participants.map((entry) => toIdString(entry)).filter(Boolean)
    : [];

const getLastReadAt = (thread, userId) => {
  const readState = Array.isArray(thread?.readState) ? thread.readState : [];
  return (
    readState.find((entry) => toIdString(entry?.user) === userId)?.lastReadAt ||
    null
  );
};

const getClearedAt = (thread, userId) => {
  const clearedState = Array.isArray(thread?.clearedState) ? thread.clearedState : [];
  return (
    clearedState.find((entry) => toIdString(entry?.user) === userId)?.clearedAt ||
    null
  );
};

const getUnreadStateEntry = (thread, userId) => {
  const unreadState = Array.isArray(thread?.unreadState) ? thread.unreadState : [];
  return unreadState.find((entry) => toIdString(entry?.user) === userId) || null;
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

const upsertThreadClearedState = (thread, userId, clearedAt = new Date()) => {
  if (!thread || !userId) return;
  const nextClearedAt =
    clearedAt instanceof Date ? clearedAt : new Date(clearedAt);
  const clearedState = Array.isArray(thread.clearedState)
    ? [...thread.clearedState]
    : [];
  const index = clearedState.findIndex(
    (entry) => toIdString(entry?.user) === userId,
  );

  if (index >= 0) {
    clearedState[index] = {
      ...clearedState[index].toObject?.(),
      user: clearedState[index].user,
      clearedAt: nextClearedAt,
    };
  } else {
    clearedState.push({
      user: new mongoose.Types.ObjectId(userId),
      clearedAt: nextClearedAt,
    });
  }

  thread.clearedState = clearedState;
  thread.markModified("clearedState");
};

const upsertThreadUnreadState = (
  thread,
  userId,
  count = 0,
  lastUnreadAt = null,
) => {
  if (!thread || !userId) return;

  const unreadState = Array.isArray(thread.unreadState) ? [...thread.unreadState] : [];
  const index = unreadState.findIndex((entry) => toIdString(entry?.user) === userId);
  const normalizedCount = Math.max(0, Number(count) || 0);
  const normalizedLastUnreadAt = normalizedCount > 0 ? toDateValue(lastUnreadAt) : null;

  if (index >= 0) {
    unreadState[index] = {
      ...unreadState[index].toObject?.(),
      user: unreadState[index].user,
      count: normalizedCount,
      lastUnreadAt: normalizedLastUnreadAt,
    };
  } else {
    unreadState.push({
      user: new mongoose.Types.ObjectId(userId),
      count: normalizedCount,
      lastUnreadAt: normalizedLastUnreadAt,
    });
  }

  thread.unreadState = unreadState;
  thread.markModified("unreadState");
};

const incrementDirectThreadUnreadState = (
  thread,
  senderId,
  createdAt = new Date(),
) => {
  const participantIds = Array.isArray(thread?.participants)
    ? thread.participants.map((entry) => toIdString(entry)).filter(Boolean)
    : [];

  participantIds.forEach((participantId) => {
    if (participantId === senderId) {
      upsertThreadUnreadState(thread, participantId, 0, null);
      return;
    }

    const currentEntry = getUnreadStateEntry(thread, participantId);
    upsertThreadUnreadState(
      thread,
      participantId,
      (Number(currentEntry?.count) || 0) + 1,
      createdAt,
    );
  });
};

const setThreadUnreadStateForUser = async (
  threadId,
  userId,
  count = 0,
  lastUnreadAt = null,
) => {
  const normalizedThreadId = toIdString(threadId);
  const normalizedUserId = toIdString(userId);
  if (
    !mongoose.Types.ObjectId.isValid(normalizedThreadId) ||
    !mongoose.Types.ObjectId.isValid(normalizedUserId)
  ) {
    return;
  }

  const nextCount = Math.max(0, Number(count) || 0);
  const nextLastUnreadAt = nextCount > 0 ? toDateValue(lastUnreadAt) : null;
  const threadObjectId = new mongoose.Types.ObjectId(normalizedThreadId);
  const userObjectId = new mongoose.Types.ObjectId(normalizedUserId);

  const updateExistingResult = await ChatThread.updateOne(
    {
      _id: threadObjectId,
      "unreadState.user": userObjectId,
    },
    {
      $set: {
        "unreadState.$.count": nextCount,
        "unreadState.$.lastUnreadAt": nextLastUnreadAt,
      },
    },
  );

  if (updateExistingResult.matchedCount === 0) {
    await ChatThread.updateOne(
      {
        _id: threadObjectId,
        "unreadState.user": { $ne: userObjectId },
      },
      {
        $push: {
          unreadState: {
            user: userObjectId,
            count: nextCount,
            lastUnreadAt: nextLastUnreadAt,
          },
        },
      },
    );
  }
};

const toDateValue = (value) => {
  if (!value) return null;
  const nextDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
};

const getLatestDate = (...values) =>
  values
    .map((value) => toDateValue(value))
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

const compareMessagesByCreatedAtDesc = (left, right) => {
  const leftTime = toDateValue(left?.createdAt)?.getTime() || 0;
  const rightTime = toDateValue(right?.createdAt)?.getTime() || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return toIdString(right?._id).localeCompare(toIdString(left?._id));
};

const mergeMessagesByCreatedAtDesc = (sources = [], limit = 0) => {
  const seenMessageIds = new Set();
  const mergedMessages = [];

  sources
    .flat()
    .sort(compareMessagesByCreatedAtDesc)
    .forEach((entry) => {
      const messageId = toIdString(entry?._id);
      if (!messageId || seenMessageIds.has(messageId)) {
        return;
      }

      seenMessageIds.add(messageId);
      mergedMessages.push(entry);
    });

  if (limit > 0) {
    return mergedMessages.slice(0, limit);
  }
  return mergedMessages;
};

const buildDirectKey = (userA, userB) =>
  [toIdString(userA), toIdString(userB)].filter(Boolean).sort().join(":");

const buildMessagePreview = (body, references = [], attachments = []) => {
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
  if (Array.isArray(attachments) && attachments.length > 0) {
    const firstAttachmentKind = getAttachmentKind(attachments[0]);
    if (firstAttachmentKind === "audio") {
      return attachments.length > 1 ? `Sent ${attachments.length} media files` : "Sent a voice note";
    }
    if (firstAttachmentKind === "image") {
      return attachments.length > 1 ? `Shared ${attachments.length} media files` : "Shared a photo";
    }
    if (firstAttachmentKind === "video") {
      return attachments.length > 1 ? `Shared ${attachments.length} media files` : "Shared a video";
    }
    return attachments.length > 1 ? `Shared ${attachments.length} files` : "Shared a file";
  }
  return "Shared a project";
};

const normalizeReplyPreview = (value) => {
  const preview = toText(value).replace(/\s+/g, " ");
  if (!preview) return "";
  return preview.length > 280 ? `${preview.slice(0, 277)}...` : preview;
};

const buildReplyPreviewFromMessage = (message = {}) =>
  normalizeReplyPreview(
    buildMessagePreview(message?.body, message?.references, message?.attachments),
  );

const resolveReplyTargetPayload = async (threadId, rawReplyTarget = null) => {
  const replyTarget = parseReplyInput(rawReplyTarget);
  if (!replyTarget) return null;

  const replyMessageId = toIdString(replyTarget?.messageId || replyTarget?._id);
  if (mongoose.Types.ObjectId.isValid(replyMessageId)) {
    const replyMessage = await ChatMessage.findOne({
      _id: replyMessageId,
      thread: threadId,
    })
      .select("_id sender body references attachments")
      .populate("sender", "_id firstName lastName name")
      .lean();

    if (replyMessage) {
      return {
        messageId: replyMessage._id,
        senderId: replyMessage.sender?._id || replyMessage.sender || null,
        senderName: getUserDisplayName(replyMessage.sender),
        preview: buildReplyPreviewFromMessage(replyMessage),
      };
    }
  }

  const fallbackPreview = normalizeReplyPreview(
    replyTarget?.preview || replyTarget?.body || replyTarget?.text,
  );
  const fallbackSenderName = toText(replyTarget?.senderName || replyTarget?.label);
  const fallbackSenderId = toIdString(replyTarget?.senderId);

  if (!fallbackPreview && !fallbackSenderName && !replyMessageId) {
    return null;
  }

  return {
    messageId: mongoose.Types.ObjectId.isValid(replyMessageId)
      ? new mongoose.Types.ObjectId(replyMessageId)
      : null,
    senderId: mongoose.Types.ObjectId.isValid(fallbackSenderId)
      ? new mongoose.Types.ObjectId(fallbackSenderId)
      : null,
    senderName: fallbackSenderName,
    preview: fallbackPreview,
  };
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
  const presenceMap = await resolvePresenceMap(
    users.map((user) => toIdString(user?._id)),
  );

  return users.reduce((acc, user) => {
    acc[toIdString(user._id)] = serializeUserSummary(user, presenceMap);
    return acc;
  }, {});
};

const loadMentionedUsers = async (handles = [], excludedUserId = "") => {
  const uniqueHandles = Array.from(
    new Set((Array.isArray(handles) ? handles : []).map((entry) => normalizeMentionHandle(entry)).filter(Boolean)),
  );
  if (uniqueHandles.length === 0) {
    return [];
  }

  const userFilter = excludedUserId
    ? { _id: { $ne: excludedUserId } }
    : {};
  const users = await User.find(userFilter)
    .select("_id firstName lastName name")
    .lean();

  const handleSet = new Set(uniqueHandles);
  const resolvedUsers = [];
  const seenUserIds = new Set();

  users.forEach((user) => {
    const userId = toIdString(user?._id);
    const handle = buildMentionHandle(user);
    if (!userId || !handleSet.has(handle) || seenUserIds.has(userId)) {
      return;
    }

    seenUserIds.add(userId);
    resolvedUsers.push(user);
  });

  return resolvedUsers;
};

const notifyPublicChatMentions = async ({
  thread,
  sender,
  body,
  previousBody = "",
  messageId = "",
}) => {
  if (toText(thread?.type) !== "public") {
    return;
  }

  const previousHandles = new Set(extractMentionHandles(previousBody));
  const nextHandles = extractMentionHandles(body).filter(
    (handle) => !previousHandles.has(handle),
  );
  if (nextHandles.length === 0) {
    return;
  }

  const senderId = toIdString(sender?._id || sender?.id);
  const mentionedUsers = await loadMentionedUsers(nextHandles, senderId);
  if (mentionedUsers.length === 0) {
    return;
  }

  const notificationTitle = buildChatMentionNotificationTitle(thread);
  const notificationMessage = buildChatMentionNotificationMessage(
    thread,
    sender,
    body,
  );
  const sourceKey = `${CHAT_MENTION_NOTIFICATION_SOURCE_PREFIX}:${toIdString(messageId) || toIdString(thread?._id)}`;

  await Promise.all(
    mentionedUsers.map((mentionedUser) =>
      createNotification(
        mentionedUser._id,
        senderId,
        null,
        "SYSTEM",
        notificationTitle,
        notificationMessage,
        {
          source: sourceKey,
          email: false,
          push: true,
        },
      ),
    ),
  );
};

const countUnreadMessages = async (threadOrId, userId, lastReadAt, clearedAt) => {
  const threadId = toIdString(threadOrId?._id || threadOrId);
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

  const visibilityStartAt = getLatestDate(lastReadAt, clearedAt);
  const latestThreadMessageAt = getLatestDate(threadOrId?.lastMessageAt);
  if (
    visibilityStartAt &&
    latestThreadMessageAt &&
    latestThreadMessageAt.getTime() <= visibilityStartAt.getTime()
  ) {
    return 0;
  }

  if (visibilityStartAt) {
    query.createdAt = { $gt: visibilityStartAt };
  }

  const unreadInMongo = await ChatMessage.countDocuments(query);
  const archivedNewestMessageAt = toDateValue(threadOrId?.archive?.newestMessageAt);
  const hasPotentialArchivedMessages =
    Boolean(archivedNewestMessageAt) ||
    !visibilityStartAt ||
    Date.now() - visibilityStartAt.getTime() > CHAT_ARCHIVE_WINDOW_MS;
  if (
    !hasPotentialArchivedMessages ||
    (visibilityStartAt &&
      archivedNewestMessageAt &&
      archivedNewestMessageAt.getTime() <= visibilityStartAt.getTime())
  ) {
    return unreadInMongo;
  }

  const unreadInArchive = await countArchivedMessages(threadId, {
    after: visibilityStartAt,
    excludeSenderId: userId,
  });

  return unreadInMongo + unreadInArchive;
};

const resolveThreadUnreadCount = async (thread, currentUserId, lastReadAt, clearedAt) => {
  if (!thread || !currentUserId) {
    return 0;
  }

  if (toText(thread?.type) === "direct") {
    const unreadEntry = getUnreadStateEntry(thread, currentUserId);
    if (unreadEntry) {
      return Math.max(0, Number(unreadEntry?.count) || 0);
    }
  }

  const unreadCount = await countUnreadMessages(
    thread,
    currentUserId,
    lastReadAt,
    clearedAt,
  );

  if (toText(thread?.type) === "direct") {
    await setThreadUnreadStateForUser(thread._id, currentUserId, unreadCount, null);
  }

  return unreadCount;
};

const syncThreadLastMessage = async (thread) => {
  if (!thread?._id) return;

  const latestMessage = await ChatMessage.findOne({ thread: thread._id })
    .sort({ createdAt: -1, _id: -1 })
    .select("body references attachments sender createdAt")
    .lean();

  if (!latestMessage) {
    const latestArchivedMessage = await getLatestArchivedMessage(toIdString(thread._id));
    if (latestArchivedMessage) {
      thread.lastMessageAt = latestArchivedMessage.createdAt || null;
      thread.lastMessagePreview = buildMessagePreview(
        latestArchivedMessage.body,
        latestArchivedMessage.references,
        latestArchivedMessage.attachments,
      );
      thread.lastMessageSender = latestArchivedMessage.senderId || null;
      return;
    }

    thread.lastMessageAt = null;
    thread.lastMessagePreview = "";
    thread.lastMessageSender = null;
    return;
  }

  thread.lastMessageAt = latestMessage.createdAt || null;
  thread.lastMessagePreview = buildMessagePreview(
    latestMessage.body,
    latestMessage.references,
    latestMessage.attachments,
  );
  thread.lastMessageSender = latestMessage.sender || null;
};

const deleteChatAttachmentFiles = async (attachments = []) => {
  await Promise.all(
    (Array.isArray(attachments) ? attachments : []).map(async (attachment) => {
      const filePath = upload.resolveUploadPathFromUrl(attachment?.fileUrl);
      if (!filePath) return;

      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error("Failed to remove deleted chat attachment:", error);
        }
      }
    }),
  );
};

const isMessageEditable = (message) => {
  const createdAt = message?.createdAt ? new Date(message.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return false;
  }

  return Date.now() - createdAt.getTime() <= MESSAGE_EDIT_WINDOW_MS;
};

const serializeThreadSummary = async (thread, currentUserId, userMap = {}) => {
  const participantIds = getThreadParticipantIds(thread);
  const counterpartId =
    thread?.type === "direct"
      ? participantIds.find((entry) => entry !== currentUserId) || currentUserId
      : "";
  const counterpart = counterpartId ? userMap[counterpartId] || null : null;
  const lastMessageSenderId = toIdString(thread?.lastMessageSender);
  const lastReadAt = getLastReadAt(thread, currentUserId);
  const counterpartLastReadAt =
    thread?.type === "direct" && counterpartId
      ? getLastReadAt(thread, counterpartId)
      : null;
  const clearedAt = getClearedAt(thread, currentUserId);
  const unreadCount = await resolveThreadUnreadCount(
    thread,
    currentUserId,
    lastReadAt,
    clearedAt,
  );
  const lastMessageAt = toDateValue(thread?.lastMessageAt);
  const hideLastMessagePreview =
    Boolean(clearedAt) &&
    (!lastMessageAt || lastMessageAt.getTime() <= toDateValue(clearedAt)?.getTime());

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
    counterpartLastReadAt:
      thread?.type === "direct" ? counterpartLastReadAt || null : null,
    lastMessagePreview: hideLastMessagePreview
      ? ""
      : toText(thread?.lastMessagePreview),
    lastMessageAt: hideLastMessagePreview
      ? null
      : thread?.lastMessageAt || thread?.updatedAt || thread?.createdAt || null,
    lastMessageSender:
      hideLastMessagePreview || !lastMessageSenderId
        ? null
        : userMap[lastMessageSenderId] || null,
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
    const beforeDate = req.query?.before ? toDateValue(req.query.before) : null;
    if (req.query?.before && !beforeDate) {
      return res.status(400).json({ message: "Invalid chat message cursor." });
    }
    const clearedAt = getClearedAt(thread, currentUserId);
    const messageQuery = { thread: threadId };
    if (clearedAt || beforeDate) {
      messageQuery.createdAt = {};
      if (clearedAt) {
        messageQuery.createdAt.$gt = clearedAt;
      }
      if (beforeDate) {
        messageQuery.createdAt.$lt = beforeDate;
      }
    }

    const internalLimit = limit + 10;
    const mongoMessages = await ChatMessage.find(messageQuery)
      .sort({ createdAt: -1, _id: -1 })
      .limit(internalLimit)
      .populate("sender", "_id firstName lastName name avatarUrl role department")
      .lean();
    const archivedMessages = await getArchivedMessages(threadId, {
      before: beforeDate,
      after: clearedAt,
      limit: internalLimit,
    });
    const messagePage = mergeMessagesByCreatedAtDesc(
      [
        mongoMessages,
        archivedMessages.map((entry) => toMessageShapeFromArchiveRecord(entry)),
      ],
      limit + 1,
    );
    const hasOlder = messagePage.length > limit;
    const visibleMessages = messagePage.slice(0, limit);

    const messageRelatedUserIds = visibleMessages.flatMap((message) => [
      message?.sender,
      message?.replyTo?.senderId,
    ]);
    const participantUserMap = await loadUsersById([
      ...(Array.isArray(thread.participants) ? thread.participants : []),
      thread.lastMessageSender,
      ...messageRelatedUserIds,
    ]);

    const serializedThread = await serializeThreadSummary(
      thread,
      currentUserId,
      participantUserMap,
    );
    const serializedMessages = visibleMessages
      .reverse()
      .map((message) => serializeMessage(message, participantUserMap));

    return res.json({
      thread: serializedThread,
      messages: serializedMessages,
      hasOlder,
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
          unreadState: [
            { user: req.user._id, count: 0, lastUnreadAt: null },
            {
              user: new mongoose.Types.ObjectId(recipientId),
              count: 0,
              lastUnreadAt: null,
            },
          ],
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
      await cleanupUploadedFilesSafely(req);
      return res.status(400).json({ message: "Invalid chat thread." });
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread || !hasThreadAccess(thread, currentUserId)) {
      await cleanupUploadedFilesSafely(req);
      return res.status(404).json({ message: "Chat thread not found." });
    }

    const body = toText(req.body?.body).slice(0, MAX_MESSAGE_LENGTH);
    const portalSource = getRequestPortalSource(req);
    const rawReferences = parseReferencesInput(req.body?.references);
    const attachments = mapChatAttachments(req, req.user?._id);
    const replyTo = await resolveReplyTargetPayload(thread._id, req.body?.replyTo);

    const requestedProjectIds = rawReferences
      .slice(0, MAX_REFERENCE_COUNT)
      .map((entry) => toIdString(entry?.projectId || entry?.project))
      .filter((entry) => mongoose.Types.ObjectId.isValid(entry));

    const projects =
      requestedProjectIds.length > 0
        ? await Project.find({ _id: { $in: requestedProjectIds } })
            .select(
              "_id orderId status departments projectLeadId assistantLeadId details.projectName details.projectIndicator details.client",
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
      .filter(
        (project) =>
          buildProjectRouteOptions(req.user, project, { source: portalSource })
            .length > 0,
      )
      .map((project) => ({
        type: "project",
        project: project._id,
        orderId: toText(project.orderId),
        projectName: toText(project?.details?.projectName),
        projectIndicator: toText(project?.details?.projectIndicator),
        client: toText(project?.details?.client),
        status: toText(project?.status),
      }));

    if (!body && references.length === 0 && attachments.length === 0) {
      await cleanupUploadedFilesSafely(req);
      return res
        .status(400)
        .json({ message: "Add a message, attachment, or project reference." });
    }

    const message = await ChatMessage.create({
      thread: thread._id,
      sender: req.user._id,
      body,
      references,
      attachments,
      replyTo,
    });

    upsertThreadReadState(thread, currentUserId, message.createdAt || new Date());
    if (thread.type === "direct") {
      incrementDirectThreadUnreadState(
        thread,
        currentUserId,
        message.createdAt || new Date(),
      );
    } else {
      upsertThreadUnreadState(thread, currentUserId, 0, null);
    }
    thread.lastMessageAt = message.createdAt || new Date();
    thread.lastMessagePreview = buildMessagePreview(
      body,
      references,
      attachments,
    );
    thread.lastMessageSender = req.user._id;
    await thread.save();
    await upsertChatAttachmentIndexEntries({
      threadId: thread._id,
      messageId: message._id,
      attachments,
      uploadedBy: req.user._id,
      uploadedAt: message.createdAt || new Date(),
    });

    try {
      await notifyPublicChatMentions({
        thread,
        sender: req.user,
        body,
        messageId: message._id,
      });
    } catch (mentionNotificationError) {
      console.error(
        "Error notifying mentioned public chat users:",
        mentionNotificationError,
      );
    }

    const senderSummary = serializeMessageSenderSummary(req.user);
    const serializedMessage = serializeMessage(
      {
        ...message.toObject(),
        sender: req.user,
      },
      { [senderSummary._id]: senderSummary },
    );

    const participantIds = getThreadParticipantIds(thread);
    const targetUserIds =
      thread.type === "public" ? [] : Array.from(new Set(participantIds));

    if (thread.type === "direct") {
      const typingStopped = stopTypingSession({
        threadId: toIdString(thread._id),
        userId: currentUserId,
      });
      if (typingStopped) {
        broadcastChatTyping(
          {
            threadId: toIdString(thread._id),
            userId: currentUserId,
            userName: getUserDisplayName(req.user),
            isTyping: false,
          },
          {
            userIds: targetUserIds.filter((userId) => userId !== currentUserId),
          },
        );
      }
    }

    broadcastChatChange(
      {
        threadId: toIdString(thread._id),
        threadType: thread.type,
        changeType: "message_created",
        messageId: toIdString(message._id),
        senderId: currentUserId,
      },
      {
        userIds: targetUserIds,
        broadcast: thread.type === "public",
      },
    );
    void maybeArchiveThreadMessages(thread._id).catch((archiveError) => {
      console.error("Error archiving older chat messages for active thread:", archiveError);
    });

    return res.status(201).json({ message: serializedMessage });
  } catch (error) {
    await cleanupUploadedFilesSafely(req);
    console.error("Error sending chat message:", error);
    return res.status(500).json({ message: "Server error sending message." });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    const messageId = toIdString(req.params?.messageId);

    if (
      !mongoose.Types.ObjectId.isValid(threadId) ||
      !mongoose.Types.ObjectId.isValid(messageId)
    ) {
      return res.status(400).json({ message: "Invalid chat message." });
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread || !hasThreadAccess(thread, currentUserId)) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    const message = await ChatMessage.findOne({
      _id: messageId,
      thread: threadId,
    });
    if (!message) {
      return res.status(404).json({ message: "Chat message not found." });
    }

    if (toIdString(message.sender) !== currentUserId) {
      return res
        .status(403)
        .json({ message: "You can only delete your own chat messages." });
    }

    if (!message.isDeleted) {
      const existingAttachments = Array.isArray(message.attachments)
        ? message.attachments.map((entry) =>
            entry?.toObject ? entry.toObject() : entry,
          )
        : [];

      message.body = DELETED_MESSAGE_BODY;
      message.references = [];
      message.attachments = [];
      message.reactions = [];
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = req.user._id;
      await message.save();

      await syncThreadLastMessage(thread);
      await thread.save();
      await removeChatAttachmentIndexEntries(existingAttachments);
      await deleteChatAttachmentFiles(existingAttachments);
    }

    const senderSummary = serializeMessageSenderSummary(req.user);
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
        changeType: "message_deleted",
        messageId: toIdString(message._id),
        senderId: currentUserId,
      },
      {
        userIds: targetUserIds,
        broadcast: thread.type === "public",
      },
    );

    return res.json({ message: serializedMessage });
  } catch (error) {
    console.error("Error deleting chat message:", error);
    return res.status(500).json({ message: "Server error deleting message." });
  }
};

const updateMessage = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    const messageId = toIdString(req.params?.messageId);

    if (
      !mongoose.Types.ObjectId.isValid(threadId) ||
      !mongoose.Types.ObjectId.isValid(messageId)
    ) {
      return res.status(400).json({ message: "Invalid chat message." });
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread || !hasThreadAccess(thread, currentUserId)) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    const message = await ChatMessage.findOne({
      _id: messageId,
      thread: threadId,
    });
    if (!message) {
      return res.status(404).json({ message: "Chat message not found." });
    }

    const reactionEmoji = normalizeReactionEmoji(req.body?.reactionEmoji);
    if (reactionEmoji) {
      if (message.isDeleted) {
        return res.status(400).json({ message: "Deleted messages cannot be reacted to." });
      }

      applyReactionToggleToMessage(message, req.user?._id, reactionEmoji);
      await message.save();

      const userMap = await loadUsersById([message.sender]);
      const serializedMessage = serializeMessage(message, userMap);

      const participantIds = Array.isArray(thread.participants)
        ? thread.participants.map((entry) => toIdString(entry)).filter(Boolean)
        : [];
      const targetUserIds =
        thread.type === "public" ? [] : Array.from(new Set(participantIds));

      broadcastChatChange(
        {
          threadId: toIdString(thread._id),
          threadType: thread.type,
          changeType: "message_updated",
          messageId: toIdString(message._id),
          senderId: currentUserId,
        },
        {
          userIds: targetUserIds,
          broadcast: thread.type === "public",
        },
      );

      return res.json({ message: serializedMessage });
    }

    if (toIdString(message.sender) !== currentUserId) {
      return res
        .status(403)
        .json({ message: "You can only edit your own chat messages." });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: "Deleted messages cannot be edited." });
    }

    if (!isMessageEditable(message)) {
      return res.status(403).json({
        message: "Messages can only be edited within 15 minutes of sending.",
      });
    }

    const previousBody = toText(message.body);
    const nextBody = toText(req.body?.body).slice(0, MAX_MESSAGE_LENGTH);
    const hasReferences =
      Array.isArray(message.references) && message.references.length > 0;
    const hasAttachments =
      Array.isArray(message.attachments) && message.attachments.length > 0;

    if (!nextBody && !hasReferences && !hasAttachments) {
      return res
        .status(400)
        .json({ message: "A message cannot be empty after editing." });
    }

    if (nextBody === toText(message.body)) {
      const senderSummary = serializeMessageSenderSummary(req.user);
      return res.json({
        message: serializeMessage(
          {
            ...message.toObject(),
            sender: req.user,
          },
          { [senderSummary._id]: senderSummary },
        ),
      });
    }

    message.body = nextBody;
    message.editedAt = new Date();
    await message.save();

    await syncThreadLastMessage(thread);
    await thread.save();

    try {
      await notifyPublicChatMentions({
        thread,
        sender: req.user,
        body: nextBody,
        previousBody,
        messageId: message._id,
      });
    } catch (mentionNotificationError) {
      console.error(
        "Error notifying mentioned public chat users after edit:",
        mentionNotificationError,
      );
    }

    const senderSummary = serializeMessageSenderSummary(req.user);
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
        changeType: "message_updated",
        messageId: toIdString(message._id),
        senderId: currentUserId,
      },
      {
        userIds: targetUserIds,
        broadcast: thread.type === "public",
      },
    );

    return res.json({ message: serializedMessage });
  } catch (error) {
    console.error("Error updating chat message:", error);
    return res.status(500).json({ message: "Server error updating message." });
  }
};

const toggleMessageReaction = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    const messageId = toIdString(req.params?.messageId);
    const emoji = normalizeReactionEmoji(req.body?.emoji);

    if (
      !mongoose.Types.ObjectId.isValid(threadId) ||
      !mongoose.Types.ObjectId.isValid(messageId)
    ) {
      return res.status(400).json({ message: "Invalid chat message." });
    }

    if (!emoji) {
      return res.status(400).json({ message: "Choose an emoji reaction." });
    }

    const thread = await ChatThread.findById(threadId);
    if (!thread || !hasThreadAccess(thread, currentUserId)) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    const message = await ChatMessage.findOne({
      _id: messageId,
      thread: threadId,
    });
    if (!message) {
      return res.status(404).json({ message: "Chat message not found." });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: "Deleted messages cannot be reacted to." });
    }

    applyReactionToggleToMessage(message, req.user?._id, emoji);
    await message.save();

    const userMap = await loadUsersById([message.sender]);
    const serializedMessage = serializeMessage(message, userMap);

    const participantIds = Array.isArray(thread.participants)
      ? thread.participants.map((entry) => toIdString(entry)).filter(Boolean)
      : [];
    const targetUserIds =
      thread.type === "public" ? [] : Array.from(new Set(participantIds));

    broadcastChatChange(
      {
        threadId: toIdString(thread._id),
        threadType: thread.type,
        changeType: "message_updated",
        messageId: toIdString(message._id),
        senderId: currentUserId,
      },
      {
        userIds: targetUserIds,
        broadcast: thread.type === "public",
      },
    );

    return res.json({ message: serializedMessage });
  } catch (error) {
    console.error("Error toggling chat reaction:", error);
    return res.status(500).json({ message: "Server error updating reaction." });
  }
};

const markThreadRead = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ message: "Invalid chat thread." });
    }

    const accessFilter = {
      _id: threadId,
      $or: [{ type: "public" }, { participants: req.user._id }],
    };
    const thread = await ChatThread.findOne(accessFilter).select(
      "_id type participants readState lastMessageAt",
    );
    if (!thread || !currentUserId) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    const previousReadAt = getLastReadAt(thread, currentUserId);
    const latestMessageAt = thread?.lastMessageAt ? new Date(thread.lastMessageAt) : null;
    if (!latestMessageAt || Number.isNaN(latestMessageAt.getTime())) {
      await setThreadUnreadStateForUser(threadId, currentUserId, 0, null);
      return res.json({ ok: true });
    }

    if (previousReadAt) {
      const previousReadDate = new Date(previousReadAt);
      if (
        !Number.isNaN(previousReadDate.getTime()) &&
        latestMessageAt.getTime() <= previousReadDate.getTime()
      ) {
        await setThreadUnreadStateForUser(threadId, currentUserId, 0, null);
        return res.json({ ok: true });
      }
    }

    const nextReadAt = new Date();
    const currentUserObjectId = req.user._id;
    const updateExistingResult = await ChatThread.updateOne(
      {
        ...accessFilter,
        "readState.user": currentUserObjectId,
      },
      {
        $set: {
          "readState.$.lastReadAt": nextReadAt,
        },
      },
    );

    if (updateExistingResult.matchedCount === 0) {
      await ChatThread.updateOne(
        {
          ...accessFilter,
          "readState.user": { $ne: currentUserObjectId },
        },
        {
          $push: {
            readState: {
              user: currentUserObjectId,
              lastReadAt: nextReadAt,
            },
          },
        },
      );
    }

    await setThreadUnreadStateForUser(threadId, currentUserId, 0, null);

    if (thread.type === "direct") {
      const targetUserIds = getThreadParticipantIds(thread).filter(
        (userId) => userId !== currentUserId,
      );
      if (targetUserIds.length > 0) {
        broadcastChatChange(
          {
            threadId,
            threadType: thread.type,
            changeType: "thread_read",
            readerId: currentUserId,
            readAt: nextReadAt,
          },
          {
            userIds: targetUserIds,
          },
        );
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error marking chat thread as read:", error);
    return res.status(500).json({ message: "Server error updating chat read state." });
  }
};

const setThreadTyping = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const threadId = toIdString(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ message: "Invalid chat thread." });
    }

    const accessFilter = {
      _id: threadId,
      $or: [{ type: "public" }, { participants: req.user._id }],
    };
    const thread = await ChatThread.findOne(accessFilter).select(
      "_id type participants",
    );
    if (!thread || !currentUserId) {
      return res.status(404).json({ message: "Chat thread not found." });
    }

    if (thread.type !== "direct") {
      return res.json({ ok: true });
    }

    const targetUserIds = getThreadParticipantIds(thread).filter(
      (userId) => userId !== currentUserId,
    );
    if (targetUserIds.length === 0) {
      return res.json({ ok: true });
    }

    const typingUserName = getUserDisplayName(req.user);
    const isTyping = Boolean(req.body?.isTyping);

    if (isTyping) {
      startTypingSession({
        threadId,
        userId: currentUserId,
        ttlMs: CHAT_TYPING_IDLE_MS,
        onExpire: () => {
          broadcastChatTyping(
            {
              threadId,
              userId: currentUserId,
              userName: typingUserName,
              isTyping: false,
            },
            {
              userIds: targetUserIds,
            },
          );
        },
      });

      broadcastChatTyping(
        {
          threadId,
          userId: currentUserId,
          userName: typingUserName,
          isTyping: true,
        },
        {
          userIds: targetUserIds,
        },
      );

      return res.json({ ok: true });
    }

    const typingStopped = stopTypingSession({
      threadId,
      userId: currentUserId,
    });
    if (typingStopped) {
      broadcastChatTyping(
        {
          threadId,
          userId: currentUserId,
          userName: typingUserName,
          isTyping: false,
        },
        {
          userIds: targetUserIds,
        },
      );
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error updating chat typing state:", error);
    return res.status(500).json({ message: "Server error updating chat typing." });
  }
};

const clearThreadMessages = async (req, res) => {
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

    const clearedAt = new Date();
    upsertThreadClearedState(thread, currentUserId, clearedAt);
    upsertThreadReadState(thread, currentUserId, clearedAt);
    upsertThreadUnreadState(thread, currentUserId, 0, null);
    await thread.save();

    const userMap = await loadUsersById([
      ...(Array.isArray(thread.participants) ? thread.participants : []),
      thread.lastMessageSender,
    ]);
    const serializedThread = await serializeThreadSummary(
      thread.toObject ? thread.toObject() : thread,
      currentUserId,
      userMap,
    );

    broadcastChatChange(
      {
        threadId: toIdString(thread._id),
        threadType: thread.type,
        changeType: "thread_cleared",
      },
      {
        userIds: [currentUserId],
      },
    );

    return res.json({
      ok: true,
      thread: serializedThread,
    });
  } catch (error) {
    console.error("Error clearing chat thread messages:", error);
    return res.status(500).json({ message: "Server error clearing chat messages." });
  }
};

const searchUsers = async (req, res) => {
  try {
    const currentUserId = toIdString(req.user?._id);
    const queryText = toText(req.query?.q);
    const limit = normalizeLimit(
      req.query?.limit,
      USER_SEARCH_LIMIT,
      MAX_USER_SEARCH_LIMIT,
    );
    const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
    const filter = {
      _id: { $ne: req.user._id },
    };

    if (regex) {
      filter.$or = [
        { name: regex },
        { firstName: regex },
        { lastName: regex },
        { employeeId: regex },
        { email: regex },
      ];
    }

    const users = await User.find(filter)
      .select("_id firstName lastName name avatarUrl role department")
      .sort({ firstName: 1, lastName: 1, createdAt: 1 })
      .limit(limit)
      .lean();
    const presenceMap = await resolvePresenceMap(
      users.map((user) => toIdString(user?._id)),
    );

    const serializedUsers = users
      .map((user) => serializeUserSummary(user, presenceMap))
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
    const portalSource = getRequestPortalSource(req);
    const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
    const searchConditions = regex
      ? [
          { orderId: regex },
          { "details.projectName": regex },
          { "details.projectIndicator": regex },
          { "details.client": regex },
        ]
      : [];
    const accessConditions = [];

    if (req.user?.role === "admin") {
      accessConditions.push({});
    } else if (isFrontDeskUser(req.user)) {
      accessConditions.push({});
    } else {
      const engagedRouteDepartments = resolveEngagedRouteDepartments(
        req.user?.department,
      );
      if (engagedRouteDepartments.length > 0) {
        accessConditions.push({ departments: { $in: engagedRouteDepartments } });
      }
      if (req.user?._id) {
        accessConditions.push({ projectLeadId: req.user._id });
        accessConditions.push({ assistantLeadId: req.user._id });
      }
    }

    if (accessConditions.length === 0) {
      return res.json({ projects: [] });
    }

    const normalizedAccessQuery =
      accessConditions.length === 1
        ? accessConditions[0]
        : { $or: accessConditions };
    const filter =
      searchConditions.length > 0
        ? {
            $and: [
              normalizedAccessQuery,
              { $or: searchConditions },
            ],
          }
        : normalizedAccessQuery;

    const projects = await Project.find(filter)
      .select(
        "_id orderId status departments projectLeadId assistantLeadId details.projectName details.projectIndicator details.client",
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(PROJECT_SEARCH_LIMIT * 3)
      .lean();

    const serializedProjects = projects
      .filter(
        (project) =>
          buildProjectRouteOptions(req.user, project, { source: portalSource })
            .length > 0,
      )
      .slice(0, PROJECT_SEARCH_LIMIT)
      .map((project) => ({
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

const getProjectRoutes = async (req, res) => {
  try {
    const portalSource = getRequestPortalSource(req);
    const projectId = toIdString(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ message: "Invalid project reference." });
    }

    const project = await Project.findById(projectId)
      .select(
        "_id orderId status departments projectLeadId assistantLeadId details.projectName details.projectIndicator details.client",
      )
      .lean();

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    const routes = buildProjectRouteOptions(req.user, project, {
      source: portalSource,
    });
    if (routes.length === 0) {
      return res.status(403).json({
        message: "You do not have an eligible route for this linked project.",
      });
    }

    return res.json({
      project: {
        _id: toIdString(project._id),
        orderId: toText(project.orderId),
        projectName: toText(project?.details?.projectName),
        projectIndicator: toText(project?.details?.projectIndicator),
        client: toText(project?.details?.client),
        status: toText(project?.status),
        displayName: buildProjectDisplayName(project),
      },
      routes,
    });
  } catch (error) {
    console.error("Error resolving chat project routes:", error);
    return res
      .status(500)
      .json({ message: "Server error resolving project routes." });
  }
};

module.exports = {
  getThreads,
  getThreadMessages,
  startDirectThread,
  sendMessage,
  toggleMessageReaction,
  deleteMessage,
  updateMessage,
  markThreadRead,
  setThreadTyping,
  clearThreadMessages,
  searchUsers,
  searchProjects,
  getProjectRoutes,
};
