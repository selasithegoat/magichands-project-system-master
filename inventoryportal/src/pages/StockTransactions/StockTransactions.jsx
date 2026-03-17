import { useEffect, useState } from "react";
import {
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Breadcrumb from "../../components/ui/Breadcrumb";
import Modal from "../../components/ui/Modal";
import {
  fetchInventory,
  formatShortDateTime,
  parseListResponse,
} from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import useInventoryGlobalSearch from "../../hooks/useInventoryGlobalSearch";
import "./StockTransactions.css";

const TYPE_OPTIONS = [
  "All Types",
  "Stock In",
  "Stock Out",
  "Transfer",
  "Adjustment",
];

const DATE_RANGE_OPTIONS = [
  { label: "Last 30 Days", value: 30 },
  { label: "Last 7 Days", value: 7 },
  { label: "Last 90 Days", value: 90 },
  { label: "All Time", value: "" },
];

const DEFAULT_FORM = {
  txid: "",
  item: "",
  sku: "",
  type: "Stock In",
  qty: "",
  source: "",
  destination: "",
  date: "",
  staff: "",
  notes: "",
};

const getTypeClass = (type) =>
  `type-pill ${String(type).toLowerCase().replace(/\s+/g, "-")}`;

const getQtyClass = (qty) =>
  qty > 0 ? "qty positive" : qty < 0 ? "qty negative" : "qty";

const toInputDateTime = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const pad = (unit) => String(unit).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const StockTransactions = () => {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: 5,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState(TYPE_OPTIONS[0]);
  const [dateRange, setDateRange] = useState(DATE_RANGE_OPTIONS[0].value);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState([]);

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
    setPage(1);
  });

  useEffect(() => {
    let isMounted = true;

    const loadTransactions = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(meta.limit));
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        if (typeFilter && typeFilter !== "All Types") {
          params.set("type", typeFilter);
        }
        if (dateRange) {
          params.set("range", String(dateRange));
        }

        const payload = await fetchInventory(
          `/api/inventory/stock-transactions?${params.toString()}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((row, index) => {
          const qtyValue = Number(row.qty);
          const dateValue = row.date || row.createdAt || "";
          return {
            id: row._id || row.txid || `${index}`,
            txid: row.txid || "",
            item: row.item || "",
            sku: row.sku || "",
            type: row.type || "",
            qty: Number.isFinite(qtyValue) ? qtyValue : 0,
            source: row.source || "",
            destination: row.destination || "",
            date: formatShortDateTime(dateValue),
            dateRaw: dateValue,
            staff: row.staff || "",
            notes: row.notes || "",
          };
        });

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setRows(normalized);
        setMeta({
          limit: parsed.limit || meta.limit,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setRows([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load transactions.");
      }
    };

    loadTransactions();
    return () => {
      isMounted = false;
    };
  }, [dateRange, meta.limit, page, refreshKey, searchTerm, typeFilter]);

  useEffect(() => {
    let isMounted = true;

    const loadWarehouses = async () => {
      try {
        const payload = await fetchInventory(
          "/api/inventory/warehouses/options",
        );
        const parsed = parseListResponse(payload);
        const options = Array.isArray(parsed?.data) ? parsed.data : [];
        if (!isMounted) return;
        const sorted = Array.from(new Set(options.filter(Boolean))).sort((a, b) =>
          a.localeCompare(b),
        );
        setWarehouseOptions(sorted);
      } catch (err) {
        if (!isMounted) return;
        setWarehouseOptions([]);
      }
    };

    loadWarehouses();
    return () => {
      isMounted = false;
    };
  }, []);

  const total = meta.total || rows.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + rows.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;
  const formWarehouseOptions = Array.from(
    new Set([...warehouseOptions, formData.source].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    if (meta.totalPages && nextPage > meta.totalPages) return;
    setPage(nextPage);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleTypeChange = (event) => {
    setTypeFilter(event.target.value);
    setPage(1);
  };

  const handleRangeChange = (event) => {
    const value = event.target.value;
    setDateRange(value ? Number(value) : "");
    setPage(1);
  };

  const handleExport = () => {
    if (!rows.length) return;
    const rowsForExport = rows.map((row) => ({
      TXID: row.txid,
      Item: row.item,
      SKU: row.sku,
      Type: row.type,
      Qty: row.qty,
      Source: row.source,
      Destination: row.destination,
      Date: row.date,
      Staff: row.staff,
      Notes: row.notes,
    }));

    const headers = Object.keys(rowsForExport[0]);
    const csv = [
      headers.join(","),
      ...rowsForExport.map((row) =>
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
    link.download = `stock-transactions-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const openCreateModal = () => {
    setEditingTransaction(null);
    setFormData({ ...DEFAULT_FORM, date: toInputDateTime() });
    setActionError("");
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleQuickAction = (event) => {
      const action = String(event?.detail?.action || "");
      if (action !== "adjust-stock") return;
      openCreateModal();
    };
    window.addEventListener("inventory:quick-action", handleQuickAction);
    return () =>
      window.removeEventListener("inventory:quick-action", handleQuickAction);
  }, [openCreateModal]);

  const openEditModal = (row) => {
    setEditingTransaction(row);
    setFormData({
      txid: row.txid || "",
      item: row.item || "",
      sku: row.sku || "",
      type: row.type || "Stock In",
      qty: Number.isFinite(row.qty) ? String(row.qty) : "",
      source: row.source || "",
      destination: row.destination || "",
      date: toInputDateTime(row.dateRaw),
      staff: row.staff || "",
      notes: row.notes || "",
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
    setActionError("");
  };

  const updateField = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.item.trim()) {
      setActionError("Item name is required.");
      return;
    }
    if (!formData.type) {
      setActionError("Transaction type is required.");
      return;
    }
    const qtyValue = Number(formData.qty);
    if (!Number.isFinite(qtyValue)) {
      setActionError("Quantity must be a number.");
      return;
    }
    if (!formData.date) {
      setActionError("Date is required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        txid: formData.txid,
        item: formData.item,
        sku: formData.sku,
        type: formData.type,
        qty: qtyValue,
        source: formData.source,
        destination: formData.destination,
        date: formData.date,
        staff: formData.staff,
        notes: formData.notes,
      };

      const endpoint = editingTransaction
        ? `/api/inventory/stock-transactions/${editingTransaction.id}`
        : "/api/inventory/stock-transactions";

      await fetchInventory(endpoint, {
        method: editingTransaction ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      if (!editingTransaction) {
        setPage(1);
      }
      triggerRefresh();
    } catch (err) {
      setActionError(err?.message || "Unable to save transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (row) => {
    setDeleteTarget(row);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(
        `/api/inventory/stock-transactions/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete transaction.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  return (
    <section className="stock-transactions">
      <header className="page-header">
        <div>
          <Breadcrumb pageKey="stock-transactions" />
          <h2>Stock Transactions</h2>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={openCreateModal}
        >
          <PlusIcon className="button-icon" />
          New Transaction
        </button>
      </header>

      <div className="filters-card">
        <div className="filters-row">
          <div className="input-shell">
            <SearchIcon className="search-icon" />
            <input
              type="text"
              placeholder="Search transactions, items, or staff"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <select
            className="filter-select"
            aria-label="Filter type"
            value={typeFilter}
            onChange={handleTypeChange}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            aria-label="Filter date range"
            value={dateRange}
            onChange={handleRangeChange}
          >
            {DATE_RANGE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-button"
            aria-label="Export"
            onClick={handleExport}
          >
            <DownloadIcon />
          </button>
        </div>
      </div>

      <div className="table-card mobile-card-table">
        <div className="table-header">
          <span>TXID</span>
          <span>Item</span>
          <span>Type</span>
          <span>Qty</span>
          <span>Source</span>
          <span>Destination</span>
          <span>Date</span>
          <span>Staff</span>
          <span>Notes</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {rows.map((row) => (
            <div className="table-row" key={row.id}>
              <div className="cell mono txid" data-label="Txid">
                {row.txid}
              </div>
              <div className="cell item full" data-label="Item">
                <div className="item-avatar">
                  {(row.item || "?").charAt(0)}
                </div>
                <div>
                  <strong>{row.item}</strong>
                  <span className="muted">{row.sku}</span>
                </div>
              </div>
              <div className="cell" data-label="Type">
                <span className={getTypeClass(row.type)}>{row.type}</span>
              </div>
              <div className="cell" data-label="Qty">
                <span className={getQtyClass(row.qty)}>
                  {row.qty > 0 ? `+${row.qty}` : row.qty}
                </span>
              </div>
              <div className="cell muted" data-label="Source">
                {row.source || "-"}
              </div>
              <div className="cell muted" data-label="Destination">
                {row.destination || "-"}
              </div>
              <div className="cell muted" data-label="Date">
                {row.date}
              </div>
              <div className="cell staff" data-label="Staff">
                {row.staff || "-"}
              </div>
              <div className="cell muted notes full" data-label="Notes">
                {row.notes || "-"}
              </div>
              <div className="cell actions-cell" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  onClick={() => openEditModal(row)}
                  aria-label={`Edit ${row.txid}`}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => requestDelete(row)}
                  aria-label={`Delete ${row.txid}`}
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
              : `Showing ${startIndex} to ${endIndex} of ${total} transactions`}
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

      <Modal
        isOpen={isModalOpen}
        title={editingTransaction ? "Edit Transaction" : "New Transaction"}
        subtitle="Track stock movements across warehouses and teams."
        primaryText={isSaving ? "Saving..." : "Save"}
        secondaryText="Cancel"
        onConfirm={handleSave}
        onClose={closeModal}
        variant="side"
      >
        <form className="modal-form">
          <div className="modal-grid">
            <label className="modal-field">
              <span>TXID</span>
              <input
                type="text"
                value={formData.txid}
                onChange={updateField("txid")}
                placeholder="Auto-generated"
                readOnly={Boolean(editingTransaction)}
              />
            </label>
            <label className="modal-field">
              <span>Item</span>
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
              <span>Type</span>
              <select value={formData.type} onChange={updateField("type")}>
                {TYPE_OPTIONS.filter((option) => option !== "All Types").map(
                  (option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="modal-field">
              <span>Quantity</span>
              <input
                type="number"
                value={formData.qty}
                onChange={updateField("qty")}
                placeholder="0"
              />
            </label>
            <label className="modal-field">
              <span>Source</span>
              <input
                type="text"
                list="stock-transactions-warehouse-options"
                value={formData.source}
                onChange={updateField("source")}
                placeholder="Select or type warehouse"
              />
            </label>
            <label className="modal-field">
              <span>Destination</span>
              <input
                type="text"
                list="stock-transactions-warehouse-options"
                value={formData.destination}
                onChange={updateField("destination")}
                placeholder="Select or type warehouse"
              />
            </label>
            <label className="modal-field">
              <span>Date</span>
              <input
                type="datetime-local"
                value={formData.date}
                onChange={updateField("date")}
              />
            </label>
            <label className="modal-field">
              <span>Staff</span>
              <input
                type="text"
                value={formData.staff}
                onChange={updateField("staff")}
                placeholder="Handled by"
              />
            </label>
            <label className="modal-field full">
              <span>Notes</span>
              <textarea
                rows="3"
                value={formData.notes}
                onChange={updateField("notes")}
                placeholder="Notes about this movement"
              />
            </label>
          </div>
          {actionError ? <span className="modal-help">{actionError}</span> : null}
          <datalist id="stock-transactions-warehouse-options">
            {formWarehouseOptions.map((warehouse) => (
              <option key={warehouse} value={warehouse} />
            ))}
          </datalist>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Transaction"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.txid}? This cannot be undone.`
            : "Delete this stock transaction?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </section>
  );
};

export default StockTransactions;
