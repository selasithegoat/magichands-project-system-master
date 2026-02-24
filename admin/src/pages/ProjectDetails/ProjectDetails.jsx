import React, { useState, useEffect, useMemo } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";

import "./ProjectDetails.css";
import {
  ProjectsIcon,
  PencilIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "../../icons/Icons";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import ProjectHoldModal from "../../components/ProjectHoldModal/ProjectHoldModal";
import BillingGuardModal from "../../components/BillingGuardModal/BillingGuardModal";
import ProjectCancelModal from "../../components/ProjectCancelModal/ProjectCancelModal";
import ProjectReactivateModal from "../../components/ProjectReactivateModal/ProjectReactivateModal";

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

const normalizeSupplySourceList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const formatSupplySource = (value) => {
  const list = normalizeSupplySourceList(value);
  if (!list.length) return "N/A";
  return list.join(", ");
};

const STATUS_AUTO_ADVANCE_TARGETS = {
  "Proof Reading Completed": "Pending Production",
  "Packaging Completed": "Pending Delivery/Pickup",
};

const BILLING_REQUIREMENT_LABELS = {
  invoice: "Invoice confirmation",
  payment_verification_any: "Payment method verification",
  full_payment_or_authorized:
    "Full payment or authorization verification",
};

const getPaymentTypeSet = (project) =>
  new Set(
    (project?.paymentVerifications || [])
      .map((entry) => String(entry?.type || "").trim())
      .filter(Boolean),
  );

const getPendingProductionBillingMissing = (project) => {
  const missing = [];
  const paymentTypes = getPaymentTypeSet(project);

  if (!project?.invoice?.sent) missing.push("invoice");
  if (paymentTypes.size === 0) missing.push("payment_verification_any");

  return missing;
};

const getPendingDeliveryBillingMissing = (project) => {
  const missing = [];
  const paymentTypes = getPaymentTypeSet(project);

  if (!paymentTypes.has("full_payment") && !paymentTypes.has("authorized")) {
    missing.push("full_payment_or_authorized");
  }

  return missing;
};

const formatBillingMissingLabels = (missing = []) =>
  (Array.isArray(missing) ? missing : [])
    .map((key) => BILLING_REQUIREMENT_LABELS[key] || key)
    .filter(Boolean);

const getMockupApprovalStatus = (approval = {}) => {
  const explicit = String(approval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "pending" || explicit === "approved" || explicit === "rejected") {
    return explicit;
  }
  if (approval?.isApproved) return "approved";
  if (approval?.rejectedAt || approval?.rejectedBy || approval?.rejectionReason) {
    return "rejected";
  }
  return "pending";
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const MINUTE_IN_MS = 60 * 1000;
const SECOND_IN_MS = 1000;

const padTwo = (value) => String(value).padStart(2, "0");

const formatCountdownDuration = (durationMs) => {
  const safeDuration = Math.max(0, Number(durationMs) || 0);
  const totalSeconds = Math.floor(safeDuration / SECOND_IN_MS);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${padTwo(hours)}h ${padTwo(minutes)}m ${padTwo(seconds)}s`;
  }
  return `${padTwo(hours)}h ${padTwo(minutes)}m ${padTwo(seconds)}s`;
};

const parseDeliveryTimeParts = (value) => {
  if (!value) return { hours: 23, minutes: 59, seconds: 59 };
  const raw = String(value).trim();
  if (!raw) return { hours: 23, minutes: 59, seconds: 59 };

  if (raw.includes("T")) {
    const parsedIso = new Date(raw);
    if (!Number.isNaN(parsedIso.getTime())) {
      return {
        hours: parsedIso.getHours(),
        minutes: parsedIso.getMinutes(),
        seconds: parsedIso.getSeconds(),
      };
    }
  }

  const match12h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12h) {
    let hours = Number.parseInt(match12h[1], 10);
    const minutes = Number.parseInt(match12h[2], 10);
    const seconds = Number.parseInt(match12h[3] || "0", 10);
    const period = match12h[4].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return { hours, minutes, seconds };
  }

  const match24h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24h) {
    const hours = Number.parseInt(match24h[1], 10);
    const minutes = Number.parseInt(match24h[2], 10);
    const seconds = Number.parseInt(match24h[3] || "0", 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes, seconds };
    }
  }

  return null;
};

const buildDeliveryDeadline = (deliveryDate, deliveryTime) => {
  if (!deliveryDate) return null;
  const parsedDate = new Date(deliveryDate);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const timeParts = parseDeliveryTimeParts(deliveryTime);
  if (!timeParts) return null;

  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    timeParts.hours,
    timeParts.minutes,
    timeParts.seconds,
    0,
  );
};

const formatDeadlineDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Add missing icons locally
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

const SystemIcon = ({ width = 16, height = 16, color = "currentColor" }) => (
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
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const FolderIcon = ({ width = 24, height = 24, color = "currentColor" }) => (
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
    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

const ProjectDetails = ({ user }) => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState([]); // New state for updates
  const [undoingDept, setUndoingDept] = useState(null);
  const [isTogglingHold, setIsTogglingHold] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdReasonDraft, setHoldReasonDraft] = useState("");
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReasonDraft, setCancelReasonDraft] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  const [reactivateError, setReactivateError] = useState("");
  const [billingGuardModal, setBillingGuardModal] = useState({
    open: false,
    title: "Billing Caution",
    message: "",
    missingLabels: [],
    nextStatus: "",
    canOverride: false,
    overrideButtonText: "Continue with Override",
  });
  const [billingGuardSubmitting, setBillingGuardSubmitting] = useState(false);
  const [countdownNowMs, setCountdownNowMs] = useState(Date.now());

  const currentUserId = toEntityId(user?._id || user?.id);
  const projectLeadUserId = toEntityId(project?.projectLeadId);
  const isLeadUser = Boolean(
    currentUserId && projectLeadUserId && currentUserId === projectLeadUserId,
  );

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const ensureProjectIsEditable = () => {
    const isAdminLeadOnProject = Boolean(user?.role === "admin" && isLeadUser);
    if (isAdminLeadOnProject) {
      alert(
        "You cannot modify a project where you are the assigned Project Lead. Ask another admin to make this change.",
      );
      return false;
    }

    const currentlyCancelled = Boolean(project?.cancellation?.isCancelled);
    if (currentlyCancelled) {
      alert(
        "This project is cancelled and frozen. Reactivate it before making changes.",
      );
      return false;
    }

    const currentlyOnHold =
      project?.hold?.isOnHold || project?.status === "On Hold";
    if (currentlyOnHold) {
      alert("This project is on hold. Release hold before making changes.");
      return false;
    }
    return true;
  };

  const closeBillingGuardModal = () => {
    if (billingGuardSubmitting) return;
    setBillingGuardModal({
      open: false,
      title: "Billing Caution",
      message: "",
      missingLabels: [],
      nextStatus: "",
      canOverride: false,
      overrideButtonText: "Continue with Override",
    });
  };

  const openBillingGuardModal = (guard, nextStatus, options = {}) => {
    const missingLabels = Array.isArray(options.missingLabels)
      ? options.missingLabels
      : formatBillingMissingLabels(guard?.missing || []);
    const allowOverride =
      options.canOverride !== undefined
        ? Boolean(options.canOverride)
        : Boolean(user?.role === "admin");

    setBillingGuardModal({
      open: true,
      title: options.title || "Billing Caution",
      message:
        guard?.message ||
        options.fallbackMessage ||
        "Billing prerequisites are required for this step.",
      missingLabels,
      nextStatus: nextStatus || "",
      canOverride: allowOverride,
      overrideButtonText:
        options.overrideButtonText || "Continue with Override",
    });
  };

  const submitStatusChange = async (
    newStatus,
    { allowBillingOverride = false } = {},
  ) => {
    if (!project) return false;
    const oldStatus = project.status;

    // Optimistic update
    setProject({ ...project, status: newStatus });

    try {
      const res = await fetch(`/api/projects/${id}/status?source=admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: newStatus,
          allowBillingOverride: allowBillingOverride && user?.role === "admin",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setProject({ ...project, status: oldStatus });

        if (errorData?.code === "BILLING_PREREQUISITE_MISSING") {
          openBillingGuardModal(errorData, newStatus);
          return false;
        }

        if (
          errorData?.code === "MOCKUP_CLIENT_APPROVAL_REQUIRED" ||
          errorData?.code === "MOCKUP_FILE_REQUIRED" ||
          errorData?.code === "MOCKUP_CLIENT_REJECTED"
        ) {
          const latestVersionNumber = Number.parseInt(
            errorData?.latestVersion?.version,
            10,
          );
          const hasVersion =
            Number.isFinite(latestVersionNumber) && latestVersionNumber > 0;

          openBillingGuardModal(
            {
              message:
                errorData?.message ||
                "Mockup requirements must be satisfied before this stage can be completed.",
            },
            "",
            {
              title: "Mockup Caution",
              canOverride: false,
              missingLabels:
                errorData?.code === "MOCKUP_CLIENT_APPROVAL_REQUIRED"
                  ? [
                      hasVersion
                        ? `Client approval for mockup v${latestVersionNumber}`
                        : "Client approval for latest mockup",
                    ]
                  : errorData?.code === "MOCKUP_CLIENT_REJECTED"
                    ? [
                        hasVersion
                          ? `Client rejected mockup v${latestVersionNumber}`
                          : "Latest mockup was rejected",
                      ]
                  : ["Uploaded mockup file"],
              fallbackMessage:
                "Mockup requirements must be satisfied before this stage can be completed.",
            },
          );
          return false;
        }

        throw new Error(errorData.message || "Failed to update status");
      }

      await fetchProject();
      return true;
    } catch (err) {
      console.error("Error updating status:", err);
      // Revert on error
      setProject({ ...project, status: oldStatus });
      alert(err.message || "Failed to update status");
      return false;
    }
  };

  // Status handling
  const handleStatusChange = async (newStatus) => {
    if (!project) return;
    if (!ensureProjectIsEditable()) return;

    await submitStatusChange(newStatus);
  };

  const handleBillingGuardOverride = async () => {
    if (!billingGuardModal.nextStatus || user?.role !== "admin") return;
    setBillingGuardSubmitting(true);
    const changed = await submitStatusChange(billingGuardModal.nextStatus, {
      allowBillingOverride: true,
    });
    setBillingGuardSubmitting(false);
    if (changed) {
      closeBillingGuardModal();
    }
  };

  const handleProjectHoldToggle = async (nextOnHold, reason = "") => {
    if (!project || isTogglingHold) return;

    setIsTogglingHold(true);
    try {
      const res = await fetch(`/api/projects/${id}/hold`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          nextOnHold ? { onHold: true, reason } : { onHold: false },
        ),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update hold state.");
      }

      const updatedProject = await res.json();
      setProject(updatedProject);
      setHoldReasonDraft(updatedProject.hold?.reason || "");
      setIsEditing(false);
      setIsEditingLead(false);
      setIsHoldModalOpen(false);
    } catch (error) {
      console.error("Error toggling project hold:", error);
      alert(error.message || "Failed to update hold state.");
    } finally {
      setIsTogglingHold(false);
    }
  };

  const handleHoldActionClick = () => {
    if (!project || isTogglingHold) return;

    if (isProjectOnHold) {
      handleProjectHoldToggle(false);
      return;
    }

    setHoldReasonDraft(project.hold?.reason || "");
    setIsHoldModalOpen(true);
  };

  const closeCancelModal = () => {
    if (isCancelling) return;
    setIsCancelModalOpen(false);
    setCancelError("");
  };

  const closeReactivateModal = () => {
    if (isReactivating) return;
    setIsReactivateModalOpen(false);
    setReactivateError("");
  };

  const handleCancelActionClick = () => {
    if (!project || isCancelling || isReactivating) return;
    if (!ensureProjectIsEditable()) return;
    setCancelReasonDraft(project.cancellation?.reason || "");
    setCancelError("");
    setIsCancelModalOpen(true);
  };

  const handleReactivateActionClick = () => {
    if (!project || isReactivating || isCancelling) return;
    setReactivateError("");
    setIsReactivateModalOpen(true);
  };

  const handleCancelProject = async (reason = "") => {
    if (!project || isCancelling) return;
    setIsCancelling(true);
    setCancelError("");
    try {
      const res = await fetch(`/api/projects/${id}/cancel?source=admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to cancel project.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
      setIsEditing(false);
      setIsEditingLead(false);
      setIsHoldModalOpen(false);
      setIsCancelModalOpen(false);
      setCancelError("");
      navigate("/cancelled-orders");
    } catch (error) {
      console.error("Error cancelling project:", error);
      setCancelError(error.message || "Failed to cancel project.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReactivateProject = async () => {
    if (!project || isReactivating || isCancelling) return;

    setIsReactivating(true);
    setReactivateError("");
    try {
      const res = await fetch(`/api/projects/${id}/reactivate?source=admin`, {
        method: "PATCH",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to reactivate project.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
      setIsEditing(false);
      setIsEditingLead(false);
      setIsHoldModalOpen(false);
      setIsCancelModalOpen(false);
      setIsReactivateModalOpen(false);
      setReactivateError("");
    } catch (error) {
      console.error("Error reactivating project:", error);
      setReactivateError(error.message || "Failed to reactivate project.");
    } finally {
      setIsReactivating(false);
    }
  };

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const applyProjectToState = (data) => {
    if (!data) return;
    setProject(data);
    setCancelReasonDraft(data.cancellation?.reason || "");
    setEditForm({
      orderId: data.orderId || "",
      client: data.details?.client || "",
      clientEmail: data.details?.clientEmail || "", // [NEW]
      clientPhone: data.details?.clientPhone || "", // [NEW]
      briefOverview: data.details?.briefOverview || "", // [New]
      orderDate: data.orderDate
        ? data.orderDate.split("T")[0]
        : data.createdAt
          ? data.createdAt.split("T")[0]
          : "",
      receivedTime: data.receivedTime || "",
      deliveryDate: data.details?.deliveryDate
        ? data.details.deliveryDate.split("T")[0]
        : "",
      deliveryTime: data.details?.deliveryTime || "",
      deliveryLocation: data.details?.deliveryLocation || "",
      contactType: data.details?.contactType || "None",
      supplySource: formatSupplySource(data.details?.supplySource),
    });
  };

  const fetchProject = async ({ showLoading = true, retries = 1 } = {}) => {
    if (showLoading) setLoading(true);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch project");
      }

      const data = await res.json();
      applyProjectToState(data);
    } catch (err) {
      console.error("Error fetching project:", err);
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return fetchProject({ showLoading: false, retries: retries - 1 });
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchUpdates = async () => {
    try {
      const res = await fetch(`/api/updates/project/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUpdates(data);
      }
    } catch (err) {
      console.error("Error fetching updates:", err);
    }
  };

  useEffect(() => {
    const stateProject = location.state?.project;
    if (
      stateProject &&
      String(stateProject._id || "") === String(id || "")
    ) {
      applyProjectToState(stateProject);
      setLoading(false);
      fetchProject({ showLoading: false, retries: 1 });
    } else {
      fetchProject({ showLoading: true, retries: 1 });
    }

    fetchUpdates();

    // Fetch users for Lead Edit
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };
    fetchUsers();
  }, [id, location.state]);

  useRealtimeRefresh(
    () => {
      fetchProject();
      fetchUpdates();
    },
    { enabled: Boolean(id) },
  );

  // Lead Edit State
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [leadForm, setLeadForm] = useState("");
  const [assistantLeadForm, setAssistantLeadForm] = useState("");

  // Sync leadForm when project loads
  useEffect(() => {
    if (project) {
      setLeadForm(project.projectLeadId?._id || project.projectLeadId || "");
      setAssistantLeadForm(
        project.assistantLeadId?._id || project.assistantLeadId || "",
      );
    }
  }, [project]);

  const handleSaveLead = async () => {
    if (!ensureProjectIsEditable()) return;
    try {
      // Find selected user object for optimistic update (optional but good)
      const selectedUser = availableUsers.find((u) => u._id === leadForm);
      const leadLabel = selectedUser
        ? `${selectedUser.firstName || ""} ${selectedUser.lastName || ""}`.trim() ||
          selectedUser.name ||
          ""
        : "";

      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectLeadId: leadForm,
          assistantLeadId: assistantLeadForm,
          lead: leadLabel, // Also update duplicate lead name in details if needed
        }),
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setIsEditingLead(false);
      } else {
        alert("Failed to update Project Lead");
      }
    } catch (error) {
      console.error("Error updating lead:", error);
      alert("Error updating lead");
    }
  };

  const handleEditToggle = () => {
    if (!project) return;
    if (!isEditing && !ensureProjectIsEditable()) return;
    // Reset form to current project state when opening edit
    if (!isEditing) {
      setEditForm({
        orderId: project.orderId || "",
        client: project.details?.client || "",
        clientEmail: project.details?.clientEmail || "", // [NEW]
        clientPhone: project.details?.clientPhone || "", // [NEW]
        orderDate: project.orderDate
          ? project.orderDate.split("T")[0]
          : project.createdAt
            ? project.createdAt.split("T")[0]
            : "",
        receivedTime: project.receivedTime || "",
        deliveryDate: project.details?.deliveryDate
          ? project.details.deliveryDate.split("T")[0]
          : "",
        deliveryTime: project.details?.deliveryTime || "",
        deliveryLocation: project.details?.deliveryLocation || "",
        contactType: project.details?.contactType || "None",
        supplySource: project.details?.supplySource || "",
      });
    }
    setIsEditing(!isEditing);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!ensureProjectIsEditable()) return;
    try {
      // Construct payload with flattened fields as expected by the controller
      const payload = {
        orderId: editForm.orderId,
        client: editForm.client,
        clientEmail: editForm.clientEmail, // [NEW]
        clientPhone: editForm.clientPhone, // [NEW]
        briefOverview: editForm.briefOverview, // [New]
        orderDate: editForm.orderDate,
        receivedTime: editForm.receivedTime,
        deliveryDate: editForm.deliveryDate,
        deliveryTime: editForm.deliveryTime,
        deliveryLocation: editForm.deliveryLocation,
        contactType: editForm.contactType,
        supplySource: editForm.supplySource,
      };

      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setIsEditing(false);
      } else {
        console.error("Failed to update project");
        alert("Failed to save changes.");
      }
    } catch (err) {
      console.error("Error saving project:", err);
      alert("Error saving changes.");
    }
  };

  const handleChecklistToggle = async (key, val) => {
    if (!ensureProjectIsEditable()) return;
    if (!project || !project.quoteDetails) return;

    const currentChecklist = project.quoteDetails.checklist || {};
    const updatedChecklist = { ...currentChecklist, [key]: !val };

    // Optimistic update
    const updatedProject = {
      ...project,
      quoteDetails: {
        ...project.quoteDetails,
        checklist: updatedChecklist,
      },
    };
    setProject(updatedProject);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          quoteDetails: {
            ...project.quoteDetails,
            checklist: updatedChecklist,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update checklist");
      }
    } catch (err) {
      console.error("Error updating checklist:", err);
      alert("Failed to update checklist");
      // Revert is not strictly necessary if we rely on next fetch, but good practice
      // For now, simpler to just re-fetch if needed or rely on alert
    }
  };

  const handleUndoAcknowledgement = async (department) => {
    if (!project) return;
    if (!ensureProjectIsEditable()) return;
    setUndoingDept(department);
    try {
      const res = await fetch(`/api/projects/${id}/acknowledge`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ department }),
      });

      if (!res.ok) {
        throw new Error("Failed to undo acknowledgement");
      }

      const updatedProject = await res.json();
      setProject(updatedProject);
    } catch (err) {
      console.error("Error undoing acknowledgement:", err);
      alert("Failed to undo acknowledgement");
    } finally {
      setUndoingDept(null);
    }
  };

  const deliveryDateValue = project?.details?.deliveryDate;
  const deliveryTimeValue = project?.details?.deliveryTime;
  const deliveryDeadline = useMemo(
    () => buildDeliveryDeadline(deliveryDateValue, deliveryTimeValue),
    [deliveryDateValue, deliveryTimeValue],
  );
  const deliveryCountdown = useMemo(() => {
    if (!deliveryDateValue) {
      return {
        state: "unavailable",
        valueText: "No delivery date set",
        deadlineText: "",
      };
    }

    if (!deliveryDeadline || Number.isNaN(deliveryDeadline.getTime())) {
      return {
        state: "invalid",
        valueText: "Invalid delivery date/time",
        deadlineText: "",
      };
    }

    const deltaMs = deliveryDeadline.getTime() - countdownNowMs;
    const deadlineText = formatDeadlineDateTime(deliveryDeadline);

    if (deltaMs < 0) {
      return {
        state: "overdue",
        valueText: `Overdue by ${formatCountdownDuration(Math.abs(deltaMs))}`,
        deadlineText,
      };
    }

    return {
      state: deltaMs <= DAY_IN_MS ? "due-soon" : "on-track",
      valueText: `${formatCountdownDuration(deltaMs)} left`,
      deadlineText,
    };
  }, [countdownNowMs, deliveryDateValue, deliveryDeadline]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
        Loading details...
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
        Project not found.
      </div>
    );
  }

  const isProjectOnHold = Boolean(
    project.hold?.isOnHold || project.status === "On Hold",
  );
  const isCancelledProject = Boolean(project.cancellation?.isCancelled);

  // Helpers
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    // ISO string
    if (timeStr.includes("T")) {
      return new Date(timeStr).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    // Check for 12-hour format (e.g. 02:30 PM)
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
    if (match) {
      let [_, h, m, period] = match;
      h = parseInt(h);
      if (period.toUpperCase() === "PM" && h < 12) h += 12;
      if (period.toUpperCase() === "AM" && h === 12) h = 0;
      return `${h.toString().padStart(2, "0")}:${m}`;
    }
    return timeStr;
  };

  const formatReceivedTime = () => {
    if (!project.receivedTime) return "N/A";
    const time = formatTime(project.receivedTime);

    // If original was ISO, formatTime returns just the time.
    // If it was just time string, formatTime returns just the time (converted).
    // We want to show Date + Time if possible.

    if (project.receivedTime.includes("T")) {
      return new Date(project.receivedTime).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    const dateBase = project.orderDate || project.createdAt;
    return `${new Date(dateBase).toLocaleDateString()} at ${time}`;
  };

  const formatLastUpdated = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatFeedbackDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const details = project.details || {};
  const clientEmail = (details.clientEmail || "").trim();
  const clientPhone = (details.clientPhone || "").trim();
  const clientContactDisplay =
    clientEmail && clientPhone
      ? `${clientEmail} / ${clientPhone}`
      : clientEmail || clientPhone || "N/A";
  const mockup = project.mockup || {};
  const mockupUrl = mockup.fileUrl;
  const mockupName =
    mockup.fileName || (mockupUrl ? mockupUrl.split("/").pop() : "");
  const parsedMockupVersion = Number.parseInt(mockup.version, 10);
  const mockupVersion =
    Number.isFinite(parsedMockupVersion) && parsedMockupVersion > 0
      ? parsedMockupVersion
      : null;
  const mockupVersionLabel = mockupVersion ? `v${mockupVersion}` : "";
  const mockupApprovalStatus = getMockupApprovalStatus(
    mockup?.clientApproval || {},
  );
  const isMockupClientApproved = mockupApprovalStatus === "approved";
  const isMockupClientRejected = mockupApprovalStatus === "rejected";
  const mockupApprovedAtLabel = mockup?.clientApproval?.approvedAt
    ? formatLastUpdated(mockup.clientApproval.approvedAt)
    : null;
  const mockupRejectedAtLabel = mockup?.clientApproval?.rejectedAt
    ? formatLastUpdated(mockup.clientApproval.rejectedAt)
    : null;
  const mockupRejectionReason = String(
    mockup?.clientApproval?.rejectionReason ||
      mockup?.clientApproval?.note ||
      "",
  ).trim();
  const paymentLabels = {
    part_payment: "Part Payment",
    full_payment: "Full Payment",
    po: "P.O",
    authorized: "Authorized",
  };
  const paymentTypes = (project.paymentVerifications || []).map((entry) => entry.type);
  const isQuoteProject = project.projectType === "Quote";
  const invoiceSent = Boolean(project.invoice?.sent);
  const pendingProductionMissing = isQuoteProject
    ? []
    : getPendingProductionBillingMissing(project);
  const pendingDeliveryMissing = isQuoteProject
    ? []
    : getPendingDeliveryBillingMissing(project);
  const showPendingProductionWarning =
    !isQuoteProject &&
    ["Pending Proof Reading", "Pending Production"].includes(project.status) &&
    pendingProductionMissing.length > 0;
  const showPendingDeliveryWarning =
    !isQuoteProject &&
    ["Pending Packaging", "Pending Delivery/Pickup"].includes(project.status) &&
    pendingDeliveryMissing.length > 0;
  const pendingProductionMissingLabels = formatBillingMissingLabels(
    pendingProductionMissing,
  );
  const pendingDeliveryMissingLabels = formatBillingMissingLabels(
    pendingDeliveryMissing,
  );
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;
  const feedbacksSorted = (project.feedbacks || []).slice().sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  const showFeedbackSection = [
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
  ].includes(project.status);

  const normalizeAttachment = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      return value.url || value.path || value.location || value.filename || null;
    }
    return null;
  };

  return (
    <div
      className={`project-details-page ${
        project &&
        (project.priority === "Urgent" || project.projectType === "Emergency")
          ? "emergency-theme"
          : ""
      }`}
    >
      <Link to="/projects" className="back-link">
        ← Back to Projects
      </Link>

      {project &&
        (project.priority === "Urgent" ||
          project.projectType === "Emergency") && (
          <div className="emergency-banner mb-6">
            <span style={{ fontSize: "1.5rem" }}>🔥</span>
            <span>EMERGENCY PROJECT - URGENT</span>
          </div>
        )}

        <div className="details-header">
          <div className="header-left header-left-vertical">
            <h1 className="header-order">
              {project.orderId || "Order #..."}
              {showVersionTag && (
                <span className="project-version-badge">v{projectVersion}</span>
              )}
            </h1>
            <div className="header-status header-status-actions">
              <select
                className={`status-badge-select ${project.status
                  ?.toLowerCase()
                  .replace(" ", "-")}`}
                value={project.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={
                  loading ||
                  isLeadUser ||
                  isProjectOnHold ||
                  isCancelledProject ||
                  isTogglingHold ||
                  isCancelling ||
                  isReactivating
                }
                style={{
                  marginLeft: 0,
                  padding: "0.25rem 0.5rem",
                  borderRadius: "999px",
                  border: "1px solid transparent",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  backgroundColor: "rgba(255, 255, 255, 0.2)", // Translucent background
                  color: "inherit",
                }}
              >
                {(project.projectType === "Quote"
                  ? [
                      "Order Confirmed",
                      "Pending Scope Approval",
                      "Scope Approval Completed",
                      "Pending Departmental Engagement",
                      "Departmental Engagement Completed",
                      "Pending Quote Request",
                      "Quote Request Completed",
                      "Pending Send Response",
                      "Response Sent",
                      "Pending Feedback",
                      "Feedback Completed",
                      "Completed",
                      ...(isProjectOnHold ? ["On Hold"] : []),
                    ]
                  : [
                      "Order Confirmed",
                      "Pending Scope Approval",
                      "Scope Approval Completed",
                      "Pending Departmental Engagement",
                      "Departmental Engagement Completed",
                      "Pending Mockup",
                      "Mockup Completed",
                      "Pending Proof Reading",
                      "Proof Reading Completed",
                      "Pending Production",
                      "Production Completed",
                      "Pending Quality Control",
                      "Quality Control Completed",
                      "Pending Photography",
                      "Photography Completed",
                      "Pending Packaging",
                      "Packaging Completed",
                      "Pending Delivery/Pickup",
                      "Delivered",
                      "Pending Feedback",
                      "Feedback Completed",
                      "Completed",
                      ...(isProjectOnHold ? ["On Hold"] : []),
                    ]
                ).map((status) => (
                  <option
                    key={status}
                    value={status}
                    style={{ color: "#1e293b" }}
                  >
                    {status}
                  </option>
                ))}
              </select>
              {user?.role === "admin" &&
                !isLeadUser &&
                (isCancelledProject ? (
                  <button
                    type="button"
                    className="hold-toggle-btn reactivate"
                    onClick={handleReactivateActionClick}
                    disabled={isReactivating || isCancelling}
                  >
                    {isReactivating ? "Reactivating..." : "Reactivate Project"}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`hold-toggle-btn ${isProjectOnHold ? "release" : "hold"}`}
                      onClick={handleHoldActionClick}
                      disabled={isTogglingHold || isCancelling}
                    >
                      {isTogglingHold
                        ? isProjectOnHold
                          ? "Releasing..."
                          : "Holding..."
                        : isProjectOnHold
                          ? "Release Hold"
                          : "Put On Hold"}
                    </button>
                    <button
                      type="button"
                      className="hold-toggle-btn cancel-project"
                      onClick={handleCancelActionClick}
                      disabled={isTogglingHold || isCancelling || isReactivating}
                    >
                      {isCancelling ? "Cancelling..." : "Cancel Project"}
                    </button>
                  </>
                ))}
            </div>
            <div
              className={`delivery-countdown-badge ${deliveryCountdown.state}`}
              role="status"
              aria-live="polite"
            >
              <span className="delivery-countdown-title">Delivery Countdown</span>
              <strong className="delivery-countdown-value">
                {deliveryCountdown.valueText}
              </strong>
              {deliveryCountdown.deadlineText ? (
                <span className="delivery-countdown-deadline">
                  Deadline: {deliveryCountdown.deadlineText}
                </span>
              ) : null}
            </div>
            <div className="billing-tags">
              {invoiceSent && (
                <span className="billing-tag invoice">
                  {isQuoteProject ? "Quote Sent" : "Invoice Sent"}
                </span>
              )}
              {!isQuoteProject &&
                paymentTypes.map((type) => (
                  <span key={type} className="billing-tag payment">
                    {paymentLabels[type] || type}
                  </span>
                ))}
              {showPendingProductionWarning && (
                <span className="billing-tag caution">
                  Pending Production Blocked:{" "}
                  {pendingProductionMissingLabels.join(", ")}
                </span>
              )}
              {showPendingDeliveryWarning && (
                <span className="billing-tag caution">
                  Pending Delivery Blocked: {pendingDeliveryMissingLabels.join(", ")}
                </span>
              )}
            </div>
            {showPendingProductionWarning && (
              <div className="payment-warning critical">
                Caution: before moving to Pending Production, confirm{" "}
                {pendingProductionMissingLabels.join(", ")}.
              </div>
            )}
            {showPendingDeliveryWarning && (
              <div className="payment-warning critical">
                Caution: before moving to Pending Delivery/Pickup, confirm{" "}
                {pendingDeliveryMissingLabels.join(", ")}.
              </div>
            )}
            {isCancelledProject && (
              <div className="cancelled-alert">
                This project is cancelled and frozen at{" "}
                <strong>
                  {project.cancellation?.resumedStatus || project.status || "N/A"}
                </strong>
                {project.cancellation?.cancelledAt
                  ? ` since ${formatLastUpdated(project.cancellation.cancelledAt)}`
                  : ""}
                .
                {project.cancellation?.reason
                  ? ` Reason: ${project.cancellation.reason}`
                  : ""}
              </div>
            )}
            {isProjectOnHold && (
              <div className="hold-alert">
                This project is on hold
                {project.hold?.reason ? `: ${project.hold.reason}` : "."}
              </div>
            )}
            <p className="header-project-name">{details.projectName}</p>
          </div>
        </div>

      <div className="details-grid">
        {/* Left Column */}
        <div className="main-info">
          {/* General Info */}
          <div className="detail-card">
            <h3
              className="card-title"
              style={{ justifyContent: "space-between" }}
            >
              <span>
                General Information
                {project.sectionUpdates?.details && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginLeft: "0.75rem",
                    }}
                  >
                    (Last Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.details)})
                  </span>
                )}
              </span>
              {!isEditing ? (
                !isLeadUser && !isProjectOnHold && !isCancelledProject && (
                  <button
                    onClick={handleEditToggle}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                    title="Edit Info"
                  >
                    <PencilIcon width="18" height="18" />
                  </button>
                )
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleSave}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#22c55e",
                      cursor: "pointer",
                    }}
                    title="Save"
                  >
                    <CheckCircleIcon width="20" height="20" />
                  </button>
                  <button
                    onClick={handleEditToggle}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                    title="Cancel"
                  >
                    <XMarkIcon width="20" height="20" />
                  </button>
                </div>
              )}
            </h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Order Number</label>
                {isEditing ? (
                  <input
                    className="edit-input"
                    name="orderId"
                    value={editForm.orderId || ""}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{project.orderId || "N/A"}</p>
                )}
              </div>
              <div className="info-item">
                <label>Client</label>
                {isEditing ? (
                  <input
                    className="edit-input"
                    name="client"
                    value={editForm.client}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{details.client || "N/A"}</p>
                )}
              </div>
              <div className="info-item">
                <label>Client Contact / Email</label>
                {isEditing ? (
                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    <input
                      className="edit-input"
                      name="clientEmail"
                      value={editForm.clientEmail}
                      onChange={handleChange}
                      placeholder="Email"
                    />
                    <input
                      className="edit-input"
                      name="clientPhone"
                      value={editForm.clientPhone}
                      onChange={handleChange}
                      placeholder="Phone"
                    />
                  </div>
                ) : (
                  <p>{clientContactDisplay}</p>
                )}
              </div>
              <div className="info-item">
                <label>Order Date</label>
                {isEditing ? (
                  <input
                    type="date"
                    className="edit-input"
                    name="orderDate"
                    value={editForm.orderDate}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{formatDate(project.orderDate || project.createdAt)}</p>
                )}
              </div>
              <div className="info-item">
                <label>Received Time</label>
                {isEditing ? (
                  <input
                    type="time"
                    className="edit-input"
                    name="receivedTime"
                    value={
                      editForm.receivedTime?.includes("T")
                        ? ""
                        : editForm.receivedTime || ""
                    }
                    onChange={handleChange}
                  />
                ) : (
                  <p>{formatReceivedTime()}</p>
                )}
              </div>
              {project.projectType !== "Quote" && (
                <>
                  <div className="info-item">
                    <label>Delivery</label>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input
                          type="date"
                          className="edit-input"
                          name="deliveryDate"
                          value={editForm.deliveryDate}
                          onChange={handleChange}
                        />
                        <input
                          type="time"
                          className="edit-input"
                          name="deliveryTime"
                          value={editForm.deliveryTime}
                          onChange={handleChange}
                        />
                      </div>
                    ) : (
                      <p>
                        {formatDate(details.deliveryDate)}
                        {details.deliveryTime
                          ? ` @ ${formatTime(details.deliveryTime)}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Location</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="deliveryLocation"
                        value={editForm.deliveryLocation}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{details.deliveryLocation || "N/A"}</p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Contact Type</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="contactType"
                        value={editForm.contactType}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{details.contactType || "None"}</p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Supply Source</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="supplySource"
                        value={editForm.supplySource}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{formatSupplySource(details.supplySource)}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Brief Overview Section (Moved from General Info) */}
          <div className="detail-card">
              <h3 className="card-title">Brief Overview</h3>
              <div style={{ marginTop: "1rem" }}>
                {isEditing ? (
                  <textarea
                    className="edit-input"
                    name="briefOverview"
                    value={editForm.briefOverview || ""}
                    onChange={handleChange}
                    rows={4}
                    style={{
                      resize: "vertical",
                      width: "100%",
                      padding: "0.75rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.95rem",
                    }}
                  />
                ) : (
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      color: "var(--text-secondary)",
                      lineHeight: "1.6",
                      fontSize: "0.95rem",
                    }}
                  >
                    {details.briefOverview || "No overview provided."}
                  </p>
                )}
              </div>
            </div>

          {/* Feedback */}
          {showFeedbackSection && (
            <div className="detail-card">
              <h3 className="card-title">Feedback</h3>
              {feedbacksSorted.length === 0 ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  No feedback submitted yet.
                </p>
              ) : (
                <div className="feedback-list">
                  {feedbacksSorted.map((feedback) => (
                    <div className="feedback-item" key={feedback._id}>
                      <div className="feedback-meta">
                        <span
                          className={`feedback-pill ${
                            feedback.type === "Positive"
                              ? "positive"
                              : "negative"
                          }`}
                        >
                          {feedback.type}
                        </span>
                        <span className="feedback-by">
                          {feedback.createdByName || "Unknown"}
                        </span>
                        <span className="feedback-date">
                          {formatFeedbackDate(feedback.createdAt)}
                        </span>
                      </div>
                      <p className="feedback-notes">
                        {feedback.notes?.trim()
                          ? feedback.notes
                          : "No notes provided."}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quote Checklist (Only for Quote projects) */}
          {project.projectType === "Quote" && (
            <div className="detail-card">
              <h3 className="card-title">Quote Requirements</h3>
              <div
                className="checklist-admin-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: "1rem",
                  marginTop: "1rem",
                }}
              >
                {project.quoteDetails?.checklist ? (
                  Object.entries(project.quoteDetails.checklist).map(
                    ([key, val]) => (
                      <div
                        key={key}
                        onClick={() => handleChecklistToggle(key, val)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.75rem",
                          background: val
                            ? "rgba(16, 185, 129, 0.1)"
                            : "rgba(255, 255, 255, 0.03)",
                          borderRadius: "8px",
                          border: val
                            ? "1px solid rgba(16, 185, 129, 0.2)"
                            : "1px solid var(--border-color)",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        className="checklist-admin-item"
                      >
                        <span
                          style={{
                            color: val ? "#10b981" : "var(--text-secondary)",
                            fontSize: "1.2rem",
                          }}
                        >
                          {val ? "✓" : "○"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.9rem",
                            color: val ? "#f8fafc" : "var(--text-secondary)",
                            fontWeight: val ? 600 : 400,
                          }}
                        >
                          {key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase())}
                        </span>
                      </div>
                    ),
                  )
                ) : (
                  <p style={{ color: "var(--text-secondary)" }}>
                    No checklist requirements.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Reference Material / Image */}
          {(project.sampleImage ||
            details.sampleImage ||
            (project.attachments && project.attachments.length > 0) ||
            (details.attachments && details.attachments.length > 0)) && (
            <div className="detail-card">
              <h3 className="card-title">Reference Material</h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                  marginTop: "1rem",
                }}
              >
                {/* Unified Attachments Grid */}
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    {[
                      // Combine sampleImage (if exists) + all attachments
                      ...(project.sampleImage || details.sampleImage
                        ? [project.sampleImage || details.sampleImage]
                        : []),
                      ...(project.attachments || []),
                      ...(details.attachments || []),
                    ]
                      .map(normalizeAttachment)
                      .filter(Boolean)
                      // Filter out duplicates if any (by path string)
                      .filter(
                        (value, index, self) => self.indexOf(value) === index,
                      )
                      .map((path, idx) => {
                        const isImage =
                          typeof path === "string" &&
                          /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
                        // Safe check for path being a string before split
                        const fileName =
                          typeof path === "string"
                            ? path.split("/").pop()
                            : "File";

                        // Debug log for path issues if any
                        // console.log("Rendering attachment path:", path);

                          return (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem",
                              }}
                            >
                              <Link
                                to={path}
                                target="_blank"
                                rel="noopener noreferrer"
                                reloadDocument
                                style={{
                                  position: "relative",
                                  aspectRatio: "1",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "10px",
                                  overflow: "hidden",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(255, 255, 255, 0.03)",
                                  textDecoration: "none",
                                  transition: "transform 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.transform =
                                    "scale(1.02)")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.transform = "scale(1)")
                                }
                                title={fileName}
                              >
                                {isImage ? (
                                  <img
                                    src={path}
                                    alt="attachment"
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      textAlign: "center",
                                      padding: "0.75rem",
                                      color: "var(--text-secondary)",
                                      width: "100%",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <FolderIcon width="28" height="28" />
                                    <div
                                      style={{
                                        marginTop: "0.5rem",
                                        fontSize: "0.75rem",
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                        overflow: "hidden",
                                        color: "#f8fafc",
                                      }}
                                    >
                                      {fileName}
                                    </div>
                                  </div>
                                )}
                              </Link>
                              <Link
                                to={path}
                                download
                                reloadDocument
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#38bdf8",
                                  textDecoration: "none",
                                  fontWeight: 600,
                                }}
                              >
                                Download
                              </Link>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
          )}

          {mockupUrl && (
            <div className="detail-card">
              <h3 className="card-title">
                Approved Mockup{" "}
                {mockupVersionLabel && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#7c3aed",
                      fontWeight: 700,
                    }}
                  >
                    {mockupVersionLabel}
                  </span>
                )}
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                {mockupApprovalStatus === "pending" && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#9f1239",
                      background: "#fff1f2",
                      border: "1px solid #fda4af",
                      borderRadius: "8px",
                      padding: "0.45rem 0.6rem",
                    }}
                  >
                    Pending client approval.
                  </div>
                )}
                {isMockupClientApproved && mockupApprovedAtLabel && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#166534",
                      background: "#f0fdf4",
                      border: "1px solid #86efac",
                      borderRadius: "8px",
                      padding: "0.45rem 0.6rem",
                    }}
                  >
                    Client approved: {mockupApprovedAtLabel}
                  </div>
                )}
                {isMockupClientRejected && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#991b1b",
                      background: "#fef2f2",
                      border: "1px solid #fca5a5",
                      borderRadius: "8px",
                      padding: "0.45rem 0.6rem",
                    }}
                  >
                    Client rejected
                    {mockupRejectedAtLabel
                      ? `: ${mockupRejectedAtLabel}`
                      : " this mockup version."}
                  </div>
                )}
                {isMockupClientRejected && mockupRejectionReason && (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#fca5a5",
                    }}
                  >
                    Reason: {mockupRejectionReason}
                  </div>
                )}
                <div
                  style={{
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                    padding: "0.75rem",
                    background: "rgba(255, 255, 255, 0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <Link
                    to={mockupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    reloadDocument
                    style={{
                      color: "#38bdf8",
                      textDecoration: "none",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                    }}
                  >
                    {mockupName || "View Mockup"}
                  </Link>
                  <Link
                    to={mockupUrl}
                    download
                    reloadDocument
                    style={{
                      fontSize: "0.8rem",
                      color: "#22d3ee",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    Download
                  </Link>
                </div>
                {mockup.note && (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Note: {mockup.note}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Items */}
          <div className="detail-card">
            <h3 className="card-title">
              {/* ... (Header content unchanged) */}
              <span>
                Order Items
                {project.sectionUpdates?.items && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginLeft: "0.75rem",
                    }}
                  >
                    (Last Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.items)})
                  </span>
                )}
              </span>
            </h3>
            <div className="card-scroll-area">
              {project.items && project.items.length > 0 ? (
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Detailed Specs</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.description}</td>
                        <td>{item.breakdown || "-"}</td>
                        <td>{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No items listed.
                </p>
              )}
            </div>
          </div>

          {/* Project Updates */}
          <div className="detail-card">
            <h3 className="card-title">Project Updates</h3>
            <div
              className="updates-list card-scroll-area"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              {updates && updates.length > 0 ? (
                updates.map((update) => (
                  <div
                    key={update._id}
                    style={{
                      padding: "1rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {update.author
                            ? `${update.author.firstName} ${update.author.lastName}`
                            : "System"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-secondary)",
                            background: "rgba(255,255,255,0.1)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {update.author?.role || "System"}
                        </span>
                        {update.category && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              border: "1px solid var(--border-color)",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {update.category}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {formatLastUpdated(update.createdAt)}
                      </span>
                    </div>

                    <p
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.95rem",
                        whiteSpace: "pre-wrap",
                        margin: 0,
                      }}
                    >
                      {update.content}
                    </p>

                    {update.attachments && update.attachments.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          paddingTop: "0.75rem",
                          borderTop: "1px solid var(--border-color)",
                        }}
                      >
                        <Link
                          to={update.attachments[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          reloadDocument
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            color: "#6366f1",
                            textDecoration: "none",
                            fontSize: "0.9rem",
                          }}
                        >
                          <DownloadIcon /> {update.attachments[0].name}
                        </Link>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No updates posted yet.
                </p>
              )}
            </div>
          </div>

          {/* Challenges (if any) */}
          {project.challenges && project.challenges.length > 0 && (
            <div className="detail-card">
              <h3 className="card-title">
                <span>
                  Project Challenges
                  {project.sectionUpdates?.challenges && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        fontWeight: "normal",
                        marginLeft: "0.75rem",
                      }}
                    >
                      (Last Updated:{" "}
                      {formatLastUpdated(project.sectionUpdates.challenges)})
                    </span>
                  )}
                </span>
              </h3>
              <div
                className="card-scroll-area"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {project.challenges.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "0.5rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      borderRadius: "6px",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                    }}
                  >
                    <p style={{ fontWeight: 600, color: "#fca5a5" }}>
                      {c.title}
                    </p>
                    <p style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
                      {c.description}
                    </p>
                    <span style={{ fontSize: "0.8rem", color: "#fca5a5" }}>
                      Status: {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="side-info">
          <div className="detail-card">
            <h3
              className="card-title"
              style={{ justifyContent: "space-between" }}
            >
              <span>People & Departments</span>
              {!isEditingLead ? (
                !isLeadUser && !isProjectOnHold && (
                  <button
                    onClick={() => setIsEditingLead(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                    title="Edit Lead"
                  >
                    <PencilIcon width="18" height="18" />
                  </button>
                )
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleSaveLead}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#22c55e",
                      cursor: "pointer",
                    }}
                    title="Save"
                  >
                    <CheckCircleIcon width="20" height="20" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingLead(false);
                      setLeadForm(
                        project.projectLeadId?._id ||
                          project.projectLeadId ||
                          "",
                      );
                      setAssistantLeadForm(
                        project.assistantLeadId?._id ||
                          project.assistantLeadId ||
                          "",
                      );
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                    title="Cancel"
                  >
                    <XMarkIcon width="20" height="20" />
                  </button>
                </div>
              )}
            </h3>
            <div className="info-item" style={{ marginBottom: "1.5rem" }}>
              <label>Project Lead</label>
              {isEditingLead ? (
                <select
                  className="edit-input" // Reuse existing class for styling
                  value={leadForm}
                  onChange={(e) => setLeadForm(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem" }}
                >
                  <option value="">Select a Lead</option>
                  {availableUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {`${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                        u.name ||
                        "Unnamed User"}
                    </option>
                  ))}
                </select>
              ) : (
                <p>
                  {project.projectLeadId
                    ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                    : details.lead || "Unassigned"}
                </p>
              )}
            </div>

            <div className="info-item" style={{ marginBottom: "1.5rem" }}>
              <label>Assistant Lead</label>
              {isEditingLead ? (
                <select
                  className="edit-input"
                  value={assistantLeadForm}
                  onChange={(e) => setAssistantLeadForm(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem" }}
                >
                  <option value="">None</option>
                  {availableUsers
                    .filter((u) => u._id !== leadForm)
                    .map((u) => (
                      <option key={u._id} value={u._id}>
                        {`${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                          u.name ||
                          "Unnamed User"}
                      </option>
                    ))}
                </select>
              ) : (
                <p>
                  {project.assistantLeadId
                    ? `${project.assistantLeadId.firstName} ${project.assistantLeadId.lastName}`
                    : "None"}
                </p>
              )}
            </div>

            <div className="info-item">
              <label>
                Engaged Departments
                {project.sectionUpdates?.departments && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginTop: "0.25rem",
                      marginBottom: "0.5rem",
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.departments)}
                  </div>
                )}
              </label>
              <div style={{ marginTop: "0.5rem" }}>
                {project.departments && project.departments.length > 0 ? (
                  project.departments.map((dept, i) => {
                    const isAcknowledged = project.acknowledgements?.some(
                      (a) => a.department === dept,
                    );
                    return (
                      <span
                        key={i}
                        className={`dept-tag ${isAcknowledged ? "acknowledged" : ""}`}
                      >
                        {dept}
                        {isAcknowledged && (
                          <span
                            style={{ marginLeft: "4px", fontSize: "0.7rem" }}
                          >
                            ✓
                          </span>
                        )}
                        {isAcknowledged && user?.role === "admin" && !isLeadUser && (
                          <button
                            type="button"
                            className="dept-undo-btn"
                            onClick={() => handleUndoAcknowledgement(dept)}
                            disabled={undoingDept === dept}
                            title="Undo acknowledgement"
                          >
                            {undoingDept === dept ? "Undoing..." : "Undo"}
                          </button>
                        )}
                      </span>
                    );
                  })
                ) : (
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    None
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Risks / Factors */}
          {(project.uncontrollableFactors?.length > 0 ||
            project.productionRisks?.length > 0) && (
            <div className="detail-card">
              <h3 className="card-title">Risks & Factors</h3>
              {project.uncontrollableFactors?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Uncontrollable Factors
                    {project.sectionUpdates?.uncontrollableFactors && (
                      <span
                        style={{
                          fontWeight: "normal",
                          marginLeft: "0.5rem",
                          opacity: 0.8,
                        }}
                      >
                        (
                        {formatLastUpdated(
                          project.sectionUpdates.uncontrollableFactors,
                        )}
                        )
                      </span>
                    )}
                  </label>
                  <ul
                    style={{
                      paddingLeft: "1.2rem",
                      margin: "0.5rem 0",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {project.uncontrollableFactors.map((f, i) => (
                      <li key={i}>{f.description}</li>
                    ))}
                  </ul>
                </div>
              )}
              {project.productionRisks?.length > 0 && (
                <div>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Production Risks
                    {project.sectionUpdates?.productionRisks && (
                      <span
                        style={{
                          fontWeight: "normal",
                          marginLeft: "0.5rem",
                          opacity: 0.8,
                        }}
                      >
                        (
                        {formatLastUpdated(
                          project.sectionUpdates.productionRisks,
                        )}
                        )
                      </span>
                    )}
                  </label>
                  <ul
                    style={{
                      paddingLeft: "1.2rem",
                      margin: "0.5rem 0",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {project.productionRisks.map((r, i) => (
                      <li key={i}>{r.description}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <BillingGuardModal
        isOpen={billingGuardModal.open}
        onClose={closeBillingGuardModal}
        onOverride={handleBillingGuardOverride}
        canOverride={billingGuardModal.canOverride}
        isSubmitting={billingGuardSubmitting}
        title={billingGuardModal.title}
        overrideButtonText={billingGuardModal.overrideButtonText}
        message={billingGuardModal.message}
        missingLabels={billingGuardModal.missingLabels}
        orderId={project?.orderId}
        projectName={details?.projectName}
      />

      <ProjectHoldModal
        isOpen={isHoldModalOpen}
        onClose={() => {
          if (!isTogglingHold) {
            setIsHoldModalOpen(false);
          }
        }}
        onConfirm={(reason) => {
          setHoldReasonDraft(reason);
          handleProjectHoldToggle(true, reason);
        }}
        defaultReason={holdReasonDraft}
        isSubmitting={isTogglingHold}
      />

      <ProjectCancelModal
        isOpen={isCancelModalOpen}
        onClose={closeCancelModal}
        onConfirm={handleCancelProject}
        reason={cancelReasonDraft}
        onReasonChange={setCancelReasonDraft}
        isSubmitting={isCancelling}
        errorMessage={cancelError}
      />

      <ProjectReactivateModal
        isOpen={isReactivateModalOpen}
        onClose={closeReactivateModal}
        onConfirm={handleReactivateProject}
        isSubmitting={isReactivating}
        orderId={project?.orderId}
        projectName={project?.details?.projectName}
        frozenStage={project?.cancellation?.resumedStatus || project?.status}
        errorMessage={reactivateError}
      />
    </div>
  );
};

export default ProjectDetails;
