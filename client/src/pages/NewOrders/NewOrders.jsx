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
    deliveryLocation: "",
    projectName: "",
    briefOverview: "",
    items: [{ description: "", details: "", qty: 1 }],
    orderDate: "",
    deliveryDate: "",
    projectType: location.state?.projectType || "Standard",
    priority: location.state?.priority || "Normal",
    projectLeadId: "",
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [leads, setLeads] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [isToastFading, setIsToastFading] = useState(false);

  // Fetch users for project lead
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
    }, 3000);
  };

  // Auto-generate order number on mount
  useEffect(() => {
    const generateOrderNumber = () => {
      const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      return `ORD-${datePart}-${randomPart}`;
    };

    const now = new Date();
    const isoString = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setFormData((prev) => ({
      ...prev,
      orderNumber: generateOrderNumber(),
      orderDate: isoString,
      projectType: location.state?.projectType || prev.projectType,
      priority: location.state?.priority || prev.priority,
    }));
  }, [location.state]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", details: "", qty: 1 }],
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

    const formPayload = new FormData();
    formPayload.append("orderId", formData.orderNumber);
    formPayload.append("orderDate", formData.orderDate);
    formPayload.append("client", formData.clientName);
    formPayload.append("clientEmail", formData.clientEmail);
    formPayload.append("clientPhone", formData.clientPhone);
    formPayload.append("projectName", formData.projectName);
    formPayload.append("deliveryLocation", formData.deliveryLocation);
    formPayload.append("deliveryDate", formData.deliveryDate || "");
    formPayload.append("projectLeadId", formData.projectLeadId);
    formPayload.append("status", "Pending Scope Approval");
    formPayload.append("briefOverview", formData.briefOverview);
    formPayload.append("projectType", formData.projectType);
    formPayload.append("priority", formData.priority);
    formPayload.append("items", JSON.stringify(formData.items));

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
      const res = await fetch("/api/projects", {
        method: "POST",
        body: formPayload,
      });

      if (res.ok) {
        showToast("Order Created Successfully!", "success");
        // Reset form
        setFormData({
          orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
          clientName: "",
          clientEmail: "",
          clientPhone: "",
          deliveryLocation: "",
          projectName: "",
          briefOverview: "",
          items: [{ description: "", details: "", qty: 1 }],
          orderDate: new Date().toISOString().slice(0, 16),
          deliveryDate: "",
          projectType: formData.projectType,
          priority: formData.priority,
          projectLeadId: "",
        });
        setSelectedFiles([]);

        // Navigate back to landing after short delay
        setTimeout(() => navigate("/create"), 1500);
      } else {
        const errorData = await res.json();
        showToast(`Error: ${errorData.message || "Failed to submit"}`, "error");
      }
    } catch (error) {
      console.error("Submission error:", error);
      showToast("Network error. Please try again.", "error");
    }
  };

  const isEmergency =
    formData.projectType === "Emergency" || formData.priority === "Urgent";

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
        <h1>Create New Order</h1>
        <p className="subtitle">
          Fill in the details for the {formData.projectType} job
        </p>
      </div>

      <div className="form-card-container">
        {isEmergency && (
          <div className="emergency-banner">
            <span style={{ fontSize: "1.5rem" }}>🔥</span>
            <span>EMERGENCY ORDER - High Priority Handling Required</span>
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
                      required
                    />
                    <span className="input-icon">#</span>
                  </div>
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
                      </div>
                      <div className="item-input-group details">
                        <input
                          type="text"
                          placeholder="Details (Optional)"
                          value={item.details}
                          onChange={(e) =>
                            updateItem(index, "details", e.target.value)
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
              <input
                type="file"
                multiple
                id="new-order-attachments"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setSelectedFiles((prev) => [
                      ...prev,
                      ...Array.from(e.target.files),
                    ]);
                    e.target.value = null;
                  }
                }}
              />

              {selectedFiles.length === 0 ? (
                <label
                  htmlFor="new-order-attachments"
                  className="file-upload-wrapper"
                >
                  <FolderIcon width="48" height="48" color="#666" />
                  <p>Click to upload files (Images, Docs, PDFs)</p>
                </label>
              ) : (
                <div className="selected-files-grid">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="file-preview-card">
                      {file.type.startsWith("image/") ? (
                        <img src={URL.createObjectURL(file)} alt="preview" />
                      ) : (
                        <div className="file-icon-placeholder">
                          <FolderIcon width="32" height="32" color="#888" />
                          <span>{file.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="remove-file-btn"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <label
                    htmlFor="new-order-attachments"
                    className="add-more-files"
                  >
                    <span>+</span>
                    <span>Add More</span>
                  </label>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-btn">
                Create Order
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        title="Confirm New Order"
        message={`Are you sure you want to create order ${formData.orderNumber} for ${formData.projectName}? It will be assigned to the selected Project Lead for approval.`}
        confirmText="Yes, Create Order"
        cancelText="Cancel"
      />
    </div>
  );
};

export default NewOrders;
