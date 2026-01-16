import React, { useState, useEffect } from "react";
import "./NewOrders.css";

const NewOrders = () => {
  const [formData, setFormData] = useState({
    orderNumber: "",
    clientName: "",
    deliveryLocation: "",
    projectName: "",
    description: "",
    details: "",
    orderDate: "",
    deliveryDate: "", // [New]
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Auto-generate order number on mount
  useEffect(() => {
    const generateOrderNumber = () => {
      const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      return `ORD-${datePart}-${randomPart}`;
    };

    // Get current local date and time in YYYY-MM-DDTHH:MM format
    const now = new Date();
    const isoString = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setFormData((prev) => ({
      ...prev,
      orderNumber: generateOrderNumber(),
      orderDate: isoString,
    }));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Toast State
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ ...toast, show: false }), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Construct payload matching Project Schema and Controller expectations
    const payload = {
      orderId: formData.orderNumber,
      orderDate: formData.orderDate,
      client: formData.clientName,
      projectName: formData.projectName,
      deliveryLocation: formData.deliveryLocation,
      deliveryDate: formData.deliveryDate || null,
      status: "New Order",
      // Map description/details to initial Item
      items: [
        {
          description: formData.description,
          breakdown: formData.details,
          qty: 1, // Default
        },
      ],
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Important for auth
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast("Order submitted successfully!", "success");
        // Reset form
        setFormData({
          orderNumber: `ORD-${Date.now().toString().slice(-6)}`, // Regen ID
          clientName: "",
          deliveryLocation: "",
          projectName: "",
          description: "",
          details: "",
          orderDate: new Date().toISOString().slice(0, 16),
          deliveryDate: "",
        });
        setSelectedImage(null);
        setPreviewUrl(null);
      } else {
        const errorData = await res.json();
        showToast(`Error: ${errorData.message || "Failed to submit"}`, "error");
      }
    } catch (error) {
      console.error("Submission error:", error);
      showToast("Network error. Please try again.", "error");
    }
  };

  return (
    <div className="new-orders-container">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`toast-message ${toast.type}`}>
          {toast.type === "success" ? (
            <span>&#10003;</span>
          ) : (
            <span>&#9888;</span>
          )}
          {toast.message}
        </div>
      )}

      <div className="page-header">
        <h1>New Order Entry</h1>
        <p className="subtitle">Record details for incoming client orders</p>
      </div>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          {/* Top Section: Order Info */}
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
          </div>

          <div className="divider"></div>

          {/* Client & Project Details */}
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
              <label htmlFor="description">Description of Order</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="form-input textarea-short"
                placeholder="Brief summary of the order..."
                rows="2"
              ></textarea>
            </div>

            <div className="form-group">
              <label htmlFor="details">Detailed Specifications</label>
              <textarea
                id="details"
                name="details"
                value={formData.details}
                onChange={handleChange}
                className="form-input textarea-tall"
                placeholder="Full details, measurements, materials, etc..."
                rows="5"
              ></textarea>
            </div>
          </div>

          <div className="divider"></div>

          {/* Sample Image */}
          <div className="form-section">
            <h2 className="section-title">Reference Material</h2>
            <div className="form-group">
              <label>Sample Image</label>
              <div className="file-upload-wrapper">
                <input
                  type="file"
                  id="sampleImage"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="file-input"
                />
                <label htmlFor="sampleImage" className="file-label">
                  <div className="upload-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <span>
                    {selectedImage
                      ? selectedImage.name
                      : "Click to upload a sample image"}
                  </span>
                </label>
              </div>
              {previewUrl && (
                <div className="image-preview">
                  <img src={previewUrl} alt="Preview" />
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => {
                      setSelectedImage(null);
                      setPreviewUrl(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="submit-btn">
              Create Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewOrders;
