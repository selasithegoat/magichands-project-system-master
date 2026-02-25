import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./NewOrders.css";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay, getLeadSearchText } from "../../utils/leadDisplay";

const DELIVERY_CONFIRM_PHRASE = "I confirm this order has been delivered";
const ALL_ORDERS_PAGE_SIZE = 10;
const GROUP_ROW_TRANSITION_MS = 220;
const FEEDBACK_MEDIA_ACCEPT = "image/*,audio/*,video/*";
const FEEDBACK_MEDIA_MAX_FILES = 6;
const FEEDBACK_COMPLETION_GATE_STATUSES = new Set([
  "Pending Feedback",
  "Delivered",
]);

const isFeedbackMediaFile = (file) => {
  const mimeType = String(file?.type || "").toLowerCase();
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/")
  );
};

const getFeedbackAttachmentName = (attachment) => {
  if (attachment?.fileName) return attachment.fileName;
  const rawUrl = String(attachment?.fileUrl || "").split("?")[0];
  const parts = rawUrl.split("/").filter(Boolean);
  return parts[parts.length - 1] || "Attachment";
};

const OrdersList = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [allOrders, setAllOrders] = useState([]);
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [expandedOrderGroups, setExpandedOrderGroups] = useState({});
  const [collapsingOrderGroups, setCollapsingOrderGroups] = useState({});
  const collapseTimersRef = useRef({});
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [allFilters, setAllFilters] = useState({
    orderId: "",
    client: "",
    status: "All",
    assignment: "All",
  });
  const [allOrdersPage, setAllOrdersPage] = useState(1);
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
  const [feedbackFiles, setFeedbackFiles] = useState([]);
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

  useEffect(() => {
    setAllOrdersPage(1);
  }, [
    allFilters.orderId,
    allFilters.client,
    allFilters.status,
    allFilters.assignment,
  ]);

  useEffect(
    () => () => {
      Object.values(collapseTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      collapseTimersRef.current = {};
    },
    [],
  );

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
      const [projectsRes, groupedRes] = await Promise.all([
        fetch("/api/projects?mode=report"),
        fetch("/api/projects/orders?mode=report&collapseRevisions=true"),
      ]);

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setAllOrders(Array.isArray(data) ? data : []);
      } else {
        setAllOrders([]);
      }

      if (groupedRes.ok) {
        const data = await groupedRes.json();
        setGroupedOrders(Array.isArray(data) ? data : []);
      } else {
        setGroupedOrders([]);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
      setAllOrders([]);
      setGroupedOrders([]);
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

  const getProjectDisplayStatus = (project) =>
    project?.projectLeadId ? project.status : "New Order";

  const getActiveGroupProjects = (group) =>
    (group?.projects || []).filter((project) => !isHistoryEligible(project));

  const getGroupClient = (group, projects = []) =>
    group?.client || projects.find((project) => project?.details?.client)?.details?.client || "-";

  const getGroupLeadText = (group, projects = []) => {
    const groupedLeads = Array.isArray(group?.leads) ? group.leads.filter(Boolean) : [];
    if (groupedLeads.length > 0) return groupedLeads.join(", ");

    const derivedLeads = Array.from(
      new Set(
        projects
          .map((project) => getLeadDisplay(project, "Unassigned"))
          .filter(Boolean),
      ),
    );

    return derivedLeads.length > 0 ? derivedLeads.join(", ") : "Unassigned";
  };

  const getGroupStatusMeta = (projects = []) => {
    const statuses = Array.from(
      new Set(projects.map((project) => getProjectDisplayStatus(project)).filter(Boolean)),
    );

    if (statuses.length === 0) {
      return {
        label: "No Active Projects",
        className: getStatusClass("Draft"),
      };
    }

    const primary = statuses[0];
    return {
      label:
        statuses.length === 1 ? primary : `${primary} +${statuses.length - 1} more`,
      className: getStatusClass(primary),
    };
  };

  const updateProjectInGroups = (groups = [], updatedProject) =>
    groups.map((group) => {
      let changed = false;
      const nextProjects = (group?.projects || []).map((project) => {
        if (project?._id !== updatedProject?._id) return project;
        changed = true;
        return {
          ...project,
          ...updatedProject,
        };
      });

      if (!changed) return group;

      return {
        ...group,
        client: group?.client || updatedProject?.details?.client || "",
        projects: nextProjects,
      };
    });

  const toggleOrderGroup = (groupId) => {
    if (!groupId) return;
    const isExpanded = Boolean(expandedOrderGroups[groupId]);

    if (isExpanded) {
      setCollapsingOrderGroups((prev) => ({
        ...prev,
        [groupId]: true,
      }));

      if (collapseTimersRef.current[groupId]) {
        clearTimeout(collapseTimersRef.current[groupId]);
      }

      collapseTimersRef.current[groupId] = window.setTimeout(() => {
        setExpandedOrderGroups((prev) => ({
          ...prev,
          [groupId]: false,
        }));
        setCollapsingOrderGroups((prev) => {
          const next = { ...prev };
          delete next[groupId];
          return next;
        });
        delete collapseTimersRef.current[groupId];
      }, GROUP_ROW_TRANSITION_MS);
      return;
    }

    if (collapseTimersRef.current[groupId]) {
      clearTimeout(collapseTimersRef.current[groupId]);
      delete collapseTimersRef.current[groupId];
    }

    setCollapsingOrderGroups((prev) => {
      if (!prev[groupId]) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    setExpandedOrderGroups((prev) => ({
      ...prev,
      [groupId]: true,
    }));
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
    if (order.status !== "Finished") {
      return false;
    }
    const lineageKey = getLineageKey(order);
    if (!lineageKey) return false;
    return latestProjectIdByLineage.get(lineageKey) === String(order._id);
  };

  const isHistoryEligible = (order) => order.status === "Finished";

  const allOrderGroupsFiltered = groupedOrders
    .map((group) => ({
      ...group,
      activeProjects: getActiveGroupProjects(group),
    }))
    .filter((group) => group.activeProjects.length > 0)
    .filter((group) => {
      const orderNumber = String(group?.orderNumber || "").toLowerCase();
      const clientText = String(
        getGroupClient(group, group.activeProjects) || "",
      ).toLowerCase();

      if (
        allFilters.orderId &&
        !orderNumber.includes(allFilters.orderId.toLowerCase())
      ) {
        return false;
      }

      if (
        allFilters.client &&
        !clientText.includes(allFilters.client.toLowerCase())
      ) {
        return false;
      }

      if (allFilters.status !== "All") {
        const hasStatusMatch = group.activeProjects.some(
          (project) => getProjectDisplayStatus(project) === allFilters.status,
        );
        if (!hasStatusMatch) return false;
      }

      if (allFilters.assignment === "Assigned") {
        const hasAssigned = group.activeProjects.some(
          (project) => Boolean(project?.projectLeadId),
        );
        if (!hasAssigned) return false;
      }

      if (allFilters.assignment === "Unassigned") {
        const hasUnassigned = group.activeProjects.some(
          (project) => !project?.projectLeadId,
        );
        if (!hasUnassigned) return false;
      }

      return true;
    });

  const historyOrdersFiltered = allOrders.filter((order) => {
    if (!isHistoryEligible(order)) return false;
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

  const allOrdersTotalPages = Math.max(
    1,
    Math.ceil(allOrderGroupsFiltered.length / ALL_ORDERS_PAGE_SIZE),
  );
  const safeAllOrdersPage = Math.min(allOrdersPage, allOrdersTotalPages);
  const allOrdersPageStart = (safeAllOrdersPage - 1) * ALL_ORDERS_PAGE_SIZE;
  const allOrdersPageEnd = Math.min(
    allOrdersPageStart + ALL_ORDERS_PAGE_SIZE,
    allOrderGroupsFiltered.length,
  );
  const paginatedAllOrderGroups = allOrderGroupsFiltered.slice(
    allOrdersPageStart,
    allOrdersPageEnd,
  );

  useEffect(() => {
    if (allOrdersPage > allOrdersTotalPages) {
      setAllOrdersPage(allOrdersTotalPages);
    }
  }, [allOrdersPage, allOrdersTotalPages]);

  useEffect(() => {
    setExpandedOrderGroups((prev) => {
      const next = {};
      allOrderGroupsFiltered.forEach((group) => {
        const groupKey = group?.id || group?.orderNumber;
        if (!groupKey) return;
        next[groupKey] = prev[groupKey] || false;
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }

      return prev;
    });
  }, [allOrderGroupsFiltered]);

  useEffect(() => {
    setCollapsingOrderGroups((prev) => {
      const next = {};
      allOrderGroupsFiltered.forEach((group) => {
        const groupKey = group?.id || group?.orderNumber;
        if (!groupKey) return;
        if (prev[groupKey]) next[groupKey] = true;
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }

      return prev;
    });
  }, [allOrderGroupsFiltered]);

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
    setFeedbackFiles([]);
    setFeedbackModal({ open: true, project: order });
  };

  const closeFeedbackModal = () => {
    setFeedbackModal({ open: false, project: null });
    setFeedbackType("Positive");
    setFeedbackNotes("");
    setFeedbackFiles([]);
  };

  const handleFeedbackFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    const acceptedFiles = selectedFiles.filter((file) =>
      isFeedbackMediaFile(file),
    );
    if (acceptedFiles.length !== selectedFiles.length) {
      showToast(
        "Only photos, audio, and video files can be attached to feedback.",
        "error",
      );
    }

    if (acceptedFiles.length > 0) {
      setFeedbackFiles((prev) => {
        const merged = [...prev, ...acceptedFiles];
        if (merged.length > FEEDBACK_MEDIA_MAX_FILES) {
          showToast(
            `You can attach up to ${FEEDBACK_MEDIA_MAX_FILES} files per feedback.`,
            "error",
          );
          return merged.slice(0, FEEDBACK_MEDIA_MAX_FILES);
        }
        return merged;
      });
    }

    event.target.value = "";
  };

  const handleRemoveFeedbackFile = (indexToRemove) => {
    setFeedbackFiles((prev) =>
      prev.filter((_, fileIndex) => fileIndex !== indexToRemove),
    );
  };

  const handleAddFeedback = async () => {
    if (!feedbackModal.project) return;

    const requiresMediaAttachment = FEEDBACK_COMPLETION_GATE_STATUSES.has(
      feedbackModal.project?.status || "",
    );
    if (requiresMediaAttachment && feedbackFiles.length === 0) {
      showToast(
        "Attach at least one photo, audio, or video before completing feedback.",
        "error",
      );
      return;
    }

    setFeedbackSaving(true);
    try {
      const payload = new FormData();
      payload.append("type", feedbackType);
      payload.append("notes", feedbackNotes);
      feedbackFiles.forEach((file) => {
        payload.append("feedbackAttachments", file);
      });

      const res = await fetch(
        `/api/projects/${feedbackModal.project._id}/feedback`,
        {
          method: "POST",
          body: payload,
        },
      );

      if (res.ok) {
        const updatedProject = await res.json();
        setAllOrders((prev) =>
          prev.map((p) => (p._id === updatedProject._id ? updatedProject : p)),
        );
        setGroupedOrders((prev) => updateProjectInGroups(prev, updatedProject));
        setFeedbackModal({ open: true, project: updatedProject });
        setFeedbackNotes("");
        setFeedbackFiles([]);
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
        setGroupedOrders((prev) => updateProjectInGroups(prev, updatedProject));
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

  const feedbackRequiresMediaAttachment = FEEDBACK_COMPLETION_GATE_STATUSES.has(
    feedbackModal.project?.status || "",
  );

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
              <option value="Pending Departmental Engagement">
                Pending Departmental Engagement
              </option>
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
          ) : allOrderGroupsFiltered.length === 0 ? (
            <div className="empty-state">No ongoing orders found.</div>
          ) : (
            <>
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Client</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Lead(s)</th>
                    <th>Created Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAllOrderGroups.map((group) => {
                    const groupKey = group?.id || group?.orderNumber || "order-group";
                    const activeProjects = group?.activeProjects || [];
                    const allProjects = Array.isArray(group?.projects)
                      ? group.projects
                      : activeProjects;
                    const shouldGroup = allProjects.length > 1;
                    const primaryProject = allProjects[0] || activeProjects[0] || null;
                    const statusMeta = getGroupStatusMeta(
                      activeProjects.length > 0 ? activeProjects : allProjects,
                    );
                    const createdDate =
                      group?.orderDate || primaryProject?.createdAt || null;
                    const expanded = Boolean(expandedOrderGroups[groupKey]);
                    const isCollapsing = Boolean(collapsingOrderGroups[groupKey]);
                    const showGroupChildren = expanded || isCollapsing;

                    if (!shouldGroup && primaryProject) {
                      return (
                        <tr
                          key={primaryProject._id || groupKey}
                          className="clickable-row"
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            navigate(`/new-orders/actions/${primaryProject._id}`)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              navigate(`/new-orders/actions/${primaryProject._id}`);
                            }
                          }}
                        >
                          <td>
                            <div className="order-id-cell">
                              <span className="order-id-value">
                                {primaryProject.orderId || group?.orderNumber || "N/A"}
                              </span>
                              {getVersionNumber(primaryProject) > 1 && (
                                <span className="order-id-version">
                                  Version v{getVersionNumber(primaryProject)}
                                </span>
                              )}
                              <span className="order-id-lead">
                                {getLeadDisplay(primaryProject, "Unassigned")}
                              </span>
                            </div>
                          </td>
                          <td>{getGroupClient(group, [primaryProject])}</td>
                          <td>{primaryProject.details?.projectName || "Untitled"}</td>
                          <td>
                            <span
                              className={`status-badge ${getStatusClass(getProjectDisplayStatus(primaryProject))}`}
                            >
                              {getProjectDisplayStatus(primaryProject)}
                            </span>
                          </td>
                          <td>{getLeadDisplay(primaryProject, "Unassigned")}</td>
                          <td>{formatDate(primaryProject.createdAt || createdDate)}</td>
                          <td>
                            <button
                              className="action-btn view-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/new-orders/actions/${primaryProject._id}`);
                              }}
                            >
                              View Actions
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <React.Fragment key={groupKey}>
                        <tr className="group-header-row">
                          <td>
                            <div className="group-order-cell">
                              <button
                                type="button"
                                className="group-toggle-btn"
                                onClick={() => toggleOrderGroup(groupKey)}
                                aria-expanded={expanded}
                                aria-label={
                                  expanded
                                    ? `Collapse ${group?.orderNumber || "order"}`
                                    : `Expand ${group?.orderNumber || "order"}`
                                }
                              >
                                {expanded ? (
                                  <svg
                                    viewBox="0 0 24 24"
                                    version="1.1"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden="true"
                                    focusable="false"
                                  >
                                    <polygon points="8 5 8 19 16 12" />
                                  </svg>
                                ) : (
                                  <svg
                                    viewBox="0 0 24 24"
                                    version="1.1"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden="true"
                                    focusable="false"
                                  >
                                    <polygon points="5 8 12 16 19 8" />
                                  </svg>
                                )}
                              </button>
                              <div className="order-id-cell">
                                <span className="order-id-value">
                                  {group?.orderNumber || "N/A"}
                                </span>
                                <span className="order-id-version">
                                  {allProjects.length} project
                                  {allProjects.length === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>{getGroupClient(group, allProjects)}</td>
                          <td>
                            <div className="group-project-cell">
                              <span className="group-project-title">Grouped Order</span>
                              <span className="group-project-subtitle">
                                {allProjects.length} total
                                project{allProjects.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </td>
                          <td>Multiple Leads</td>
                          <td>{formatDate(createdDate)}</td>
                          <td>-</td>
                        </tr>

                        {showGroupChildren &&
                          allProjects.map((order) => (
                            <tr
                              key={order._id}
                              className={`group-child-row clickable-row ${
                                isCollapsing
                                  ? "group-child-row-collapsing"
                                  : "group-child-row-expanding"
                              }`}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                navigate(`/new-orders/actions/${order._id}`)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  navigate(`/new-orders/actions/${order._id}`);
                                }
                              }}
                            >
                              <td>
                                <div className="order-id-cell">
                                  <span className="order-id-value child-order-id-value">
                                    -
                                  </span>
                                  {getVersionNumber(order) > 1 && (
                                    <span className="order-id-version">
                                      Version v{getVersionNumber(order)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>{getGroupClient(group, allProjects)}</td>
                              <td>{order.details?.projectName || "Untitled"}</td>
                              <td>
                                <span
                                  className={`status-badge ${getStatusClass(getProjectDisplayStatus(order))}`}
                                >
                                  {getProjectDisplayStatus(order)}
                                </span>
                              </td>
                              <td>{getLeadDisplay(order, "Unassigned")}</td>
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
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {allOrdersTotalPages > 1 && (
                <div className="orders-pagination">
                  <span className="orders-pagination-summary">
                    Showing {allOrdersPageStart + 1}-{allOrdersPageEnd} of{" "}
                    {allOrderGroupsFiltered.length} orders
                  </span>
                  <div className="orders-pagination-controls">
                    <button
                      className="action-btn orders-pagination-btn"
                      onClick={() =>
                        setAllOrdersPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={safeAllOrdersPage === 1}
                    >
                      Previous
                    </button>
                    <span className="orders-pagination-page">
                      Page {safeAllOrdersPage} of {allOrdersTotalPages}
                    </span>
                    <button
                      className="action-btn orders-pagination-btn"
                      onClick={() =>
                        setAllOrdersPage((prev) =>
                          Math.min(allOrdersTotalPages, prev + 1),
                        )
                      }
                      disabled={safeAllOrdersPage === allOrdersTotalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
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
              No finished orders found matching filters.
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

              <label>
                Client Media{" "}
                {feedbackRequiresMediaAttachment
                  ? "(Required to complete feedback)"
                  : "(Optional)"}
              </label>
              <input
                type="file"
                accept={FEEDBACK_MEDIA_ACCEPT}
                multiple
                onChange={handleFeedbackFileChange}
                className="feedback-media-input"
              />
              <div className="feedback-upload-hint">
                Attach photos, voice notes, or videos shared by the client.
              </div>
              {feedbackFiles.length > 0 && (
                <div className="feedback-selected-files">
                  {feedbackFiles.map((file, index) => (
                    <div
                      className="feedback-selected-file"
                      key={`${file.name}-${file.lastModified}-${index}`}
                    >
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeedbackFile(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="feedback-actions">
                <button className="action-btn" onClick={closeFeedbackModal}>
                  Cancel
                </button>
                <button
                  className="action-btn feedback-submit"
                  onClick={handleAddFeedback}
                  disabled={
                    feedbackSaving ||
                    (feedbackRequiresMediaAttachment &&
                      feedbackFiles.length === 0)
                  }
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
                      {Array.isArray(entry.attachments) &&
                        entry.attachments.filter((file) => file?.fileUrl).length >
                          0 && (
                          <div className="feedback-history-attachments">
                            {entry.attachments
                              .filter((file) => file?.fileUrl)
                              .map((file, index) => (
                                <a
                                  key={`${entry._id || "feedback"}-${index}`}
                                  href={file.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="feedback-attachment-link"
                                >
                                  {getFeedbackAttachmentName(file)}
                                </a>
                              ))}
                          </div>
                        )}
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
