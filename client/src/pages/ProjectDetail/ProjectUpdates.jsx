import React, { useState, useEffect } from "react";
import "./ProjectUpdates.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import SystemIcon from "../../components/icons/SystemIcon";
import TrashIcon from "../../components/icons/TrashIcon";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import Toast from "../../components/ui/Toast";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

const PlusIcon = ({ width = 16, height = 16, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 3.33334V12.6667M3.33334 8H12.6667"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ImageIcon = ({ width = 14, height = 14, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const DownloadIcon = ({ width = 14, height = 14, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const ProjectUpdates = ({ project, currentUser }) => {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [updateToDelete, setUpdateToDelete] = useState(null);
  const [toast, setToast] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    content: "",
    category: "General",
    attachment: null,
    isEndOfDayUpdate: false,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (project?._id) {
      fetchUpdates();
    }
  }, [project?._id]);

  useRealtimeRefresh(() => {
    if (project?._id) {
      fetchUpdates();
    }
  }, { enabled: Boolean(project?._id) });

  const fetchUpdates = async () => {
    try {
      const res = await fetch(`/api/updates/project/${project._id}`);
      if (res.ok) {
        const data = await res.json();
        setUpdates(data);
      }
    } catch (err) {
      console.error("Error fetching updates:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, attachment: e.target.files[0] });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.content) return;

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append("content", formData.content);
      data.append("category", formData.category);
      data.append("isEndOfDayUpdate", formData.isEndOfDayUpdate);
      if (formData.attachment) {
        data.append("attachment", formData.attachment);
      }

      const res = await fetch(`/api/updates/project/${project._id}`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        setFormData({
          content: "",
          category: "General",
          attachment: null,
          isEndOfDayUpdate: false,
        });
        setShowModal(false);
        fetchUpdates();
        setToast({ type: "success", message: "Update posted successfully!" });
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Failed to save update",
        });
      }
    } catch (err) {
      console.error("Error saving update:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (updateId) => {
    setUpdateToDelete(updateId);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!updateToDelete) return;
    try {
      const res = await fetch(`/api/updates/${updateToDelete}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setUpdates(updates.filter((u) => u._id !== updateToDelete));
        setDeleteModalOpen(false);
        setUpdateToDelete(null);
        setToast({ type: "success", message: "Update deleted successfully." });
      } else {
        setToast({ type: "error", message: "Failed to delete update." });
      }
    } catch (err) {
      console.error("Error deleting update", err);
      setToast({ type: "error", message: "Error deleting update." });
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getDownloadUrl = (path) => {
    return `${path}`;
  };

  const isAuthor = (update) => {
    if (!currentUser || !update.author) return false;
    return (
      currentUser._id === update.author._id || currentUser._id === update.author
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="updates-container">
      <div className="updates-header">
        <div className="updates-title-group">
          <h3 className="updates-title">Latest Activity</h3>
          <span className="count-badge">{updates.length}</span>
        </div>
        <button className="add-update-btn" onClick={() => setShowModal(true)}>
          <PlusIcon width="16" height="16" color="#fff" /> Add Update
        </button>
      </div>

      <div className="updates-list">
        {updates.length > 0 ? (
          updates.map((update) => (
            <div key={update._id} className="update-card">
              <div className="update-header">
                <div className="user-info">
                  {update.author ? (
                    <div
                      className="user-initials"
                      style={{ backgroundColor: "#e0e7ff", color: "#4f46e5" }}
                    >
                      {update.author.firstName
                        ? update.author.firstName.charAt(0)
                        : "U"}
                    </div>
                  ) : (
                    <div className="system-icon-wrapper">
                      <SystemIcon />
                    </div>
                  )}

                  <div className="user-text-col">
                    <div className="user-name-row">
                      <span className="user-name">
                        {update.author
                          ? `${update.author.firstName} ${update.author.lastName}`
                          : "System"}
                      </span>
                    </div>
                    <span className="update-time">
                      {formatTime(update.createdAt)}
                    </span>
                  </div>
                </div>

                <div
                  className="update-header-right"
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  {update.category && (
                    <div
                      className={`update-tag ${update.category.toLowerCase()}`}
                    >
                      {update.category}
                    </div>
                  )}
                  {isAuthor(update) && (
                    <button
                      className="delete-update-btn"
                      title="Delete Update"
                      onClick={() => handleDeleteClick(update._id)}
                    >
                      <TrashIcon width="14" height="14" color="#cbd5e1" />
                    </button>
                  )}
                </div>
              </div>

              <div className="update-content">
                <p className="update-content-text">{update.content}</p>
              </div>

              {update.attachments && update.attachments.length > 0 && (
                <div className="update-attachment-row">
                  <div className="attachment-file-info">
                    <ImageIcon width="14" height="14" color="#64748b" />
                    <span className="attachment-name">
                      {update.attachments[0].name}
                    </span>
                  </div>
                  <a
                    href={getDownloadUrl(update.attachments[0].url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="download-btn"
                    download
                  >
                    <DownloadIcon width="14" height="14" /> Download
                  </a>
                </div>
              )}
            </div>
          ))
        ) : (
          <div
            style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}
          >
            No updates yet.
          </div>
        )}
      </div>

      {/* Add Update Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: "500px" }}>
            <h3 className="modal-title">Add Project Update</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Update Content</label>
                <textarea
                  className="input-field"
                  rows="4"
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="What's the latest on this project?"
                  required
                />
              </div>

              <div
                className="form-row"
                style={{ display: "flex", gap: "1rem" }}
              >
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Category</label>
                  <select
                    className="input-field"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                  >
                    <option value="General">General</option>
                    <option value="Production">Production</option>
                    <option value="Client">Client</option>
                    <option value="Design">Design</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label
                  className="checkbox-container"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.isEndOfDayUpdate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isEndOfDayUpdate: e.target.checked,
                      })
                    }
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span style={{ fontSize: "0.9rem", color: "#334155" }}>
                    Mark as Final End of Day Update
                  </span>
                </label>
              </div>

              <div className="form-group">
                <label>Attachment (Optional)</label>
                <div className="file-input-wrapper">
                  <input
                    type="file"
                    id="file-upload"
                    className="file-input-hidden"
                    onChange={handleFileChange}
                  />
                  <label htmlFor="file-upload" className="file-input-label">
                    <span className="file-input-text">
                      {formData.attachment
                        ? formData.attachment.name
                        : "Choose File"}
                    </span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? "Posting..." : "Post Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="caught-up-message">You're all caught up!</p>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete Update"
        message="Are you sure you want to delete this update? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default ProjectUpdates;
