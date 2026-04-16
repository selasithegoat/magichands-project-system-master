import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import useAdaptivePolling from "../../hooks/useAdaptivePolling";
import UserAvatar from "../ui/UserAvatar";
import UsersIcon from "../icons/UsersIcon";
import PersonIcon from "../icons/PersonIcon";
import SearchIcon from "../icons/SearchIcon";
import FolderIcon from "../icons/FolderIcon";
import UploadIcon from "../icons/UploadIcon";
import ThreeDotsIcon from "../icons/ThreeDotsIcon";
import TrashIcon from "../icons/TrashIcon";
import XIcon from "../icons/XIcon";
import ConfirmDialog from "../ui/ConfirmDialog";
import { playMessageSound } from "../../utils/notificationSound";
import { resolvePortalSource } from "../../utils/portalSource";
import "./ChatDock.css";

const THREAD_OPEN_POLL_INTERVAL_MS = 20000;
const THREAD_IDLE_POLL_INTERVAL_MS = 45000;
const THREAD_HIDDEN_OPEN_POLL_INTERVAL_MS = 60000;
const THREAD_HIDDEN_IDLE_POLL_INTERVAL_MS = 120000;
const THREAD_FETCH_DEDUPE_MS = 1200;
const MESSAGE_FETCH_DEDUPE_MS = 900;
const USER_SEARCH_CACHE_MS = 30000;
const PROJECT_SEARCH_CACHE_MS = 20000;
const LOCAL_CHANGE_MATCH_WINDOW_MS = 5000;
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const CHAT_ATTACHMENT_MAX_FILES = 6;
const CHAT_OPEN_EVENT_NAME = "mh:open-chat";
const INCOMING_PREVIEW_HIDE_MS = 4800;
const INCOMING_PREVIEW_EXIT_MS = 240;
const CHAT_ATTACHMENT_ACCEPT =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.cdr";
const CHAT_SAFE_FILE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".zip",
  ".rar",
  ".7z",
  ".cdr",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
]);
const CHAT_SAFE_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/cdr",
  "application/coreldraw",
  "application/vnd.corel-draw",
  "application/x-cdr",
  "application/x-coreldraw",
  "image/x-cdr",
]);
const CHAT_GENERIC_BINARY_MIME_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

const ChatBubbleIcon = ({ width = 24, height = 24 }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 10h10" />
    <path d="M7 14h6" />
    <path d="M5 19.5V19a2 2 0 0 1 2-2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12.5Z" />
  </svg>
);

const SendIcon = ({ width = 18, height = 18 }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const BackIcon = ({ width = 18, height = 18 }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
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
    if (value.id) return toIdString(value.id);
  }
  return "";
};

const toText = (value) => String(value || "").trim();

const formatThreadTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isSameDay = now.toDateString() === date.toDateString();
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(isSameDay ? {} : { month: "short", day: "numeric" }),
  }).format(date);
};

const formatPresenceTimestamp = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatPresenceRelativeTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const absDiffMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const units = [
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];

  for (const [unit, unitMs] of units) {
    if (absDiffMs >= unitMs || unit === "minute") {
      return rtf.format(Math.round(diffMs / unitMs), unit);
    }
  }

  return "just now";
};

const getChatPresenceMeta = (presence) => {
  if (presence?.isOnline) {
    return {
      isOnline: true,
      label: "Online",
      title: "Online now",
    };
  }

  const exactTimestamp = formatPresenceTimestamp(presence?.lastOnlineAt);
  const relativeTimestamp = formatPresenceRelativeTime(presence?.lastOnlineAt);
  if (relativeTimestamp) {
    return {
      isOnline: false,
      label: `Last online ${relativeTimestamp}`,
      title: exactTimestamp ? `Last online ${exactTimestamp}` : "",
    };
  }

  return {
    isOnline: false,
    label: "Offline",
    title: "",
  };
};

const isMessageWithinEditWindow = (message) => {
  const createdAt = message?.createdAt ? new Date(message.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return false;
  }

  return Date.now() - createdAt.getTime() <= MESSAGE_EDIT_WINDOW_MS;
};

const getMessageTimestamp = (message) => {
  const createdAt = message?.createdAt ? new Date(message.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return 0;
  }

  return createdAt.getTime();
};

const compareMessagesAscending = (left, right) => {
  const timestampDiff = getMessageTimestamp(left) - getMessageTimestamp(right);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return toIdString(left?._id).localeCompare(toIdString(right?._id));
};

const mergeChatMessages = (...messageSets) => {
  const mergedById = new Map();

  messageSets.flat().forEach((message) => {
    const messageId = toIdString(message?._id);
    if (!messageId) return;

    const previousMessage = mergedById.get(messageId) || {};
    mergedById.set(messageId, { ...previousMessage, ...message });
  });

  return Array.from(mergedById.values()).sort(compareMessagesAscending);
};

const buildChatMessagePreview = (message = {}) => {
  const body = toText(message?.body);
  if (body) {
    return body.length > 160 ? `${body.slice(0, 157)}...` : body;
  }

  const references = Array.isArray(message?.references) ? message.references : [];
  const firstReference = references[0] || null;
  if (firstReference?.orderId) {
    return `Shared project #${firstReference.orderId}`;
  }
  if (firstReference?.projectName) {
    return `Shared ${firstReference.projectName}`;
  }

  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.length > 0) {
    const firstAttachmentType = getAttachmentType(attachments[0]);
    if (firstAttachmentType === "image") {
      return attachments.length > 1 ? `Shared ${attachments.length} media files` : "Shared a photo";
    }
    if (firstAttachmentType === "video") {
      return attachments.length > 1 ? `Shared ${attachments.length} media files` : "Shared a video";
    }
    if (firstAttachmentType === "audio") {
      return attachments.length > 1 ? `Sent ${attachments.length} media files` : "Sent an audio file";
    }
    return attachments.length > 1 ? `Shared ${attachments.length} files` : "Shared a file";
  }

  return "Shared a project";
};

const normalizeChatReplyTarget = (value = {}) => {
  const preview = toText(value?.preview || value?.body || value?.text);
  if (!preview) return null;

  return {
    messageId: toIdString(value?.messageId || value?._id),
    senderId: toIdString(value?.senderId || value?.sender?._id || value?.sender),
    senderName: toText(value?.senderName || value?.sender?.name),
    preview: preview.length > 280 ? `${preview.slice(0, 277)}...` : preview,
  };
};

const buildReplyTargetFromMessage = (message = {}) =>
  normalizeChatReplyTarget({
    messageId: message?._id,
    senderId: message?.sender?._id || message?.sender,
    senderName: message?.sender?.name,
    preview: buildChatMessagePreview(message),
  });

const getReplySenderLabel = (replyTarget = {}, currentUserId = "") => {
  if (toIdString(replyTarget?.senderId) === toIdString(currentUserId)) {
    return "You";
  }

  return toText(replyTarget?.senderName) || "Message";
};

const getThreadActivityTimestamp = (thread) => {
  const lastMessageAt = thread?.lastMessageAt ? new Date(thread.lastMessageAt) : null;
  if (lastMessageAt && !Number.isNaN(lastMessageAt.getTime())) {
    return lastMessageAt.getTime();
  }

  const updatedAt = thread?.updatedAt ? new Date(thread.updatedAt) : null;
  if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
    return updatedAt.getTime();
  }

  return 0;
};

const compareThreadsByActivityDesc = (left, right) =>
  getThreadActivityTimestamp(right) - getThreadActivityTimestamp(left);

const areStringArraysEqual = (left, right) => {
  const safeLeft = Array.isArray(left) ? left : [];
  const safeRight = Array.isArray(right) ? right : [];
  if (safeLeft.length !== safeRight.length) return false;

  return safeLeft.every((entry, index) => toText(entry) === toText(safeRight[index]));
};

const areUserSummariesEqual = (left, right) => {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return (
    toIdString(left?._id) === toIdString(right?._id) &&
    toText(left?.name) === toText(right?.name) &&
    toText(left?.firstName) === toText(right?.firstName) &&
    toText(left?.lastName) === toText(right?.lastName) &&
    toText(left?.avatarUrl) === toText(right?.avatarUrl) &&
    toText(left?.role) === toText(right?.role) &&
    areStringArraysEqual(left?.department, right?.department) &&
    Boolean(left?.presence?.isOnline) === Boolean(right?.presence?.isOnline) &&
    toText(left?.presence?.lastOnlineAt) === toText(right?.presence?.lastOnlineAt)
  );
};

const areThreadSummariesEqual = (left, right) => {
  if (!left && !right) return true;
  if (!left || !right) return false;

  const leftParticipants = Array.isArray(left?.participants) ? left.participants : [];
  const rightParticipants = Array.isArray(right?.participants) ? right.participants : [];

  return (
    toIdString(left?._id) === toIdString(right?._id) &&
    toText(left?.type) === toText(right?.type) &&
    toText(left?.name) === toText(right?.name) &&
    toText(left?.slug) === toText(right?.slug) &&
    toText(left?.lastMessagePreview) === toText(right?.lastMessagePreview) &&
    toText(left?.lastMessageAt) === toText(right?.lastMessageAt) &&
    Number(left?.unreadCount) === Number(right?.unreadCount) &&
    areUserSummariesEqual(left?.counterpart, right?.counterpart) &&
    areUserSummariesEqual(left?.lastMessageSender, right?.lastMessageSender) &&
    leftParticipants.length === rightParticipants.length &&
    leftParticipants.every((entry, index) =>
      areUserSummariesEqual(entry, rightParticipants[index]),
    )
  );
};

const mergeThreadLists = (previousThreads, nextThreads) => {
  const safePreviousThreads = Array.isArray(previousThreads) ? previousThreads : [];
  const safeNextThreads = Array.isArray(nextThreads) ? nextThreads : [];
  if (safePreviousThreads.length === 0) {
    return safeNextThreads;
  }

  const previousById = new Map(
    safePreviousThreads.map((thread) => [toIdString(thread?._id), thread]),
  );
  let changed = safePreviousThreads.length !== safeNextThreads.length;

  const mergedThreads = safeNextThreads.map((thread, index) => {
    const threadId = toIdString(thread?._id);
    const previousThread = previousById.get(threadId);
    if (!previousThread) {
      changed = true;
      return thread;
    }

    if (toIdString(safePreviousThreads[index]?._id) !== threadId) {
      changed = true;
    }

    if (areThreadSummariesEqual(previousThread, thread)) {
      return previousThread;
    }

    changed = true;
    return thread;
  });

  return changed ? mergedThreads : safePreviousThreads;
};

const resolveNextActiveThreadId = (
  previousThreadId,
  nextThreads,
  { preserveSelection = true, focusThreadId = "" } = {},
) => {
  const safeThreads = Array.isArray(nextThreads) ? nextThreads : [];

  if (focusThreadId && safeThreads.some((thread) => thread._id === focusThreadId)) {
    return focusThreadId;
  }
  if (
    preserveSelection &&
    previousThreadId &&
    safeThreads.some((thread) => thread._id === previousThreadId)
  ) {
    return previousThreadId;
  }
  return safeThreads[0]?._id || "";
};

const applyPresencePatchToUser = (user, presencePatch) => {
  if (!user || !presencePatch) return user;
  if (toIdString(user?._id) !== presencePatch.userId) {
    return user;
  }

  const currentPresence = {
    isOnline: Boolean(user?.presence?.isOnline),
    lastOnlineAt: toText(user?.presence?.lastOnlineAt) || null,
  };
  if (
    currentPresence.isOnline === presencePatch.presence.isOnline &&
    currentPresence.lastOnlineAt === (toText(presencePatch.presence.lastOnlineAt) || null)
  ) {
    return user;
  }

  return {
    ...user,
    presence: {
      isOnline: presencePatch.presence.isOnline,
      lastOnlineAt: presencePatch.presence.lastOnlineAt,
    },
  };
};

const applyPresencePatchToList = (list, presencePatch) => {
  const safeList = Array.isArray(list) ? list : [];
  let changed = false;

  const nextList = safeList.map((entry) => {
    const nextEntry = applyPresencePatchToUser(entry, presencePatch);
    if (nextEntry !== entry) {
      changed = true;
    }
    return nextEntry;
  });

  return changed ? nextList : safeList;
};

