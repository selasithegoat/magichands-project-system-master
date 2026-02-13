import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

  useEffect(() => {
    fetchCurrentUser();
    fetchProject();
  }, [id]);

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

  const canManageBilling =
    currentUser?.role === "admin" ||
    currentUser?.department?.includes("Front Desk");
  const canMarkDelivered = canManageBilling;
  const canManageFeedback = canManageBilling;
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

  const showPaymentWarning =
    project &&
    !isQuoteProject &&
    !hasPaymentVerification &&
    ["Pending Mockup", "Pending Production", "Scope Approval Completed"].includes(
      project.status,
    );

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
