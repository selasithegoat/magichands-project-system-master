const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const ChatThread = require("../models/ChatThread");
const ChatAttachmentIndex = require("../models/ChatAttachmentIndex");
const archiveStore = require("./chatArchiveStore");

const CHAT_ARCHIVE_AFTER_DAYS = Number.isFinite(
  Number.parseInt(process.env.CHAT_ARCHIVE_AFTER_DAYS, 10),
)
  ? Number.parseInt(process.env.CHAT_ARCHIVE_AFTER_DAYS, 10)
  : 30;
const CHAT_ARCHIVE_BATCH_SIZE = Number.isFinite(
  Number.parseInt(process.env.CHAT_ARCHIVE_BATCH_SIZE, 10),
)
  ? Number.parseInt(process.env.CHAT_ARCHIVE_BATCH_SIZE, 10)
  : 500;
const CHAT_ARCHIVE_THREAD_THROTTLE_MS = Number.isFinite(
  Number.parseInt(process.env.CHAT_ARCHIVE_THREAD_THROTTLE_MS, 10),
)
  ? Number.parseInt(process.env.CHAT_ARCHIVE_THREAD_THROTTLE_MS, 10)
  : 10 * 60 * 1000;

const archiveSweepByThread = new Map();

const toText = (value) => String(value || "").trim();

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
    if (value.id) return toIdString(value.id);
  }
  return "";
};

const toDateValue = (value) => {
  if (!value) return null;
  const nextDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
};

const getEarlierDate = (...values) =>
  values
    .map((value) => toDateValue(value))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime())[0] || null;

const getLaterDate = (...values) =>
  values
    .map((value) => toDateValue(value))
    .filter(Boolean)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

const serializeArchiveReference = (entry = {}) => ({
  type: toText(entry?.type) || "project",
  projectId: toIdString(entry?.project),
  orderId: toText(entry?.orderId),
  projectName: toText(entry?.projectName),
  projectIndicator: toText(entry?.projectIndicator),
  client: toText(entry?.client),
  status: toText(entry?.status),
});

const serializeArchiveAttachment = (entry = {}) => ({
  fileUrl: toText(entry?.fileUrl),
  fileName: toText(entry?.fileName),
  fileType: toText(entry?.fileType),
  uploadedBy: toIdString(entry?.uploadedBy),
  uploadedAt: entry?.uploadedAt || null,
});

const buildArchivedMessageRecord = (message = {}) => ({
  _id: toIdString(message?._id),
  threadId: toIdString(message?.thread),
  senderId: toIdString(message?.sender),
  body: toText(message?.body),
  references: Array.isArray(message?.references)
    ? message.references.map((entry) => serializeArchiveReference(entry))
    : [],
  attachments: Array.isArray(message?.attachments)
    ? message.attachments.map((entry) => serializeArchiveAttachment(entry))
    : [],
  isDeleted: Boolean(message?.isDeleted),
  deletedAt: message?.deletedAt || null,
  deletedBy: toIdString(message?.deletedBy),
  editedAt: message?.editedAt || null,
  createdAt: message?.createdAt || null,
  updatedAt: message?.updatedAt || null,
});

const toMessageShapeFromArchiveRecord = (record = {}) => ({
  _id: toText(record?._id),
  thread: toText(record?.threadId),
  sender: toText(record?.senderId),
  body: toText(record?.body),
  references: Array.isArray(record?.references)
    ? record.references.map((entry) => ({
        type: toText(entry?.type) || "project",
        project: toText(entry?.projectId),
        orderId: toText(entry?.orderId),
        projectName: toText(entry?.projectName),
        projectIndicator: toText(entry?.projectIndicator),
        client: toText(entry?.client),
        status: toText(entry?.status),
      }))
    : [],
  attachments: Array.isArray(record?.attachments)
    ? record.attachments.map((entry) => ({
        fileUrl: toText(entry?.fileUrl),
        fileName: toText(entry?.fileName),
        fileType: toText(entry?.fileType),
        uploadedBy: toText(entry?.uploadedBy),
        uploadedAt: entry?.uploadedAt || null,
      }))
    : [],
  isDeleted: Boolean(record?.isDeleted),
  deletedAt: record?.deletedAt || null,
  deletedBy: toText(record?.deletedBy),
  editedAt: record?.editedAt || null,
  isArchived: true,
  createdAt: record?.createdAt || null,
  updatedAt: record?.updatedAt || null,
});

