import React, { useState } from "react";
import Input from "../ui/Input";
import Select from "../ui/Select";
import TextArea from "../ui/TextArea";
import BackArrow from "../icons/BackArrow";
import TrashIcon from "../icons/TrashIcon";
import PlusCircleIcon from "../icons/PlusCircleIcon";
import WarningIcon from "../icons/WarningIcon";
import RobotArmIcon from "../icons/RobotArmIcon";
import "./Step4.css";
import ProgressBar from "../ui/ProgressBar";

const Step4 = ({ onNext, onBack }) => {
  const [uncontrollableFactors, setUncontrollableFactors] = useState([
    {
      id: 1,
      description: "Supplier Delay on Raw Material X",
      responsible: { label: "Sarah Jenkins", value: "sarah" },
      status: { label: "Identified", value: "identified" },
    },
  ]);

  const [productionRisks, setProductionRisks] = useState([
    {
      id: 1,
      description: "Possible color mismatch on batch 2 dye.",
      preventive: "Double check pantone reference before mixing.",
    },
  ]);

  const responsibleOptions = [
    { label: "Sarah Jenkins", value: "sarah" },
    { label: "Mike Ross", value: "mike" },
  ];

  const statusOptions = [
    { label: "Identified", value: "identified" },
    { label: "Resolved", value: "resolved" },
  ];

  // Logic for Uncontrollable Factors
  const addUncontrollable = () => {
    const newId = Date.now();
    setUncontrollableFactors([
      ...uncontrollableFactors,
      { id: newId, description: "", responsible: null, status: null },
    ]);
  };

  const removeUncontrollable = (id) => {
    setUncontrollableFactors(
      uncontrollableFactors.filter((item) => item.id !== id)
    );
  };

  const updateUncontrollable = (id, field, value) => {
    setUncontrollableFactors(
      uncontrollableFactors.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  // Logic for Production Risks
  const addRisk = () => {
    const newId = Date.now();
    setProductionRisks([
      ...productionRisks,
      { id: newId, description: "", preventive: "" },
    ]);
  };

  const removeRisk = (id) => {
    setProductionRisks(productionRisks.filter((item) => item.id !== id));
  };

  const updateRisk = (id, field, value) => {
    setProductionRisks(
      productionRisks.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  return (
    <div className="step-container">
      {/* Header */}
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">New Project</h1>
        <div style={{ width: 24 }}></div>
      </div>

      <div className="step-scrollable-content">
        {/* Progress Bar */}
        <ProgressBar currentStep={4} />

        {/* Title */}
        <div className="page-title-section">
          <h2 className="page-title">Risk Assessment</h2>
          <p className="page-subtitle">
            Identify potential risks and assign responsibilities before
            proceeding to production.
          </p>
        </div>

        {/* Section 1: Uncontrollable Factors */}
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

          <div className="risk-list">
            {uncontrollableFactors.map((item) => (
              <div key={item.id} className="risk-card">
                <div className="risk-card-header">
                  <div className="badge-high">High Priority</div>
                  <button
                    className="delete-btn"
                    onClick={() => removeUncontrollable(item.id)}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div className="form-group">
                  <Input
                    label="Factor Description"
                    value={item.description}
                    onChange={(e) =>
                      updateUncontrollable(
                        item.id,
                        "description",
                        e.target.value
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

        {/* Section 2: Production Risk Factors */}
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
                  <span className="risk-number">Risk #{index + 1}</span>
                  <button
                    className="delete-btn"
                    onClick={() => removeRisk(item.id)}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <TextArea
                    label="Risk Description"
                    value={item.description}
                    onChange={(e) =>
                      updateRisk(item.id, "description", e.target.value)
                    }
                  />
                </div>

                <div className="form-group">
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

      {/* Footer */}
      <div className="step-footer footer-split">
        <button className="back-text-btn" onClick={onBack}>
          Back
        </button>
        <button className="next-btn-small" onClick={onNext}>
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

export default Step4;
