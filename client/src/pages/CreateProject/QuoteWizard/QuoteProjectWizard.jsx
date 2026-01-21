import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import UserAvatar from "../../../components/ui/UserAvatar";
import ProgressBar from "../../../components/ui/ProgressBar";
import BackArrow from "../../../components/icons/BackArrow";
import CalendarIcon from "../../../components/icons/CalendarIcon";
import FolderIcon from "../../../components/icons/FolderIcon";
import TrashIcon from "../../../components/icons/TrashIcon";
import "./QuoteProjectWizard.css";

const QuoteProjectWizard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [leads, setLeads] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    // Basic Project Fields (Mapped to existing schema)
    projectName: "",
    lead: "", // ID
    leadLabel: "", // Display Name
    orderDate: new Date().toISOString().split("T")[0],
    receivedTime: new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    deliveryDate: "",
    client: "", // [NEW]
    briefOverview: "", // [NEW]
    attachments: [], // [NEW] Existing attachments

    // Quote Specific Fields
    quoteDetails: {
      quoteNumber: "",
      quoteDate: new Date().toISOString().split("T")[0],
      emailResponseSent: false,
      projectCoordinatorSignature: "",
      scopeApproved: false,

      checklist: {
        cost: false,
        mockup: false,
        previousSamples: false,
        sampleProduction: false,
        bidSubmission: false,
      },

      departmentalEngagements: false, // Maps to 'departments' check but singular boolean here?
      // Actually user request says "Departmental Engagements (checkbox)".
      // We might just store it as a boolean in quoteDetails for now, or trigger dept selection.
      // Let's keep it simple as a checkbox for the form requirement first.

      productionChecklist: {
        inHouse: false,
        outside: false,
        localOutsourcing: false,
        overseasOutsourcing: false,
      },

      // Uncontrollable Factors (Mapped to main schema array)
      // But form requires "Uncontrollable Factors List (Job Priority List)"
      // We will use the main schema's 'uncontrollableFactors' array for this.

      productionProof: {
        proofreadingDone: false,
        approvedArtworkSent: false,
        pictureVideoTaken: false,
      },

      submission: {
        sentBy: "",
        sentVia: [], // Array of strings
      },

      updates: "", // Free text note
      clientFeedback: "",

      finalUpdate: {
        accepted: false,
        cancelled: false,
      },

      filledBy: "Self", // 'Self' or 'With Colleague'
      leadSignature: "",
      submissionDate: new Date().toISOString().split("T")[0],
    },

    // Arrays for lists
    items: [], // { description, quantity, breakdown, department }
    uncontrollableFactors: [], // { activity, responsible, status, riskFactors }

    updates: [], // Project Memo Updates
  });

  // Fetch Leads
  useEffect(() => {
    const fetchUsers = async () => {
      // Reusing logic from CreateProjectWizard to get leads
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          const formatted = data.map((u) => ({
            value: u._id,
            label:
              `${u.firstName || ""} ${u.lastName || ""} (${u.employeeId || u.email})`.trim(),
          }));
          setLeads(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
    };
    fetchUsers();
  }, []);

  // Fetch Project Data if Editing
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = params.get("edit");
    if (editId) {
      setEditingId(editId);
      setIsLoading(true);
      fetch(`/api/projects/${editId}`)
        .then((res) => res.json())
        .then((data) => {
          // Map data to formData
          setFormData((prev) => ({
            ...prev,
            projectName: data.details?.projectName || "",
            lead: data.projectLeadId?._id || data.projectLeadId || "",
            leadLabel: data.details?.lead || "",
            deliveryDate: data.details?.deliveryDate
              ? data.details.deliveryDate.split("T")[0]
              : "",
            quoteDetails: {
              ...prev.quoteDetails,
              ...data.quoteDetails,
              // Ensure dates are formatted for input[type=date]
              quoteDate: data.quoteDetails?.quoteDate
                ? data.quoteDetails.quoteDate.split("T")[0]
                : prev.quoteDetails.quoteDate,
              submissionDate: data.quoteDetails?.submissionDate
                ? data.quoteDetails.submissionDate.split("T")[0]
                : prev.quoteDetails.submissionDate,
            },
            items: data.items || [],
            uncontrollableFactors: data.uncontrollableFactors || [],
            receivedTime: data.receivedTime || prev.receivedTime,
            client: data.details?.client || "", // [NEW]
            briefOverview: data.details?.briefOverview || "", // [NEW]
            attachments: data.details?.attachments || [], // [NEW]
          }));
        })
        .catch((err) => console.error("Failed to fetch project", err))
        .finally(() => setIsLoading(false));
    }
  }, [location.search]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Handle nested state updates helper
    if (name.includes(".")) {
      const parts = name.split(".");
      setFormData((prev) => {
        let newData = { ...prev };
        let current = newData;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] =
          type === "checkbox" ? checked : value;
        return newData;
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleCheckboxChange = (section, field) => {
    setFormData((prev) => ({
      ...prev,
      quoteDetails: {
        ...prev.quoteDetails,
        [section]: {
          ...prev.quoteDetails[section],
          [field]: !prev.quoteDetails[section][field],
        },
      },
    }));
  };

  // Items Helpers
  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { description: "", qty: 1, breakdown: "", department: "" },
      ],
    }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  // Uncontrollable Factors Helpers
  const addFactor = () => {
    setFormData((prev) => ({
      ...prev,
      uncontrollableFactors: [
        ...prev.uncontrollableFactors,
        {
          description: "",
          responsible: { label: "", value: "" },
          status: { label: "Pending", value: "Pending" },
          riskFactors: "",
        },
      ],
      // Note: mapping 'Activity' from form to 'description' in schema
    }));
  };

  const updateFactor = (index, field, value) => {
    const newFactors = [...formData.uncontrollableFactors];
    // Special handling for objects if needed, but simple for now
    if (field === "responsible" || field === "status") {
      newFactors[index][field] = { label: value, value: value };
    } else {
      newFactors[index][field] = value;
    }
    setFormData((prev) => ({ ...prev, uncontrollableFactors: newFactors }));
  };

  const removeFactor = (index) => {
    const newFactors = formData.uncontrollableFactors.filter(
      (_, i) => i !== index,
    );
    setFormData((prev) => ({ ...prev, uncontrollableFactors: newFactors }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = {
        ...formData,
        projectType: "Quote",
        priority: "Normal", // Quote default
        status: "New Order", // Initial status

        // Map flat form data to schema structure where necessary
        details: {
          projectName: formData.projectName,
          client: formData.client, // [NEW]
          lead: formData.leadLabel, // Name
          deliveryDate: formData.deliveryDate,
          briefOverview: formData.briefOverview, // [NEW]
          attachments: formData.attachments, // [NEW] Preserve existing
        },
        projectLeadId: formData.lead, // ID

        // Combine free text update to updates array if present
        updates: formData.quoteDetails.updates
          ? [
              {
                event: "Initial Note",
                note: formData.quoteDetails.updates,
                date: new Date(),
              },
            ]
          : [],
      };

      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        navigate("/");
      } else {
        alert("Failed to create quote");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating quote");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="quote-wizard-container">
      {/* Header */}
      <div
        className="step-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <button
          className="back-btn"
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <BackArrow />
        </button>
        <h1
          className="header-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: "700",
            color: "var(--text-primary)",
          }}
        >
          {editingId ? "Edit Quote Project" : "Create New Quote"}
        </h1>
        <button
          className="cancel-btn"
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        {/* Progress */}
        <ProgressBar currentStep={1} totalSteps={1} />

        {/* Title */}
        <div className="order-title-section" style={{ marginBottom: "2rem" }}>
          <h2
            className="order-title"
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              color: "var(--text-primary)",
            }}
          >
            {formData.quoteDetails.quoteNumber || "New Quote"}
          </h2>
          <p className="order-subtitle" style={{ color: "#64748b" }}>
            Please finalize the technical details for this quote.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form-body">
          {/* Section 1: Project Basic Info */}
          <h3 className="section-title">Project Details</h3>
          <div
            className="form-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <Input
              label="Received Time"
              value={formData.receivedTime}
              onChange={(e) =>
                handleChange({
                  target: { name: "receivedTime", value: e.target.value },
                })
              }
            />
            <Input
              type="date"
              label="Completion Date"
              value={formData.deliveryDate}
              onChange={(e) =>
                handleChange({
                  target: { name: "deliveryDate", value: e.target.value },
                })
              }
              icon={<CalendarIcon />}
              required
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              className="checkbox-label"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                name="quoteDetails.emailResponseSent"
                checked={formData.quoteDetails.emailResponseSent}
                onChange={handleChange}
              />{" "}
              Email Response Sent
            </label>
          </div>

          <div
            className="form-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <Input
              label="Project / Item Name"
              value={formData.projectName}
              onChange={(e) =>
                handleChange({
                  target: { name: "projectName", value: e.target.value },
                })
              }
              icon={<FolderIcon />}
              required
            />
            <Input
              label="Client Name"
              placeholder="e.g. MagicHands Corp"
              value={formData.client}
              onChange={(e) =>
                handleChange({
                  target: { name: "client", value: e.target.value },
                })
              }
            />
          </div>

          <div
            className="form-row"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <Input
              label="Quote Number"
              value={formData.quoteDetails.quoteNumber}
              onChange={(e) =>
                handleChange({
                  target: {
                    name: "quoteDetails.quoteNumber",
                    value: e.target.value,
                  },
                })
              }
            />
            <Select
              label="Project Lead"
              options={leads}
              value={leads.find((l) => l.value === formData.lead)}
              onChange={(val) => {
                setFormData((prev) => ({
                  ...prev,
                  lead: val.value,
                  leadLabel: val.label,
                }));
              }}
              placeholder="Select Lead"
              renderValue={(option) => (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <UserAvatar />
                  <span>{option.label}</span>
                </div>
              )}
              renderOption={(option) => (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <UserAvatar />
                  <span>{option.label}</span>
                </div>
              )}
              required
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <Input
              label="Coordinator Signature"
              value={formData.quoteDetails.projectCoordinatorSignature}
              onChange={(e) =>
                handleChange({
                  target: {
                    name: "quoteDetails.projectCoordinatorSignature",
                    value: e.target.value,
                  },
                })
              }
            />
          </div>

          <div
            className="divider"
            style={{ borderBottom: "1px solid #eee", margin: "2rem 0" }}
          ></div>

          {/* Section: Overview & Reference Materials */}
          <h3 className="section-title">Initial Request Info</h3>
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              className="input-label"
              style={{
                marginBottom: "0.5rem",
                display: "block",
                color: "#64748b",
              }}
            >
              Brief Overview
            </label>
            <textarea
              name="briefOverview"
              value={formData.briefOverview}
              onChange={handleChange}
              rows="3"
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "var(--bg-input)",
                color: "white",
              }}
            ></textarea>
          </div>

          {formData.attachments?.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label className="section-label" style={{ color: "#64748b" }}>
                Reference Materials from Front Desk
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginTop: "0.5rem",
                }}
              >
                {formData.attachments.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 12px",
                      background: "#f0f7ff",
                      border: "1px solid #cce3ff",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                    }}
                  >
                    <a
                      href={file}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                    >
                      {file.split("/").pop()}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            className="divider"
            style={{ borderBottom: "1px solid #eee", margin: "2rem 0" }}
          ></div>

          {/* Quote Checklist */}
          <h3 className="section-title">Quote Checklist</h3>
          <div
            className="checklist-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            {Object.keys(formData.quoteDetails.checklist).map((key) => (
              <label
                key={key}
                className="checkbox-label"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  padding: "0.75rem",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.quoteDetails.checklist[key]}
                  onChange={() => handleCheckboxChange("checklist", key)}
                />
                <span style={{ fontSize: "0.9rem", color: "#1e293b" }}>
                  {key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (str) => str.toUpperCase())}
                </span>
              </label>
            ))}
          </div>

          {/* Order Breakdown */}
          <h3 className="section-title">Order / Quantity Breakdown</h3>
          <div
            className="quote-items-container"
            style={{ marginBottom: "2rem" }}
          >
            {formData.items.map((item, idx) => (
              <div
                key={idx}
                className="item-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 2fr 2fr 40px",
                  gap: "1rem",
                  alignItems: "end",
                  marginBottom: "1rem",
                }}
              >
                <Input
                  label={idx === 0 ? "Description" : ""}
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) =>
                    updateItem(idx, "description", e.target.value)
                  }
                />
                <Input
                  type="number"
                  label={idx === 0 ? "Qty" : ""}
                  placeholder="Qty"
                  value={item.qty}
                  onChange={(e) => updateItem(idx, "qty", e.target.value)}
                />
                <Input
                  label={idx === 0 ? "Breakdown" : ""}
                  placeholder="Breakdown"
                  value={item.breakdown}
                  onChange={(e) => updateItem(idx, "breakdown", e.target.value)}
                />
                <Input
                  label={idx === 0 ? "Department" : ""}
                  placeholder="Department"
                  value={item.department}
                  onChange={(e) =>
                    updateItem(idx, "department", e.target.value)
                  }
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="btn-remove"
                  style={{
                    height: "42px",
                    padding: "0",
                    background: "#ef4444",
                    border: "none",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="btn-add"
              style={{
                background: "#10b981",
                color: "white",
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
              }}
            >
              + Add Item
            </button>
          </div>

          {/* Uncontrollable Factors */}
          <h3 className="section-title">
            Uncontrollable Factors (Job Priority)
          </h3>
          <div className="factors-container" style={{ marginBottom: "2rem" }}>
            {formData.uncontrollableFactors.map((factor, idx) => (
              <div
                key={idx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr 40px",
                  gap: "1rem",
                  alignItems: "end",
                  marginBottom: "1rem",
                }}
              >
                <Input
                  label={idx === 0 ? "Activity" : ""}
                  value={factor.description}
                  onChange={(e) =>
                    updateFactor(idx, "description", e.target.value)
                  }
                />
                <Input
                  label={idx === 0 ? "Responsible" : ""}
                  value={factor.responsible?.label || factor.responsible}
                  onChange={(e) =>
                    updateFactor(idx, "responsible", e.target.value)
                  }
                />
                <Select
                  label={idx === 0 ? "Status" : ""}
                  options={[
                    { label: "Pending", value: "Pending" },
                    { label: "In Progress", value: "In Progress" },
                    { label: "Done", value: "Done" },
                  ]}
                  value={[
                    { label: "Pending", value: "Pending" },
                    { label: "In Progress", value: "In Progress" },
                    { label: "Done", value: "Done" },
                  ].find(
                    (s) => s.value === (factor.status?.value || "Pending"),
                  )}
                  onChange={(val) => updateFactor(idx, "status", val.value)}
                />
                <Input
                  label={idx === 0 ? "Risk Factors" : ""}
                  value={factor.riskFactors}
                  onChange={(e) =>
                    updateFactor(idx, "riskFactors", e.target.value)
                  }
                />
                <button
                  type="button"
                  onClick={() => removeFactor(idx)}
                  className="btn-remove"
                  style={{
                    height: "42px",
                    padding: "0",
                    background: "#ef4444",
                    border: "none",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addFactor}
              className="btn-add"
              style={{
                background: "#10b981",
                color: "white",
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
              }}
            >
              + Add Factor
            </button>
          </div>

          <div
            className="divider"
            style={{ borderBottom: "1px solid #eee", margin: "2rem 0" }}
          ></div>

          {/* Submission Footer */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
              marginBottom: "2rem",
            }}
          >
            <Input
              label="Lead Signature"
              value={formData.quoteDetails.leadSignature}
              onChange={(e) =>
                handleChange({
                  target: {
                    name: "quoteDetails.leadSignature",
                    value: e.target.value,
                  },
                })
              }
            />
            <Input
              type="date"
              label="Submission Date"
              value={formData.quoteDetails.submissionDate}
              onChange={(e) =>
                handleChange({
                  target: {
                    name: "quoteDetails.submissionDate",
                    value: e.target.value,
                  },
                })
              }
              icon={<CalendarIcon />}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "1rem",
              marginTop: "3rem",
            }}
          >
            <button
              type="button"
              onClick={() => navigate("/")}
              className="btn-secondary"
              style={{
                padding: "0.75rem 2rem",
                background: "#f1f5f9",
                color: "#64748b",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{
                padding: "0.75rem 2rem",
                background: "var(--primary-color)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              {editingId ? "Update Project" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuoteProjectWizard;
