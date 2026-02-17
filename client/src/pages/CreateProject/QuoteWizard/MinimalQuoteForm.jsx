import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import TrashIcon from "../../../components/icons/TrashIcon";
import FolderIcon from "../../../components/icons/FolderIcon";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import UserAvatar from "../../../components/ui/UserAvatar";
import CalendarIcon from "../../../components/icons/CalendarIcon";
import FolderIconStd from "../../../components/icons/FolderIcon"; // Renamed to avoid collision if any
import ConfirmationModal from "../../../components/ui/ConfirmationModal";
import "./MinimalQuoteForm.css";

const MinimalQuoteForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [leads, setLeads] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [existingSampleImage, setExistingSampleImage] = useState("");
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showToast, setShowToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [isToastFading, setIsToastFading] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState("");

  const [formData, setFormData] = useState({
    projectName: "",
    clientName: "",
    clientEmail: "", // [NEW]
    clientPhone: "", // [NEW]
    deliveryDate: "",
    projectLeadId: "",
    assistantLeadId: "",
    quoteNumber: "",
    briefOverview: "",
    items: [{ description: "", breakdown: "", qty: 1 }],
    checklist: {
      cost: false,
      mockup: false,
      previousSamples: false,
      sampleProduction: false,
      bidSubmission: false,
    },
  });

  const applyProjectToForm = (project) => {
    if (!project) return;
    setFormData({
      projectName: project.details?.projectName || "",
      clientName: project.details?.client || "",
      clientEmail: project.details?.clientEmail || "",
      clientPhone: project.details?.clientPhone || "",
      deliveryDate: project.details?.deliveryDate
        ? new Date(project.details.deliveryDate).toISOString().slice(0, 10)
        : "",
      projectLeadId: project.projectLeadId?._id || project.projectLeadId || "",
      assistantLeadId:
        project.assistantLeadId?._id || project.assistantLeadId || "",
      quoteNumber: project.orderId || "",
      briefOverview: project.details?.briefOverview || "",
      items:
        project.items?.length > 0
          ? project.items
          : [{ description: "", breakdown: "", qty: 1 }],
      checklist: project.quoteDetails?.checklist || {
        cost: false,
        mockup: false,
        previousSamples: false,
        sampleProduction: false,
        bidSubmission: false,
      },
    });
    setExistingSampleImage(project.details?.sampleImage || "");
    setExistingAttachments(project.details?.attachments || []);
  };

  useEffect(() => {
    const editParam = new URLSearchParams(location.search).get("edit");
    setEditingId(editParam || "");
  }, [location.search]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          const formatted = data.map((u) => {
            const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
            const identifier = u.employeeId || u.email;
            return {
              value: u._id,
              label: identifier ? `${fullName} (${identifier})` : fullName,
            };
          });
          setLeads(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
    };
    fetchUsers();

    const loadEditProject = async () => {
      if (!editingId) return false;

      if (location.state?.reopenedProject?._id === editingId) {
        applyProjectToForm(location.state.reopenedProject);
        return true;
      }

      try {
        const res = await fetch(`/api/projects/${editingId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          applyProjectToForm(data);
          return true;
        }
      } catch (error) {
        console.error("Failed to load quote for editing", error);
      }
      triggerToast("Failed to load quote revision for editing.", "error");
      return true;
    };

    loadEditProject().then((handledEdit) => {
      if (handledEdit) return;
      if (location.state?.reopenedProject) {
        applyProjectToForm(location.state.reopenedProject);
        return;
      }
      // Auto-generate quote number
      const qNumber = `Q-${Date.now().toString().slice(-6)}`;
      setFormData((prev) => ({ ...prev, quoteNumber: qNumber }));
    });
  }, [location.state, editingId]);

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
      items: [...prev.items, { description: "", breakdown: "", qty: 1 }],
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

  const triggerToast = (message, type = "success") => {
    setShowToast({ show: true, message, type });
    setIsToastFading(false);
    setTimeout(() => {
      setIsToastFading(true);
      setTimeout(() => {
        setShowToast({ show: false, message: "", type: "success" });
        setIsToastFading(false);
      }, 500);
    }, 4500);
  };

  const removeFile = (indexToRemove) => {
    setSelectedFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
  };

  const removeExistingAttachment = (index) => {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingSampleImage = () => {
    setExistingSampleImage("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.projectLeadId) {
      alert("Please select a Project Lead. This is a required field.");
      return;
    }

    const hasChecklist = Object.values(formData.checklist).some(
      (val) => val === true,
    );
    if (!hasChecklist) {
      triggerToast("Please select at least one Requirement.", "error");
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);

    try {
      const formPayload = new FormData();
      formPayload.append("projectType", "Quote");
      if (!editingId) {
        formPayload.append("status", "Pending Scope Approval");
      }
      formPayload.append("orderId", formData.quoteNumber);
      formPayload.append("projectName", formData.projectName);
      formPayload.append("client", formData.clientName);
      formPayload.append("clientEmail", formData.clientEmail); // [NEW]
      formPayload.append("clientPhone", formData.clientPhone); // [NEW]
      formPayload.append("briefOverview", formData.briefOverview);
      formPayload.append("deliveryDate", formData.deliveryDate);
      formPayload.append("projectLeadId", formData.projectLeadId);
      if (formData.assistantLeadId) {
        formPayload.append("assistantLeadId", formData.assistantLeadId);
      }
      formPayload.append("items", JSON.stringify(formData.items));
      formPayload.append(
        "quoteDetails",
        JSON.stringify({
          quoteNumber: formData.quoteNumber,
          checklist: formData.checklist,
        }),
      );

      // Handle Existing Files
      if (existingSampleImage) {
        formPayload.append("existingSampleImage", existingSampleImage);
      }
      if (existingAttachments.length > 0) {
        formPayload.append(
          "existingAttachments",
          JSON.stringify(existingAttachments),
        );
      }

      const imageFile = selectedFiles.find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        formPayload.append("sampleImage", imageFile);
        // Also add other images as attachments, and non-images as attachments
        selectedFiles.forEach((file) => {
          if (file !== imageFile) {
            formPayload.append("attachments", file);
          }
        });
      } else if (selectedFiles.length > 0) {
        // If no image, all are attachments
        selectedFiles.forEach((file) => {
          formPayload.append("attachments", file);
        });
      }

      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        body: formPayload,
      });

      if (res.ok) {
        setCreatedOrderNumber(formData.quoteNumber);
        triggerToast(
          editingId
            ? "Quote revision updated successfully!"
            : "Project Created Successfully!",
          "success",
        );
        setShowSuccessModal(true);
      } else {
        const err = await res.json();
        triggerToast(err.message || "Failed to create quote", "error");
      }
    } catch (err) {
      console.error(err);
      triggerToast("Error creating quote", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="minimal-quote-container">
      {showToast.show && (
        <div
          className={`toast-message ${showToast.type} ${
            isToastFading ? "fading-out" : ""
          }`}
        >
          {showToast.message}
        </div>
      )}
      <div className="page-header">
        <h1>{editingId ? "Edit Reopened Quote" : "Create New Quote"}</h1>
        <p className="subtitle">Front Desk entry for new quote requests</p>
      </div>

      <div className="minimal-quote-form-card">
        <form onSubmit={handleSubmit}>
          {/* Basic Info */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Basic Information</h3>
            <div className="minimal-quote-grid">
              <Input
                label="Quote Number"
                value={formData.quoteNumber}
                onChange={(e) =>
                  handleChange({
                    target: { name: "quoteNumber", value: e.target.value },
                  })
                }
                required
              />

              <Select
                label="Assigned Lead"
                options={leads}
                value={leads.find((l) => l.value === formData.projectLeadId)}
                onChange={(option) =>
                  setFormData((prev) => ({
                    ...prev,
                    projectLeadId: option.value,
                    assistantLeadId:
                      option.value === prev.assistantLeadId
                        ? ""
                        : prev.assistantLeadId,
                  }))
                }
                placeholder="Select Lead"
                renderValue={(option) => (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span>{option.label}</span>
                  </div>
                )}
                renderOption={(option) => (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span>{option.label}</span>
                  </div>
                )}
              />

              <Select
                label="Assistant Lead (Optional)"
                options={leads.filter(
                  (l) => l.value !== formData.projectLeadId,
                )}
                value={leads.find((l) => l.value === formData.assistantLeadId)}
                onChange={(option) =>
                  setFormData((prev) => ({
                    ...prev,
                    assistantLeadId: option.value,
                  }))
                }
                placeholder="Select Assistant"
                renderValue={(option) => (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span>{option.label}</span>
                  </div>
                )}
                renderOption={(option) => (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span>{option.label}</span>
                  </div>
                )}
              />
            </div>

            <div className="minimal-quote-grid">
              <Input
                label="Project / Item Name"
                placeholder="e.g. Annual Report Print"
                value={formData.projectName}
                onChange={(e) =>
                  handleChange({
                    target: { name: "projectName", value: e.target.value },
                  })
                }
                icon={<FolderIconStd />}
              />

              <Input
                label="Client Name"
                placeholder="e.g. MagicHands Corp"
                value={formData.clientName}
                onChange={(e) =>
                  handleChange({
                    target: { name: "clientName", value: e.target.value },
                  })
                }
              />

              <Input
                label="Client Email"
                placeholder="e.g. contact@client.com"
                value={formData.clientEmail}
                onChange={(e) =>
                  handleChange({
                    target: { name: "clientEmail", value: e.target.value },
                  })
                }
              />

              <Input
                label="Client Phone"
                placeholder="e.g. +1234567890"
                value={formData.clientPhone}
                onChange={(e) =>
                  handleChange({
                    target: { name: "clientPhone", value: e.target.value },
                  })
                }
              />
            </div>

            <div className="minimal-quote-grid">
              <Input
                type="date"
                label="Requested Completion Date"
                value={formData.deliveryDate}
                onChange={(e) =>
                  handleChange({
                    target: { name: "deliveryDate", value: e.target.value },
                  })
                }
                icon={<CalendarIcon />}
              />
            </div>

            <div className="minimal-quote-form-group">
              <label className="input-label">Brief Overview</label>
              <textarea
                name="briefOverview"
                className="minimal-quote-textarea-std"
                value={formData.briefOverview}
                onChange={handleChange}
                placeholder="High-level summary of the request..."
                rows="3"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-input)",
                  color: "var(--text-color)",
                }}
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
                  <div className="item-field description" style={{ flex: 3 }}>
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(index, "description", e.target.value)
                      }
                    />
                  </div> <br/>
                  <div className="item-field details" style={{ flex: 2 }}>
                    <Input
                      placeholder="Details (Optional)"
                      value={item.breakdown}
                      onChange={(e) =>
                        updateItem(index, "breakdown", e.target.value)
                      }
                    />
                  </div>
                  <div className="item-field qty" style={{ flex: "0 0 100px" }}>
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => updateItem(index, "qty", e.target.value)}
                      min="1"
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
            <h3 className="section-subtitle">
              Quote Requirements Checklist{" "}
              <span style={{ color: "red" }}>*</span>
            </h3>
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

            {selectedFiles.length === 0 &&
              !existingSampleImage &&
              existingAttachments.length === 0 && (
                <div
                  className="minimal-quote-file-dropzone"
                  onClick={() =>
                    document.getElementById("quote-attachments").click()
                  }
                  style={{ cursor: "pointer" }}
                  >
                    <FolderIcon />
                    <p>Click to upload reference files</p>
                    <span>Any file type (images, PDFs, audio, video)</span>
                  </div>
                )}

            {(selectedFiles.length > 0 ||
              existingSampleImage ||
              existingAttachments.length > 0) && (
              <div className="minimal-quote-files-grid">
                {/* Existing Sample Image */}
                {existingSampleImage && (
                  <div className="minimal-quote-file-tile existing">
                    <div className="file-icon">
                      <img src={existingSampleImage} alt="existing sample" />
                    </div>
                    <div className="file-info" title="Sample Image (Original)">
                      Sample Image
                    </div>
                    <button
                      type="button"
                      onClick={removeExistingSampleImage}
                      className="file-remove-btn"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Existing Attachments */}
                {existingAttachments.map((path, idx) => (
                  <div
                    key={`exist-${idx}`}
                    className="minimal-quote-file-tile existing"
                  >
                    <div className="file-icon">
                      {path.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img src={path} alt="attachment" />
                      ) : (
                        <FolderIcon />
                      )}
                    </div>
                    <div className="file-info" title={path.split("/").pop()}>
                      {path.split("/").pop()}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExistingAttachment(idx)}
                      className="file-remove-btn"
                    >
                      &times;
                    </button>
                  </div>
                ))}

                {/* New Files */}
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="minimal-quote-file-tile">
                    <div className="file-icon">
                      {file.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(file)} alt="preview" />
                      ) : (
                        <FolderIcon />
                      )}
                    </div>
                    <div className="file-info" title={file.name}>
                      {file.name}
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
                <div
                  className="minimal-quote-file-add-tile"
                  onClick={() =>
                    document.getElementById("quote-attachments").click()
                  }
                >
                  <span>+</span>
                </div>
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
              {editingId ? "Save Reopened Quote" : "Create Quote Project"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={() => navigate("/")}
        onConfirm={() => navigate("/")}
        title={editingId ? "Quote Updated Successfully" : "Quote Created Successfully"}
        message={
          editingId
            ? `Quote revision ${createdOrderNumber} has been saved successfully.`
            : `New quote project ${createdOrderNumber} has been created and assigned to the Project Lead for scope approval.`
        }
        confirmText="Back to Dashboard"
        hideCancel={true}
      />
      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        title={editingId ? "Confirm Quote Update" : "Confirm New Quote Order"}
        message={
          editingId
            ? `Are you sure you want to save reopened quote ${formData.quoteNumber}?`
            : `Are you sure you want to create a new project for ${formData.clientName}? It will be assigned to the selected Project Lead for approval.`
        }
        confirmText={editingId ? "Yes, Save Changes" : "Yes, Create Quote"}
        cancelText="Cancel"
      />
    </div>
  );
};

export default MinimalQuoteForm;
