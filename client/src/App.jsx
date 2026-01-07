import React, { useState } from "react";
import Step1 from "./pages/CreateProject/Step1";
import Step2 from "./pages/CreateProject/Step2";
import Step3 from "./pages/CreateProject/Step3";
import Step4 from "./pages/CreateProject/Step4";
import Dashboard from "./pages/Dashboard/Dashboard";
import Step5 from "./pages/CreateProject/Step5";
import ConfirmationModal from "./components/ui/ConfirmationModal";

function App() {
  const [view, setView] = useState("dashboard"); // 'dashboard', 'create', 'detail'
  const [currentStep, setCurrentStep] = useState(1);

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleCancelProject = () => {
    setShowCancelModal(true);
  };

  const confirmCancel = () => {
    setShowCancelModal(false);
    setView("dashboard");
    setCurrentStep(1); // Reset form
  };

  const toggleView = () => {
    // Simple cycler for demo purposes: Dashboard -> Detail -> Create -> Dashboard
    setView((prev) => {
      if (prev === "dashboard") return "detail";
      if (prev === "detail") return "create";
      return "dashboard";
    });
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          zIndex: 9999,
        }}
      >
        <button
          onClick={toggleView}
          style={{
            padding: "0.5rem 1rem",
            background: "#333",
            color: "#fff",
            borderRadius: "4px",
          }}
        >
          Switch View (
          {view === "dashboard"
            ? "Show Detail"
            : view === "detail"
            ? "Show Create"
            : "Show Dashboard"}
          )
        </button>
      </div>

      {view === "dashboard" ? (
        <Dashboard
          onNavigateProject={() => setView("detail")}
          onCreateProject={() => setView("create")}
        />
      ) : view === "detail" ? (
        <ProjectDetail />
      ) : (
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
        </>
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
}

export default App;
