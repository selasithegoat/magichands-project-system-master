import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EditIcon from "../../components/icons/EditIcon";
import TrashIcon from "../../components/icons/TrashIcon";
import Spinner from "../../components/ui/Spinner";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { DEPARTMENTS, PRODUCTION_SUB_DEPARTMENTS } from "../../constants/departments";

const ROWS_PER_PAGE = 10;
const PRODUCTION_OPTIONS = Array.from(
  new Set(
    PRODUCTION_SUB_DEPARTMENTS.map((id) => {
      const department = DEPARTMENTS.find((item) => item.id === id);
      return department?.label || id;
    }),
  ),
).sort((a, b) => a.localeCompare(b));

const initialFormState = {
  orderNo: "",
  jobLead: "",
  dateReceived: "",
  itemDescription: "",
  quantity: "1",
  production: "",
  deliveryDateTime: "",
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

const toDateTimeInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
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

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildEmployeeLabel = (employee) => {
  const fullName = `${employee?.firstName || ""} ${employee?.lastName || ""}`
    .trim()
    .replace(/\s+/g, " ");
  const baseName = fullName || employee?.name || "Unnamed Employee";
  return employee?.employeeId
    ? `${baseName} (${employee.employeeId})`
    : baseName;
};

const ClientItemsInventory = () => {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isProductionMenuOpen, setIsProductionMenuOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const productionMenuRef = useRef(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/client-items");
      if (!res.ok) {
        throw new Error("Failed to fetch client inventory records.");
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        message: "Unable to load client items right now.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    setIsEmployeesLoading(true);
    try {
      const res = await fetch("/api/auth/users");
      if (!res.ok) {
        throw new Error("Failed to fetch employees.");
      }
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setFeedback((prev) =>
        prev.message
          ? prev
          : {
              type: "error",
              message: "Unable to load employee list for Job Lead.",
            },
      );
    } finally {
      setIsEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useRealtimeRefresh(() => fetchItems());

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [items.length, currentPage]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        productionMenuRef.current &&
        !productionMenuRef.current.contains(event.target)
      ) {
        setIsProductionMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const resetForm = () => {
    setEditingId("");
    setFormData(initialFormState);
    setIsProductionMenuOpen(false);
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
      jobLead: formData.jobLead.trim(),
      dateReceived: formData.dateReceived,
      itemDescription: formData.itemDescription.trim(),
      quantity: Number(formData.quantity),
      production: formData.production.trim(),
      deliveryDateTime: formData.deliveryDateTime || null,
    };

    try {
      const res = await fetch(
        isEditing
          ? `/api/inventory/client-items/${editingId}`
          : "/api/inventory/client-items",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Unable to save client item.");
      }

      await fetchItems();
      resetForm();
      setCurrentPage(1);
      setFeedback({
        type: "success",
        message: isEditing
          ? "Client item updated successfully."
          : "Client item added successfully.",
      });
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        message: error.message || "Unable to save client item.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setFormData({
      orderNo: item.orderNo || "",
      jobLead: item.jobLead || "",
      dateReceived: toDateInputValue(item.dateReceived),
      itemDescription: item.itemDescription || "",
      quantity: item.quantity ? String(item.quantity) : "1",
      production: item.production || "",
      deliveryDateTime: toDateTimeInputValue(item.deliveryDateTime),
    });
    setIsProductionMenuOpen(false);
    setFeedback({ type: "", message: "" });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/inventory/client-items/${deleteTarget._id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Unable to delete client item.");
      }
      await fetchItems();
      setFeedback({
        type: "success",
        message: "Client item deleted successfully.",
      });
    } catch (error) {
      console.error(error);
      setFeedback({
        type: "error",
        message: error.message || "Unable to delete client item.",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const employeeOptions = employees.map((employee) => {
    const label = buildEmployeeLabel(employee);
    return {
      key: employee?._id || label,
      value: label,
    };
  });

  const hasCustomJobLeadValue =
    Boolean(formData.jobLead) &&
    !employeeOptions.some((option) => option.value === formData.jobLead);

  const totalPages = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const paginatedItems = items.slice(startIndex, startIndex + ROWS_PER_PAGE);
  const pageStart = items.length === 0 ? 0 : startIndex + 1;
  const pageEnd = startIndex + paginatedItems.length;
  const filteredProductionOptions = useMemo(() => {
    const query = formData.production.trim().toLowerCase();
    if (!query) return PRODUCTION_OPTIONS;
    return PRODUCTION_OPTIONS.filter((option) =>
      option.toLowerCase().includes(query),
    );
  }, [formData.production]);

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
        <h2>Client Items</h2>
        <p>
          Register all client-supplied items received for production processing.
        </p>
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
            Job Lead
            <select
              name="jobLead"
              value={formData.jobLead}
              onChange={handleChange}
              disabled={isEmployeesLoading && employeeOptions.length === 0}
            >
              <option value="">
                {isEmployeesLoading ? "Loading employees..." : "Select Job Lead"}
              </option>
              {hasCustomJobLeadValue && (
                <option value={formData.jobLead}>{formData.jobLead}</option>
              )}
              {employeeOptions.map((option) => (
                <option key={option.key} value={option.value}>
                  {option.value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date Received
            <input
              type="date"
              name="dateReceived"
              value={formData.dateReceived}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Item Description
            <input
              type="text"
              name="itemDescription"
              value={formData.itemDescription}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="1"
              required
            />
          </label>
          <label>
            Production
            <div className="inventory-dept-combobox" ref={productionMenuRef}>
              <div className="inventory-dept-input-row">
                <input
                  type="text"
                  name="production"
                  value={formData.production}
                  onChange={(event) => {
                    handleChange(event);
                    setIsProductionMenuOpen(true);
                  }}
                  onFocus={() => setIsProductionMenuOpen(true)}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="inventory-dept-toggle"
                  onClick={() => setIsProductionMenuOpen((prev) => !prev)}
                  aria-label="Toggle production sub-departments"
                >
                  {isProductionMenuOpen ? "▲" : "▼"}
                </button>
              </div>
              {isProductionMenuOpen && (
                <div className="inventory-dept-options" role="listbox">
                  {filteredProductionOptions.length > 0 ? (
                    filteredProductionOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="inventory-dept-option"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, production: option }));
                          setIsProductionMenuOpen(false);
                        }}
                      >
                        {option}
                      </button>
                    ))
                  ) : (
                    <div className="inventory-dept-empty">
                      No matching sub-department
                    </div>
                  )}
                </div>
              )}
            </div>
            <small className="inventory-input-hint">
              Type to filter production sub-departments.
            </small>
          </label>
          <label>
            Delivery Date (Time)
            <input
              type="datetime-local"
              name="deliveryDateTime"
              value={formData.deliveryDateTime}
              onChange={handleChange}
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
                ? "Save Client Item"
                : "Add Client Item"}
          </button>
        </div>
      </form>

      <div className="inventory-table-card">
        <div className="inventory-table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Order No</th>
                <th>Job Lead</th>
                <th>Date Received</th>
                <th>Item Description</th>
                <th>Quantity</th>
                <th>Production</th>
                <th>Delivery Date (Time)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                paginatedItems.map((item) => (
                  <tr key={item._id}>
                    <td>{item.orderNo || "N/A"}</td>
                    <td>{item.jobLead || "N/A"}</td>
                    <td>{formatDate(item.dateReceived)}</td>
                    <td>{item.itemDescription || "N/A"}</td>
                    <td>{item.quantity ?? "N/A"}</td>
                    <td>{item.production || "N/A"}</td>
                    <td>{formatDateTime(item.deliveryDateTime)}</td>
                    <td>
                      <div className="inventory-row-actions">
                        <button
                          type="button"
                          className="inventory-icon-btn edit"
                          title="Edit Client Item"
                          onClick={() => handleEdit(item)}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="inventory-icon-btn delete"
                          title="Delete Client Item"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <TrashIcon width={18} height={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="inventory-empty">
                    No client items recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {items.length > 0 && (
        <div className="inventory-pagination">
          <span className="inventory-pagination-summary">
            Showing {pageStart}-{pageEnd} of {items.length}
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
        title="Delete Client Item"
        message={`Delete item "${deleteTarget?.itemDescription || ""}" from inventory?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
};

export default ClientItemsInventory;
