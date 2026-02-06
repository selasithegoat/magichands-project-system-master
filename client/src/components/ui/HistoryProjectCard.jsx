import React from "react";
import "./HistoryProjectCard.css";
// Icons
import BuildingIcon from "../icons/BuildingIcon";
import CalendarIcon from "../icons/CalendarIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import EyeIcon from "../icons/EyeIcon";

const HistoryProjectCard = ({ project, onViewDetails }) => {
  const details = project.details || {};

  // Format Date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="history-card">
      <div className="card-top-row">
        <span className="order-id-tag">{project.orderId || "NO-ID"}</span>
        <span className="status-badge delivered">
          <CheckCircleIcon width="16" height="16" /> {project.status}
        </span>
      </div>

      <h3 className="card-title">
        {details.projectName || "Untitled Project"}
      </h3>

      <div className="card-info-grid">
        <div className="info-item">
          <div className="info-icon">
            <BuildingIcon />
          </div>
          <div className="info-content">
            <span className="info-label">Client</span>
            <span className="info-value">
              {details.client ||
                details.clientName ||
                details.department ||
                "Internal"}
            </span>
          </div>
        </div>
        <div className="info-item">
          <div className="info-icon">
            <CalendarIcon />
          </div>
          <div className="info-content">
            <span className="info-label">Delivered On</span>
            <span className="info-value">
              {formatDate(details.deliveryDate)}
            </span>
          </div>
        </div>
      </div>

      <div className="card-actions">
        <button
          className="action-btn btn-secondary"
          style={{ width: "100%" }}
          onClick={() => onViewDetails(project._id)}
        >
          <EyeIcon /> View Details
        </button>
      </div>
    </div>
  );
};

export default HistoryProjectCard;
