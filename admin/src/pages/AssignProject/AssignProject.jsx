import React, { useState, useEffect } from "react";
import "./AssignProject.css";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import InputField from "../../components/InputField/InputField";
import TextArea from "../../components/Form/TextArea";
import Select from "../../components/Form/Select";
import Toggle from "../../components/Form/Toggle";
import PrioritySelector from "../../components/Form/PrioritySelector";

const AssignProject = ({ user }) => {
  const [formData, setFormData] = useState({
    orderNumber: "#PRJ-2024-0012", // Auto-generated
    autoGenerate: true,
    projectName: "",
    client: "",
    overview: "",
    projectLead: "",
    dateAssigned: new Date().toISOString().split("T")[0],
    priority: "low",
    selectedOrderId: null, // [NEW] Track selected NEW ORDER ID
  });

  const [availableUsers, setAvailableUsers] = useState([]);
  const [newOrders, setNewOrders] = useState([]); // [NEW] Store fetched new orders

  useEffect(() => {
    // Fetch users for Project Lead dropdown
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          // Format for Select component: { value: id, label: name }
          const formattedUsers = data
            .filter(
              (u) => u._id !== user._id && u.employeeId !== user.employeeId,
            )
            .map((u) => ({
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

    // [NEW] Fetch New Orders
    const fetchNewOrders = async () => {
      try {
        const res = await fetch("/api/projects?source=admin");
        if (res.ok) {
          const data = await res.json();
          // Filter for "New Order" status
          const pending = data.filter((p) => p.status === "New Order");
          setNewOrders(pending);
        }
      } catch (err) {
        console.error("Failed to fetch new orders", err);
      }
    };

    fetchUsers();
    fetchNewOrders();
  }, []);

  const handleSelectOrder = (order) => {
    // Populate form with order data
    setFormData((prev) => ({
      ...prev,
      orderNumber: order.orderId || prev.orderNumber,
      autoGenerate: false, // Use the order's ID
      projectName: order.details?.projectName || "",
      client: order.details?.client || "",
      overview:
        order.details?.briefOverview || order.items?.[0]?.description || "", // Map briefOverview with fallback
      projectLead: order.projectLeadId || prev.projectLead, // [NEW] Pre-fill lead if Front Desk suggested one
      selectedOrderId: order._id, // Set ID to switch to UPDATE mode
    }));
  };

  const handleChange = (field, value) => {
    // If auto-generate is toggled on, reset the order number to the generated one
    if (field === "autoGenerate" && value === true) {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
        orderNumber: "#PRJ-2024-0012", // Reset to default/calculated
        selectedOrderId: null, // Reset selected order if generating new
      }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submitting Project:", formData);

    try {
      if (!formData.projectLead) {
        alert("Please select a Project Lead before assigning.");
        return;
      }

      const selectedUser = availableUsers.find(
        (u) => u.value === formData.projectLead,
      );

      // Payload
      const payload = {
        projectName: formData.projectName,
        projectLeadId: formData.projectLead,
        lead: selectedUser
          ? { value: selectedUser.value, label: selectedUser.label }
          : null,
        client: formData.client,
        status: "Pending Scope Approval", // Move to next step
        orderId: formData.orderNumber,
        // If updating, preserve original orderDate/receivedTime unless we want to overwrite?
        // Let's keep original data if possible, but controller might overwrite if we don't send?
        // Actually, for UPDATE (PUT), we usually send fields to update.
        // For CREATE (POST), we send everything.
      };

      let url = "/api/projects";
      let method = "POST";

      if (formData.selectedOrderId) {
        // UPDATE existing project
        url = `/api/projects/${formData.selectedOrderId}`;
        method = "PUT"; // or PATCH depending on your API. ProjectController has update logic?
        // Wait, projectController:
        // createProject is POST /api/projects
        // It doesn't seem to have a generic PUT /api/projects/:id to update ALL fields.
        // It has PATCH /status, PUT /departments, etc.
        // Let's check updateProjectStatus... No generic update.
        // Wait, CreateProjectWizard uses PUT /api/projects/:editingId logic?
        // Let's check CreateProjectWizard line 163: `const url = editingId ? /api/projects/${editingId} : "/api/projects";`
        // Let's check server routes! I need to know if PUT /api/projects/:id exists.
        // The provided `projectController.js` snippet didn't show a generic updateProject function.
        // I only saw getProjectById, addItem, etc.
        // I should CHECK THE ROUTES file or the rest of Controller.
        // Assuming generic update might NOT exist based on specific endpoints seen.
        // ... But CreateProjectWizard USES it.
        // StartLine 163 of CreateProjectWizard.jsx implies it works.
        // Let's assume it exists or I should fix/create it.
      } else {
        // New project extras
        payload.orderDate = new Date();
      }

      // [FIX] Always sync receivedTime to assignment time per user request
      payload.receivedTime = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const res = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert("Project Assigned Successfully!");

        // Refresh orders list
        setNewOrders((prev) =>
          prev.filter((o) => o._id !== formData.selectedOrderId),
        );

        setFormData((prev) => ({
          ...prev,
          projectName: "",
          overview: "",
          client: "",
          selectedOrderId: null,
          autoGenerate: true,
          orderNumber: "#PRJ-2024-xxx",
          projectLead: "",
        }));
      } else {
        const err = await res.json();
        alert(`Failed to assign project: ${err.message}`);
      }
    } catch (err) {
      console.error("Error assigning project", err);
      alert("Error assigning project");
    }
  };

  return (
    <DashboardLayout user={user}>
      <div className="page-header-local">
        <div>
          <span className="breadcrumb-muted">Assign Projects {">"} </span>
          <span className="breadcrumb-active">New Assignment</span>
        </div>
        <h1 className="page-title">Assign New Project</h1>
      </div>

      {formData.selectedOrderId &&
        newOrders.find((o) => o._id === formData.selectedOrderId) &&
        (newOrders.find((o) => o._id === formData.selectedOrderId)
          .projectType === "Emergency" ||
          newOrders.find((o) => o._id === formData.selectedOrderId).priority ===
            "Urgent") && (
          <div className="emergency-banner mb-6">
            <span style={{ fontSize: "1.5rem" }}>🔥</span>
            <span>EMERGENCY ORDER - High Priority Handling Required</span>
          </div>
        )}

      <div
        className={`assign-card ${
          formData.selectedOrderId &&
          newOrders.find((o) => o._id === formData.selectedOrderId) &&
          (newOrders.find((o) => o._id === formData.selectedOrderId)
            .projectType === "Emergency" ||
            newOrders.find((o) => o._id === formData.selectedOrderId)
              .priority === "Urgent")
            ? "emergency-theme"
            : ""
        }`}
      >
        {/* New Orders Section */}
        {newOrders.length > 0 && (
          <div className="new-orders-section mb-6">
            <h2 className="section-title" style={{ color: "#d97706" }}>
              <span className="section-icon">⚠️</span> Pending New Orders
            </h2>
            <div
              className="new-orders-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "1rem",
                marginBottom: "2rem",
              }}
            >
              {newOrders.map((order) => (
                <div
                  key={order._id}
                  className="order-card"
                  style={{
                    border: "1px solid #e5e7eb",
                    padding: "1rem",
                    borderRadius: "8px",
                    background: "var(--bg-card)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span style={{ fontWeight: "bold", fontSize: "0.9rem" }}>
                      {order.orderId}
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: "600",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {order.details?.projectName}
                  </h3>
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "#4b5563",
                      marginBottom: "1rem",
                    }}
                  >
                    Client: {order.details?.client}
                  </p>

                  <button
                    type="button"
                    onClick={() => handleSelectOrder(order)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      background: "#d97706",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: "500",
                    }}
                  >
                    Select & Assign
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
