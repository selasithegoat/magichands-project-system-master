import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import FolderIcon from "../../components/icons/FolderIcon";
import TrashIcon from "../../components/icons/TrashIcon";
import UserAvatar from "../../components/ui/UserAvatar";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import "./NewOrders.css";

const NewOrders = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    orderNumber: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    contactType: "None",
    deliveryLocation: "",
    projectName: "",
    briefOverview: "",
    items: [{ description: "", breakdown: "", qty: 1 }],
    orderDate: "",
    deliveryDate: "",
    projectType: location.state?.projectType || "Standard",
    priority: location.state?.priority || "Normal",
    projectLeadId: "",
    assistantLeadId: "",
    sampleRequired: false,
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [existingSampleImage, setExistingSampleImage] = useState("");
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [leads, setLeads] = useState([]);
  const [existingOrderNumbers, setExistingOrderNumbers] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [isToastFading, setIsToastFading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  // Fetch users for project lead
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setCurrentUser(data || null);
      } catch (e) {
        console.error("Failed to fetch current user", e);
      }
    };

    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          const formatted = data.map((u) => {
            const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
            return {
              value: u._id,
              label: fullName || u.name || "Unnamed User",
            };
          });
          setLeads(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
    };

    const fetchExistingOrders = async () => {
      try {
        const res = await fetch("/api/projects/orders?collapseRevisions=true");
        if (!res.ok) return;
        const data = await res.json();
        const orderNumbers = Array.from(
          new Set(
            (Array.isArray(data) ? data : [])
              .map((entry) => String(entry?.orderNumber || "").trim())
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setExistingOrderNumbers(orderNumbers);
      } catch (e) {
        console.error("Failed to fetch grouped orders", e);
      }
    };

    fetchCurrentUser();
    fetchUsers();
    fetchExistingOrders();
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setIsToastFading(false);
    setTimeout(() => {
      setIsToastFading(true);
      setTimeout(() => {
        setToast({ show: false, message: "", type: "success" });
        setIsToastFading(false);
      }, 500);
    }, 4500);
  };

  const toDateTimeLocal = (value) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const applyProjectToForm = (project) => {
    if (!project) return;
    setFormData({
      orderNumber: project.orderId || "",
      clientName: project.details?.client || "",
      clientEmail: project.details?.clientEmail || "",
      clientPhone: project.details?.clientPhone || "",
      contactType: project.details?.contactType || "None",
      deliveryLocation: project.details?.deliveryLocation || "",
      projectName: project.details?.projectName || "",
      briefOverview: project.details?.briefOverview || "",
      items:
        project.items?.length > 0
          ? project.items
          : [{ description: "", breakdown: "", qty: 1 }],
      orderDate: project.orderDate
        ? toDateTimeLocal(project.orderDate)
        : toDateTimeLocal(new Date()),
      deliveryDate: project.details?.deliveryDate
        ? toDateTimeLocal(project.details.deliveryDate)
        : "",
      projectType: project.projectType || "Standard",
      priority: project.priority || "Normal",
      projectLeadId: project.projectLeadId?._id || project.projectLeadId || "",
      assistantLeadId:
        project.assistantLeadId?._id || project.assistantLeadId || "",
      sampleRequired: Boolean(project.sampleRequirement?.isRequired),
    });
    setExistingSampleImage(project.details?.sampleImage || "");
    setExistingAttachments(project.details?.attachments || []);
  };

  useEffect(() => {
    const editParam = new URLSearchParams(location.search).get("edit");
    setEditingId(editParam || "");
  }, [location.search]);

  // Handle auto-generation OR edit/reopen sync
  useEffect(() => {
    const generateOrderNumber = () => {
      const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      return `ORD-${datePart}-${randomPart}`;
    };

    const loadEditProject = async (projectId) => {
      if (location.state?.reopenedProject?._id === projectId) {
        applyProjectToForm(location.state.reopenedProject);
        return;
      }

      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          applyProjectToForm(data);
        } else {
          showToast("Unable to load project for editing.", "error");
        }
      } catch (error) {
        console.error("Failed to load project for editing", error);
        showToast("Unable to load project for editing.", "error");
      }
    };

    if (editingId) {
      loadEditProject(editingId);
      return;
    }

    if (location.state?.reopenedProject) {
      applyProjectToForm(location.state.reopenedProject);
      return;
    }

    const now = new Date();
    const isoString = toDateTimeLocal(now);
    setFormData((prev) => ({
      ...prev,
      orderNumber: generateOrderNumber(),
      orderDate: isoString,
      projectType: location.state?.projectType || prev.projectType,
      priority: location.state?.priority || prev.priority,
    }));
  }, [editingId, location.state]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "projectLeadId" && value === prev.assistantLeadId) {
        next.assistantLeadId = "";
      }
      return next;
    });
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", breakdown: "", qty: 1 }],
    }));
  };

  const removeItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
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
      showToast("Please select a Project Lead.", "error");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);

    const formPayload = new FormData();
    formPayload.append("orderId", formData.orderNumber);
    formPayload.append("orderDate", formData.orderDate);
    formPayload.append("client", formData.clientName);
    formPayload.append("clientEmail", formData.clientEmail);
    formPayload.append("clientPhone", formData.clientPhone);
    formPayload.append("contactType", formData.contactType);
    formPayload.append("projectName", formData.projectName);
    formPayload.append("deliveryLocation", formData.deliveryLocation);
    formPayload.append("deliveryDate", formData.deliveryDate || "");
    formPayload.append("projectLeadId", formData.projectLeadId);
    if (formData.assistantLeadId) {
      formPayload.append("assistantLeadId", formData.assistantLeadId);
    }
    if (!editingId) {
      formPayload.append("status", "Order Confirmed");
    }
    formPayload.append("briefOverview", formData.briefOverview);
    formPayload.append("projectType", formData.projectType);
    formPayload.append("priority", formData.priority);
    formPayload.append("items", JSON.stringify(formData.items));
    if (!editingId) {
      formPayload.append("sampleRequired", String(Boolean(formData.sampleRequired)));
    }

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
      selectedFiles
        .filter((f) => f !== imageFile)
        .forEach((file) => {
          formPayload.append("attachments", file);
        });
    } else {
      selectedFiles.forEach((file) => {
        formPayload.append("attachments", file);
      });
    }

    try {
      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        body: formPayload,
      });

      if (res.ok) {
        showToast(
          editingId
            ? "Order revision updated successfully!"
            : "Order Created Successfully!",
          "success",
        );
        // Reset form
        if (!editingId) {
          setFormData({
            orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
            clientName: "",
            clientEmail: "",
            clientPhone: "",
            contactType: "None",
            deliveryLocation: "",
            projectName: "",
            briefOverview: "",
            items: [{ description: "", breakdown: "", qty: 1 }],
            orderDate: new Date().toISOString().slice(0, 16),
            deliveryDate: "",
            projectType: formData.projectType,
            priority: formData.priority,
            projectLeadId: "",
            assistantLeadId: "",
            sampleRequired: false,
          });
          setSelectedFiles([]);
          setExistingSampleImage("");
          setExistingAttachments([]);
        }

        // Navigate back to landing after short delay
        setTimeout(() => navigate("/create"), 1500);
      } else {
        const errorData = await res.json();
        showToast(`Error: ${errorData.message || "Failed to submit"}`, "error");
      }
    } catch (error) {
      console.error("Submission error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const isEmergency =
    formData.projectType === "Emergency" || formData.priority === "Urgent";

  const isCorporate = formData.projectType === "Corporate Job";
  const currentUserDepartments = Array.isArray(currentUser?.department)
    ? currentUser.department
    : currentUser?.department
      ? [currentUser.department]
      : [];
  const canEditOrderNumber =
    currentUser?.role === "admin" ||
    currentUserDepartments.includes("Front Desk");

  return (
    <div className="new-orders-page">
      {toast.show && (
        <div
          className={`toast-message ${toast.type} ${isToastFading ? "fading-out" : ""}`}
        >
          {toast.message}
        </div>
      )}

      <div className="page-header">
        <h1>{editingId ? "Edit Reopened Order" : "Create New Order"}</h1>
        <p className="subtitle">
          Fill in the details for the{" "}
          <span style={{ color: isCorporate ? "#42a165" : "inherit" }}>
            {formData.projectType}
          </span>{" "}
          job
        </p>
      </div>

      <div className="form-card-container">
        {isEmergency && (
          <div className="emergency-banner">
            <span style={{ fontSize: "1.5rem" }}>🔥</span>
            <span>EMERGENCY ORDER - High Priority Handling Required</span>
          </div>
        )}

        {isCorporate && (
          <div
            className="corporate-banner"
            style={{
              background: "rgba(66, 161, 101, 0.1)",
              border: "1px solid #42a165",
              color: "#42a165",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              fontWeight: "600",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>🏢</span>
            <span>CORPORATE JOB - Specialized Handling Flow</span>
          </div>
        )}

        <div className="form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-section">
              <h2 className="section-title">Order Information</h2>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="orderNumber">Order Number</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      id="orderNumber"
                      name="orderNumber"
                      value={formData.orderNumber}
                      onChange={handleChange}
                      className="form-input"
                      list="existingOrderNumbers"
                      disabled={!canEditOrderNumber}
                      required
                    />
                    <span className="input-icon">#</span>
                  </div>
                  <datalist id="existingOrderNumbers">
                    {existingOrderNumbers.map((orderNumber) => (
                      <option key={orderNumber} value={orderNumber} />
                    ))}
                  </datalist>
                  <small className="field-help-text">
                    {canEditOrderNumber
                      ? "Use an existing order number to create another project under the same order."
                      : "Only Front Desk and Admin can change order numbers."}
                  </small>
                </div>
                <div className="form-group">
                  <label htmlFor="orderDate">Date/Time Placed</label>
                  <input
                    type="datetime-local"
                    id="orderDate"
                    name="orderDate"
                    value={formData.orderDate}
                    onChange={handleChange}
                    className="form-input"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="projectLeadId">
                    Project Lead <span style={{ color: "red" }}>*</span>
                  </label>
                  <select
                    id="projectLeadId"
                    name="projectLeadId"
                    value={formData.projectLeadId}
                    onChange={handleChange}
                    className="form-input"
                    required
                  >
                    <option value="">Select a Project Lead</option>
                    {leads.map((lead) => (
                      <option key={lead.value} value={lead.value}>
                        {lead.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="assistantLeadId">
                    Assistant Lead{" "}
                    <span style={{ color: "var(--text-secondary)" }}>
                      (Optional)
                    </span>
                  </label>
                  <select
                    id="assistantLeadId"
                    name="assistantLeadId"
                    value={formData.assistantLeadId}
                    onChange={handleChange}
                    className="form-input"
                  >
                    <option value="">Select an Assistant Lead</option>
                    {leads
                      .filter((lead) => lead.value !== formData.projectLeadId)
                      .map((lead) => (
                        <option key={lead.value} value={lead.value}>
                          {lead.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="divider"></div>

            <div className="form-section">
              <h2 className="section-title">Client & Project Details</h2>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="clientName">Client Name</label>
                  <input
                    type="text"
                    id="clientName"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. Acme Corp"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="clientEmail">Client Email</label>
                  <input
                    type="email"
                    id="clientEmail"
                    name="clientEmail"
                    value={formData.clientEmail}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. contact@client.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="clientPhone">Client Phone</label>
                  <input
                    type="tel"
                    id="clientPhone"
                    name="clientPhone"
                    value={formData.clientPhone}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. +1234567890"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="contactType">Contact Type</label>
                  <select
                    id="contactType"
                    name="contactType"
                    value={formData.contactType}
                    onChange={handleChange}
                    className="form-input"
                    required
                  >
                    <option value="None">None</option>
                    <option value="MH">MH</option>
                    <option value="3rd Party">3rd Party</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="deliveryLocation">Delivery Location</label>
                  <input
                    type="text"
                    id="deliveryLocation"
                    name="deliveryLocation"
                    value={formData.deliveryLocation}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. 123 Main St, City"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="deliveryDate">
                    Delivery Date / Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    id="deliveryDate"
                    name="deliveryDate"
                    value={formData.deliveryDate}
                    onChange={handleChange}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="projectName">Order / Project Name</label>
                <input
                  type="text"
                  id="projectName"
                  name="projectName"
                  value={formData.projectName}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="e.g. Annual Conference Banners"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="briefOverview">Brief Overview</label>
                <textarea
                  id="briefOverview"
                  name="briefOverview"
                  value={formData.briefOverview}
                  onChange={handleChange}
                  className="form-input textarea-short"
                  placeholder="High-level summary (e.g. '3 Large banners for stage background')"
                  rows="2"
                ></textarea>
              </div>

              <div className="form-group sample-requirement-group">
                <label className="sample-requirement-control">
                  <input
                    type="checkbox"
                    name="sampleRequired"
                    checked={Boolean(formData.sampleRequired)}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        sampleRequired: e.target.checked,
                      }))
                    }
                    disabled={Boolean(editingId)}
                  />
                  <span>
                    Require client sample approval before Production can be
                    completed
                  </span>
                </label>
                <small className="field-help-text">
                  Enable when client must approve a production sample before mass
                  production.
                </small>
              </div>

              <div className="form-group">
                <label>Order Items</label>
                <div className="items-container">
                  {formData.items.map((item, index) => (
                    <div key={index} className="item-row">
                      <div className="item-input-group main">
                        <input
                          type="text"
                          placeholder="Description (e.g. Rollup Banner)"
                          value={item.description}
                          onChange={(e) =>
                            updateItem(index, "description", e.target.value)
                          }
                          className="form-input"
                          required
                        />
                      </div> <br/>
                      <div className="item-input-group details">
                        <input
                          type="text"
                          placeholder="Details (Optional)"
                          value={item.breakdown}
                          onChange={(e) =>
                            updateItem(index, "breakdown", e.target.value)
                          }
                          className="form-input"
                        />
                      </div>
                      <div className="item-input-group qty">
                        <input
                          type="number"
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(e) =>
                            updateItem(index, "qty", e.target.value)
                          }
                          className="form-input"
                          min="1"
                          required
                        />
                      </div>
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="remove-item-btn"
                          title="Remove Item"
                        >
                          <TrashIcon width="16" height="16" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addItem}
                    className="add-item-link"
                  >
                    + Add Another Item
                  </button>
                </div>
              </div>
            </div>

            <div className="divider"></div>

            <div className="form-section">
              <h2 className="section-title">Reference Materials</h2>

              {selectedFiles.length === 0 &&
                !existingSampleImage &&
                existingAttachments.length === 0 && (
                  <div
                    className="minimal-quote-file-dropzone"
                    onClick={() =>
                      document.getElementById("new-order-attachments").click()
                    }
                    style={{ cursor: "pointer" }}
                  >
                    <FolderIcon />
                    <p>Click to upload reference files</p>
                    <span>Images, PDFs, Documents</span>
                  </div>
                )}

              <input
                type="file"
                multiple
                id="new-order-attachments"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const filesArray = Array.from(e.target.files);
                    setSelectedFiles((prev) => [...prev, ...filesArray]);
                    e.target.value = null;
                  }
                }}
              />

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
                      <div
                        className="file-info"
                        title="Sample Image (Original)"
                      >
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
                      document.getElementById("new-order-attachments").click()
                    }
                  >
                    <span>+</span>
                  </div>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading
                  ? editingId
                    ? "Saving..."
                    : "Creating..."
                  : editingId
                    ? "Save Reopened Order"
                    : "Create Order"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        title={editingId ? "Confirm Order Update" : "Confirm New Order"}
        message={
          editingId
            ? `Are you sure you want to save reopened order ${formData.orderNumber}?`
            : `Are you sure you want to create order ${formData.orderNumber} for ${formData.projectName}? It will be assigned to the selected Project Lead for approval.`
        }
        confirmText={editingId ? "Yes, Save Changes" : "Yes, Create Order"}
        cancelText="Cancel"
      />
    </div>
  );
};

export default NewOrders;
