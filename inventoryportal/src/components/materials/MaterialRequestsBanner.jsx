import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TrashIcon, XIcon } from "../icons/Icons";
import ConfirmDialog from "../ui/ConfirmDialog";
import { fetchInventory } from "../../utils/inventoryApi";
import { showToast } from "../../utils/toast";
import "./MaterialRequestsBanner.css";

const STATUS_OPTIONS = [
  "Pending",
  "In Review",
  "Ordered",
  "Partially Fulfilled",
  "Fulfilled",
  "Declined",
];

const QUEUE_LANES = [
  { key: "new", label: "New", hint: "Needs review" },
  { key: "ready", label: "Ready to Issue", hint: "Stock available" },
  { key: "purchase", label: "Needs Purchase", hint: "Balance to order" },
  { key: "partial", label: "Partial", hint: "Some stock issued" },
  { key: "ordered", label: "Ordered", hint: "Waiting on supply" },
  { key: "done", label: "Done", hint: "Fulfilled or closed" },
];

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

const formatQty = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return Number.isInteger(numeric)
    ? numeric.toLocaleString("en-US")
    : Number(numeric.toFixed(2)).toLocaleString("en-US");
};

const parseQtyValue = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number.parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
};

const qtyInputValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  const rounded = Number(numeric.toFixed(4));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const getInventoryRecord = (item) =>
  item?.inventoryRecord && typeof item.inventoryRecord === "object"
    ? item.inventoryRecord
    : null;

const getInventoryRecordId = (item) => {
  const record = item?.inventoryRecord;
  if (!record) return "";
  if (typeof record === "string") return record;
  return record?._id || record?.id || "";
};

const getInventorySku = (item) =>
  item?.inventorySku || getInventoryRecord(item)?.sku || "";

const getLiveStockLabel = (item) => {
  const record = getInventoryRecord(item);
  if (!record || !Number.isFinite(Number(record.qtyValue))) return "";
  return `Stock now: ${formatQty(record.qtyValue)}${
    record.qtyLabel ? ` (${record.qtyLabel})` : ""
  }`;
};

const isLineFulfilled = (item) => item?.fulfillmentStatus === "Fulfilled";
const isLinePartiallyFulfilled = (item) =>
  item?.fulfillmentStatus === "Partially Fulfilled";

const canIssueLineFromStock = (item) => {
  const record = getInventoryRecord(item);
  const available = Number(record?.qtyValue ?? item?.inventoryQtyValue);
  return (
    Boolean(getInventoryRecordId(item)) &&
    !isLineFulfilled(item) &&
    Number.isFinite(available) &&
    available > 0
  );
};

const getRequestedQuantity = (item) => parseQtyValue(item?.quantity);

