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
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">Risk Assessment</h1>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        <ProgressBar currentStep={4} totalSteps={5} />

        <div className="page-title-section">
          <h2 className="page-title">Risk Assessment</h2>
          <p className="page-subtitle">
            Identify potential risks and assign responsibilities.
          </p>
        </div>

        <div className="risk-section">
          <div className="risk-section-header">
            <WarningIcon />
            <div>
              <h3 className="risk-section-title">Uncontrollable Factors</h3>
              <p className="risk-section-subtitle">
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
                <div className="risk-card-header">
                  <div className="risk-priority-badge">High Priority</div>
                  <button
                    className="delete-btn"
                    onClick={() => removeUncontrollable(item.id)}
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

                <div className="form-row">
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

          <button className="add-risk-btn" onClick={addUncontrollable}>
            <PlusCircleIcon /> Add Factor
          </button>
        </div>

        <div className="risk-section">
          <div className="risk-section-header">
            <RobotArmIcon />
            <div>
              <h3 className="risk-section-title">Production Risk Factors</h3>
              <p className="risk-section-subtitle">
                Pre-production hazards & preventive measures
              </p>
            </div>
          </div>

          <div className="risk-list">
            {productionRisks.map((item, index) => (
              <div key={item.id} className="risk-card">
                <div className="risk-card-header">
                  <span className="risk-title">Risk #{index + 1}</span>
                  <button
                    className="delete-btn"
                    onClick={() => removeRisk(item.id)}
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

          <button className="add-risk-btn" onClick={addRisk}>
            <PlusCircleIcon /> Add Risk
          </button>
        </div>
      </div>

      <div
        className="step-footer"
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "2rem",
          padding: "1.5rem 0",
          borderTop: "1px solid var(--border-color)",
          gap: "1.5rem",
        }}
      >
        <button className="back-text-btn" onClick={onBack}>
          Back
        </button>
        <button className="next-btn" onClick={onNext}>
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
