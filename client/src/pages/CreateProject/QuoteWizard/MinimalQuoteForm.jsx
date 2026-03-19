import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import TrashIcon from "../../../components/icons/TrashIcon";
import FolderIcon from "../../../components/icons/FolderIcon";
import PersonIcon from "../../../components/icons/PersonIcon";
import MailIcon from "../../../components/icons/MailIcon";
import PhoneIcon from "../../../components/icons/PhoneIcon";
import UploadIcon from "../../../components/icons/UploadIcon";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import UserAvatar from "../../../components/ui/UserAvatar";
import CalendarIcon from "../../../components/icons/CalendarIcon";
import ClockIcon from "../../../components/icons/ClockIcon";
import ConfirmationModal from "../../../components/ui/ConfirmationModal";
import {
  buildFileKey,
  normalizeReferenceAttachments,
  getReferenceFileName,
  getReferenceFileUrl,
  getReferenceFileNote,
} from "../../../utils/referenceAttachments";
import "./MinimalQuoteForm.css";

const normalizeTimeForInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const hhmm = raw.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (hhmm) {
    return `${hhmm[1]}:${hhmm[2]}`;
  }

  const amPm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (amPm) {
    const hour12 = Number(amPm[1]);
    const minutes = amPm[2];
    const suffix = amPm[3].toLowerCase();
    const hour24 = (hour12 % 12) + (suffix === "pm" ? 12 : 0);
    return `${String(hour24).padStart(2, "0")}:${minutes}`;
  }

  return "";
};

