import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import OrdersList from "../NewOrders/OrdersList";

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
    <div
      className="create-project-landing-container"
      style={{ maxWidth: "1200px", margin: "0 auto" }}
    >
      <h1
        style={{
          textAlign: "center",
          marginBottom: "3rem",
          color: "#333",
          fontSize: "2.5rem",
        }}
      >
        Select Project Type
      </h1>

      <div
        className="project-type-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "2rem",
          justifyItems: "center",
        }}
      >
        {/* Standard Project */}
        <div
          className="project-type-card standard"
          onClick={() => handleSelection("Standard")}
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "2rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
            border: "2px solid transparent",
            width: "100%",
            maxWidth: "350px",
            textAlign: "center",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-5px)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📋</div>
          <h2 style={{ color: "#2c3e50", marginBottom: "1rem" }}>
            Standard Job
          </h2>
          <p style={{ color: "#7f8c8d", lineHeight: "1.5" }}>
            Regular production orders. Uses the standard project workflow.
          </p>
          <div
            style={{
              marginTop: "1.5rem",
              color: "#3498db",
              fontWeight: "bold",
            }}
          >
            Priority: Normal
          </div>
        </div>

        {/* Emergency Project */}
        <div
          className="project-type-card emergency"
          onClick={() => handleSelection("Emergency")}
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "2rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
            border: "2px solid transparent",
            width: "100%",
            maxWidth: "350px",
            textAlign: "center",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-5px)";
            e.currentTarget.style.boxShadow =
              "0 8px 24px rgba(231, 76, 60, 0.2)";
            e.currentTarget.style.border = "2px solid #e74c3c";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
            e.currentTarget.style.border = "2px solid transparent";
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔥</div>
          <h2 style={{ color: "#e74c3c", marginBottom: "1rem" }}>
            Emergency Job
          </h2>
          <p style={{ color: "#7f8c8d", lineHeight: "1.5" }}>
            Urgent requests requiring immediate attention. Flagged as High
            Priority.
          </p>
          <div
            style={{
              marginTop: "1.5rem",
              color: "#e74c3c",
              fontWeight: "bold",
            }}
          >
            Priority: Urgent
          </div>
        </div>

        {/* Quote Project */}
        <div
          className="project-type-card quote"
          onClick={() => handleSelection("Quote")}
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "2rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
            border: "2px solid transparent",
            width: "100%",
            maxWidth: "350px",
            textAlign: "center",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-5px)";
            e.currentTarget.style.boxShadow =
              "0 8px 24px rgba(241, 196, 15, 0.3)";
            e.currentTarget.style.border = "2px solid #f1c40f";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
            e.currentTarget.style.border = "2px solid transparent";
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💬</div>
          <h2 style={{ color: "#f39c12", marginBottom: "1rem" }}>
            Quote Request
          </h2>
          <p style={{ color: "#7f8c8d", lineHeight: "1.5" }}>
            Generate a detailed quote with specifications, checklists, and
            approvals.
          </p>
          <div
            style={{
              marginTop: "1.5rem",
              color: "#f39c12",
              fontWeight: "bold",
            }}
          >
            Type: Quote
          </div>
        </div>

        {/* Corporate Job Project */}
        <div
          className="project-type-card corporate"
          onClick={() => handleSelection("Corporate Job")}
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "2rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
            border: "2px solid transparent",
            width: "100%",
            maxWidth: "350px",
            textAlign: "center",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-5px)";
            e.currentTarget.style.boxShadow =
              "0 8px 24px rgba(66, 161, 101, 0.2)";
            e.currentTarget.style.border = "2px solid #42a165";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
            e.currentTarget.style.border = "2px solid transparent";
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏢</div>
          <h2 style={{ color: "#42a165", marginBottom: "1rem" }}>
            Corporate Job
          </h2>
          <p style={{ color: "#7f8c8d", lineHeight: "1.5" }}>
            High-volume orders for corporate clients. Specialized handling flow.
          </p>
          <div
            style={{
              marginTop: "1.5rem",
              color: "#42a165",
              fontWeight: "bold",
            }}
          >
            Priority: Normal
          </div>
        </div>
      </div>

      {/* Orders Management Tabs (All Orders & History) */}
      <OrdersList />
    </div>
  );
};

export default CreateProjectLanding;
