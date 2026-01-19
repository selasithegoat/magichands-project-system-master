import React, { useState, useEffect } from "react";
import FolderIcon from "../../components/icons/FolderIcon";
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

  const [selectedFiles, setSelectedFiles] = useState([]);

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

  // Handle removal of a file
  const removeFile = (indexToRemove) => {
    setSelectedFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
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

    // Use FormData for file upload
    const formPayload = new FormData();
    formPayload.append("orderId", formData.orderNumber);
    formPayload.append("orderDate", formData.orderDate);
    formPayload.append("client", formData.clientName);
    formPayload.append("projectName", formData.projectName);
    formPayload.append("deliveryLocation", formData.deliveryLocation);
    formPayload.append("deliveryDate", formData.deliveryDate || "");
    formPayload.append("status", "New Order");

    // Map description and details for controller to put into items[]
    formPayload.append("description", formData.description);
    formPayload.append("details", formData.details);

    if (selectedFiles.length > 0) {
      selectedFiles.forEach((file) => {
        formPayload.append("attachments", file);
      });
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        // Content-Type header excluded to let browser set boundary
        credentials: "include",
        body: formPayload,
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

        setSelectedFiles([]);
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
          {/* Reference Materials */}
          <div className="form-section">
            <h2 className="section-title">Reference Materials</h2>

            {/* Hidden Input with ID */}
            <input
              type="file"
              multiple
              id="new-order-attachments"
              style={{ display: "none" }}
              onChange={(e) => {
                console.log("File input change detected", e.target.files);
                if (e.target.files && e.target.files.length > 0) {
                  const filesArray = Array.from(e.target.files);
                  console.log("Processing files:", filesArray);
                  setSelectedFiles((prev) => {
                    const newFiles = [...prev, ...filesArray];
                    console.log("New selectedFiles state:", newFiles);
                    return newFiles;
                  });
                  e.target.value = null; // Reset
                }
              }}
            />

            {/* Empty State: Big Dropzone (Label) */}
            {selectedFiles.length === 0 && (
              <label
                htmlFor="new-order-attachments"
                className="file-upload-wrapper"
                style={{
                  border: "2px dashed #ccc",
                  borderRadius: "8px",
                  padding: "2rem",
                  textAlign: "center",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "150px",
                }}
              >
                <FolderIcon width="48" height="48" color="#666" />
                <p style={{ marginTop: "1rem", color: "#666" }}>
                  Click to upload files (Images, Docs, PDFs)
                </p>
              </label>
            )}

            {/* Files Grid */}
            {selectedFiles.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: "10px",
                  marginTop: "1rem",
                }}
              >
                {selectedFiles.map((file, idx) => {
                  const isImage = file.type.startsWith("image/");
                  const preview = isImage ? URL.createObjectURL(file) : null;

                  return (
                    <div
                      key={idx}
                      style={{
                        position: "relative",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        aspectRatio: "1",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#f9f9f9",
                      }}
                    >
                      {isImage ? (
                        <img
                          src={preview}
                          alt="prev"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "5px",
                            overflow: "hidden",
                            width: "100%",
                          }}
                        >
                          <FolderIcon width="32" height="32" color="#888" />
                          <div
                            style={{
                              fontSize: "10px",
                              marginTop: "5px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {file.name}
                          </div>
                        </div>
                      )}

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        style={{
                          position: "absolute",
                          top: "2px",
                          right: "2px",
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "50%",
                          width: "20px",
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}

                {/* Add More Tile (Label) */}
                <label
                  htmlFor="new-order-attachments"
                  style={{
                    border: "2px dashed #bbb",
                    borderRadius: "8px",
                    aspectRatio: "1",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    backgroundColor: "rgba(0,0,0,0.02)",
                    transition: "background 0.2s",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "rgba(0,0,0,0.05)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "rgba(0,0,0,0.02)")
                  }
                >
                  <span style={{ fontSize: "24px", color: "#666" }}>+</span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "4px",
                    }}
                  >
                    Add More
                  </span>
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
  );
};

export default NewOrders;
