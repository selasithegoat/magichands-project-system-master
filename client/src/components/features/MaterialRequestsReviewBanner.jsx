import React, { useCallback, useEffect, useMemo, useState } from "react";
import TrashIcon from "../icons/TrashIcon";
import XIcon from "../icons/XIcon";
import "./MaterialRequests.css";

const STATUS_OPTIONS = ["Pending", "In Review", "Fulfilled", "Declined"];

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

const toStatusClass = (status) =>
  String(status || "Pending")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const buildSourcePath = (path, requestSource) => {
  const source = String(requestSource || "").trim();
  if (!source) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}source=${encodeURIComponent(source)}`;
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

const requestMaterialDelete = async (path, requestSource, method = "DELETE") => {
  const response = await fetch(buildSourcePath(path, requestSource), {
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

const deleteMaterialRequestById = async (requestId, requestSource) => {
  try {
    return await requestMaterialDelete(
      `/api/material-requests/${requestId}`,
      requestSource,
    );
  } catch (deleteError) {
    if (deleteError.status !== 404) throw deleteError;
    return requestMaterialDelete(
      `/api/material-requests/${requestId}/delete`,
      requestSource,
      "POST",
    );
  }
};

const MaterialRequestsReviewBanner = ({ requestSource = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "160" });
      if (departmentFilter !== "all") params.set("department", departmentFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await fetch(
        buildSourcePath(`/api/material-requests?${params}`, requestSource),
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load material requests.");
      }
      setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
      setDepartments(Array.isArray(payload?.departments) ? payload.departments : []);
      setStatusCounts(payload?.statusCounts || {});
    } catch (requestError) {
      setRequests([]);
      setError(requestError.message || "Failed to load material requests.");
    } finally {
      setLoading(false);
    }
  }, [departmentFilter, requestSource, statusFilter]);

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
  const portalClass = requestSource === "admin" ? "admin-portal" : "";
  const reviewPanelId = `material-review-panel-${requestSource || "portal"}`;

  const updateStatus = async (request, status) => {
    if (!request?._id || request.status === status || updatingId || deletingId) return;
    setUpdatingId(request._id);
    setError("");
    try {
      const response = await fetch(
        buildSourcePath(`/api/material-requests/${request._id}/status`, requestSource),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to update material request.");
      }
      setRequests((previous) =>
        previous.map((item) => (item._id === payload._id ? payload : item)),
      );
    } catch (statusError) {
      setError(statusError.message || "Failed to update material request.");
    } finally {
      setUpdatingId("");
    }
  };

  const deleteRequest = async (request) => {
    const requestId = request?._id;
    if (!requestId || updatingId || deletingId) return;

    const confirmed = window.confirm(
      `Delete "${request.materialName || "this material"}" request?`,
    );
    if (!confirmed) return;

    setDeletingId(requestId);
    setError("");

    try {
      await deleteMaterialRequestById(requestId, requestSource);
      setRequests((previous) => previous.filter((item) => item._id !== requestId));
      await fetchRequests();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete material request.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <section
      className={`material-review-shell ${portalClass} ${isOpen ? "is-open" : ""}`.trim()}
      aria-label="Material requests"
    >
      <aside
        className={`material-review-peek ${isOpen ? "open" : ""}`}
        aria-label="Material request review panel"
      >
        <button
          type="button"
          className="material-review-peek-tab"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-expanded={isOpen}
          aria-controls={reviewPanelId}
        >
          <span>Requests</span>
        </button>

        <div className="material-review-surface" id={reviewPanelId}>
          <header className="material-review-header">
            <div className="material-review-title">
              <span className="material-review-kicker">Stores Queue</span>
              <h2>Department Material Requests</h2>
            </div>
            <div className="material-review-header-actions">
              <span
                className="material-review-count"
                aria-label={`${pendingCount} pending material requests`}
              >
                {pendingCount}
              </span>
              <button
                type="button"
                className="material-review-icon-button"
                onClick={() => setIsOpen(false)}
                aria-label="Close material requests"
              >
                <XIcon width={18} height={18} />
              </button>
            </div>
          </header>

          <div className="material-review-controls">
            <select
              className="material-review-select"
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
              className="material-review-select"
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
            <button
              type="button"
              className="material-review-refresh"
              onClick={fetchRequests}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="material-review-body">
            {error ? <p className="material-review-error">{error}</p> : null}
            {loading && !requests.length ? (
              <div className="material-review-empty">Loading...</div>
            ) : requests.length ? (
              <div className="material-review-grid">
                {requests.map((request) => (
                  <article className="material-review-card" key={request._id}>
                    <div className="material-review-card-header">
                      <strong>{request.materialName}</strong>
                      <span
                        className={`material-review-chip ${toStatusClass(
                          request.status,
                        )}`}
                      >
                        {request.status || "Pending"}
                      </span>
                    </div>
                    <div className="material-review-meta">
                      <span>
                        {request.quantity}
                        {request.unit ? ` ${request.unit}` : ""}
                      </span>
                      <span>{request.department}</span>
                      {request.priority ? <span>{request.priority}</span> : null}
                      {request.neededBy ? (
                        <span>Needed {formatDate(request.neededBy)}</span>
                      ) : null}
                    </div>
                    <div className="material-review-meta">
                      <span>{getRequesterName(request)}</span>
                      <span>{formatDate(request.createdAt)}</span>
                    </div>
                    {request.notes ? <p>{request.notes}</p> : null}
                    <div className="material-review-card-actions">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`material-review-status-button ${
                            request.status === status ? "active" : ""
                          }`}
                          onClick={() => updateStatus(request, status)}
                          disabled={updatingId === request._id || deletingId === request._id}
                        >
                          {status}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="material-review-status-button danger"
                        onClick={() => deleteRequest(request)}
                        disabled={updatingId === request._id || deletingId === request._id}
                        aria-label={
                          deletingId === request._id
                            ? "Deleting material request"
                            : `Delete ${request.materialName || "material request"}`
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
              <div className="material-review-empty">No material requests found.</div>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
};

export default MaterialRequestsReviewBanner;
