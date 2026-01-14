import React, { useState, useEffect } from "react";
import "./AssignProject.css";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import InputField from "../../components/InputField/InputField";
import TextArea from "../../components/Form/TextArea";
import Select from "../../components/Form/Select";
import Toggle from "../../components/Form/Toggle";
import PrioritySelector from "../../components/Form/PrioritySelector";

const AssignProject = () => {
  const [formData, setFormData] = useState({
    orderNumber: "#PRJ-2024-0012", // Auto-generated
    autoGenerate: true,
    projectName: "",
    client: "",
    overview: "",
    projectLead: "",
    dateAssigned: new Date().toISOString().split("T")[0],
    priority: "low",
  });

  const [availableUsers, setAvailableUsers] = useState([]);

  useEffect(() => {
    // Fetch users for Project Lead dropdown
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          // Format for Select component: { value: id, label: name }
          const formattedUsers = data.map((u) => ({
            value: u._id,
            label:
              `${u.firstName || ""} ${u.lastName || ""} (${u.name})`.trim() ||
              u.name,
          }));
          setAvailableUsers(formattedUsers);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };
    fetchUsers();
  }, []);

  const handleChange = (field, value) => {
    // If auto-generate is toggled on, reset the order number to the generated one
    if (field === "autoGenerate" && value === true) {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
        orderNumber: "#PRJ-2024-0012", // Reset to default/calculated
      }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submitting Project:", formData);

    try {
      // So for Admin:
      // lead: { value: formData.projectLead, label: selectedUserLabel }

      const selectedUser = availableUsers.find(
        (u) => u.value === formData.projectLead
      );

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Flattened structure for createProject controller
          projectName: formData.projectName,
          projectLeadId: formData.projectLead,
          lead: selectedUser
            ? { value: selectedUser.value, label: selectedUser.label }
            : null,
          client: formData.client, // [NEW] Send client name
          status: "Pending Scope Approval",
          orderId: formData.orderNumber,
          // We can send 'client' as something else or lose it?
          // Let's put 'Client: ' + client in overview or descriptions?
          // There is 'overview' in Admin form.
          // Controller has 'items' (Step 3).
          // Maybe put overview in 'items' with description?
          // Or just creating the shell info.
        }),
      });

      if (res.ok) {
        alert("Project Assigned Successfully!");
        // Reset or redirect
        setFormData((prev) => ({
          ...prev,
          projectName: "",
          overview: "",
          client: "",
        }));
      } else {
        alert("Failed to assign project");
      }
    } catch (err) {
      console.error("Error assigning project", err);
      alert("Error assigning project");
    }
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
                  onChange={(e) => handleChange("orderNumber", e.target.value)}
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

            {/* Changed from Select to InputField */}
            <InputField
              label="Client"
              placeholder="Enter client name"
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

            {/* Replaced Chip Input with User Select */}
            <Select
              label="Assign Project Lead"
              options={availableUsers}
              placeholder="Select a project lead"
              value={formData.projectLead}
              onChange={(e) => handleChange("projectLead", e.target.value)}
            />

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
              {/* Cancel button removed */}
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
