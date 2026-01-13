import React, { useState } from "react";
import "./AssignProject.css";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import InputField from "../../components/InputField/InputField";
import TextArea from "../../components/Form/TextArea";
import Select from "../../components/Form/Select";
import Toggle from "../../components/Form/Toggle";
import PrioritySelector from "../../components/Form/PrioritySelector";

// Mock data
const clients = [
  { value: "client1", label: "Acme Corp" },
  { value: "client2", label: "Globex Inc" },
  { value: "client3", label: "Soylent Corp" },
];

const AssignProject = () => {
  const [formData, setFormData] = useState({
    orderNumber: "#PRJ-2024-0012", // Auto-generated
    autoGenerate: true,
    projectName: "",
    client: "",
    overview: "",
    leads: [], // TODO: Chip Input
    dateAssigned: "2024-05-20",
    priority: "low",
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitting Project:", formData);
  };

  return (
    <DashboardLayout>
      <div className="page-header-local">
        <div>
          <span className="breadcrumb-muted">Assign Projects {">"} </span>
          <span className="breadcrumb-active">New Assignment</span>
        </div>
        <h1 className="page-title">Assign New Project</h1>
      </div>

      <div className="assign-card">
        <form onSubmit={handleSubmit} className="assign-form-grid">
          {/* Left Column: General Info */}
          <div className="form-column">
            <h2 className="section-title">
              <span className="section-icon info-icon">i</span> General
              Information
            </h2>

            <div className="form-row-split">
              <div style={{ flex: 1 }}>
                <InputField
                  label="Order Number"
                  value={formData.orderNumber}
                  readOnly={formData.autoGenerate}
                  type="text"
                  placeholder="Enter ID"
                />
              </div>
              <div className="toggle-container">
                <Toggle
                  label="Auto-Generate"
                  checked={formData.autoGenerate}
                  onChange={(e) =>
                    handleChange("autoGenerate", e.target.checked)
                  }
                />
              </div>
            </div>

            <InputField
              label="Project Name"
              placeholder="e.g. Q4 Marketing Campaign"
              value={formData.projectName}
              onChange={(e) => handleChange("projectName", e.target.value)}
            />

            <Select
              label="Client"
              options={clients}
              placeholder="Select a client"
              value={formData.client}
              onChange={(e) => handleChange("client", e.target.value)}
            />

            <TextArea
              label="Brief Overview"
              placeholder="Enter project scope and objectives..."
              value={formData.overview}
              onChange={(e) => handleChange("overview", e.target.value)}
            />
          </div>

          {/* Right Column: Logistics */}
          <div className="form-column">
            <h2 className="section-title">
              <span className="section-icon users-icon">👥</span> Logistics &
              Resources
            </h2>

            <div className="form-group">
              <label className="form-label">Assign Project Leads</label>
              <div className="chip-input-mock">
                <span className="chip">
                  JD <span>Jane Doe</span> <span className="chip-close">×</span>
                </span>
                <span className="chip green">
                  AS <span>Alan Smith</span>{" "}
                  <span className="chip-close">×</span>
                </span>
                <input
                  type="text"
                  placeholder="Add lead..."
                  className="chip-input-field"
                />
              </div>
            </div>

            <InputField
              label="Date Assigned"
              type="date"
              value={formData.dateAssigned}
              onChange={(e) => handleChange("dateAssigned", e.target.value)}
            />

            <PrioritySelector
              selected={formData.priority}
              onSelect={(val) => handleChange("priority", val)}
            />

            <div className="form-actions">
              <button type="button" className="btn-cancel">
                Cancel
              </button>
              <button type="submit" className="btn-confirm">
                Assign Project
              </button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default AssignProject;
