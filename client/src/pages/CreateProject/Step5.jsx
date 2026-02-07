import React, { useState } from "react";
import BackArrow from "../../components/icons/BackArrow";
import FolderIcon from "../../components/icons/FolderIcon";
import BuildingIcon from "../../components/icons/BuildingIcon";
import DollarIcon from "../../components/icons/DollarIcon";

import CheckIcon from "../../components/icons/CheckIcon";
import WarningIcon from "../../components/icons/WarningIcon";
import ConfirmationModal from "../../components/ui/ConfirmationModal";

import "./Step5.css";

const Step5 = ({ formData, onCreate, onBack, onCancel, onComplete }) => {
  const [isChecked, setIsChecked] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showToast, setShowToast] = useState({
    show: false,
    message: "",
    type: "",
  });
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [imageUrls, setImageUrls] = useState({});

  // [New] Pre-fetch images for PDF to avoid "invalid extension" and CORS issues in react-pdf
  React.useEffect(() => {
    const fetchImages = async () => {
      const urls = {};
      const pathsToFetch = [];

      // Add Sample Image
      const sampleImg =
        formData.sampleImage ||
        (formData.details && formData.details.sampleImage);
      if (
        sampleImg &&
        typeof sampleImg === "string" &&
        sampleImg.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
      ) {
        pathsToFetch.push(sampleImg);
      }

      // Add Attachments
      if (formData.attachments && Array.isArray(formData.attachments)) {
        formData.attachments.forEach((path) => {
          if (
            typeof path === "string" &&
            path.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
          ) {
            pathsToFetch.push(path);
          }
        });
      }

      if (pathsToFetch.length === 0) return;

      await Promise.all(
        pathsToFetch.map(async (path) => {
          try {
            // 1. Fetch Blob
            const res = await fetch(`${path}`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const blob = await res.blob();

            // 2. Load into Image to allow Canvas conversion (normalizes formats like WebP/Gif -> PNG)
            const img = new Image();
            const blobUrl = URL.createObjectURL(blob);
            img.src = blobUrl;

            await new Promise((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = (e) => reject(e);
            });

            // 3. Draw to Canvas and Export as PNG
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            // 4. Get PNG Blob
            const pngBlob = await new Promise((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );

            // 5. Create Object URL for the PNG
            const pngUrl = URL.createObjectURL(pngBlob);
            urls[path] = pngUrl; // Mapped to original path

            // Cleanup temp url
            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            console.error(`Error processing image ${path}:`, err);
          }
        }),
      );

      setImageUrls(urls);
    };

    fetchImages();

    // Cleanup URL objects on unmount
    return () => {
      // We can't easily iterate values here to revoke, relying on page refresh/GC is acceptable for now
      // or we could store them in a ref to clear.
      // Ideally:
      // Object.values(urls).forEach(url => URL.revokeObjectURL(url));
      // But urls is local. We'd need to use state.
    };
  }, [formData]);

  const handleCreateClick = () => {
    if (!isChecked) {
      triggerToast("Please verify the information before submitting.", "error");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmCreate = async () => {
    setShowConfirmModal(false);
    setIsCreating(true);
    const result = await onCreate();
    setIsCreating(false);

    if (result.success) {
      triggerToast("Project Created Successfully!", "success");
      // Wait for toast to be visible before navigating
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);
    } else {
      triggerToast(result.message || "Failed to create project", "error");
    }
  };

  const handleDownloadClick = () => {
    if (!isChecked) {
      triggerToast(
        "Please verify the information before downloading.",
        "error",
      );
    }
  };

  const triggerToast = (message, type = "success") => {
    setShowToast({ show: true, message, type });
    setIsFadingOut(false);
    setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        setShowToast({ show: false, message: "", type: "" });
        setIsFadingOut(false);
      }, 500); // Wait for fade out
    }, 4500);
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
      {/* Toast Notification */}
      {showToast.show && (
        <div
          className={`toast-message ${showToast.type} ${
            isFadingOut ? "fading-out" : ""
          }`}
        >
          {showToast.type === "success" ? <CheckIcon /> : null}
          {showToast.message}
        </div>
      )}

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
          </div>
        </div>

        {/* Scope & Items */}
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

        {/* Risk Assessment (Step 4) */}
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
              <div className="review-value">
                {formData.uncontrollableFactors &&
                formData.uncontrollableFactors.length > 0
                  ? formData.uncontrollableFactors.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          marginBottom: 4,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          className="badge-pink"
                          style={{ fontSize: "0.7rem" }}
                        >
                          High Priority
                        </span>
                        <span>{f.description}</span>
                      </div>
                    ))
                  : "None"}
              </div>
            </div>
            <div
              className="review-item"
              style={{ gridColumn: "1 / -1", marginTop: 10 }}
            >
              <label>Production Risks</label>
              <div
                className="review-value"
                style={{ fontSize: "0.9rem", color: "#64748B" }}
              >
                {formData.productionRisks && formData.productionRisks.length > 0
                  ? formData.productionRisks.map((r, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        • {r.description}{" "}
                        <span
                          style={{ fontStyle: "italic", fontSize: "0.8rem" }}
                        >
                          (Preventive: {r.preventive || "N/A"})
                        </span>
                      </div>
                    ))
                  : "None"}
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

      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={handleConfirmCreate}
        onCancel={() => setShowConfirmModal(false)}
        title="Confirm Project Creation"
        message={`Are you sure you want to create the project "${formData.projectName}"? It will be assigned to ${formData.lead?.label || "the selected Lead"} for approval.`}
        confirmText="Yes, Create Project"
        cancelText="Cancel"
      />
    </div>
  );
};

export default Step5;
