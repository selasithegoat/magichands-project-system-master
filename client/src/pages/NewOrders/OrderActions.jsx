import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import FolderIcon from "../../components/icons/FolderIcon";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import "./NewOrders.css";

const DELIVERY_CONFIRM_PHRASE = "I confirm this order has been delivered";
const INVOICE_CONFIRM_PHRASE = "I confirm the invoice has been sent";
const INVOICE_UNDO_PHRASE = "I confirm the invoice status should be reset";
const QUOTE_CONFIRM_PHRASE = "I confirm the quote has been sent";
const QUOTE_UNDO_PHRASE = "I confirm the quote status should be reset";
const MOCKUP_APPROVAL_CONFIRM_PHRASE =
  "I confirm the client approved this mockup";
const MOCKUP_REJECTION_CONFIRM_PHRASE =
  "I confirm the client rejected this mockup";
const SAMPLE_APPROVAL_CONFIRM_PHRASE =
  "I confirm the client approved the production sample";
const SAMPLE_APPROVAL_RESET_PHRASE =
  "I confirm sample approval should be reset to pending";
const FEEDBACK_MEDIA_ACCEPT = "image/*,audio/*,video/*";
const FEEDBACK_MEDIA_MAX_FILES = 6;
const FEEDBACK_COMPLETION_GATE_STATUSES = new Set([
  "Pending Feedback",
  "Delivered",
]);
const PAYMENT_OPTIONS = [
  {
    type: "part_payment",
    label: "Part Payment",
    phrase: "I confirm part payment has been received",
    undoPhrase: "I confirm part payment verification should be removed",
  },
  {
    type: "full_payment",
    label: "Full Payment",
    phrase: "I confirm full payment has been received",
    undoPhrase: "I confirm full payment verification should be removed",
  },
  {
    type: "po",
    label: "P.O",
    phrase: "I confirm a purchase order has been received",
    undoPhrase: "I confirm P.O verification should be removed",
  },
  {
    type: "authorized",
    label: "Authorized",
    phrase: "I confirm payment authorization has been received",
    undoPhrase: "I confirm authorization verification should be removed",
  },
];

const formatDate = (dateString) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const paymentLabels = {
  part_payment: "Part Payment",
  full_payment: "Full Payment",
  po: "P.O",
  authorized: "Authorized",
};

const BILLING_REQUIREMENT_LABELS = {
  invoice: "Invoice confirmation",
  payment_verification_any: "Payment method verification",
  full_payment_or_authorized:
    "Full payment or authorization verification",
};

const formatBillingRequirementLabels = (missing = []) =>
  (Array.isArray(missing) ? missing : [])
    .map((item) => BILLING_REQUIREMENT_LABELS[item] || item)
    .filter(Boolean);

const getPendingProductionBillingMissing = ({ invoiceSent, paymentTypes }) => {
  const missing = [];
  if (!invoiceSent) missing.push("invoice");
  if (!paymentTypes || paymentTypes.size === 0) {
    missing.push("payment_verification_any");
  }
  return missing;
};

const getPendingDeliveryBillingMissing = ({ paymentTypes }) => {
  const missing = [];
  if (!paymentTypes?.has("full_payment") && !paymentTypes?.has("authorized")) {
    missing.push("full_payment_or_authorized");
  }
  return missing;
};

const UPDATE_CATEGORY_OPTIONS = [
  "General",
  "Client",
  "Production",
  "Graphics",
  "Photography",
  "Stores",
  "IT Department",
];

const normalizeUpdateCategory = (category) => {
  if (category === "Design" || category === "Graphics/Design") {
    return "Graphics";
  }
  return category || "General";
};

const getReferenceFileName = (path) => {
  if (!path) return "File";
  const cleanPath = String(path).split("?")[0];
  const parts = cleanPath.split("/");
  return parts[parts.length - 1] || cleanPath;
};

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

const isImagePath = (path) =>
  /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(String(path || ""));

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

const getSampleApprovalStatus = (sampleApproval = {}) => {
  const explicit = String(sampleApproval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "pending" || explicit === "approved") {
    return explicit;
  }
  if (sampleApproval?.approvedAt || sampleApproval?.approvedBy) {
    return "approved";
  }
  return "pending";
};

