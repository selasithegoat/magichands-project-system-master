import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Step1 from "./Step1";
import Step2 from "./Step2";
import Step3 from "./Step3";
import Step4 from "./Step4";
import Step5 from "./Step5";
import ConfirmationModal from "../../components/ui/ConfirmationModal";

const CreateProjectWizard = () => {
  const navigate = useNavigate();

  // Load initial state from localStorage or default
  const getInitialState = () => {
    const saved = localStorage.getItem("projectWizardData");
    if (saved) {
      return JSON.parse(saved);
    }
    return {
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
      },
    };
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
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 3 && (
        <Step3
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 4 && (
        <Step4
          onNext={handleNext}
          onBack={handleBack}
          onCancel={handleCancelProject}
        />
      )}
      {currentStep === 5 && (
        <Step5 onBack={handleBack} onCancel={handleCancelProject} />
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
