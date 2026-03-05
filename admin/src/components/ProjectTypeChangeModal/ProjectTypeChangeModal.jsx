import React, { useEffect, useMemo, useState } from "react";
import Modal from "../Modal/Modal";
import "./ProjectTypeChangeModal.css";

const PROJECT_TYPE_OPTIONS = ["Standard", "Emergency", "Corporate Job", "Quote"];
const PROJECT_STATUS_OPTIONS = [
  "Draft",
  "Pending Approval",
  "In Progress",
  "New Order",
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
  "Finished",
];
const QUOTE_STATUS_OPTIONS = [
  "Draft",
  "Pending Approval",
  "In Progress",
  "New Order",
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
  "Finished",
];

const getStatusOptionsForType = (projectType) =>
  projectType === "Quote" ? QUOTE_STATUS_OPTIONS : PROJECT_STATUS_OPTIONS;

const getDefaultStatusForType = (projectType) =>
  projectType === "Quote"
    ? "Pending Quote Request"
    : "Pending Departmental Engagement";

const normalizeProjectType = (value) => {
  if (PROJECT_TYPE_OPTIONS.includes(value)) return value;
  return "Standard";
};

const normalizePriority = (value) => (value === "Urgent" ? "Urgent" : "Normal");

const ProjectTypeChangeModal = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  errorMessage = "",
  orderId = "",
  projectName = "",
  currentType = "Standard",
  currentStatus = "",
  currentPriority = "Normal",
  currentSampleRequired = false,
  currentCorporateEmergency = false,
}) => {
  const [targetType, setTargetType] = useState("Standard");
  const [targetStatus, setTargetStatus] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [sampleRequired, setSampleRequired] = useState(false);
  const [corporateEmergency, setCorporateEmergency] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const normalizedType = normalizeProjectType(currentType);
    const statusOptions = getStatusOptionsForType(normalizedType);
    const normalizedStatus = statusOptions.includes(currentStatus)
      ? currentStatus
      : getDefaultStatusForType(normalizedType);

    setTargetType(normalizedType);
    setTargetStatus(normalizedStatus);
    setPriority(
      normalizedType === "Emergency"
        ? "Urgent"
        : normalizePriority(currentPriority),
    );
    setSampleRequired(
      normalizedType === "Quote" ? false : Boolean(currentSampleRequired),
    );
    setCorporateEmergency(
      normalizedType === "Corporate Job" && Boolean(currentCorporateEmergency),
    );
    setReason("");
  }, [
    isOpen,
    currentType,
    currentStatus,
    currentPriority,
    currentSampleRequired,
    currentCorporateEmergency,
  ]);

  const statusOptions = useMemo(
    () => getStatusOptionsForType(targetType),
    [targetType],
  );

  useEffect(() => {
    if (!statusOptions.includes(targetStatus)) {
      setTargetStatus(getDefaultStatusForType(targetType));
    }

    if (targetType === "Emergency") {
      setPriority("Urgent");
    }

    if (targetType === "Quote") {
      setSampleRequired(false);
    }

    if (targetType !== "Corporate Job") {
      setCorporateEmergency(false);
    }
  }, [targetType, targetStatus, statusOptions]);

  const isQuoteConversion = currentType === "Quote" && targetType !== "Quote";

  const handleConfirm = () => {
    onConfirm?.({
      targetType,
      targetStatus,
      priority,
      sampleRequired,
      corporateEmergency,
      reason: String(reason || "").trim(),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isQuoteConversion ? "Convert Quote to Project" : "Change Project Type"}
      maxWidth="620px"
    >
      <div className="project-type-modal-content">
        <p className="project-type-modal-description">
          Update project type/workflow safely from the admin portal. If status
          does not fit the selected type, set the correct starting stage.
        </p>

        <div className="project-type-modal-meta">
          <p>
            <strong>Order:</strong> {orderId || "N/A"}
          </p>
          <p>
            <strong>Project:</strong> {projectName || "Unnamed Project"}
          </p>
          <p>
            <strong>Current:</strong> {currentType || "Standard"} /{" "}
            {currentStatus || "N/A"}
          </p>
        </div>

        <div className="project-type-modal-grid">
          <label className="project-type-modal-field">
            <span>Target Type</span>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              disabled={isSubmitting}
            >
              {PROJECT_TYPE_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>

          <label className="project-type-modal-field">
            <span>Target Status</span>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              disabled={isSubmitting}
            >
              {statusOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>

          <label className="project-type-modal-field">
            <span>Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={isSubmitting || targetType === "Emergency"}
            >
              <option value="Normal">Normal</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>

          <div className="project-type-modal-flags">
            {targetType !== "Quote" && (
              <label className="project-type-modal-toggle sample">
                <input
                  type="checkbox"
                  checked={Boolean(sampleRequired)}
                  onChange={(e) => setSampleRequired(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>Sample Approval Required</span>
              </label>
            )}

            {targetType === "Corporate Job" && (
              <label className="project-type-modal-toggle emergency">
                <input
                  type="checkbox"
                  checked={Boolean(corporateEmergency)}
                  onChange={(e) => setCorporateEmergency(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>Corporate Emergency</span>
              </label>
            )}
          </div>
        </div>

        <label className="project-type-modal-field full">
          <span>Reason (Optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this type/workflow change being made?"
            disabled={isSubmitting}
          />
        </label>

        {errorMessage ? (
          <p className="project-type-modal-error">{errorMessage}</p>
        ) : null}

        <div className="project-type-modal-actions">
          <button
            type="button"
            className="project-type-modal-btn back"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Back
          </button>
          <button
            type="button"
            className="project-type-modal-btn confirm"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Applying..."
              : isQuoteConversion
                ? "Convert Quote"
                : "Apply Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProjectTypeChangeModal;
