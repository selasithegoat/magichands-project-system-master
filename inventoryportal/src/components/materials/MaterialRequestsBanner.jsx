import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TrashIcon, XIcon } from "../icons/Icons";
import ConfirmDialog from "../ui/ConfirmDialog";
import { fetchInventory } from "../../utils/inventoryApi";
import { showToast } from "../../utils/toast";
import "./MaterialRequestsBanner.css";

const STATUS_OPTIONS = ["Pending", "In Review", "Ordered", "Fulfilled", "Declined"];

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

const statusClass = (status) =>
  String(status || "Pending")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const buildSourcePath = (path) => {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}source=inventory`;
};

const getRequesterName = (request) => {
  const populated = request?.requestedBy;
  if (populated && typeof populated === "object") {
    const fullName = [populated.firstName, populated.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fullName) return fullName;
    if (populated.employeeId) return populated.employeeId;
  }
  return request?.requestedByName || request?.requestedByEmployeeId || "User";
};

const isProjectRequest = (request) => request?.requestType === "project";

const getProjectRequestTitle = (request) =>
  request?.projectName || request?.projectOrderId || "Project request";

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
  if (items.length > 1) return `${items.length} materials requested`;
  return items[0]?.materialName || "Material request";
};

const requestMaterialDelete = async (path, method = "DELETE") => {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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
    return await requestMaterialDelete(
      buildSourcePath(`/api/material-requests/${requestId}`),
    );
  } catch (deleteError) {
    if (deleteError.status !== 404) throw deleteError;
    return requestMaterialDelete(
      buildSourcePath(`/api/material-requests/${requestId}/delete`),
      "POST",
    );
  }
};

const MaterialRequestsBanner = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "160" });
      if (departmentFilter !== "all") params.set("department", departmentFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const payload = await fetchInventory(
        buildSourcePath(`/api/material-requests?${params}`),
        { toast: { silent: true } },
      );
      setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
      setDepartments(Array.isArray(payload?.departments) ? payload.departments : []);
      setStatusCounts(payload?.statusCounts || {});
    } catch (requestError) {
      setRequests([]);
      setError(requestError.message || "Failed to load material requests.");
    } finally {
      setLoading(false);
    }
  }, [departmentFilter, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const handleRealtime = (event) => {
      const path = String(event?.detail?.path || "");
      if (path.startsWith("/api/material-requests")) {
        fetchRequests();
      }
    };
    window.addEventListener("mh:data-changed", handleRealtime);
    return () => window.removeEventListener("mh:data-changed", handleRealtime);
  }, [fetchRequests]);

  const pendingCount = useMemo(
    () => Number(statusCounts?.Pending) || 0,
    [statusCounts],
  );
  const reviewPanelId = "inventory-material-review-panel";
  const isActive = isOpen || isHovering || hasFocusWithin;

  const handleBlurCapture = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setHasFocusWithin(false);
    }
  };

  const updateStatus = async (request, status) => {
    if (!request?._id || request.status === status || updatingId || deletingId) return;
    setUpdatingId(request._id);
    setError("");
    try {
      const payload = await fetchInventory(
        buildSourcePath(`/api/material-requests/${request._id}/status`),
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
          toast: { success: "Material request updated." },
        },
      );
      setRequests((previous) =>
        previous.map((item) => (item._id === payload._id ? payload : item)),
      );
    } catch (statusError) {
      setError(statusError.message || "Failed to update material request.");
    } finally {
      setUpdatingId("");
    }
  };

  const deleteRequest = async () => {
    const request = confirmDeleteRequest;
    const requestId = request?._id;
    if (!requestId || updatingId || deletingId) return;
    setDeletingId(requestId);
    setError("");

    try {
      await deleteMaterialRequestById(requestId);
      showToast({
        type: "success",
        title: "Success",
        message: "Material request deleted.",
      });
      setRequests((previous) => previous.filter((item) => item._id !== requestId));
      await fetchRequests();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete material request.");
    } finally {
      setDeletingId("");
      setConfirmDeleteRequest(null);
    }
  };

  const content = (
    <>
    <ConfirmDialog
      isOpen={Boolean(confirmDeleteRequest)}
      title="Delete Material Request"
      message={`Delete the "${getRequestTitle(confirmDeleteRequest)}" request?`}
      confirmText={deletingId ? "Deleting..." : "Delete Request"}
      cancelText="Cancel"
      onConfirm={deleteRequest}
      onClose={() => setConfirmDeleteRequest(null)}
    />
    <section
      className={`inventory-material-shell ${isActive ? "is-active" : ""} ${
        isOpen ? "is-open" : ""
      }`.trim()}
      aria-label="Material requests"
    >
      <aside
        className={`inventory-material-peek ${isActive ? "active" : ""} ${
          isOpen ? "open" : ""
        }`.trim()}
        aria-label="Material request review panel"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocusCapture={() => setHasFocusWithin(true)}
        onBlurCapture={handleBlurCapture}
      >
        <button
          type="button"
          className="inventory-material-peek-tab"
          onClick={() => setIsOpen((previous) => !previous)}
          onMouseEnter={() => setIsHovering(true)}
          onFocus={() => setHasFocusWithin(true)}
          aria-expanded={isOpen}
          aria-controls={reviewPanelId}
        >
          <span>Requests</span>
        </button>

        <div className="inventory-material-surface" id={reviewPanelId}>
          <header className="inventory-material-header">
            <div>
              <span>Stores Queue</span>
              <h2>Department Material Requests</h2>
            </div>
            <div className="inventory-material-header-actions">
              <strong
                className="inventory-material-count"
                aria-label={`${pendingCount} pending material requests`}
              >
                {pendingCount}
              </strong>
              <button
                type="button"
                className="inventory-material-icon-button"
                onClick={() => setIsOpen(false)}
                aria-label="Close material requests"
              >
                <XIcon />
              </button>
            </div>
          </header>

          <div className="inventory-material-controls">
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              aria-label="Filter material requests by department"
            >
              <option value="all">All departments</option>
              {departments.map((department) => (
                <option key={department.key} value={department.key}>
                  {department.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter material requests by status"
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button type="button" onClick={fetchRequests} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="inventory-material-body">
            {error ? <p className="inventory-material-error">{error}</p> : null}
            {loading && !requests.length ? (
              <div className="inventory-material-empty">Loading...</div>
            ) : requests.length ? (
              <div className="inventory-material-grid">
                {requests.map((request) => (
                  <article className="inventory-material-card" key={request._id}>
                    <div className="inventory-material-card-header">
                      <div className="inventory-material-title-line">
                        <span
                          className={`inventory-material-type-badge ${
                            isProjectRequest(request) ? "order" : "material"
                          }`}
                        >
                          {isProjectRequest(request) ? "Order Item" : "Material"}
                        </span>
                        <strong>{getRequestTitle(request)}</strong>
                      </div>
                      <span className={`inventory-material-chip ${statusClass(request.status)}`}>
                        {request.status || "Pending"}
                      </span>
                    </div>
                    <div className="inventory-material-meta">
                      <span>
                        {getRequestItems(request).length}{" "}
                        {getRequestItems(request).length === 1 ? "item" : "items"}
                      </span>
                      <span>{request.department}</span>
                      {request.priority ? <span>{request.priority}</span> : null}
                      {request.neededBy ? (
                        <span>Needed {formatDate(request.neededBy)}</span>
                      ) : null}
                    </div>
                    <div className="inventory-material-meta">
                      <span>{getRequesterName(request)}</span>
                      <span>{formatDate(request.createdAt)}</span>
                    </div>
                    <div className="inventory-material-line-items">
                      {getRequestItems(request).map((item, index) => (
                        <div
                          className="inventory-material-line-item"
                          key={item._id || `${request._id}-${index}`}
                        >
                          <span>{index + 1}</span>
                          <div className="inventory-material-line-item-name">
                            <strong>{item.materialName}</strong>
                            {isProjectRequest(request) && !item.projectItemId ? (
                              <em>Purchase</em>
                            ) : null}
                          </div>
                          <small>
                            {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                          </small>
                        </div>
                      ))}
                    </div>
                    {isProjectRequest(request) ? (
                      <div className="inventory-material-project-context">
                        <span>Order Item Request</span>
                        <strong>{getProjectRequestTitle(request)}</strong>
                        <div className="inventory-material-meta">
                          {request.projectOrderId ? (
                            <span>Order {request.projectOrderId}</span>
                          ) : null}
                          {request.projectClientName ? (
                            <span>{request.projectClientName}</span>
                          ) : null}
                          {request.inventorySku ? (
                            <span>ID {request.inventorySku}</span>
                          ) : null}
                          {request.inventoryWarehouse ? (
                            <span>{request.inventoryWarehouse}</span>
                          ) : null}
                        </div>
                        {request.projectItemBreakdown ? (
                          <p>{request.projectItemBreakdown}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {request.notes ? <p>{request.notes}</p> : null}
                    <div className="inventory-material-actions">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={request.status === status ? "active" : ""}
                          onClick={() => updateStatus(request, status)}
                          disabled={updatingId === request._id || deletingId === request._id}
                        >
                          {status}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setConfirmDeleteRequest(request)}
                        disabled={updatingId === request._id || deletingId === request._id}
                        aria-label={
                          deletingId === request._id
                            ? "Deleting material request"
                            : `Delete ${getRequestTitle(request)}`
                        }
                        title="Delete request"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="inventory-material-empty">
                No material requests found.
              </div>
            )}
          </div>
        </div>
      </aside>
    </section>
    </>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
};

export default MaterialRequestsBanner;
