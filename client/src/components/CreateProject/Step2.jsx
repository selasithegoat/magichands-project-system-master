import React, { useState } from "react";
import DepartmentCard from "./DepartmentCard";
import Input from "../ui/Input";
import BackArrow from "../icons/BackArrow";
import "./Step2.css";

// Generic Icon for departments for now (to keep it simple as we have 24+ depts)
const DeptIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="3"
      y="3"
      width="7"
      height="7"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <rect
      x="14"
      y="3"
      width="7"
      height="7"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <rect
      x="14"
      y="14"
      width="7"
      height="7"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <rect
      x="3"
      y="14"
      width="7"
      height="7"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const Step2 = ({ onNext, onBack }) => {
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const allDepartments = [
    { id: "graphics", label: "Graphics" },
    { id: "stock", label: "Stock" },
    { id: "packaging", label: "Packaging" },
    { id: "photography", label: "Photography" },
    { id: "dtf", label: "DTF Printing" },
    { id: "uv-dtf", label: "UV DTF Printing" },
    { id: "uv-printing", label: "UV Printing" },
    { id: "engraving", label: "Engraving" },
    { id: "large-format", label: "Large Format" },
    { id: "digital-press", label: "Digital Press" },
    { id: "digital-heat-press", label: "Digital Heat Press" },
    { id: "offset-press", label: "Offset Press" },
    { id: "screen-printing", label: "Screen Printing" },
    { id: "embroidery", label: "Embroidery" },
    { id: "sublimation", label: "Sublimation" },
    { id: "digital-cutting", label: "Digital Cutting" },
    { id: "pvc-id", label: "PVC ID Cards" },
    { id: "business-cards", label: "Business Cards" },
    { id: "installation", label: "Installation" },
    { id: "overseas", label: "Overseas" },
    { id: "woodme", label: "Woodme" },
    { id: "fabrication", label: "Fabrication" },
    { id: "signage", label: "Signage" },
    { id: "outside-production", label: "Outside Production" },
  ];

  const filteredDepts = allDepartments.filter((dept) =>
    dept.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleDept = (id) => {
    setSelectedDepts((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="step-container">
      {/* Header */}
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">New Project</h1>
        <button className="cancel-btn">Cancel</button>
      </div>

      <div className="step-scrollable-content">
        {/* Progress Bar */}
        <div className="progress-bar-simple">
          <div className="progress-pill active"></div>
          <div className="progress-pill active"></div>
          <div className="progress-pill"></div>
          <div className="progress-pill"></div>
          <div className="progress-pill"></div>
        </div>

        {/* Title */}
        <div className="page-title-section">
          <h2 className="page-title">Select Engaged Departments</h2>
          <p className="page-subtitle">
            Tap to select the teams required for this project.
          </p>
        </div>

        {/* Search */}
        <div className="search-section">
          <Input
            placeholder="Search departments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11.5 21C16.7467 21 21 16.7467 21 11.5C21 6.25329 16.7467 2 11.5 2C6.25329 2 2 6.25329 2 11.5C2 16.7467 6.25329 21 11.5 21Z"
                  stroke="#64748B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 22L20 20"
                  stroke="#64748B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
        </div>

        {/* Grid */}
        <div className="departments-grid">
          {filteredDepts.map((dept) => (
            <DepartmentCard
              key={dept.id}
              label={dept.label}
              icon={<DeptIcon />}
              selected={selectedDepts.includes(dept.id)}
              onClick={() => toggleDept(dept.id)}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="step-footer footer-split">
        <button className="back-text-btn" onClick={onBack}>
          Back
        </button>
        <button className="next-btn-small" onClick={onNext}>
          Next
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4.16666 10H15.8333"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 4.16669L15.8333 10L10 15.8334"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Step2;
