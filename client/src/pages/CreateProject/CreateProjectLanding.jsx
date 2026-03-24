import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./CreateProjectLanding.css";

const CreateProjectLanding = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState(null);

  const handleSelection = (type) => {
    setSelectedType(type);

    // Slight delay for visual feedback if we add animation later
    setTimeout(() => {
      if (type === "Quote") {
        navigate("/create/quote");
      } else {
        // Standard or Emergency (Front Desk Flow -> New Order Form)
        navigate("/new-orders/form", {
          state: {
            projectType: type,
            priority: type === "Emergency" ? "Urgent" : "Normal",
          },
        });
      }
    }, 100);
  };

  return (
    <div className="create-project-landing-container">
      <h1 className="create-project-landing-title">
        Select Project Type
      </h1>

      <div className="project-type-grid">
        {/* Standard Project */}
        <div
          className="project-type-card standard"
          onClick={() => handleSelection("Standard")}
        >
          <div className="project-type-icon">📋</div>
          <h2>Standard Job</h2>
          <p>
            Regular production orders. Uses the standard project workflow.
          </p>
          <div className="project-type-footer">
            Priority: Normal
          </div>
        </div>

        {/* Emergency Project */}
        <div
          className="project-type-card emergency"
          onClick={() => handleSelection("Emergency")}
        >
          <div className="project-type-icon">🔥</div>
          <h2>Emergency Job</h2>
          <p>
            Urgent requests requiring immediate attention. Flagged as High
            Priority.
          </p>
          <div className="project-type-footer">
            Priority: Urgent
          </div>
        </div>

        {/* Quote Project */}
        <div
          className="project-type-card quote"
          onClick={() => handleSelection("Quote")}
        >
          <div className="project-type-icon">💬</div>
          <h2>Quote Request</h2>
          <p>
            Generate a detailed quote with specifications, checklists, and
            approvals.
          </p>
          <div className="project-type-footer">
            Type: Quote
          </div>
        </div>

        {/* Corporate Job Project */}
        <div
          className="project-type-card corporate"
          onClick={() => handleSelection("Corporate Job")}
        >
          <div className="project-type-icon">🏢</div>
          <h2>Corporate Job</h2>
          <p>
            High-volume orders for corporate clients. Specialized handling flow.
          </p>
          <div className="project-type-footer">
            Priority: Normal
          </div>
        </div>
      </div>

    </div>
  );
};

export default CreateProjectLanding;
