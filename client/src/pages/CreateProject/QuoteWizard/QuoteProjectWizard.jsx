import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";

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
    <div
      className="quote-wizard-container"
      style={{
        padding: "2rem",
        maxWidth: "1000px",
        margin: "0 auto",
        background: "#f9f9f9",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{ textAlign: "center", marginBottom: "2rem", color: "#2c3e50" }}
      >
        Create New Quote
      </h1>

      <form
        onSubmit={handleSubmit}
        style={{
          background: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
        {/* Section 1: Project Basic Info */}
        <h3 className="section-title">Project Details</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Received Time</label>
            <input
              type="text"
              name="receivedTime"
              value={formData.receivedTime}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Completion Date</label>
            <input
              type="date"
              name="deliveryDate"
              value={formData.deliveryDate}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                name="quoteDetails.emailResponseSent"
                checked={formData.quoteDetails.emailResponseSent}
                onChange={handleChange}
              />{" "}
              Email Response Sent
            </label>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group full-width">
            <label>Project / Item Name</label>
            <input
              type="text"
              name="projectName"
              value={formData.projectName}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Quote Number</label>
            <input
              type="text"
              name="quoteDetails.quoteNumber"
              value={formData.quoteDetails.quoteNumber}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Lead</label>
            <select
              name="lead"
              value={formData.lead}
              onChange={(e) => {
                const selected = leads.find((l) => l.value === e.target.value);
                setFormData((prev) => ({
                  ...prev,
                  lead: e.target.value,
                  leadLabel: selected ? selected.label : "",
                }));
              }}
              required
            >
              <option value="">Select Lead</option>
              {leads.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Coordinator Signature</label>
            <input
              type="text"
              name="quoteDetails.projectCoordinatorSignature"
              value={formData.quoteDetails.projectCoordinatorSignature}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Section: Overview & Reference Materials (Populated from Front Desk) */}
        <h3 className="section-title">Initial Request Info</h3>
        <div
          className="form-group full-width"
          style={{ marginBottom: "1.5rem" }}
        >
          <label>Brief Overview</label>
          <textarea
            name="briefOverview"
            value={formData.briefOverview}
            onChange={handleChange}
            rows="3"
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "4px",
              border: "1px solid #ddd",
            }}
          ></textarea>
        </div>

        {formData.attachments?.length > 0 && (
          <div
            className="form-group full-width"
            style={{ marginBottom: "1.5rem" }}
          >
            <label>Reference Materials from Front Desk</label>
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
                    display: "flex",
                    alignItems: "center",
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

        {/* Quote Checklist */}
        <h3 className="section-title">Quote Checklist</h3>
        <div className="checklist-grid">
          {Object.keys(formData.quoteDetails.checklist).map((key) => (
            <label key={key} className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.quoteDetails.checklist[key]}
                onChange={() => handleCheckboxChange("checklist", key)}
              />{" "}
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase())}
            </label>
          ))}
        </div>

        {/* Production Checklist */}
        <h3 className="section-title">Production Checklist</h3>
        <div className="checklist-grid">
          {Object.keys(formData.quoteDetails.productionChecklist).map((key) => (
            <label key={key} className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.quoteDetails.productionChecklist[key]}
                onChange={() =>
                  handleCheckboxChange("productionChecklist", key)
                }
              />{" "}
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase())}
            </label>
          ))}
        </div>

        {/* Order Breakdown */}
        <h3 className="section-title">Order / Quantity Breakdown</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Item Description</th>
              <th>Quantity</th>
              <th>Breakdown</th>
              <th>Department</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.items.map((item, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) =>
                      updateItem(idx, "description", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, "qty", e.target.value)}
                    style={{ width: "80px" }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={item.breakdown}
                    onChange={(e) =>
                      updateItem(idx, "breakdown", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={item.department}
                    onChange={(e) =>
                      updateItem(idx, "department", e.target.value)
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="btn-remove"
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={addItem} className="btn-add">
          + Add Item
        </button>

        {/* Uncontrollable Factors */}
        <h3 className="section-title">Uncontrollable Factors (Job Priority)</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Activity (Job Priority)</th>
              <th>Responsible</th>
              <th>Status</th>
              <th>Risk Factors (Description)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {formData.uncontrollableFactors.map((factor, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    type="text"
                    value={factor.description}
                    onChange={(e) =>
                      updateFactor(idx, "description", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={factor.responsible?.label || factor.responsible}
                    onChange={(e) =>
                      updateFactor(idx, "responsible", e.target.value)
                    }
                  />
                </td>
                <td>
                  <select
                    value={factor.status?.value || "Pending"}
                    onChange={(e) =>
                      updateFactor(idx, "status", e.target.value)
                    }
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={factor.riskFactors}
                    onChange={(e) =>
                      updateFactor(idx, "riskFactors", e.target.value)
                    }
                    placeholder="Risk Description"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeFactor(idx)}
                    className="btn-remove"
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={addFactor} className="btn-add">
          + Add Factor
        </button>

        {/* Production Proof */}
        <h3 className="section-title">Production Proof & Media</h3>
        <div className="checklist-grid">
          {Object.keys(formData.quoteDetails.productionProof).map((key) => (
            <label key={key} className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.quoteDetails.productionProof[key]}
                onChange={() => handleCheckboxChange("productionProof", key)}
              />{" "}
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase())}
            </label>
          ))}
        </div>

        {/* Submission */}
        <h3 className="section-title">Quote Submission</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Sent By</label>
            <input
              type="text"
              name="quoteDetails.submission.sentBy"
              value={formData.quoteDetails.submission.sentBy}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Updates / Notes */}
        <h3 className="section-title">Updates / Notes</h3>
        <div className="form-group full-width">
          <textarea
            name="quoteDetails.updates"
            value={formData.quoteDetails.updates}
            onChange={handleChange}
            rows="4"
            style={{ width: "100%" }}
            placeholder="Updates / Notes (Free Text)"
          ></textarea>
        </div>

        {/* Final Update */}
        <h3 className="section-title">Final Update</h3>
        <div className="checklist-grid">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.quoteDetails.finalUpdate.accepted}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  quoteDetails: {
                    ...prev.quoteDetails,
                    finalUpdate: {
                      ...prev.quoteDetails.finalUpdate,
                      accepted: e.target.checked,
                    },
                  },
                }))
              }
            />{" "}
            Accepted
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.quoteDetails.finalUpdate.cancelled}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  quoteDetails: {
                    ...prev.quoteDetails,
                    finalUpdate: {
                      ...prev.quoteDetails.finalUpdate,
                      cancelled: e.target.checked,
                    },
                  },
                }))
              }
            />{" "}
            Cancelled
          </label>
        </div>

        <div className="form-grid" style={{ marginTop: "1rem" }}>
          <div className="form-group">
            <label>Project Lead Signature</label>
            <input
              type="text"
              name="quoteDetails.leadSignature"
              value={formData.quoteDetails.leadSignature}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Submission Date</label>
            <input
              type="date"
              name="quoteDetails.submissionDate"
              value={formData.quoteDetails.submissionDate}
              onChange={handleChange}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            justifyContent: "flex-end",
            gap: "1rem",
          }}
        >
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn-secondary"
            style={{
              padding: "0.75rem 1.5rem",
              background: "#e0e0e0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            style={{
              padding: "0.75rem 1.5rem",
              background: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Create Quote Project
          </button>
        </div>
      </form>

      <style>{`
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 1.5rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                }
                .form-group label {
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                    color: #555;
                }
                .form-group input, .form-group select {
                    padding: 0.75rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                .full-width {
                    grid-column: 1 / -1;
                }
                .section-title {
                    border-bottom: 2px solid #eee;
                    padding-bottom: 0.5rem;
                    margin: 2rem 0 1rem;
                    color: #2c3e50;
                }
                .checklist-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 1rem;
                }
                .data-table th, .data-table td {
                    border: 1px solid #eee;
                    padding: 0.75rem;
                    text-align: left;
                }
                .data-table th {
                    background: #f8f9fa;
                    font-weight: 600;
                }
                .btn-add {
                    background: #2ecc71;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                }
                 .btn-remove {
                    background: #e74c3c;
                    color: white;
                    border: none;
                    padding: 0.25rem 0.5rem;
                    border-radius: 4px;
                    cursor: pointer;
                }
            `}</style>
    </div>
  );
};

export default QuoteProjectWizard;
