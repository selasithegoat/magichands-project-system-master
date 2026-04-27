import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { appendPortalSource, resolvePortalSource } from "../../utils/portalSource";
import "./ProjectComments.css";

const CHAT_OPEN_EVENT_NAME = "mh:open-chat";
const MAX_MENTION_SUGGESTIONS = 8;

const toText = (value) => String(value || "").trim();

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    if (value._id) return toIdString(value._id);
    if (value.id) return String(value.id).trim();
  }
  return "";
};

const normalizeMentionHandle = (value) =>
  toText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.|\.$/g, "");

const getMentionHandle = (user) => {
  const fullName = `${toText(user?.firstName)} ${toText(user?.lastName)}`
    .trim()
    .replace(/\s+/g, " ");
  const emailLocalPart = toText(user?.email).split("@")[0] || "";
  return normalizeMentionHandle(
    user?.handle || fullName || user?.name || emailLocalPart,
  );
};

const getUserName = (user) => {
  const firstName = toText(user?.firstName);
  const lastName = toText(user?.lastName);
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return fullName || user?.name || user?.email || "Unknown User";
};

const getAuthorMeta = (author) => {
  return author?.role === "admin" ? "Admin" : "";
};

const formatCommentTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getActiveMention = (text, caretPosition) => {
  if (!Number.isFinite(caretPosition)) return null;

  const safeText = String(text || "");
  const safeCaret = Math.max(0, Math.min(caretPosition, safeText.length));
  const textBeforeCaret = safeText.slice(0, safeCaret);
  const match = textBeforeCaret.match(/(^|[\s(])@([a-z0-9._-]{0,60})$/i);
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

const filterMentionUsers = (users, query, currentUserId) => {
  const normalizedQuery = toText(query).toLowerCase();
  const relaxedQuery = normalizedQuery.replace(/[._-]+/g, " ");
  const compactQuery = normalizedQuery.replace(/[._-]+/g, "");
  const deduped = [];
  const seenHandles = new Set();

  (Array.isArray(users) ? users : []).forEach((user) => {
    const userId = toIdString(user?._id || user?.id);
    const handle = getMentionHandle(user);
    if (!userId || userId === currentUserId || !handle || seenHandles.has(handle)) {
      return;
    }

    if (normalizedQuery) {
      const displayName = getUserName(user).toLowerCase();
      const compactName = displayName.replace(/\s+/g, "");
      if (
        !handle.includes(normalizedQuery) &&
        !displayName.includes(relaxedQuery) &&
        !compactName.includes(compactQuery)
      ) {
        return;
      }
    }

    seenHandles.add(handle);
    deduped.push({ ...user, handle });
  });

  return deduped;
};

const countVisibleComments = (comments = []) =>
  comments.reduce((total, comment) => {
    const ownCount = comment?.isDeleted ? 0 : 1;
    return total + ownCount + countVisibleComments(comment?.replies || []);
  }, 0);

const collectMentionUsersFromComments = (comments = []) => {
  const users = [];
  const visit = (comment) => {
    if (Array.isArray(comment?.mentions)) {
      users.push(...comment.mentions);
    }
    (comment?.replies || []).forEach(visit);
  };

  comments.forEach(visit);
  return users;
};

const collectUnreadCommentIds = (comments = [], currentUserId = "") => {
  if (!currentUserId) return [];

  const unreadIds = [];
  const visit = (comment) => {
    if (!comment) return;

    const commentId = toIdString(comment._id);
    const authorId = toIdString(comment.author);
    const readByIds = (Array.isArray(comment.readBy) ? comment.readBy : [])
      .map(toIdString)
      .filter(Boolean);

    if (
      commentId &&
      !comment.isDeleted &&
      authorId &&
      authorId !== currentUserId &&
      !readByIds.includes(currentUserId)
    ) {
      unreadIds.push(commentId);
    }

    (comment.replies || []).forEach(visit);
  };

  comments.forEach(visit);
  return unreadIds;
};

const ProjectComments = ({
  projectId,
  currentUser,
  source = "",
  className = "",
  title = "Project Comments",
}) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [toast, setToast] = useState("");
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [activeMention, setActiveMention] = useState(null);
  const composerTextareaRef = useRef(null);

  const currentUserId = toIdString(currentUser?._id || currentUser?.id);
  const requestSource = source || resolvePortalSource();
  const commentCount = useMemo(() => countVisibleComments(comments), [comments]);
  const commentMentionUsers = useMemo(
    () => collectMentionUsersFromComments(comments),
    [comments],
  );
  const mentionDirectory = useMemo(() => {
    const directory = new Map();
    [...mentionUsers, ...commentMentionUsers].forEach((user) => {
      const handle = getMentionHandle(user);
      if (!handle || directory.has(handle)) return;
      directory.set(handle, { ...user, handle });
    });
    return directory;
  }, [commentMentionUsers, mentionUsers]);

  const buildUrl = useCallback(
    (path) => appendPortalSource(path, requestSource),
    [requestSource],
  );

  const fetchComments = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await fetch(
        buildUrl(`/api/projects/${projectId}/comments`),
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        setComments([]);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      const nextComments = Array.isArray(payload.comments) ? payload.comments : [];
      setComments(nextComments);

      const unreadCommentIds = collectUnreadCommentIds(nextComments, currentUserId);
      if (unreadCommentIds.length > 0) {
        await fetch(buildUrl(`/api/projects/${projectId}/comments/read`), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentIds: unreadCommentIds }),
        });
      }
    } catch (error) {
      console.error("Failed to load project comments", error);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [buildUrl, currentUserId, projectId]);

  const fetchMentionUsers = useCallback(async () => {
    if (!projectId) return;
    setMentionLoading(true);
    try {
      const response = await fetch(
        buildUrl(`/api/projects/${projectId}/comments/mentionable-users`),
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        setMentionUsers([]);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      setMentionUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      console.error("Failed to load project comment mention users", error);
      setMentionUsers([]);
    } finally {
      setMentionLoading(false);
    }
  }, [buildUrl, projectId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    fetchMentionUsers();
  }, [fetchMentionUsers]);

  useRealtimeRefresh(
    () => {
      fetchComments();
      fetchMentionUsers();
    },
    {
      enabled: Boolean(projectId),
      paths: ["/api/projects"],
      shouldRefresh: (detail) =>
        Boolean(projectId && detail.projectId === projectId),
    },
  );

  useEffect(() => {
    if (loading || comments.length === 0 || typeof window === "undefined") {
      return;
    }

    const targetId = decodeURIComponent(window.location.hash || "").replace(
      /^#/,
      "",
    );
    if (!targetId.startsWith("project-comment-")) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    window.setTimeout(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  }, [comments, loading]);

  const mentionSuggestions = useMemo(
    () =>
      activeMention
        ? filterMentionUsers(mentionUsers, activeMention.query, currentUserId).slice(
            0,
            MAX_MENTION_SUGGESTIONS,
          )
        : [],
    [activeMention, currentUserId, mentionUsers],
  );

  const canManageComment = (comment) => {
    if (!comment || comment.isDeleted || !currentUserId) return false;
    if (currentUser?.role === "admin") return true;
    return toIdString(comment.author) === currentUserId;
  };

  const resetComposer = () => {
    setContent("");
    setReplyTarget(null);
    setActiveMention(null);
  };

  const syncComposerMentionState = (value, caretPosition) => {
    setActiveMention(getActiveMention(value, caretPosition));
  };

  const handleComposerChange = (event) => {
    const nextValue = event.target.value;
    setContent(nextValue);
    syncComposerMentionState(nextValue, event.target.selectionStart);
  };

  const handleComposerSelect = (event) => {
    syncComposerMentionState(event.target.value, event.target.selectionStart);
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === "Escape" && activeMention) {
      event.preventDefault();
      setActiveMention(null);
    }
  };

  const handleSelectMention = (user) => {
    const mentionHandle = getMentionHandle(user);
    if (!mentionHandle || !activeMention) return;

    const mentionText = `@${mentionHandle}`;
    const nextContent =
      `${content.slice(0, activeMention.start)}${mentionText} ` +
      content.slice(activeMention.end);
    const nextCaretPosition = activeMention.start + mentionText.length + 1;

    setContent(nextContent);
    setActiveMention(null);

    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange(
        nextCaretPosition,
        nextCaretPosition,
      );
    });
  };

  const openMentionChat = (user) => {
    const recipientId = toIdString(user?._id || user?.id);
    if (!recipientId || recipientId === currentUserId) return;

    window.dispatchEvent(
      new CustomEvent(CHAT_OPEN_EVENT_NAME, {
        detail: {
          kind: "direct",
          recipientId,
        },
      }),
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const body = content.trim();
    if (!body || !projectId) return;

    setSubmitting(true);
    setToast("");
    try {
      const response = await fetch(
        buildUrl(`/api/projects/${projectId}/comments`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: body,
            parentComment: replyTarget?._id || null,
          }),
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setToast(errorData.message || "Failed to post comment.");
        return;
      }
      resetComposer();
      await fetchComments();
    } catch (error) {
      console.error("Failed to post project comment", error);
      setToast("Failed to post comment.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (comment) => {
    setEditingId(comment._id);
    setEditingContent(comment.content || "");
    setReplyTarget(null);
    setToast("");
  };

  const cancelEditing = () => {
    setEditingId("");
    setEditingContent("");
  };

  const saveEdit = async (commentId) => {
    const body = editingContent.trim();
    if (!body) return;

    setToast("");
    try {
      const response = await fetch(
        buildUrl(`/api/projects/${projectId}/comments/${commentId}`),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: body }),
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setToast(errorData.message || "Failed to edit comment.");
        return;
      }
      cancelEditing();
      await fetchComments();
    } catch (error) {
      console.error("Failed to edit project comment", error);
      setToast("Failed to edit comment.");
    }
  };

  const deleteComment = async (comment) => {
    if (!comment?._id) return;
    const confirmed = window.confirm("Delete this comment?");
    if (!confirmed) return;

    setToast("");
    try {
      const response = await fetch(
        buildUrl(`/api/projects/${projectId}/comments/${comment._id}`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setToast(errorData.message || "Failed to delete comment.");
        return;
      }
      await fetchComments();
    } catch (error) {
      console.error("Failed to delete project comment", error);
      setToast("Failed to delete comment.");
    }
  };

  const renderCommentContent = (text, keyPrefix) => {
    const commentText = String(text || "");
    if (!commentText) return null;

    const parts = [];
    const mentionPattern = /(^|[\s(])(@[a-z0-9._-]+)/gi;
    let lastIndex = 0;
    let match;

    while ((match = mentionPattern.exec(commentText)) !== null) {
      const leadingText = match[1] || "";
      const mentionText = match[2] || "";
      const mentionStart = match.index + leadingText.length;

      if (match.index > lastIndex) {
        parts.push(commentText.slice(lastIndex, match.index));
      }
      if (leadingText) {
        parts.push(leadingText);
      }

      const mentionHandle = normalizeMentionHandle(mentionText.replace(/^@/, ""));
      const mentionUser = mentionDirectory.get(mentionHandle);
      const canOpenMention =
        mentionUser && toIdString(mentionUser?._id || mentionUser?.id) !== currentUserId;

      parts.push(
        canOpenMention ? (
          <button
            key={`${keyPrefix}-mention-${mentionStart}`}
            type="button"
            className="project-comment-mention project-comment-mention-button"
            onClick={() => openMentionChat(mentionUser)}
          >
            {mentionText}
          </button>
        ) : (
          <span
            key={`${keyPrefix}-mention-${mentionStart}`}
            className="project-comment-mention"
          >
            {mentionText}
          </span>
        ),
      );

      lastIndex = mentionStart + mentionText.length;
    }

    if (lastIndex < commentText.length) {
      parts.push(commentText.slice(lastIndex));
    }

    return parts;
  };

  const renderComment = (comment, isReply = false) => {
    const author = comment?.author || {};
    const isEditing = editingId === comment?._id;
    const authorName = getUserName(author);
    const authorMeta = getAuthorMeta(author);

    return (
      <article
        id={`project-comment-${comment._id}`}
        key={comment._id}
        className={`project-comment ${isReply ? "is-reply" : ""} ${
          comment.isDeleted ? "is-deleted" : ""
        }`}
      >
        <div className="project-comment-avatar" aria-hidden="true">
          {authorName
            .split(" ")
            .map((part) => part.charAt(0))
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?"}
        </div>
        <div className="project-comment-body">
          <div className="project-comment-meta">
            <strong>{authorName}</strong>
            {authorMeta && <span>{authorMeta}</span>}
            <span>{formatCommentTime(comment.createdAt)}</span>
            {comment.editedAt && !comment.isDeleted && <span>Edited</span>}
          </div>

          {comment.isDeleted ? (
            <p className="project-comment-deleted">Comment deleted.</p>
          ) : isEditing ? (
            <div className="project-comment-edit">
              <textarea
                value={editingContent}
                onChange={(event) => setEditingContent(event.target.value)}
                rows="3"
                maxLength={3000}
              />
              <div className="project-comment-actions">
                <button type="button" onClick={cancelEditing}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => saveEdit(comment._id)}
                  disabled={!editingContent.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="project-comment-text">
                {renderCommentContent(comment.content, comment._id)}
              </p>
              <div className="project-comment-actions">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTarget(comment);
                    setEditingId("");
                    setEditingContent("");
                  }}
                >
                  Reply
                </button>
                {canManageComment(comment) && (
                  <>
                    <button type="button" onClick={() => startEditing(comment)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteComment(comment)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {!isReply && Array.isArray(comment.replies) && comment.replies.length > 0 && (
            <div className="project-comment-replies">
              {comment.replies.map((reply) => renderComment(reply, true))}
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className={`project-comments-panel ${className}`.trim()}>
      <div className="project-comments-header">
        <div>
          <span className="project-comments-kicker">Shared thread</span>
          <h3>{title}</h3>
        </div>
        <span className="project-comments-count">
          {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </span>
      </div>

      <div className="project-comments-list">
        {loading ? (
          <div className="project-comments-empty">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="project-comments-empty">No comments yet.</div>
        ) : (
          comments.map((comment) => renderComment(comment))
        )}
      </div>

      <form className="project-comment-composer" onSubmit={handleSubmit}>
        {replyTarget && (
          <div className="project-comment-replying">
            <span>Replying to {getUserName(replyTarget.author)}</span>
            <button type="button" onClick={() => setReplyTarget(null)}>
              Cancel
            </button>
          </div>
        )}
        {toast && <div className="project-comments-error">{toast}</div>}
        <div className="project-comment-composer-field">
          <textarea
            ref={composerTextareaRef}
            value={content}
            onChange={handleComposerChange}
            onSelect={handleComposerSelect}
            onKeyDown={handleComposerKeyDown}
            rows="3"
            maxLength={3000}
            placeholder="Write a comment... Type @ to mention someone."
            disabled={submitting}
          />
          {activeMention && (
            <div className="project-comment-mention-picker" role="listbox">
              <div className="project-comment-mention-picker-head">
                <span>Mention someone</span>
                <small>
                  {mentionLoading
                    ? "Loading..."
                    : `${mentionSuggestions.length} shown`}
                </small>
              </div>
              <div className="project-comment-mention-picker-list">
                {mentionLoading ? (
                  <div className="project-comment-mention-empty">
                    Loading teammates...
                  </div>
                ) : mentionSuggestions.length === 0 ? (
                  <div className="project-comment-mention-empty">
                    No project user matches that mention.
                  </div>
                ) : (
                  mentionSuggestions.map((user) => (
                    <button
                      key={`${toIdString(user._id || user.id)}-${user.handle}`}
                      type="button"
                      className="project-comment-mention-item"
                      onClick={() => handleSelectMention(user)}
                    >
                      <span className="project-comment-mention-avatar" aria-hidden="true">
                        {getUserName(user)
                          .split(" ")
                          .map((part) => part.charAt(0))
                          .join("")
                          .slice(0, 2)
                          .toUpperCase() || "?"}
                      </span>
                      <span className="project-comment-mention-copy">
                        <strong>{getUserName(user)}</strong>
                        <small>@{user.handle}</small>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="project-comment-composer-actions">
          <span>{content.trim().length}/3000</span>
          <button type="submit" disabled={submitting || !content.trim()}>
            {submitting ? "Posting..." : replyTarget ? "Post Reply" : "Post Comment"}
          </button>
        </div>
      </form>
    </section>
  );
};

export default ProjectComments;