const applyPresencePatchToThreads = (threads, presencePatch) => {
  const safeThreads = Array.isArray(threads) ? threads : [];
  let changed = false;

  const nextThreads = safeThreads.map((thread) => {
    const nextCounterpart = applyPresencePatchToUser(thread?.counterpart, presencePatch);
    const nextLastMessageSender = applyPresencePatchToUser(
      thread?.lastMessageSender,
      presencePatch,
    );
    const nextParticipants = applyPresencePatchToList(thread?.participants, presencePatch);

    if (
      nextCounterpart === thread?.counterpart &&
      nextLastMessageSender === thread?.lastMessageSender &&
      nextParticipants === (Array.isArray(thread?.participants) ? thread.participants : [])
    ) {
      return thread;
    }

    changed = true;
    return {
      ...thread,
      counterpart: nextCounterpart,
      lastMessageSender: nextLastMessageSender,
      participants: nextParticipants,
    };
  });

  return changed ? nextThreads : safeThreads;
};

const upsertThreadIntoList = (threads, incomingThread) => {
  const safeThreads = Array.isArray(threads) ? threads : [];
  if (!incomingThread?._id) {
    return safeThreads;
  }

  let found = false;
  const nextThreads = safeThreads
    .map((thread) => {
      if (thread._id !== incomingThread._id) {
        return thread;
      }
      found = true;
      return { ...thread, ...incomingThread };
    })
    .concat(found ? [] : [incomingThread])
    .sort(compareThreadsByActivityDesc);

  return mergeThreadLists(safeThreads, nextThreads);
};

const updateThreadsAfterLocalMessage = (threads, threadId, message) => {
  const safeThreads = Array.isArray(threads) ? threads : [];
  const normalizedThreadId = toIdString(threadId);
  if (!normalizedThreadId || !message?._id) {
    return safeThreads;
  }

  let found = false;
  const nextThreads = safeThreads
    .map((thread) => {
      if (toIdString(thread?._id) !== normalizedThreadId) {
        return thread;
      }

      found = true;
      return {
        ...thread,
        lastMessagePreview: buildChatMessagePreview(message),
        lastMessageAt: message.createdAt || thread.lastMessageAt,
        lastMessageSender: message.sender || thread.lastMessageSender,
        unreadCount: 0,
      };
    })
    .sort(compareThreadsByActivityDesc);

  return found ? mergeThreadLists(safeThreads, nextThreads) : safeThreads;
};

const normalizeMentionHandle = (value) =>
  toText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");

const buildMentionHandle = (user) => {
  const fullName =
    `${toText(user?.firstName)} ${toText(user?.lastName)}`.trim() ||
    toText(user?.name);
  return normalizeMentionHandle(fullName);
};

const getChatUserDisplayName = (entry) =>
  toText(entry?.name) ||
  `${toText(entry?.firstName)} ${toText(entry?.lastName)}`.trim();

const getActiveMention = (text, caretPosition) => {
  if (!Number.isFinite(caretPosition)) return null;

  const safeText = String(text || "");
  const safeCaret = Math.max(0, Math.min(caretPosition, safeText.length));
  const textBeforeCaret = safeText.slice(0, safeCaret);
  const match = textBeforeCaret.match(/(^|[\s(])@([a-z0-9._-]{0,40})$/i);

  if (!match) return null;

  const leadingText = match[1] || "";
  const rawQuery = match[2] || "";
  const tokenStart = safeCaret - match[0].length + leadingText.length;

  return {
    start: tokenStart,
    end: safeCaret,
    query: rawQuery.toLowerCase(),
  };
};

const filterMentionUsers = (users, query) => {
  const normalizedQuery = toText(query).toLowerCase();
  const deduped = [];
  const seenHandles = new Set();

  (Array.isArray(users) ? users : []).forEach((user) => {
    const handle = buildMentionHandle(user);
    if (!handle || seenHandles.has(handle)) return;

    if (normalizedQuery) {
      const compactName = toText(user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`)
        .toLowerCase()
        .replace(/\s+/g, "");
      const spacedName = toText(
        user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`,
      ).toLowerCase();
      const relaxedQuery = normalizedQuery.replace(/[._-]+/g, " ");
      const compactQuery = normalizedQuery.replace(/[._-]+/g, "");

      if (
        !handle.includes(normalizedQuery) &&
        !spacedName.includes(relaxedQuery) &&
        !compactName.includes(compactQuery)
      ) {
        return;
      }
    }

    seenHandles.add(handle);
    deduped.push(user);
  });

  return deduped;
};

const renderChatMessageBody = (
  text,
  keyPrefix,
  { currentUserId = "", onMentionClick, resolveMentionUser } = {},
) => {
  const content = String(text || "");
  if (!content) return content;

  const parts = [];
  const mentionPattern = /(^|[\s(])(@[a-z0-9._-]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(content)) !== null) {
    const leadingText = match[1] || "";
    const mentionText = match[2] || "";
    const mentionStart = match.index + leadingText.length;

    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    if (leadingText) {
      parts.push(leadingText);
    }

    const normalizedHandle = normalizeMentionHandle(mentionText.replace(/^@/, ""));
    const mentionUser = resolveMentionUser?.(normalizedHandle) || null;
    const mentionUserId = toIdString(mentionUser?._id || mentionUser?.id);
    const canOpenMention =
      Boolean(mentionUserId) &&
      mentionUserId !== currentUserId &&
      typeof onMentionClick === "function";

    parts.push(
      canOpenMention ? (
        <button
          key={`${keyPrefix}-mention-${mentionStart}`}
          type="button"
          className="chat-dock-mention chat-dock-mention-button"
          onClick={() => onMentionClick(normalizedHandle)}
        >
          {mentionText}
        </button>
      ) : (
        <span
          key={`${keyPrefix}-mention-${mentionStart}`}
          className="chat-dock-mention"
        >
          {mentionText}
        </span>
      ),
    );
    lastIndex = mentionStart + mentionText.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
};

const buildProjectLabel = (project) => {
  const orderId = toText(project?.orderId);
  const projectName = toText(project?.projectName || project?.displayName);
  if (orderId && projectName) {
    return `#${orderId} - ${projectName}`;
  }
  if (orderId) return `#${orderId}`;
  return projectName || "Untitled Project";
};

const resolveAttachmentUrl = (attachment = {}) => {
  const rawUrl = toText(attachment?.fileUrl || attachment?.url);
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) return rawUrl;
  return `/${rawUrl.replace(/^\/+/, "")}`;
};

const getAttachmentName = (attachment = {}, fallbackIndex = 0) => {
  const explicitName = toText(attachment?.fileName || attachment?.name);
  if (explicitName) return explicitName;

  const attachmentUrl = resolveAttachmentUrl(attachment);
  if (!attachmentUrl) return `attachment-${fallbackIndex + 1}`;

  const rawName = attachmentUrl.split("?")[0].split("/").pop() || attachmentUrl;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const getAttachmentType = (attachment = {}, fallbackIndex = 0) => {
  const mimeType = toText(attachment?.fileType || attachment?.type).toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";

  const attachmentName = getAttachmentName(attachment, fallbackIndex).toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(attachmentName)) return "image";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(attachmentName)) return "audio";
  if (/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(attachmentName)) return "video";
  return "file";
};

const getFileExtension = (fileName) => {
  const rawName = toText(fileName).toLowerCase();
  const extensionIndex = rawName.lastIndexOf(".");
  return extensionIndex >= 0 ? rawName.slice(extensionIndex) : "";
};

const isChatAttachmentFile = (file) => {
  const mimeType = toText(file?.type).toLowerCase();
  const extension = getFileExtension(file?.name);

  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    CHAT_SAFE_FILE_MIME_TYPES.has(mimeType) ||
    CHAT_SAFE_FILE_EXTENSIONS.has(extension) ||
    (CHAT_GENERIC_BINARY_MIME_TYPES.has(mimeType) && extension === ".cdr")
  );
};

const buildPendingFileKey = (file) =>
  [toText(file?.name), Number(file?.size) || 0, Number(file?.lastModified) || 0].join(":");

