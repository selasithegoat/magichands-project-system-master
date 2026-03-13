import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ColumnsIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
  WarningIcon,
} from "../../components/icons/Icons";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import { fetchInventory, parseListResponse } from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import {
  formatCurrencyPlaceholder,
  formatCurrencyPair,
  formatCurrencyValue,
  getCurrencyPrefix,
  useInventoryCurrency,
} from "../../utils/currency";
import "./InventoryRecords.css";

const DEFAULT_RECORD_FORM = {
  item: "",
  warehouse: "",
  sku: "",
  category: "",
  qtyLabel: "",
  qtyState: "good",
  price: "",
  value: "",
  location: "",
  status: "In Stock",
  image: "",
  reorder: false,
};

const DEFAULT_FILTERS = {
  categories: [],
  priceMin: "",
  priceMax: "",
  stockLevel: "All Stock Levels",
  warehouse: "All Locations",
  reorder: "all",
};

const DEFAULT_VISIBLE_COLUMNS = {
  item: true,
  sku: true,
  category: true,
  quantity: true,
  price: true,
  value: true,
  location: true,
  status: true,
};

const STOCK_LEVEL_OPTIONS = [
  "All Stock Levels",
  "In Stock",
  "Low Stock",
  "Out of Stock",
  "Critical",
  "Oversupply",
];

const SORT_OPTIONS = [
  { value: "-createdAt", label: "Newest" },
  { value: "createdAt", label: "Oldest" },
  { value: "item", label: "Item A-Z" },
  { value: "-item", label: "Item Z-A" },
  { value: "sku", label: "SKU A-Z" },
  { value: "category", label: "Category A-Z" },
  { value: "status", label: "Status A-Z" },
  { value: "priceValue", label: "Price Low-High" },
  { value: "-priceValue", label: "Price High-Low" },
];

const TAB_OPTIONS = ["All Items", "Low Stock", "In Warehouse"];

const computeQtyMeta = (qtyState) => {
  const normalized = String(qtyState || "").toLowerCase();
  if (normalized === "critical") return "12%";
  if (normalized === "low") return "35%";
  if (normalized === "full") return "100%";
  if (normalized === "good") return "82%";
  return "";
};

const getQtyFillClass = (qtyState) => {
  const normalized = String(qtyState || "").toLowerCase();
  if (normalized === "critical") return "p12";
  if (normalized === "low") return "p35";
  if (normalized === "full") return "p100";
  return "p82";
};

