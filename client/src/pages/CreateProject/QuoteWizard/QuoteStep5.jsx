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
      <div
        className="step-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <button
          className="back-btn"
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <BackArrow />
        </button>
        <h1
          className="header-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: "700",
            color: "var(--text-primary)",
          }}
        >
          Review Details
        </h1>
        <button
          className="cancel-btn"
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        <ProgressBar currentStep={5} totalSteps={5} />

        <div className="page-title-section" style={{ marginBottom: "2rem" }}>
          <h2
            className="page-title"
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              color: "var(--text-primary)",
            }}
          >
            Final Project Review
          </h2>
          <p className="page-subtitle" style={{ color: "#64748b" }}>
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

        <div
          className="form-body"
          style={{
            background: "var(--bg-card)",
            padding: "2rem",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
          }}
        >
          {/* Summary Sections */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2rem",
            }}
          >
            <section>
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: "700",
                  color: "#3b82f6",
                  marginBottom: "1rem",
                  textTransform: "uppercase",
                }}
              >
                General Information
              </h3>
              <div
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
              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: "700",
                  color: "#3b82f6",
                  marginBottom: "1rem",
                  textTransform: "uppercase",
                }}
              >
                Departments
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {(formData.departments || []).map((dept) => (
                  <span
                    key={dept}
                    style={{
                      padding: "0.25rem 0.75rem",
                      background: "rgba(59, 130, 246, 0.1)",
                      borderRadius: "20px",
                      color: "#3b82f6",
                      fontSize: "0.8rem",
                      fontWeight: "600",
                    }}
                  >
                    {dept.replace("-", " ").toUpperCase()}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <div
            className="divider"
            style={{
              borderBottom: "1px solid var(--border-color)",
              margin: "2rem 0",
              opacity: 0.5,
            }}
          ></div>

          <section>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "#3b82f6",
                marginBottom: "1rem",
                textTransform: "uppercase",
              }}
            >
              Items List
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    borderBottom: "2px solid var(--border-color)",
                  }}
                >
                  <th style={{ padding: "0.5rem", color: "#64748b" }}>
                    Description
                  </th>
                  <th style={{ padding: "0.5rem", color: "#64748b" }}>Qty</th>
                  <th style={{ padding: "0.5rem", color: "#64748b" }}>
                    Breakdown
                  </th>
                </tr>
              </thead>
              <tbody>
                {(formData.items || []).map((item, idx) => (
                  <tr
                    key={idx}
                    style={{ borderBottom: "1px solid var(--border-color)" }}
                  >
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      {item.description}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{item.qty}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      {item.breakdown}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div
            className="divider"
            style={{
              borderBottom: "1px solid var(--border-color)",
              margin: "2rem 0",
              opacity: 0.5,
            }}
          ></div>

          <section>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: "700",
                color: "#3b82f6",
                marginBottom: "1rem",
                textTransform: "uppercase",
              }}
            >
              Risk Factors
            </h3>
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

      <div
        className="step-footer"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "2rem",
          padding: "1.5rem 0",
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <button
          className="back-text-btn"
          onClick={onBack}
          disabled={isSubmitting}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            fontWeight: "600",
            cursor: "pointer",
            opacity: isSubmitting ? 0.5 : 1,
          }}
        >
          Back
        </button>
        <button
          className="submit-btn"
          onClick={handleFinish}
          disabled={isSubmitting}
          style={{
            background: "var(--primary-color)",
            color: "white",
            padding: "0.75rem 2rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: "700",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            boxShadow: "0 4px 6px -1px rgba(59, 130, 246, 0.2)",
            minWidth: "160px",
            justifyContent: "center",
          }}
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
