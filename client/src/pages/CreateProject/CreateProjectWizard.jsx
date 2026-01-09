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
  const [currentStep, setCurrentStep] = useState(1);
  const [showCancelModal, setShowCancelModal] = useState(false);

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
    setShowCancelModal(false);
    navigate("/"); // Go back to dashboard
  };

  return (
    <>
      {currentStep === 1 && (
        <Step1 onNext={handleNext} onCancel={handleCancelProject} />
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
