import React, { useState } from "react";
import Step1 from "./components/CreateProject/Step1";
import Step2 from "./components/CreateProject/Step2";
import Step3 from "./components/CreateProject/Step3";

function App() {
  const [currentStep, setCurrentStep] = useState(1);

  const handleNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  return (
    <>
      {currentStep === 1 && <Step1 onNext={handleNext} />}
      {currentStep === 2 && <Step2 onNext={handleNext} onBack={handleBack} />}
      {currentStep === 3 && <Step3 onNext={handleNext} onBack={handleBack} />}
    </>
  );
}

export default App;