const getArchiveCutoffDate = (baseDate = new Date()) => {
  const nextDate = baseDate instanceof Date ? new Date(baseDate) : new Date(baseDate);
  nextDate.setDate(nextDate.getDate() - CHAT_ARCHIVE_AFTER_DAYS);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

const syncThreadArchiveState = async (threadId, archivedRecords = []) => {
  const normalizedThreadId = toIdString(threadId);
  if (!normalizedThreadId || !mongoose.Types.ObjectId.isValid(normalizedThreadId)) {
    return;
  }

  const createdAtValues = (Array.isArray(archivedRecords) ? archivedRecords : [])
    .map((entry) => toDateValue(entry?.createdAt))
    .filter(Boolean);
  if (createdAtValues.length === 0) {
    return;
  }

  const thread = await ChatThread.findById(normalizedThreadId).select("archive");
  if (!thread) {
    return;
  }

  thread.archive = {
    ...(thread.archive?.toObject ? thread.archive.toObject() : thread.archive || {}),
    oldestMessageAt: getEarlierDate(
      thread.archive?.oldestMessageAt,
      createdAtValues[0],
    ),
    newestMessageAt: getLaterDate(
      thread.archive?.newestMessageAt,
      createdAtValues[createdAtValues.length - 1],
    ),
    lastSweepAt: new Date(),
  };
  thread.markModified("archive");
  await thread.save();
};

const upsertChatAttachmentIndexEntries = async ({
  threadId,
  messageId,
  attachments = [],
  uploadedBy = null,
  uploadedAt = new Date(),
} = {}) => {
  const normalizedThreadId = toIdString(threadId);
  if (!normalizedThreadId || !mongoose.Types.ObjectId.isValid(normalizedThreadId)) {
    return;
  }

  const operations = (Array.isArray(attachments) ? attachments : [])
    .map((entry) => ({
      fileUrl: toText(entry?.fileUrl),
      fileName: toText(entry?.fileName),
      fileType: toText(entry?.fileType),
    }))
    .filter((entry) => entry.fileUrl)
    .map((entry) => ({
      updateOne: {
        filter: { fileUrl: entry.fileUrl },
        update: {
          $set: {
            thread: new mongoose.Types.ObjectId(normalizedThreadId),
            messageId: toText(messageId),
            fileName: entry.fileName,
            fileType: entry.fileType,
            uploadedBy:
              uploadedBy && mongoose.Types.ObjectId.isValid(toIdString(uploadedBy))
                ? new mongoose.Types.ObjectId(toIdString(uploadedBy))
                : null,
            uploadedAt: uploadedAt || new Date(),
          },
        },
        upsert: true,
      },
    }));

  if (operations.length === 0) {
    return;
  }

  await ChatAttachmentIndex.bulkWrite(operations, { ordered: false });
};

const removeChatAttachmentIndexEntries = async (attachments = []) => {
  const fileUrls = (Array.isArray(attachments) ? attachments : [])
    .map((entry) =>
      typeof entry === "string" ? toText(entry) : toText(entry?.fileUrl),
    )
    .filter(Boolean);

  if (fileUrls.length === 0) {
    return;
  }

  await ChatAttachmentIndex.deleteMany({ fileUrl: { $in: fileUrls } });
};

const archiveMessagesForThread = async (
  threadId,
  { cutoffDate = getArchiveCutoffDate(), batchSize = CHAT_ARCHIVE_BATCH_SIZE } = {},
) => {
  const normalizedThreadId = toIdString(threadId);
  if (!normalizedThreadId || !mongoose.Types.ObjectId.isValid(normalizedThreadId)) {
    return { archivedCount: 0, threadId: normalizedThreadId };
  }

  const effectiveCutoffDate =
    cutoffDate instanceof Date ? cutoffDate : new Date(cutoffDate);
  if (Number.isNaN(effectiveCutoffDate.getTime())) {
    return { archivedCount: 0, threadId: normalizedThreadId };
  }

  let archivedCount = 0;

  while (true) {
    const messages = await ChatMessage.find({
      thread: normalizedThreadId,
      createdAt: { $lt: effectiveCutoffDate },
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(batchSize)
      .lean();

    if (messages.length === 0) {
      break;
    }

    const archivedRecords = messages.map((entry) => buildArchivedMessageRecord(entry));
    await archiveStore.appendMessagesBatch(normalizedThreadId, archivedRecords);
    await syncThreadArchiveState(normalizedThreadId, archivedRecords);

    for (const record of archivedRecords) {
      await upsertChatAttachmentIndexEntries({
        threadId: normalizedThreadId,
        messageId: record._id,
        attachments: record.attachments,
        uploadedBy: record.senderId,
        uploadedAt: record.createdAt || new Date(),
      });
    }

    await ChatMessage.deleteMany({
      _id: {
        $in: messages
          .map((entry) => entry?._id)
          .filter(Boolean),
      },
    });

    archivedCount += messages.length;

    if (messages.length < batchSize) {
      break;
    }
  }

  return {
    archivedCount,
    threadId: normalizedThreadId,
  };
};

const archiveEligibleChatMessages = async ({ now = new Date() } = {}) => {
  const cutoffDate = getArchiveCutoffDate(now);
  const candidateThreadIds = (await ChatMessage.distinct("thread", {
    createdAt: { $lt: cutoffDate },
  }))
    .map((entry) => toIdString(entry))
    .filter(Boolean);

  let archivedCount = 0;
  for (const threadId of candidateThreadIds) {
    const result = await archiveMessagesForThread(threadId, { cutoffDate });
    archivedCount += Number(result?.archivedCount) || 0;
  }

  return {
    archivedCount,
    threadCount: candidateThreadIds.length,
    cutoffDate,
  };
};

const maybeArchiveThreadMessages = async (threadId, options = {}) => {
  const normalizedThreadId = toIdString(threadId);
  if (!normalizedThreadId) return { archivedCount: 0, threadId: normalizedThreadId };

  const force = Boolean(options?.force);
  const lastSweepAt = archiveSweepByThread.get(normalizedThreadId) || 0;
  if (!force && Date.now() - lastSweepAt < CHAT_ARCHIVE_THREAD_THROTTLE_MS) {
    return { archivedCount: 0, threadId: normalizedThreadId, skipped: true };
  }

  archiveSweepByThread.set(normalizedThreadId, Date.now());
  return archiveMessagesForThread(normalizedThreadId, options);
};

module.exports = {
  CHAT_ARCHIVE_AFTER_DAYS,
  archiveEligibleChatMessages,
  archiveMessagesForThread,
  countArchivedMessages: archiveStore.countArchivedMessages,
  getArchiveCutoffDate,
  getArchivedMessages: archiveStore.getArchivedMessages,
  getLatestArchivedMessage: archiveStore.getLatestArchivedMessage,
  maybeArchiveThreadMessages,
  removeChatAttachmentIndexEntries,
  toMessageShapeFromArchiveRecord,
  upsertChatAttachmentIndexEntries,
};