const buildPendingAttachmentId = () =>
  `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createPendingAttachment = (file) => {
  const previewUrl =
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    (toText(file?.type).toLowerCase().startsWith("image/") ||
      toText(file?.type).toLowerCase().startsWith("audio/") ||
      toText(file?.type).toLowerCase().startsWith("video/"))
      ? URL.createObjectURL(file)
      : "";

  const baseAttachment = {
    fileName: file?.name || "Attachment",
    fileType: file?.type || "",
  };

  return {
    id: buildPendingAttachmentId(),
    file,
    fileKey: buildPendingFileKey(file),
    previewUrl,
    name: getAttachmentName(baseAttachment),
    kind: getAttachmentType(baseAttachment),
  };
};

const ChatDock = ({ user }) => {
  const navigate = useNavigate();
  const currentUserId = toIdString(user?._id || user?.id);
  const portalSource = useMemo(() => resolvePortalSource(), []);
  const portalPositionClass = portalSource === "admin" ? "portal-admin" : "";
  const [isOpen, setIsOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesHasOlder, setMessagesHasOlder] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarMode, setSidebarMode] = useState("threads");
  const [mobilePanelView, setMobilePanelView] = useState("sidebar");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] = useState([]);
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [incomingPreview, setIncomingPreview] = useState(null);
  const [incomingPreviewVisible, setIncomingPreviewVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clearThreadTarget, setClearThreadTarget] = useState(null);
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [clearingThreadId, setClearingThreadId] = useState("");
  const [openMessageMenuId, setOpenMessageMenuId] = useState("");
  const [isThreadMenuOpen, setIsThreadMenuOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [savingMessageId, setSavingMessageId] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [activeMention, setActiveMention] = useState(null);
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionSearchLoading, setMentionSearchLoading] = useState(false);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [publicMentionUsers, setPublicMentionUsers] = useState([]);
  const [projectRoutePicker, setProjectRoutePicker] = useState({
    referenceKey: "",
    projectId: "",
    projectLabel: "",
    routes: [],
    loading: false,
    error: "",
  });
  const activeThreadIdRef = useRef("");
  const isOpenRef = useRef(false);
  const messageRequestIdRef = useRef(0);
  const olderMessageRequestIdRef = useRef(0);
  const threadFetchStateRef = useRef({
    promise: null,
    data: [],
    fetchedAt: 0,
  });
  const messageFetchStateRef = useRef(new Map());
  const chatUserSearchCacheRef = useRef(new Map());
  const chatProjectSearchCacheRef = useRef(new Map());
  const markReadInFlightRef = useRef(new Set());
  const playedIncomingMessageIdsRef = useRef(new Set());
  const recentLocalChangeRef = useRef({
    changeType: "",
    threadId: "",
    messageId: "",
    at: 0,
  });
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageScrollActionRef = useRef("");
  const prependScrollStateRef = useRef(null);
  const projectRouteCacheRef = useRef(new Map());
  const attachmentInputRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const pendingAttachmentsRef = useRef([]);
  const incomingPreviewHideTimerRef = useRef(null);
  const incomingPreviewClearTimerRef = useRef(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread._id === activeThreadId) || null,
    [activeThreadId, threads],
  );
  const isPublicThread = activeThread?.type === "public";
  const currentUserSummary = useMemo(
    () => ({
      _id: currentUserId,
      firstName: user?.firstName,
      lastName: user?.lastName,
      name: user?.name,
      avatarUrl: user?.avatarUrl,
      role: user?.role,
      department: Array.isArray(user?.department)
        ? user.department
        : user?.department
          ? [user.department]
          : [],
    }),
    [
      currentUserId,
      user?.avatarUrl,
      user?.department,
      user?.firstName,
      user?.lastName,
      user?.name,
      user?.role,
    ],
  );
  const mentionUserDirectory = useMemo(() => {
    const mentionMap = new Map();

    const registerUser = (entry) => {
      if (!entry) return;
      const handle = buildMentionHandle(entry);
      if (!handle || mentionMap.has(handle)) return;
      mentionMap.set(handle, entry);
    };

    registerUser(currentUserSummary);
    publicMentionUsers.forEach(registerUser);
    mentionResults.forEach(registerUser);
    userResults.forEach(registerUser);
    threads.forEach((thread) => {
      registerUser(thread?.counterpart);
      (Array.isArray(thread?.participants) ? thread.participants : []).forEach(
        registerUser,
      );
      registerUser(thread?.lastMessageSender);
    });

    return mentionMap;
  }, [
    currentUserSummary,
    mentionResults,
    publicMentionUsers,
    threads,
    userResults,
  ]);
  const unreadTotal = useMemo(
    () =>
      threads.reduce((sum, thread) => sum + (Number(thread.unreadCount) || 0), 0),
    [threads],
  );

  const updateThreadsState = useCallback((nextValue) => {
    setThreads((prev) => {
      const resolvedNextThreads =
        typeof nextValue === "function" ? nextValue(prev) : nextValue;
      const normalizedNextThreads = Array.isArray(resolvedNextThreads)
        ? resolvedNextThreads
        : [];

      threadFetchStateRef.current = {
        ...threadFetchStateRef.current,
        data: normalizedNextThreads,
        fetchedAt: Date.now(),
      };

      return normalizedNextThreads;
    });
  }, []);

  const invalidateMessageFetchCache = useCallback((threadId = "") => {
    const normalizedThreadId = toIdString(threadId);
    if (!normalizedThreadId) {
      messageFetchStateRef.current.clear();
      return;
    }

    Array.from(messageFetchStateRef.current.keys()).forEach((key) => {
      if (key.startsWith(`${normalizedThreadId}|`)) {
        messageFetchStateRef.current.delete(key);
      }
    });
  }, []);

  const cancelPendingMessageLoads = useCallback(() => {
    messageRequestIdRef.current += 1;
    olderMessageRequestIdRef.current += 1;
    messageScrollActionRef.current = "";
    prependScrollStateRef.current = null;
  }, []);

  const recordLocalChatChange = useCallback(
    ({ changeType = "", threadId = "", messageId = "" } = {}) => {
      recentLocalChangeRef.current = {
        changeType: toText(changeType).toLowerCase(),
        threadId: toIdString(threadId),
        messageId: toIdString(messageId),
        at: Date.now(),
      };
    },
    [],
  );

  const isRecentLocalChatChange = useCallback(
    ({ changeType = "", threadId = "", messageId = "" } = {}) => {
      const recentChange = recentLocalChangeRef.current;
      if (!recentChange?.at) {
        return false;
      }

      if (Date.now() - recentChange.at > LOCAL_CHANGE_MATCH_WINDOW_MS) {
        return false;
      }

      if (recentChange.changeType !== toText(changeType).toLowerCase()) {
        return false;
      }

      if (recentChange.threadId !== toIdString(threadId)) {
        return false;
      }

      const normalizedMessageId = toIdString(messageId);
      if (
        recentChange.messageId &&
        normalizedMessageId &&
        recentChange.messageId !== normalizedMessageId
      ) {
        return false;
      }

      return true;
    },
    [],
  );

  const fetchChatUsers = useCallback(async ({ query = "", limit, force = false } = {}) => {
    const params = new URLSearchParams();
    const trimmedQuery = toText(query);

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }
    if (Number.isFinite(limit) && limit > 0) {
      params.set("limit", String(limit));
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}|${
      Number.isFinite(limit) && limit > 0 ? limit : "default"
    }`;
    const cacheEntry = chatUserSearchCacheRef.current.get(cacheKey);
    const now = Date.now();

    if (!force && cacheEntry?.promise) {
      return cacheEntry.promise;
    }
    if (
      !force &&
      Array.isArray(cacheEntry?.data) &&
      now - (cacheEntry?.fetchedAt || 0) < USER_SEARCH_CACHE_MS
    ) {
      return cacheEntry.data;
    }

    const requestUrl = params.toString()
      ? `/api/chat/users?${params.toString()}`
      : "/api/chat/users";
    const requestPromise = (async () => {
      const res = await fetch(requestUrl, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to load teammates.");
      }

      const nextUsers = Array.isArray(data?.users) ? data.users : [];
      chatUserSearchCacheRef.current.set(cacheKey, {
        data: nextUsers,
        fetchedAt: Date.now(),
        promise: null,
      });

      return nextUsers;
    })();

    chatUserSearchCacheRef.current.set(cacheKey, {
      ...(cacheEntry || {}),
      promise: requestPromise,
    });

    try {
      return await requestPromise;
    } catch (error) {
      if (chatUserSearchCacheRef.current.get(cacheKey)?.promise === requestPromise) {
        chatUserSearchCacheRef.current.delete(cacheKey);
      }
      throw error;
    }
  }, []);

  const fetchChatProjects = useCallback(async ({ query = "", force = false } = {}) => {
    const trimmedQuery = toText(query);
    const cacheKey = trimmedQuery.toLowerCase();
    const cacheEntry = chatProjectSearchCacheRef.current.get(cacheKey);
    const now = Date.now();

    if (!force && cacheEntry?.promise) {
      return cacheEntry.promise;
    }
    if (
      !force &&
      Array.isArray(cacheEntry?.data) &&
      now - (cacheEntry?.fetchedAt || 0) < PROJECT_SEARCH_CACHE_MS
    ) {
      return cacheEntry.data;
    }

    const requestUrl = `/api/chat/projects?q=${encodeURIComponent(trimmedQuery)}`;
    const requestPromise = (async () => {
      const res = await fetch(requestUrl, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to find projects.");
      }

      const nextProjects = Array.isArray(data?.projects) ? data.projects : [];
      chatProjectSearchCacheRef.current.set(cacheKey, {
        data: nextProjects,
        fetchedAt: Date.now(),
        promise: null,
      });

      return nextProjects;
    })();

    chatProjectSearchCacheRef.current.set(cacheKey, {
      ...(cacheEntry || {}),
      promise: requestPromise,
    });

    try {
      return await requestPromise;
    } catch (error) {
      if (chatProjectSearchCacheRef.current.get(cacheKey)?.promise === requestPromise) {
        chatProjectSearchCacheRef.current.delete(cacheKey);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  const clearIncomingPreviewTimers = useCallback(() => {
    if (incomingPreviewHideTimerRef.current) {
      window.clearTimeout(incomingPreviewHideTimerRef.current);
      incomingPreviewHideTimerRef.current = null;
    }
    if (incomingPreviewClearTimerRef.current) {
      window.clearTimeout(incomingPreviewClearTimerRef.current);
      incomingPreviewClearTimerRef.current = null;
    }
  }, []);

  const dismissIncomingPreview = useCallback(
    (immediate = false) => {
      clearIncomingPreviewTimers();
      setIncomingPreviewVisible(false);
      if (immediate) {
        setIncomingPreview(null);
        return;
      }

      incomingPreviewClearTimerRef.current = window.setTimeout(() => {
        setIncomingPreview(null);
        incomingPreviewClearTimerRef.current = null;
      }, INCOMING_PREVIEW_EXIT_MS);
    },
    [clearIncomingPreviewTimers],
  );

  const showIncomingPreview = useCallback(
    (preview) => {
      const threadId = toIdString(preview?.threadId);
      const senderName = toText(preview?.senderName);
      const messagePreview = toText(preview?.messagePreview);

      if (!threadId || !senderName || !messagePreview) {
        return;
      }

      clearIncomingPreviewTimers();
      setIncomingPreview({
        token: `${toIdString(preview?.messageId) || threadId}-${Date.now()}`,
        threadId,
        messageId: toIdString(preview?.messageId),
        senderName,
        senderAvatarUrl: toText(preview?.senderAvatarUrl),
        messagePreview,
        threadName: toText(preview?.threadName),
      });
      setIncomingPreviewVisible(true);

      incomingPreviewHideTimerRef.current = window.setTimeout(() => {
        setIncomingPreviewVisible(false);
        incomingPreviewHideTimerRef.current = null;
        incomingPreviewClearTimerRef.current = window.setTimeout(() => {
          setIncomingPreview(null);
          incomingPreviewClearTimerRef.current = null;
        }, INCOMING_PREVIEW_EXIT_MS);
      }, INCOMING_PREVIEW_HIDE_MS);
    },
    [clearIncomingPreviewTimers],
  );

  const revokePendingAttachmentPreview = useCallback((attachment) => {
    const previewUrl = attachment?.previewUrl;
    if (!previewUrl) return;

    try {
      URL.revokeObjectURL(previewUrl);
    } catch (revokeError) {
      console.error("Failed to revoke chat preview URL", revokeError);
    }
  }, []);

  const replacePendingAttachments = useCallback(
    (nextValue) => {
      setPendingAttachments((prev) => {
        const nextAttachments =
          typeof nextValue === "function" ? nextValue(prev) : nextValue;
        const normalizedNext = Array.isArray(nextAttachments) ? nextAttachments : [];
        const nextIds = new Set(normalizedNext.map((entry) => entry.id));

        prev.forEach((entry) => {
          if (!nextIds.has(entry.id)) {
            revokePendingAttachmentPreview(entry);
          }
        });

        return normalizedNext;
      });
    },
    [revokePendingAttachmentPreview],
  );

  const clearPendingAttachments = useCallback(() => {
    replacePendingAttachments([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, [replacePendingAttachments]);

  const addPendingFiles = useCallback(
    (incomingFiles) => {
      const nextFiles = Array.from(incomingFiles || []).filter(Boolean);
      if (nextFiles.length === 0) return;

      const acceptedFiles = nextFiles.filter((file) => isChatAttachmentFile(file));
      if (acceptedFiles.length !== nextFiles.length) {
        setError("Only approved attachment formats can be added in chat.");
      }

      const existingKeys = new Set(
        pendingAttachmentsRef.current.map((attachment) => attachment.fileKey),
      );
      const uniqueAcceptedFiles = acceptedFiles.filter((file) => {
        const fileKey = buildPendingFileKey(file);
        if (existingKeys.has(fileKey)) {
          return false;
        }
        existingKeys.add(fileKey);
        return true;
      });

      const availableSlots = CHAT_ATTACHMENT_MAX_FILES - pendingAttachmentsRef.current.length;
      if (availableSlots <= 0) {
        setError(
          `You can attach up to ${CHAT_ATTACHMENT_MAX_FILES} files per message.`,
        );
        return;
      }

      const filesToAttach = uniqueAcceptedFiles.slice(0, availableSlots);
      if (uniqueAcceptedFiles.length > filesToAttach.length) {
        setError(
          `You can attach up to ${CHAT_ATTACHMENT_MAX_FILES} files per message.`,
        );
      } else if (filesToAttach.length > 0) {
        setError("");
      }

      if (filesToAttach.length === 0) return;

      const draftAttachments = filesToAttach.map((file) => createPendingAttachment(file));
      replacePendingAttachments((prev) => [...prev, ...draftAttachments]);
    },
    [replacePendingAttachments],
  );

  const resetProjectRoutePicker = useCallback(() => {
    setProjectRoutePicker({
      referenceKey: "",
      projectId: "",
      projectLabel: "",
      routes: [],
      loading: false,
      error: "",
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousHtmlOverflow = documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      body.style.paddingRight = previousBodyPaddingRight;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      resetProjectRoutePicker();
    }
  }, [isOpen, resetProjectRoutePicker]);

  useEffect(
    () => () => {
      clearIncomingPreviewTimers();
      pendingAttachmentsRef.current.forEach((attachment) => {
        revokePendingAttachmentPreview(attachment);
      });
    },
    [clearIncomingPreviewTimers, revokePendingAttachmentPreview],
  );

  useEffect(() => {
    resetProjectRoutePicker();
  }, [activeThreadId, resetProjectRoutePicker]);

  useEffect(() => {
    if (!activeThreadId) {
      setMobilePanelView("sidebar");
    }
  }, [activeThreadId]);

  const clearMentionState = useCallback(() => {
    setActiveMention(null);
    setMentionResults([]);
    setMentionSearchLoading(false);
    setHighlightedMentionIndex(0);
  }, []);

  const syncComposerMentionState = useCallback(
    (nextValue, nextCaretPosition) => {
      if (!isPublicThread) {
        clearMentionState();
        return;
      }

      const nextMention = getActiveMention(nextValue, nextCaretPosition);
      setActiveMention(nextMention);
      setHighlightedMentionIndex(0);
      if (!nextMention) {
        setMentionResults([]);
      }
    },
    [clearMentionState, isPublicThread],
  );

  useEffect(() => {
    if (!openMessageMenuId) return undefined;

    const handlePointerDown = (event) => {
      if (event.target?.closest?.(".chat-dock-message-menu-wrap")) {
        return;
      }
      setOpenMessageMenuId("");
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [openMessageMenuId]);

  useEffect(() => {
    if (!isThreadMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (event.target?.closest?.(".chat-dock-thread-menu-wrap")) {
        return;
      }
      setIsThreadMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isThreadMenuOpen]);

  useEffect(() => {
    if (
      openMessageMenuId &&
      !messages.some((message) => message?._id === openMessageMenuId)
    ) {
      setOpenMessageMenuId("");
    }

    if (
      editingMessageId &&
      !messages.some((message) => message?._id === editingMessageId)
    ) {
      setEditingMessageId("");
      setEditDraft("");
    }
  }, [editingMessageId, messages, openMessageMenuId]);

  useEffect(() => {
    setIsThreadMenuOpen(false);
    setReplyTarget(null);
  }, [activeThreadId]);

  useEffect(() => {
    if (!isPublicThread) {
      clearMentionState();
    }
  }, [clearMentionState, isPublicThread]);

  useEffect(() => {
    if (!isOpen || !isPublicThread) return undefined;

    let isCancelled = false;

    const loadPublicMentionUsers = async () => {
      try {
        const nextUsers = await fetchChatUsers({ limit: 500 });

        if (!isCancelled) {
          setPublicMentionUsers(nextUsers);
        }
      } catch (mentionDirectoryError) {
        if (!isCancelled) {
          console.error(
            "Failed to load public chat mention directory",
            mentionDirectoryError,
          );
        }
      }
    };

    void loadPublicMentionUsers();

    return () => {
      isCancelled = true;
    };
  }, [currentUserId, fetchChatUsers, isOpen, isPublicThread]);

  const fetchThreads = useCallback(
    async ({
      preserveSelection = true,
      focusThreadId = "",
      force = false,
      showLoading = false,
      minIntervalMs = THREAD_FETCH_DEDUPE_MS,
    } = {}) => {
      if (!currentUserId) return [];

      const cachedState = threadFetchStateRef.current;
      const now = Date.now();

      if (!force && cachedState?.promise) {
        const nextThreads = await cachedState.promise;
        setActiveThreadId((prev) =>
          resolveNextActiveThreadId(prev, nextThreads, {
            preserveSelection,
            focusThreadId,
          }),
        );
        return nextThreads;
      }

      if (
        !force &&
        Array.isArray(cachedState?.data) &&
        cachedState.data.length > 0 &&
        now - (cachedState?.fetchedAt || 0) < minIntervalMs
      ) {
        setActiveThreadId((prev) =>
          resolveNextActiveThreadId(prev, cachedState.data, {
            preserveSelection,
            focusThreadId,
          }),
        );
        return cachedState.data;
      }

      if (showLoading) {
        setThreadsLoading(true);
      }

      const requestPromise = (async () => {
        const res = await fetch("/api/chat/threads", {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || "Failed to load chats.");
        }

        const nextThreads = Array.isArray(data?.threads) ? data.threads : [];
        updateThreadsState((prev) => mergeThreadLists(prev, nextThreads));
        setError("");
        setActiveThreadId((prev) =>
          resolveNextActiveThreadId(prev, nextThreads, {
            preserveSelection,
            focusThreadId,
          }),
        );

        threadFetchStateRef.current = {
          promise: null,
          data: nextThreads,
          fetchedAt: Date.now(),
        };

        return nextThreads;
      })();

      threadFetchStateRef.current = {
        ...cachedState,
        promise: requestPromise,
      };

      try {
        return await requestPromise;
      } catch (fetchError) {
        if (threadFetchStateRef.current?.promise === requestPromise) {
          threadFetchStateRef.current = {
            ...threadFetchStateRef.current,
            promise: null,
          };
        }
        setError(fetchError.message || "Failed to load chats.");
        return [];
      } finally {
        if (showLoading) {
          setThreadsLoading(false);
        }
      }
    },
    [currentUserId, updateThreadsState],
  );

  const markThreadRead = useCallback(async (threadId) => {
    if (!threadId || markReadInFlightRef.current.has(threadId)) return;

    markReadInFlightRef.current.add(threadId);

    try {
      const res = await fetch(`/api/chat/threads/${threadId}/read`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to mark chat thread as read.");
      }

      updateThreadsState((prev) =>
        prev.map((thread) =>
          thread._id === threadId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );
    } catch (readError) {
      console.error("Failed to mark chat thread as read", readError);
    } finally {
      markReadInFlightRef.current.delete(threadId);
    }
  }, [updateThreadsState]);

  const fetchMessages = useCallback(
    async (
      threadId,
      {
        markRead = true,
        before = "",
        mode = "replace",
        force = false,
        showLoading = false,
        minIntervalMs = MESSAGE_FETCH_DEDUPE_MS,
      } = {},
    ) => {
      if (!threadId) {
        setMessages([]);
        setMessagesHasOlder(false);
        return;
      }

      const isPrepend = mode === "prepend";
      const shouldReplace = mode === "replace";
      const requestKey = `${threadId}|${before || "latest"}`;
      const cachedState = messageFetchStateRef.current.get(requestKey);
      const now = Date.now();
      const requestIdRef = isPrepend
        ? olderMessageRequestIdRef
        : messageRequestIdRef;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      const applyMessageResponse = (responseData) => {
        if (activeThreadIdRef.current !== threadId) {
          return;
        }

        const nextMessages = Array.isArray(responseData?.messages)
          ? responseData.messages
          : [];

        if (isPrepend) {
          setMessages((prev) => mergeChatMessages(nextMessages, prev));
          setMessagesHasOlder(Boolean(responseData?.hasOlder));
        } else if (mode === "preserve") {
          setMessages((prev) => mergeChatMessages(prev, nextMessages));
        } else {
          messageScrollActionRef.current = "bottom";
          setMessages(nextMessages);
          setMessagesHasOlder(Boolean(responseData?.hasOlder));
        }

        if (responseData?.thread?._id) {
          updateThreadsState((prev) =>
            upsertThreadIntoList(prev, responseData.thread),
          );
        }

        if (markRead) {
          void markThreadRead(threadId);
        }
      };

      if (!force && cachedState?.promise) {
        if (markRead) {
          void cachedState.promise.then(() => {
            if (activeThreadIdRef.current === threadId) {
              void markThreadRead(threadId);
            }
          });
        }
        return cachedState.promise;
      }

      if (
        !force &&
        cachedState?.data &&
        now - (cachedState?.fetchedAt || 0) < minIntervalMs
      ) {
        if (shouldReplace || mode === "preserve") {
          applyMessageResponse(cachedState.data);
        }
        return cachedState.data;
      }

      if (shouldReplace && showLoading) {
        setMessagesLoading(true);
      }
      if (isPrepend) {
        setLoadingOlderMessages(true);
      }

      const requestPromise = (async () => {
        const params = new URLSearchParams();
        params.set("limit", "60");
        if (before) {
          params.set("before", before);
        }

        const res = await fetch(`/api/chat/threads/${threadId}/messages?${params}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || "Failed to load messages.");
        }

        messageFetchStateRef.current.set(requestKey, {
          data,
          fetchedAt: Date.now(),
          promise: null,
        });

        if (
          requestIdRef.current !== requestId ||
          activeThreadIdRef.current !== threadId
        ) {
          if (isPrepend) {
            messageScrollActionRef.current = "";
            prependScrollStateRef.current = null;
          }
          return data;
        }

        applyMessageResponse(data);
        setError("");

        return data;
      })();

      messageFetchStateRef.current.set(requestKey, {
        ...(cachedState || {}),
        promise: requestPromise,
      });

      try {
        return await requestPromise;
      } catch (fetchError) {
        if (
          requestIdRef.current === requestId &&
          activeThreadIdRef.current === threadId
        ) {
          setError(fetchError.message || "Failed to load messages.");
        }
        if (isPrepend) {
          messageScrollActionRef.current = "";
          prependScrollStateRef.current = null;
        }
        if (messageFetchStateRef.current.get(requestKey)?.promise === requestPromise) {
          messageFetchStateRef.current.delete(requestKey);
        }
        return null;
      } finally {
        if (requestIdRef.current === requestId) {
          if (shouldReplace && showLoading) {
            setMessagesLoading(false);
          }
          if (isPrepend) {
            setLoadingOlderMessages(false);
          }
        }
      }
    },
    [markThreadRead, updateThreadsState],
  );

  const handleLoadOlderMessages = useCallback(() => {
    if (
      !activeThreadId ||
      messages.length === 0 ||
      !messagesHasOlder ||
      loadingOlderMessages ||
      messagesLoading
    ) {
      return;
    }

    const oldestMessage = messages[0];
    const before = toText(oldestMessage?.createdAt);
    if (!before) {
      setMessagesHasOlder(false);
      return;
    }

    const messageContainer = messagesContainerRef.current;
    prependScrollStateRef.current = messageContainer
      ? {
          scrollHeight: messageContainer.scrollHeight,
          scrollTop: messageContainer.scrollTop,
        }
      : null;
    messageScrollActionRef.current = "preserve";

    void fetchMessages(activeThreadId, {
      markRead: false,
      before,
      mode: "prepend",
    });
  }, [
    activeThreadId,
    fetchMessages,
    loadingOlderMessages,
    messages,
    messagesHasOlder,
    messagesLoading,
  ]);

  useEffect(() => {
    if (!currentUserId) return;
    void fetchThreads({
      preserveSelection: false,
      force: true,
      showLoading: true,
    });
  }, [currentUserId, fetchThreads]);

  useAdaptivePolling(() => fetchThreads(), {
    enabled: Boolean(currentUserId),
    intervalMs: isOpen ? THREAD_OPEN_POLL_INTERVAL_MS : THREAD_IDLE_POLL_INTERVAL_MS,
    hiddenIntervalMs: isOpen
      ? THREAD_HIDDEN_OPEN_POLL_INTERVAL_MS
      : THREAD_HIDDEN_IDLE_POLL_INTERVAL_MS,
    runImmediately: false,
    refetchOnFocus: isOpen,
  });

  useEffect(() => {
    if (!isOpen || !activeThreadId) return;
    setMessages([]);
    setMessagesHasOlder(false);
    messageScrollActionRef.current = "";
    prependScrollStateRef.current = null;
    void fetchMessages(activeThreadId, { showLoading: true });
  }, [activeThreadId, fetchMessages, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const messageContainer = messagesContainerRef.current;
    if (
      messageScrollActionRef.current === "preserve" &&
      messageContainer &&
      prependScrollStateRef.current
    ) {
      const { scrollHeight, scrollTop } = prependScrollStateRef.current;
      const delta = messageContainer.scrollHeight - scrollHeight;
      messageContainer.scrollTop = Math.max(scrollTop + delta, 0);
      messageScrollActionRef.current = "";
      prependScrollStateRef.current = null;
      return;
    }

    if (messageScrollActionRef.current === "bottom") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    messageScrollActionRef.current = "";
    prependScrollStateRef.current = null;
  }, [isOpen, messages]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const handleChatChanged = (event) => {
      const changeType = String(event?.detail?.changeType || "").toLowerCase();
      const changedThreadId = toIdString(event?.detail?.threadId);
      const changedMessageId = toIdString(event?.detail?.messageId);
      const senderId = toIdString(event?.detail?.senderId);
      const isThreadMutatingChange = [
        "message_created",
        "message_updated",
        "message_deleted",
        "thread_cleared",
      ].includes(changeType);
      const isOwnRecentLocalChange = isRecentLocalChatChange({
        changeType,
        threadId: changedThreadId,
        messageId: changedMessageId,
      });
      const isIncomingMessage =
        changeType === "message_created" &&
        changedMessageId &&
        senderId &&
        senderId !== currentUserId;

      if (
        isIncomingMessage &&
        !playedIncomingMessageIdsRef.current.has(changedMessageId)
      ) {
        playedIncomingMessageIdsRef.current.add(changedMessageId);
        if (playedIncomingMessageIdsRef.current.size > 250) {
          playedIncomingMessageIdsRef.current.clear();
          playedIncomingMessageIdsRef.current.add(changedMessageId);
        }

        const allowSound = user?.notificationSettings?.sound ?? true;
        playMessageSound(allowSound).catch(() => {});
      }

      if (isThreadMutatingChange && changedThreadId) {
        invalidateMessageFetchCache(changedThreadId);
      }

      void fetchThreads({
        minIntervalMs:
          isThreadMutatingChange && !isOwnRecentLocalChange
            ? 0
            : THREAD_FETCH_DEDUPE_MS,
      }).then((nextThreads) => {
        if (!isIncomingMessage || isOpenRef.current || !changedThreadId) {
          return;
        }

        const changedThread = nextThreads.find(
          (thread) => toIdString(thread?._id) === changedThreadId,
        );
        const sender = changedThread?.lastMessageSender || null;
        const previewSenderId = toIdString(sender?._id || sender);
        const senderName =
          getChatUserDisplayName(sender) ||
          getChatUserDisplayName(changedThread?.counterpart) ||
          "New message";
        const messagePreview =
          toText(changedThread?.lastMessagePreview) || "Sent a message";

        if (!changedThread || (previewSenderId && previewSenderId !== senderId)) {
          return;
        }

        showIncomingPreview({
          threadId: changedThreadId,
          messageId: changedMessageId,
          threadName: changedThread?.name,
          senderName,
          senderAvatarUrl:
            toText(sender?.avatarUrl) || toText(changedThread?.counterpart?.avatarUrl),
          messagePreview,
        });
      });

      if (
        isOpenRef.current &&
        changedThreadId &&
        changedThreadId === activeThreadIdRef.current &&
        !loadingOlderMessages &&
        !isOwnRecentLocalChange
      ) {
        void fetchMessages(changedThreadId, {
          mode: changeType === "thread_cleared" ? "replace" : "preserve",
          minIntervalMs: 0,
        });
      }
    };

    window.addEventListener("mh:chat-changed", handleChatChanged);
    return () => {
      window.removeEventListener("mh:chat-changed", handleChatChanged);
    };
  }, [
    currentUserId,
    fetchMessages,
    fetchThreads,
    invalidateMessageFetchCache,
    isRecentLocalChatChange,
    loadingOlderMessages,
    showIncomingPreview,
    user?.notificationSettings?.sound,
  ]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const handlePresenceChanged = (event) => {
      const userId = toIdString(event?.detail?.userId);
      if (!userId) return;

      const presencePatch = {
        userId,
        presence: {
          isOnline: Boolean(event?.detail?.isOnline),
          lastOnlineAt: event?.detail?.isOnline
            ? null
            : toText(event?.detail?.lastOnlineAt) || null,
        },
      };

      updateThreadsState((prev) => applyPresencePatchToThreads(prev, presencePatch));
      setUserResults((prev) => applyPresencePatchToList(prev, presencePatch));
      setPublicMentionUsers((prev) => applyPresencePatchToList(prev, presencePatch));
      setMentionResults((prev) => applyPresencePatchToList(prev, presencePatch));
      chatUserSearchCacheRef.current.forEach((entry, cacheKey) => {
        if (!Array.isArray(entry?.data)) {
          return;
        }

        const nextData = applyPresencePatchToList(entry.data, presencePatch);
        if (nextData !== entry.data) {
          chatUserSearchCacheRef.current.set(cacheKey, {
            ...entry,
            data: nextData,
          });
        }
      });
    };

    window.addEventListener("mh:presence-changed", handlePresenceChanged);
    return () => {
      window.removeEventListener("mh:presence-changed", handlePresenceChanged);
    };
  }, [currentUserId, updateThreadsState]);

  useEffect(() => {
    if (sidebarMode !== "users") return undefined;

    const timerId = window.setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const nextUsers = await fetchChatUsers({ query: userQuery });
        setUserResults(nextUsers);
        setError("");
      } catch (searchError) {
        setError(searchError.message || "Failed to find teammates.");
      } finally {
        setUserSearchLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchChatUsers, sidebarMode, userQuery]);

  useEffect(() => {
    if (!projectPickerOpen) return undefined;

    const timerId = window.setTimeout(async () => {
      setProjectSearchLoading(true);
      try {
        const nextProjects = await fetchChatProjects({ query: projectQuery });
        setProjectResults(nextProjects);
        setError("");
      } catch (searchError) {
        setError(searchError.message || "Failed to find projects.");
      } finally {
        setProjectSearchLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [fetchChatProjects, projectPickerOpen, projectQuery]);

  useEffect(() => {
    if (!isPublicThread || !activeMention) return undefined;

    let cancelled = false;
    const timerId = window.setTimeout(async () => {
      setMentionSearchLoading(true);
      try {
        const rawQuery = toText(activeMention.query).toLowerCase();
        const users =
          publicMentionUsers.length > 0
            ? publicMentionUsers
            : await fetchChatUsers({ limit: 500 });
        const nextUsers = filterMentionUsers(users, rawQuery);
        if (cancelled) return;
        if (publicMentionUsers.length === 0) {
          setPublicMentionUsers(users);
        }
        setMentionResults(nextUsers);
        setHighlightedMentionIndex((prev) =>
          nextUsers.length === 0 ? 0 : Math.min(prev, nextUsers.length - 1),
        );
      } catch (mentionError) {
        if (cancelled) return;
        console.error("Failed to load mention suggestions", mentionError);
        setMentionResults([]);
      } finally {
        if (!cancelled) {
          setMentionSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [activeMention, fetchChatUsers, isPublicThread, publicMentionUsers]);

  const handleOpen = () => {
    dismissIncomingPreview(true);
    setIsOpen(true);
    setError("");
    clearMentionState();
    setMobilePanelView(activeThreadId ? "thread" : "sidebar");
    if (threads.length === 0) {
      void fetchThreads({ preserveSelection: false, showLoading: true });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSidebarMode("threads");
    setProjectPickerOpen(false);
    setMobilePanelView("sidebar");
    setDeleteTarget(null);
    setClearThreadTarget(null);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setEditingMessageId("");
    setEditDraft("");
    setReplyTarget(null);
    clearMentionState();
    resetProjectRoutePicker();
  };

  const handleSidebarModeChange = (mode) => {
    setSidebarMode(mode);
    setMobilePanelView("sidebar");
  };

  const handleSelectThread = (threadId) => {
    dismissIncomingPreview(true);
    setActiveThreadId(threadId);
    setSidebarMode("threads");
    setMobilePanelView("thread");
    setError("");
    setDeleteTarget(null);
    setClearThreadTarget(null);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setEditingMessageId("");
    setEditDraft("");
    setReplyTarget(null);
    clearMentionState();
    resetProjectRoutePicker();
  };

  const handleStartDirectThread = useCallback(async (recipientId) => {
    try {
      dismissIncomingPreview(true);
      const res = await fetch("/api/chat/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to open direct chat.");
      }

      const nextThreadId = data?.thread?._id || "";
      if (data?.thread?._id) {
        updateThreadsState((prev) => upsertThreadIntoList(prev, data.thread));
      } else if (nextThreadId) {
        await fetchThreads({
          focusThreadId: nextThreadId,
          minIntervalMs: 0,
          showLoading: true,
        });
      }
      setSidebarMode("threads");
      setMobilePanelView("thread");
      setUserQuery("");
      setUserResults([]);
      setReplyTarget(null);
      resetProjectRoutePicker();
      setActiveThreadId(nextThreadId);
      setIsOpen(true);
    } catch (threadError) {
      setError(threadError.message || "Failed to open direct chat.");
    }
  }, [
    dismissIncomingPreview,
    fetchThreads,
    resetProjectRoutePicker,
    updateThreadsState,
  ]);

  const handleOpenPublicThread = useCallback(async () => {
    dismissIncomingPreview(true);
    setIsOpen(true);
    setError("");
    setSidebarMode("threads");
    setMobilePanelView("thread");
    setProjectPickerOpen(false);
    setDeleteTarget(null);
    setClearThreadTarget(null);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setEditingMessageId("");
    setEditDraft("");
    setReplyTarget(null);
    clearMentionState();
    resetProjectRoutePicker();

    const existingPublicThreadId =
      threads.find((thread) => thread?.type === "public")?._id || "";
    if (existingPublicThreadId) {
      setActiveThreadId(existingPublicThreadId);
      return;
    }

    const nextThreads = await fetchThreads({
      preserveSelection: false,
      minIntervalMs: 0,
      showLoading: true,
    });
    const publicThreadId =
      nextThreads.find((thread) => thread?.type === "public")?._id ||
      nextThreads[0]?._id ||
      "";
    setActiveThreadId(publicThreadId);
  }, [
    clearMentionState,
    dismissIncomingPreview,
    fetchThreads,
    resetProjectRoutePicker,
    threads,
  ]);

  const handleIncomingPreviewOpen = useCallback(async () => {
    const threadId = toIdString(incomingPreview?.threadId);
    dismissIncomingPreview(true);

    if (!threadId) {
      setIsOpen(true);
      setError("");
      clearMentionState();
      setMobilePanelView(activeThreadIdRef.current ? "thread" : "sidebar");
      if (threads.length === 0) {
        await fetchThreads({
          preserveSelection: false,
          minIntervalMs: 0,
          showLoading: true,
        });
      }
      return;
    }

    setIsOpen(true);
    setError("");
    setSidebarMode("threads");
    setMobilePanelView("thread");
    setProjectPickerOpen(false);
    setDeleteTarget(null);
    setClearThreadTarget(null);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setEditingMessageId("");
    setEditDraft("");
    clearMentionState();
    resetProjectRoutePicker();

    if (threads.some((thread) => thread?._id === threadId)) {
      setActiveThreadId(threadId);
      void markThreadRead(threadId);
      return;
    }

    await fetchThreads({
      focusThreadId: threadId,
      minIntervalMs: 0,
      showLoading: true,
    });
  }, [
    clearMentionState,
    dismissIncomingPreview,
    fetchThreads,
    incomingPreview?.threadId,
    markThreadRead,
    resetProjectRoutePicker,
    threads,
  ]);

  const resolveMentionUser = useCallback(
    (handle) => mentionUserDirectory.get(normalizeMentionHandle(handle)) || null,
    [mentionUserDirectory],
  );

  const handleMentionClick = useCallback(
    (handle) => {
      const mentionedUser = resolveMentionUser(handle);
      const mentionedUserId = toIdString(
        mentionedUser?._id || mentionedUser?.id,
      );
      if (!mentionedUserId || mentionedUserId === currentUserId) {
        return;
      }

      void handleStartDirectThread(mentionedUserId);
    },
    [currentUserId, handleStartDirectThread, resolveMentionUser],
  );

  useEffect(() => {
    if (!currentUserId) return undefined;

    const handleOpenChat = (event) => {
      const chatKind = String(event?.detail?.kind || "public").toLowerCase();
      const recipientId = toIdString(event?.detail?.recipientId);

      if (chatKind === "direct" && recipientId) {
        void handleStartDirectThread(recipientId);
        return;
      }

      void handleOpenPublicThread();
    };

    window.addEventListener(CHAT_OPEN_EVENT_NAME, handleOpenChat);
    return () => {
      window.removeEventListener(CHAT_OPEN_EVENT_NAME, handleOpenChat);
    };
  }, [currentUserId, handleOpenPublicThread, handleStartDirectThread]);

  const handleAddProjectReference = (project) => {
    const projectId = toIdString(project?._id);
    if (!projectId) return;

    setSelectedProjects((prev) => {
      if (prev.some((entry) => toIdString(entry._id) === projectId)) {
        return prev;
      }
      return [...prev, project].slice(0, 3);
    });
    setProjectPickerOpen(false);
    setProjectQuery("");
  };

  const handleRemoveProjectReference = (projectId) => {
    setSelectedProjects((prev) =>
      prev.filter((project) => toIdString(project._id) !== projectId),
    );
  };

  const handleAttachmentInputChange = (event) => {
    addPendingFiles(event.target.files);
    event.target.value = "";
  };

  const handleRemovePendingAttachment = (attachmentId) => {
    replacePendingAttachments((prev) =>
      prev.filter((attachment) => attachment.id !== attachmentId),
    );
  };

  const handleSelectMention = useCallback(
    (user) => {
      const mentionHandle = buildMentionHandle(user);
      if (!mentionHandle || !activeMention) return;

      const mentionText = `@${mentionHandle}`;
      const nextComposer =
        `${composer.slice(0, activeMention.start)}${mentionText} ` +
        composer.slice(activeMention.end);
      const nextCaretPosition = activeMention.start + mentionText.length + 1;

      setComposer(nextComposer);
      clearMentionState();

      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus();
        composerTextareaRef.current?.setSelectionRange(
          nextCaretPosition,
          nextCaretPosition,
        );
      });
    },
    [activeMention, clearMentionState, composer],
  );

  const handleComposerChange = (event) => {
    const nextValue = event.target.value;
    const nextCaretPosition = event.target.selectionStart;
    setComposer(nextValue);
    syncComposerMentionState(nextValue, nextCaretPosition);
  };

  const handleComposerSelect = (event) => {
    syncComposerMentionState(event.target.value, event.target.selectionStart);
  };

  const handleCancelReply = useCallback(() => {
    setReplyTarget(null);
  }, []);

  const handleStartReply = useCallback((message) => {
    if (!message?._id || message?.isDeleted) return;

    const nextReplyTarget = buildReplyTargetFromMessage(message);
    if (!nextReplyTarget) return;

    setReplyTarget(nextReplyTarget);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setDeleteTarget(null);
    setEditingMessageId("");
    setEditDraft("");
    setError("");
    resetProjectRoutePicker();

    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  }, [resetProjectRoutePicker]);

  const handleJumpToRepliedMessage = useCallback((messageId) => {
    const normalizedMessageId = toIdString(messageId);
    if (!normalizedMessageId) return;

    const messageNode = document.getElementById(
      `chat-dock-message-${normalizedMessageId}`,
    );
    if (!messageNode) return;

    messageNode.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleSendMessage = async () => {
    if (!activeThreadId || sending) return;

    const trimmedComposer = composer.trim();
    if (
      !trimmedComposer &&
      selectedProjects.length === 0 &&
      pendingAttachments.length === 0
    ) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const payload = new FormData();
      if (trimmedComposer) {
        payload.append("body", trimmedComposer);
      }
      if (replyTarget?.preview) {
        payload.append("replyTo", JSON.stringify(replyTarget));
      }
      if (selectedProjects.length > 0) {
        payload.append(
          "references",
          JSON.stringify(
            selectedProjects.map((project) => ({
              projectId: project._id,
            })),
          ),
        );
      }
      pendingAttachments.forEach((attachment) => {
        payload.append("chatAttachments", attachment.file, attachment.name);
      });

      const res = await fetch(`/api/chat/threads/${activeThreadId}/messages`, {
        method: "POST",
        credentials: "include",
        body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to send message.");
      }

      const nextMessage = data?.message;
      if (nextMessage) {
        cancelPendingMessageLoads();
        invalidateMessageFetchCache(activeThreadId);
        messageScrollActionRef.current = "bottom";
        setMessages((prev) => mergeChatMessages(prev, [nextMessage]));
        updateThreadsState((prev) =>
          updateThreadsAfterLocalMessage(prev, activeThreadId, nextMessage),
        );
        recordLocalChatChange({
          changeType: "message_created",
          threadId: activeThreadId,
          messageId: nextMessage._id,
        });
      }
      setComposer("");
      clearMentionState();
      setSelectedProjects([]);
      clearPendingAttachments();
      setReplyTarget(null);
      setProjectPickerOpen(false);
      resetProjectRoutePicker();
      void markThreadRead(activeThreadId);
    } catch (sendError) {
      setError(sendError.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (isPublicThread && activeMention) {
      if (event.key === "ArrowDown" && mentionResults.length > 0) {
        event.preventDefault();
        setHighlightedMentionIndex((prev) => (prev + 1) % mentionResults.length);
        return;
      }

      if (event.key === "ArrowUp" && mentionResults.length > 0) {
        event.preventDefault();
        setHighlightedMentionIndex(
          (prev) => (prev - 1 + mentionResults.length) % mentionResults.length,
        );
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        mentionResults.length > 0
      ) {
        event.preventDefault();
        handleSelectMention(
          mentionResults[
            Math.max(
              0,
              Math.min(highlightedMentionIndex, mentionResults.length - 1),
            )
          ],
        );
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearMentionState();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  const handleToggleMessageMenu = (messageId) => {
    if (!messageId) return;
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId((prev) => (prev === messageId ? "" : messageId));
  };

  const handleToggleThreadMenu = () => {
    if (!activeThreadId || clearingThreadId) return;
    setDeleteTarget(null);
    setOpenMessageMenuId("");
    setIsThreadMenuOpen((prev) => !prev);
  };

  const handleStartEditMessage = (message) => {
    if (!message?._id || message?.isDeleted || message?.isArchived) return;

    if (!isMessageWithinEditWindow(message)) {
      setOpenMessageMenuId("");
      setError("Messages can only be edited within 15 minutes of sending.");
      return;
    }

    setEditingMessageId(message._id);
    setEditDraft(message?.body || "");
    setReplyTarget(null);
    setClearThreadTarget(null);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setDeleteTarget(null);
    setError("");
  };

  const handleCancelEditMessage = () => {
    if (savingMessageId) return;
    setEditingMessageId("");
    setEditDraft("");
  };

  const handleSaveEditedMessage = async () => {
    const messageId = editingMessageId;
    if (!activeThreadId || !messageId || savingMessageId) return;

    setSavingMessageId(messageId);
    setError("");
    setOpenMessageMenuId("");

    try {
      const requestUrl = `/api/chat/threads/${activeThreadId}/messages/${messageId}`;
      const requestPayload = JSON.stringify({ body: editDraft });
      let res = await fetch(requestUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: requestPayload,
      });

      if (res.status === 404 || res.status === 405) {
        res = await fetch(requestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: requestPayload,
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to edit message.");
      }

      const nextMessage = data?.message;
      if (nextMessage?._id) {
        cancelPendingMessageLoads();
        invalidateMessageFetchCache(activeThreadId);
        setMessages((prev) =>
          prev.map((message) =>
            message._id === nextMessage._id ? nextMessage : message,
          ),
        );
        recordLocalChatChange({
          changeType: "message_updated",
          threadId: activeThreadId,
          messageId: nextMessage._id,
        });
      }
      setEditingMessageId("");
      setEditDraft("");
      await fetchThreads({
        focusThreadId: activeThreadId,
        force: true,
        minIntervalMs: 0,
      });
    } catch (editError) {
      setError(editError.message || "Failed to edit message.");
    } finally {
      setSavingMessageId("");
    }
  };

  const handleRequestDeleteMessage = (message) => {
    if (!message?._id || message?.isDeleted || message?.isArchived) return;
    setDeleteTarget({
      _id: message._id,
    });
    setReplyTarget(null);
    setClearThreadTarget(null);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setError("");
  };

  const handleCancelDeleteMessage = () => {
    if (deletingMessageId) return;
    setDeleteTarget(null);
  };

  const handleConfirmDeleteMessage = async () => {
    const messageId = toIdString(deleteTarget?._id);
    if (!activeThreadId || !messageId || deletingMessageId) return;

    setDeletingMessageId(messageId);
    setError("");

    try {
      const res = await fetch(
        `/api/chat/threads/${activeThreadId}/messages/${messageId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete message.");
      }

      const nextMessage = data?.message;
      if (nextMessage?._id) {
        cancelPendingMessageLoads();
        invalidateMessageFetchCache(activeThreadId);
        setMessages((prev) =>
          prev.map((message) =>
            message._id === nextMessage._id ? nextMessage : message,
          ),
        );
        recordLocalChatChange({
          changeType: "message_deleted",
          threadId: activeThreadId,
          messageId: nextMessage._id,
        });
      }
      setDeleteTarget(null);
      if (editingMessageId === messageId) {
        setEditingMessageId("");
        setEditDraft("");
      }
      if (replyTarget?.messageId === messageId) {
        setReplyTarget(null);
      }
      resetProjectRoutePicker();
      await fetchThreads({
        focusThreadId: activeThreadId,
        force: true,
        minIntervalMs: 0,
      });
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete message.");
    } finally {
      setDeletingMessageId("");
    }
  };

  const handleRequestClearThread = () => {
    if (!activeThreadId) return;
    setClearThreadTarget({
      _id: activeThreadId,
    });
    setDeleteTarget(null);
    setIsThreadMenuOpen(false);
    setOpenMessageMenuId("");
    setEditingMessageId("");
    setEditDraft("");
    setReplyTarget(null);
    setError("");
    resetProjectRoutePicker();
  };

  const handleCancelClearThread = () => {
    if (clearingThreadId) return;
    setClearThreadTarget(null);
  };

  const handleConfirmClearThread = async () => {
    const threadId = toIdString(clearThreadTarget?._id || activeThreadId);
    if (!threadId || clearingThreadId) return;

    setClearingThreadId(threadId);
    setError("");

    try {
      const res = await fetch(`/api/chat/threads/${threadId}/clear`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to clear chat messages.");
      }

      const nextThread = data?.thread;
      if (nextThread?._id) {
        updateThreadsState((prev) => upsertThreadIntoList(prev, nextThread));
      }

      cancelPendingMessageLoads();
      invalidateMessageFetchCache(threadId);
      if (activeThreadIdRef.current === threadId) {
        setMessages([]);
        setMessagesHasOlder(false);
      }

      recordLocalChatChange({
        changeType: "thread_cleared",
        threadId,
      });

      setClearThreadTarget(null);
      setDeleteTarget(null);
      setOpenMessageMenuId("");
      setEditingMessageId("");
      setEditDraft("");
      setReplyTarget(null);
      resetProjectRoutePicker();
    } catch (clearError) {
      setError(clearError.message || "Failed to clear chat messages.");
    } finally {
      setClearingThreadId("");
    }
  };

  const handleSelectProjectRoute = (path) => {
    if (!path) return;
    resetProjectRoutePicker();
    navigate(path);
  };

  const handleShowThreadList = () => {
    setMobilePanelView("sidebar");
    setSidebarMode("threads");
    resetProjectRoutePicker();
  };

  const handleNavigateProject = async (referenceKey, projectId, projectLabel) => {
    if (!projectId) return;

    if (
      projectRoutePicker.referenceKey === referenceKey &&
      !projectRoutePicker.loading
    ) {
      resetProjectRoutePicker();
      return;
    }

    const applyResolvedRoutes = (routes, nextProjectLabel = projectLabel) => {
      if (!Array.isArray(routes) || routes.length === 0) {
        setProjectRoutePicker({
          referenceKey,
          projectId,
          projectLabel: nextProjectLabel,
          routes: [],
          loading: false,
          error: "You do not have an eligible route for this linked project.",
        });
        return;
      }

      if (routes.length === 1) {
        handleSelectProjectRoute(routes[0].path);
        return;
      }

      setProjectRoutePicker({
        referenceKey,
        projectId,
        projectLabel: nextProjectLabel,
        routes,
        loading: false,
        error: "",
      });
    };

    const cachedProjectRoutes = projectRouteCacheRef.current.get(projectId);
    if (cachedProjectRoutes) {
      applyResolvedRoutes(
        cachedProjectRoutes.routes,
        cachedProjectRoutes.projectLabel || projectLabel,
      );
      return;
    }

    setProjectRoutePicker({
      referenceKey,
      projectId,
      projectLabel,
      routes: [],
      loading: true,
      error: "",
    });

    try {
      const res = await fetch(`/api/chat/projects/${projectId}/routes`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to resolve project routes.");
      }

      const routes = Array.isArray(data?.routes) ? data.routes : [];
      const resolvedProjectLabel =
        toText(data?.project?.displayName) || projectLabel || "Linked Project";
      projectRouteCacheRef.current.set(projectId, {
        routes,
        projectLabel: resolvedProjectLabel,
      });
      applyResolvedRoutes(routes, resolvedProjectLabel);
    } catch (routeError) {
      setProjectRoutePicker({
        referenceKey,
        projectId,
        projectLabel,
        routes: [],
        loading: false,
        error: routeError.message || "Failed to resolve project routes.",
      });
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className={`chat-dock-shell ${portalPositionClass}`}
          role="dialog"
          aria-modal="false"
        >
          <div
            className={`chat-dock-panel ${
              mobilePanelView === "thread" && activeThread
                ? "mobile-thread-view"
                : "mobile-sidebar-view"
            }`}
          >
            <div className="chat-dock-sidebar">
              <div className="chat-dock-sidebar-head">
                <div>
                  <h2>Chat</h2>
                  <p>Public room and direct messages</p>
                </div>
                <button
                  type="button"
                  className="chat-dock-close-btn"
                  onClick={handleClose}
                  aria-label="Close chat"
                >
                  <XIcon width="18" height="18" />
                </button>
              </div>

              <div className="chat-dock-sidebar-actions">
                <button
                  type="button"
                  className={`chat-dock-chip-btn ${
                    sidebarMode === "threads" ? "active" : ""
                  }`}
                  onClick={() => handleSidebarModeChange("threads")}
                >
                  Threads
                </button>
                <button
                  type="button"
                  className={`chat-dock-chip-btn ${
                    sidebarMode === "users" ? "active" : ""
                  }`}
                  onClick={() => handleSidebarModeChange("users")}
                >
                  New DM
                </button>
              </div>

              {sidebarMode === "users" ? (
                <div className="chat-dock-search-pane">
                  <label className="chat-dock-search-label" htmlFor="chat-user-search">
                    Start a direct message
                  </label>
                  <div className="chat-dock-search-input">
                    <SearchIcon width="16" height="16" />
                    <input
                      id="chat-user-search"
                      type="text"
                      value={userQuery}
                      onChange={(event) => setUserQuery(event.target.value)}
                      placeholder="Search teammates"
                    />
                  </div>
                  <div className="chat-dock-results">
                    {userSearchLoading && (
                      <p className="chat-dock-muted">Loading teammates...</p>
                    )}
                    {!userSearchLoading && userResults.length === 0 && (
                      <p className="chat-dock-muted">No teammates found.</p>
                    )}
                    {userResults.map((entry) => {
                      const presenceMeta = getChatPresenceMeta(entry?.presence);
                      return (
                        <button
                          key={entry._id}
                          type="button"
                          className="chat-dock-result-item"
                          onClick={() => void handleStartDirectThread(entry._id)}
                        >
                          <span className="chat-dock-user-avatar-wrap">
                            <UserAvatar
                              name={entry.name}
                              src={entry.avatarUrl}
                              width="32px"
                              height="32px"
                            />
                            {presenceMeta.isOnline && (
                              <span
                                className="chat-dock-presence-dot"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <span className="chat-dock-user-result-copy">
                            <strong>{entry.name}</strong>
                            <small
                              className={`chat-dock-user-presence ${
                                presenceMeta.isOnline ? "online" : ""
                              }`}
                              title={presenceMeta.title || undefined}
                            >
                              {presenceMeta.label}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="chat-dock-thread-list">
                  {threadsLoading && threads.length === 0 ? (
                    <p className="chat-dock-muted">Loading chats...</p>
                  ) : (
                    threads.map((thread) => {
                      const isActive = thread._id === activeThreadId;
                      const unreadCount = Number(thread.unreadCount) || 0;
                      return (
                        <button
                          key={thread._id}
                          type="button"
                          className={`chat-dock-thread-item ${isActive ? "active" : ""}`}
                          onClick={() => handleSelectThread(thread._id)}
                        >
                          <span className="chat-dock-thread-icon" aria-hidden="true">
                            {thread.type === "public" ? (
                              <UsersIcon width="16" height="16" />
                            ) : (
                              <PersonIcon width="16" height="16" />
                            )}
                          </span>
                          <span className="chat-dock-thread-copy">
                            <strong>{thread.name}</strong>
                            <small>{thread.lastMessagePreview || "No messages yet."}</small>
                          </span>
                          <span className="chat-dock-thread-meta">
                            <small>{formatThreadTime(thread.lastMessageAt)}</small>
                            {unreadCount > 0 && <em>{unreadCount}</em>}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="chat-dock-main">
              {activeThread ? (
                <>
                  <div className="chat-dock-main-head">
                    <div className="chat-dock-main-head-primary">
                      <button
                        type="button"
                        className="chat-dock-mobile-back-btn"
                        onClick={handleShowThreadList}
                        aria-label="Back to chats"
                      >
                        <BackIcon width="16" height="16" />
                        <span>Chats</span>
                      </button>
                      <div className="chat-dock-thread-title">
                        <span className="chat-dock-thread-badge">
                          {activeThread.type === "public" ? "Public" : "Direct"}
                        </span>
                        <h3>{activeThread.name}</h3>
                      </div>
                    </div>
                    <div className="chat-dock-main-head-secondary">
                      {activeThread.counterpart &&
                        (() => {
                          const presenceMeta = getChatPresenceMeta(
                            activeThread.counterpart?.presence,
                          );
                          return (
                            <div className="chat-dock-counterpart">
                              <span className="chat-dock-user-avatar-wrap">
                                <UserAvatar
                                  name={activeThread.counterpart.name}
                                  src={activeThread.counterpart.avatarUrl}
                                  width="28px"
                                  height="28px"
                                />
                                {presenceMeta.isOnline && (
                                  <span
                                    className="chat-dock-presence-dot"
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                              <div className="chat-dock-counterpart-copy">
                                <strong>{activeThread.counterpart.name}</strong>
                                <small
                                  className={`chat-dock-user-presence ${
                                    presenceMeta.isOnline ? "online" : ""
                                  }`}
                                  title={presenceMeta.title || undefined}
                                >
                                  {presenceMeta.label}
                                </small>
                              </div>
                            </div>
                          );
                        })()}
                      <div className="chat-dock-thread-menu-wrap">
                        <button
                          type="button"
                          className="chat-dock-thread-menu-trigger"
                          onClick={handleToggleThreadMenu}
                          aria-label="Open chat options"
                          aria-expanded={isThreadMenuOpen}
                          title="Chat options"
                          disabled={clearingThreadId === activeThread._id}
                        >
                          <ThreeDotsIcon width="18" height="18" />
                        </button>
                        {isThreadMenuOpen && (
                          <div className="chat-dock-thread-menu" role="menu">
                            <button
                              type="button"
                              className="chat-dock-message-menu-item danger"
                              onClick={handleRequestClearThread}
                              disabled={clearingThreadId === activeThread._id}
                            >
                              <TrashIcon width={14} height={14} />
                              <span>
                                {clearingThreadId === activeThread._id
                                  ? "Clearing..."
                                  : "Clear messages"}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="chat-dock-messages" ref={messagesContainerRef}>
                    {(messagesHasOlder || loadingOlderMessages) && messages.length > 0 && (
                      <div className="chat-dock-load-older-wrap">
                        <button
                          type="button"
                          className="chat-dock-load-older-btn"
                          onClick={handleLoadOlderMessages}
                          disabled={loadingOlderMessages || !messagesHasOlder}
                        >
                          {loadingOlderMessages
                            ? "Loading older messages..."
                            : "Load older messages"}
                        </button>
                      </div>
                    )}
                    {messagesLoading ? (
                      <p className="chat-dock-muted">Loading messages...</p>
                    ) : messages.length === 0 ? (
                      <div className="chat-dock-empty">
                        <ChatBubbleIcon width={28} height={28} />
                        <p>Start the conversation here.</p>
                      </div>
                    ) : (
                      messages.map((message) => {
                        const senderId = toIdString(message?.sender?._id);
                        const isMine = senderId === currentUserId;
                        const isDeleted = Boolean(message?.isDeleted);
                        const isArchivedMessage = Boolean(message?.isArchived);
                        const wasEdited = Boolean(message?.editedAt) && !isDeleted;
                        const canEditMessage =
                          isMine && !isDeleted && isMessageWithinEditWindow(message);
                        const isMenuOpen = openMessageMenuId === message._id;
                        const isEditingMessage = editingMessageId === message._id;
                        const isSavingMessage = savingMessageId === message._id;
                        const isDeletingMessage = deletingMessageId === message._id;
                        const showReplyAction = !isDeleted;
                        const replyReference = normalizeChatReplyTarget(message?.replyTo);
                        const references = Array.isArray(message?.references)
                          ? message.references
                          : [];
                        const attachments = Array.isArray(message?.attachments)
                          ? message.attachments
                          : [];

                        return (
                          <div
                            key={message._id}
                            id={`chat-dock-message-${message._id}`}
                            className={`chat-dock-message-row ${isMine ? "mine" : ""}`}
                          >
                            {!isMine && (
                              <UserAvatar
                                name={message?.sender?.name}
                                src={message?.sender?.avatarUrl}
                                width="30px"
                                height="30px"
                              />
                            )}
                            <div
                              className={`chat-dock-message-bubble ${
                                isMine ? "mine" : ""
                              } ${isDeleted ? "deleted" : ""}`}
                            >
                              <div className="chat-dock-message-meta">
                                <strong>{isMine ? "You" : message?.sender?.name || "User"}</strong>
                                <div className="chat-dock-message-meta-actions">
                                  <span>{formatThreadTime(message.createdAt)}</span>
                                </div>
                              </div>
                              {replyReference && (
                                <button
                                  type="button"
                                  className={`chat-dock-reply-quote ${replyReference.messageId ? "clickable" : ""}`}
                                  onClick={() =>
                                    handleJumpToRepliedMessage(replyReference.messageId)
                                  }
                                  disabled={!replyReference.messageId}
                                >
                                  <span>
                                    Replying to{" "}
                                    {getReplySenderLabel(replyReference, currentUserId)}
                                  </span>
                                  <small>{replyReference.preview}</small>
                                </button>
                              )}
                              {isEditingMessage ? (
                                <div className="chat-dock-message-editor">
                                  <textarea
                                    value={editDraft}
                                    onChange={(event) =>
                                      setEditDraft(event.target.value)
                                    }
                                    rows="3"
                                    maxLength="4000"
                                    placeholder="Edit your message..."
                                  />
                                  <div className="chat-dock-message-editor-actions">
                                    <button
                                      type="button"
                                      className="chat-dock-inline-btn"
                                      onClick={handleCancelEditMessage}
                                      disabled={isSavingMessage}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      className="chat-dock-inline-btn primary"
                                      onClick={handleSaveEditedMessage}
                                      disabled={
                                        isSavingMessage ||
                                        editDraft.trim() === toText(message.body)
                                      }
                                    >
                                      {isSavingMessage ? "Saving..." : "Save"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                message.body && (
                                  <p
                                    className={
                                      isDeleted ? "chat-dock-deleted-text" : ""
                                    }
                                  >
                                    {renderChatMessageBody(
                                      message.body,
                                      `${message._id}-body`,
                                      isPublicThread
                                        ? {
                                            currentUserId,
                                            onMentionClick: handleMentionClick,
                                            resolveMentionUser,
                                          }
                                        : {},
                                    )}
                                  </p>
                                )
                              )}
                              {attachments.length > 0 && (
                                <div className="chat-dock-attachment-stack">
                                  {attachments.map((attachment, index) => {
                                    const attachmentUrl = resolveAttachmentUrl(attachment);
                                    if (!attachmentUrl) return null;

                                    const attachmentName = getAttachmentName(
                                      attachment,
                                      index,
                                    );
                                    const attachmentType = getAttachmentType(
                                      attachment,
                                      index,
                                    );

                                    return (
                                      <div
                                        key={`${message._id}-attachment-${attachmentName}-${index}`}
                                        className={`chat-dock-attachment-card ${attachmentType}`}
                                      >
                                        {attachmentType === "image" && (
                                          <a
                                            href={attachmentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="chat-dock-attachment-preview-link"
                                          >
                                            <img
                                              src={attachmentUrl}
                                              alt={attachmentName}
                                              className="chat-dock-attachment-image"
                                              loading="lazy"
                                            />
                                          </a>
                                        )}
                                        {attachmentType === "audio" && (
                                          <audio
                                            controls
                                            preload="metadata"
                                            className="chat-dock-attachment-audio"
                                          >
                                            <source
                                              src={attachmentUrl}
                                              type={attachment.fileType || undefined}
                                            />
                                            Your browser does not support audio playback.
                                          </audio>
                                        )}
                                        {attachmentType === "video" && (
                                          <video
                                            controls
                                            preload="metadata"
                                            playsInline
                                            className="chat-dock-attachment-video"
                                          >
                                            <source
                                              src={attachmentUrl}
                                              type={attachment.fileType || undefined}
                                            />
                                            Your browser does not support video playback.
                                          </video>
                                        )}
                                        {attachmentType === "file" && (
                                          <a
                                            href={attachmentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="chat-dock-attachment-file-link"
                                          >
                                            <UploadIcon width="16" height="16" />
                                            <span>Open attachment</span>
                                          </a>
                                        )}
                                        <div className="chat-dock-attachment-meta">
                                          <span title={attachmentName}>{attachmentName}</span>
                                          <a
                                            href={attachmentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download
                                          >
                                            Download
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {references.length > 0 && (
                                <div className="chat-dock-reference-stack">
                                  {references.map((reference) => {
                                    const referenceKey = `${message._id}-${reference.projectId}`;
                                    const projectLabel = buildProjectLabel(reference);
                                    const isRoutePickerOpen =
                                      projectRoutePicker.referenceKey === referenceKey;

                                    return (
                                      <div
                                        key={referenceKey}
                                        className="chat-dock-reference-wrap"
                                      >
                                        <button
                                          type="button"
                                          className="chat-dock-reference-card"
                                          onClick={() =>
                                            void handleNavigateProject(
                                              referenceKey,
                                              reference.projectId,
                                              projectLabel,
                                            )
                                          }
                                        >
                                          <FolderIcon width="16" height="16" />
                                          <span>{projectLabel}</span>
                                        </button>

                                        {isRoutePickerOpen && (
                                          <div
                                            className="chat-dock-route-picker"
                                            role="group"
                                            aria-label={`Choose a route for ${projectRoutePicker.projectLabel || projectLabel}`}
                                          >
                                            <span className="chat-dock-route-picker-label">
                                              Open as
                                            </span>
                                            {projectRoutePicker.loading ? (
                                              <span className="chat-dock-route-picker-hint">
                                                Checking routes...
                                              </span>
                                            ) : projectRoutePicker.error ? (
                                              <span className="chat-dock-route-picker-hint error">
                                                {projectRoutePicker.error}
                                              </span>
                                            ) : (
                                              projectRoutePicker.routes.map((route) => (
                                                <button
                                                  key={`${referenceKey}-${route.key}`}
                                                  type="button"
                                                  className="chat-dock-route-pill"
                                                  onClick={() =>
                                                    handleSelectProjectRoute(route.path)
                                                  }
                                                >
                                                  {route.label}
                                                </button>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {(wasEdited ||
                                isArchivedMessage ||
                                showReplyAction ||
                                (isMine && !isDeleted && !isArchivedMessage)) && (
                                <div className="chat-dock-message-footer">
                                  <span className="chat-dock-message-status">
                                    {[wasEdited ? "Edited" : "", isArchivedMessage ? "Archived" : ""]
                                      .filter(Boolean)
                                      .join(" | ")}
                                  </span>
                                  <div className="chat-dock-message-footer-actions">
                                    {showReplyAction && !isEditingMessage && (
                                      <button
                                        type="button"
                                        className={`chat-dock-inline-btn ${
                                          replyTarget?.messageId === message._id ? "primary" : ""
                                        }`}
                                        onClick={() => handleStartReply(message)}
                                      >
                                        {replyTarget?.messageId === message._id ? "Replying" : "Reply"}
                                      </button>
                                    )}
                                  {isMine &&
                                    !isDeleted &&
                                    !isEditingMessage &&
                                    !isArchivedMessage && (
                                    <div className="chat-dock-message-menu-wrap">
                                      <button
                                        type="button"
                                        className="chat-dock-message-menu-trigger"
                                        onClick={() =>
                                          handleToggleMessageMenu(message._id)
                                        }
                                        aria-label="Open message options"
                                        title="Message options"
                                        disabled={isDeletingMessage}
                                      >
                                        <ThreeDotsIcon width="16" height="16" />
                                      </button>
                                      {isMenuOpen && (
                                        <div
                                          className="chat-dock-message-menu"
                                          role="menu"
                                        >
                                          <button
                                            type="button"
                                            className="chat-dock-message-menu-item"
                                            onClick={() => handleStartReply(message)}
                                            disabled={isDeletingMessage}
                                          >
                                            Reply
                                          </button>
                                          <button
                                            type="button"
                                            className="chat-dock-message-menu-item"
                                            onClick={() =>
                                              handleStartEditMessage(message)
                                            }
                                            disabled={
                                              !canEditMessage ||
                                              isSavingMessage ||
                                              isDeletingMessage
                                            }
                                            title={
                                              canEditMessage
                                                ? "Edit message"
                                                : "Edit is only available within the first 15 minutes."
                                            }
                                          >
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            className="chat-dock-message-menu-item danger"
                                            onClick={() =>
                                              handleRequestDeleteMessage(message)
                                            }
                                            disabled={isDeletingMessage || isSavingMessage}
                                          >
                                            <TrashIcon width={14} height={14} />
                                            <span>
                                              {isDeletingMessage
                                                ? "Deleting..."
                                                : "Delete"}
                                            </span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="chat-dock-composer">
                    <div className="chat-dock-composer-toolbar">
                      <button
                        type="button"
                        className={`chat-dock-toolbar-btn ${
                          projectPickerOpen ? "active" : ""
                        }`}
                        onClick={() => setProjectPickerOpen((prev) => !prev)}
                      >
                        <FolderIcon width="16" height="16" />
                        Link Project
                      </button>
                      <button
                        type="button"
                        className="chat-dock-toolbar-btn"
                        onClick={() => attachmentInputRef.current?.click()}
                      >
                        <UploadIcon width="16" height="16" />
                        Add File
                      </button>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        className="chat-dock-hidden-input"
                        accept={CHAT_ATTACHMENT_ACCEPT}
                        multiple
                        onChange={handleAttachmentInputChange}
                      />
                    </div>

                    {replyTarget && (
                      <div className="chat-dock-reply-preview">
                        <div className="chat-dock-reply-preview-copy">
                          <span>Replying to {getReplySenderLabel(replyTarget, currentUserId)}</span>
                          <small>{replyTarget.preview}</small>
                        </div>
                        <button
                          type="button"
                          className="chat-dock-reply-preview-dismiss"
                          onClick={handleCancelReply}
                          aria-label="Cancel reply"
                        >
                          <XIcon width="12" height="12" />
                        </button>
                      </div>
                    )}

                    {selectedProjects.length > 0 && (
                      <div className="chat-dock-selected-projects">
                        {selectedProjects.map((project) => {
                          const projectId = toIdString(project._id);
                          return (
                            <span key={projectId} className="chat-dock-project-chip">
                              {buildProjectLabel(project)}
                              <button
                                type="button"
                                onClick={() => handleRemoveProjectReference(projectId)}
                                aria-label="Remove project reference"
                              >
                                <XIcon width="12" height="12" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {pendingAttachments.length > 0 && (
                      <div className="chat-dock-pending-attachments">
                        {pendingAttachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className={`chat-dock-pending-card ${attachment.kind}`}
                          >
                            <button
                              type="button"
                              className="chat-dock-pending-remove"
                              onClick={() => handleRemovePendingAttachment(attachment.id)}
                              aria-label={`Remove ${attachment.name}`}
                            >
                              <XIcon width="12" height="12" />
                            </button>
                            <div className="chat-dock-pending-preview">
                              {attachment.kind === "image" && attachment.previewUrl && (
                                <img
                                  src={attachment.previewUrl}
                                  alt={attachment.name}
                                  className="chat-dock-pending-image"
                                />
                              )}
                              {attachment.kind === "audio" && attachment.previewUrl && (
                                <audio
                                  controls
                                  preload="metadata"
                                  className="chat-dock-pending-audio"
                                >
                                  <source
                                    src={attachment.previewUrl}
                                    type={attachment.file?.type || undefined}
                                  />
                                  Your browser does not support audio playback.
                                </audio>
                              )}
                              {attachment.kind === "video" && attachment.previewUrl && (
                                <video
                                  controls
                                  preload="metadata"
                                  playsInline
                                  className="chat-dock-pending-video"
                                >
                                  <source
                                    src={attachment.previewUrl}
                                    type={attachment.file?.type || undefined}
                                  />
                                  Your browser does not support video playback.
                                </video>
                              )}
                              {attachment.kind === "file" && (
                                <div className="chat-dock-pending-file-fallback">
                                  <UploadIcon width="16" height="16" />
                                  <span>Attachment ready</span>
                                </div>
                              )}
                            </div>
                            <div className="chat-dock-pending-meta">
                              <strong title={attachment.name}>{attachment.name}</strong>
                              <small>
                                {attachment.kind === "image"
                                    ? "Photo"
                                    : attachment.kind === "video"
                                      ? "Video"
                                      : attachment.kind === "audio"
                                        ? "Audio"
                                        : "Attachment"}
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {projectPickerOpen && (
                      <div className="chat-dock-project-picker">
                        <div className="chat-dock-search-input">
                          <SearchIcon width="16" height="16" />
                          <input
                            type="text"
                            value={projectQuery}
                            onChange={(event) => setProjectQuery(event.target.value)}
                            placeholder="Find a project to reference"
                          />
                        </div>
                        <div className="chat-dock-results compact">
                          {projectSearchLoading && (
                            <p className="chat-dock-muted">Loading projects...</p>
                          )}
                          {!projectSearchLoading && projectResults.length === 0 && (
                            <p className="chat-dock-muted">No projects found.</p>
                          )}
                          {projectResults.map((project) => (
                            <button
                              key={project._id}
                              type="button"
                              className="chat-dock-result-item project"
                              onClick={() => handleAddProjectReference(project)}
                            >
                              <FolderIcon width="16" height="16" />
                              <span>{buildProjectLabel(project)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="chat-dock-compose-row">
                      {isPublicThread && activeMention && (
                        <div className="chat-dock-mention-picker">
                          <div className="chat-dock-mention-picker-head">
                            <span>Mention teammate</span>
                            <small>Use @ in Team Room</small>
                          </div>
                          <div className="chat-dock-mention-picker-list">
                            {mentionSearchLoading ? (
                              <p className="chat-dock-muted">
                                Finding teammates...
                              </p>
                            ) : mentionResults.length === 0 ? (
                              <p className="chat-dock-muted">
                                No teammate matches that mention.
                              </p>
                            ) : (
                              mentionResults.map((entry, index) => {
                                const mentionHandle = buildMentionHandle(entry);
                                const presenceMeta = getChatPresenceMeta(
                                  entry?.presence,
                                );
                                return (
                                  <button
                                    key={`${entry._id}-${mentionHandle}`}
                                    type="button"
                                    className={`chat-dock-mention-item ${
                                      index === highlightedMentionIndex
                                        ? "active"
                                        : ""
                                    }`}
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      handleSelectMention(entry);
                                    }}
                                  >
                                    <span className="chat-dock-user-avatar-wrap">
                                      <UserAvatar
                                        name={entry.name}
                                        src={entry.avatarUrl}
                                        width="30px"
                                        height="30px"
                                      />
                                      {presenceMeta.isOnline && (
                                        <span
                                          className="chat-dock-presence-dot"
                                          aria-hidden="true"
                                        />
                                      )}
                                    </span>
                                    <span className="chat-dock-mention-copy">
                                      <strong>{entry.name}</strong>
                                      <span className="chat-dock-mention-meta">
                                        <small>@{mentionHandle}</small>
                                        <span
                                          className={`chat-dock-user-presence ${
                                            presenceMeta.isOnline ? "online" : ""
                                          }`}
                                          title={presenceMeta.title || undefined}
                                        >
                                          {presenceMeta.label}
                                        </span>
                                      </span>
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                      <textarea
                        ref={composerTextareaRef}
                        value={composer}
                        onChange={handleComposerChange}
                        onSelect={handleComposerSelect}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={`Message ${activeThread.name}`}
                        rows="2"
                      />
                      <button
                        type="button"
                        className="chat-dock-send-btn"
                        onClick={() => void handleSendMessage()}
                        disabled={
                          sending ||
                          (!composer.trim() &&
                            selectedProjects.length === 0 &&
                            pendingAttachments.length === 0)
                        }
                        aria-label="Send chat message"
                      >
                        <SendIcon />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="chat-dock-empty large">
                  <ChatBubbleIcon width={32} height={32} />
                  <p>No chat selected yet.</p>
                </div>
              )}
            </div>
          </div>

          {error && <div className="chat-dock-error-banner">{error}</div>}
        </div>
      )}

      {incomingPreview && (
        <button
          key={incomingPreview.token}
          type="button"
          className={`chat-dock-incoming-preview ${portalPositionClass} ${
            incomingPreviewVisible ? "visible" : "closing"
          }`}
          onClick={() => void handleIncomingPreviewOpen()}
          aria-label={`Open chat from ${incomingPreview.senderName}`}
        >
          <div className="chat-dock-incoming-preview-head">
            <span className="chat-dock-incoming-preview-avatar">
              <UserAvatar
                name={incomingPreview.senderName}
                src={incomingPreview.senderAvatarUrl}
                width="44px"
                height="44px"
              />
            </span>
            <span className="chat-dock-incoming-preview-copy">
              <strong>{incomingPreview.senderName}</strong>
              {incomingPreview.threadName &&
                incomingPreview.threadName !== incomingPreview.senderName && (
                  <small>{incomingPreview.threadName}</small>
                )}
            </span>
          </div>
          <p className="chat-dock-incoming-preview-message">
            {incomingPreview.messagePreview}
          </p>
        </button>
      )}

      <button
        type="button"
        className={`chat-dock-fab ${portalPositionClass} ${isOpen ? "active" : ""} ${
          incomingPreviewVisible ? "has-preview" : ""
        }`}
        onClick={isOpen ? handleClose : handleOpen}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        <span className="chat-dock-fab-icon">
          <ChatBubbleIcon />
        </span>
        <span className="chat-dock-fab-label">Chat</span>
        {unreadTotal > 0 && <span className="chat-dock-fab-badge">{unreadTotal}</span>}
      </button>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Message"
        message="Are you sure you want to delete chat? Action can't be reversed"
        confirmText={deletingMessageId ? "Deleting..." : "Delete"}
        onConfirm={handleConfirmDeleteMessage}
        onCancel={handleCancelDeleteMessage}
      />
      <ConfirmDialog
        isOpen={Boolean(clearThreadTarget)}
        title="Clear Messages"
        message="Clear messages from this chat for your account? This won't affect other users."
        confirmText={clearingThreadId ? "Clearing..." : "Clear"}
        onConfirm={handleConfirmClearThread}
        onCancel={handleCancelClearThread}
      />
    </>
  );
};

export default ChatDock;
