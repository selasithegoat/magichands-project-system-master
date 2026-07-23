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

const PURCHASE_STATUS_OPTIONS = [
  "Not Started",
  "Ordered",
  "Partially Received",
  "Received",
  "Cancelled",
];

const ACTIVE_PURCHASE_STATUSES = new Set([
  "Ordered",
  "Partially Received",
  "Received",
]);

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

const getPurchaseStatus = (item) =>
  PURCHASE_STATUS_OPTIONS.includes(item?.purchaseStatus)
    ? item.purchaseStatus
    : "Not Started";

const isPurchaseActive = (item) =>
  ACTIVE_PURCHASE_STATUSES.has(getPurchaseStatus(item));

const getPurchaseOrderedQuantity = (item) => {
  const numeric = Number(item?.orderedQuantity);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const getPurchaseReceivedQuantity = (item) => {
  const numeric = Number(item?.receivedQuantity);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const getPurchaseNeedQuantity = (item) => {
  if (isLineFulfilled(item)) return 0;

  const explicitToOrder = getQuantityToOrder(item);
  if (explicitToOrder > 0) return explicitToOrder;

  const remaining = getRemainingQuantity(item);
  if (remaining === null || remaining <= 0) return 0;

  const available = getAvailableQuantity(item);
  if (available !== null) return Math.max(remaining - available, 0);

  return remaining;
};

const hasOpenPurchaseNeed = (item) =>
  getPurchaseNeedQuantity(item) > 0 && !isPurchaseActive(item);

const shouldShowPurchaseTracker = (item) =>
  !isLineFulfilled(item) &&
  (getPurchaseNeedQuantity(item) > 0 || getPurchaseStatus(item) !== "Not Started");

const getLineKey = (request, item, index = 0) =>
  `${request?._id || "request"}:${item?._id || index}`;

const buildPurchaseDraft = (item) => {
  const purchaseNeed = getPurchaseNeedQuantity(item);
  const orderedQuantity = getPurchaseOrderedQuantity(item);
  const receivedQuantity = getPurchaseReceivedQuantity(item);
  const currentStatus = getPurchaseStatus(item);

  return {
    purchaseStatus:
      currentStatus === "Not Started" && purchaseNeed > 0 ? "Ordered" : currentStatus,
    orderedQuantity: qtyInputValue(orderedQuantity || purchaseNeed),
    receivedQuantity: qtyInputValue(receivedQuantity),
    supplierName: item?.supplierName || "",
    purchaseOrderNumber: item?.purchaseOrderNumber || "",
    expectedDeliveryDate: toDateInputValue(item?.expectedDeliveryDate),
    purchaseNote: item?.purchaseNote || "",
  };
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
  const purchaseItems = items.filter(hasOpenPurchaseNeed).length;
  const orderedItems = items.filter(isPurchaseActive).length;
  const receivedPurchaseItems = items.filter(
    (item) => getPurchaseStatus(item) === "Received",
  ).length;
  const partialItems = items.filter(
    (item) => isLinePartiallyFulfilled(item) || getIssuedQuantity(item) > 0,
  ).length;
  const fulfilledItems = items.filter(isLineFulfilled).length;
  const matchedItems = items.filter((item) => Boolean(getInventoryRecordId(item)))
    .length;
  const totalToOrder = items.reduce(
    (sum, item) => sum + getPurchaseNeedQuantity(item),
    0,
  );
  const totalOrdered = items.reduce(
    (sum, item) => sum + getPurchaseOrderedQuantity(item),
    0,
  );
  const totalReceived = items.reduce(
    (sum, item) => sum + getPurchaseReceivedQuantity(item),
    0,
  );
  const totalIssued = items.reduce((sum, item) => sum + getIssuedQuantity(item), 0);

  return {
    totalItems,
    readyItems,
    purchaseItems,
    orderedItems,
    receivedPurchaseItems,
    partialItems,
    fulfilledItems,
    matchedItems,
    totalToOrder,
    totalOrdered,
    totalReceived,
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
  if (laneKey === "ordered") {
    return !isClosed && (status === "Ordered" || metrics.orderedItems > 0);
  }
  if (laneKey === "done") return isClosed;

  return (
    !isClosed &&
    status !== "Ordered" &&
    status !== "Partially Fulfilled" &&
    metrics.readyItems === 0 &&
    metrics.purchaseItems === 0 &&
    metrics.orderedItems === 0 &&
    metrics.partialItems === 0
  );
};

const getLineWorkStatus = (item) => {
  const purchaseStatus = getPurchaseStatus(item);
  if (isLineFulfilled(item)) return { label: "Issued", tone: "fulfilled" };
  if (purchaseStatus === "Received") return { label: "Purchase received", tone: "received" };
  if (purchaseStatus === "Partially Received") {
    return { label: "Part received", tone: "ordered" };
  }
  if (purchaseStatus === "Ordered") return { label: "Ordered", tone: "ordered" };
  if (isLinePartiallyFulfilled(item)) return { label: "Partial", tone: "partial" };
  if (getPurchaseNeedQuantity(item) > 0) {
    return { label: "Needs purchase", tone: "purchase" };
  }
  if (canIssueLineFromStock(item)) return { label: "Ready to issue", tone: "ready" };
  if (getInventoryRecordId(item)) return { label: "Matched", tone: "matched" };
  return { label: "Needs review", tone: "pending" };
};

const getRequestTimeline = (request) => {
  if (!request) return [];
  const entries = [];
  if (request.createdAt) {
    entries.push({
      label: "Request created",
      meta: `${formatDate(request.createdAt)} by ${getRequesterName(request)}`,
    });
  }
  getRequestItems(request).forEach((item) => {
    if (item.purchaseUpdatedAt) {
      const purchaseMeta = [
        formatDate(item.purchaseUpdatedAt),
        item.purchaseOrderNumber ? `PO ${item.purchaseOrderNumber}` : "",
        item.supplierName,
      ]
        .filter(Boolean)
        .join(" - ");
      entries.push({
        label: `Purchase ${getPurchaseStatus(item).toLowerCase()}`,
        meta: `${purchaseMeta || formatDate(item.purchaseUpdatedAt)} - ${
          item.materialName
        }`,
      });
    }
    if (item.fulfilledAt) {
      entries.push({
        label:
          item.fulfillmentStatus === "Fulfilled"
            ? "Stock issued"
            : "Stock partially issued",
        meta: `${formatDate(item.fulfilledAt)} - ${item.materialName}`,
      });
    }
  });
  if (request.statusUpdatedAt) {
    entries.push({
      label: `Status set to ${request.status || "Pending"}`,
      meta: formatDate(request.statusUpdatedAt),
    });
  }
  return entries;
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
  const [purchasingLineKey, setPurchasingLineKey] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState(null);
  const [confirmFulfillLine, setConfirmFulfillLine] = useState(null);
  const [detailRequestId, setDetailRequestId] = useState("");
  const [purchaseDrafts, setPurchaseDrafts] = useState({});
  const [issueDraft, setIssueDraft] = useState({
    issueQuantity: "",
    remainingToOrder: "",
    note: "",
  });

  const fetchRequests = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
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
      if (!silent) {
        setRequests([]);
        setError(requestError.message || "Failed to load material requests.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [departmentFilter, statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const handleRealtime = (event) => {
      const path = String(event?.detail?.path || "");
      if (path.startsWith("/api/material-requests")) {
        fetchRequests({ silent: true });
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
  const detailRequest = useMemo(
    () => requests.find((request) => request._id === detailRequestId) || null,
    [detailRequestId, requests],
  );
  const detailRequestMetrics = useMemo(
    () => getRequestQueueMetrics(detailRequest),
    [detailRequest],
  );
  const detailTimeline = useMemo(
    () => getRequestTimeline(detailRequest),
    [detailRequest],
  );
  const reviewPanelId = "inventory-material-review-panel";
  const isActive = isOpen || isHovering || hasFocusWithin;

  const handleBlurCapture = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setHasFocusWithin(false);
    }
  };

  const updateStatus = async (request, status) => {
    if (
      !request?._id ||
      request.status === status ||
      updatingId ||
      deletingId ||
      purchasingLineKey
    ) {
      return;
    }
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
    if (!requestId || updatingId || deletingId || purchasingLineKey) return;
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
      if (detailRequestId === requestId) setDetailRequestId("");
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

  const getPurchaseDraft = (lineKey, item) =>
    purchaseDrafts[lineKey] || buildPurchaseDraft(item);

  const updatePurchaseDraft = (lineKey, item, updates) => {
    setPurchaseDrafts((previous) => ({
      ...previous,
      [lineKey]: {
        ...buildPurchaseDraft(item),
        ...(previous[lineKey] || {}),
        ...updates,
      },
    }));
  };

  const savePurchaseLine = async (request, item, index) => {
    const itemId = item?._id;
    const lineKey = getLineKey(request, item, index);
    if (
      !request?._id ||
      !itemId ||
      updatingId ||
      deletingId ||
      purchasingLineKey
    ) {
      return;
    }

    const draft = getPurchaseDraft(lineKey, item);
    const orderedQuantity = parseQtyValue(draft.orderedQuantity) ?? 0;
    const receivedQuantity = parseQtyValue(draft.receivedQuantity) ?? 0;
    if (orderedQuantity < 0) {
      setError("Enter a valid ordered quantity. Use 0 if nothing is ordered.");
      return;
    }
    if (receivedQuantity < 0) {
      setError("Enter a valid received quantity. Use 0 if nothing is received.");
      return;
    }
    if (receivedQuantity > orderedQuantity) {
      setError("Received quantity cannot be greater than ordered quantity.");
      return;
    }

    setPurchasingLineKey(lineKey);
    setError("");
    try {
      const payload = await fetchInventory(
        buildSourcePath(
          `/api/material-requests/${request._id}/items/${itemId}/purchase`,
        ),
        {
          method: "PATCH",
          body: JSON.stringify({
            purchaseStatus: draft.purchaseStatus,
            orderedQuantity,
            receivedQuantity,
            supplierName: draft.supplierName.trim(),
            purchaseOrderNumber: draft.purchaseOrderNumber.trim(),
            expectedDeliveryDate: draft.expectedDeliveryDate,
            purchaseNote: draft.purchaseNote.trim(),
          }),
          toast: { success: "Purchase tracking updated." },
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
      setPurchaseDrafts((previous) => {
        const next = { ...previous };
        delete next[lineKey];
        return next;
      });
      await fetchRequests();
    } catch (purchaseError) {
      setError(purchaseError.message || "Failed to update purchase tracking.");
    } finally {
      setPurchasingLineKey("");
    }
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
    const lineKey = getLineKey(request, item);
    if (
      !request?._id ||
      !itemId ||
      updatingId ||
      deletingId ||
      fulfillingLineKey ||
      purchasingLineKey
    ) {
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
    {detailRequest ? (
      <div
        className="inventory-material-detail-backdrop"
        role="presentation"
        onClick={() => setDetailRequestId("")}
      >
        <aside
          className="inventory-material-detail-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Material request details"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="inventory-material-detail-header">
            <div>
              <span>Request Details</span>
              <h3>{getRequestTitle(detailRequest)}</h3>
            </div>
            <button
              type="button"
              className="inventory-material-icon-button"
              onClick={() => setDetailRequestId("")}
              aria-label="Close request details"
            >
              <XIcon />
            </button>
          </header>

          <div className="inventory-material-detail-body">
            <section className="inventory-material-detail-panel">
              <div className="inventory-material-detail-topline">
                <span
                  className={`inventory-material-type-badge ${
                    isProjectRequest(detailRequest) ? "order" : "material"
                  }`}
                >
                  {isProjectRequest(detailRequest) ? "Project" : "Department"}
                </span>
                <span
                  className={`inventory-material-chip ${statusClass(
                    detailRequest.status,
                  )}`}
                >
                  {detailRequest.status || "Pending"}
                </span>
              </div>
              <dl className="inventory-material-detail-meta-grid">
                <div>
                  <dt>Requester</dt>
                  <dd>{getRequesterName(detailRequest)}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{detailRequest.department || "-"}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{detailRequest.priority || "Normal"}</dd>
                </div>
                <div>
                  <dt>Needed by</dt>
                  <dd>{formatDate(detailRequest.neededBy) || "-"}</dd>
                </div>
              </dl>
              <div className="inventory-material-work-summary">
                {detailRequestMetrics.readyItems > 0 ? (
                  <span className="ready">
                    {detailRequestMetrics.readyItems} ready to issue
                  </span>
                ) : null}
                {detailRequestMetrics.purchaseItems > 0 ? (
                  <span className="purchase">
                    {formatQty(detailRequestMetrics.totalToOrder)} to order
                  </span>
                ) : null}
                {detailRequestMetrics.orderedItems > 0 ? (
                  <span className="ordered">
                    {formatQty(detailRequestMetrics.totalOrdered)} ordered
                  </span>
                ) : null}
                {detailRequestMetrics.receivedPurchaseItems > 0 ? (
                  <span className="received">
                    {formatQty(detailRequestMetrics.totalReceived)} received
                  </span>
                ) : null}
                {detailRequestMetrics.partialItems > 0 ? (
                  <span className="partial">
                    {formatQty(detailRequestMetrics.totalIssued)} issued
                  </span>
                ) : null}
                <span>
                  {detailRequestMetrics.fulfilledItems}/
                  {detailRequestMetrics.totalItems} done
                </span>
                <span>
                  {detailRequestMetrics.matchedItems}/
                  {detailRequestMetrics.totalItems} matched
                </span>
              </div>
            </section>

            {isProjectRequest(detailRequest) ? (
              <section className="inventory-material-detail-panel">
                <span className="inventory-material-detail-kicker">Project context</span>
                <strong>{getProjectRequestTitle(detailRequest)}</strong>
                <div className="inventory-material-meta">
                  {detailRequest.projectOrderId ? (
                    <span>Order {detailRequest.projectOrderId}</span>
                  ) : null}
                  {detailRequest.projectClientName ? (
                    <span>{detailRequest.projectClientName}</span>
                  ) : null}
                  {detailRequest.projectItemBreakdown ? (
                    <span>{detailRequest.projectItemBreakdown}</span>
                  ) : null}
                </div>
              </section>
            ) : null}

            {detailRequest.notes ? (
              <section className="inventory-material-detail-panel">
                <span className="inventory-material-detail-kicker">Requester note</span>
                <p>{detailRequest.notes}</p>
              </section>
            ) : null}

            <section className="inventory-material-detail-panel">
              <div className="inventory-material-detail-section-title">
                <span>Line items</span>
                <small>{getRequestItems(detailRequest).length} total</small>
              </div>
              <div className="inventory-material-detail-lines">
                {getRequestItems(detailRequest).map((item, index) => {
                  const lineKey = getLineKey(detailRequest, item, index);
                  const stockLabel = getLiveStockLabel(item);
                  const inventorySku = getInventorySku(item);
                  const canIssue = canIssueLineFromStock(item);
                  const issuedQty = getIssuedQuantity(item);
                  const quantityToOrder = getPurchaseNeedQuantity(item);
                  const purchaseStatus = getPurchaseStatus(item);
                  const orderedQty = getPurchaseOrderedQuantity(item);
                  const receivedQty = getPurchaseReceivedQuantity(item);
                  const purchaseDraft = getPurchaseDraft(lineKey, item);
                  const lineStatus = getLineWorkStatus(item);
                  return (
                    <div
                      className={`inventory-material-detail-line ${lineStatus.tone}`}
                      key={item._id || `${detailRequest._id}-${index}`}
                    >
                      <div className="inventory-material-detail-line-title">
                        <span>{index + 1}</span>
                        <div>
                          <strong>{item.materialName}</strong>
                          <small>
                            Requested: {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                          </small>
                        </div>
                        <em>{lineStatus.label}</em>
                      </div>
                      <div className="inventory-material-detail-line-facts">
                        {inventorySku ? <span>ID {inventorySku}</span> : null}
                        {stockLabel ? <span>{stockLabel}</span> : null}
                        {issuedQty > 0 ? (
                          <span>
                            Issued {formatQty(issuedQty)}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                        ) : null}
                        {quantityToOrder > 0 ? (
                          <span>
                            To order {formatQty(quantityToOrder)}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                        ) : null}
                        {purchaseStatus !== "Not Started" ? (
                          <span>Purchase {purchaseStatus}</span>
                        ) : null}
                        {orderedQty > 0 ? (
                          <span>
                            Ordered {formatQty(orderedQty)}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                        ) : null}
                        {receivedQty > 0 ? (
                          <span>
                            Received {formatQty(receivedQty)}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                        ) : null}
                        {item.expectedDeliveryDate ? (
                          <span>ETA {formatDate(item.expectedDeliveryDate)}</span>
                        ) : null}
                        {item.stockAfterQty !== null &&
                        item.stockAfterQty !== undefined ? (
                          <span>Stock after {formatQty(item.stockAfterQty)}</span>
                        ) : null}
                      </div>
                      {shouldShowPurchaseTracker(item) ? (
                        <div className="inventory-material-purchase-tracker">
                          <div className="inventory-material-purchase-title">
                            <span>Purchase tracker</span>
                            <small>
                              Need {formatQty(quantityToOrder)}
                              {item.unit ? ` ${item.unit}` : ""}
                            </small>
                          </div>
                          <div className="inventory-material-purchase-grid">
                            <label>
                              <span>Status</span>
                              <select
                                value={purchaseDraft.purchaseStatus}
                                onChange={(event) =>
                                  updatePurchaseDraft(lineKey, item, {
                                    purchaseStatus: event.target.value,
                                  })
                                }
                              >
                                {PURCHASE_STATUS_OPTIONS.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Ordered qty</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={purchaseDraft.orderedQuantity}
                                onChange={(event) =>
                                  updatePurchaseDraft(lineKey, item, {
                                    orderedQuantity: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span>Received qty</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={purchaseDraft.receivedQuantity}
                                onChange={(event) =>
                                  updatePurchaseDraft(lineKey, item, {
                                    receivedQuantity: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span>Expected date</span>
                              <input
                                type="date"
                                value={purchaseDraft.expectedDeliveryDate}
                                onChange={(event) =>
                                  updatePurchaseDraft(lineKey, item, {
                                    expectedDeliveryDate: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span>Supplier</span>
                              <input
                                type="text"
                                value={purchaseDraft.supplierName}
                                onChange={(event) =>
                                  updatePurchaseDraft(lineKey, item, {
                                    supplierName: event.target.value,
                                  })
                                }
                                placeholder="Supplier name"
                              />
                            </label>
                            <label>
                              <span>PO / ref</span>
                              <input
                                type="text"
                                value={purchaseDraft.purchaseOrderNumber}
                                onChange={(event) =>
                                  updatePurchaseDraft(lineKey, item, {
                                    purchaseOrderNumber: event.target.value,
                                  })
                                }
                                placeholder="PO number"
                              />
                            </label>
                            <label className="full">
                              <span>Purchase note</span>
                              <textarea
                                rows="2"
                                value={purchaseDraft.purchaseNote}
                                onChange={(event) =>
                                  updatePurchaseDraft(lineKey, item, {
                                    purchaseNote: event.target.value,
                                  })
                                }
                                placeholder="Supplier, expected delivery, or receiving note"
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="inventory-material-purchase-save"
                            onClick={() => savePurchaseLine(detailRequest, item, index)}
                            disabled={
                              Boolean(purchasingLineKey) ||
                              Boolean(fulfillingLineKey) ||
                              updatingId === detailRequest._id ||
                              deletingId === detailRequest._id
                            }
                          >
                            {purchasingLineKey === lineKey
                              ? "Saving purchase..."
                              : "Save purchase"}
                          </button>
                        </div>
                      ) : null}
                      {canIssue ? (
                        <button
                          type="button"
                          className="inventory-material-issue-button"
                          onClick={() => openFulfillLine(detailRequest, item)}
                          disabled={
                            Boolean(fulfillingLineKey) ||
                            Boolean(purchasingLineKey) ||
                            updatingId === detailRequest._id ||
                            deletingId === detailRequest._id
                          }
                        >
                          {fulfillingLineKey === lineKey
                            ? "Issuing..."
                            : isLinePartiallyFulfilled(item)
                              ? "Issue balance"
                              : "Issue from stock"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="inventory-material-detail-panel">
              <div className="inventory-material-detail-section-title">
                <span>Status workflow</span>
                <small>Update request state</small>
              </div>
              <div className="inventory-material-detail-actions">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={detailRequest.status === status ? "active" : ""}
                    onClick={() => updateStatus(detailRequest, status)}
                    disabled={
                      updatingId === detailRequest._id ||
                      deletingId === detailRequest._id ||
                      Boolean(purchasingLineKey)
                    }
                  >
                    {status}
                  </button>
                ))}
                <button
                  type="button"
                  className="danger"
                  onClick={() => setConfirmDeleteRequest(detailRequest)}
                  disabled={
                    updatingId === detailRequest._id ||
                    deletingId === detailRequest._id ||
                    Boolean(purchasingLineKey)
                  }
                >
                  <TrashIcon />
                  Delete
                </button>
              </div>
            </section>

            <section className="inventory-material-detail-panel">
              <div className="inventory-material-detail-section-title">
                <span>Activity</span>
                <small>{detailTimeline.length || 0} events</small>
              </div>
              {detailTimeline.length ? (
                <ol className="inventory-material-timeline">
                  {detailTimeline.map((entry, index) => (
                    <li key={`${entry.label}-${index}`}>
                      <strong>{entry.label}</strong>
                      <span>{entry.meta}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No activity recorded yet.</p>
              )}
            </section>
          </div>
        </aside>
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
                      {queueMetrics.orderedItems > 0 ? (
                        <span className="ordered">
                          {formatQty(queueMetrics.totalOrdered)} ordered
                        </span>
                      ) : null}
                      {queueMetrics.receivedPurchaseItems > 0 ? (
                        <span className="received">
                          {formatQty(queueMetrics.totalReceived)} received
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
                        const lineKey = getLineKey(request, item, index);
                        const stockLabel = getLiveStockLabel(item);
                        const inventorySku = getInventorySku(item);
                        const canIssue = canIssueLineFromStock(item);
                        const isPartial = isLinePartiallyFulfilled(item);
                        const issuedQty = getIssuedQuantity(item);
                        const quantityToOrder = getPurchaseNeedQuantity(item);
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
                                Boolean(purchasingLineKey) ||
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
                      <button
                        type="button"
                        className="inventory-material-detail-button"
                        onClick={() => setDetailRequestId(request._id)}
                      >
                        View details
                      </button>
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={request.status === status ? "active" : ""}
                          onClick={() => updateStatus(request, status)}
                          disabled={
                            updatingId === request._id ||
                            deletingId === request._id ||
                            Boolean(purchasingLineKey)
                          }
                        >
                          {status}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setConfirmDeleteRequest(request)}
                        disabled={
                          updatingId === request._id ||
                          deletingId === request._id ||
                          Boolean(purchasingLineKey)
                        }
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