const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(size) / Math.log(1024)),
  );
  const value = size / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const MinimalQuoteForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dashboardPath = "/client";

  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [leads, setLeads] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedFileNotes, setSelectedFileNotes] = useState({});
  const [existingSampleImage, setExistingSampleImage] = useState("");
  const [existingSampleImageNote, setExistingSampleImageNote] = useState("");
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
    deliveryTime: "",
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
      deliveryTime: normalizeTimeForInput(project.details?.deliveryTime),
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
    setExistingSampleImageNote(String(project.details?.sampleImageNote || ""));
    setExistingAttachments(
      normalizeReferenceAttachments(project.details?.attachments || []),
    );
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
            const departments = Array.isArray(u.department)
              ? u.department.filter(Boolean)
              : u.department
                ? [u.department]
                : [];
            const primaryDepartment = departments[0] || "";
            const roleLabel =
              u.position ||
              (u.role === "admin" ? "Admin" : "Team Member");
            return {
              value: u._id,
              label: fullName || u.name || "Unnamed User",
              roleLabel,
              department: primaryDepartment,
              avatarUrl: u.avatarUrl || "",
              role: u.role || "user",
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

  const moveItem = (index, direction) => {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= nextItems.length) {
        return prev;
      }
      const [moved] = nextItems.splice(index, 1);
      nextItems.splice(targetIndex, 0, moved);
      return { ...prev, items: nextItems };
    });
  };

  const adjustItemQty = (index, delta) => {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const currentQty = Number(nextItems[index]?.qty || 1);
      const nextQty = Math.max(1, currentQty + delta);
      nextItems[index] = { ...nextItems[index], qty: nextQty };
      return { ...prev, items: nextItems };
    });
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

  const renderLeadOption = (option) => (
    <div className="lead-option">
      <span
        className={`lead-status ${option.role === "admin" ? "admin" : "staff"}`}
      />
      <UserAvatar
        name={option.label}
        src={option.avatarUrl}
        width="34px"
        height="34px"
      />
      <div className="lead-meta">
        <span className="lead-name">{option.label}</span>
        <span className="lead-role">
          {option.roleLabel}
          {option.department ? ` - ${option.department}` : ""}
        </span>
      </div>
    </div>
  );

  const renderLeadValue = (option) => (
    <div className="lead-value">
      <UserAvatar
        name={option.label}
        src={option.avatarUrl}
        width="30px"
        height="30px"
      />
      <div className="lead-meta">
        <span className="lead-name">{option.label}</span>
        <span className="lead-role">
          {option.roleLabel}
          {option.department ? ` - ${option.department}` : ""}
        </span>
      </div>
    </div>
  );

  const removeFile = (indexToRemove) => {
    const fileToRemove = selectedFiles[indexToRemove];
    if (fileToRemove) {
      const key = buildFileKey(fileToRemove);
      setSelectedFileNotes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSelectedFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
  };

  const removeExistingAttachment = (index) => {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingSampleImage = () => {
    setExistingSampleImage("");
    setExistingSampleImageNote("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.deliveryTime) {
      triggerToast("Please set delivery time for this quote request.", "error");
      return;
    }
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
        formPayload.append("status", "Order Confirmed");
      }
      formPayload.append("orderId", formData.quoteNumber);
      formPayload.append("projectName", formData.projectName);
      formPayload.append("client", formData.clientName);
      formPayload.append("clientEmail", formData.clientEmail); // [NEW]
      formPayload.append("clientPhone", formData.clientPhone); // [NEW]
      formPayload.append("briefOverview", formData.briefOverview);
      formPayload.append("deliveryDate", formData.deliveryDate);
      formPayload.append("deliveryTime", formData.deliveryTime);
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
      formPayload.append("existingSampleImage", existingSampleImage || "");
      formPayload.append(
        "existingAttachments",
        JSON.stringify(existingAttachments || []),
      );

      const getFileNote = (file) =>
        selectedFileNotes[buildFileKey(file)] || "";
      const imageFile = selectedFiles.find((f) => f.type.startsWith("image/"));
      const attachmentFiles = imageFile
        ? selectedFiles.filter((file) => file !== imageFile)
        : selectedFiles;

      attachmentFiles.forEach((file) => {
        formPayload.append("attachments", file);
      });

      if (attachmentFiles.length > 0) {
        const attachmentNotes = attachmentFiles.map((file) => getFileNote(file));
        formPayload.append("attachmentNotes", JSON.stringify(attachmentNotes));
      }

      if (imageFile) {
        formPayload.append("sampleImage", imageFile);
      }

      const sampleNote = imageFile
        ? getFileNote(imageFile)
        : existingSampleImage
          ? existingSampleImageNote
          : "";
      formPayload.append("sampleImageNote", sampleNote);

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
        <div className="page-header-brand">
          <img
            src="/mhlogo.png"
            alt="Magic Hands"
            className="page-logo"
            draggable="false"
          />
          <div>
            <h1>{editingId ? "Edit Reopened Quote" : "Create New Quote"}</h1>
            <p className="subtitle">Front Desk entry for new quote requests</p>
          </div>
        </div>
      </div>

      <div className="minimal-quote-form-card">
        <form onSubmit={handleSubmit}>
          <div className="quote-meta-card">
            <div className="quote-meta-head">
              <div>
                <span className="quote-meta-eyebrow">Quote Snapshot</span>
                <h2 className="quote-meta-title">
                  {formData.projectName || "Quote Request"}
                </h2>
                <p className="quote-meta-subtitle">
                  Capture the core identifiers before filling the details.
                </p>
              </div>
            </div>
            <div className="quote-meta-grid">
              <Input
                label="Quote Number"
                value={formData.quoteNumber}
                onChange={(e) =>
                  handleChange({
                    target: { name: "quoteNumber", value: e.target.value },
                  })
                }
                icon={<span className="text-icon">#</span>}
                required
              />
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
              <Input
                type="time"
                label="Requested Completion Time"
                value={formData.deliveryTime}
                onChange={(e) =>
                  handleChange({
                    target: { name: "deliveryTime", value: e.target.value },
                  })
                }
                icon={<ClockIcon />}
                required
              />
            </div>
          </div>

          {/* Basic Info */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Leadership & Contact</h3>
            <div className="minimal-quote-grid">
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
                renderValue={renderLeadValue}
                renderOption={renderLeadOption}
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
                renderValue={renderLeadValue}
                renderOption={renderLeadOption}
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
                icon={<FolderIcon />}
              />
            </div>

            <div className="contact-grid">
              <Input
                label="Client Name"
                placeholder="e.g. MagicHands Corp"
                value={formData.clientName}
                onChange={(e) =>
                  handleChange({
                    target: { name: "clientName", value: e.target.value },
                  })
                }
                icon={<PersonIcon />}
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
                icon={<MailIcon />}
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
                icon={<PhoneIcon />}
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
                <div key={index} className="item-card">
                  <div className="item-card-header">
                    <div className="item-card-title">
                      <span className="item-grip" aria-hidden="true" />
                      <span className="item-index">Item {index + 1}</span>
                    </div>
                    <div className="item-card-actions">
                      <button
                        type="button"
                        className="item-move-btn"
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <span className="arrow up" />
                      </button>
                      <button
                        type="button"
                        className="item-move-btn"
                        onClick={() => moveItem(index, 1)}
                        disabled={index === formData.items.length - 1}
                        title="Move down"
                      >
                        <span className="arrow down" />
                      </button>
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
                  </div>
                  <div className="item-card-body">
                    <div className="item-input-group main">
                      <label>Description</label>
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(index, "description", e.target.value)
                        }
                      />
                    </div>
                    <div className="item-input-group details">
                      <label>Details (Optional)</label>
                      <Input
                        placeholder="Details (Optional)"
                        value={item.breakdown}
                        onChange={(e) =>
                          updateItem(index, "breakdown", e.target.value)
                        }
                      />
                    </div>
                    <div className="item-input-group qty">
                      <label>Quantity</label>
                      <div className="qty-stepper">
                        <button
                          type="button"
                          onClick={() => adjustItemQty(index, -1)}
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(e) =>
                            updateItem(index, "qty", e.target.value)
                          }
                          min="1"
                          className="form-input"
                        />
                        <button
                          type="button"
                          onClick={() => adjustItemQty(index, 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
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
            <h3 className="section-subtitle">Reference Lab</h3>
            <p className="section-hint">
              Add artwork, briefs, images, or production references for this
              quote.
            </p>
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
                  className="reference-dropzone"
                  onClick={() =>
                    document.getElementById("quote-attachments").click()
                  }
                  style={{ cursor: "pointer" }}
                >
                  <div className="dropzone-icon">
                    <UploadIcon />
                  </div>
                  <div>
                    <p>Drop files here, or click to upload</p>
                    <span>Images, PDFs, Docs, ZIP, and design files</span>
                  </div>
                </div>
              )}

            {(selectedFiles.length > 0 ||
              existingSampleImage ||
              existingAttachments.length > 0) && (
              <div className="reference-files-grid">
                {/* Existing Sample Image */}
                {existingSampleImage && (
                  <div className="reference-file-tile existing">
                    <div className="file-icon">
                      <img src={existingSampleImage} alt="existing sample" />
                    </div>
                    <div className="file-info" title="Sample Image (Original)">
                      <span className="file-name">Sample Image</span>
                      <span className="file-size">Original</span>
                    </div>
                    <textarea
                      className="reference-file-note"
                      placeholder="Add note for this reference..."
                      value={existingSampleImageNote}
                      onChange={(e) =>
                        setExistingSampleImageNote(e.target.value)
                      }
                      rows="2"
                    />
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
                {existingAttachments.map((attachment, idx) => {
                  const attachmentUrl = getReferenceFileUrl(attachment);
                  const fileName = getReferenceFileName(attachment);
                  const noteValue = getReferenceFileNote(attachment);
                  return (
                  <div
                    key={`exist-${attachmentUrl || idx}`}
                    className="reference-file-tile existing"
                  >
                    <div className="file-icon">
                      {attachmentUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img src={attachmentUrl} alt="attachment" />
                      ) : (
                        <FolderIcon />
                      )}
                    </div>
                    <div className="file-info" title={fileName}>
                      <span className="file-name">{fileName}</span>
                      <span className="file-size">Saved</span>
                    </div>
                    <textarea
                      className="reference-file-note"
                      placeholder="Add note for this reference..."
                      value={noteValue}
                      onChange={(e) => {
                        const value = e.target.value;
                        setExistingAttachments((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, note: value } : item,
                          ),
                        );
                      }}
                      rows="2"
                    />
                    <button
                      type="button"
                      onClick={() => removeExistingAttachment(idx)}
                      className="file-remove-btn"
                    >
                      &times;
                    </button>
                  </div>
                );
                })}

                {/* New Files */}
                {selectedFiles.map((file, idx) => {
                  const fileKey = buildFileKey(file);
                  return (
                  <div key={fileKey || idx} className="reference-file-tile">
                    <div className="file-icon">
                      {file.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(file)} alt="preview" />
                      ) : (
                        <FolderIcon />
                      )}
                    </div>
                    <div className="file-info" title={file.name}>
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <textarea
                      className="reference-file-note"
                      placeholder="Add note for this reference..."
                      value={selectedFileNotes[fileKey] || ""}
                      onChange={(e) =>
                        setSelectedFileNotes((prev) => ({
                          ...prev,
                          [fileKey]: e.target.value,
                        }))
                      }
                      rows="2"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="file-remove-btn"
                    >
                      &times;
                    </button>
                  </div>
                );
                })}
                <div
                  className="reference-file-add-tile"
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
        onClose={() => navigate(dashboardPath)}
        onConfirm={() => navigate(dashboardPath)}
        title={
          editingId
            ? "Quote Updated Successfully"
            : "Quote Created Successfully"
        }
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
