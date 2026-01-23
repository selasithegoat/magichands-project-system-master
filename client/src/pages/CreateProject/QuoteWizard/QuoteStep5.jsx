import React, { useState } from "react";
import BackArrow from "../../../components/icons/BackArrow";
import FolderIcon from "../../../components/icons/FolderIcon";
import BuildingIcon from "../../../components/icons/BuildingIcon";
import DollarIcon from "../../../components/icons/DollarIcon";
import CheckIcon from "../../../components/icons/CheckIcon";
import WarningIcon from "../../../components/icons/WarningIcon";
import RobotArmIcon from "../../../components/icons/RobotArmIcon";
import UserAvatar from "../../../components/ui/UserAvatar";
import Spinner from "../../../components/ui/Spinner";
import ProgressBar from "../../../components/ui/ProgressBar";
import "./QuoteStep5.css"; // We'll create this or use Step5.css if shared

const QuoteStep5 = ({ formData, onCreate, onBack, onCancel, onComplete }) => {
  const [isChecked, setIsChecked] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const handleFinish = async () => {
    if (!isChecked) {
      setError("Please verify the information before submitting.");
      return;
    }
    setIsCreating(true);
    setError("");
    const result = await onCreate();
    setIsCreating(false);

    if (result.success) {
      onComplete();
    } else {
      setError(result.message || "Something went wrong.");
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="step-container">
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">Review & Submit</h1>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        <ProgressBar currentStep={5} totalSteps={5} />

        <div className="page-title-section-left">
          <h2 className="page-title-left">Final Project Review</h2>
          <p className="page-subtitle-left">
            Review the project information carefully before accepting the
            project.
          </p>
        </div>

        {error && (
          <div className="error-banner">
            <WarningIcon />
            <span>{error}</span>
          </div>
        )}

        {/* Project Basics Card */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <FolderIcon />
              </div>
              <span className="card-title">Project Basics</span>
            </div>
          </div>
          <div className="review-grid">
            <div className="review-item">
              <label>Project Name</label>
              <div className="review-value">
                {formData.projectName || "N/A"}
              </div>
            </div>
            <div className="review-item">
              <label>Client</label>
              <div className="review-value">{formData.client || "N/A"}</div>
            </div>
            <div className="review-item">
              <label>Status</label>
              <div className="review-value">
                <span className="badge-yellow">Quote Conversion</span>
              </div>
            </div>
            <div className="review-item">
              <label>Quote Number</label>
              <div className="review-value">
                {formData.quoteDetails?.quoteNumber || "N/A"}
              </div>
            </div>
          </div>
        </div>

        {/* Lead & Timeline Card */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <BuildingIcon />
              </div>
              <span className="card-title">Lead & Timeline</span>
            </div>
          </div>
          <div className="review-grid-3">
            <div className="review-item">
              <label>Completion Date</label>
              <div className="review-value">
                {formatDate(formData.deliveryDate)}
              </div>
            </div>
            <div className="review-item">
              <label>Received Time</label>
              <div className="review-value">
                {formData.receivedTime || "N/A"}
              </div>
            </div>
            <div className="review-item">
              <label>Lead</label>
              <div className="user-row">
                <UserAvatar />
                <span className="review-value">
                  {formData.leadLabel || "Assigned Lead"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scope & Items Card */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <DollarIcon />
              </div>
              <span className="card-title">Scope & Items</span>
            </div>
          </div>
          <div className="review-grid">
            <div className="review-item" style={{ gridColumn: "1 / -1" }}>
              <label>Engaged Departments</label>
              <div className="review-value">
                {formData.departments && formData.departments.length > 0
                  ? formData.departments.map((d) => (
                      <span
                        key={d}
                        className="badge-pink"
                        style={{ marginRight: 5, textTransform: "capitalize" }}
                      >
                        {d.replace("-", " ")}
                      </span>
                    ))
                  : "None Selected"}
              </div>
            </div>
            <div
              className="review-item"
              style={{ gridColumn: "1 / -1", marginTop: 10 }}
            >
              <label>
                Items Breakdown ({formData.items ? formData.items.length : 0})
              </label>
              <div className="items-list-review">
                {formData.items &&
                  formData.items.map((item, idx) => (
                    <div key={idx} className="review-item-row-simple">
                      • {item.qty}x {item.description}{" "}
                      {item.breakdown && `(${item.breakdown})`}{" "}
                      {item.department && `[${item.department}]`}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Assessment Card */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <WarningIcon />
              </div>
              <span className="card-title">Risk Assessment</span>
            </div>
          </div>
          <div className="review-grid">
            <div className="review-item" style={{ gridColumn: "1 / -1" }}>
              <label>Uncontrollable Factors</label>
              <div className="factors-review-list">
                {formData.uncontrollableFactors &&
                formData.uncontrollableFactors.length > 0
                  ? formData.uncontrollableFactors.map((f, i) => (
                      <div key={i} className="review-factor-item">
                        <div className="factor-main">
                          <span className="badge-red-small">High Priority</span>
                          <strong>{f.description}</strong>
                        </div>
                        <div className="factor-details-row">
                          <span>Resp: {f.responsible?.label || "N/A"}</span>
                          <span>Status: {f.status?.label || "N/A"}</span>
                        </div>
                      </div>
                    ))
                  : "None"}
              </div>
            </div>
            <div
              className="review-item"
              style={{ gridColumn: "1 / -1", marginTop: 15 }}
            >
              <label>Production Risks</label>
              <div className="risks-review-list">
                {formData.productionRisks && formData.productionRisks.length > 0
                  ? formData.productionRisks.map((r, i) => (
                      <div key={i} className="review-risk-item">
                        <div className="risk-desc">• {r.description}</div>
                        {r.preventive && (
                          <div className="risk-prev">
                            Preventive: {r.preventive}
                          </div>
                        )}
                      </div>
                    ))
                  : "None"}
              </div>
            </div>
          </div>
        </div>

        {/* Quote Checklist Card */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <CheckIcon />
              </div>
              <span className="card-title">Quote Requirements</span>
            </div>
          </div>
          <div className="review-grid">
            <div className="checklist-review-grid">
              {formData.quoteDetails?.checklist &&
                Object.entries(formData.quoteDetails.checklist).map(
                  ([key, val]) => (
                    <div
                      key={key}
                      className={`checklist-review-item ${val ? "completed" : ""}`}
                      style={{ cursor: "default" }}
                    >
                      <span className="check-mark">{val ? "✓" : "○"}</span>
                      <span className="check-label">
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())}
                      </span>
                    </div>
                  ),
                )}
            </div>
          </div>
        </div>

        {/* Reference Materials Card */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <FolderIcon />
              </div>
              <span className="card-title">Initial Reference Materials</span>
            </div>
          </div>
          <div className="review-body-content">
            <div className="overview-box">
              <label>Brief Overview</label>
              <p>{formData.briefOverview || "No overview provided."}</p>
            </div>
            {formData.attachments?.length > 0 && (
              <div className="attachments-review-list">
                <label>Attachments</label>
                <div className="attachments-grid-simple">
                  {formData.attachments.map((file, idx) => (
                    <div key={idx} className="attachment-tile-simple">
                      <a href={file} target="_blank" rel="noopener noreferrer">
                        {file.split("/").pop()}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Verification Checkbox */}
        <div className="verification-section">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => setIsChecked(!isChecked)}
            />
            <span className="checkmark"></span>
            <span className="checkbox-label">
              I verify this information is accurate
            </span>
          </label>
          <p className="verification-sub">
            By checking this, you confirm that all project details have been
            reviewed and approved.
          </p>
        </div>
      </div>

      <div className="step-footer footer-centered">
        <button
          className="back-text-btn"
          onClick={onBack}
          disabled={isCreating}
        >
          Back
        </button>
        <button
          className={`btn-primary-green ${!isChecked || isCreating ? "disabled" : ""}`}
          onClick={handleFinish}
          disabled={!isChecked || isCreating}
        >
          {isCreating ? <Spinner size="small" /> : "Accept Project"}
        </button>
      </div>
    </div>
  );
};

export default QuoteStep5;
