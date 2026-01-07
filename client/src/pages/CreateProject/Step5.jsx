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

const Step5 = ({ onBack }) => {
  const [isChecked, setIsChecked] = useState(false);

  return (
    <div className="step-container">
      {/* Header */}
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">Review & Submit</h1>
        <div style={{ width: 24 }}></div>
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
                <div className="step-line"></div>
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
            <button className="edit-icon-btn">
              <EditIcon />
            </button>
          </div>

          <div className="review-grid">
            <div className="review-item">
              <label>Project Name</label>
              <div className="review-value">MagicHands Annual Gala</div>
            </div>
            <div className="review-item">
              <label>Type</label>
              <div className="review-value">Event Management</div>
            </div>
            <div className="review-item">
              <label>Priority</label>
              <div>
                <span className="badge-pink">High</span>
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

        {/* Client Details */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <BuildingIcon />
              </div>
              <span className="card-title">Client Details</span>
            </div>
            <button className="edit-icon-btn">
              <EditIcon />
            </button>
          </div>

          <div className="review-grid-3">
            <div className="review-item">
              <label>Client Company</label>
              <div className="review-value">TechFlow Solutions Inc.</div>
            </div>
            <div className="review-item">
              <label>Contact Person</label>
              <div className="user-row">
                <UserAvatar />
                <span className="review-value">Sarah Connor</span>
              </div>
            </div>
            <div className="review-item">
              <label>Email</label>
              <div className="review-value">sarah.c@techflow.com</div>
            </div>
          </div>
        </div>

        {/* Budget & Schedule */}
        <div className="review-card">
          <div className="review-card-header">
            <div className="header-left">
              <div className="icon-box-blue">
                <DollarIcon />
              </div>
              <span className="card-title">Budget & Schedule</span>
            </div>
            <button className="edit-icon-btn">
              <EditIcon />
            </button>
          </div>

          <div className="review-grid">
            <div className="review-item">
              <label>Est. Budget</label>
              <div className="review-value bold">$50,000 USD</div>
            </div>
            <div className="review-item">
              <label>Department</label>
              <div className="review-value">Marketing</div>
            </div>
            <div className="review-item">
              <label>Start Date</label>
              <div className="date-value">Oct 12, 2023</div>
            </div>
            <div className="review-item">
              <label>Deadline</label>
              <div className="date-value">Dec 20, 2023</div>
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div className="review-section-simple">
          <label className="section-label-simple">Attachments</label>
          <div className="attachment-card">
            <div className="file-icon-box">
              <FileIcon />
            </div>
            <div className="file-info">
              <div className="file-name">project_brief_v2.pdf</div>
              <div className="file-size">2.4 MB</div>
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
        <button className="btn-outline">Save as Draft</button>
        <button className="btn-primary-green">
          Create Project
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
        </button>
      </div>
    </div>
  );
};

export default Step5;
