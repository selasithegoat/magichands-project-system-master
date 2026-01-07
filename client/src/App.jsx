import React, { useState } from "react";
import Step1 from "./components/CreateProject/Step1";
import Step2 from "./components/CreateProject/Step2";
import Step3 from "./components/CreateProject/Step3";
import Step4 from "./components/CreateProject/Step4";
import Step5 from "./components/CreateProject/Step5";
import ProjectDetail from "./components/ProjectDetail/ProjectDetail";

function App() {
  const [view, setView] = useState("detail"); // 'create' or 'detail'
  const [currentStep, setCurrentStep] = useState(1);

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const toggleView = () => {
    setView((prev) => (prev === "create" ? "detail" : "create"));
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
          Switch View ({view === "create" ? "Show Detail" : "Show Create"})
        </button>
      </div>

      {view === "detail" ? (
        <ProjectDetail />
      ) : (
        <>
          {currentStep === 1 && <Step1 onNext={handleNext} />}
          {currentStep === 2 && (
            <Step2 onNext={handleNext} onBack={handleBack} />
          )}
          {currentStep === 3 && (
            <Step3 onNext={handleNext} onBack={handleBack} />
          )}
          {currentStep === 4 && (
            <Step4 onNext={handleNext} onBack={handleBack} />
          )}
          {currentStep === 5 && <Step5 onBack={handleBack} />}
        </>
      )}
    </>
  );
}

export default App;
