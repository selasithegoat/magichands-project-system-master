import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./NewOrders.css";

const OrdersList = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
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

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ ...toast, show: false }), 3000);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?mode=report");
      if (res.ok) {
        const data = await res.json();
        setAllOrders(data);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
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
        fetchOrders();
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

  const allOrdersFiltered = allOrders.filter((order) => {
    if (order.status === "Completed" || order.status === "Delivered")
      return false;
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

  const historyOrdersFiltered = allOrders.filter((order) => {
    if (order.status !== "Completed" && order.status !== "Delivered")
      return false;
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
    if (historyFilters.lead) {
      const leadName = order.projectLeadId
        ? `${order.projectLeadId.firstName} ${order.projectLeadId.lastName}`.toLowerCase()
        : "";
      if (!leadName.includes(historyFilters.lead.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="orders-management-section" style={{ marginTop: "3rem" }}>
      {toast.show && (
        <div className={`toast-message ${toast.type}`}>{toast.message}</div>
      )}

      <div className="tabs-container">
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
                        className={`status-badge ${getStatusClass(order.projectLeadId ? order.status : "New Order")}`}
                      >
                        {order.projectLeadId ? order.status : "New Order"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`assignment-badge ${order.projectLeadId ? "assigned" : "unassigned"}`}
                      >
                        {getAssignmentStatus(order)}
                      </span>
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
    
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

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
                  <th>Action</th>
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
                        className={`status-badge ${getStatusClass(order.status)}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`assignment-badge ${order.projectLeadId ? "assigned" : "unassigned"}`}
                      >
                        {getAssignmentStatus(order)}
                      </span>
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
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

export default OrdersList;
