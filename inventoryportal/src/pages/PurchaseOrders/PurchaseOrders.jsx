import { useEffect, useState } from "react";
import {
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
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
import useInventoryGlobalSearch from "../../hooks/useInventoryGlobalSearch";
import {
  formatCurrencyPlaceholder,
  formatCurrencyPair,
  formatCurrencyValue,
  getCurrencyPrefix,
  parseCurrencyValue,
  useInventoryCurrency,
} from "../../utils/currency";
import "./PurchaseOrders.css";

const getStatusClass = (status) =>
  `status-${String(status || "").toLowerCase().replace(/\s+/g, "-")}`;

const DEFAULT_LIMIT = 5;
const SUPPLIER_TONES = [
  "blue",
  "amber",
  "green",
  "slate",
  "indigo",
  "violet",
  "rose",
  "teal",
  "orange",
];

const buildInitials = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const pickTone = (seed) => {
  if (!seed) {
    return SUPPLIER_TONES[Math.floor(Math.random() * SUPPLIER_TONES.length)];
  }
  const hash = String(seed)
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return SUPPLIER_TONES[hash % SUPPLIER_TONES.length];
};

const formatTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};


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
  const [activeStatus, setActiveStatus] = useState("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [formData, setFormData] = useState({
    poNumber: "",
    supplierName: "",
    category: "",
    total: "",
    status: "Pending",
    createdDate: "",
    createdTime: "",
    itemsCount: "",
    itemNames: "",
    itemImages: [],
  });
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const { currency, rate } = useInventoryCurrency();

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
    setPage(1);
  });


  useEffect(() => {
    let isMounted = true;

    const loadOrders = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(DEFAULT_LIMIT));
        if (activeStatus !== "All") {
          params.set("status", activeStatus);
        }
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        if (supplierFilter.trim()) {
          params.set("supplier", supplierFilter.trim());
        }

        const payload = await fetchInventory(
          `/api/inventory/purchase-orders?${params.toString()}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((order, index) => {
          const supplier = order.supplierName || order.supplier || "";
          const items = Array.isArray(order.items) ? order.items : [];
          const primaryItemName = items[0]?.name || "";
          const primaryItemImage = items[0]?.image || "";
          return {
            id: order._id || order.id || `${index}`,
            poNumber: order.poNumber || order.orderNo || order.id || "",
            itemName: primaryItemName,
            itemImage: primaryItemImage,
            supplier,
            supplierInitials:
              order.supplierInitials || buildInitials(supplier),
            supplierTone: order.supplierTone || pickTone(supplier || order.id),
            items: items.map((item, itemIndex) => ({
              id: item._id || item.id || `${order._id || index}-${itemIndex}`,
              name: item.name || "",
              image: item.image || "",
            })),
            itemsCount: Number.isFinite(order.itemsCount)
              ? order.itemsCount
              : items.length,
            category: order.category || "",
            total: order.total || "",
            status: order.status || order.requestStatus || "Pending",
            dateRequestPlaced:
              order.dateRequestPlaced || order.createdAt || order.created,
            updatedAt: order.updatedAt || order.updated || null,
            createdDate: formatShortDate(
              order.dateRequestPlaced || order.createdAt || order.created,
            ),
            createdTime: formatTime(
              order.dateRequestPlaced || order.createdAt || order.created,
            ),
            updatedDate: formatShortDate(order.updatedAt || order.updated),
            updatedTime: formatTime(order.updatedAt || order.updated),
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
  }, [page, refreshKey, activeStatus, searchTerm, supplierFilter]);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const payload = await fetchInventory("/api/inventory/categories/options");
        const categories = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
        if (!isMounted) return;
        setCategoryOptions(categories);
      } catch {
        if (!isMounted) return;
        setCategoryOptions([]);
      }
    };

    loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

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
      if (activeStatus !== "All" && nextStatus !== activeStatus) {
        triggerRefresh();
      }
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

  const handleTabChange = (status) => {
    setActiveStatus(status);
    setPage(1);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleSupplierChange = (event) => {
    setSupplierFilter(event.target.value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSupplierFilter("");
    setPage(1);
  };

  const handleExport = () => {
    if (!orders.length) return;
    const rows = orders.map((order) => ({
      "PO Number": order.poNumber,
      "Item Name": order.itemName || "",
      Supplier: order.supplier,
      Category: order.category || "",
      "Items Ordered": order.itemsCount,
      "Total Cost": formatCurrencyValue(order.total, currency, rate),
      Status: order.status,
      "Created Date": `${order.createdDate} ${order.createdTime}`.trim(),
    }));

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const cell = String(row[header] ?? "");
            return `"${cell.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `purchase-orders-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const currencyPlaceholder = formatCurrencyPlaceholder(currency);
  const currencyLabel = getCurrencyPrefix(currency);
  const categoryQuery = String(formData.category || "").trim().toLowerCase();
  const filteredCategoryOptions = categoryOptions.filter((category) =>
    categoryQuery ? category.toLowerCase().includes(categoryQuery) : true,
  );
  const visibleCategoryOptions = filteredCategoryOptions.slice(0, 6);
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
      category: "",
      total: "",
      status: "Pending",
      createdDate: "",
      createdTime: "",
      itemsCount: "",
      itemNames: "",
      itemImages: [],
    });
    setActionError("");
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleQuickAction = (event) => {
      const action = String(event?.detail?.action || "");
      if (action !== "receive-shipment") return;
      openCreateModal();
    };
    window.addEventListener("inventory:quick-action", handleQuickAction);
    return () =>
      window.removeEventListener("inventory:quick-action", handleQuickAction);
  }, [openCreateModal]);

  const openEditModal = (order) => {
    const itemNames = order.items
      .map((item) => item.name)
      .filter(Boolean)
      .join(", ");
    const itemImages = order.items
      .map((item) => item.image)
      .filter(Boolean);

    setEditingOrder(order);
    setFormData({
      poNumber: order.poNumber || "",
      supplierName: order.supplier || "",
      category: order.category || "",
      total: order.total || "",
      status: order.status || "Pending",
      createdDate: order.createdDate || "",
      createdTime: order.createdTime || "",
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

  const handleCategoryFocus = () => {
    setCategorySuggestionsOpen(true);
  };

  const handleCategoryBlur = () => {
    setTimeout(() => setCategorySuggestionsOpen(false), 150);
  };

  const handleCategoryInput = (event) => {
    updateField("category")(event);
    setCategorySuggestionsOpen(true);
  };

  const selectCategorySuggestion = (value) => {
    setFormData((prev) => ({ ...prev, category: value }));
    setCategorySuggestionsOpen(false);
  };

  const handleImagesSelected = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          }),
      ),
    ).then((results) => {
      const cleaned = results.filter(Boolean);
      if (!cleaned.length) return;
      setFormData((prev) => ({
        ...prev,
        itemImages: [...prev.itemImages, ...cleaned],
      }));
    });
  };

  const removeImage = (index) => {
    setFormData((prev) => ({
      ...prev,
      itemImages: prev.itemImages.filter((_, idx) => idx !== index),
    }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.poNumber || !formData.supplierName || !formData.total) {
      setActionError("PO number, supplier name, and total are required.");
      return;
    }
    const names = formData.itemNames
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const images = Array.isArray(formData.itemImages)
      ? formData.itemImages
      : [];
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
      items,
      itemsCount,
      category: formData.category,
      total: formData.total,
      status: formData.status,
      ...(editingOrder
        ? {}
        : {
            dateRequestPlaced: new Date().toISOString(),
            supplierTone: pickTone(formData.supplierName),
          }),
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
          <button
            type="button"
            className="ghost-button"
            onClick={() => setFiltersOpen((prev) => !prev)}
          >
            <SortIcon className="button-icon" />
            Filter
          </button>
          <button type="button" className="ghost-button" onClick={handleExport}>
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
        <button
          type="button"
          className={`tab ${activeStatus === "All" ? "active" : ""}`}
          onClick={() => handleTabChange("All")}
        >
          All Orders <span className="tab-count">{total || 0}</span>
        </button>
        <button
          type="button"
          className={`tab ${activeStatus === "Pending" ? "active" : ""}`}
          onClick={() => handleTabChange("Pending")}
        >
          Pending
        </button>
        <button
          type="button"
          className={`tab ${activeStatus === "Ordered" ? "active" : ""}`}
          onClick={() => handleTabChange("Ordered")}
        >
          Ordered
        </button>
        <button
          type="button"
          className={`tab ${activeStatus === "Received" ? "active" : ""}`}
          onClick={() => handleTabChange("Received")}
        >
          Received
        </button>
        <button
          type="button"
          className={`tab ${activeStatus === "Cancelled" ? "active" : ""}`}
          onClick={() => handleTabChange("Cancelled")}
        >
          Cancelled
        </button>
      </div>

      {filtersOpen ? (
        <div className="orders-filters">
          <div className="filters-row">
            <div className="input-shell">
              <SearchIcon className="search-icon" />
              <input
                type="text"
                placeholder="Search PO number, supplier, or item..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
            <input
              className="filter-input"
              type="text"
              placeholder="Filter by supplier"
              value={supplierFilter}
              onChange={handleSupplierChange}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={handleClearFilters}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

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
              <div className="cell item-name-cell full" data-label="Item Name">
                <span className="item-avatar">
                  {order.itemImage ? (
                    <img src={order.itemImage} alt={order.itemName} />
                  ) : (
                    <span className="item-fallback">
                      {(order.itemName || "?").charAt(0)}
                    </span>
                  )}
                </span>
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
                <span className="muted items-count">
                  {order.itemsCount} items
                </span>
              </div>
              <div className="cell total-cost" data-label="Total Cost">
                <span
                  className="tooltip-anchor"
                  data-tooltip={
                    formatCurrencyPair(order.total, currency, rate)
                      .alternateValue || undefined
                  }
                >
                  {formatCurrencyValue(order.total, currency, rate)}
                </span>
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
                <div>{order.createdDate}</div>
                {order.createdTime ? (
                  <span className="time-muted">{order.createdTime}</span>
                ) : null}
                {order.updatedAt &&
                order.updatedAt !== order.dateRequestPlaced ? (
                  <span className="time-muted update">
                    Last update {order.updatedDate} {order.updatedTime}
                  </span>
                ) : null}
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
          <div
            className="summary-value tooltip-anchor"
            data-tooltip={
              formatCurrencyPair(totalSpending, currency, rate).alternateValue ||
              undefined
            }
          >
            {formatCurrencyValue(totalSpending, currency, rate)}
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
              <span>Category</span>
              <div className="input-suggest">
                <input
                  type="text"
                  value={formData.category}
                  onChange={handleCategoryInput}
                  onFocus={handleCategoryFocus}
                  onBlur={handleCategoryBlur}
                  list="po-category-options"
                  placeholder="Category"
                />
                {categorySuggestionsOpen && visibleCategoryOptions.length ? (
                  <div className="suggestions-list">
                    {visibleCategoryOptions.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className="suggestion-item"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectCategorySuggestion(category);
                        }}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
            <label className="modal-field">
              <span>Total Cost ({currencyLabel})</span>
              <div
                className="tooltip-anchor tooltip-field"
                data-tooltip={
                  formData.total
                    ? formatCurrencyPair(formData.total, currency, rate)
                        .alternateValue
                    : undefined
                }
              >
                <input
                  type="text"
                  value={formData.total}
                  onChange={updateField("total")}
                  placeholder={currencyPlaceholder}
                />
              </div>
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
              <span>Created Date &amp; Time</span>
              <input
                type="text"
                value={
                  editingOrder
                    ? `${formData.createdDate || ""} ${formData.createdTime || ""}`.trim()
                    : `${formatShortDate(new Date())} ${formatTime(new Date())}`
                }
                readOnly
              />
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
              <span>Item Images</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImagesSelected}
              />
              <span className="modal-help">
                Upload images in the same order as item names.
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
          {formData.itemImages?.length ? (
            <div className="upload-preview">
              {formData.itemImages.map((image, index) => (
                <div className="preview-item" key={`${image}-${index}`}>
                  <img src={image} alt={`Item ${index + 1}`} />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => removeImage(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <datalist id="po-category-options">
            {categoryOptions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
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
