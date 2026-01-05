import React, { useState } from "react";
import DepartmentCard from "./DepartmentCard";
import Input from "../ui/Input";
import BackArrow from "../icons/BackArrow";
import {
  GraphicsIcon,
  StockIcon,
  PackagingIcon,
  CameraIcon,
  PrinterIcon,
  DiamondIcon,
} from "../icons/DeptIcons1";
import {
  LargeFormatIcon,
  SewingIcon,
  ShirtIcon,
  ScissorsIcon,
  CardIcon,
  ToolsIcon,
  GlobeIcon,
} from "../icons/DeptIcons2";
import {
  WoodIcon,
  HammerIcon,
  SignIcon,
  FactoryIcon,
} from "../icons/DeptIcons3";
import "./Step2.css";

const Step2 = ({ onNext, onBack }) => {
  const [selectedDepts, setSelectedDepts] = useState([]);
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
    }, // Used Sewing as generic machine
    { id: "offset-press", label: "Offset Press", icon: <PrinterIcon /> },
    {
      id: "screen-printing",
      label: "Screen Printing",
      icon: <LargeFormatIcon />,
    }, // Simulating screen frame
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
        <div className="progress-section">
          <div className="progress-text-simple">
            <span className="step-indicator">STEP 2 OF 5</span>
            <span className="step-details-link">Departments</span>
          </div>
          <div className="progress-bar-simple">
            <div className="progress-pill active"></div>
            <div className="progress-pill active"></div>
            <div className="progress-pill"></div>
            <div className="progress-pill"></div>
            <div className="progress-pill"></div>
          </div>
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
              icon={dept.icon}
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
