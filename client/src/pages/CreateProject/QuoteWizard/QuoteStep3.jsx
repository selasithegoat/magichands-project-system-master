import React, { useState } from "react";
import DepartmentCard from "../DepartmentCard";
import Input from "../../../components/ui/Input";
import BackArrow from "../../../components/icons/BackArrow";
import ProgressBar from "../../../components/ui/ProgressBar";
import {
  GraphicsIcon,
  StockIcon,
  PackagingIcon,
  CameraIcon,
  PrinterIcon,
  DiamondIcon,
} from "../../../components/icons/DeptIcons1";
import {
  LargeFormatIcon,
  SewingIcon,
  ShirtIcon,
  ScissorsIcon,
  CardIcon,
  ToolsIcon,
  GlobeIcon,
} from "../../../components/icons/DeptIcons2";
import {
  WoodIcon,
  HammerIcon,
  SignIcon,
  FactoryIcon,
} from "../../../components/icons/DeptIcons3";

const QuoteStep3 = ({ formData, setFormData, onNext, onBack, onCancel }) => {
  const selectedDepts = formData.departments || [];
  const [searchTerm, setSearchTerm] = useState("");

  const allDepartments = [
    { id: "graphics", label: "Graphics", icon: <GraphicsIcon /> },
    { id: "stock", label: "Stock", icon: <StockIcon /> },
    { id: "packaging", label: "Packaging", icon: <PackagingIcon /> },
    { id: "photography", label: "Photography", icon: <CameraIcon /> },
    { id: "dtf", label: "DTF Printing", icon: <PrinterIcon /> },
    { id: "uv-dtf", label: "UV DTF Printing", icon: <PrinterIcon /> },
    { id: "uv-printing", label: "UV Printing", icon: <PrinterIcon /> },
    { id: "engraving", label: "Engraving", icon: <DiamondIcon /> },
    { id: "large-format", label: "Large Format", icon: <LargeFormatIcon /> },
    { id: "digital-press", label: "Digital Press", icon: <PrinterIcon /> },
    {
      id: "digital-heat-press",
      label: "Digital Heat Press",
      icon: <SewingIcon />,
    },
    { id: "offset-press", label: "Offset Press", icon: <PrinterIcon /> },
    {
      id: "screen-printing",
      label: "Screen Printing",
      icon: <LargeFormatIcon />,
    },
    { id: "embroidery", label: "Embroidery", icon: <SewingIcon /> },
    { id: "sublimation", label: "Sublimation", icon: <ShirtIcon /> },
    { id: "digital-cutting", label: "Digital Cutting", icon: <ScissorsIcon /> },
    { id: "pvc-id", label: "PVC ID Cards", icon: <CardIcon /> },
    { id: "business-cards", label: "Business Cards", icon: <CardIcon /> },
    { id: "installation", label: "Installation", icon: <ToolsIcon /> },
    { id: "overseas", label: "Overseas", icon: <GlobeIcon /> },
    { id: "woodme", label: "Woodme", icon: <WoodIcon /> },
    { id: "fabrication", label: "Fabrication", icon: <HammerIcon /> },
    { id: "signage", label: "Signage", icon: <SignIcon /> },
    {
      id: "outside-production",
      label: "Outside Production",
      icon: <FactoryIcon />,
    },
    // [NEW] Quote specific departments
    {
      id: "in-house-production",
      label: "In-house Production",
      icon: <FactoryIcon />,
    },
    {
      id: "local-outsourcing",
      label: "Local Outsourcing",
      icon: <GlobeIcon />,
    },
  ];

  const filteredDepts = allDepartments.filter((dept) =>
    dept.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const toggleDept = (id) => {
    const newDepts = selectedDepts.includes(id)
      ? selectedDepts.filter((item) => item !== id)
      : [...selectedDepts, id];
    setFormData({ departments: newDepts });
  };

  return (
    <div className="step-container">
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">Departments</h1>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        <ProgressBar currentStep={3} totalSteps={5} />

        <div className="page-title-section">
          <h2 className="page-title">Select Engaged Departments</h2>
          <p className="page-subtitle">
            Tap to select the teams required for this project.
          </p>
        </div>

        <div className="search-section" style={{ marginBottom: "1.5rem" }}>
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

        <div
          className="departments-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "1rem",
          }}
        >
          {filteredDepts.map((dept) => (
            <DepartmentCard
              key={dept.id}
              label={dept.label}
              icon={dept.icon}
              selected={selectedDepts.includes(dept.id)}
              onClick={() => toggleDept(dept.id)}
            />
          ))}
        </div>
      </div>

      <div
        className="step-footer"
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "2rem",
          padding: "1.5rem 0",
          borderTop: "1px solid var(--border-color)",
          gap: "1.5rem",
        }}
      >
        <button
          className="back-text-btn"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Back
        </button>
        <button
          className="next-btn"
          onClick={onNext}
          style={{
            background: "var(--primary-color)",
            color: "white",
            padding: "0.75rem 2rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          Next Step
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

export default QuoteStep3;
