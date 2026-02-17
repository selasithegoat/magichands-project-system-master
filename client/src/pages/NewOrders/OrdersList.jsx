import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./NewOrders.css";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay, getLeadSearchText } from "../../utils/leadDisplay";

const DELIVERY_CONFIRM_PHRASE = "I confirm this order has been delivered";

const OrdersList = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [allFilters, setAllFilters] = useState({
    orderId: "",
    client: "",
    status: "All",
    assignment: "All",
  });
  const [historyFilters, setHistoryFilters] = useState({
    orderId: "",
    client: "",
    lead: "",
  });

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [feedbackModal, setFeedbackModal] = useState({
    open: false,
    project: null,
  });
  const [feedbackType, setFeedbackType] = useState("Positive");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState({
    open: false,
    project: null,
  });
  const [deliveryInput, setDeliveryInput] = useState("");
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [reopenModal, setReopenModal] = useState({
    open: false,
    project: null,
  });
  const [reopenReason, setReopenReason] = useState("");
  const [reopenSubmitting, setReopenSubmitting] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ ...toast, show: false }), 5000);
  };

  useEffect(() => {
    fetchOrders();
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (feedbackModal.open && feedbackModal.project) {
      const updated = allOrders.find(
        (order) => order._id === feedbackModal.project._id,
      );
      if (updated && updated !== feedbackModal.project) {
        setFeedbackModal((prev) => ({ ...prev, project: updated }));
      }
    }
  }, [allOrders, feedbackModal.open, feedbackModal.project]);

  useRealtimeRefresh(() => fetchOrders());

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
      }
    } catch (err) {
      console.error("Error fetching current user:", err);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?mode=report");
      if (res.ok) {
        const data = await res.json();
        setAllOrders(data);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReopenProject = async (projectId) => {
    const target = allOrders.find((order) => order._id === projectId) || null;
    setReopenReason("");
    setReopenModal({ open: true, project: target });
  };

  const closeReopenModal = (force = false) => {
    if (reopenSubmitting && !force) return;
    setReopenModal({ open: false, project: null });
    setReopenReason("");
  };

  const handleConfirmReopen = async () => {
    if (!reopenModal.project?._id) return;

    try {
      setReopenSubmitting(true);
      const res = await fetch(`/api/projects/${reopenModal.project._id}/reopen`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      if (res.ok) {
        const project = await res.json();
        showToast("Project reopened as a new revision.", "success");
        closeReopenModal(true);

        // Open the new revision in edit mode so user updates that revision record only.
        if (project.projectType === "Quote") {
          navigate(`/create/quote?edit=${project._id}`, {
            state: { reopenedProject: project },
          });
        } else {
          navigate(`/new-orders/form?edit=${project._id}`, {
            state: { reopenedProject: project },
          });
        }
      } else {
        const errorData = await res.json();
        showToast(`Error: ${errorData.message || "Failed to reopen"}`, "error");
      }
    } catch (error) {
      console.error("Reopen error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setReopenSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getAssignmentStatus = (project) => {
    return project.projectLeadId ? "Assigned" : "Unassigned";
  };

  const getStatusClass = (status) => {
    if (!status) return "draft";
    const lower = status.toLowerCase();
    if (lower.includes("feedback")) return "feedback";
    if (lower.includes("pending") || lower.includes("new order"))
      return "pending";
    if (lower.includes("finished")) return "completed";
    if (lower.includes("completed")) return "completed";
    if (lower.includes("delivered") || lower.includes("progress"))
      return "in-progress";
    return "draft";
  };

  const getLineageKey = (order) => {
    const rawLineageId = order?.lineageId;
    if (!rawLineageId) return order?._id ? String(order._id) : "";
    if (typeof rawLineageId === "string") return rawLineageId;
    if (typeof rawLineageId === "object") {
      const rawId = rawLineageId._id || rawLineageId.id;
      return rawId ? String(rawId) : order?._id ? String(order._id) : "";
    }
    return order?._id ? String(order._id) : "";
  };

  const getVersionNumber = (order) => {
    const value = Number(order?.versionNumber);
    return Number.isFinite(value) && value > 0 ? value : 1;
  };

  const latestProjectIdByLineage = useMemo(() => {
    const latestByLineage = new Map();

    allOrders.forEach((order) => {
      if (!order?._id) return;
      const lineageKey = getLineageKey(order);
      if (!lineageKey) return;

      const existing = latestByLineage.get(lineageKey);
      if (!existing) {
        latestByLineage.set(lineageKey, order);
        return;
      }

      const incomingVersion = getVersionNumber(order);
      const existingVersion = getVersionNumber(existing);
      if (incomingVersion > existingVersion) {
        latestByLineage.set(lineageKey, order);
        return;
      }

      if (incomingVersion === existingVersion) {
        const incomingCreatedAt = order.createdAt
          ? new Date(order.createdAt).getTime()
          : 0;
        const existingCreatedAt = existing.createdAt
          ? new Date(existing.createdAt).getTime()
          : 0;

        if (incomingCreatedAt > existingCreatedAt) {
          latestByLineage.set(lineageKey, order);
        }
      }
    });

    const latestIdMap = new Map();
    latestByLineage.forEach((project, lineageKey) => {
      latestIdMap.set(lineageKey, project?._id ? String(project._id) : "");
    });
    return latestIdMap;
  }, [allOrders]);

  const canReopenFromHistory = (order) => {
    if (order.status !== "Completed" && order.status !== "Finished") {
      return false;
    }
    const lineageKey = getLineageKey(order);
    if (!lineageKey) return false;
    return latestProjectIdByLineage.get(lineageKey) === String(order._id);
  };

  const allOrdersFiltered = allOrders.filter((order) => {
    if (order.status === "Completed" || order.status === "Finished")
      return false;
    if (
      allFilters.orderId &&
      !order.orderId?.toLowerCase().includes(allFilters.orderId.toLowerCase())
    )
      return false;
    if (
      allFilters.client &&
      !order.details?.client
        ?.toLowerCase()
        .includes(allFilters.client.toLowerCase())
    )
      return false;
    const displayStatus = order.projectLeadId ? order.status : "New Order";
    if (allFilters.status !== "All" && displayStatus !== allFilters.status)
      return false;
    if (allFilters.assignment === "Assigned" && !order.projectLeadId)
      return false;
    if (allFilters.assignment === "Unassigned" && order.projectLeadId)
      return false;
    return true;
  });

  const historyOrdersFiltered = allOrders.filter((order) => {
    if (order.status !== "Completed" && order.status !== "Finished")
      return false;
    if (
      historyFilters.orderId &&
      !order.orderId
        ?.toLowerCase()
        .includes(historyFilters.orderId.toLowerCase())
    )
      return false;
    if (
      historyFilters.client &&
      !order.details?.client
        ?.toLowerCase()
        .includes(historyFilters.client.toLowerCase())
    )
      return false;
    if (historyFilters.lead) {
      const leadText = getLeadSearchText(order);
      if (!leadText.includes(historyFilters.lead.toLowerCase())) return false;
    }
    return true;
  });

  const canMarkDelivered =
    currentUser?.role === "admin" ||
    currentUser?.department?.includes("Front Desk");
  const canManageFeedback = canMarkDelivered;
  const canAddFeedbackFor = (order) =>
    ["Pending Feedback", "Feedback Completed", "Delivered"].includes(
      order.status,
    );

  const handleDeliveryComplete = async (order) => {
    if (!canMarkDelivered) return;
    try {
      const res = await fetch(`/api/projects/${order._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Delivered" }),
      });
      if (res.ok) {
        showToast("Order delivered. Feedback is now pending.", "success");
        fetchOrders();
        return true;
      } else {
        const errorData = await res.json();
        showToast(
          `Error: ${errorData.message || "Failed to update status"}`,
          "error",
        );
        return false;
      }
    } catch (error) {
      console.error("Delivery update error:", error);
      showToast("Network error. Please try again.", "error");
      return false;
    }
  };

  const openDeliveryModal = (order) => {
    setDeliveryInput("");
    setDeliveryModal({ open: true, project: order });
  };

  const closeDeliveryModal = () => {
    if (deliverySubmitting) return;
    setDeliveryModal({ open: false, project: null });
    setDeliveryInput("");
    setDeliverySubmitting(false);
  };

  const handleConfirmDelivery = async () => {
    if (!deliveryModal.project) return;
    if (deliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE) return;
    setDeliverySubmitting(true);
    const delivered = await handleDeliveryComplete(deliveryModal.project);
    setDeliverySubmitting(false);
    if (delivered) {
      setDeliveryModal({ open: false, project: null });
      setDeliveryInput("");
    }
  };

  const openFeedbackModal = (order) => {
    setFeedbackType("Positive");
    setFeedbackNotes("");
    setFeedbackModal({ open: true, project: order });
  };

  const closeFeedbackModal = () => {
    setFeedbackModal({ open: false, project: null });
    setFeedbackType("Positive");
    setFeedbackNotes("");
  };

  const handleAddFeedback = async () => {
    if (!feedbackModal.project) return;
    setFeedbackSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${feedbackModal.project._id}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: feedbackType,
            notes: feedbackNotes,
          }),
        },
      );

      if (res.ok) {
        const updatedProject = await res.json();
        setAllOrders((prev) =>
          prev.map((p) => (p._id === updatedProject._id ? updatedProject : p)),
        );
        setFeedbackModal({ open: true, project: updatedProject });
        setFeedbackNotes("");
        showToast("Feedback added successfully.", "success");
      } else {
        const errorData = await res.json();
        showToast(
          `Error: ${errorData.message || "Failed to add feedback"}`,
          "error",
        );
      }
    } catch (error) {
      console.error("Feedback add error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleDeleteFeedback = async (feedbackId) => {
    if (!feedbackModal.project) return;
    try {
      const res = await fetch(
        `/api/projects/${feedbackModal.project._id}/feedback/${feedbackId}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        const updatedProject = await res.json();
        setAllOrders((prev) =>
          prev.map((p) => (p._id === updatedProject._id ? updatedProject : p)),
        );
        setFeedbackModal({ open: true, project: updatedProject });
        showToast("Feedback deleted.", "success");
      } else {
        const errorData = await res.json();
        showToast(
          `Error: ${errorData.message || "Failed to delete feedback"}`,
          "error",
        );
      }
    } catch (error) {
      console.error("Feedback delete error:", error);
      showToast("Network error. Please try again.", "error");
    }
  };

  const sortedFeedbackEntries = (
    feedbackModal.project?.feedbacks || []
  ).slice().sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="orders-management-section" style={{ marginTop: "3rem" }}>
      {toast.show && (
        <div className={`toast-message ${toast.type}`}>{toast.message}</div>
      )}

      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Orders
        </button>
        <button
          className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Order History
        </button>
      </div>

      {activeTab === "all" && (
        <div className="orders-list-container">
          <div className="filter-controls">
            <input
              type="text"
              placeholder="Order ID..."
              value={allFilters.orderId}
              onChange={(e) =>
                setAllFilters({ ...allFilters, orderId: e.target.value })
              }
              className="filter-input"
            />
            <input
              type="text"
              placeholder="Client..."
              value={allFilters.client}
              onChange={(e) =>
                setAllFilters({ ...allFilters, client: e.target.value })
              }
              className="filter-input"
            />
            <select
              value={allFilters.status}
              onChange={(e) =>
                setAllFilters({ ...allFilters, status: e.target.value })
              }
              className="filter-select"
            >
              <option value="All">All Status</option>
              <option value="New Order">New Order</option>
              <option value="Order Confirmed">Order Confirmed</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending Feedback">Pending Feedback</option>
              <option value="Feedback Completed">Feedback Completed</option>
            </select>
            <select
              value={allFilters.assignment}
              onChange={(e) =>
                setAllFilters({ ...allFilters, assignment: e.target.value })
              }
              className="filter-select"
            >
              <option value="All">All Assignments</option>
              <option value="Assigned">Assigned</option>
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>

          {loading ? (
            <div className="loading-state">Loading orders...</div>
          ) : allOrdersFiltered.length === 0 ? (
            <div className="empty-state">No ongoing orders found.</div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Client</th>
                  <th>Project Name</th>
                  <th>Status</th>
                  <th>Assignment Status</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allOrdersFiltered.map((order) => (
                  <tr
                    key={order._id}
                    className="clickable-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/new-orders/actions/${order._id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/new-orders/actions/${order._id}`);
                      }
                    }}
                  >
                    <td>
                      <div className="order-id-cell">
                        <span className="order-id-value">
                          {order.orderId || "N/A"}
                        </span>
                        {getVersionNumber(order) > 1 && (
                          <span className="order-id-version">
                            Version v{getVersionNumber(order)}
                          </span>
                        )}
                        <span className="order-id-lead">
                          {getLeadDisplay(order, "Unassigned")}
                        </span>
                      </div>
                    </td>
                    <td>{order.details?.client || "-"}</td>
                    <td>{order.details?.projectName || "Untitled"}</td>
                    <td>
                      <span
                        className={`status-badge ${getStatusClass(order.projectLeadId ? order.status : "New Order")}`}
                      >
                        {order.projectLeadId ? order.status : "New Order"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`assignment-badge ${order.projectLeadId ? "assigned" : "unassigned"}`}
                      >
                        {getAssignmentStatus(order)}
                      </span>
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      <button
                        className="action-btn view-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/new-orders/actions/${order._id}`);
                        }}
                      >
                        View Actions
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="orders-list-container">
          <div className="filter-controls">
            <input
              type="text"
              placeholder="Client Search..."
              value={historyFilters.client}
              onChange={(e) =>
                setHistoryFilters({ ...historyFilters, client: e.target.value })
              }
              className="filter-input"
            />
            <input
              type="text"
              placeholder="Order Number..."
              value={historyFilters.orderId}
              onChange={(e) =>
                setHistoryFilters({
                  ...historyFilters,
                  orderId: e.target.value,
                })
              }
              className="filter-input"
            />
            <input
              type="text"
              placeholder="Lead Name..."
              value={historyFilters.lead}
              onChange={(e) =>
                setHistoryFilters({ ...historyFilters, lead: e.target.value })
              }
              className="filter-input"
            />
          </div>

          {loading ? (
            <div className="loading-state">Loading orders...</div>
          ) : historyOrdersFiltered.length === 0 ? (
            <div className="empty-state">
              No completed orders found matching filters.
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Client</th>
                  <th>Project Name</th>
                  <th>Status</th>
                  <th>Assignment Status</th>
                  <th>Created Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {historyOrdersFiltered.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <div className="order-id-cell">
                        <span className="order-id-value">
                          {order.orderId || "N/A"}
                        </span>
                        {getVersionNumber(order) > 1 && (
                          <span className="order-id-version">
                            Version v{getVersionNumber(order)}
                          </span>
                        )}
                        <span className="order-id-lead">
                          {getLeadDisplay(order, "Unassigned")}
                        </span>
                      </div>
                    </td>
                    <td>{order.details?.client || "-"}</td>
                    <td>{order.details?.projectName || "Untitled"}</td>
                    <td>
                      <span
                        className={`status-badge ${getStatusClass(order.status)}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`assignment-badge ${order.projectLeadId ? "assigned" : "unassigned"}`}
                      >
                        {getAssignmentStatus(order)}
                      </span>
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      {canReopenFromHistory(order) && (
                        <button
                          className="action-btn reopen-btn"
                          onClick={() => handleReopenProject(order._id)}
                          style={{ marginLeft: "0.5rem" }}
                        >
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {deliveryModal.open && (
        <div className="confirm-modal-overlay" onClick={closeDeliveryModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Delivery</h3>
              <p>
                {deliveryModal.project?.orderId ||
                  deliveryModal.project?._id ||
                  "Project"}
              </p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to confirm delivery completion.
            </p>
            <div className="confirm-phrase">{DELIVERY_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={deliveryInput}
                onChange={(e) => setDeliveryInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeDeliveryModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmDelivery}
                disabled={
                  deliverySubmitting ||
                  deliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE
                }
              >
                {deliverySubmitting ? "Confirming..." : "Confirm Delivery"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reopenModal.open && (
        <div className="confirm-modal-overlay" onClick={closeReopenModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Reopen as New Revision</h3>
              <p>
                {reopenModal.project?.orderId ||
                  reopenModal.project?._id ||
                  "Project"}
              </p>
            </div>
            <p className="confirm-modal-text">
              This keeps the old project in history and creates a new editable
              revision.
            </p>
            <div className="confirm-input-group">
              <label>Reason (Optional)</label>
              <textarea
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Add a note for why this project is being reopened..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeReopenModal}>
                Cancel
              </button>
              <button
                className="action-btn reopen-btn"
                onClick={handleConfirmReopen}
                disabled={reopenSubmitting}
              >
                {reopenSubmitting ? "Reopening..." : "Reopen Revision"}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal.open && (
        <div className="feedback-modal-overlay" onClick={closeFeedbackModal}>
          <div
            className="feedback-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="feedback-modal-header">
              <div>
                <h3>Project Feedback</h3>
                <p>
                  {feedbackModal.project?.orderId ||
                    feedbackModal.project?._id ||
                    "Project"}
                </p>
              </div>
              <button
                className="feedback-modal-close"
                onClick={closeFeedbackModal}
                aria-label="Close feedback modal"
              >
                x
              </button>
            </div>

            <div className="feedback-form">
              <label>Feedback Type</label>
              <select
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value)}
              >
                <option value="Positive">Positive</option>
                <option value="Negative">Negative</option>
              </select>

              <label>Add some few notes</label>
              <textarea
                rows="3"
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                placeholder="Share brief notes about the delivery..."
              />

              <div className="feedback-actions">
                <button className="action-btn" onClick={closeFeedbackModal}>
                  Cancel
                </button>
                <button
                  className="action-btn feedback-submit"
                  onClick={handleAddFeedback}
                  disabled={feedbackSaving}
                >
                  {feedbackSaving ? "Saving..." : "Submit Feedback"}
                </button>
              </div>
            </div>

            <div className="feedback-history">
              <h4>Previous Feedback</h4>
              {sortedFeedbackEntries.length === 0 ? (
                <div className="empty-feedback">No feedback yet.</div>
              ) : (
                <div className="feedback-history-list">
                  {sortedFeedbackEntries.map((entry) => (
                    <div className="feedback-history-item" key={entry._id}>
                      <div className="feedback-history-meta">
                        <span
                          className={`feedback-pill ${
                            entry.type === "Positive" ? "positive" : "negative"
                          }`}
                        >
                          {entry.type}
                        </span>
                        <span className="feedback-history-by">
                          {entry.createdByName || "Unknown"}
                        </span>
                        <span className="feedback-history-date">
                          {entry.createdAt
                            ? new Date(entry.createdAt).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                      </div>
                      <p>{entry.notes || "No notes provided."}</p>
                      <button
                        className="feedback-delete"
                        onClick={() => handleDeleteFeedback(entry._id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersList;
