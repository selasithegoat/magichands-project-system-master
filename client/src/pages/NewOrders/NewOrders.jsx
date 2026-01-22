import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import FolderIcon from "../../components/icons/FolderIcon";
import TrashIcon from "../../components/icons/TrashIcon";
import "./NewOrders.css";

const NewOrders = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("create");
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allFilters, setAllFilters] = useState({
    orderId: "",
    client: "",
    status: "All",
    assignment: "All",
  });
  const [historyFilters, setHistoryFilters] = useState({
    orderId: "",
    client: "",
    lead: "",
  });

  const [formData, setFormData] = useState({
    orderNumber: "",
    clientName: "",
    deliveryLocation: "",
    projectName: "",
    briefOverview: "",
    items: [{ description: "", details: "", qty: 1 }],
    orderDate: "",
    deliveryDate: "",
    projectType: location.state?.projectType || "Standard",
    priority: location.state?.priority || "Normal",
  });

  const [selectedFiles, setSelectedFiles] = useState([]);

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

  // Fetch all orders when switching to All Orders or History tab
  useEffect(() => {
    if (activeTab === "all" || activeTab === "history") {
      fetchOrders();
    }
  }, [activeTab]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      // Use mode=report to ensure Front Desk sees projects they created
      const res = await fetch("/api/projects?mode=report");
      if (res.ok) {
        const data = await res.json();
        setAllOrders(data);
      } else {
        console.error("Failed to fetch orders");
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

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

    const formPayload = new FormData();
    formPayload.append("orderId", formData.orderNumber);
    formPayload.append("orderDate", formData.orderDate);
    formPayload.append("client", formData.clientName);
    formPayload.append("projectName", formData.projectName);
    formPayload.append("deliveryLocation", formData.deliveryLocation);
    formPayload.append("deliveryDate", formData.deliveryDate || "");
    formPayload.append("status", "New Order");
    formPayload.append("briefOverview", formData.briefOverview);
    formPayload.append("projectType", formData.projectType);
    formPayload.append("priority", formData.priority);
    formPayload.append("items", JSON.stringify(formData.items));

    if (selectedFiles.length > 0) {
      selectedFiles.forEach((file) => {
        formPayload.append("attachments", file);
      });
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        credentials: "include",
        body: formPayload,
      });

      if (res.ok) {
        showToast("Order submitted successfully!", "success");
        // Reset form
        setFormData({
          orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
          clientName: "",
          deliveryLocation: "",
          projectName: "",
          briefOverview: "",
          items: [{ description: "", details: "", qty: 1 }],
          orderDate: new Date().toISOString().slice(0, 16),
          deliveryDate: "",
        });
        setSelectedFiles([]);

        // Always refresh orders list after creating a new order
        fetchOrders();
      } else {
        const errorData = await res.json();
        showToast(`Error: ${errorData.message || "Failed to submit"}`, "error");
      }
    } catch (error) {
      console.error("Submission error:", error);
      showToast("Network error. Please try again.", "error");
    }
  };

  const handleReopenProject = async (projectId) => {
    if (!window.confirm("Are you sure you want to reopen this project?")) {
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/reopen`, {
        method: "PATCH",
        credentials: "include",
      });

      if (res.ok) {
        showToast("Project reopened successfully!", "success");
        fetchOrders(); // Refresh the list
      } else {
        const errorData = await res.json();
        showToast(`Error: ${errorData.message || "Failed to reopen"}`, "error");
      }
    } catch (error) {
      console.error("Reopen error:", error);
      showToast("Network error. Please try again.", "error");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getAssignmentStatus = (project) => {
    return project.projectLeadId ? "Assigned" : "Unassigned";
  };

  const getStatusClass = (status) => {
    if (!status) return "draft";
    const lower = status.toLowerCase();
    if (lower.includes("pending") || lower.includes("new order"))
      return "pending";
    if (lower.includes("completed") || lower.includes("delivered"))
      return "completed";
    if (lower.includes("progress")) return "in-progress";
    return "draft";
  };

  // Filter orders for All Orders tab (non-completed projects)
  const allOrdersFiltered = allOrders.filter((order) => {
    // Exclude completed/delivered
    if (order.status === "Completed" || order.status === "Delivered")
      return false;

    // Apply search filters
    if (
      allFilters.orderId &&
      !order.orderId?.toLowerCase().includes(allFilters.orderId.toLowerCase())
    )
      return false;
    if (
      allFilters.client &&
      !order.details?.client
        ?.toLowerCase()
        .includes(allFilters.client.toLowerCase())
    )
      return false;

    const displayStatus = order.projectLeadId ? order.status : "New Order";
    if (allFilters.status !== "All" && displayStatus !== allFilters.status)
      return false;

    if (allFilters.assignment === "Assigned" && !order.projectLeadId)
      return false;
    if (allFilters.assignment === "Unassigned" && order.projectLeadId)
      return false;

    return true;
  });

  // Filter orders for Order History tab (completed projects only)
  const historyOrdersFiltered = allOrders.filter((order) => {
    // Only show completed/delivered projects
    if (order.status !== "Completed" && order.status !== "Delivered")
      return false;

    // Apply search filters
    if (
      historyFilters.orderId &&
      !order.orderId
        ?.toLowerCase()
        .includes(historyFilters.orderId.toLowerCase())
    )
      return false;
    if (
      historyFilters.client &&
      !order.details?.client
        ?.toLowerCase()
        .includes(historyFilters.client.toLowerCase())
    )
      return false;

    // Lead filter logic
    if (historyFilters.lead) {
      const leadName = order.projectLeadId
        ? `${order.projectLeadId.firstName} ${order.projectLeadId.lastName}`.toLowerCase()
        : "";
      if (!leadName.includes(historyFilters.lead.toLowerCase())) return false;
    }

    return true;
  });

  const isEmergency =
    formData.projectType === "Emergency" || formData.priority === "Urgent";

  return (
    <div
      className={`new-orders-container ${isEmergency ? "emergency-theme" : ""}`}
    >
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
        <h1>Orders Management</h1>
        <p className="subtitle">Create and manage client orders</p>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-container">
        <button
          className={`tab-btn ${activeTab === "create" ? "active" : ""}`}
          onClick={() => setActiveTab("create")}
        >
          Create New Order
        </button>
        <button
          className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Orders
        </button>
        <button
          className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Order History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "create" && (
        <>
          {isEmergency && (
            <div className="emergency-banner">
              <span style={{ fontSize: "1.5rem" }}>🔥</span>
              <span>EMERGENCY ORDER - High Priority Handling Required</span>
            </div>
          )}

          <div className="form-card">
            <form onSubmit={handleSubmit}>
              {/* Order Information */}
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

                {/* Items Section */}
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

              {/* Reference Materials */}
              <div className="form-section">
                <h2 className="section-title">Reference Materials</h2>

                <input
                  type="file"
                  multiple
                  id="new-order-attachments"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const filesArray = Array.from(e.target.files);
                      setSelectedFiles((prev) => {
                        const newFiles = [...prev, ...filesArray];
                        return newFiles;
                      });
                      e.target.value = null;
                    }
                  }}
                />

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

                {selectedFiles.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(100px, 1fr))",
                      gap: "10px",
                      marginTop: "1rem",
                    }}
                  >
                    {selectedFiles.map((file, idx) => {
                      const isImage = file.type.startsWith("image/");
                      const preview = isImage
                        ? URL.createObjectURL(file)
                        : null;

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
        </>
      )}

      {/* All Orders Tab */}
      {activeTab === "all" && (
        <div className="orders-list-container">
          <div className="filter-controls">
            <input
              type="text"
              placeholder="Order ID..."
              value={allFilters.orderId}
              onChange={(e) =>
                setAllFilters({ ...allFilters, orderId: e.target.value })
              }
              className="filter-input"
            />
            <input
              type="text"
              placeholder="Client..."
              value={allFilters.client}
              onChange={(e) =>
                setAllFilters({ ...allFilters, client: e.target.value })
              }
              className="filter-input"
            />
            <select
              value={allFilters.status}
              onChange={(e) =>
                setAllFilters({ ...allFilters, status: e.target.value })
              }
              className="filter-select"
            >
              <option value="All">All Status</option>
              <option value="New Order">New Order</option>
              <option value="Order Confirmed">Order Confirmed</option>
              <option value="In Progress">In Progress</option>
            </select>

            <select
              value={allFilters.assignment}
              onChange={(e) =>
                setAllFilters({ ...allFilters, assignment: e.target.value })
              }
              className="filter-select"
            >
              <option value="All">All Assignments</option>
              <option value="Assigned">Assigned</option>
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>

          {loading ? (
            <div className="loading-state">Loading orders...</div>
          ) : allOrdersFiltered.length === 0 ? (
            <div className="empty-state">No ongoing orders found.</div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Client</th>
                  <th>Project Name</th>
                  <th>Status</th>
                  <th>Assignment Status</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allOrdersFiltered.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>
                        {order.orderId || "N/A"}
                      </span>
                    </td>
                    <td>{order.details?.client || "-"}</td>
                    <td>{order.details?.projectName || "Untitled"}</td>
                    <td>
                      <span
                        className={`status-badge ${getStatusClass(
                          order.projectLeadId ? order.status : "New Order",
                        )}`}
                      >
                        {order.projectLeadId ? order.status : "New Order"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`assignment-badge ${
                          order.projectLeadId ? "assigned" : "unassigned"
                        }`}
                      >
                        {getAssignmentStatus(order)}
                      </span>
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      <button
                        className="action-btn"
                        onClick={() => navigate(`/project/${order._id}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Order History Tab */}
      {activeTab === "history" && (
        <div className="orders-list-container">
          <div className="filter-controls">
            <input
              type="text"
              placeholder="Client Search..."
              value={historyFilters.client}
              onChange={(e) =>
                setHistoryFilters({ ...historyFilters, client: e.target.value })
              }
              className="filter-input"
            />
            <input
              type="text"
              placeholder="Order Number..."
              value={historyFilters.orderId}
              onChange={(e) =>
                setHistoryFilters({
                  ...historyFilters,
                  orderId: e.target.value,
                })
              }
              className="filter-input"
            />
            <input
              type="text"
              placeholder="Lead Name..."
              value={historyFilters.lead}
              onChange={(e) =>
                setHistoryFilters({ ...historyFilters, lead: e.target.value })
              }
              className="filter-input"
            />
          </div>

          {loading ? (
            <div className="loading-state">Loading orders...</div>
          ) : historyOrdersFiltered.length === 0 ? (
            <div className="empty-state">
              No completed orders found matching filters.
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Client</th>
                  <th>Project Name</th>
                  <th>Status</th>
                  <th>Assignment Status</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyOrdersFiltered.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>
                        {order.orderId || "N/A"}
                      </span>
                    </td>
                    <td>{order.details?.client || "-"}</td>
                    <td>{order.details?.projectName || "Untitled"}</td>
                    <td>
                      <span
                        className={`status-badge ${getStatusClass(
                          order.status,
                        )}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`assignment-badge ${
                          order.projectLeadId ? "assigned" : "unassigned"
                        }`}
                      >
                        {getAssignmentStatus(order)}
                      </span>
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      <button
                        className="action-btn"
                        onClick={() => navigate(`/project/${order._id}`)}
                      >
                        View
                      </button>
                      {(order.status === "Completed" ||
                        order.status === "Delivered") && (
                        <button
                          className="action-btn reopen-btn"
                          onClick={() => handleReopenProject(order._id)}
                          style={{ marginLeft: "0.5rem" }}
                        >
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default NewOrders;
