import React, { useState } from "react";
import ProgressBar from "../../../components/ui/ProgressBar";
import BackArrow from "../../../components/icons/BackArrow";
import Spinner from "../../../components/ui/Spinner";

const QuoteStep5 = ({ formData, onCreate, onBack, onCancel, onComplete }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleFinish = async () => {
    setIsSubmitting(true);
    setError("");
    const result = await onCreate();
    setIsSubmitting(false);

    if (result.success) {
      onComplete();
    } else {
      setError(result.message || "Something went wrong.");
    }
  };

  return (
    <div className="step-container">
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">Review Details</h1>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        <ProgressBar currentStep={5} totalSteps={5} />

        <div className="page-title-section">
          <h2 className="page-title">Final Project Review</h2>
          <p className="page-subtitle">
            Double check all information before accepting the project.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#ef4444",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
              border: "1px solid #fca5a5",
            }}
          >
            {error}
          </div>
        )}

        <div className="form-body">
          <div className="review-summary-grid">
            <section>
              <h3 className="review-section-title">General Information</h3>
              <div
                className="review-info-list"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <p>
                  <strong style={{ color: "#64748b" }}>Project Name:</strong>{" "}
                  {formData.projectName}
                </p>
                <p>
                  <strong style={{ color: "#64748b" }}>Client:</strong>{" "}
                  {formData.client}
                </p>
                <p>
                  <strong style={{ color: "#64748b" }}>Completion Date:</strong>{" "}
                  {formData.deliveryDate}
                </p>
                <p>
                  <strong style={{ color: "#64748b" }}>Received Time:</strong>{" "}
                  {formData.receivedTime}
                </p>
              </div>
            </section>

            <section>
              <h3 className="review-section-title">Departments</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {(formData.departments || []).map((dept) => (
                  <span key={dept} className="badge">
                    {dept.replace("-", " ").toUpperCase()}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <div className="divider"></div>

          <section>
            <h3 className="review-section-title">Items List</h3>
            <table className="review-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {(formData.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.description}</td>
                    <td>{item.qty}</td>
                    <td>{item.breakdown}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="divider"></div>

          <section>
            <h3 className="review-section-title">Risk Factors</h3>
            <p>
              <strong style={{ color: "#64748b" }}>
                Uncontrollable Factors:
              </strong>{" "}
              {(formData.uncontrollableFactors || []).length}
            </p>
            <p>
              <strong style={{ color: "#64748b" }}>Production Risks:</strong>{" "}
              {(formData.productionRisks || []).length}
            </p>
          </section>
        </div>
      </div>

      <div className="step-footer">
        <button
          className="back-text-btn"
          onClick={onBack}
          disabled={isSubmitting}
        >
          Back
        </button>
        <button
          className="submit-btn"
          onClick={handleFinish}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Spinner size="small" /> Processing...
            </>
          ) : (
            "Accept Project"
          )}
        </button>
      </div>
    </div>
  );
};

export default QuoteStep5;
