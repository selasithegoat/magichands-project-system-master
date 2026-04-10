import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import "./ChatDock.css";

const THREAD_POLL_INTERVAL_MS = 20000;
const THREAD_HIDDEN_POLL_INTERVAL_MS = 60000;
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const CHAT_ATTACHMENT_MAX_FILES = 6;
const CHAT_OPEN_EVENT_NAME = "mh:open-chat";
const CHAT_ATTACHMENT_ACCEPT =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.cdr";
const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];
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

const MicrophoneIcon = ({ width = 18, height = 18 }) => (
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
    <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <path d="M12 18v3" />
    <path d="M8 21h8" />
  </svg>
);

const StopRecordingIcon = ({ width = 18, height = 18 }) => (
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
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
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

const getExtensionForMimeType = (mimeType) => {
  const normalized = toText(mimeType).toLowerCase();
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "webm";
};

const createPendingAttachment = (file, source = "upload") => {
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
    source,
    previewUrl,
    name: getAttachmentName(baseAttachment),
    kind: getAttachmentType(baseAttachment),
  };
};

const formatRecordingDuration = (totalSeconds = 0) => {
  const safeSeconds = Math.max(Number(totalSeconds) || 0, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const ChatDock = ({ user }) => {
  const navigate = useNavigate();
  const currentUserId = toIdString(user?._id || user?.id);
  const [isOpen, setIsOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clearThreadTarget, setClearThreadTarget] = useState(null);
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [clearingThreadId, setClearingThreadId] = useState("");
  const [openMessageMenuId, setOpenMessageMenuId] = useState("");
  const [isThreadMenuOpen, setIsThreadMenuOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [savingMessageId, setSavingMessageId] = useState("");
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
  const markReadInFlightRef = useRef(new Set());
  const playedIncomingMessageIdsRef = useRef(new Set());
  const messagesEndRef = useRef(null);
  const projectRouteCacheRef = useRef(new Map());
  const attachmentInputRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const pendingAttachmentsRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const shouldSaveRecordingRef = useRef(true);
  const isMountedRef = useRef(true);
  const isRecordingSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    Boolean(window.navigator?.mediaDevices?.getUserMedia);

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

  const fetchChatUsers = useCallback(async ({ query = "", limit } = {}) => {
    const params = new URLSearchParams();
    const trimmedQuery = toText(query);

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }
    if (Number.isFinite(limit) && limit > 0) {
      params.set("limit", String(limit));
    }

    const requestUrl = params.toString()
      ? `/api/chat/users?${params.toString()}`
      : "/api/chat/users";
    const res = await fetch(requestUrl, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || "Failed to load teammates.");
    }

    return Array.isArray(data?.users) ? data.users : [];
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

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const stopRecordingStream = useCallback(() => {
    const stream = recordingStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  }, []);

  const stopActiveRecording = useCallback(
    (saveRecording) => {
      shouldSaveRecordingRef.current = Boolean(saveRecording);
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
        return;
      }

      clearRecordingTimer();
      stopRecordingStream();
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
      shouldSaveRecordingRef.current = true;
      if (isMountedRef.current) {
        setIsRecording(false);
        setRecordingDuration(0);
      }
    },
    [clearRecordingTimer, stopRecordingStream],
  );

  const clearPendingAttachments = useCallback(() => {
    replacePendingAttachments([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, [replacePendingAttachments]);

  const addPendingFiles = useCallback(
    (incomingFiles, source = "upload") => {
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

      const draftAttachments = filesToAttach.map((file) =>
        createPendingAttachment(file, source),
      );
      replacePendingAttachments((prev) => [...prev, ...draftAttachments]);
    },
    [replacePendingAttachments],
  );

  const cancelRecording = useCallback(() => {
    stopActiveRecording(false);
  }, [stopActiveRecording]);

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
      isMountedRef.current = false;
      shouldSaveRecordingRef.current = false;
      clearRecordingTimer();
      stopRecordingStream();

      try {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch (recordingError) {
        console.error("Failed to stop chat recorder during cleanup", recordingError);
      }

      pendingAttachmentsRef.current.forEach((attachment) => {
        revokePendingAttachmentPreview(attachment);
      });
    },
    [clearRecordingTimer, revokePendingAttachmentPreview, stopRecordingStream],
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
    async ({ preserveSelection = true, focusThreadId = "" } = {}) => {
      if (!currentUserId) return [];

      setThreadsLoading(true);

      try {
        const res = await fetch("/api/chat/threads", {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || "Failed to load chats.");
        }

        const nextThreads = Array.isArray(data?.threads) ? data.threads : [];
        setThreads(nextThreads);
        setError("");
        setActiveThreadId((prev) => {
          if (
            focusThreadId &&
            nextThreads.some((thread) => thread._id === focusThreadId)
          ) {
            return focusThreadId;
          }
          if (
            preserveSelection &&
            prev &&
            nextThreads.some((thread) => thread._id === prev)
          ) {
            return prev;
          }
          return nextThreads[0]?._id || "";
        });
        return nextThreads;
      } catch (fetchError) {
        setError(fetchError.message || "Failed to load chats.");
        return [];
      } finally {
        setThreadsLoading(false);
      }
    },
    [currentUserId],
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

      setThreads((prev) =>
        prev.map((thread) =>
          thread._id === threadId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );
    } catch (readError) {
      console.error("Failed to mark chat thread as read", readError);
    } finally {
      markReadInFlightRef.current.delete(threadId);
    }
  }, []);

  const fetchMessages = useCallback(
    async (threadId, { markRead = true } = {}) => {
      if (!threadId) {
        setMessages([]);
        return;
      }

      const requestId = messageRequestIdRef.current + 1;
      messageRequestIdRef.current = requestId;
      setMessagesLoading(true);

      try {
        const res = await fetch(
          `/api/chat/threads/${threadId}/messages?limit=60`,
          {
            credentials: "include",
          },
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || "Failed to load messages.");
        }

        if (messageRequestIdRef.current !== requestId) {
          return;
        }

        const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(nextMessages);
        setError("");
        if (data?.thread?._id) {
          setThreads((prev) =>
            prev.map((thread) =>
              thread._id === data.thread._id ? { ...thread, ...data.thread } : thread,
            ),
          );
        }

        if (markRead) {
          void markThreadRead(threadId);
        }
      } catch (fetchError) {
        if (messageRequestIdRef.current === requestId) {
          setError(fetchError.message || "Failed to load messages.");
        }
      } finally {
        if (messageRequestIdRef.current === requestId) {
          setMessagesLoading(false);
        }
      }
    },
    [markThreadRead],
  );

  useEffect(() => {
    if (!currentUserId) return;
    void fetchThreads({ preserveSelection: false });
  }, [currentUserId, fetchThreads]);

  useAdaptivePolling(() => fetchThreads(), {
    enabled: Boolean(currentUserId),
    intervalMs: THREAD_POLL_INTERVAL_MS,
    hiddenIntervalMs: THREAD_HIDDEN_POLL_INTERVAL_MS,
    runImmediately: false,
  });

  useEffect(() => {
    if (!isOpen || !activeThreadId) return;
    void fetchMessages(activeThreadId);
  }, [activeThreadId, fetchMessages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isOpen, messages]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const handleChatChanged = (event) => {
      const changeType = String(event?.detail?.changeType || "").toLowerCase();
      const changedThreadId = toIdString(event?.detail?.threadId);
      const changedMessageId = toIdString(event?.detail?.messageId);
      const senderId = toIdString(event?.detail?.senderId);

      if (
        changeType === "message_created" &&
        changedMessageId &&
        senderId &&
        senderId !== currentUserId &&
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

      void fetchThreads();

      if (
        isOpenRef.current &&
        changedThreadId &&
        changedThreadId === activeThreadIdRef.current
      ) {
        void fetchMessages(changedThreadId);
      }
    };

    window.addEventListener("mh:chat-changed", handleChatChanged);
    return () => {
      window.removeEventListener("mh:chat-changed", handleChatChanged);
    };
  }, [currentUserId, fetchMessages, fetchThreads, user?.notificationSettings?.sound]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const handlePresenceChanged = () => {
      if (!isOpen) return;

      void fetchThreads();

      if (sidebarMode === "users") {
        void fetchChatUsers({ query: userQuery })
          .then((nextUsers) => {
            setUserResults(nextUsers);
          })
          .catch((presenceError) => {
            console.error("Failed to refresh chat user presence", presenceError);
          });
      }

      if (isPublicThread) {
        void fetchChatUsers({ limit: 500 })
          .then((nextUsers) => {
            setPublicMentionUsers(nextUsers);
          })
          .catch((presenceError) => {
            console.error(
              "Failed to refresh public chat user presence",
              presenceError,
            );
          });
      }

      if (isPublicThread && activeMention) {
        const rawQuery = toText(activeMention.query).toLowerCase();
        const mentionSearchQuery =
          rawQuery.split(/[._-]+/).filter(Boolean)[0] || "";

        void fetchChatUsers({
          query: mentionSearchQuery,
          limit: 500,
        })
          .then((nextUsers) => {
            const nextMentionUsers = filterMentionUsers(nextUsers, rawQuery);
            setMentionResults(nextMentionUsers);
            setHighlightedMentionIndex((prev) =>
              nextMentionUsers.length === 0
                ? 0
                : Math.min(prev, nextMentionUsers.length - 1),
            );
          })
          .catch((presenceError) => {
            console.error(
              "Failed to refresh mention presence suggestions",
              presenceError,
            );
          });
      }
    };

    window.addEventListener("mh:presence-changed", handlePresenceChanged);
    return () => {
      window.removeEventListener("mh:presence-changed", handlePresenceChanged);
    };
  }, [
    activeMention,
    currentUserId,
    fetchChatUsers,
    fetchThreads,
    isOpen,
    isPublicThread,
    sidebarMode,
    userQuery,
  ]);

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
        const query = encodeURIComponent(projectQuery.trim());
        const res = await fetch(`/api/chat/projects?q=${query}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Failed to find projects.");
        }
        setProjectResults(Array.isArray(data?.projects) ? data.projects : []);
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
  }, [projectPickerOpen, projectQuery]);

  useEffect(() => {
    if (!isPublicThread || !activeMention) return undefined;

    let cancelled = false;
    const timerId = window.setTimeout(async () => {
      setMentionSearchLoading(true);
      try {
        const rawQuery = toText(activeMention.query).toLowerCase();
        const mentionSearchQuery =
          rawQuery.split(/[._-]+/).filter(Boolean)[0] || "";
        const users = await fetchChatUsers({
          query: mentionSearchQuery,
          limit: 500,
        });
        const nextUsers = filterMentionUsers(users, rawQuery);
        if (cancelled) return;
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
  }, [activeMention, fetchChatUsers, isPublicThread]);

  const handleOpen = () => {
    setIsOpen(true);
    setError("");
    clearMentionState();
    setMobilePanelView(activeThreadId ? "thread" : "sidebar");
    if (threads.length === 0) {
      void fetchThreads({ preserveSelection: false });
    }
  };

  const handleClose = () => {
    cancelRecording();
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
    clearMentionState();
    resetProjectRoutePicker();
  };

  const handleSidebarModeChange = (mode) => {
    setSidebarMode(mode);
    setMobilePanelView("sidebar");
  };

  const handleSelectThread = (threadId) => {
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
    clearMentionState();
    resetProjectRoutePicker();
  };

  const handleStartDirectThread = useCallback(async (recipientId) => {
    try {
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
      setSidebarMode("threads");
      setMobilePanelView("thread");
      setUserQuery("");
      setUserResults([]);
      resetProjectRoutePicker();
      await fetchThreads({ focusThreadId: nextThreadId });
      setIsOpen(true);
    } catch (threadError) {
      setError(threadError.message || "Failed to open direct chat.");
    }
  }, [fetchThreads, resetProjectRoutePicker]);

  const handleOpenPublicThread = useCallback(async () => {
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

    const existingPublicThreadId =
      threads.find((thread) => thread?.type === "public")?._id || "";
    if (existingPublicThreadId) {
      setActiveThreadId(existingPublicThreadId);
      return;
    }

    const nextThreads = await fetchThreads({ preserveSelection: false });
    const publicThreadId =
      nextThreads.find((thread) => thread?.type === "public")?._id ||
      nextThreads[0]?._id ||
      "";
    setActiveThreadId(publicThreadId);
  }, [clearMentionState, fetchThreads, resetProjectRoutePicker, threads]);

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
    addPendingFiles(event.target.files, "upload");
    event.target.value = "";
  };

  const handleRemovePendingAttachment = (attachmentId) => {
    replacePendingAttachments((prev) =>
      prev.filter((attachment) => attachment.id !== attachmentId),
    );
  };

  const handleStartRecording = async () => {
    if (sending || isRecording) return;
    if (!isRecordingSupported) {
      setError("Audio recording is not supported on this browser.");
      return;
    }
    if (pendingAttachmentsRef.current.length >= CHAT_ATTACHMENT_MAX_FILES) {
        setError(
        `You can attach up to ${CHAT_ATTACHMENT_MAX_FILES} files per message.`,
      );
      return;
    }

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      const MediaRecorderCtor = window.MediaRecorder;
      const preferredMimeType = RECORDING_MIME_CANDIDATES.find((mimeType) =>
        typeof MediaRecorderCtor.isTypeSupported === "function"
          ? MediaRecorderCtor.isTypeSupported(mimeType)
          : true,
      );
      const recorder = preferredMimeType
        ? new MediaRecorderCtor(stream, { mimeType: preferredMimeType })
        : new MediaRecorderCtor(stream);

      mediaRecorderRef.current = recorder;
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      shouldSaveRecordingRef.current = true;
      setIsRecording(true);
      setRecordingDuration(0);
      setError("");

      const recordingStartedAt = Date.now();

      recorder.addEventListener("dataavailable", (recordingEvent) => {
        if (recordingEvent.data && recordingEvent.data.size > 0) {
          recordingChunksRef.current.push(recordingEvent.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const shouldSave = shouldSaveRecordingRef.current;
        const recordedChunks = [...recordingChunksRef.current];
        const finalMimeType =
          recorder.mimeType || preferredMimeType || "audio/webm";

        shouldSaveRecordingRef.current = true;
        recordingChunksRef.current = [];
        clearRecordingTimer();
        stopRecordingStream();
        mediaRecorderRef.current = null;

        if (isMountedRef.current) {
          setIsRecording(false);
          setRecordingDuration(0);
        }

        if (!shouldSave || recordedChunks.length === 0 || !isMountedRef.current) {
          return;
        }

        const recordedBlob = new Blob(recordedChunks, { type: finalMimeType });
        if (!recordedBlob.size) return;

        const recordedFile = new File(
          [recordedBlob],
          `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.${getExtensionForMimeType(finalMimeType)}`,
          {
            type: finalMimeType,
            lastModified: Date.now(),
          },
        );

        addPendingFiles([recordedFile], "recording");
      });

      recorder.addEventListener("error", () => {
        shouldSaveRecordingRef.current = false;
        setError("Audio recording failed. Please try again.");
        stopActiveRecording(false);
      });

      recorder.start();
      recordingTimerRef.current = window.setInterval(() => {
        if (!isMountedRef.current) return;
        setRecordingDuration(
          Math.max(Math.floor((Date.now() - recordingStartedAt) / 1000), 0),
        );
      }, 1000);
    } catch (recordingError) {
      console.error("Failed to start chat recording", recordingError);
      shouldSaveRecordingRef.current = false;
      clearRecordingTimer();
      stopRecordingStream();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
      setError(
        recordingError?.name === "NotAllowedError"
          ? "Microphone access was denied."
          : "Could not start audio recording.",
      );
    }
  };

  const handleStopRecording = () => {
    stopActiveRecording(true);
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

  const handleSendMessage = async () => {
    if (!activeThreadId || sending || isRecording) return;

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
        setMessages((prev) => [...prev, nextMessage]);
      }
      setComposer("");
      clearMentionState();
      setSelectedProjects([]);
      clearPendingAttachments();
      setProjectPickerOpen(false);
      resetProjectRoutePicker();
      await fetchThreads({ focusThreadId: activeThreadId });
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
    if (!message?._id || message?.isDeleted) return;

    if (!isMessageWithinEditWindow(message)) {
      setOpenMessageMenuId("");
      setError("Messages can only be edited within 15 minutes of sending.");
      return;
    }

    setEditingMessageId(message._id);
    setEditDraft(message?.body || "");
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
        setMessages((prev) =>
          prev.map((message) =>
            message._id === nextMessage._id ? nextMessage : message,
          ),
        );
      }
      setEditingMessageId("");
      setEditDraft("");
      await fetchThreads({ focusThreadId: activeThreadId });
    } catch (editError) {
      setError(editError.message || "Failed to edit message.");
    } finally {
      setSavingMessageId("");
    }
  };

  const handleRequestDeleteMessage = (message) => {
    if (!message?._id || message?.isDeleted) return;
    setDeleteTarget({
      _id: message._id,
    });
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
        setMessages((prev) =>
          prev.map((message) =>
            message._id === nextMessage._id ? nextMessage : message,
          ),
        );
      }
      setDeleteTarget(null);
      if (editingMessageId === messageId) {
        setEditingMessageId("");
        setEditDraft("");
      }
      resetProjectRoutePicker();
      await fetchThreads({ focusThreadId: activeThreadId });
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
        setThreads((prev) =>
          prev.map((thread) =>
            thread._id === nextThread._id ? { ...thread, ...nextThread } : thread,
          ),
        );
      }

      if (activeThreadIdRef.current === threadId) {
        setMessages([]);
      }

      setClearThreadTarget(null);
      setDeleteTarget(null);
      setOpenMessageMenuId("");
      setEditingMessageId("");
      setEditDraft("");
      resetProjectRoutePicker();

      await fetchThreads({ focusThreadId: threadId });

      if (isOpenRef.current && activeThreadIdRef.current === threadId) {
        await fetchMessages(threadId);
      }
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
        <div className="chat-dock-shell" role="dialog" aria-modal="false">
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

                  <div className="chat-dock-messages">
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
                        const wasEdited = Boolean(message?.editedAt) && !isDeleted;
                        const canEditMessage =
                          isMine && !isDeleted && isMessageWithinEditWindow(message);
                        const isMenuOpen = openMessageMenuId === message._id;
                        const isEditingMessage = editingMessageId === message._id;
                        const isSavingMessage = savingMessageId === message._id;
                        const isDeletingMessage = deletingMessageId === message._id;
                        const references = Array.isArray(message?.references)
                          ? message.references
                          : [];
                        const attachments = Array.isArray(message?.attachments)
                          ? message.attachments
                          : [];

                        return (
                          <div
                            key={message._id}
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
                              {(wasEdited || (isMine && !isDeleted)) && (
                                <div className="chat-dock-message-footer">
                                  <span className="chat-dock-message-status">
                                    {wasEdited ? "Edited" : ""}
                                  </span>
                                  {isMine && !isDeleted && !isEditingMessage && (
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
                      <button
                        type="button"
                        className={`chat-dock-toolbar-btn ${
                          isRecording ? "recording" : ""
                        }`}
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        disabled={sending || (!isRecording && !isRecordingSupported)}
                      >
                        {isRecording ? (
                          <StopRecordingIcon width="16" height="16" />
                        ) : (
                          <MicrophoneIcon width="16" height="16" />
                        )}
                        {isRecording
                          ? `Stop ${formatRecordingDuration(recordingDuration)}`
                          : "Voice Note"}
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

                    {isRecording && (
                      <div className="chat-dock-recording-banner" role="status">
                        <span className="chat-dock-recording-dot" aria-hidden="true" />
                        <span>Recording voice note</span>
                        <strong>{formatRecordingDuration(recordingDuration)}</strong>
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
                                {attachment.source === "recording"
                                  ? "Voice note"
                                  : attachment.kind === "image"
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
                          isRecording ||
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

      <button
        type="button"
        className={`chat-dock-fab ${isOpen ? "active" : ""}`}
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
