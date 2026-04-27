import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import XIcon from "../icons/XIcon";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import useAuthorizedProjectNavigation from "../../hooks/useAuthorizedProjectNavigation.jsx";
import { appendPortalSource, resolvePortalSource } from "../../utils/portalSource";
import "./ProjectCommentsFab.css";

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

const toText = (value) => String(value || "").trim();

const getUserName = (user) => {
  const firstName = toText(user?.firstName);
  const lastName = toText(user?.lastName);
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return fullName || user?.name || user?.email || "Unknown User";
};

const getProjectLabel = (project) =>
  toText(project?.orderId) ||
  toText(project?.projectIndicator) ||
  toIdString(project?._id).slice(-6).toUpperCase() ||
  "Project";

const getProjectName = (project) =>
  toText(project?.projectName) || toText(project?.client) || "Unnamed Project";

const getReadByIds = (comment) =>
  (Array.isArray(comment?.readBy) ? comment.readBy : [])
    .map(toIdString)
    .filter(Boolean);

const isUnreadFromOtherUser = (comment, currentUserId) => {
  if (!comment || !currentUserId) return false;
  const authorId = toIdString(comment.author);
  if (!authorId || authorId === currentUserId) return false;
  return !getReadByIds(comment).includes(currentUserId);
};

const filterUnreadComments = (
  comments,
  currentUserId,
  excludedCommentIds = new Set(),
) =>
  (Array.isArray(comments) ? comments : []).filter((comment) => {
    const commentId = toIdString(comment?._id);
    return (
      isUnreadFromOtherUser(comment, currentUserId) &&
      !excludedCommentIds.has(commentId)
    );
  });

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

const CommentBubbleIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
  </svg>
);

const ProjectCommentsFab = ({ user }) => {
  const navigate = useNavigate();
  const { navigateToProject, projectRouteChoiceDialog } =
    useAuthorizedProjectNavigation(user);
  const [isOpen, setIsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pendingReadCommentIdsRef = useRef(new Set());
  const requestSource = resolvePortalSource();
  const currentUserId = toIdString(user?._id || user?.id);
  const count = comments.length;

  const feedUrl = useMemo(
    () => appendPortalSource("/api/projects/comments/feed?limit=all", requestSource),
    [requestSource],
  );

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(feedUrl, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        setComments([]);
        setError("Could not load project comments.");
        return;
      }

      const payload = await response.json().catch(() => ({}));
      const nextComments = Array.isArray(payload.comments) ? payload.comments : [];
      const serverUnreadIds = new Set(
        nextComments.map((comment) => toIdString(comment?._id)).filter(Boolean),
      );
      for (const commentId of pendingReadCommentIdsRef.current) {
        if (!serverUnreadIds.has(commentId)) {
          pendingReadCommentIdsRef.current.delete(commentId);
        }
      }
      const unreadComments = filterUnreadComments(
        nextComments,
        currentUserId,
        pendingReadCommentIdsRef.current,
      );
      setComments(unreadComments);
    } catch (commentsError) {
      console.error("Failed to load project comment feed", commentsError);
      setComments([]);
      setError("Could not load project comments.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId, feedUrl]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useRealtimeRefresh(fetchComments, {
    enabled: Boolean(user?._id || user?.id),
    paths: ["/api/projects"],
    excludePaths: ["/api/projects/activities", "/api/projects/ai"],
  });

  const markCommentRead = useCallback(
    async (comment) => {
      const projectId = toIdString(comment?.project?._id);
      const commentId = toIdString(comment?._id);
      if (!projectId || !commentId) return;
      if (pendingReadCommentIdsRef.current.has(commentId)) return;

      pendingReadCommentIdsRef.current.add(commentId);

      setComments((currentComments) =>
        currentComments.filter(
          (currentComment) => toIdString(currentComment?._id) !== commentId,
        ),
      );

      try {
        const response = await fetch(
          appendPortalSource(
            `/api/projects/${projectId}/comments/read`,
            requestSource,
          ),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentIds: [commentId] }),
          },
        );
        if (!response.ok) {
          throw new Error(`Failed to mark project comment read: ${response.status}`);
        }
      } catch (readError) {
        pendingReadCommentIdsRef.current.delete(commentId);
        console.error("Failed to mark project comment read", readError);
        void fetchComments();
      }
    },
    [fetchComments, requestSource],
  );

  const openComment = (comment) => {
    const projectId = toIdString(comment?.project?._id);
    const commentId = toIdString(comment?._id);
    if (!projectId || !commentId) return;

    setIsOpen(false);
    void markCommentRead(comment);
    const hash = `project-comment-${commentId}`;

    if (requestSource === "admin" && user?.role === "admin") {
      navigate(`/projects/${projectId}?tab=Comments#${hash}`);
      return;
    }

    navigateToProject(comment.project, {
      detailSearch: "tab=Comments",
      hash,
      fallbackPath: "/client",
      allowGenericEngaged: true,
      title: "Choose Comment Page",
      message:
        "Choose where you want to open this project comment.",
    });
  };

  const countLabel = count > 999 ? "999+" : String(count);

  return (
    <>
      <button
        type="button"
        className="project-comments-fab"
        onClick={() => setIsOpen(true)}
        aria-label={`Open unread project comments, ${count} unread`}
      >
        <span className="project-comments-fab-icon">
          <CommentBubbleIcon />
        </span>
        <span className="project-comments-fab-label">Comments</span>
        <span className="project-comments-fab-count">{countLabel}</span>
      </button>

      {isOpen && (
        <div
          className="project-comments-feed-overlay"
          onClick={() => setIsOpen(false)}
        >
          <section
            className="project-comments-feed-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-comments-feed-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="project-comments-feed-header">
              <div>
                <span className="project-comments-feed-kicker">Unread comments</span>
                <h2 id="project-comments-feed-title">Project Comments</h2>
              </div>
              <div className="project-comments-feed-header-actions">
                <span>{countLabel}</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close comments feed"
                >
                  <XIcon width={18} height={18} />
                </button>
              </div>
            </header>

            <div className="project-comments-feed-body">
              {loading ? (
                <div className="project-comments-feed-empty">Loading comments...</div>
              ) : error ? (
                <div className="project-comments-feed-error">{error}</div>
              ) : comments.length === 0 ? (
                <div className="project-comments-feed-empty">
                  No unread project comments.
                </div>
              ) : (
                <div className="project-comments-feed-list">
                  {comments.map((comment) => {
                    const project = comment.project || {};
                    const authorName = getUserName(comment.author);
                    return (
                      <article
                        key={comment._id}
                        className="project-comments-feed-item"
                      >
                        <button
                          type="button"
                          className="project-comments-feed-main"
                          onClick={() => openComment(comment)}
                        >
                          <span className="project-comments-feed-project">
                            <strong>{getProjectLabel(project)}</strong>
                            <span>{getProjectName(project)}</span>
                          </span>
                          <span className="project-comments-feed-meta">
                            <span>{comment.isReply ? "Reply" : "Comment"}</span>
                            <span>From {authorName}</span>
                            <span>{formatCommentTime(comment.createdAt)}</span>
                          </span>
                          <span className="project-comments-feed-text">
                            {comment.content}
                          </span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {projectRouteChoiceDialog}
    </>
  );
};

export default ProjectCommentsFab;
