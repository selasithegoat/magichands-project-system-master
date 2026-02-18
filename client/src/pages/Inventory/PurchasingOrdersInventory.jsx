import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EditIcon from "../../components/icons/EditIcon";
import TrashIcon from "../../components/icons/TrashIcon";
import Spinner from "../../components/ui/Spinner";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { DEPARTMENTS } from "../../constants/departments";

const ROWS_PER_PAGE = 10;
const ROOT_DEPARTMENTS = [
  "Administration",
  "Front Desk",
  "Production",
  "Graphics/Design",
  "Photography",
  "Stores",
  "IT Department",
];

const normalizeDepartmentLabel = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const normalizedKey = trimmed
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalizedKey === "graphics" ||
    normalizedKey === "graphics/design" ||
    normalizedKey === "graphics and design"
  ) {
    return "Graphics/Design";
  }

  return trimmed;
};

const buildDepartmentOptions = () => {
  const dedupMap = new Map();
  const addOption = (value) => {
    const normalizedLabel = normalizeDepartmentLabel(value);
    if (!normalizedLabel) return;
    const key = normalizedLabel.toLowerCase();
    if (!dedupMap.has(key)) {
      dedupMap.set(key, normalizedLabel);
    }
  };

  ROOT_DEPARTMENTS.forEach(addOption);
  DEPARTMENTS.forEach((dept) => addOption(dept.label));

  return Array.from(dedupMap.values()).sort((a, b) => a.localeCompare(b));
};

const DEPARTMENT_OPTIONS = buildDepartmentOptions();

const initialFormState = {
  orderNo: "",
  dept: "",
  description: "",
  qty: "1",
  requestStatus: "Pending",
  qtyReceivedBrought: "",
  dateItemReceived: "",
  receivedBy: "",
  dateRequestPlaced: "",
};

const toDateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const PurchasingOrdersInventory = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeptMenuOpen, setIsDeptMenuOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deptMenuRef = useRef(null);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/purchasing-orders");
      if (!res.ok) {
        throw new Error("Failed to fetch purchasing orders.");
      }
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        message: "Unable to load purchasing orders right now.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useRealtimeRefresh(() => fetchRecords());

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(records.length / ROWS_PER_PAGE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [records.length, currentPage]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (deptMenuRef.current && !deptMenuRef.current.contains(event.target)) {
        setIsDeptMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const resetForm = () => {
    setEditingId("");
    setFormData(initialFormState);
    setIsDeptMenuOpen(false);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback({ type: "", message: "" });
    const isEditing = Boolean(editingId);

    const payload = {
      orderNo: formData.orderNo.trim(),
      dept: formData.dept.trim(),
      description: formData.description.trim(),
      qty: Number(formData.qty),
      requestStatus: formData.requestStatus.trim(),
      qtyReceivedBrought:
        formData.qtyReceivedBrought === ""
          ? null
          : Number(formData.qtyReceivedBrought),
      dateItemReceived: formData.dateItemReceived || null,
      receivedBy: formData.receivedBy.trim(),
      dateRequestPlaced: formData.dateRequestPlaced,
    };

    try {
      const res = await fetch(
        isEditing
          ? `/api/inventory/purchasing-orders/${editingId}`
          : "/api/inventory/purchasing-orders",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Unable to save purchasing order.");
      }

      await fetchRecords();
      resetForm();
      setCurrentPage(1);
      setFeedback({
        type: "success",
        message: isEditing
          ? "Purchasing order updated successfully."
          : "Purchasing order added successfully.",
      });
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        message: error.message || "Unable to save purchasing order.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (record) => {
    setEditingId(record._id);
    setFormData({
      orderNo: record.orderNo || "",
      dept: record.dept || "",
      description: record.description || "",
      qty: record.qty ? String(record.qty) : "1",
      requestStatus: record.requestStatus || "Pending",
      qtyReceivedBrought:
        record.qtyReceivedBrought !== null &&
        record.qtyReceivedBrought !== undefined
          ? String(record.qtyReceivedBrought)
          : "",
      dateItemReceived: toDateInputValue(record.dateItemReceived),
      receivedBy: record.receivedBy || "",
      dateRequestPlaced: toDateInputValue(record.dateRequestPlaced),
    });
    setIsDeptMenuOpen(false);
    setFeedback({ type: "", message: "" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(
        `/api/inventory/purchasing-orders/${deleteTarget._id}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Unable to delete purchasing order.");
      }
      await fetchRecords();
      setFeedback({
        type: "success",
        message: "Purchasing order deleted successfully.",
      });
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        message: error.message || "Unable to delete purchasing order.",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(records.length / ROWS_PER_PAGE));
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const paginatedRecords = records.slice(startIndex, startIndex + ROWS_PER_PAGE);
  const pageStart = records.length === 0 ? 0 : startIndex + 1;
  const pageEnd = startIndex + paginatedRecords.length;
  const filteredDepartmentOptions = useMemo(() => {
    const query = formData.dept.trim().toLowerCase();
    if (!query) return DEPARTMENT_OPTIONS;
    return DEPARTMENT_OPTIONS.filter((option) =>
      option.toLowerCase().includes(query),
    );
  }, [formData.dept]);

  if (loading) {
    return (
      <div className="inventory-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <section className="inventory-section">
      <div className="inventory-section-header">
        <h2>Purchasing Order</h2>
        <p>Track purchase requests, receipts, and department ownership.</p>
      </div>

      {feedback.message && (
        <div className={`inventory-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      <form className="inventory-form-card" onSubmit={handleSubmit}>
        <div className="inventory-form-grid">
          <label>
            Order No
            <input
              type="text"
              name="orderNo"
              value={formData.orderNo}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Dept.
            <div className="inventory-dept-combobox" ref={deptMenuRef}>
              <div className="inventory-dept-input-row">
                <input
                  type="text"
                  name="dept"
                  value={formData.dept}
                  onChange={(event) => {
                    handleChange(event);
                    setIsDeptMenuOpen(true);
                  }}
                  onFocus={() => setIsDeptMenuOpen(true)}
                  autoComplete="off"
                  required
                />
                <button
                  type="button"
                  className="inventory-dept-toggle"
                  onClick={() => setIsDeptMenuOpen((prev) => !prev)}
                  aria-label="Toggle department list"
                >
                  {isDeptMenuOpen ? "▲" : "▼"}
                </button>
              </div>
              {isDeptMenuOpen && (
                <div className="inventory-dept-options" role="listbox">
                  {filteredDepartmentOptions.length > 0 ? (
                    filteredDepartmentOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="inventory-dept-option"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, dept: option }));
                          setIsDeptMenuOpen(false);
                        }}
                      >
                        {option}
                      </button>
                    ))
                  ) : (
                    <div className="inventory-dept-empty">No matching department</div>
                  )}
                </div>
              )}
            </div>
            <small className="inventory-input-hint">
              Type to filter departments and sub-departments.
            </small>
          </label>
          <label>
            Description
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Qty
            <input
              type="number"
              name="qty"
              value={formData.qty}
              onChange={handleChange}
              min="1"
              required
            />
          </label>
          <label>
            Request Status
            <select
              name="requestStatus"
              value={formData.requestStatus}
              onChange={handleChange}
              required
            >
              <option value="Pending">Pending</option>
              <option value="Requested">Requested</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Fully Received">Fully Received</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            Qty Received / Brought
            <input
              type="number"
              name="qtyReceivedBrought"
              value={formData.qtyReceivedBrought}
              onChange={handleChange}
              min="0"
            />
          </label>
          <label>
            Date Item Received
            <input
              type="date"
              name="dateItemReceived"
              value={formData.dateItemReceived}
              onChange={handleChange}
            />
          </label>
          <label>
            Received By
            <input
              type="text"
              name="receivedBy"
              value={formData.receivedBy}
              onChange={handleChange}
            />
          </label>
          <label>
            Date Request Placed
            <input
              type="date"
              name="dateRequestPlaced"
              value={formData.dateRequestPlaced}
              onChange={handleChange}
              required
            />
          </label>
        </div>

        <div className="inventory-form-actions">
          {editingId && (
            <button
              type="button"
              className="inventory-btn secondary"
              onClick={resetForm}
            >
              Cancel Edit
            </button>
          )}
          <button type="submit" className="inventory-btn primary" disabled={isSaving}>
            {isSaving
              ? editingId
                ? "Saving..."
                : "Adding..."
              : editingId
                ? "Save Purchasing Order"
                : "Add Purchasing Order"}
          </button>
        </div>
      </form>

      <div className="inventory-table-card">
        <div className="inventory-table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Order No</th>
                <th>Dept.</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Request Status</th>
                <th>Date Request Placed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length > 0 ? (
                paginatedRecords.map((record) => (
                  <tr key={record._id}>
                    <td>{record.orderNo || "N/A"}</td>
                    <td>{record.dept || "N/A"}</td>
                    <td>{record.description || "N/A"}</td>
                    <td>{record.qty ?? "N/A"}</td>
                    <td>
                      <div className="inventory-status-stack">
                        <strong>{record.requestStatus || "N/A"}</strong>
                        <span>
                          Qty Received/Brought:{" "}
                          {record.qtyReceivedBrought ?? "N/A"}
                        </span>
                        <span>
                          Date Item Received: {formatDate(record.dateItemReceived)}
                        </span>
                        <span>Received By: {record.receivedBy || "N/A"}</span>
                      </div>
                    </td>
                    <td>{formatDate(record.dateRequestPlaced)}</td>
                    <td>
                      <div className="inventory-row-actions">
                        <button
                          type="button"
                          className="inventory-icon-btn edit"
                          title="Edit Purchasing Order"
                          onClick={() => handleEdit(record)}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="inventory-icon-btn delete"
                          title="Delete Purchasing Order"
                          onClick={() => setDeleteTarget(record)}
                        >
                          <TrashIcon width={18} height={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="inventory-empty">
                    No purchasing orders recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {records.length > 0 && (
        <div className="inventory-pagination">
          <span className="inventory-pagination-summary">
            Showing {pageStart}-{pageEnd} of {records.length}
          </span>
          <div className="inventory-pagination-controls">
            <button
              type="button"
              className="inventory-pagination-btn"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span className="inventory-pagination-page">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="inventory-pagination-btn"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Purchasing Order"
        message={`Delete order "${deleteTarget?.orderNo || ""}" from purchasing list?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
};

export default PurchasingOrdersInventory;