const InventoryRecords = () => {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: 4,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_RECORD_FORM);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("-createdAt");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [filterError, setFilterError] = useState("");
  const [activeTab, setActiveTab] = useState(TAB_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(
    DEFAULT_VISIBLE_COLUMNS,
  );
  const [categoryOptions, setCategoryOptions] = useState([]);
  const selectAllRef = useRef(null);
  const { currency, rate } = useInventoryCurrency();

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useEffect(() => {
    let isMounted = true;

    const loadRecords = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(meta.limit));
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        if (sortOrder) {
          params.set("sort", sortOrder);
        }
        if (filters.categories.length) {
          params.set("category", filters.categories.join(","));
        }
        if (filters.stockLevel && filters.stockLevel !== "All Stock Levels") {
          params.set("status", filters.stockLevel);
        }
        if (filters.warehouse && filters.warehouse !== "All Locations") {
          params.set("warehouse", filters.warehouse);
        }
        if (filters.reorder === "yes") {
          params.set("reorder", "true");
        }
        if (filters.reorder === "no") {
          params.set("reorder", "false");
        }
        if (filters.priceMin) {
          params.set("priceMin", filters.priceMin);
        }
        if (filters.priceMax) {
          params.set("priceMax", filters.priceMax);
        }
        if (activeTab === "Low Stock") {
          params.set("qtyState", "low,critical");
        }
        if (activeTab === "In Warehouse") {
          params.set("qtyState", "good,full");
        }

        const payload = await fetchInventory(
          `/api/inventory/inventory-records?${params.toString()}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((record, index) => ({
          id: record._id || record.id || `${index}`,
          item: record.item || "",
          warehouse: record.warehouse || record.subtext || "",
          sku: record.sku || "",
          category: record.category || "",
          categoryTone: record.categoryTone || "slate",
          qtyLabel: record.qtyLabel || "",
          qtyMeta: record.qtyMeta || computeQtyMeta(record.qtyState),
          qtyState: record.qtyState || "good",
          price: record.price || "",
          value: record.value || "",
          location: record.location || "",
          status: record.status || "",
          statusTone:
            record.statusTone ||
            String(record.status || "")
              .toLowerCase()
              .replace(/\s+/g, "-"),
          reorder: Boolean(record.reorder),
          image: record.image || "",
        }));

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setRecords(normalized);
        setMeta({
          limit: parsed.limit || meta.limit,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setRecords([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load inventory records.");
      }
    };

    loadRecords();
    return () => {
      isMounted = false;
    };
  }, [activeTab, filters, meta.limit, page, refreshKey, searchTerm, sortOrder]);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const payload = await fetchInventory(
          "/api/inventory/inventory-records/categories",
        );
        const categories = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
        if (!isMounted) return;
        setCategoryOptions(categories);
      } catch {
        if (!isMounted) return;
        const fallback = Array.from(
          new Set(records.map((record) => record.category).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b));
        setCategoryOptions(fallback);
      }
    };

    loadCategories();
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    setSelectedIds([]);
  }, [records]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedIds.length > 0 && selectedIds.length < records.length;
  }, [records.length, selectedIds]);

  const total = meta.total || records.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + records.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;

  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    if (meta.totalPages && nextPage > meta.totalPages) return;
    setPage(nextPage);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleSortChange = (event) => {
    setSortOrder(event.target.value);
    setPage(1);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const updateDraftFilter = (field) => (event) => {
    setDraftFilters((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const toggleCategory = (category) => {
    setDraftFilters((prev) => {
      const exists = prev.categories.includes(category);
      return {
        ...prev,
        categories: exists
          ? prev.categories.filter((item) => item !== category)
          : [...prev.categories, category],
      };
    });
  };

  const handleReorderFilter = (value) => {
    setDraftFilters((prev) => ({ ...prev, reorder: value }));
  };

  const handleApplyFilters = () => {
    setFilterError("");
    const minValue = draftFilters.priceMin
      ? Number(draftFilters.priceMin)
      : null;
    const maxValue = draftFilters.priceMax
      ? Number(draftFilters.priceMax)
      : null;

    if (draftFilters.priceMin && !Number.isFinite(minValue)) {
      setFilterError("Min price must be a number.");
      return;
    }
    if (draftFilters.priceMax && !Number.isFinite(maxValue)) {
      setFilterError("Max price must be a number.");
      return;
    }
    if (
      Number.isFinite(minValue) &&
      Number.isFinite(maxValue) &&
      minValue > maxValue
    ) {
      setFilterError("Min price cannot exceed max price.");
      return;
    }

    setFilters(draftFilters);
    setPage(1);
  };

  const handleResetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setFilterError("");
    setActiveTab(TAB_OPTIONS[0]);
    setPage(1);
  };

  const handleExport = () => {
    if (!records.length) return;
    const rows = records.map((record) => ({
      Item: record.item,
      SKU: record.sku,
      Category: record.category,
      Warehouse: record.warehouse,
      Quantity: record.qtyLabel,
      Price: formatCurrencyValue(record.price, currency, rate),
      Value: formatCurrencyValue(record.value, currency, rate),
      Location: record.location,
      Status: record.status,
      Reorder: record.reorder ? "Yes" : "No",
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
    link.download = `inventory-records-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleToggleColumns = () => {
    setColumnsOpen((prev) => !prev);
  };

  const toggleColumn = (column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const toggleSelectAll = () => {
    if (!records.length) return;
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(records.map((record) => record.id));
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const currencyPlaceholder = formatCurrencyPlaceholder(currency);
  const currencyLabel = getCurrencyPrefix(currency);

  const warehouseOptions = Array.from(
    new Set(
      records
        .map((record) => record.warehouse)
        .filter(Boolean),
    ),
  ).concat(
    draftFilters.warehouse &&
      draftFilters.warehouse !== "All Locations" &&
      !records.some(
        (record) => record.warehouse === draftFilters.warehouse,
      )
      ? [draftFilters.warehouse]
      : [],
  );
  const sortedWarehouseOptions = Array.from(new Set(warehouseOptions)).sort(
    (a, b) => a.localeCompare(b),
  );

  const columnTemplate = [
    "48px",
    visibleColumns.item ? "2fr" : null,
    visibleColumns.sku ? "1fr" : null,
    visibleColumns.category ? "1fr" : null,
    visibleColumns.quantity ? "1.2fr" : null,
    visibleColumns.price ? "0.8fr" : null,
    visibleColumns.value ? "0.9fr" : null,
    visibleColumns.location ? "0.8fr" : null,
    visibleColumns.status ? "0.8fr" : null,
    "1fr",
  ]
    .filter(Boolean)
    .join(" ");
  const columnsStyle = { "--records-columns": columnTemplate };

  const normalizeStatus = (value) => String(value || "").toLowerCase();
  const normalizeQtyState = (value) => String(value || "").toLowerCase();

  const inStockCount = records.filter((record) => {
    const status = normalizeStatus(record.status);
    const qtyState = normalizeQtyState(record.qtyState);
    return (
      status === "in stock" ||
      status === "oversupply" ||
      qtyState === "good" ||
      qtyState === "full"
    );
  }).length;

  const lowStockCount = records.filter((record) => {
    const status = normalizeStatus(record.status);
    const qtyState = normalizeQtyState(record.qtyState);
    return status === "low stock" || qtyState === "low";
  }).length;

  const outOfStockCount = records.filter((record) => {
    const status = normalizeStatus(record.status);
    const qtyState = normalizeQtyState(record.qtyState);
    return (
      status === "critical" ||
      status === "out of stock" ||
      qtyState === "critical"
    );
  }).length;

  const openCreateModal = () => {
    setEditingRecord(null);
    setFormData(DEFAULT_RECORD_FORM);
    setActionError("");
    setIsModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setFormData({
      item: record.item || "",
      warehouse: record.warehouse || "",
      sku: record.sku || "",
      category: record.category || "",
      qtyLabel: record.qtyLabel || "",
      qtyState: record.qtyState || "good",
      price: record.price || "",
      value: record.value || "",
      location: record.location || "",
      status: record.status || "In Stock",
      image: record.image || "",
      reorder: Boolean(record.reorder),
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setActionError("");
  };

  const updateField = (field) => (event) => {
    const value =
      event?.target?.type === "checkbox"
        ? event.target.checked
        : event.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!reader.result) return;
      setFormData((prev) => ({ ...prev, image: reader.result }));
    };
    reader.onerror = () => {
      setActionError("Unable to read the selected image.");
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setFormData((prev) => ({ ...prev, image: "" }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.item || !formData.sku) {
      setActionError("Item name and SKU are required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        item: formData.item,
        warehouse: formData.warehouse,
        sku: formData.sku,
        category: formData.category,
        qtyLabel: formData.qtyLabel,
        qtyState: formData.qtyState,
        price: formData.price,
        value: formData.value,
        location: formData.location,
        status: formData.status,
        image: formData.image,
        reorder: formData.reorder,
      };

      const endpoint = editingRecord
        ? `/api/inventory/inventory-records/${editingRecord.id}`
        : "/api/inventory/inventory-records";

      await fetchInventory(endpoint, {
        method: editingRecord ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      if (!editingRecord) {
        setPage(1);
      }
      triggerRefresh();
    } catch (err) {
      setActionError(err?.message || "Unable to save inventory record.");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (record) => {
    setDeleteTarget(record);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(`/api/inventory/inventory-records/${deleteTarget.id}`, {
        method: "DELETE",
      });
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete inventory record.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  return (
    <section className="inventory-records">
      <header className="records-header">
        <div>
          <div className="breadcrumb">Nexus Inv / Inventory Records</div>
          <h2>Inventory Records</h2>
        </div>
        <div className="records-actions">
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
            Add New Record
          </button>
        </div>
      </header>

      <div className="records-summary">
        <article className="summary-card">
          <div className="summary-icon success">
            <CheckIcon />
          </div>
          <div className="summary-meta">In Stock</div>
          <div className="summary-value">{inStockCount} Items</div>
          <span className="summary-pill success">Stable</span>
        </article>
        <article className="summary-card">
          <div className="summary-icon warning">
            <WarningIcon />
          </div>
          <div className="summary-meta">Low Stock</div>
          <div className="summary-value">{lowStockCount} Items</div>
          <span className="summary-pill warning">Action Required</span>
        </article>
        <article className="summary-card">
          <div className="summary-icon danger">
            <AlertCircleIcon />
          </div>
          <div className="summary-meta">Out of Stock</div>
          <div className="summary-value">{outOfStockCount} Items</div>
          <span className="summary-pill danger">Urgent</span>
        </article>
      </div>

      <div className="records-layout">
        <aside className="filters-panel">
          <div className="filters-header">
            <strong>Advanced Filters</strong>
            <button
              type="button"
              className="reset-button"
              onClick={handleResetFilters}
            >
              Reset
            </button>
          </div>

          <div className="filter-group">
            <span className="filter-title">Category</span>
            {categoryOptions.length ? (
              categoryOptions.map((category) => (
                <label className="check-row" key={category}>
                  <input
                    type="checkbox"
                    checked={draftFilters.categories.includes(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  {category}
                </label>
              ))
            ) : (
              <span className="muted">No categories registered.</span>
            )}
          </div>

          <div className="filter-group">
            <span className="filter-title">Price Range</span>
            <div className="range-row">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Min"
                value={draftFilters.priceMin}
                onChange={updateDraftFilter("priceMin")}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Max"
                value={draftFilters.priceMax}
                onChange={updateDraftFilter("priceMax")}
              />
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-title">Stock Level</span>
            <select
              value={draftFilters.stockLevel}
              onChange={updateDraftFilter("stockLevel")}
            >
              {STOCK_LEVEL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-title">Warehouse</span>
            <select
              value={draftFilters.warehouse}
              onChange={updateDraftFilter("warehouse")}
            >
              <option>All Locations</option>
              {sortedWarehouseOptions.map((warehouse) => (
                <option key={warehouse} value={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-title">Reorder Status</span>
            <div className="pill-group">
              <button
                type="button"
                className={`pill-button ${
                  draftFilters.reorder === "all" ? "active" : ""
                }`}
                onClick={() => handleReorderFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`pill-button ${
                  draftFilters.reorder === "yes" ? "active" : ""
                }`}
                onClick={() => handleReorderFilter("yes")}
              >
                Needs Reorder
              </button>
              <button
                type="button"
                className={`pill-button ${
                  draftFilters.reorder === "no" ? "active" : ""
                }`}
                onClick={() => handleReorderFilter("no")}
              >
                No Reorder
              </button>
            </div>
          </div>

          <button
            type="button"
            className="primary-button apply-button"
            onClick={handleApplyFilters}
          >
            Apply Filters
          </button>
          {filterError ? (
            <span className="modal-help">{filterError}</span>
          ) : null}

          <div className="system-update">
            <strong>System Update</strong>
            <p>
              Inventory levels synced with Amazon, Shopify, and local POS 4
              minutes ago.
            </p>
          </div>
        </aside>

        <div className="records-table-card">
          <div className="records-toolbar">
            <div className="records-tabs">
              {TAB_OPTIONS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`tab ${activeTab === tab ? "active" : ""}`}
                  onClick={() => handleTabChange(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="records-tools">
              <div className="input-shell records-search">
                <SearchIcon className="search-icon" />
                <input
                  type="text"
                  placeholder="Search items, SKU, warehouse, or location"
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
              <label className="sort-select">
                <SortIcon className="button-icon" />
                <select value={sortOrder} onChange={handleSortChange}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="columns-menu-wrapper">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleToggleColumns}
                >
                  <ColumnsIcon className="button-icon" />
                  Columns
                </button>
                {columnsOpen ? (
                  <div className="columns-menu">
                    {[
                      { key: "item", label: "Item Name" },
                      { key: "sku", label: "SKU" },
                      { key: "category", label: "Category" },
                      { key: "quantity", label: "Quantity" },
                      { key: "price", label: "Price" },
                      { key: "value", label: "Value" },
                      { key: "location", label: "Location" },
                      { key: "status", label: "Status" },
                    ].map((column) => (
                      <label className="check-row" key={column.key}>
                        <input
                          type="checkbox"
                          checked={visibleColumns[column.key]}
                          onChange={() => toggleColumn(column.key)}
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="records-total">
                {total ? `${total} items total` : "0 items total"}
              </span>
            </div>
          </div>

          <div className="records-table">
            <div className="table-header" style={columnsStyle}>
              <span>
                <input
                  type="checkbox"
                  ref={selectAllRef}
                  checked={
                    records.length > 0 && selectedIds.length === records.length
                  }
                  onChange={toggleSelectAll}
                  aria-label="Select all records"
                />
              </span>
              {visibleColumns.item ? <span>Item Name</span> : null}
              {visibleColumns.sku ? <span>SKU</span> : null}
              {visibleColumns.category ? <span>Category</span> : null}
              {visibleColumns.quantity ? <span>Quantity</span> : null}
              {visibleColumns.price ? <span>Price</span> : null}
              {visibleColumns.value ? <span>Value</span> : null}
              {visibleColumns.location ? <span>Location</span> : null}
              {visibleColumns.status ? <span>Status</span> : null}
              <span>Actions</span>
            </div>
            <div className="table-body">
              {records.map((record) => (
                <div className="table-row" style={columnsStyle} key={record.id}>
                  <div className="cell checkbox-cell" data-label="Select">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={() => toggleSelectRow(record.id)}
                      aria-label={`Select ${record.item}`}
                    />
                  </div>
                  {visibleColumns.item ? (
                    <div className="cell item-cell" data-label="Item Name">
                      <div className="item-thumb">
                        {record.image ? (
                          <img src={record.image} alt={record.item} />
                        ) : (
                          <span className="item-fallback">
                            {(record.item || "?").charAt(0)}
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>{record.item}</strong> <br></br>
                        <span className="muted">{record.warehouse}</span>
                      </div>
                    </div>
                  ) : null}
                  {visibleColumns.sku ? (
                    <div className="cell mono" data-label="SKU">
                      {record.sku}
                    </div>
                  ) : null}
                  {visibleColumns.category ? (
                    <div className="cell" data-label="Category">
                      <span className={`category-pill ${record.categoryTone}`}>
                        {record.category}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.quantity ? (
                    <div className="cell qty-cell" data-label="Quantity">
                      <div className="qty-line">
                        <span>{record.qtyLabel}</span>
                        <span className={`qty-flag ${record.qtyState}`}>
                          {record.qtyMeta || computeQtyMeta(record.qtyState)}
                        </span>
                      </div>
                      <div className="qty-bar">
                        <span
                          className={`qty-fill ${record.qtyState} ${getQtyFillClass(record.qtyState)}`}
                        />
                      </div>
                    </div>
                  ) : null}
                  {visibleColumns.price ? (
                    <div className="cell price" data-label="Price">
                      <span
                        className="tooltip-anchor"
                        data-tooltip={
                          formatCurrencyPair(record.price, currency, rate)
                            .alternateValue || undefined
                        }
                      >
                        {formatCurrencyValue(record.price, currency, rate)}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.value ? (
                    <div className="cell value" data-label="Value">
                      <span
                        className="tooltip-anchor"
                        data-tooltip={
                          formatCurrencyPair(record.value, currency, rate)
                            .alternateValue || undefined
                        }
                      >
                        {formatCurrencyValue(record.value, currency, rate)}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.location ? (
                    <div className="cell muted" data-label="Location">
                      {record.location}
                    </div>
                  ) : null}
                  {visibleColumns.status ? (
                    <div className="cell" data-label="Status">
                      <span className={`status-pill ${record.statusTone}`}>
                        {record.status}
                      </span>
                    </div>
                  ) : null}
                  <div className="cell actions-cell" data-label="Actions">
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => openEditModal(record)}
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => requestDelete(record)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="table-footer">
            <span>
              {error
                ? error
                : `Showing ${startIndex}-${endIndex} of ${total} results`}
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
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingRecord ? "Edit Inventory Record" : "Add Inventory Record"}
        subtitle="Update item details, quantities, and status."
        primaryText={isSaving ? "Saving..." : "Save"}
        secondaryText="Cancel"
        onConfirm={handleSave}
        onClose={closeModal}
        variant="side"
      >
        <form className="modal-form">
          <div className="modal-grid">
            <label className="modal-field">
              <span>Item Name</span>
              <input
                type="text"
                value={formData.item}
                onChange={updateField("item")}
                placeholder="Item name"
              />
            </label>
            <label className="modal-field">
              <span>SKU</span>
              <input
                type="text"
                value={formData.sku}
                onChange={updateField("sku")}
                placeholder="SKU"
              />
            </label>
            <label className="modal-field">
              <span>Warehouse</span>
              <input
                type="text"
                value={formData.warehouse}
                onChange={updateField("warehouse")}
                placeholder="Warehouse A"
              />
            </label>
            <label className="modal-field">
              <span>Category</span>
              <input
                type="text"
                value={formData.category}
                onChange={updateField("category")}
                placeholder="Electronics"
              />
            </label>
            <label className="modal-field">
              <span>Quantity Label</span>
              <input
                type="text"
                value={formData.qtyLabel}
                onChange={updateField("qtyLabel")}
                placeholder="458 Units"
              />
            </label>
            <label className="modal-field">
              <span>Quantity Meta (Auto)</span>
              <input
                type="text"
                value={computeQtyMeta(formData.qtyState)}
                readOnly
              />
            </label>
            <label className="modal-field">
              <span>Quantity State</span>
              <select
                value={formData.qtyState}
                onChange={updateField("qtyState")}
              >
                <option value="good">Good</option>
                <option value="low">Low</option>
                <option value="critical">Critical</option>
                <option value="full">Full</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Price ({currencyLabel})</span>
              <div
                className="tooltip-anchor tooltip-field"
                data-tooltip={
                  formData.price
                    ? formatCurrencyPair(formData.price, currency, rate)
                        .alternateValue
                    : undefined
                }
              >
                <input
                  type="text"
                  value={formData.price}
                  onChange={updateField("price")}
                  placeholder={currencyPlaceholder}
                />
              </div>
            </label>
            <label className="modal-field">
              <span>Value ({currencyLabel})</span>
              <div
                className="tooltip-anchor tooltip-field"
                data-tooltip={
                  formData.value
                    ? formatCurrencyPair(formData.value, currency, rate)
                        .alternateValue
                    : undefined
                }
              >
                <input
                  type="text"
                  value={formData.value}
                  onChange={updateField("value")}
                  placeholder={currencyPlaceholder}
                />
              </div>
            </label>
            <label className="modal-field">
              <span>Location</span>
              <input
                type="text"
                value={formData.location}
                onChange={updateField("location")}
                placeholder="A-01-02"
              />
            </label>
            <label className="modal-field">
              <span>Status</span>
              <select
                value={formData.status}
                onChange={updateField("status")}
              >
                <option>In Stock</option>
                <option>Low Stock</option>
                <option>Critical</option>
                <option>Oversupply</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Item Image</span>
              <input type="file" accept="image/*" onChange={handleImageSelected} />
            </label>
            <label className="modal-field">
              <span>Reorder</span>
              <input
                type="checkbox"
                checked={formData.reorder}
                onChange={updateField("reorder")}
              />
            </label>
          </div>
          {formData.image ? (
            <div className="upload-preview single">
              <div className="preview-item">
                <img src={formData.image} alt="Item preview" />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={clearImage}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
          {actionError ? <span className="modal-help">{actionError}</span> : null}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Inventory Record"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.item}? This cannot be undone.`
            : "Delete this inventory record?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
        variant="center"
      />
    </section>
  );
};

export default InventoryRecords;