const getIssuedQuantity = (item) => {
  const numeric = Number(item?.fulfilledQuantity);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const getRemainingQuantity = (item) => {
  const stored = Number(item?.remainingQuantity);
  if (Number.isFinite(stored) && stored >= 0 && isLinePartiallyFulfilled(item)) {
    return stored;
  }
  const requested = getRequestedQuantity(item);
  if (requested === null) return null;
  return Math.max(requested - getIssuedQuantity(item), 0);
};

const getQuantityToOrder = (item) => {
  const numeric = Number(item?.quantityToOrder);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const getAvailableQuantity = (item) => {
  const record = getInventoryRecord(item);
  const numeric = Number(record?.qtyValue ?? item?.inventoryQtyValue);
  return Number.isFinite(numeric) ? Math.max(numeric, 0) : null;
};

const buildIssueDraft = (item) => {
  const remaining = getRemainingQuantity(item);
  const available = getAvailableQuantity(item);
  const issueNow =
    remaining !== null && available !== null
      ? Math.min(remaining, available)
      : (available ?? remaining ?? "");
  const remainingToOrder =
    remaining !== null && Number.isFinite(Number(issueNow))
      ? Math.max(remaining - Number(issueNow), 0)
      : getQuantityToOrder(item);

  return {
    issueQuantity: qtyInputValue(issueNow),
    remainingToOrder: qtyInputValue(remainingToOrder),
    note: "",
  };
};

const getRequestQueueMetrics = (request) => {
  const items = getRequestItems(request);
  const totalItems = items.length;
  const readyItems = items.filter(canIssueLineFromStock).length;
  const purchaseItems = items.filter((item) => getQuantityToOrder(item) > 0).length;
  const partialItems = items.filter(
    (item) => isLinePartiallyFulfilled(item) || getIssuedQuantity(item) > 0,
  ).length;
  const fulfilledItems = items.filter(isLineFulfilled).length;
  const matchedItems = items.filter((item) => Boolean(getInventoryRecordId(item)))
    .length;
  const totalToOrder = items.reduce(
    (sum, item) => sum + getQuantityToOrder(item),
    0,
  );
  const totalIssued = items.reduce((sum, item) => sum + getIssuedQuantity(item), 0);

  return {
    totalItems,
    readyItems,
    purchaseItems,
    partialItems,
    fulfilledItems,
    matchedItems,
    totalToOrder,
    totalIssued,
  };
};

const requestMatchesQueueLane = (request, laneKey) => {
  const status = request?.status || "Pending";
  const metrics = getRequestQueueMetrics(request);
  const isClosed = status === "Fulfilled" || status === "Declined";

  if (laneKey === "ready") return !isClosed && metrics.readyItems > 0;
  if (laneKey === "purchase") return !isClosed && metrics.purchaseItems > 0;
  if (laneKey === "partial") {
    return (
      !isClosed &&
      (status === "Partially Fulfilled" || metrics.partialItems > 0)
    );
  }
  if (laneKey === "ordered") return status === "Ordered";
  if (laneKey === "done") return isClosed;

  return (
    !isClosed &&
    status !== "Ordered" &&
    status !== "Partially Fulfilled" &&
    metrics.readyItems === 0 &&
    metrics.purchaseItems === 0 &&
    metrics.partialItems === 0
  );
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [fulfillingLineKey, setFulfillingLineKey] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState(null);
  const [confirmFulfillLine, setConfirmFulfillLine] = useState(null);
  const [issueDraft, setIssueDraft] = useState({
    issueQuantity: "",
    remainingToOrder: "",
    note: "",
  });

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
  const queueCounts = useMemo(
    () =>
      Object.fromEntries(
        QUEUE_LANES.map((lane) => [
          lane.key,
          requests.filter((request) =>
            requestMatchesQueueLane(request, lane.key),
          ).length,
        ]),
      ),
    [requests],
  );
  const visibleRequests = useMemo(
    () =>
      requests.filter((request) =>
        requestMatchesQueueLane(request, queueFilter),
      ),
    [queueFilter, requests],
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

  const openFulfillLine = (request, item) => {
    setConfirmFulfillLine({ request, item });
    setIssueDraft(buildIssueDraft(item));
  };

  const closeFulfillLine = () => {
    if (fulfillingLineKey) return;
    setConfirmFulfillLine(null);
    setIssueDraft({ issueQuantity: "", remainingToOrder: "", note: "" });
  };

  const updateIssueQuantity = (value) => {
    const remaining = getRemainingQuantity(confirmFulfillLine?.item);
    const issued = parseQtyValue(value);
    setIssueDraft((previous) => ({
      ...previous,
      issueQuantity: value,
      remainingToOrder:
        remaining !== null && issued !== null && issued >= 0
          ? qtyInputValue(Math.max(remaining - issued, 0))
          : previous.remainingToOrder,
    }));
  };

  const fulfillLine = async () => {
    const request = confirmFulfillLine?.request;
    const item = confirmFulfillLine?.item;
    const itemId = item?._id;
    const lineKey = request?._id && itemId ? `${request._id}:${itemId}` : "";
    if (!request?._id || !itemId || updatingId || deletingId || fulfillingLineKey) {
      return;
    }

    const issuedQuantity = parseQtyValue(issueDraft.issueQuantity);
    const remainingToOrder = parseQtyValue(issueDraft.remainingToOrder);
    if (!issuedQuantity || issuedQuantity <= 0) {
      setError("Enter the quantity issued from stock.");
      return;
    }
    if (remainingToOrder === null || remainingToOrder < 0) {
      setError("Enter the quantity remaining to order. Use 0 if nothing remains.");
      return;
    }

    setFulfillingLineKey(lineKey);
    setError("");
    try {
      const payload = await fetchInventory(
        buildSourcePath(
          `/api/material-requests/${request._id}/items/${itemId}/fulfill`,
        ),
        {
          method: "POST",
          body: JSON.stringify({
            issuedQuantity,
            remainingToOrder,
            note: issueDraft.note.trim(),
          }),
          toast: { success: "Stock issued and request updated." },
        },
      );
      const updatedRequest = payload?.request;
      if (updatedRequest?._id) {
        setRequests((previous) =>
          previous.map((entry) =>
            entry._id === updatedRequest._id ? updatedRequest : entry,
          ),
        );
      }
      await fetchRequests();
    } catch (fulfillError) {
      setError(fulfillError.message || "Failed to issue stock.");
    } finally {
      setFulfillingLineKey("");
      setConfirmFulfillLine(null);
      setIssueDraft({ issueQuantity: "", remainingToOrder: "", note: "" });
    }
  };

  const issueDialogItem = confirmFulfillLine?.item;
  const issueDialogAvailable = getAvailableQuantity(issueDialogItem);
  const issueDialogRemaining = getRemainingQuantity(issueDialogItem);
  const issueDialogAlreadyIssued = getIssuedQuantity(issueDialogItem);

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
    {confirmFulfillLine ? (
      <div
        className="inventory-issue-dialog-backdrop"
        role="presentation"
        onClick={closeFulfillLine}
      >
        <form
          className="inventory-issue-dialog"
          onClick={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            fulfillLine();
          }}
        >
          <div>
            <span className="inventory-issue-dialog-kicker">Issue Stock</span>
            <h3>{issueDialogItem?.materialName || "Material item"}</h3>
            <p>
              Record what is leaving inventory now and what still needs to be
              ordered later.
            </p>
          </div>
          <div className="inventory-issue-dialog-summary">
            <span>
              Requested <strong>{issueDialogItem?.quantity || "-"}</strong>
              {issueDialogItem?.unit ? ` ${issueDialogItem.unit}` : ""}
            </span>
            <span>
              In stock{" "}
              <strong>
                {issueDialogAvailable !== null
                  ? formatQty(issueDialogAvailable)
                  : "-"}
              </strong>
            </span>
            <span>
              Already issued <strong>{formatQty(issueDialogAlreadyIssued) || "0"}</strong>
            </span>
            <span>
              Remaining need{" "}
              <strong>
                {issueDialogRemaining !== null
                  ? formatQty(issueDialogRemaining)
                  : "-"}
              </strong>
            </span>
          </div>
          <label className="inventory-issue-dialog-field">
            <span>Quantity issued now</span>
            <input
              type="number"
              min="0"
              step="any"
              max={issueDialogAvailable ?? undefined}
              value={issueDraft.issueQuantity}
              onChange={(event) => updateIssueQuantity(event.target.value)}
              autoFocus
            />
          </label>
          <label className="inventory-issue-dialog-field">
            <span>Remaining quantity to order</span>
            <input
              type="number"
              min="0"
              step="any"
              value={issueDraft.remainingToOrder}
              onChange={(event) =>
                setIssueDraft((previous) => ({
                  ...previous,
                  remainingToOrder: event.target.value,
                }))
              }
            />
          </label>
          <label className="inventory-issue-dialog-field">
            <span>Note</span>
            <textarea
              rows="3"
              value={issueDraft.note}
              onChange={(event) =>
                setIssueDraft((previous) => ({
                  ...previous,
                  note: event.target.value,
                }))
              }
              placeholder="Optional: supplier, PO, or balance note"
            />
          </label>
          <div className="inventory-issue-dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={closeFulfillLine}
              disabled={Boolean(fulfillingLineKey)}
            >
              Cancel
            </button>
            <button type="submit" disabled={Boolean(fulfillingLineKey)}>
              {fulfillingLineKey ? "Issuing..." : "Save Issue"}
            </button>
          </div>
        </form>
      </div>
    ) : null}
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

          <div className="inventory-material-queue-tabs" role="tablist">
            {QUEUE_LANES.map((lane) => (
              <button
                key={lane.key}
                type="button"
                className={`inventory-material-queue-tab ${
                  queueFilter === lane.key ? "active" : ""
                }`.trim()}
                onClick={() => setQueueFilter(lane.key)}
                role="tab"
                aria-selected={queueFilter === lane.key}
              >
                <span>{lane.label}</span>
                <strong>{queueCounts[lane.key] || 0}</strong>
                <small>{lane.hint}</small>
              </button>
            ))}
          </div>

          <div className="inventory-material-body">
            {error ? <p className="inventory-material-error">{error}</p> : null}
            {loading && !requests.length ? (
              <div className="inventory-material-empty">Loading...</div>
            ) : visibleRequests.length ? (
              <div className="inventory-material-grid">
                {visibleRequests.map((request) => {
                  const queueMetrics = getRequestQueueMetrics(request);
                  return (
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
                    <div className="inventory-material-work-summary">
                      {queueMetrics.readyItems > 0 ? (
                        <span className="ready">
                          {queueMetrics.readyItems} ready to issue
                        </span>
                      ) : null}
                      {queueMetrics.purchaseItems > 0 ? (
                        <span className="purchase">
                          {formatQty(queueMetrics.totalToOrder)} to order
                        </span>
                      ) : null}
                      {queueMetrics.partialItems > 0 ? (
                        <span className="partial">
                          {formatQty(queueMetrics.totalIssued)} issued
                        </span>
                      ) : null}
                      <span>
                        {queueMetrics.fulfilledItems}/{queueMetrics.totalItems} done
                      </span>
                      <span>
                        {queueMetrics.matchedItems}/{queueMetrics.totalItems} matched
                      </span>
                    </div>
                    <div className="inventory-material-line-items">
                      {getRequestItems(request).map((item, index) => {
                        const lineKey = `${request._id}:${item._id || index}`;
                        const stockLabel = getLiveStockLabel(item);
                        const inventorySku = getInventorySku(item);
                        const canIssue = canIssueLineFromStock(item);
                        const isPartial = isLinePartiallyFulfilled(item);
                        const issuedQty = getIssuedQuantity(item);
                        const quantityToOrder = getQuantityToOrder(item);
                        return (
                        <div
                          className={`inventory-material-line-item ${
                            isLineFulfilled(item)
                              ? "is-fulfilled"
                              : isPartial
                                ? "is-partial"
                                : ""
                          }`.trim()}
                          title={inventorySku ? `Inventory ID ${inventorySku}` : undefined}
                          key={item._id || `${request._id}-${index}`}
                        >
                          <span>{index + 1}</span>
                          <div className="inventory-material-line-item-main">
                            <div className="inventory-material-line-item-name">
                              <strong>{item.materialName}</strong>
                              {isProjectRequest(request) && !item.projectItemId ? (
                                <em>Purchase</em>
                              ) : null}
                              {isLineFulfilled(item) ? <em>Issued</em> : null}
                              {isPartial ? <em>Partial</em> : null}
                            </div>
                          <small>
                            {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                            {item.inventorySku ? ` · ID ${item.inventorySku}` : ""}
                          </small>
                          {stockLabel ? (
                            <small className="inventory-material-stock-line">
                              {stockLabel}
                            </small>
                          ) : null}
                          {issuedQty > 0 ? (
                            <small className="inventory-material-issued-line">
                              Issued: {formatQty(issuedQty)}
                              {item.unit ? ` ${item.unit}` : ""}
                            </small>
                          ) : null}
                          {quantityToOrder > 0 ? (
                            <small className="inventory-material-order-line">
                              To order: {formatQty(quantityToOrder)}
                              {item.unit ? ` ${item.unit}` : ""}
                            </small>
                          ) : null}
                          </div>
                          {canIssue ? (
                            <button
                              type="button"
                              className="inventory-material-issue-button"
                              onClick={() => openFulfillLine(request, item)}
                              disabled={
                                Boolean(fulfillingLineKey) ||
                                updatingId === request._id ||
                                deletingId === request._id
                              }
                            >
                              {fulfillingLineKey === lineKey
                                ? "Issuing..."
                                : isPartial
                                  ? "Issue balance"
                                  : "Issue from stock"}
                            </button>
                          ) : isLineFulfilled(item) ? (
                            <small className="inventory-material-issued-note">
                              After: {formatQty(item.stockAfterQty)}
                            </small>
                          ) : null}
                        </div>
                        );
                      })}
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
                );
                })}
              </div>
            ) : (
              <div className="inventory-material-empty">
                No requests in this queue lane.
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