const getMockupVersions = (mockup = {}) => {
  const rawVersions = Array.isArray(mockup?.versions) ? mockup.versions : [];
  const normalized = rawVersions
    .map((entry, index) => {
      const parsedVersion = Number.parseInt(entry?.version, 10);
      const version =
        Number.isFinite(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : index + 1;
      const decisionStatus = getMockupApprovalStatus(entry?.clientApproval || {});
      return {
        version,
        fileUrl: String(entry?.fileUrl || "").trim(),
        fileName: String(entry?.fileName || "").trim(),
        fileType: String(entry?.fileType || "").trim(),
        note: String(entry?.note || "").trim(),
        uploadedAt: entry?.uploadedAt || null,
        clientApproval: {
          status: decisionStatus,
          isApproved: decisionStatus === "approved",
          approvedAt: entry?.clientApproval?.approvedAt || null,
          rejectedAt: entry?.clientApproval?.rejectedAt || null,
          rejectionReason: String(entry?.clientApproval?.rejectionReason || "").trim(),
          note: String(entry?.clientApproval?.note || "").trim(),
        },
      };
    })
    .filter((entry) => entry.fileUrl);

  if (normalized.length === 0 && mockup?.fileUrl) {
    const parsedVersion = Number.parseInt(mockup?.version, 10);
    const version =
      Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
    const decisionStatus = getMockupApprovalStatus(mockup?.clientApproval || {});
    normalized.push({
      version,
      fileUrl: String(mockup.fileUrl || "").trim(),
      fileName: String(mockup.fileName || "").trim(),
      fileType: String(mockup.fileType || "").trim(),
      note: String(mockup.note || "").trim(),
      uploadedAt: mockup.uploadedAt || null,
      clientApproval: {
        status: decisionStatus,
        isApproved: decisionStatus === "approved",
        approvedAt: mockup?.clientApproval?.approvedAt || null,
        rejectedAt: mockup?.clientApproval?.rejectedAt || null,
        rejectionReason: String(mockup?.clientApproval?.rejectionReason || "").trim(),
        note: String(mockup?.clientApproval?.note || "").trim(),
      },
    });
  }

  return normalized.sort((left, right) => {
    if (left.version !== right.version) return left.version - right.version;
    const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
    const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
    return leftTime - rightTime;
  });
};

const OrderActions = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

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
  const [projectUpdates, setProjectUpdates] = useState([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updateCategory, setUpdateCategory] = useState("General");
  const [updateContent, setUpdateContent] = useState("");
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [editUpdateCategory, setEditUpdateCategory] = useState("General");
  const [editUpdateContent, setEditUpdateContent] = useState("");
  const [updateEditSubmitting, setUpdateEditSubmitting] = useState(false);
  const [updateDeleteSubmittingId, setUpdateDeleteSubmittingId] = useState(null);

  const [deliveryModal, setDeliveryModal] = useState({
    open: false,
  });
  const [deliveryInput, setDeliveryInput] = useState("");
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [billingGuardModal, setBillingGuardModal] = useState({
    open: false,
    title: "Billing Caution",
    message: "",
    missingLabels: [],
  });
  const [dismissedBillingGuardKey, setDismissedBillingGuardKey] = useState("");

  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceInput, setInvoiceInput] = useState("");
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceUndoModal, setInvoiceUndoModal] = useState(false);
  const [invoiceUndoInput, setInvoiceUndoInput] = useState("");
  const [invoiceUndoSubmitting, setInvoiceUndoSubmitting] = useState(false);

  const [paymentModal, setPaymentModal] = useState({
    open: false,
    type: null,
  });
  const [paymentInput, setPaymentInput] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentUndoModal, setPaymentUndoModal] = useState({
    open: false,
    type: null,
  });
  const [paymentUndoInput, setPaymentUndoInput] = useState("");
  const [paymentUndoSubmitting, setPaymentUndoSubmitting] = useState(false);
  const [mockupApprovalModal, setMockupApprovalModal] = useState({
    open: false,
    version: null,
  });
  const [mockupApprovalInput, setMockupApprovalInput] = useState("");
  const [mockupApprovalSubmitting, setMockupApprovalSubmitting] =
    useState(false);
  const [mockupRejectionModal, setMockupRejectionModal] = useState({
    open: false,
    version: null,
  });
  const [mockupRejectionInput, setMockupRejectionInput] = useState("");
  const [mockupRejectionReason, setMockupRejectionReason] = useState("");
  const [mockupRejectionSubmitting, setMockupRejectionSubmitting] =
    useState(false);
  const [sampleApprovalModal, setSampleApprovalModal] = useState(false);
  const [sampleApprovalInput, setSampleApprovalInput] = useState("");
  const [sampleApprovalSubmitting, setSampleApprovalSubmitting] = useState(false);
  const [sampleApprovalResetModal, setSampleApprovalResetModal] = useState(false);
  const [sampleApprovalResetInput, setSampleApprovalResetInput] = useState("");
  const [sampleApprovalResetSubmitting, setSampleApprovalResetSubmitting] =
    useState(false);

  const [briefOverviewDraft, setBriefOverviewDraft] = useState("");
  const [orderNumberDraft, setOrderNumberDraft] = useState("");
  const [sampleImageDraft, setSampleImageDraft] = useState("");
  const [newSampleImageFile, setNewSampleImageFile] = useState(null);
  const [referenceMaterialsDraft, setReferenceMaterialsDraft] = useState([]);
  const [newReferenceFiles, setNewReferenceFiles] = useState([]);
  const [referenceSaving, setReferenceSaving] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type }), 5000);
  };

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

  const fetchProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects?mode=report");
      if (!res.ok) {
        throw new Error("Failed to load order.");
      }
      const data = await res.json();
      const match = data.find((item) => item._id === id);
      if (!match) {
        throw new Error("Order not found.");
      }
      setProject(match);
    } catch (err) {
      setError(err.message || "Failed to load order.");
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectUpdates = async (projectId) => {
    if (!projectId) {
      setProjectUpdates([]);
      return;
    }

    setUpdatesLoading(true);
    try {
      const res = await fetch(`/api/updates/project/${projectId}`);
      if (!res.ok) {
        throw new Error("Failed to load project updates.");
      }
      const data = await res.json();
      setProjectUpdates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching project updates:", err);
    } finally {
      setUpdatesLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchProject();
  }, [id]);

  useEffect(() => {
    if (project?._id) {
      fetchProjectUpdates(project._id);
    } else {
      setProjectUpdates([]);
    }
  }, [project?._id]);

  useRealtimeRefresh(
    (detail) => {
      if (!project?._id) return;

      const changedPath = String(detail?.path || "");
      const updatesChanged = changedPath.startsWith("/api/updates");
      const thisProjectChanged = changedPath.includes(`/api/projects/${project._id}`);

      if (thisProjectChanged) {
        fetchProject();
        fetchProjectUpdates(project._id);
        return;
      }

      if (updatesChanged) {
        fetchProjectUpdates(project._id);
      }
    },
    { enabled: Boolean(project?._id) },
  );

  useEffect(() => {
    if (feedbackModal.open && feedbackModal.project && project?._id) {
      if (
        project._id === feedbackModal.project._id &&
        project !== feedbackModal.project
      ) {
        setFeedbackModal((prev) => ({ ...prev, project }));
      }
    }
  }, [project, feedbackModal.open, feedbackModal.project]);

  useEffect(() => {
    const projectId = project?._id;
    const briefOverview = project?.details?.briefOverview || "";
    const sampleImage = project?.details?.sampleImage || "";
    const referenceMaterials = project?.details?.attachments || [];

    if (!projectId) {
      setOrderNumberDraft("");
      setBriefOverviewDraft("");
      setSampleImageDraft("");
      setNewSampleImageFile(null);
      setReferenceMaterialsDraft([]);
      setNewReferenceFiles([]);
      return;
    }

    setOrderNumberDraft(project.orderId || "");
    setBriefOverviewDraft(briefOverview);
    setSampleImageDraft(sampleImage);
    setNewSampleImageFile(null);
    setReferenceMaterialsDraft(referenceMaterials);
    setNewReferenceFiles([]);
  }, [
    project?._id,
    project?.orderId,
    project?.details?.briefOverview,
    project?.details?.sampleImage,
    project?.details?.attachments,
  ]);

  const canManageBilling =
    currentUser?.role === "admin" ||
    currentUser?.department?.includes("Front Desk");
  const canMarkDelivered = canManageBilling;
  const canManageFeedback = canManageBilling;
  const canShareUpdates = canManageBilling;
  const canAddFeedbackFor = (order) =>
    ["Pending Feedback", "Feedback Completed", "Delivered"].includes(
      order?.status,
    );

  const paymentTypes = useMemo(
    () => new Set((project?.paymentVerifications || []).map((p) => p.type)),
    [project],
  );
  const mockupVersions = useMemo(
    () => getMockupVersions(project?.mockup || {}),
    [project?.mockup],
  );
  const latestMockupVersion =
    mockupVersions.length > 0 ? mockupVersions[mockupVersions.length - 1] : null;
  const latestMockupVersionLabel = latestMockupVersion
    ? `v${latestMockupVersion.version}`
    : "";
  const latestMockupDecisionStatus = latestMockupVersion
    ? getMockupApprovalStatus(latestMockupVersion?.clientApproval || {})
    : "pending";
  const mockupApprovalPending = Boolean(
    latestMockupVersion?.fileUrl && latestMockupDecisionStatus === "pending",
  );
  const mockupApprovalRejected = Boolean(
    latestMockupVersion?.fileUrl && latestMockupDecisionStatus === "rejected",
  );
  const mockupApprovalConfirmed = Boolean(
    latestMockupVersion?.fileUrl && latestMockupDecisionStatus === "approved",
  );
  const isQuoteProject = project?.projectType === "Quote";
  const invoiceSent = Boolean(project?.invoice?.sent);
  const isFrontDeskUser = Boolean(
    currentUser?.department?.includes?.("Front Desk"),
  );
  const billingDocumentLabel = isQuoteProject ? "Quote" : "Invoice";
  const billingDocumentLower = isQuoteProject ? "quote" : "invoice";
  const billingConfirmPhrase = isQuoteProject
    ? QUOTE_CONFIRM_PHRASE
    : INVOICE_CONFIRM_PHRASE;
  const billingUndoPhrase = isQuoteProject
    ? QUOTE_UNDO_PHRASE
    : INVOICE_UNDO_PHRASE;
  const canManageMockupApproval = canManageBilling && !isQuoteProject;
  const sampleRequirementEnabled =
    !isQuoteProject && Boolean(project?.sampleRequirement?.isRequired);
  const sampleApprovalStatus = getSampleApprovalStatus(project?.sampleApproval || {});
  const sampleApprovalConfirmed =
    sampleRequirementEnabled && sampleApprovalStatus === "approved";
  const sampleApprovalPending =
    sampleRequirementEnabled && sampleApprovalStatus !== "approved";

  const getFrontDeskCommandMessage = (targetStatus) => {
    if (targetStatus === "Mockup Completed") {
      return "Confirm client approval now before mockup completion can proceed.";
    }
    if (targetStatus === "Mockup Rejected") {
      return "Client rejected the mockup. Request Graphics to upload a revised version now.";
    }
    if (targetStatus === "Pending Production") {
      return "Confirm invoice and payment now before production can proceed.";
    }
    if (targetStatus === "Production Sample Approval") {
      return "Confirm client sample approval now before production completion can proceed.";
    }
    if (targetStatus === "Pending Delivery/Pickup") {
      return "Confirm full payment or authorization now before delivery can proceed.";
    }
    return "Confirm billing requirements now before this action can proceed.";
  };

  const openBillingGuardModal = ({
    message,
    missing,
    targetStatus = "",
    forceCommandTone = false,
  }) => {
    const resolvedMessage =
      forceCommandTone || isFrontDeskUser
        ? getFrontDeskCommandMessage(targetStatus)
        : message || "Billing prerequisites are required before this action.";
    const resolvedTitle =
      targetStatus === "Mockup Completed"
        ? "Mockup Caution"
        : targetStatus === "Production Sample Approval"
          ? "Sample Caution"
        : "Billing Caution";

    setBillingGuardModal({
      open: true,
      title: resolvedTitle,
      message: resolvedMessage,
      missingLabels: formatBillingRequirementLabels(missing),
    });
  };

  const closeBillingGuardModal = () => {
    const missingKey = billingGuardModal.missingLabels.join("|");
    if (project?._id) {
      setDismissedBillingGuardKey(
        `${project._id}|${project.status}|${missingKey}`,
      );
    }
    setBillingGuardModal({
      open: false,
      title: "Billing Caution",
      message: "",
      missingLabels: [],
    });
  };

  const handleDeliveryComplete = async () => {
    if (!canMarkDelivered || !project) return;
    try {
      const res = await fetch(`/api/projects/${project._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Delivered",
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Order delivered. Feedback is now pending.", "success");
        return true;
      }
      const errorData = await res.json();
      if (errorData?.code === "BILLING_PREREQUISITE_MISSING") {
        openBillingGuardModal({
          message: errorData.message,
          missing: errorData.missing || [],
          targetStatus: errorData.targetStatus || "Pending Delivery/Pickup",
          forceCommandTone: true,
        });
        return false;
      }
      showToast(
        errorData.message || "Failed to update status.",
        "error",
      );
      return false;
    } catch (error) {
      console.error("Delivery update error:", error);
      showToast("Network error. Please try again.", "error");
      return false;
    }
  };

  const handleConfirmDelivery = async () => {
    if (deliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE) return;
    setDeliverySubmitting(true);
    const delivered = await handleDeliveryComplete();
    setDeliverySubmitting(false);
    if (delivered) {
      setDeliveryModal({ open: false });
      setDeliveryInput("");
    }
  };

  const openDeliveryModal = () => {
    setDeliveryInput("");
    setDeliveryModal({ open: true });
  };

  const closeDeliveryModal = () => {
    if (deliverySubmitting) return;
    setDeliveryModal({ open: false });
    setDeliveryInput("");
  };

  const openFeedbackModal = () => {
    setFeedbackType("Positive");
    setFeedbackNotes("");
    setFeedbackFiles([]);
    setFeedbackModal({ open: true, project });
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
    if (!project) return;

    const requiresMediaAttachment = FEEDBACK_COMPLETION_GATE_STATUSES.has(
      project.status || "",
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

      const res = await fetch(`/api/projects/${project._id}/feedback`, {
        method: "POST",
        body: payload,
      });
      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setFeedbackModal({ open: true, project: updatedProject });
        setFeedbackNotes("");
        setFeedbackFiles([]);
        showToast("Feedback added successfully.", "success");
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to add feedback.",
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
    if (!project) return;
    try {
      const res = await fetch(
        `/api/projects/${project._id}/feedback/${feedbackId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setFeedbackModal({ open: true, project: updatedProject });
        showToast("Feedback deleted.", "success");
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to delete feedback.",
          "error",
        );
      }
    } catch (error) {
      console.error("Feedback delete error:", error);
      showToast("Network error. Please try again.", "error");
    }
  };

  const sortedFeedbackEntries = (project?.feedbacks || [])
    .slice()
    .sort((a, b) => {
      const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  const feedbackRequiresMediaAttachment = FEEDBACK_COMPLETION_GATE_STATUSES.has(
    project?.status || "",
  );

  const recentUpdates = useMemo(() => projectUpdates || [], [projectUpdates]);
  const latestUpdatePreview = useMemo(
    () => (recentUpdates.length > 0 ? recentUpdates[0] : null),
    [recentUpdates],
  );

  const getUpdateAuthorName = (update) => {
    if (!update?.author || typeof update.author === "string") {
      return "System";
    }
    const fullName =
      `${update.author.firstName || ""} ${update.author.lastName || ""}`.trim();
    return fullName || update.author.email || "System";
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const canManageUpdate = (update) => {
    if (!currentUser || !update) return false;
    if (currentUser.role === "admin") return true;
    const authorId =
      typeof update.author === "string" ? update.author : update.author?._id;
    return Boolean(authorId && currentUser._id === authorId);
  };

  const handlePostUpdate = async () => {
    if (!project || !canShareUpdates) return;
    const trimmedContent = updateContent.trim();
    if (!trimmedContent) {
      showToast("Please enter an update before posting.", "error");
      return;
    }

    setUpdateSubmitting(true);
    try {
      const data = new FormData();
      data.append("content", trimmedContent);
      data.append("category", updateCategory);

      const res = await fetch(`/api/updates/project/${project._id}`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        const createdUpdate = await res.json();
        setProjectUpdates((prev) => [createdUpdate, ...prev]);
        setUpdateContent("");
        setUpdateCategory("General");
        showToast("Update posted successfully.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to post update.", "error");
      }
    } catch (error) {
      console.error("Update post error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setUpdateSubmitting(false);
    }
  };

  const handleStartEditUpdate = (update) => {
    setEditingUpdateId(update._id);
    setEditUpdateCategory(normalizeUpdateCategory(update.category));
    setEditUpdateContent(update.content || "");
  };

  const handleCancelEditUpdate = () => {
    if (updateEditSubmitting) return;
    setEditingUpdateId(null);
    setEditUpdateCategory("General");
    setEditUpdateContent("");
  };

  const handleSaveEditUpdate = async (updateId) => {
    if (!updateId) return;
    const trimmedContent = editUpdateContent.trim();
    if (!trimmedContent) {
      showToast("Update content cannot be empty.", "error");
      return;
    }

    setUpdateEditSubmitting(true);
    try {
      const res = await fetch(`/api/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmedContent,
          category: editUpdateCategory,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setProjectUpdates((prev) =>
          prev.map((item) => (item._id === updateId ? updated : item)),
        );
        handleCancelEditUpdate();
        showToast("Update edited successfully.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to edit update.", "error");
      }
    } catch (error) {
      console.error("Update edit error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setUpdateEditSubmitting(false);
    }
  };

  const handleDeleteUpdate = async (update) => {
    if (!update?._id || !canManageUpdate(update)) return;
    const confirmed = window.confirm(
      "Delete this update? This action cannot be undone.",
    );
    if (!confirmed) return;

    setUpdateDeleteSubmittingId(update._id);
    try {
      const res = await fetch(`/api/updates/${update._id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProjectUpdates((prev) => prev.filter((item) => item._id !== update._id));
        if (editingUpdateId === update._id) {
          handleCancelEditUpdate();
        }
        showToast("Update deleted.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to delete update.", "error");
      }
    } catch (error) {
      console.error("Update delete error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setUpdateDeleteSubmittingId(null);
    }
  };

  const handleConfirmInvoice = async () => {
    if (!project || invoiceInput.trim() !== billingConfirmPhrase) return;
    setInvoiceSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project._id}/invoice-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${billingDocumentLabel} marked as sent.`, "success");
        setInvoiceModal(false);
        setInvoiceInput("");
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message ||
            `Failed to mark ${billingDocumentLower} as sent.`,
          "error",
        );
      }
    } catch (error) {
      console.error("Invoice update error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const openInvoiceModal = () => {
    setInvoiceInput("");
    setInvoiceModal(true);
  };

  const closeInvoiceModal = () => {
    if (invoiceSubmitting) return;
    setInvoiceModal(false);
    setInvoiceInput("");
  };

  const openInvoiceUndoModal = () => {
    setInvoiceUndoInput("");
    setInvoiceUndoModal(true);
  };

  const closeInvoiceUndoModal = () => {
    if (invoiceUndoSubmitting) return;
    setInvoiceUndoModal(false);
    setInvoiceUndoInput("");
  };

  const handleConfirmInvoiceUndo = async () => {
    if (!project || invoiceUndoInput.trim() !== billingUndoPhrase) return;
    setInvoiceUndoSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project._id}/invoice-sent/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${billingDocumentLabel} status reset.`, "success");
        closeInvoiceUndoModal();
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message ||
            `Failed to undo ${billingDocumentLower} status.`,
          "error",
        );
      }
    } catch (error) {
      console.error("Invoice undo error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setInvoiceUndoSubmitting(false);
    }
  };

  const openPaymentModal = (type) => {
    setPaymentModal({ open: true, type });
    setPaymentInput("");
  };

  const openPaymentUndoModal = (type) => {
    setPaymentUndoModal({ open: true, type });
    setPaymentUndoInput("");
  };

  const closePaymentModal = () => {
    if (paymentSubmitting) return;
    setPaymentModal({ open: false, type: null });
    setPaymentInput("");
  };

  const closePaymentUndoModal = () => {
    if (paymentUndoSubmitting) return;
    setPaymentUndoModal({ open: false, type: null });
    setPaymentUndoInput("");
  };

  const handleConfirmPayment = async () => {
    if (!project || !paymentModal.type) return;
    const option = PAYMENT_OPTIONS.find(
      (item) => item.type === paymentModal.type,
    );
    if (!option || paymentInput.trim() !== option.phrase) return;

    setPaymentSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/payment-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: paymentModal.type }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${option.label} verified.`, "success");
        closePaymentModal();
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to verify payment.",
          "error",
        );
      }
    } catch (error) {
      console.error("Payment verification error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleConfirmPaymentUndo = async () => {
    if (!project || !paymentUndoModal.type) return;
    const option = PAYMENT_OPTIONS.find(
      (item) => item.type === paymentUndoModal.type,
    );
    if (!option || paymentUndoInput.trim() !== option.undoPhrase) return;

    setPaymentUndoSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/payment-verification/undo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: paymentUndoModal.type }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${option.label} verification removed.`, "success");
        closePaymentUndoModal();
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to undo payment verification.",
          "error",
        );
      }
    } catch (error) {
      console.error("Payment undo error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setPaymentUndoSubmitting(false);
    }
  };

  const openMockupApprovalModal = (version) => {
    if (!version || !canManageMockupApproval) return;
    setMockupApprovalModal({
      open: true,
      version,
    });
    setMockupApprovalInput("");
  };

  const closeMockupApprovalModal = () => {
    if (mockupApprovalSubmitting) return;
    setMockupApprovalModal({
      open: false,
      version: null,
    });
    setMockupApprovalInput("");
  };

  const openMockupRejectionModal = (version) => {
    if (!version || !canManageMockupApproval) return;
    setMockupRejectionModal({
      open: true,
      version,
    });
    setMockupRejectionInput("");
    setMockupRejectionReason("");
  };

  const closeMockupRejectionModal = () => {
    if (mockupRejectionSubmitting) return;
    setMockupRejectionModal({
      open: false,
      version: null,
    });
    setMockupRejectionInput("");
    setMockupRejectionReason("");
  };

  const handleConfirmMockupApproval = async () => {
    if (!project || !mockupApprovalModal.version || !canManageMockupApproval) {
      return;
    }
    if (mockupApprovalInput.trim() !== MOCKUP_APPROVAL_CONFIRM_PHRASE) return;

    setMockupApprovalSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project._id}/mockup/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: mockupApprovalModal.version.version,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(
          `Mockup v${mockupApprovalModal.version.version} approved by client.`,
          "success",
        );
        closeMockupApprovalModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to confirm mockup approval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Mockup approval error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setMockupApprovalSubmitting(false);
    }
  };

  const handleConfirmMockupRejection = async () => {
    if (!project || !mockupRejectionModal.version || !canManageMockupApproval) {
      return;
    }
    if (mockupRejectionInput.trim() !== MOCKUP_REJECTION_CONFIRM_PHRASE) return;

    setMockupRejectionSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project._id}/mockup/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: mockupRejectionModal.version.version,
          reason: mockupRejectionReason.trim(),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(
          `Mockup v${mockupRejectionModal.version.version} marked as rejected.`,
          "success",
        );
        closeMockupRejectionModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to record mockup rejection.",
          "error",
        );
      }
    } catch (error) {
      console.error("Mockup rejection error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setMockupRejectionSubmitting(false);
    }
  };

  const openSampleApprovalModal = () => {
    if (!project || !canManageBilling || !sampleRequirementEnabled) return;
    setSampleApprovalInput("");
    setSampleApprovalModal(true);
  };

  const closeSampleApprovalModal = () => {
    if (sampleApprovalSubmitting) return;
    setSampleApprovalModal(false);
    setSampleApprovalInput("");
  };

  const openSampleApprovalResetModal = () => {
    if (!project || !canManageBilling || !sampleRequirementEnabled) return;
    setSampleApprovalResetInput("");
    setSampleApprovalResetModal(true);
  };

  const closeSampleApprovalResetModal = () => {
    if (sampleApprovalResetSubmitting) return;
    setSampleApprovalResetModal(false);
    setSampleApprovalResetInput("");
  };

  const handleConfirmSampleApproval = async () => {
    if (
      !project ||
      !canManageBilling ||
      !sampleRequirementEnabled ||
      sampleApprovalInput.trim() !== SAMPLE_APPROVAL_CONFIRM_PHRASE
    ) {
      return;
    }

    setSampleApprovalSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/sample-approval/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Client sample approval confirmed.", "success");
        closeSampleApprovalModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to confirm sample approval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Sample approval confirm error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setSampleApprovalSubmitting(false);
    }
  };

  const handleConfirmSampleApprovalReset = async () => {
    if (
      !project ||
      !canManageBilling ||
      !sampleRequirementEnabled ||
      sampleApprovalResetInput.trim() !== SAMPLE_APPROVAL_RESET_PHRASE
    ) {
      return;
    }

    setSampleApprovalResetSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/sample-approval/reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Client sample approval reset to pending.", "success");
        closeSampleApprovalResetModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to reset sample approval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Sample approval reset error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setSampleApprovalResetSubmitting(false);
    }
  };

  const canManageOrderRevision = canManageBilling;
  const orderRevisionDirty = useMemo(() => {
    if (!project) return false;
    const originalOrderNumber = (project.orderId || "").trim();
    const originalBriefOverview = project.details?.briefOverview || "";
    const originalSampleImage = project.details?.sampleImage || "";
    const originalReferenceMaterials = project.details?.attachments || [];

    if ((orderNumberDraft || "").trim() !== originalOrderNumber) {
      return true;
    }
    if (briefOverviewDraft !== originalBriefOverview) {
      return true;
    }
    if (sampleImageDraft !== originalSampleImage) {
      return true;
    }
    if (newSampleImageFile) {
      return true;
    }
    if (newReferenceFiles.length > 0) {
      return true;
    }
    if (referenceMaterialsDraft.length !== originalReferenceMaterials.length) {
      return true;
    }
    return referenceMaterialsDraft.some(
      (path, index) => path !== originalReferenceMaterials[index],
    );
  }, [
    project,
    orderNumberDraft,
    briefOverviewDraft,
    sampleImageDraft,
    newSampleImageFile,
    newReferenceFiles.length,
    referenceMaterialsDraft,
  ]);

  const openReferenceFilePicker = () => {
    if (!canManageOrderRevision || referenceSaving) return;
    const input = document.getElementById("order-actions-reference-materials");
    input?.click();
  };

  const openSampleImagePicker = () => {
    if (!canManageOrderRevision || referenceSaving) return;
    const input = document.getElementById("order-actions-sample-image");
    input?.click();
  };

  const handleSampleImageSelection = (event) => {
    const file = event.target.files?.[0] || null;
    setNewSampleImageFile(file);
    event.target.value = null;
  };

  const removeSampleImage = () => {
    if (newSampleImageFile) {
      setNewSampleImageFile(null);
      return;
    }
    setSampleImageDraft("");
  };

  const handleReferenceFileSelection = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setNewReferenceFiles((prev) => [...prev, ...files]);
    event.target.value = null;
  };

  const removeExistingReference = (index) => {
    setReferenceMaterialsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const removeNewReference = (index) => {
    setNewReferenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetOrderRevisionChanges = () => {
    if (!project || referenceSaving) return;
    setOrderNumberDraft(project.orderId || "");
    setBriefOverviewDraft(project.details?.briefOverview || "");
    setSampleImageDraft(project.details?.sampleImage || "");
    setNewSampleImageFile(null);
    setReferenceMaterialsDraft(project.details?.attachments || []);
    setNewReferenceFiles([]);
  };

  const handleSaveOrderRevision = async () => {
    if (!project || !canManageOrderRevision) return;
    if (!orderRevisionDirty) {
      showToast("No order changes to save.", "error");
      return;
    }
    const normalizedOrderNumber = (orderNumberDraft || "").trim();
    if (!normalizedOrderNumber) {
      showToast("Order number cannot be empty.", "error");
      return;
    }

    setReferenceSaving(true);
    try {
      const formData = new FormData();
      formData.append("orderId", normalizedOrderNumber);
      formData.append("briefOverview", briefOverviewDraft);
      formData.append("existingSampleImage", sampleImageDraft || "");
      formData.append(
        "existingAttachments",
        JSON.stringify(referenceMaterialsDraft),
      );
      if (newSampleImageFile) {
        formData.append("sampleImage", newSampleImageFile);
      }
      newReferenceFiles.forEach((file) => {
        formData.append("attachments", file);
      });

      const res = await fetch(`/api/projects/${project._id}`, {
        method: "PUT",
        body: formData,
      });

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        setOrderNumberDraft(updated.orderId || "");
        setBriefOverviewDraft(updated.details?.briefOverview || "");
        setSampleImageDraft(updated.details?.sampleImage || "");
        setNewSampleImageFile(null);
        setReferenceMaterialsDraft(updated.details?.attachments || []);
        setNewReferenceFiles([]);
        showToast("Order details updated.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to update order details.",
          "error",
        );
      }
    } catch (error) {
      console.error("Order details update error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setReferenceSaving(false);
    }
  };

  const pendingProductionMissing =
    project && !isQuoteProject
      ? getPendingProductionBillingMissing({ invoiceSent, paymentTypes })
      : [];
  const pendingDeliveryMissing =
    project && !isQuoteProject
      ? getPendingDeliveryBillingMissing({ paymentTypes })
      : [];
  const pendingProductionMissingLabels =
    formatBillingRequirementLabels(pendingProductionMissing);
  const pendingDeliveryMissingLabels = formatBillingRequirementLabels(
    pendingDeliveryMissing,
  );
  const showPendingProductionWarning =
    project &&
    !isQuoteProject &&
    ["Pending Proof Reading", "Pending Production"].includes(project.status) &&
    pendingProductionMissing.length > 0;
  const showPendingDeliveryWarning =
    project &&
    !isQuoteProject &&
    ["Pending Packaging", "Pending Delivery/Pickup"].includes(project.status) &&
    pendingDeliveryMissing.length > 0;
  const showSampleApprovalWarning =
    project &&
    !isQuoteProject &&
    project.status === "Pending Production" &&
    sampleApprovalPending;
  const showMockupApprovalWarning =
    project &&
    !isQuoteProject &&
    project.status === "Pending Mockup" &&
    mockupApprovalPending;
  const showMockupRejectionWarning =
    project &&
    !isQuoteProject &&
    project.status === "Pending Mockup" &&
    mockupApprovalRejected;
  const mockupApprovalMissingLabels =
    showMockupApprovalWarning && latestMockupVersion
      ? [`Client approval for mockup ${latestMockupVersionLabel}`]
      : [];
  const mockupRejectionMissingLabels =
    showMockupRejectionWarning && latestMockupVersion
      ? [`Rejected mockup ${latestMockupVersionLabel}`]
      : [];
  const sampleApprovalMissingLabels = showSampleApprovalWarning
    ? ["Client sample approval"]
    : [];
  const currentBillingGuardKey = project?._id
    ? `${project._id}|${project.status}|${
        showSampleApprovalWarning
          ? sampleApprovalMissingLabels.join("|")
          : showPendingProductionWarning
          ? pendingProductionMissingLabels.join("|")
          : showPendingDeliveryWarning
            ? pendingDeliveryMissingLabels.join("|")
            : showMockupApprovalWarning
              ? mockupApprovalMissingLabels.join("|")
              : showMockupRejectionWarning
                ? mockupRejectionMissingLabels.join("|")
              : ""
      }`
    : "";

  useEffect(() => {
    if (!project || isQuoteProject || billingGuardModal.open) return;

    if (
      showSampleApprovalWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Confirm client sample approval now before production completion can proceed.",
        missing: sampleApprovalMissingLabels,
        targetStatus: "Production Sample Approval",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showPendingProductionWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Caution: before moving to Pending Production, confirm the required billing checks.",
        missing: pendingProductionMissing,
        targetStatus: "Pending Production",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showPendingDeliveryWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Caution: before moving to Pending Delivery/Pickup, confirm the required billing checks.",
        missing: pendingDeliveryMissing,
        targetStatus: "Pending Delivery/Pickup",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showMockupApprovalWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Caution: confirm client approval for the latest mockup before mockup completion.",
        missing: mockupApprovalMissingLabels,
        targetStatus: "Mockup Completed",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showMockupRejectionWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Client rejected the latest mockup. Ask Graphics to upload a revised version now.",
        missing: mockupRejectionMissingLabels,
        targetStatus: "Mockup Rejected",
        forceCommandTone: true,
      });
    }
  }, [
    project?._id,
    project?.status,
    isQuoteProject,
    billingGuardModal.open,
    showSampleApprovalWarning,
    showPendingProductionWarning,
    showPendingDeliveryWarning,
    showMockupApprovalWarning,
    showMockupRejectionWarning,
    currentBillingGuardKey,
    dismissedBillingGuardKey,
    sampleApprovalMissingLabels,
    pendingProductionMissing,
    pendingDeliveryMissing,
    mockupApprovalMissingLabels,
    mockupRejectionMissingLabels,
  ]);

  const lastOrderRevisionUpdatedAt = project?.sectionUpdates?.details || null;
  const lastOrderRevisionLabel = currentUser?.department?.includes("Front Desk")
    ? "Last updated by Front Desk"
    : "Last updated";

  if (loading) {
    return (
      <div className="new-orders-container">
        <div className="loading-state">Loading order actions...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="new-orders-container">
        <div className="empty-state">{error || "Order not found."}</div>
      </div>
    );
  }

  return (
    <div className="new-orders-container order-actions-page">
      {toast.show && (
        <div className={`toast-message ${toast.type}`}>{toast.message}</div>
      )}

      <div className="page-header order-actions-header">
        <div>
          <h1>Order Actions</h1>
          <p className="subtitle">
            {project.orderId || project._id} - {project.details?.projectName || "Untitled"}
          </p>
        </div>
        <button className="action-btn" onClick={() => navigate("/new-orders")}>
          Back to Orders
        </button>
      </div>

      <div className="orders-list-container">
        <div className="order-summary">
          <div>
            <p>
              <strong>Client:</strong> {project.details?.client || "-"}
            </p>
            <p>
              <strong>Status:</strong> {project.status}
            </p>
            <p>
              <strong>Created:</strong> {formatDate(project.createdAt)}
            </p>
          </div>
          <div className="status-tags">
            {latestMockupVersion && (
              <span className="status-tag mockup">
                Mockup {latestMockupVersionLabel}
              </span>
            )}
            {mockupApprovalConfirmed && latestMockupVersion && (
              <span className="status-tag invoice">
                {latestMockupVersionLabel} Client Approved
              </span>
            )}
            {mockupApprovalPending && latestMockupVersion && (
              <span className="status-tag caution">
                {latestMockupVersionLabel} Pending Client Approval
              </span>
            )}
            {mockupApprovalRejected && latestMockupVersion && (
              <span className="status-tag rejection">
                {latestMockupVersionLabel} Rejected by Client
              </span>
            )}
            {invoiceSent && (
              <span className="status-tag invoice">{billingDocumentLabel} Sent</span>
            )}
            {sampleRequirementEnabled && (
              <span
                className={`status-tag ${
                  sampleApprovalConfirmed ? "invoice" : "caution"
                }`}
              >
                {sampleApprovalConfirmed
                  ? "Sample Approved"
                  : "Sample Approval Pending"}
              </span>
            )}
            {!isQuoteProject &&
              Array.from(paymentTypes).map((type) => (
                <span key={type} className="status-tag payment">
                  {paymentLabels[type] || type}
                </span>
              ))}
            {showPendingProductionWarning && (
              <span className="status-tag caution">
                Pending Production Blocked: {pendingProductionMissingLabels.join(", ")}
              </span>
            )}
            {showPendingDeliveryWarning && (
              <span className="status-tag caution">
                Pending Delivery Blocked: {pendingDeliveryMissingLabels.join(", ")}
              </span>
            )}
          </div>
        </div>

        {showPendingProductionWarning && (
          <div className="warning-banner critical">
            Confirm invoice and payment now before production can proceed.
          </div>
        )}
        {showSampleApprovalWarning && (
          <div className="warning-banner critical">
            Confirm client sample approval now before production completion can
            proceed.
          </div>
        )}

        {showPendingDeliveryWarning && (
          <div className="warning-banner critical">
            Confirm full payment or authorization now before delivery can proceed.
          </div>
        )}
        {mockupApprovalPending && latestMockupVersion && (
          <div className="warning-banner critical">
            Confirm client approval for mockup {latestMockupVersionLabel} now
            before mockup completion can proceed.
          </div>
        )}
        {mockupApprovalRejected && latestMockupVersion && (
          <div className="warning-banner critical">
            Client rejected mockup {latestMockupVersionLabel}. Request Graphics
            to upload a revised version before mockup completion.
          </div>
        )}

        <div className="action-grid">
          <div className="action-card">
            <h3>Delivery</h3>
            <p>Mark the order as delivered once handed over.</p>
            <button
              className="action-btn complete-btn"
              onClick={openDeliveryModal}
              disabled={!canMarkDelivered || project.status !== "Pending Delivery/Pickup"}
              title={
                project.status === "Pending Delivery/Pickup"
                  ? "Mark as Delivered"
                  : "Waiting for Pending Delivery/Pickup"
              }
            >
              Delivery Complete
            </button>
          </div>

          <div className="action-card">
            <h3>Feedback</h3>
            <p>Capture client feedback after delivery.</p>
            <button
              className="action-btn feedback-btn"
              onClick={openFeedbackModal}
              disabled={!canManageFeedback || !canAddFeedbackFor(project)}
              title={
                !canManageFeedback
                  ? "Not authorized to add feedback"
                  : canAddFeedbackFor(project)
                  ? "Add feedback"
                  : "Feedback available after delivery"
              }
            >
              Add Feedback
            </button>
          </div>

          <div className="action-card">
            <h3>Billing</h3>
              <p>
                {isQuoteProject
                  ? "Confirm quote response sent."
                  : "Confirm invoice and payment milestones."}
              </p>
              <div className="billing-actions">
                {!invoiceSent ? (
                  <button
                    className="action-btn"
                    onClick={openInvoiceModal}
                    disabled={!canManageBilling}
                  >
                    Mark {billingDocumentLabel} Sent
                  </button>
                ) : (
                  <button
                    className="action-btn undo-btn"
                    onClick={openInvoiceUndoModal}
                    disabled={!canManageBilling}
                    title={`Undo ${billingDocumentLower} sent`}
                  >
                    Undo {billingDocumentLabel} Sent
                  </button>
                )}
                {!isQuoteProject && (
                  <div className="payment-actions">
                    {PAYMENT_OPTIONS.map((option) => (
                      <div key={option.type} className="payment-action-group">
                        {!paymentTypes.has(option.type) ? (
                          <button
                            className="action-btn"
                            onClick={() => openPaymentModal(option.type)}
                            disabled={!canManageBilling}
                            title={`Confirm ${option.label}`}
                          >
                            Confirm {option.label}
                          </button>
                        ) : (
                          <button
                            className="action-btn undo-btn"
                            onClick={() => openPaymentUndoModal(option.type)}
                            disabled={!canManageBilling}
                            title={`Undo ${option.label}`}
                          >
                            Undo {option.label}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          {!isQuoteProject && (
            <div className="action-card">
              <h3>Production Sample Approval</h3>
              <p>
                Confirm client decision on production sample before completing
                Production stage.
              </p>
              <div className="billing-actions">
                {!sampleRequirementEnabled ? (
                  <div className="mockup-empty-state">
                    Sample approval requirement is currently off.
                  </div>
                ) : sampleApprovalConfirmed ? (
                  <>
                    <div className="mockup-approval-status approved">
                      Client sample approval confirmed
                    </div>
                    {project?.sampleApproval?.approvedAt && (
                      <p className="mockup-approval-meta">
                        Approved: {formatDateTime(project.sampleApproval.approvedAt)}
                      </p>
                    )}
                    <button
                      className="action-btn undo-btn"
                      onClick={openSampleApprovalResetModal}
                      disabled={!canManageBilling}
                    >
                      Reset to Pending
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mockup-approval-status pending">
                      Client sample approval pending
                    </div>
                    <button
                      className="action-btn complete-btn"
                      onClick={openSampleApprovalModal}
                      disabled={!canManageBilling}
                    >
                      Confirm Sample Approval
                    </button>
                  </>
                )}
                {!canManageBilling && (
                  <p className="mockup-approval-meta">
                    Front Desk or Admin must confirm client sample approval.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {!isQuoteProject && (
          <section className="mockup-standalone-section">
            <div className="action-card mockup-standalone-card">
              <h3>Mockup Approval</h3>
              <p>
                Confirm client approval before Mockup stage can be marked
                complete.
              </p>

              {!latestMockupVersion ? (
                <div className="mockup-empty-state">
                  No mockup has been uploaded yet.
                </div>
              ) : (
                <>
                  <div
                    className={`mockup-approval-status ${
                      mockupApprovalConfirmed
                        ? "approved"
                        : mockupApprovalRejected
                          ? "rejected"
                          : "pending"
                    }`}
                  >
                    Latest: {latestMockupVersionLabel}{" "}
                    {mockupApprovalConfirmed
                      ? "Client Approved"
                      : mockupApprovalRejected
                        ? "Client Rejected"
                        : "Pending Client Approval"}
                  </div>

                  {mockupApprovalConfirmed &&
                    latestMockupVersion.clientApproval?.approvedAt && (
                      <p className="mockup-approval-meta">
                        Approved:{" "}
                        {formatDateTime(
                          latestMockupVersion.clientApproval.approvedAt,
                        )}
                      </p>
                    )}
                  {mockupApprovalRejected &&
                    latestMockupVersion.clientApproval?.rejectedAt && (
                      <p className="mockup-approval-meta rejection">
                        Rejected:{" "}
                        {formatDateTime(
                          latestMockupVersion.clientApproval.rejectedAt,
                        )}
                      </p>
                    )}
                  {mockupApprovalRejected &&
                    latestMockupVersion.clientApproval?.rejectionReason && (
                      <p className="mockup-approval-meta rejection">
                        Reason:{" "}
                        {latestMockupVersion.clientApproval.rejectionReason}
                      </p>
                    )}

                  <div className="mockup-version-list">
                    {mockupVersions
                      .slice()
                      .reverse()
                      .map((version) => {
                        const fileName =
                          version.fileName ||
                          version.fileUrl.split("/").pop() ||
                          `Mockup v${version.version}`;
                        const decision = getMockupApprovalStatus(
                          version.clientApproval || {},
                        );
                        const isLatestVersion =
                          Number(version.version) ===
                          Number(latestMockupVersion?.version);
                        const canDecideOnVersions =
                          canManageMockupApproval &&
                          project.status === "Pending Mockup";
                        const approveHidden = decision === "rejected";
                        const approveDisabled =
                          !isLatestVersion || decision === "approved";
                        const rejectDisabled =
                          !isLatestVersion || decision === "rejected";
                        return (
                          <div
                            key={`mockup-version-${version.version}`}
                            className="mockup-version-item"
                          >
                            <div className="mockup-version-main">
                              <strong>v{version.version}</strong>
                              <span>
                                {decision === "approved"
                                  ? "Approved"
                                  : decision === "rejected"
                                    ? "Rejected"
                                    : "Pending Approval"}
                              </span>
                            </div>
                            <div className="mockup-version-links">
                              <a
                                href={version.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View
                              </a>
                              <a href={version.fileUrl} download>
                                Download
                              </a>
                            </div>
                            <div className="mockup-version-meta">
                              <span>{fileName}</span>
                              {version.uploadedAt && (
                                <span>
                                  Uploaded: {formatDateTime(version.uploadedAt)}
                                </span>
                              )}
                              {decision === "rejected" &&
                                version.clientApproval?.rejectedAt && (
                                  <span>
                                    Rejected:{" "}
                                    {formatDateTime(
                                      version.clientApproval.rejectedAt,
                                    )}
                                  </span>
                                )}
                              {decision === "rejected" &&
                                version.clientApproval?.rejectionReason && (
                                  <span>
                                    Reason:{" "}
                                    {version.clientApproval.rejectionReason}
                                  </span>
                                )}
                            </div>
                            {canDecideOnVersions && (
                              <div className="mockup-version-actions">
                                {!approveHidden && (
                                  <button
                                    className="action-btn complete-btn"
                                    onClick={() => openMockupApprovalModal(version)}
                                    disabled={approveDisabled}
                                    title={
                                      !isLatestVersion
                                        ? "Only latest version can be approved."
                                        : decision === "approved"
                                          ? "Already approved."
                                          : `Confirm client approval for v${version.version}`
                                    }
                                  >
                                    {decision === "approved"
                                      ? `Approved (v${version.version})`
                                      : `Confirm Approval (v${version.version})`}
                                  </button>
                                )}
                                <button
                                  className="action-btn undo-btn"
                                  onClick={() => openMockupRejectionModal(version)}
                                  disabled={rejectDisabled}
                                  title={
                                    !isLatestVersion
                                      ? "Only latest version can be rejected."
                                      : decision === "rejected"
                                        ? "Already rejected."
                                        : `Mark v${version.version} as rejected`
                                  }
                                >
                                  {decision === "rejected"
                                    ? `Rejected (v${version.version})`
                                    : `Mark Rejected (v${version.version})`}
                                </button>
                                {!isLatestVersion && (
                                  <span className="mockup-version-actions-note">
                                    Latest version only
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {!canManageMockupApproval && (
                    <p className="mockup-approval-meta">
                      Front Desk or Admin must confirm client decision.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        )}


        <section className="updates-standalone-section">
          <div className="updates-standalone-header">
            <div>
              <h3>Project Updates</h3>
              <p>Share project-specific updates with the team.</p>
            </div>
            <span className="updates-count-badge">
              {projectUpdates.length} updates
            </span>
          </div>

          <div className="updates-standalone-body">
            <div className="updates-inline-form-container">
              <h4>Add Update</h4>
              <div className="updates-inline-form">
                <label htmlFor="order-update-category">Category</label>
                <select
                  id="order-update-category"
                  value={updateCategory}
                  onChange={(e) => setUpdateCategory(e.target.value)}
                  disabled={!canShareUpdates || updateSubmitting}
                >
                  {UPDATE_CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <label htmlFor="order-update-content">Update Details</label>
                <textarea
                  id="order-update-content"
                  rows="3"
                  value={updateContent}
                  onChange={(e) => setUpdateContent(e.target.value)}
                  placeholder="Share what changed on this project..."
                  disabled={!canShareUpdates || updateSubmitting}
                />

                <button
                  className="action-btn update-submit-btn"
                  onClick={handlePostUpdate}
                  disabled={
                    !canShareUpdates ||
                    updateSubmitting ||
                    updateContent.trim().length === 0
                  }
                >
                  {updateSubmitting ? "Posting..." : "Post Update"}
                </button>
              </div>
            </div>

            <div className="updates-preview">
              <h4>Latest Update Preview</h4>
              {updatesLoading ? (
                <div className="updates-preview-empty">Loading updates...</div>
              ) : !latestUpdatePreview ? (
                <div className="updates-preview-empty">No updates yet.</div>
              ) : (
                <div className="updates-preview-item" key={latestUpdatePreview._id}>
                  <div className="updates-preview-meta">
                    <span>{getUpdateAuthorName(latestUpdatePreview)}</span>
                    <span>{formatDateTime(latestUpdatePreview.createdAt)}</span>
                  </div>
                  <div className="updates-preview-category-row">
                    <div className="updates-preview-category">
                      {normalizeUpdateCategory(latestUpdatePreview.category)}
                    </div>
                    {canManageUpdate(latestUpdatePreview) && (
                      <div className="updates-preview-actions">
                        {editingUpdateId === latestUpdatePreview._id ? (
                          <button
                            className="action-btn updates-preview-action"
                            onClick={handleCancelEditUpdate}
                            disabled={updateEditSubmitting}
                          >
                            Cancel
                          </button>
                        ) : (
                          <button
                            className="action-btn updates-preview-action"
                            onClick={() => handleStartEditUpdate(latestUpdatePreview)}
                            disabled={
                              updateDeleteSubmittingId === latestUpdatePreview._id
                            }
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="action-btn undo-btn updates-preview-action"
                          onClick={() => handleDeleteUpdate(latestUpdatePreview)}
                          disabled={updateDeleteSubmittingId === latestUpdatePreview._id}
                        >
                          {updateDeleteSubmittingId === latestUpdatePreview._id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>

                  {editingUpdateId === latestUpdatePreview._id ? (
                    <div className="updates-preview-edit-form">
                      <label
                        htmlFor={`update-edit-category-${latestUpdatePreview._id}`}
                      >
                        Category
                      </label>
                      <select
                        id={`update-edit-category-${latestUpdatePreview._id}`}
                        value={editUpdateCategory}
                        onChange={(e) => setEditUpdateCategory(e.target.value)}
                        disabled={updateEditSubmitting}
                      >
                        {UPDATE_CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>

                      <label htmlFor={`update-edit-content-${latestUpdatePreview._id}`}>
                        Content
                      </label>
                      <textarea
                        id={`update-edit-content-${latestUpdatePreview._id}`}
                        rows="3"
                        value={editUpdateContent}
                        onChange={(e) => setEditUpdateContent(e.target.value)}
                        disabled={updateEditSubmitting}
                      />

                      <div className="updates-preview-edit-actions">
                        <button
                          className="action-btn"
                          onClick={handleCancelEditUpdate}
                          disabled={updateEditSubmitting}
                        >
                          Cancel
                        </button>
                        <button
                          className="action-btn update-submit-btn"
                          onClick={() => handleSaveEditUpdate(latestUpdatePreview._id)}
                          disabled={
                            updateEditSubmitting || editUpdateContent.trim().length === 0
                          }
                        >
                          {updateEditSubmitting ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="updates-preview-content">{latestUpdatePreview.content}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="order-revision-section">
          <div className="updates-standalone-header">
            <div>
              <h3>Order Revision</h3>
              <p>Update the brief overview and reference materials for this order.</p>
              {lastOrderRevisionUpdatedAt && (
                <p className="order-revision-last-updated">
                  {lastOrderRevisionLabel}: {formatDateTime(lastOrderRevisionUpdatedAt)}
                </p>
              )}
            </div>
          </div>

          <div className="order-revision-body">
            <div className="order-revision-field">
              <label htmlFor="order-revision-order-number">Order Number</label>
              <input
                id="order-revision-order-number"
                type="text"
                className="form-input"
                value={orderNumberDraft}
                onChange={(e) => setOrderNumberDraft(e.target.value)}
                placeholder="Enter order number"
                disabled={!canManageOrderRevision || referenceSaving}
              />
              <small className="field-help-text">
                Front Desk and Admin can update order number for grouped orders.
              </small>
            </div>

            <div className="order-revision-field">
              <label htmlFor="order-revision-brief">Brief Overview</label>
              <textarea
                id="order-revision-brief"
                rows="4"
                className="form-input order-revision-textarea"
                value={briefOverviewDraft}
                onChange={(e) => setBriefOverviewDraft(e.target.value)}
                placeholder="Add or update a high-level order summary..."
                disabled={!canManageOrderRevision || referenceSaving}
              />
            </div>

            <div className="order-revision-field">
              <label>Reference Materials</label>

              <div className="order-revision-sample-actions">
                <button
                  type="button"
                  className="action-btn"
                  onClick={openSampleImagePicker}
                  disabled={!canManageOrderRevision || referenceSaving}
                >
                  {sampleImageDraft || newSampleImageFile
                    ? "Replace Primary Image"
                    : "Add Primary Image"}
                </button>
                {(sampleImageDraft || newSampleImageFile) && (
                  <button
                    type="button"
                    className="action-btn undo-btn"
                    onClick={removeSampleImage}
                    disabled={!canManageOrderRevision || referenceSaving}
                  >
                    {newSampleImageFile ? "Discard New Image" : "Remove Primary Image"}
                  </button>
                )}
              </div>

              <input
                type="file"
                accept="image/*"
                id="order-actions-sample-image"
                style={{ display: "none" }}
                onChange={handleSampleImageSelection}
                disabled={!canManageOrderRevision || referenceSaving}
              />

              {sampleImageDraft &&
                !newSampleImageFile &&
                (referenceMaterialsDraft.length > 0 || newReferenceFiles.length > 0) && (
                  <p className="order-revision-note">Primary image is included below.</p>
                )}

              {!sampleImageDraft &&
                !newSampleImageFile &&
                referenceMaterialsDraft.length === 0 &&
                newReferenceFiles.length === 0 && (
                <div
                  className={`minimal-quote-file-dropzone order-revision-dropzone ${
                    !canManageOrderRevision ? "is-disabled" : ""
                  }`}
                  onClick={openReferenceFilePicker}
                >
                  <FolderIcon />
                  <p>Click to upload reference files</p>
                  <span>Images, PDFs, Documents</span>
                </div>
              )}

              <input
                type="file"
                multiple
                id="order-actions-reference-materials"
                style={{ display: "none" }}
                onChange={handleReferenceFileSelection}
                disabled={!canManageOrderRevision || referenceSaving}
              />

              {(sampleImageDraft ||
                newSampleImageFile ||
                referenceMaterialsDraft.length > 0 ||
                newReferenceFiles.length > 0) && (
                <div className="minimal-quote-files-grid">
                  {sampleImageDraft && !newSampleImageFile && (
                    <div className="minimal-quote-file-tile existing">
                      <div className="file-icon">
                        <img src={sampleImageDraft} alt="Primary reference" />
                      </div>
                      <div className="file-info" title="Primary Image">
                        Primary Image
                      </div>
                    </div>
                  )}

                  {newSampleImageFile && (
                    <div className="minimal-quote-file-tile">
                      <div className="file-icon">
                        <FolderIcon />
                      </div>
                      <div className="file-info" title={newSampleImageFile.name}>
                        {newSampleImageFile.name}
                      </div>
                    </div>
                  )}

                  {referenceMaterialsDraft.map((path, idx) => (
                    <div
                      key={`existing-${idx}`}
                      className="minimal-quote-file-tile existing"
                    >
                      <div className="file-icon">
                        {isImagePath(path) ? (
                          <img src={path} alt={getReferenceFileName(path)} />
                        ) : (
                          <FolderIcon />
                        )}
                      </div>
                      <div className="file-info" title={getReferenceFileName(path)}>
                        {getReferenceFileName(path)}
                      </div>
                      {canManageOrderRevision && (
                        <button
                          type="button"
                          onClick={() => removeExistingReference(idx)}
                          className="file-remove-btn"
                          disabled={referenceSaving}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}

                  {newReferenceFiles.map((file, idx) => (
                    <div key={`new-${idx}`} className="minimal-quote-file-tile">
                      <div className="file-icon">
                        <FolderIcon />
                      </div>
                      <div className="file-info" title={file.name}>
                        {file.name}
                      </div>
                      {canManageOrderRevision && (
                        <button
                          type="button"
                          onClick={() => removeNewReference(idx)}
                          className="file-remove-btn"
                          disabled={referenceSaving}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}

                  {canManageOrderRevision && (
                    <div
                      className={`minimal-quote-file-add-tile ${
                        referenceSaving ? "is-disabled" : ""
                      }`}
                      onClick={openReferenceFilePicker}
                    >
                      <span>+</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="order-revision-actions">
              <button
                className="action-btn"
                onClick={resetOrderRevisionChanges}
                disabled={!canManageOrderRevision || referenceSaving || !orderRevisionDirty}
              >
                Reset
              </button>
              <button
                className="action-btn update-submit-btn"
                onClick={handleSaveOrderRevision}
                disabled={!canManageOrderRevision || referenceSaving || !orderRevisionDirty}
              >
                {referenceSaving ? "Saving..." : "Save Order Changes"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {billingGuardModal.open && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>{billingGuardModal.title || "Billing Caution"}</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {project.details?.projectName || "Untitled"}
            </p>
            <p className="confirm-modal-text">{billingGuardModal.message}</p>
            {billingGuardModal.missingLabels.length > 0 && (
              <div className="confirm-phrase">
                Missing: {billingGuardModal.missingLabels.join(", ")}
              </div>
            )}
            <div className="confirm-actions">
              <button
                className="action-btn"
                onClick={closeBillingGuardModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {sampleApprovalModal && (
        <div className="confirm-modal-overlay" onClick={closeSampleApprovalModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Client Sample Approval</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {project.details?.projectName || "Untitled"}
            </p>
            <p className="confirm-modal-text">
              Confirm that client approved the production sample.
            </p>
            <div className="confirm-phrase">{SAMPLE_APPROVAL_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={sampleApprovalInput}
                onChange={(e) => setSampleApprovalInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeSampleApprovalModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmSampleApproval}
                disabled={
                  sampleApprovalSubmitting ||
                  sampleApprovalInput.trim() !== SAMPLE_APPROVAL_CONFIRM_PHRASE
                }
              >
                {sampleApprovalSubmitting ? "Confirming..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sampleApprovalResetModal && (
        <div
          className="confirm-modal-overlay"
          onClick={closeSampleApprovalResetModal}
        >
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Reset Sample Approval</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {project.details?.projectName || "Untitled"}
            </p>
            <p className="confirm-modal-text">
              Reset sample approval back to pending.
            </p>
            <div className="confirm-phrase">{SAMPLE_APPROVAL_RESET_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={sampleApprovalResetInput}
                onChange={(e) => setSampleApprovalResetInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button
                className="action-btn"
                onClick={closeSampleApprovalResetModal}
              >
                Cancel
              </button>
              <button
                className="action-btn undo-btn"
                onClick={handleConfirmSampleApprovalReset}
                disabled={
                  sampleApprovalResetSubmitting ||
                  sampleApprovalResetInput.trim() !== SAMPLE_APPROVAL_RESET_PHRASE
                }
              >
                {sampleApprovalResetSubmitting ? "Saving..." : "Reset Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mockupApprovalModal.open && (
        <div className="confirm-modal-overlay" onClick={closeMockupApprovalModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Client Mockup Approval</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {project.details?.projectName || "Untitled"}
            </p>
            <p className="confirm-modal-text">
              Confirm that client approved mockup version{" "}
              <strong>
                v{mockupApprovalModal.version?.version || "N/A"}
              </strong>
              .
            </p>
            <div className="confirm-phrase">{MOCKUP_APPROVAL_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={mockupApprovalInput}
                onChange={(e) => setMockupApprovalInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeMockupApprovalModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmMockupApproval}
                disabled={
                  mockupApprovalSubmitting ||
                  mockupApprovalInput.trim() !== MOCKUP_APPROVAL_CONFIRM_PHRASE
                }
              >
                {mockupApprovalSubmitting ? "Confirming..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mockupRejectionModal.open && (
        <div className="confirm-modal-overlay" onClick={closeMockupRejectionModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Client Mockup Rejection</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {project.details?.projectName || "Untitled"}
            </p>
            <p className="confirm-modal-text">
              Confirm that client rejected mockup version{" "}
              <strong>
                v{mockupRejectionModal.version?.version || "N/A"}
              </strong>
              .
            </p>
            <div className="confirm-phrase">{MOCKUP_REJECTION_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={mockupRejectionInput}
                onChange={(e) => setMockupRejectionInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-input-group">
              <label>Rejection Reason (Optional)</label>
              <textarea
                rows="3"
                value={mockupRejectionReason}
                onChange={(e) => setMockupRejectionReason(e.target.value)}
                placeholder="Why did client reject this mockup? (optional)"
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeMockupRejectionModal}>
                Cancel
              </button>
              <button
                className="action-btn undo-btn"
                onClick={handleConfirmMockupRejection}
                disabled={
                  mockupRejectionSubmitting ||
                  mockupRejectionInput.trim() !==
                    MOCKUP_REJECTION_CONFIRM_PHRASE
                }
              >
                {mockupRejectionSubmitting ? "Saving..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deliveryModal.open && (
        <div className="confirm-modal-overlay" onClick={closeDeliveryModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Delivery</h3>
              <p>{project.orderId || project._id || "Project"}</p>
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

      {invoiceModal && (
        <div className="confirm-modal-overlay" onClick={closeInvoiceModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm {billingDocumentLabel} Sent</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to confirm {billingDocumentLower} delivery.
            </p>
            <div className="confirm-phrase">{billingConfirmPhrase}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeInvoiceModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmInvoice}
                disabled={
                  invoiceSubmitting ||
                  invoiceInput.trim() !== billingConfirmPhrase
                }
              >
                {invoiceSubmitting
                  ? "Confirming..."
                  : `Confirm ${billingDocumentLabel} Sent`}
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceUndoModal && (
        <div className="confirm-modal-overlay" onClick={closeInvoiceUndoModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Undo {billingDocumentLabel} Sent</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to reset {billingDocumentLower} status.
            </p>
            <div className="confirm-phrase">{billingUndoPhrase}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={invoiceUndoInput}
                onChange={(e) => setInvoiceUndoInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeInvoiceUndoModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmInvoiceUndo}
                disabled={
                  invoiceUndoSubmitting ||
                  invoiceUndoInput.trim() !== billingUndoPhrase
                }
              >
                {invoiceUndoSubmitting
                  ? "Confirming..."
                  : `Undo ${billingDocumentLabel} Sent`}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModal.open && (
        <div className="confirm-modal-overlay" onClick={closePaymentModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Payment Verification</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to confirm payment verification.
            </p>
            <div className="confirm-phrase">
              {PAYMENT_OPTIONS.find((option) => option.type === paymentModal.type)
                ?.phrase || ""}
            </div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closePaymentModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmPayment}
                disabled={
                  paymentSubmitting ||
                  paymentInput.trim() !==
                    (PAYMENT_OPTIONS.find(
                      (option) => option.type === paymentModal.type,
                    )?.phrase || "")
                }
              >
                {paymentSubmitting ? "Confirming..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentUndoModal.open && (
        <div className="confirm-modal-overlay" onClick={closePaymentUndoModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Undo Payment Verification</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to undo payment verification.
            </p>
            <div className="confirm-phrase">
              {PAYMENT_OPTIONS.find((option) => option.type === paymentUndoModal.type)
                ?.undoPhrase || ""}
            </div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={paymentUndoInput}
                onChange={(e) => setPaymentUndoInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closePaymentUndoModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmPaymentUndo}
                disabled={
                  paymentUndoSubmitting ||
                  paymentUndoInput.trim() !==
                    (PAYMENT_OPTIONS.find(
                      (option) => option.type === paymentUndoModal.type,
                    )?.undoPhrase || "")
                }
              >
                {paymentUndoSubmitting ? "Confirming..." : "Undo Payment"}
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
                <p>{project.orderId || project._id || "Project"}</p>
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
                          {formatDate(entry.createdAt)}
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
                        Remove
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

export default OrderActions;
