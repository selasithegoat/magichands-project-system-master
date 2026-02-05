import React from "react";
import CheckIcon from "../../components/icons/CheckIcon";
import UserAvatar from "../../components/ui/UserAvatar";
import "./ProjectExecution.css";

const steps = [
  {
    id: 1,
    title: "Order Confirmed",
    date: "Oct 20, 09:30",
    status: "completed",
    completedBy: "Sarah J.",
    avatar: "S",
  },
  {
    id: 2,
    title: "Resource Allocation",
    date: "Oct 21, 14:15",
    status: "completed",
    completedBy: "Mike T.",
    avatar: "M",
    tag: "MT",
  },
  {
    id: 3,
    title: "Production Briefing",
    date: "Oct 21, 16:00",
    status: "completed",
    completedBy: "Sarah J.",
    avatar: "S",
    note: "Registered in notebook",
  },
  {
    id: 4,
    title: "Material Preparation",
    date: "Oct 22, 10:45",
    status: "completed",
    completedBy: "Warehouse Team",
    tag: "WT",
  },
  {
    id: 5,
    title: "Assembly & Production",
    status: "active",
    description:
      "Booth shell scheme assembly and initial LED wall configuration in warehouse.",
    action: "Mark Complete",
  },
  {
    id: 6,
    title: "Quality Assurance",
    status: "pending",
    description: "Pending production completion",
  },
  {
    id: 7,
    title: "Out for Delivery",
    status: "pending",
    form: {
      label: "DELIVERY PERSON",
      placeholder: "Enter name or ID",
      button: "Save",
    },
  },
  {
    id: 8,
    title: "Installation & Handover",
    status: "pending",
    form: {
      label: "NUMBER OF BATCHES",
      placeholder: "0",
      suffix: "items delivered", // lowercase in design
    },
  },
];

const ProjectExecution = () => {
  return (
    <div className="execution-container">
      <div className="timeline">
        {steps.map((step, index) => (
          <TimelineStep
            key={step.id}
            step={step}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

const TimelineStep = ({ step, isLast }) => {
  const isCompleted = step.status === "completed";
  const isActive = step.status === "active";
  const isPending = step.status === "pending";

  return (
    <div
      className={`timeline-step ${step.status} ${isLast ? "last-step" : ""}`}
    >
      {/* Left Indicator Column */}
      <div className="step-indicator-col">
        <div className={`step-icon ${step.status}`}>
          {isCompleted && (
            <CheckIcon className="check-mark primary" width="20" height="20" />
          )}
          {isActive && <div className="active-dot-inner"></div>}
          {isPending && <span>{step.id}</span>}
        </div>
        {!isLast && <div className="step-line"></div>}
      </div>

      {/* Right Content Column */}
      <div
        className={`step-content-col ${isActive ? "active-card-wrapper" : ""}`}
      >
        {isActive ? (
          <div className="active-card">
            <div className="step-header-active">
              <span className="step-label">STEP {step.id}</span>
              <h3 className="step-title-active">{step.title}</h3>
            </div>
            <p className="step-desc-active">{step.description}</p>
            <button className="mark-complete-btn">
              <div className="btn-check-circle">
                <CheckIcon
                  className="check-mark secondary"
                  width="12"
                  height="12"
                />
              </div>
              {step.action}
            </button>
            {/* Background watermark icon if needed, ignoring for now or minimal svg */}
          </div>
        ) : (
          <>
            <div className="step-header-row">
              <div className="step-info">
                <span className="step-label">STEP {step.id}</span>
                <h3
                  className={`step-title ${isCompleted ? "strikethrough" : ""}`}
                >
                  {step.title}
                </h3>
              </div>
              {step.date && <span className="step-date">{step.date}</span>}
            </div>

            {/* Note */}
            {step.note && (
              <div className="step-note-box">
                <div className="note-check">
                  <CheckIcon
                    className="check-mark primary"
                    width="10"
                    height="10"
                  />
                </div>
                <span>{step.note}</span>
              </div>
            )}

            {/* Completed By Pill */}
            {step.completedBy && (
              <div className="completed-by-pill">
                {step.avatar === "S" && (
                  <img
                    src="https://i.pravatar.cc/150?u=sarah"
                    alt="S"
                    className="pill-avatar"
                  />
                )}
                {step.tag && (
                  <div
                    className={`pill-tag ${
                      step.tag === "WT" ? "purple" : "blue"
                    }`}
                  >
                    {step.tag}
                  </div>
                )}
                <span className="pill-text">
                  Completed by {step.completedBy}
                </span>
              </div>
            )}

            {/* Pending Description */}
            {step.description && isPending && (
              <p className="pending-desc">{step.description}</p>
            )}

            {/* Pending Form */}
            {step.form && (
              <div className="pending-form-card">
                <label>{step.form.label}</label>
                <div className="pending-input-row">
                  <input type="text" placeholder={step.form.placeholder} />
                  {step.form.button && (
                    <button className="save-btn">{step.form.button}</button>
                  )}
                  {step.form.suffix && (
                    <span className="input-suffix">{step.form.suffix}</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectExecution;
