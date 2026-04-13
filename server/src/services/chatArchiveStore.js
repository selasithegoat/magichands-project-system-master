const fs = require("fs");
const path = require("path");

const DEFAULT_UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  path.join(__dirname, "../../../../magichands-uploads");
const ARCHIVE_ROOT =
  process.env.CHAT_ARCHIVE_DIR ||
  path.join(path.dirname(DEFAULT_UPLOAD_DIR), "magichands-chat-archive");
const SEGMENT_FILE_PATTERN = /^messages-(\d{4})-(\d{2})\.ndjson$/i;

const toText = (value) => String(value || "").trim();

const toDateValue = (value) => {
  if (!value) return null;
  const nextDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
};

const ensureDirectory = async (directoryPath) => {
  await fs.promises.mkdir(directoryPath, { recursive: true });
};

const getThreadArchiveDirectory = (threadId) =>
  path.join(ARCHIVE_ROOT, `thread-${toText(threadId)}`);

const getSegmentKey = (value) => {
  const date = toDateValue(value);
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const getSegmentFilePath = (threadId, segmentKey) =>
  path.join(getThreadArchiveDirectory(threadId), `messages-${segmentKey}.ndjson`);

const parseSegmentEntry = (fileName) => {
  const match = SEGMENT_FILE_PATTERN.exec(String(fileName || ""));
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  const rangeStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const rangeEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return {
    fileName,
    rangeStart,
    rangeEnd,
  };
};

const normalizeArchivedMessageRecord = (record = {}) => ({
  _id: toText(record._id),
  threadId: toText(record.threadId),
  senderId: toText(record.senderId),
  body: toText(record.body),
  references: Array.isArray(record.references)
    ? record.references.map((entry) => ({
        type: toText(entry?.type) || "project",
        projectId: toText(entry?.projectId),
        orderId: toText(entry?.orderId),
        projectName: toText(entry?.projectName),
        projectIndicator: toText(entry?.projectIndicator),
        client: toText(entry?.client),
        status: toText(entry?.status),
      }))
    : [],
  attachments: Array.isArray(record.attachments)
    ? record.attachments.map((entry) => ({
        fileUrl: toText(entry?.fileUrl),
        fileName: toText(entry?.fileName),
        fileType: toText(entry?.fileType),
        uploadedBy: toText(entry?.uploadedBy),
        uploadedAt: entry?.uploadedAt || null,
      }))
    : [],
  isDeleted: Boolean(record.isDeleted),
  deletedAt: record?.deletedAt || null,
  deletedBy: toText(record?.deletedBy),
  editedAt: record?.editedAt || null,
  createdAt: record?.createdAt || null,
  updatedAt: record?.updatedAt || null,
});

const shouldIncludeSegment = (segmentEntry, { before, after } = {}) => {
  const beforeDate = toDateValue(before);
  const afterDate = toDateValue(after);

  if (beforeDate && segmentEntry.rangeStart >= beforeDate) {
    return false;
  }
  if (afterDate && segmentEntry.rangeEnd <= afterDate) {
    return false;
  }
  return true;
};

const readSegmentRecords = async (filePath) => {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return normalizeArchivedMessageRecord(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const listThreadSegments = async (threadId) => {
  const threadDirectory = getThreadArchiveDirectory(threadId);
  try {
    const fileNames = await fs.promises.readdir(threadDirectory);
    return fileNames
      .map((fileName) => {
        const parsed = parseSegmentEntry(fileName);
        if (!parsed) return null;
        return {
          ...parsed,
          path: path.join(threadDirectory, fileName),
        };
      })
      .filter(Boolean)
      .sort((left, right) =>
        right.rangeStart.getTime() - left.rangeStart.getTime(),
      );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const appendMessagesBatch = async (threadId, messages = []) => {
  const normalizedThreadId = toText(threadId);
  const normalizedMessages = (Array.isArray(messages) ? messages : [])
    .map((entry) => normalizeArchivedMessageRecord(entry))
    .filter((entry) => entry._id && entry.threadId && entry.createdAt);

  if (!normalizedThreadId || normalizedMessages.length === 0) {
    return { count: 0 };
  }

  const messagesBySegment = normalizedMessages.reduce((accumulator, entry) => {
    const segmentKey = getSegmentKey(entry.createdAt);
    if (!segmentKey) return accumulator;
    if (!accumulator.has(segmentKey)) {
      accumulator.set(segmentKey, []);
    }
    accumulator.get(segmentKey).push(entry);
    return accumulator;
  }, new Map());

  await ensureDirectory(getThreadArchiveDirectory(normalizedThreadId));

  for (const [segmentKey, segmentMessages] of messagesBySegment.entries()) {
    const filePath = getSegmentFilePath(normalizedThreadId, segmentKey);
    const payload =
      segmentMessages
        .sort(
          (left, right) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        )
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n";
    await fs.promises.appendFile(filePath, payload, "utf8");
  }

  return { count: normalizedMessages.length };
};

const getArchivedMessages = async (
  threadId,
  { before = null, after = null, limit = 50 } = {},
) => {
  const normalizedThreadId = toText(threadId);
  const safeLimit = Math.max(Number.parseInt(limit, 10) || 0, 0);
  if (!normalizedThreadId || safeLimit === 0) {
    return [];
  }

  const beforeDate = toDateValue(before);
  const afterDate = toDateValue(after);
  const seenMessageIds = new Set();
  const collected = [];
  const segments = await listThreadSegments(normalizedThreadId);

  for (const segment of segments) {
    if (!shouldIncludeSegment(segment, { before: beforeDate, after: afterDate })) {
      continue;
    }

    const records = await readSegmentRecords(segment.path);
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (!record?._id || seenMessageIds.has(record._id)) {
        continue;
      }

      const createdAt = toDateValue(record.createdAt);
      if (!createdAt) continue;
      if (beforeDate && createdAt >= beforeDate) continue;
      if (afterDate && createdAt <= afterDate) continue;

      seenMessageIds.add(record._id);
      collected.push(record);
      if (collected.length >= safeLimit) {
        return collected;
      }
    }
  }

  return collected;
};

const countArchivedMessages = async (
  threadId,
  { before = null, after = null, excludeSenderId = "" } = {},
) => {
  const normalizedThreadId = toText(threadId);
  if (!normalizedThreadId) return 0;

  const beforeDate = toDateValue(before);
  const afterDate = toDateValue(after);
  const normalizedExcludedSenderId = toText(excludeSenderId);
  const seenMessageIds = new Set();
  let count = 0;
  const segments = await listThreadSegments(normalizedThreadId);

  for (const segment of segments) {
    if (!shouldIncludeSegment(segment, { before: beforeDate, after: afterDate })) {
      continue;
    }

    const records = await readSegmentRecords(segment.path);
    records.forEach((record) => {
      if (!record?._id || seenMessageIds.has(record._id)) {
        return;
      }

      const createdAt = toDateValue(record.createdAt);
      if (!createdAt) return;
      if (beforeDate && createdAt >= beforeDate) return;
      if (afterDate && createdAt <= afterDate) return;
      if (
        normalizedExcludedSenderId &&
        toText(record.senderId) === normalizedExcludedSenderId
      ) {
        return;
      }

      seenMessageIds.add(record._id);
      count += 1;
    });
  }

  return count;
};

const getLatestArchivedMessage = async (threadId) => {
  const messages = await getArchivedMessages(threadId, { limit: 1 });
  return messages[0] || null;
};

module.exports = {
  ARCHIVE_ROOT,
  appendMessagesBatch,
  countArchivedMessages,
  getArchivedMessages,
  getLatestArchivedMessage,
  listThreadSegments,
  normalizeArchivedMessageRecord,
};
