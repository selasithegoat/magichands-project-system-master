import React from "react";
import CheckIcon from "../icons/CheckIcon";
import "./ProgressBar.css";

const ProgressBar = ({ currentStep, totalSteps = 5 }) => {
  // Create an array for the steps: [1, 2, 3, 4, 5]
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className="stepper-section">
      <div className="stepper-container">
        {steps.map((step, index) => {
          const isLastItem = index === steps.length - 1;
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;

          return (
            <React.Fragment key={step}>
              {/* Circle */}
              {isCompleted ? (
                <div className="step-circle completed">
                  <CheckIcon />
                </div>
              ) : isActive ? (
                <div className="step-circle active">{step}</div>
              ) : (
                <div className="step-circle">{step}</div>
              )}

              {/* Line (except after the last item) */}
              {!isLastItem && (
                <div
                  className={`stepper-horizontal-line ${
                    step < currentStep ? "completed" : ""
                  }`}
                ></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="progress-text-center">
        <span className="step-indicator">
          Step {currentStep} of {totalSteps}
        </span>
      </div>
    </div>
  );
};

export default ProgressBar;
