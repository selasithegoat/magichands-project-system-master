import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAdaptivePolling from "../../hooks/useAdaptivePolling";
import UserAvatar from "../ui/UserAvatar";
import UsersIcon from "../icons/UsersIcon";
import PersonIcon from "../icons/PersonIcon";
import SearchIcon from "../icons/SearchIcon";
import FolderIcon from "../icons/FolderIcon";
import UploadIcon from "../icons/UploadIcon";
import XIcon from "../icons/XIcon";
import "./ChatDock.css";

const THREAD_POLL_INTERVAL_MS = 20000;
const THREAD_HIDDEN_POLL_INTERVAL_MS = 60000;
const CHAT_ATTACHMENT_MAX_FILES = 6;
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
  const messagesEndRef = useRef(null);
  const projectRouteCacheRef = useRef(new Map());
  const attachmentInputRef = useRef(null);
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
  const unreadTotal = useMemo(
    () =>
      threads.reduce((sum, thread) => sum + (Number(thread.unreadCount) || 0), 0),
    [threads],
  );

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

  const fetchThreads = useCallback(
    async ({ preserveSelection = true, focusThreadId = "" } = {}) => {
      if (!currentUserId) return;

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
      } catch (fetchError) {
        setError(fetchError.message || "Failed to load chats.");
      } finally {
        setThreadsLoading(false);
      }
    },
    [currentUserId],
  );

  const markThreadRead = useCallback(async (threadId) => {
    if (!threadId) return;

    try {
      await fetch(`/api/chat/threads/${threadId}/read`, {
        method: "POST",
        credentials: "include",
      });
      setThreads((prev) =>
        prev.map((thread) =>
          thread._id === threadId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );
    } catch (readError) {
      console.error("Failed to mark chat thread as read", readError);
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
      const changedThreadId = toIdString(event?.detail?.threadId);
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
  }, [currentUserId, fetchMessages, fetchThreads]);

  useEffect(() => {
    if (sidebarMode !== "users") return undefined;

    const timerId = window.setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const query = encodeURIComponent(userQuery.trim());
        const res = await fetch(`/api/chat/users?q=${query}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Failed to find teammates.");
        }
        setUserResults(Array.isArray(data?.users) ? data.users : []);
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
  }, [sidebarMode, userQuery]);

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

  const handleOpen = () => {
    setIsOpen(true);
    setError("");
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
    resetProjectRoutePicker();
  };

  const handleStartDirectThread = async (recipientId) => {
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
  };

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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
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
                    {userResults.map((entry) => (
                      <button
                        key={entry._id}
                        type="button"
                        className="chat-dock-result-item"
                        onClick={() => void handleStartDirectThread(entry._id)}
                      >
                        <UserAvatar
                          name={entry.name}
                          src={entry.avatarUrl}
                          width="32px"
                          height="32px"
                        />
                        <span>{entry.name}</span>
                      </button>
                    ))}
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
                    {activeThread.counterpart && (
                      <div className="chat-dock-counterpart">
                        <UserAvatar
                          name={activeThread.counterpart.name}
                          src={activeThread.counterpart.avatarUrl}
                          width="28px"
                          height="28px"
                        />
                        <span>{activeThread.counterpart.name}</span>
                      </div>
                    )}
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
                            <div className={`chat-dock-message-bubble ${isMine ? "mine" : ""}`}>
                              <div className="chat-dock-message-meta">
                                <strong>{isMine ? "You" : message?.sender?.name || "User"}</strong>
                                <span>{formatThreadTime(message.createdAt)}</span>
                              </div>
                              {message.body && <p>{message.body}</p>}
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
                      <textarea
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
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
    </>
  );
};

export default ChatDock;
