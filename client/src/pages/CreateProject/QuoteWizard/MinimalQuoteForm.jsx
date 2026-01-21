import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import TrashIcon from "../../../components/icons/TrashIcon";
import FolderIcon from "../../../components/icons/FolderIcon";
import "./MinimalQuoteForm.css";

const MinimalQuoteForm = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [formData, setFormData] = useState({
    projectName: "",
    deliveryDate: "",
    projectLeadId: "",
    quoteNumber: "",
    briefOverview: "",
    items: [{ description: "", details: "", qty: 1 }],
    checklist: {
      cost: false,
      mockup: false,
      previousSamples: false,
      sampleProduction: false,
      bidSubmission: false,
    },
  });

  useEffect(() => {
    const fetchUsers = async () => {
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

    // Auto-generate quote number
    const qNumber = `Q-${Date.now().toString().slice(-6)}`;
    setFormData((prev) => ({ ...prev, quoteNumber: qNumber }));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleChecklistChange = (field) => {
    setFormData((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [field]: !prev.checklist[field],
      },
    }));
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", details: "", qty: 1 }],
    }));
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const updateItem = (index, field, value) => {
    const newItems = formData.items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    );
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const removeFile = (indexToRemove) => {
    setSelectedFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formPayload = new FormData();
      formPayload.append("projectType", "Quote");
      formPayload.append("status", "New Order");
      formPayload.append("orderId", formData.quoteNumber);
      formPayload.append("projectName", formData.projectName);
      formPayload.append("briefOverview", formData.briefOverview);
      formPayload.append("deliveryDate", formData.deliveryDate);
      formPayload.append("projectLeadId", formData.projectLeadId);
      formPayload.append("items", JSON.stringify(formData.items));
      formPayload.append(
        "quoteDetails",
        JSON.stringify({
          quoteNumber: formData.quoteNumber,
          checklist: formData.checklist,
        }),
      );

      if (selectedFiles.length > 0) {
        selectedFiles.forEach((file) => {
          formPayload.append("attachments", file);
        });
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        body: formPayload,
      });

      if (res.ok) {
        navigate("/");
      } else {
        const err = await res.json();
        alert(`Failed to create quote: ${err.message}`);
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
    <div className="minimal-quote-container">
      <div className="page-header">
        <h1>Create New Quote</h1>
        <p className="subtitle">Front Desk entry for new quote requests</p>
      </div>

      <div className="minimal-quote-form-card">
        <form onSubmit={handleSubmit}>
          {/* Basic Info */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Basic Information</h3>
            <div className="minimal-quote-grid">
              <div className="minimal-quote-form-group">
                <label>Quote Number</label>
                <input
                  type="text"
                  name="quoteNumber"
                  className="minimal-quote-input"
                  value={formData.quoteNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="minimal-quote-form-group">
                <label>Assigned Lead</label>
                <select
                  name="projectLeadId"
                  className="minimal-quote-input"
                  value={formData.projectLeadId}
                  onChange={handleChange}
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
            </div>

            <div className="minimal-quote-grid">
              <div className="minimal-quote-form-group">
                <label>Project / Item Name</label>
                <input
                  type="text"
                  name="projectName"
                  className="minimal-quote-input"
                  value={formData.projectName}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Annual Report Print"
                />
              </div>

              <div className="minimal-quote-form-group">
                <label>Requested Completion Date</label>
                <input
                  type="date"
                  name="deliveryDate"
                  className="minimal-quote-input"
                  value={formData.deliveryDate}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="minimal-quote-form-group">
              <label>Brief Overview</label>
              <textarea
                name="briefOverview"
                className="minimal-quote-input minimal-quote-textarea"
                value={formData.briefOverview}
                onChange={handleChange}
                placeholder="High-level summary of the request..."
                rows="3"
              />
            </div>
          </div>

          <div className="divider"></div>

          {/* Items Section */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Order Items</h3>
            <div className="minimal-quote-items-container">
              {formData.items.map((item, index) => (
                <div key={index} className="minimal-quote-item-row">
                  <div className="item-field description">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, "description", e.target.value)
                      }
                      className="minimal-quote-input"
                      required
                    />
                  </div>
                  <div className="item-field details">
                    <input
                      type="text"
                      placeholder="Details (Optional)"
                      value={item.details}
                      onChange={(e) =>
                        updateItem(index, "details", e.target.value)
                      }
                      className="minimal-quote-input"
                    />
                  </div>
                  <div className="item-field qty">
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => updateItem(index, "qty", e.target.value)}
                      className="minimal-quote-input"
                      min="1"
                      required
                    />
                  </div>
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="minimal-quote-remove-btn"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="minimal-quote-add-btn"
              >
                + Add Another Item
              </button>
            </div>
          </div>

          <div className="divider"></div>

          {/* Checklist Section */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Quote Requirements Checklist</h3>
            <div className="minimal-quote-checklist-grid">
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.cost}
                  onChange={() => handleChecklistChange("cost")}
                />
                <span>Cost</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.mockup}
                  onChange={() => handleChecklistChange("mockup")}
                />
                <span>Mockup</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.previousSamples}
                  onChange={() => handleChecklistChange("previousSamples")}
                />
                <span>Previous Sample / Jobs Done</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.sampleProduction}
                  onChange={() => handleChecklistChange("sampleProduction")}
                />
                <span>Sample Production</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.bidSubmission}
                  onChange={() => handleChecklistChange("bidSubmission")}
                />
                <span>Bid Submission / Documents</span>
              </label>
            </div>
          </div>

          <div className="divider"></div>

          {/* Reference Materials */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Reference Materials</h3>
            <input
              type="file"
              multiple
              id="quote-attachments"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const filesArray = Array.from(e.target.files);
                  setSelectedFiles((prev) => [...prev, ...filesArray]);
                  e.target.value = null;
                }
              }}
            />

            {selectedFiles.length === 0 && (
              <label
                htmlFor="quote-attachments"
                className="minimal-quote-file-dropzone"
              >
                <FolderIcon />
                <p>Click to upload reference files</p>
                <span>Images, PDFs, Documents</span>
              </label>
            )}

            {selectedFiles.length > 0 && (
              <div className="minimal-quote-files-grid">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="minimal-quote-file-tile">
                    <div className="file-icon">
                      {file.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(file)} alt="preview" />
                      ) : (
                        <FolderIcon />
                      )}
                    </div>
                    <div className="file-info">
                      <span title={file.name}>{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="file-remove-btn"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <label
                  htmlFor="quote-attachments"
                  className="minimal-quote-file-add-tile"
                >
                  <span>+</span>
                </label>
              </div>
            )}
          </div>

          <div className="minimal-quote-actions">
            <button
              type="button"
              className="minimal-quote-btn-cancel"
              onClick={() => navigate("/")}
            >
              Cancel
            </button>
            <button type="submit" className="minimal-quote-btn-submit">
              Create Quote Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MinimalQuoteForm;
