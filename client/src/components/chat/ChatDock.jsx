import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAdaptivePolling from "../../hooks/useAdaptivePolling";
import UserAvatar from "../ui/UserAvatar";
import UsersIcon from "../icons/UsersIcon";
import PersonIcon from "../icons/PersonIcon";
import SearchIcon from "../icons/SearchIcon";
import FolderIcon from "../icons/FolderIcon";
import XIcon from "../icons/XIcon";
import "./ChatDock.css";

const THREAD_POLL_INTERVAL_MS = 20000;
const THREAD_HIDDEN_POLL_INTERVAL_MS = 60000;

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
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] = useState([]);
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const activeThreadIdRef = useRef("");
  const isOpenRef = useRef(false);
  const messageRequestIdRef = useRef(0);
  const messagesEndRef = useRef(null);

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
    if (threads.length === 0) {
      void fetchThreads({ preserveSelection: false });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSidebarMode("threads");
    setProjectPickerOpen(false);
  };

  const handleSelectThread = (threadId) => {
    setActiveThreadId(threadId);
    setSidebarMode("threads");
    setError("");
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
      setUserQuery("");
      setUserResults([]);
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

  const handleSendMessage = async () => {
    if (!activeThreadId || sending) return;

    const trimmedComposer = composer.trim();
    if (!trimmedComposer && selectedProjects.length === 0) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const res = await fetch(`/api/chat/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: trimmedComposer,
          references: selectedProjects.map((project) => ({
            projectId: project._id,
          })),
        }),
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
      setProjectPickerOpen(false);
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

  const handleNavigateProject = (projectId) => {
    if (!projectId) return;
    navigate(`/detail/${projectId}`);
  };

  return (
    <>
      {isOpen && (
        <div className="chat-dock-shell" role="dialog" aria-modal="false">
          <div className="chat-dock-panel">
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
                  onClick={() => setSidebarMode("threads")}
                >
                  Threads
                </button>
                <button
                  type="button"
                  className={`chat-dock-chip-btn ${
                    sidebarMode === "users" ? "active" : ""
                  }`}
                  onClick={() => setSidebarMode("users")}
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
                    <div className="chat-dock-thread-title">
                      <span className="chat-dock-thread-badge">
                        {activeThread.type === "public" ? "Public" : "Direct"}
                      </span>
                      <h3>{activeThread.name}</h3>
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
                              {references.length > 0 && (
                                <div className="chat-dock-reference-stack">
                                  {references.map((reference) => (
                                    <button
                                      key={`${message._id}-${reference.projectId}`}
                                      type="button"
                                      className="chat-dock-reference-card"
                                      onClick={() =>
                                        handleNavigateProject(reference.projectId)
                                      }
                                    >
                                      <FolderIcon width="16" height="16" />
                                      <span>{buildProjectLabel(reference)}</span>
                                    </button>
                                  ))}
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
                    </div>

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
                        disabled={sending || (!composer.trim() && selectedProjects.length === 0)}
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
