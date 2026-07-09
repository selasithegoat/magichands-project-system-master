import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CartIcon from "../icons/CartIcon";
import EditIcon from "../icons/EditIcon";
import TrashIcon from "../icons/TrashIcon";
import XIcon from "../icons/XIcon";
import ConfirmationModal from "../ui/ConfirmationModal";
import "./MaterialRequests.css";

const PRIORITY_OPTIONS = ["Low", "Normal", "High", "Urgent"];

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const formatDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const toDateInputValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const statusClass = (status) =>
  String(status || "Pending")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const getEmptyRequestItem = () => ({
  clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  materialName: "",
  quantity: "",
  unit: "",
});

const getInitialForm = (department) => ({
  department,
  priority: "Normal",
  neededBy: "",
  notes: "",
  items: [getEmptyRequestItem()],
});

const isProjectRequest = (request) => request?.requestType === "project";

const getRequestItems = (request) => {
  if (Array.isArray(request?.items) && request.items.length) {
    return request.items;
  }
  if (!request?.materialName) return [];
  return [
    {
      materialName: request.materialName,
      quantity: request.quantity,
      unit: request.unit,
      projectItemId: request.projectItemId,
    },
  ];
};

const getRequestTitle = (request) => {
  const items = getRequestItems(request);
  if (items.length > 1) return `${items.length} materials`;
  return items[0]?.materialName || "Material request";
};

