import { useEffect, useState } from "react";
import {
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SortIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import {
  fetchInventory,
  formatShortDate,
  parseListResponse,
} from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import {
  formatCurrencyPlaceholder,
  formatCurrencyValue,
  getCurrencyPrefix,
  parseCurrencyValue,
  useInventoryCurrency,
} from "../../utils/currency";
import "./PurchaseOrders.css";

const getStatusClass = (status) =>
  `status-${String(status || "").toLowerCase().replace(/\s+/g, "-")}`;

const DEFAULT_LIMIT = 5;

const buildInitials = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const PurchaseOrders = () => {
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [formData, setFormData] = useState({
    poNumber: "",
    supplierName: "",
    supplierTone: "blue",
    total: "",
    status: "Pending",
    dateRequestPlaced: "",
    itemsCount: "",
    itemNames: "",
    itemImages: "",
  });
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const currency = useInventoryCurrency();

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  const formatDateInput = (value) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
  };

  useEffect(() => {
    let isMounted = true;

    const loadOrders = async () => {
      try {
        const payload = await fetchInventory(
          `/api/inventory/purchase-orders?page=${page}&limit=${DEFAULT_LIMIT}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((order, index) => {
          const supplier = order.supplierName || order.supplier || "";
          const items = Array.isArray(order.items) ? order.items : [];
          const primaryItemName = items[0]?.name || "";
          return {
            id: order._id || order.id || `${index}`,
            poNumber: order.poNumber || order.orderNo || order.id || "",
            itemName: primaryItemName,
            supplier,
            supplierInitials:
              order.supplierInitials || buildInitials(supplier),
            supplierTone: order.supplierTone || "blue",
            items: items.map((item, itemIndex) => ({
              id: item._id || item.id || `${order._id || index}-${itemIndex}`,
              name: item.name || "",
              image: item.image || "",
            })),
            itemsCount: Number.isFinite(order.itemsCount)
              ? order.itemsCount
              : items.length,
            total: order.total || "",
            status: order.status || order.requestStatus || "Pending",
            dateRequestPlaced:
              order.dateRequestPlaced || order.createdAt || order.created,
            created: formatShortDate(
              order.dateRequestPlaced || order.createdAt || order.created,
            ),
          };
        });

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setOrders(normalized);
        setMeta({
          limit: parsed.limit || DEFAULT_LIMIT,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setOrders([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load purchase orders.");
      }
    };

    loadOrders();
    return () => {
      isMounted = false;
    };
  }, [page, refreshKey]);

  const handleStatusChange = async (orderId, nextStatus) => {
    const previousStatus = orders.find((order) => order.id === orderId)?.status;
    setOrders((prevOrders) =>
      prevOrders.map((order) =>
        order.id === orderId ? { ...order, status: nextStatus } : order,
      ),
    );

    try {
      await fetchInventory(`/api/inventory/purchase-orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch (err) {
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: previousStatus } : order,
        ),
      );
      setError(err?.message || "Unable to update status.");
    }
  };

  const total = meta.total || orders.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + orders.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;

  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    if (meta.totalPages && nextPage > meta.totalPages) return;
    setPage(nextPage);
  };

  const currencyPlaceholder = formatCurrencyPlaceholder(currency);
  const currencyLabel = getCurrencyPrefix(currency);
  const totalSpending = orders.reduce(
    (sum, order) => sum + parseCurrencyValue(order.total),
    0,
  );
  const pendingCount = orders.filter((order) => order.status === "Pending")
    .length;
  const orderedCount = orders.filter((order) => order.status === "Ordered")
    .length;

  const openCreateModal = () => {
    setEditingOrder(null);
    setFormData({
      poNumber: "",
      supplierName: "",
      supplierTone: "blue",
      total: "",
      status: "Pending",
      dateRequestPlaced: "",
      itemsCount: "",
      itemNames: "",
      itemImages: "",
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const openEditModal = (order) => {
    const itemNames = order.items
      .map((item) => item.name)
      .filter(Boolean)
      .join(", ");
    const itemImages = order.items
      .map((item) => item.image)
      .filter(Boolean)
      .join(", ");

    setEditingOrder(order);
    setFormData({
      poNumber: order.poNumber || "",
      supplierName: order.supplier || "",
      supplierTone: order.supplierTone || "blue",
      total: order.total || "",
      status: order.status || "Pending",
      dateRequestPlaced: formatDateInput(order.dateRequestPlaced),
      itemsCount:
        Number.isFinite(order.itemsCount) && order.itemsCount
          ? String(order.itemsCount)
          : "",
      itemNames,
      itemImages,
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setActionError("");
  };

  const updateField = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.poNumber || !formData.supplierName || !formData.total) {
      setActionError("PO number, supplier name, and total are required.");
      return;
    }
    if (!formData.dateRequestPlaced) {
      setActionError("Created date is required.");
      return;
    }

    const names = formData.itemNames
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const images = formData.itemImages
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const items = names.map((name, index) => ({
      name,
      image: images[index] || "",
    }));
    const parsedCount = Number.parseInt(formData.itemsCount, 10);
    const itemsCount = Number.isFinite(parsedCount)
      ? parsedCount
      : items.length;

    setIsSaving(true);
    try {
      const payload = {
        poNumber: formData.poNumber,
        supplierName: formData.supplierName,
        supplierInitials: buildInitials(formData.supplierName),
        supplierTone: formData.supplierTone,
        items,
        itemsCount,
        total: formData.total,
        status: formData.status,
        dateRequestPlaced: formData.dateRequestPlaced,
      };

      const endpoint = editingOrder
        ? `/api/inventory/purchase-orders/${editingOrder.id}`
        : "/api/inventory/purchase-orders";

      await fetchInventory(endpoint, {
        method: editingOrder ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      if (!editingOrder) {
        setPage(1);
      }
      triggerRefresh();
    } catch (err) {
      setActionError(err?.message || "Unable to save purchase order.");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (order) => {
    setDeleteTarget(order);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(`/api/inventory/purchase-orders/${deleteTarget.id}`, {
        method: "DELETE",
      });
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete purchase order.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  return (
    <section className="purchase-orders-page">
      <header className="purchase-orders-header">
        <div>
          <div className="breadcrumb">Purchasing / Orders</div>
          <h2>Purchase Orders</h2>
        </div>
        <div className="purchase-orders-actions">
          <button type="button" className="ghost-button">
            <SortIcon className="button-icon" />
            Filter
          </button>
          <button type="button" className="ghost-button">
            <DownloadIcon className="button-icon" />
            Export
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={openCreateModal}
          >
            <PlusIcon className="button-icon" />
            Create PO
          </button>
        </div>
      </header>

      <div className="orders-tabs">
        <button type="button" className="tab active">
          All Orders <span className="tab-count">{total || 0}</span>
        </button>
        <button type="button" className="tab">
          Pending
        </button>
        <button type="button" className="tab">
          Ordered
        </button>
        <button type="button" className="tab">
          Received
        </button>
        <button type="button" className="tab">
          Cancelled
        </button>
      </div>

      <div className="orders-table-card mobile-card-table">
        <div className="table-header">
          <span>PO Number</span>
          <span>Item Name</span>
          <span>Supplier</span>
          <span>Items Ordered</span>
          <span>Total Cost</span>
          <span>Status</span>
          <span>Created Date</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {orders.map((order) => (
            <div className="table-row" key={order.id}>
              <div className="cell mono" data-label="PO Number">
                {order.poNumber}
              </div>
              <div className="cell" data-label="Item Name">
                <strong>{order.itemName || "-"}</strong>
              </div>
              <div className="cell supplier-cell full" data-label="Supplier">
                <div className={`supplier-avatar ${order.supplierTone}`}>
                  {order.supplierInitials}
                </div>
                <div>
                  <strong>{order.supplier}</strong>
                </div>
              </div>
              <div className="cell items-cell full" data-label="Items Ordered">
                <div className="item-stack" aria-hidden="true">
                  {order.items.map((item) => (
                    <span key={item.id} className="item-avatar">
                      {item.image ? (
                        <img src={item.image} alt={item.name} />
                      ) : (
                        <span className="item-fallback">
                          {(item.name || "?").charAt(0)}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                <span className="muted items-count">
                  {order.itemsCount} items
                </span>
              </div>
              <div className="cell total-cost" data-label="Total Cost">
                {formatCurrencyValue(order.total, currency)}
              </div>
              <div className="cell" data-label="Status">
                <select
                  className={`status-select ${getStatusClass(order.status)}`}
                  value={order.status}
                  aria-label={`Status for ${order.poNumber}`}
                  onChange={(event) =>
                    handleStatusChange(order.id, event.target.value)
                  }
                >
                  <option>Pending</option>
                  <option>Ordered</option>
                  <option>Received</option>
                  <option>Cancelled</option>
                </select>
              </div>
              <div className="cell muted" data-label="Created Date">
                {order.created}
              </div>
              <div className="cell actions-cell" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Edit ${order.id}`}
                  onClick={() => openEditModal(order)}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Delete ${order.id}`}
                  onClick={() => requestDelete(order)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="table-footer">
          <span>
            {error
              ? error
              : `Showing ${startIndex} to ${endIndex} of ${total} orders`}
          </span>
          <div className="pagination">
            <button
              type="button"
              className="ghost-button"
              onClick={() => handlePageChange(page - 1)}
              disabled={isPrevDisabled}
            >
              Previous
            </button>
            {pagination.map((pageItem, index) =>
              pageItem === "ellipsis" ? (
                <span className="page-ellipsis" key={`ellipsis-${index}`}>
                  ...
                </span>
              ) : (
                <button
                  type="button"
                  key={`page-${pageItem}`}
                  className={`page ${pageItem === page ? "active" : ""}`}
                  onClick={() => handlePageChange(pageItem)}
                >
                  {pageItem}
                </button>
              ),
            )}
            <button
              type="button"
              className="ghost-button"
              onClick={() => handlePageChange(page + 1)}
              disabled={isNextDisabled}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="orders-summary">
        <article className="summary-card">
          <span className="summary-label">Total Spending (Loaded)</span>
          <div className="summary-value">
            {formatCurrencyValue(totalSpending, currency)}
          </div>
          <div className="summary-meta">
            {orders.length ? `${orders.length} orders` : "No orders loaded"}
          </div>
        </article>
        <article className="summary-card">
          <span className="summary-label">Pending Approvals</span>
          <div className="summary-value">
            {String(pendingCount).padStart(2, "0")}
          </div>
          <div className="summary-meta">Requires action</div>
        </article>
        <article className="summary-card">
          <span className="summary-label">In Transit</span>
          <div className="summary-value">
            {String(orderedCount).padStart(2, "0")}
          </div>
          <div className="summary-meta">Incoming POs</div>
        </article>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingOrder ? "Edit Purchase Order" : "Create Purchase Order"}
        subtitle="Enter purchase order details and item counts."
        primaryText={isSaving ? "Saving..." : "Save"}
        secondaryText="Cancel"
        onConfirm={handleSave}
        onClose={closeModal}
      >
        <form className="modal-form">
          <div className="modal-grid">
            <label className="modal-field">
              <span>PO Number</span>
              <input
                type="text"
                value={formData.poNumber}
                onChange={updateField("poNumber")}
                placeholder="PO-2024-0001"
              />
            </label>
            <label className="modal-field">
              <span>Supplier Name</span>
              <input
                type="text"
                value={formData.supplierName}
                onChange={updateField("supplierName")}
                placeholder="Supplier name"
              />
            </label>
            <label className="modal-field">
              <span>Total Cost ({currencyLabel})</span>
              <input
                type="text"
                value={formData.total}
                onChange={updateField("total")}
                placeholder={currencyPlaceholder}
              />
            </label>
            <label className="modal-field">
              <span>Status</span>
              <select value={formData.status} onChange={updateField("status")}>
                <option>Pending</option>
                <option>Ordered</option>
                <option>Received</option>
                <option>Cancelled</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Created Date</span>
              <input
                type="date"
                value={formData.dateRequestPlaced}
                onChange={updateField("dateRequestPlaced")}
              />
            </label>
            <label className="modal-field">
              <span>Supplier Tone</span>
              <select
                value={formData.supplierTone}
                onChange={updateField("supplierTone")}
              >
                <option value="blue">Blue</option>
                <option value="amber">Amber</option>
                <option value="green">Green</option>
                <option value="slate">Slate</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Item Names</span>
              <input
                type="text"
                value={formData.itemNames}
                onChange={updateField("itemNames")}
                placeholder="Server Chassis, Rack Switch"
              />
              <span className="modal-help">
                Separate item names with commas.
              </span>
            </label>
            <label className="modal-field">
              <span>Item Image URLs</span>
              <input
                type="text"
                value={formData.itemImages}
                onChange={updateField("itemImages")}
                placeholder="https://..."
              />
              <span className="modal-help">
                Optional. Comma-separated URLs.
              </span>
            </label>
            <label className="modal-field">
              <span>Items Count</span>
              <input
                type="number"
                min="0"
                value={formData.itemsCount}
                onChange={updateField("itemsCount")}
                placeholder="0"
              />
            </label>
          </div>
          {actionError ? <span className="modal-help">{actionError}</span> : null}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Purchase Order"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.poNumber}? This cannot be undone.`
            : "Delete this purchase order?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </section>
  );
};

export default PurchaseOrders;
