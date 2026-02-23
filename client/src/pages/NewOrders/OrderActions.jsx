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

const isImagePath = (path) =>
  /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(String(path || ""));

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

      if (updatesChanged || thisProjectChanged) {
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
  const isQuoteProject = project?.projectType === "Quote";
  const hasPaymentVerification = paymentTypes.size > 0;
  const invoiceSent = Boolean(project?.invoice?.sent);
  const billingDocumentLabel = isQuoteProject ? "Quote" : "Invoice";
  const billingDocumentLower = isQuoteProject ? "quote" : "invoice";
  const billingConfirmPhrase = isQuoteProject
    ? QUOTE_CONFIRM_PHRASE
    : INVOICE_CONFIRM_PHRASE;
  const billingUndoPhrase = isQuoteProject
    ? QUOTE_UNDO_PHRASE
    : INVOICE_UNDO_PHRASE;

  const handleDeliveryComplete = async () => {
    if (!canMarkDelivered || !project) return;
    try {
      const res = await fetch(`/api/projects/${project._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Delivered" }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Order delivered. Feedback is now pending.", "success");
        return true;
      }
      const errorData = await res.json();
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
    setFeedbackModal({ open: true, project });
  };

  const closeFeedbackModal = () => {
    setFeedbackModal({ open: false, project: null });
    setFeedbackType("Positive");
    setFeedbackNotes("");
  };

  const handleAddFeedback = async () => {
    if (!project) return;
    setFeedbackSaving(true);
    try {
      const res = await fetch(`/api/projects/${project._id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: feedbackType, notes: feedbackNotes }),
      });
      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setFeedbackModal({ open: true, project: updatedProject });
        setFeedbackNotes("");
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

  const showPaymentWarning =
    project &&
    !isQuoteProject &&
    !hasPaymentVerification &&
    [
      "Scope Approval Completed",
      "Pending Departmental Engagement",
      "Departmental Engagement Completed",
      "Pending Mockup",
      "Pending Production",
    ].includes(project.status);
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
            {invoiceSent && (
              <span className="status-tag invoice">{billingDocumentLabel} Sent</span>
            )}
            {!isQuoteProject &&
              Array.from(paymentTypes).map((type) => (
                <span key={type} className="status-tag payment">
                  {paymentLabels[type] || type}
                </span>
              ))}
          </div>
        </div>

        {showPaymentWarning && (
          <div className="warning-banner">
            Payment verification is required before production can begin.
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
        </div>


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
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                      <p>{entry.notes}</p>
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
