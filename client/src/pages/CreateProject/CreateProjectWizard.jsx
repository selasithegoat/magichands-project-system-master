import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Step1 from "./Step1";
import Step2 from "./Step2";
import Step3 from "./Step3";
import Step4 from "./Step4";
import Step5 from "./Step5";
import ConfirmationModal from "../../components/ui/ConfirmationModal";

const CreateProjectWizard = ({ onProjectCreate }) => {
  const navigate = useNavigate();

  const DEFAULT_FORM_STATE = {
    currentStep: 1,
    formData: {
      orderDate: new Date().toISOString().split("T")[0],
      receivedTime: "10:00",
      lead: null,
      projectName: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      deliveryTime: "14:00",
      deliveryLocation: "",
      contactType: "MH",
      supplySource: "in-house",
      departments: [], // Step 2
      items: [], // Step 3
      uncontrollableFactors: [], // Step 4
      productionRisks: [], // Step 4
    },
  };

  // Load initial state from localStorage or default
  const getInitialState = () => {
    const saved = localStorage.getItem("projectWizardData");
    if (saved) {
      return JSON.parse(saved);
    }
    return DEFAULT_FORM_STATE;
  };

  const initialState = getInitialState();
  const [currentStep, setCurrentStep] = useState(initialState.currentStep);
  const [formData, setFormData] = useState(initialState.formData);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Save to localStorage whenever state changes
  React.useEffect(() => {
    localStorage.setItem(
      "projectWizardData",
      JSON.stringify({ currentStep, formData })
    );
  }, [currentStep, formData]);

  const handleUpdateFormData = (updates) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const handleCancelProject = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    localStorage.removeItem("projectWizardData"); // Clear draft
    setShowCancelModal(false);
    navigate("/"); // Go back to dashboard
  };

  const handleCreateProject = async () => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        return { success: true };
      } else {
        const err = await res.json();
        return { success: false, message: err.message };
      }
    } catch (error) {
      console.error("Create Project Error:", error);
      return {
        success: false,
        message: "Something went wrong. Please try again.",
      };
    }
  };

  const handleProjectComplete = () => {
    localStorage.removeItem("projectWizardData");
    // Explicitly reset state to ensure next usage is clean
    setFormData(DEFAULT_FORM_STATE.formData);
    setCurrentStep(1);
    if (onProjectCreate) onProjectCreate(); // Refresh global count
    navigate("/");
  };

  return (
    <>
      {currentStep === 1 && (
        <Step1
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 2 && (
        <Step2
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 3 && (
        <Step3
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 4 && (
        <Step4
          formData={formData}
          setFormData={handleUpdateFormData}
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 5 && (
        <Step5
          formData={formData}
          onCreate={handleCreateProject}
          onBack={handleBack}
          onCancel={handleCancelProject}
          onComplete={handleProjectComplete}
        />
      )}

      <ConfirmationModal
        isOpen={showCancelModal}
        title="Cancel Project?"
        message="Are you sure you want to cancel? All progress will be lost."
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelModal(false)}
      />
    </>
  );
};

export default CreateProjectWizard;
