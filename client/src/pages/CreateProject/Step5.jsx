import React, { useState } from "react";
import BackArrow from "../../components/icons/BackArrow";
import FolderIcon from "../../components/icons/FolderIcon";
import BuildingIcon from "../../components/icons/BuildingIcon";
import DollarIcon from "../../components/icons/DollarIcon";
import EditIcon from "../../components/icons/EditIcon";
import FileIcon from "../../components/icons/FileIcon";
import CheckIcon from "../../components/icons/CheckIcon";
import UserAvatar from "../../components/ui/UserAvatar";
import "./Step5.css";

const Step5 = ({ formData, onCreate, onBack, onCancel }) => {
  const [isChecked, setIsChecked] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateClick = async () => {
    if (!isChecked) {
      alert("Please verify the information before submitting.");
      return;
    }
    setIsCreating(true);
    await onCreate();
    setIsCreating(false);
  };

  // Helper to format date
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
      {/* Header */}
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
        {/* Progress Stepper */}
        <div className="stepper-section">
          <div className="stepper-container">
            {[1, 2, 3, 4].map((step) => (
              <React.Fragment key={step}>
                <div className="step-circle completed">
                  <CheckIcon />
                </div>
                <div className="stepper-horizontal-line"></div>
              </React.Fragment>
            ))}
            <div className="step-circle active">5</div>
          </div>
          <div className="progress-text-center">
            <span className="step-indicator">Step 5 of 5</span>
          </div>
        </div>

        {/* Title */}
        <div className="page-title-section-left">
          <h2 className="page-title-left">Review Details</h2>
          <p className="page-subtitle-left">
            Please review the project information carefully before submitting.
          </p>
        </div>

        {/* Review Cards */}

        {/* Project Basics */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <FolderIcon />
              </div>
              <span className="card-title">Project Basics</span>
            </div>
            {/* <button className="edit-icon-btn">
              <EditIcon />
            </button> */}
          </div>

          <div className="review-grid">
            <div className="review-item">
              <label>Project Name</label>
              <div className="review-value">
                {formData.projectName || "N/A"}
              </div>
            </div>
            <div className="review-item">
              <label>Contact Type</label>
              <div className="review-value">{formData.contactType}</div>
            </div>
            <div className="review-item">
              <label>Supply Source</label>
              <div>
                <span
                  className="badge-yellow"
                  style={{ textTransform: "capitalize" }}
                >
                  {formData.supplySource}
                </span>
              </div>
            </div>
            <div className="review-item">
              <label>Status</label>
              <div>
                <span className="badge-yellow">Draft</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delivery Details */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <BuildingIcon />
              </div>
              <span className="card-title">Delivery Details</span>
            </div>
          </div>

          <div className="review-grid-3">
            <div className="review-item">
              <label>Location</label>
              <div className="review-value">
                {formData.deliveryLocation || "N/A"}
              </div>
            </div>
            <div className="review-item">
              <label>Delivery Date</label>
              <div className="review-value">
                {formatDate(formData.deliveryDate)} {formData.deliveryTime}
              </div>
            </div>
            <div className="review-item">
              <label>Lead</label>
              <div className="user-row">
                <UserAvatar />
                <span className="review-value">
                  {formData.lead ? formData.lead.label : "Unassigned"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Departments & Items */}
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
                        {d}
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
              <div
                className="review-value"
                style={{ fontSize: "0.9rem", color: "#64748B" }}
              >
                {formData.items &&
                  formData.items.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: 4 }}>
                      • {item.qty}x {item.description} ({item.breakdown})
                    </div>
                  ))}
              </div>
            </div>
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
            reviewed and approved for submission.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="step-footer footer-split">
        <button className="btn-outline" onClick={onBack}>
          Back
        </button>
        <button
          className={`btn-primary-green ${!isChecked ? "disabled" : ""}`}
          onClick={handleCreateClick}
          disabled={!isChecked || isCreating}
        >
          {isCreating ? "Creating..." : "Create Project"}
          {!isCreating && (
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.16666 10H15.8333"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 4.16669L15.8333 10L10 15.8334"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default Step5;
