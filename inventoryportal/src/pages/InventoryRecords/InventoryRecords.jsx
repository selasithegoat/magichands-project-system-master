import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ColumnsIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
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
  formatCurrencyValue,
  getCurrencyPrefix,
  useInventoryCurrency,
} from "../../utils/currency";
import "./InventoryRecords.css";

const DEFAULT_RECORD_FORM = {
  item: "",
  subtext: "",
  sku: "",
  category: "",
  categoryTone: "blue",
  qtyLabel: "",
  qtyMeta: "",
  qtyState: "good",
  qtyFill: "p82",
  price: "",
  value: "",
  location: "",
  status: "In Stock",
  statusTone: "in-stock",
  image: "",
  reorder: false,
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
  const currency = useInventoryCurrency();

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useEffect(() => {
    let isMounted = true;

    const loadRecords = async () => {
      try {
        const payload = await fetchInventory(
          `/api/inventory/inventory-records?page=${page}&limit=${meta.limit}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((record, index) => ({
          id: record._id || record.id || `${index}`,
          item: record.item || "",
          subtext: record.subtext || "",
          sku: record.sku || "",
          category: record.category || "",
          categoryTone: record.categoryTone || "slate",
          qtyLabel: record.qtyLabel || "",
          qtyMeta: record.qtyMeta || "",
          qtyState: record.qtyState || "",
          qtyFill: record.qtyFill || "",
          price: record.price || "",
          value: record.value || "",
          location: record.location || "",
          status: record.status || "",
          statusTone: record.statusTone || "",
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
  }, [meta.limit, page, refreshKey]);

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

  const currencyPlaceholder = formatCurrencyPlaceholder(currency);
  const currencyLabel = getCurrencyPrefix(currency);

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
      subtext: record.subtext || "",
      sku: record.sku || "",
      category: record.category || "",
      categoryTone: record.categoryTone || "blue",
      qtyLabel: record.qtyLabel || "",
      qtyMeta: record.qtyMeta || "",
      qtyState: record.qtyState || "good",
      qtyFill: record.qtyFill || "p82",
      price: record.price || "",
      value: record.value || "",
      location: record.location || "",
      status: record.status || "In Stock",
      statusTone: record.statusTone || "in-stock",
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
        subtext: formData.subtext,
        sku: formData.sku,
        category: formData.category,
        categoryTone: formData.categoryTone,
        qtyLabel: formData.qtyLabel,
        qtyMeta: formData.qtyMeta,
        qtyState: formData.qtyState,
        qtyFill: formData.qtyFill,
        price: formData.price,
        value: formData.value,
        location: formData.location,
        status: formData.status,
        statusTone: formData.statusTone,
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
          <div className="summary-value">1,284 Items</div>
          <span className="summary-pill success">Stable</span>
        </article>
        <article className="summary-card">
          <div className="summary-icon warning">
            <WarningIcon />
          </div>
          <div className="summary-meta">Low Stock</div>
          <div className="summary-value">18 Items</div>
          <span className="summary-pill warning">Action Required</span>
        </article>
        <article className="summary-card">
          <div className="summary-icon danger">
            <AlertCircleIcon />
          </div>
          <div className="summary-meta">Out of Stock</div>
          <div className="summary-value">4 Items</div>
          <span className="summary-pill danger">Urgent</span>
        </article>
      </div>

      <div className="records-layout">
        <aside className="filters-panel">
          <div className="filters-header">
            <strong>Advanced Filters</strong>
            <button type="button" className="reset-button">
              Reset
            </button>
          </div>

          <div className="filter-group">
            <span className="filter-title">Category</span>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              Electronics
            </label>
            <label className="check-row">
              <input type="checkbox" />
              Office Supplies
            </label>
            <label className="check-row">
              <input type="checkbox" />
              Hardware
            </label>
          </div>

          <div className="filter-group">
            <span className="filter-title">Price Range</span>
            <div className="range-row">
              <input type="text" placeholder="Min" />
              <input type="text" placeholder="Max" />
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-title">Stock Level</span>
            <select>
              <option>All Stock Levels</option>
              <option>In Stock</option>
              <option>Low Stock</option>
              <option>Out of Stock</option>
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-title">Warehouse</span>
            <select>
              <option>All Locations</option>
              <option>Main Warehouse</option>
              <option>Central Hub</option>
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-title">Condition</span>
            <div className="pill-group">
              <button type="button" className="pill-button active">
                New
              </button>
              <button type="button" className="pill-button">
                Refurbished
              </button>
              <button type="button" className="pill-button">
                Used
              </button>
            </div>
          </div>

          <button type="button" className="primary-button apply-button">
            Apply Filters
          </button>

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
              <button type="button" className="tab active">
                All Items
              </button>
              <button type="button" className="tab">
                Low Stock
              </button>
              <button type="button" className="tab">
                In Warehouse
              </button>
            </div>
            <div className="records-tools">
              <button type="button" className="ghost-button">
                <SortIcon className="button-icon" />
                Sort
              </button>
              <button type="button" className="ghost-button">
                <ColumnsIcon className="button-icon" />
                Columns
              </button>
              <span className="records-total">
                {total ? `${total} items total` : "0 items total"}
              </span>
            </div>
          </div>

          <div className="records-table">
            <div className="table-header">
              <span>
                <input type="checkbox" />
              </span>
              <span>Item Name</span>
              <span>SKU</span>
              <span>Category</span>
              <span>Quantity</span>
              <span>Price</span>
              <span>Value</span>
              <span>Location</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            <div className="table-body">
              {records.map((record) => (
                <div className="table-row" key={record.id}>
                  <div className="cell checkbox-cell" data-label="Select">
                    <input type="checkbox" />
                  </div>
                  <div className="cell item-cell" data-label="Item Name">
                    <div className="item-thumb">
                      <img src={record.image} alt={record.item} />
                    </div>
                    <div>
                      <strong>{record.item}</strong> <br></br>
                      <span className="muted">{record.subtext}</span>
                    </div>
                  </div>
                  <div className="cell mono" data-label="SKU">
                    {record.sku}
                  </div>
                  <div className="cell" data-label="Category">
                    <span className={`category-pill ${record.categoryTone}`}>
                      {record.category}
                    </span>
                  </div>
                  <div className="cell qty-cell" data-label="Quantity">
                    <div className="qty-line">
                      <span>{record.qtyLabel}</span>
                      <span className={`qty-flag ${record.qtyState}`}>
                        {record.qtyMeta}
                      </span>
                    </div>
                    <div className="qty-bar">
                      <span
                        className={`qty-fill ${record.qtyState} ${record.qtyFill}`}
                      />
                    </div>
                  </div>
                  <div className="cell price" data-label="Price">
                    {formatCurrencyValue(record.price, currency)}
                  </div>
                  <div className="cell value" data-label="Value">
                    {formatCurrencyValue(record.value, currency)}
                  </div>
                  <div className="cell muted" data-label="Location">
                    {record.location}
                  </div>
                  <div className="cell" data-label="Status">
                    <span className={`status-pill ${record.statusTone}`}>
                      {record.status}
                    </span>
                  </div>
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
              <span>Subtext</span>
              <input
                type="text"
                value={formData.subtext}
                onChange={updateField("subtext")}
                placeholder="Warehouse A, R4"
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
              <span>Category Tone</span>
              <select
                value={formData.categoryTone}
                onChange={updateField("categoryTone")}
              >
                <option value="blue">Blue</option>
                <option value="indigo">Indigo</option>
                <option value="slate">Slate</option>
                <option value="amber">Amber</option>
              </select>
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
              <span>Quantity Meta</span>
              <input
                type="text"
                value={formData.qtyMeta}
                onChange={updateField("qtyMeta")}
                placeholder="82%"
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
              <span>Quantity Fill</span>
              <select
                value={formData.qtyFill}
                onChange={updateField("qtyFill")}
              >
                <option value="p12">12%</option>
                <option value="p35">35%</option>
                <option value="p82">82%</option>
                <option value="p100">100%</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Price ({currencyLabel})</span>
              <input
                type="text"
                value={formData.price}
                onChange={updateField("price")}
                placeholder={currencyPlaceholder}
              />
            </label>
            <label className="modal-field">
              <span>Value ({currencyLabel})</span>
              <input
                type="text"
                value={formData.value}
                onChange={updateField("value")}
                placeholder={currencyPlaceholder}
              />
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
              <input
                type="text"
                value={formData.status}
                onChange={updateField("status")}
                placeholder="In Stock"
              />
            </label>
            <label className="modal-field">
              <span>Status Tone</span>
              <select
                value={formData.statusTone}
                onChange={updateField("statusTone")}
              >
                <option value="in-stock">In Stock</option>
                <option value="low-stock">Low Stock</option>
                <option value="critical">Critical</option>
                <option value="oversupply">Oversupply</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Image URL</span>
              <input
                type="text"
                value={formData.image}
                onChange={updateField("image")}
                placeholder="https://"
              />
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
