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
import ConfirmationModal from "../../../components/ui/ConfirmationModal";
import {
  mergeProductionRiskSuggestions,
  requestProductionRiskSuggestions,
} from "../../../utils/productionRiskAi";
import ProductionRiskSuggestionModal from "../../../components/features/ProductionRiskSuggestionModal";

const QuoteStep4 = ({ formData, setFormData, onNext, onBack, onCancel }) => {
  const [showRiskModal, setShowRiskModal] = React.useState(false);
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [isApplyingAiSuggestions, setIsApplyingAiSuggestions] =
    React.useState(false);
  const [showAiReviewModal, setShowAiReviewModal] = React.useState(false);
  const [pendingAiSuggestions, setPendingAiSuggestions] = React.useState([]);
  const [aiNotice, setAiNotice] = React.useState(null);
  const responsibleOptions = [
    { label: "Magic Hands", value: "MH" },
    { label: "Client", value: "Client" },
    { label: "3rd Party", value: "3rd Party" },
  ];

  const statusOptions = [
    { label: "Pending", value: "Pending" },
    { label: "Resolved", value: "Resolved" },
    { label: "Escalated", value: "Escalated" },
  ];

  const addUncontrollable = () => {
    const newId = Date.now();
    const currentFactors = formData.uncontrollableFactors || [];
    setFormData({
      uncontrollableFactors: [
        ...currentFactors,
        {
          id: newId,
          description: "",
          responsible: responsibleOptions[0],
          status: statusOptions[0],
        },
      ],
    });
  };

  const getItemKey = (item, index) => item.id || item._id || index;

  const removeUncontrollable = (id) => {
    const currentFactors = formData.uncontrollableFactors || [];
    setFormData({
      uncontrollableFactors: currentFactors.filter(
        (item, index) => getItemKey(item, index) !== id,
      ),
    });
  };

  const updateUncontrollable = (id, field, value) => {
    const currentFactors = formData.uncontrollableFactors || [];
    setFormData({
      uncontrollableFactors: currentFactors.map((item, index) =>
        getItemKey(item, index) === id ? { ...item, [field]: value } : item,
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
      productionRisks: currentRisks.filter(
        (item, index) => getItemKey(item, index) !== id,
      ),
    });
  };

  const updateRisk = (id, field, value) => {
    const currentRisks = formData.productionRisks || [];
    setFormData({
      productionRisks: currentRisks.map((item, index) =>
        getItemKey(item, index) === id ? { ...item, [field]: value } : item,
      ),
    });
  };

  const uncontrollableFactors = formData.uncontrollableFactors || [];
  const productionRisks = formData.productionRisks || [];
  const hasValidProductionRisk = productionRisks.some(
    (risk) =>
      (risk.description && risk.description.trim()) ||
      (risk.preventive && risk.preventive.trim()),
  );

  const handleNextStep = () => {
    if (!hasValidProductionRisk) {
      setShowRiskModal(true);
      return;
    }
    onNext();
  };

  const handleMagicAiAssistance = async () => {
    if (isAiLoading) return;

    setIsAiLoading(true);
    setAiNotice(null);

    try {
      const suggestions = await requestProductionRiskSuggestions(formData);
      const { addedCount, addedSuggestions } = mergeProductionRiskSuggestions(
        formData.productionRisks || [],
        suggestions,
      );

      if (addedCount === 0) {
        setAiNotice({
          type: "info",
          text: "No new suggestions were added. Add more project details and try again.",
        });
        return;
      }

      setPendingAiSuggestions(addedSuggestions);
      setShowAiReviewModal(true);
    } catch (error) {
      setAiNotice({
        type: "error",
        text: error.message || "Magic AI Assistance failed. Please try again.",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyAiSuggestions = async (selectedSuggestions) => {
    if (!Array.isArray(selectedSuggestions) || selectedSuggestions.length === 0) {
      return;
    }

    setIsApplyingAiSuggestions(true);

    try {
      const { mergedRisks, addedCount } = mergeProductionRiskSuggestions(
        formData.productionRisks || [],
        selectedSuggestions,
      );

      if (addedCount === 0) {
        setAiNotice({
          type: "info",
          text: "No new suggestions were added after review.",
        });
      } else {
        setFormData({ productionRisks: mergedRisks });
        setAiNotice({
          type: "success",
          text: `Added ${addedCount} reviewed suggestion${addedCount === 1 ? "" : "s"} to Production Risks.`,
        });
      }
    } finally {
      setIsApplyingAiSuggestions(false);
      setShowAiReviewModal(false);
      setPendingAiSuggestions([]);
    }
  };

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
            {uncontrollableFactors.map((item, index) => {
              const factorId = getItemKey(item, index);
              return (
              <div
                key={factorId}
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
                    onClick={() => removeUncontrollable(factorId)}
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
                        factorId,
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
                      updateUncontrollable(factorId, "responsible", val)
                    }
                  />
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={item.status}
                    onChange={(val) =>
                      updateUncontrollable(factorId, "status", val)
                    }
                  />
                </div>
              </div>
            )})}
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

          <div className="magic-ai-actions">
            <button
              type="button"
              className="magic-ai-btn"
              onClick={handleMagicAiAssistance}
              disabled={isAiLoading}
            >
              <RobotArmIcon />
              {isAiLoading ? "Generating Suggestions..." : "Magic AI Assistance"}
            </button>
            {aiNotice && (
              <p className={`magic-ai-notice ${aiNotice.type}`}>{aiNotice.text}</p>
            )}
          </div>

          <div className="risk-list">
            {productionRisks.map((item, index) => {
              const riskId = getItemKey(item, index);
              return (
              <div key={riskId} className="risk-card">
                <div className="risk-card-header">
                  <span className="risk-title">Risk #{index + 1}</span>
                  <button
                    className="delete-btn"
                    onClick={() => removeRisk(riskId)}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <TextArea
                    label="Risk Description"
                    value={item.description}
                    onChange={(e) =>
                      updateRisk(riskId, "description", e.target.value)
                    }
                  />
                </div>

                <div>
                  <TextArea
                    label="Preventive Measure"
                    value={item.preventive}
                    onChange={(e) =>
                      updateRisk(riskId, "preventive", e.target.value)
                    }
                  />
                </div>
              </div>
            )})}
          </div>

          <button className="add-risk-btn" onClick={addRisk}>
            <PlusCircleIcon /> Add Risk
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showRiskModal}
        title="Production Risk Required"
        message="Please add at least one Production Risk before proceeding to the next step."
        confirmText="OK"
        cancelText="Close"
        onConfirm={() => setShowRiskModal(false)}
        onCancel={() => setShowRiskModal(false)}
      />
      <ProductionRiskSuggestionModal
        isOpen={showAiReviewModal}
        title="Review before add"
        suggestions={pendingAiSuggestions}
        onClose={() => {
          if (isApplyingAiSuggestions) return;
          setShowAiReviewModal(false);
          setPendingAiSuggestions([]);
        }}
        onConfirm={handleApplyAiSuggestions}
        isApplying={isApplyingAiSuggestions}
      />

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
        <button className="next-btn" onClick={handleNextStep}>
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
