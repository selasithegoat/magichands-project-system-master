import React from "react";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import TextArea from "../../../components/ui/TextArea";
import BackArrow from "../../../components/icons/BackArrow";
import TrashIcon from "../../../components/icons/TrashIcon";
import PlusCircleIcon from "../../../components/icons/PlusCircleIcon";
import WarningIcon from "../../../components/icons/WarningIcon";
import RobotArmIcon from "../../../components/icons/RobotArmIcon";
import ProgressBar from "../../../components/ui/ProgressBar";

const QuoteStep4 = ({ formData, setFormData, onNext, onBack, onCancel }) => {
  const responsibleOptions = [
    { label: "Sarah Jenkins", value: "sarah" },
    { label: "Mike Ross", value: "mike" },
  ];

  const statusOptions = [
    { label: "Identified", value: "identified" },
    { label: "Resolved", value: "resolved" },
  ];

  const addUncontrollable = () => {
    const newId = Date.now();
    const currentFactors = formData.uncontrollableFactors || [];
    setFormData({
      uncontrollableFactors: [
        ...currentFactors,
        { id: newId, description: "", responsible: null, status: null },
      ],
    });
  };

  const removeUncontrollable = (id) => {
    const currentFactors = formData.uncontrollableFactors || [];
    setFormData({
      uncontrollableFactors: currentFactors.filter((item) => item.id !== id),
    });
  };

  const updateUncontrollable = (id, field, value) => {
    const currentFactors = formData.uncontrollableFactors || [];
    setFormData({
      uncontrollableFactors: currentFactors.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    });
  };

  const addRisk = () => {
    const newId = Date.now();
    const currentRisks = formData.productionRisks || [];
    setFormData({
      productionRisks: [
        ...currentRisks,
        { id: newId, description: "", preventive: "" },
      ],
    });
  };

  const removeRisk = (id) => {
    const currentRisks = formData.productionRisks || [];
    setFormData({
      productionRisks: currentRisks.filter((item) => item.id !== id),
    });
  };

  const updateRisk = (id, field, value) => {
    const currentRisks = formData.productionRisks || [];
    setFormData({
      productionRisks: currentRisks.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    });
  };

  const uncontrollableFactors = formData.uncontrollableFactors || [];
  const productionRisks = formData.productionRisks || [];

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
          Risk Assessment
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
        <ProgressBar currentStep={4} totalSteps={5} />

        <div className="page-title-section" style={{ marginBottom: "2rem" }}>
          <h2
            className="page-title"
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              color: "var(--text-primary)",
            }}
          >
            Risk Assessment
          </h2>
          <p className="page-subtitle" style={{ color: "#64748b" }}>
            Identify potential risks and assign responsibilities.
          </p>
        </div>

        <div className="risk-section" style={{ marginBottom: "3rem" }}>
          <div
            className="risk-section-header"
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            <WarningIcon />
            <div>
              <h3
                className="risk-section-title"
                style={{
                  fontSize: "1.1rem",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                }}
              >
                Uncontrollable Factors
              </h3>
              <p
                className="risk-section-subtitle"
                style={{ color: "#64748b", fontSize: "0.9rem" }}
              >
                High-priority tasks impacting timeline
              </p>
            </div>
          </div>

          <div
            className="risk-list"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {uncontrollableFactors.map((item) => (
              <div
                key={item.id}
                className="risk-card"
                style={{
                  padding: "1.5rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                }}
              >
                <div
                  className="risk-card-header"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      background: "#fee2e2",
                      color: "#ef4444",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "20px",
                      fontSize: "0.8rem",
                      fontWeight: "700",
                    }}
                  >
                    High Priority
                  </div>
                  <button
                    className="delete-btn"
                    onClick={() => removeUncontrollable(item.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <Input
                    label="Factor Description"
                    value={item.description}
                    onChange={(e) =>
                      updateUncontrollable(
                        item.id,
                        "description",
                        e.target.value,
                      )
                    }
                  />
                </div>

                <div
                  className="form-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <Select
                    label="Responsible"
                    options={responsibleOptions}
                    value={item.responsible}
                    onChange={(val) =>
                      updateUncontrollable(item.id, "responsible", val)
                    }
                  />
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={item.status}
                    onChange={(val) =>
                      updateUncontrollable(item.id, "status", val)
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            className="add-risk-btn"
            onClick={addUncontrollable}
            style={{
              background: "none",
              border: "1px dashed #3b82f6",
              color: "#3b82f6",
              width: "100%",
              padding: "1rem",
              borderRadius: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              fontWeight: "600",
              marginTop: "1rem",
            }}
          >
            <PlusCircleIcon /> Add Factor
          </button>
        </div>

        <div className="risk-section">
          <div
            className="risk-section-header"
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            <RobotArmIcon />
            <div>
              <h3
                className="risk-section-title"
                style={{
                  fontSize: "1.1rem",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                }}
              >
                Production Risk Factors
              </h3>
              <p
                className="risk-section-subtitle"
                style={{ color: "#64748b", fontSize: "0.9rem" }}
              >
                Pre-production hazards & preventive measures
              </p>
            </div>
          </div>

          <div
            className="risk-list"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {productionRisks.map((item, index) => (
              <div
                key={item.id}
                className="risk-card"
                style={{
                  padding: "1.5rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                }}
              >
                <div
                  className="risk-card-header"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                  }}
                >
                  <span
                    style={{ fontWeight: "700", color: "var(--text-primary)" }}
                  >
                    Risk #{index + 1}
                  </span>
                  <button
                    className="delete-btn"
                    onClick={() => removeRisk(item.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <TextArea
                    label="Risk Description"
                    value={item.description}
                    onChange={(e) =>
                      updateRisk(item.id, "description", e.target.value)
                    }
                  />
                </div>

                <div>
                  <TextArea
                    label="Preventive Measure"
                    value={item.preventive}
                    onChange={(e) =>
                      updateRisk(item.id, "preventive", e.target.value)
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            className="add-risk-btn"
            onClick={addRisk}
            style={{
              background: "none",
              border: "1px dashed #3b82f6",
              color: "#3b82f6",
              width: "100%",
              padding: "1rem",
              borderRadius: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              fontWeight: "600",
              marginTop: "1rem",
            }}
          >
            <PlusCircleIcon /> Add Risk
          </button>
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
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Back
        </button>
        <button
          className="next-btn"
          onClick={onNext}
          style={{
            background: "var(--primary-color)",
            color: "white",
            padding: "0.75rem 2rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          Next Step
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

export default QuoteStep4;