const requestMaterialDelete = async (path, method = "DELETE") => {
  const response = await fetch(path, {
    method,
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestError = new Error(
      payload?.message || "Failed to delete material request.",
    );
    requestError.status = response.status;
    throw requestError;
  }
  return payload;
};

const deleteMaterialRequestById = async (requestId) => {
  try {
    return await requestMaterialDelete(`/api/material-requests/${requestId}`);
  } catch (deleteError) {
    if (deleteError.status !== 404) throw deleteError;
    return requestMaterialDelete(
      `/api/material-requests/${requestId}/delete`,
      "POST",
    );
  }
};

const MaterialRequestsFab = ({ user, hasFrontDeskStack = false }) => {
  const departmentOptions = useMemo(
    () => toArray(user?.department).map((item) => String(item || "").trim()).filter(Boolean),
    [user?.department],
  );
  const defaultDepartment = departmentOptions[0] || "";
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(() => getInitialForm(defaultDepartment));
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState(null);
  const successTimerRef = useRef(null);
  const isEditing = Boolean(editingRequestId);

  useEffect(() => {
    setForm((previous) => ({
      ...previous,
      department: previous.department || defaultDepartment,
    }));
  }, [defaultDepartment]);

  useEffect(
    () => () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    },
    [],
  );

  const showSuccess = (message) => {
    setSuccess(message);
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = window.setTimeout(() => setSuccess(""), 6000);
  };

  const fetchRecentRequests = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const response = await fetch("/api/material-requests?mine=true&limit=8", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load material requests.");
      }
      setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
    } catch (requestError) {
      setError(requestError.message || "Failed to load material requests.");
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) fetchRecentRequests();
  }, [fetchRecentRequests, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleRealtime = (event) => {
      const path = String(event?.detail?.path || "");
      if (path.startsWith("/api/material-requests")) {
        fetchRecentRequests();
      }
    };
    window.addEventListener("mh:data-changed", handleRealtime);
    return () => window.removeEventListener("mh:data-changed", handleRealtime);
  }, [fetchRecentRequests, isOpen]);

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const updateItemField = (clientId, field, value) => {
    setForm((previous) => ({
      ...previous,
      items: previous.items.map((item) =>
        item.clientId === clientId ? { ...item, [field]: value } : item,
      ),
    }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const addItem = () => {
    setForm((previous) => ({
      ...previous,
      items: [...previous.items, getEmptyRequestItem()],
    }));
  };

  const removeItem = (clientId) => {
    setForm((previous) => ({
      ...previous,
      items:
        previous.items.length > 1
          ? previous.items.filter((item) => item.clientId !== clientId)
          : previous.items,
    }));
  };

  const cancelEdit = () => {
    setEditingRequestId("");
    setForm(getInitialForm(form.department || defaultDepartment));
    setError("");
    setSuccess("");
  };

  const startEditRequest = (request) => {
    if (!request?._id || submitting || deletingId) return;
    const requestItems = getRequestItems(request);
    setEditingRequestId(request._id);
    setForm({
      department: request.department || defaultDepartment,
      priority: PRIORITY_OPTIONS.includes(request.priority) ? request.priority : "Normal",
      neededBy: toDateInputValue(request.neededBy),
      notes: request.notes || "",
      items: requestItems.map((item) => ({
        clientId:
          item._id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        materialName: item.materialName || "",
        quantity: item.quantity || "",
        unit: item.unit || "",
      })),
    });
    setError("");
    setSuccess("");
  };

  const closeModal = () => {
    if (submitting || deletingId) return;
    setIsOpen(false);
    setEditingRequestId("");
    setForm(getInitialForm(defaultDepartment));
    setError("");
    setSuccess("");
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const activeEditId = editingRequestId;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        activeEditId ? `/api/material-requests/${activeEditId}` : "/api/material-requests",
        {
          method: activeEditId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            items: form.items.map((item) => ({
              materialName: item.materialName.trim(),
              quantity: item.quantity.trim(),
              unit: item.unit.trim(),
            })),
            notes: form.notes.trim(),
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to submit material request.");
      }

      setEditingRequestId("");
      setForm(getInitialForm(form.department || defaultDepartment));
      showSuccess(
        activeEditId ? "Material request updated." : "Material request submitted.",
      );
      await fetchRecentRequests();
    } catch (submitError) {
      setError(submitError.message || "Failed to submit material request.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRequest = async () => {
    const request = confirmDeleteRequest;
    const requestId = request?._id;
    if (!requestId || deletingId || submitting) return;

    setDeletingId(requestId);
    setError("");
    setSuccess("");

    try {
      await deleteMaterialRequestById(requestId);
      setRequests((previous) => previous.filter((item) => item._id !== requestId));
      if (editingRequestId === requestId) {
        setEditingRequestId("");
        setForm(getInitialForm(defaultDepartment));
      }
      showSuccess("Material request deleted.");
      await fetchRecentRequests();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete material request.");
    } finally {
      setDeletingId("");
      setConfirmDeleteRequest(null);
    }
  };

  const canSubmit =
    form.department &&
    form.items.length > 0 &&
    form.items.every(
      (item) => item.materialName.trim() && item.quantity.trim(),
    ) &&
    !submitting;

  return (
    <>
      <ConfirmationModal
        isOpen={Boolean(confirmDeleteRequest)}
        title="Delete Material Request"
        message={`Delete the "${getRequestTitle(confirmDeleteRequest)}" request?`}
        onConfirm={deleteRequest}
        onCancel={() => setConfirmDeleteRequest(null)}
        confirmText={deletingId ? "Deleting..." : "Delete Request"}
        cancelText="Cancel"
      />

      <button
        type="button"
        className={[
          "material-request-fab",
          hasFrontDeskStack ? "with-frontdesk-stack" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setIsOpen(true)}
        aria-label="Request materials"
      >
        <span className="material-request-fab-icon">
          <CartIcon />
        </span>
        <span className="material-request-fab-label">Materials</span>
      </button>

      {isOpen && (
        <div className="material-request-overlay" onClick={closeModal}>
          <section
            className="material-request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="material-request-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="material-request-header">
              <div>
                <span className="material-request-kicker">Department Request</span>
                <h2 id="material-request-title">Materials</h2>
              </div>
              <button
                type="button"
                className="material-request-close"
                onClick={closeModal}
                aria-label="Close material request form"
              >
                <XIcon width={18} height={18} />
              </button>
            </header>

            <div className="material-request-body">
              <form className="material-request-form" onSubmit={submitRequest}>
                <label className="material-request-field">
                  <span>Department</span>
                  <select
                    value={form.department}
                    onChange={(event) => updateField("department", event.target.value)}
                    disabled={departmentOptions.length <= 1}
                  >
                    {departmentOptions.length ? (
                      departmentOptions.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))
                    ) : (
                      <option value="">No department assigned</option>
                    )}
                  </select>
                </label>

                <label className="material-request-field">
                  <span>Priority</span>
                  <select
                    value={form.priority}
                    onChange={(event) => updateField("priority", event.target.value)}
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>

                <section
                  className="material-request-items-editor"
                  aria-labelledby="material-request-items-title"
                >
                  <div className="material-request-items-heading">
                    <div>
                      <h3 id="material-request-items-title">Materials</h3>
                      <p>Add everything needed for this request.</p>
                    </div>
                    <button
                      type="button"
                      className="material-request-add-item"
                      onClick={addItem}
                      disabled={form.items.length >= 25}
                    >
                      + Add material
                    </button>
                  </div>

                  <div className="material-request-items-list">
                    {form.items.map((item, index) => (
                      <div className="material-request-item-editor" key={item.clientId}>
                        <div className="material-request-item-number">
                          <span>{index + 1}</span>
                          <strong>Material {index + 1}</strong>
                        </div>
                        <label className="material-request-field material-name">
                          <span>Material</span>
                          <input
                            type="text"
                            value={item.materialName}
                            onChange={(event) =>
                              updateItemField(
                                item.clientId,
                                "materialName",
                                event.target.value,
                              )
                            }
                            placeholder="Item name"
                            maxLength={120}
                          />
                        </label>
                        <label className="material-request-field">
                          <span>Quantity</span>
                          <input
                            type="text"
                            value={item.quantity}
                            onChange={(event) =>
                              updateItemField(
                                item.clientId,
                                "quantity",
                                event.target.value,
                              )
                            }
                            placeholder="10"
                            maxLength={60}
                          />
                        </label>
                        <label className="material-request-field">
                          <span>Unit</span>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(event) =>
                              updateItemField(
                                item.clientId,
                                "unit",
                                event.target.value,
                              )
                            }
                            placeholder="pcs, packs, rolls"
                            maxLength={40}
                          />
                        </label>
                        {form.items.length > 1 ? (
                          <button
                            type="button"
                            className="material-request-remove-item"
                            onClick={() => removeItem(item.clientId)}
                            aria-label={`Remove material ${index + 1}`}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>

                <label className="material-request-field">
                  <span>Needed By</span>
                  <input
                    type="date"
                    value={form.neededBy}
                    onChange={(event) => updateField("neededBy", event.target.value)}
                  />
                </label>

                <label className="material-request-field full-width">
                  <span>Notes</span>
                  <textarea
                    rows="4"
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    placeholder="Optional details"
                    maxLength={800}
                  />
                </label>

                {error && <p className="material-request-error">{error}</p>}
                {success && <p className="material-request-success">{success}</p>}
              </form>

              <section className="material-request-recent" aria-label="Recent requests">
                <h3 className="material-request-recent-title">Recent Requests</h3>
                {loading ? (
                  <div className="material-request-empty">Loading...</div>
                ) : requests.length ? (
                  <div className="material-request-list">
                    {requests.map((request) => (
                      <article className="material-request-card" key={request._id}>
                        <div className="material-request-card-header">
                          <div className="material-request-title-line">
                            <span
                              className={`material-request-type-badge ${
                                isProjectRequest(request) ? "order" : "material"
                              }`}
                            >
                              {isProjectRequest(request) ? "Order Item" : "Material"}
                            </span>
                            <strong>{getRequestTitle(request)}</strong>
                          </div>
                          <span
                            className={`material-request-chip ${statusClass(
                              request.status,
                            )}`}
                          >
                            {request.status || "Pending"}
                          </span>
                        </div>
                        <div className="material-request-meta">
                          <span>
                            {getRequestItems(request).length}{" "}
                            {getRequestItems(request).length === 1 ? "item" : "items"}
                          </span>
                          <span>{request.department}</span>
                          {request.neededBy ? (
                            <span>Needed {formatDate(request.neededBy)}</span>
                          ) : null}
                        </div>
                        <div className="material-request-line-items">
                          {getRequestItems(request).map((item, index) => (
                            <div
                              className="material-request-line-item"
                              key={item._id || `${request._id}-${index}`}
                            >
                              <span>{index + 1}</span>
                              <div className="material-request-line-item-name">
                                <strong>{item.materialName}</strong>
                                {isProjectRequest(request) && !item.projectItemId ? (
                                  <em>Purchase</em>
                                ) : null}
                              </div>
                              <small>
                                {item.quantity}
                                {item.unit ? ` ${item.unit}` : ""}
                                {item.inventorySku ? ` · ${item.inventorySku}` : ""}
                              </small>
                            </div>
                          ))}
                        </div>
                        {isProjectRequest(request) ? (
                          <div className="material-request-project-context">
                            <span>Project</span>
                            <strong>
                              {request.projectName ||
                                request.projectOrderId ||
                                "Project request"}
                            </strong>
                            {request.projectOrderId ? (
                              <small>Order {request.projectOrderId}</small>
                            ) : null}
                          </div>
                        ) : null}
                        {request.notes ? <p>{request.notes}</p> : null}
                        <div className="material-request-card-actions">
                          {!isProjectRequest(request) ? (
                            <button
                              type="button"
                              className="material-request-mini-button"
                              onClick={() => startEditRequest(request)}
                              disabled={submitting || Boolean(deletingId)}
                              aria-label={`Edit ${getRequestTitle(request)}`}
                              title="Edit request"
                            >
                              <EditIcon />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="material-request-mini-button danger"
                            onClick={() => setConfirmDeleteRequest(request)}
                            disabled={submitting || Boolean(deletingId)}
                            aria-label={
                              deletingId === request._id
                                ? "Deleting material request"
                                : `Delete ${getRequestTitle(request)}`
                            }
                            title="Delete request"
                          >
                            <TrashIcon width={16} height={16} color="currentColor" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="material-request-empty">No material requests yet.</div>
                )}
              </section>
            </div>

            <footer className="material-request-footer">
              <button
                type="button"
                className="material-request-secondary"
                onClick={isEditing ? cancelEdit : closeModal}
              >
                {isEditing ? "Cancel Edit" : "Close"}
              </button>
              <button
                type="button"
                className="material-request-primary"
                onClick={submitRequest}
                disabled={!canSubmit}
              >
                {submitting
                  ? isEditing
                    ? "Saving..."
                    : "Submitting..."
                  : isEditing
                    ? "Save Changes"
                    : "Submit Request"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
};

export default MaterialRequestsFab;
