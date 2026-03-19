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
import { toastError, toastInfo, toastSuccess } from "../../utils/toast";
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

const VIEW_OPTIONS = ["Transactions", "Stock Out", "Stock In"];

const DEFAULT_FORM = {
  txid: "",
  item: "",
  sku: "",
  brandGroup: "",
  variantName: "",
  variantSku: "",
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

const formatQtyLabel = (value) => {
  if (!Number.isFinite(value)) return "";
  const normalized = Number.isInteger(value)
    ? value
    : Number(value.toFixed(2));
  return `${normalized.toLocaleString("en-US")} Units`;
};

const formatShortTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildVariantLabel = ({ brandGroup, variantName, variantSku }) => {
  const parts = [];
  if (brandGroup) parts.push(brandGroup);
  if (variantName) parts.push(variantName);
  const base = parts.join(" - ");
  if (variantSku) {
    return base ? `${base} (${variantSku})` : variantSku;
  }
  return base;
};

const buildEntryKey = (recordId, entryKey) =>
  `${recordId || "record"}::${entryKey || "default"}`;

const buildStockDateTime = (dateValue) => {
  if (!dateValue) return new Date().toISOString();
  const parts = String(dateValue).split("-").map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return new Date().toISOString();
  }
  const [year, month, day] = parts;
  const now = new Date();
  const target = new Date(now);
  target.setFullYear(year, month - 1, day);
  return target.toISOString();
};

const buildRecordEntries = (record) => {
  if (!record) return [];
  const entries = [];
  const brandGroups = Array.isArray(record.brandGroups)
    ? record.brandGroups
    : [];
  if (brandGroups.length) {
    brandGroups.forEach((group, groupIndex) => {
      const groupName = group?.name || "";
      const variants = Array.isArray(group?.variants) ? group.variants : [];
      if (!variants.length) return;
      variants.forEach((variant, variantIndex) => {
        const keyBase =
          variant?.sku ||
          variant?.name ||
          `${groupName || "group"}-${variantIndex}`;
        const qtyValue = Number.isFinite(variant?.qtyValue)
          ? variant.qtyValue
          : null;
        const qtyLabel =
          variant?.qtyLabel || (Number.isFinite(qtyValue) ? formatQtyLabel(qtyValue) : "");
        entries.push({
          key: `${groupIndex}-${keyBase}`,
          brandGroup: groupName,
          variantName: variant?.name || "",
          variantSku: variant?.sku || "",
          qtyLabel,
        });
      });
    });
    if (entries.length) return entries;
  }

  const variants = Array.isArray(record.variants) ? record.variants : [];
  if (variants.length) {
    variants.forEach((variant, variantIndex) => {
      const keyBase =
        variant?.sku || variant?.name || `variant-${variantIndex}`;
      const qtyValue = Number.isFinite(variant?.qtyValue)
        ? variant.qtyValue
        : null;
      const qtyLabel =
        variant?.qtyLabel || (Number.isFinite(qtyValue) ? formatQtyLabel(qtyValue) : "");
      entries.push({
        key: `variant-${keyBase}`,
        brandGroup: record?.brand || "",
        variantName: variant?.name || "",
        variantSku: variant?.sku || "",
        qtyLabel,
      });
    });
    return entries;
  }

  return [
    {
      key: "record",
      brandGroup: record?.brand || "",
      variantName: "Item total",
      variantSku: "",
      qtyLabel:
        record?.qtyLabel ||
        (Number.isFinite(record?.qtyValue)
          ? formatQtyLabel(record.qtyValue)
          : ""),
    },
  ];
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
  const [activeView, setActiveView] = useState(VIEW_OPTIONS[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(TYPE_OPTIONS[0]);
  const [dateRange, setDateRange] = useState(DATE_RANGE_OPTIONS[0].value);
  const [dailyReportDate, setDailyReportDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dailyFilterDate, setDailyFilterDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [inventoryRecords, setInventoryRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [dailyTransactions, setDailyTransactions] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDailyExporting, setIsDailyExporting] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [entryState, setEntryState] = useState({});
  const [stockRefreshKey, setStockRefreshKey] = useState(0);

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);
  const triggerStockRefresh = () => setStockRefreshKey((prev) => prev + 1);

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
    setPage(1);
  });

  const fetchAllPages = async (endpoint, params = {}) => {
    const results = [];
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
      const query = new URLSearchParams();
      query.set("page", String(currentPage));
      query.set("limit", "100");
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        query.set(key, String(value));
      });

      const payload = await fetchInventory(
        `${endpoint}?${query.toString()}`,
      );
      const parsed = parseListResponse(payload);
      const data = Array.isArray(parsed.data) ? parsed.data : [];
      results.push(...data);
      totalPages = parsed.totalPages || 1;
      currentPage += 1;
    }

    return results;
  };

  useEffect(() => {
    if (activeView !== "Transactions") return undefined;
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
          const brandGroup = row.brandGroup || "";
          const variantName = row.variantName || "";
          const variantSku = row.variantSku || "";
          return {
            id: row._id || row.txid || `${index}`,
            txid: row.txid || "",
            item: row.item || "",
            sku: row.sku || "",
            brandGroup,
            variantName,
            variantSku,
            variantLabel: buildVariantLabel({
              brandGroup,
              variantName,
              variantSku,
            }),
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
  }, [
    activeView,
    dateRange,
    meta.limit,
    page,
    refreshKey,
    searchTerm,
    typeFilter,
  ]);

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

  useEffect(() => {
    if (activeView === "Transactions") return undefined;
    let isMounted = true;

    const loadRecords = async () => {
      setRecordsLoading(true);
      try {
        const params = {
          sort: "item",
        };
        if (recordSearch.trim()) {
          params.search = recordSearch.trim();
        }
        const payload = await fetchAllPages(
          "/api/inventory/inventory-records",
          params,
        );
        const normalized = payload.map((record, index) => ({
          id: record._id || `${index}`,
          item: record.item || "",
          sku: record.sku || "",
          warehouse: record.warehouse || "",
          brand: record.brand || "",
          brandGroups: Array.isArray(record.brandGroups)
            ? record.brandGroups
            : [],
          variants: Array.isArray(record.variants) ? record.variants : [],
          qtyValue: Number.isFinite(Number(record.qtyValue))
            ? Number(record.qtyValue)
            : null,
          qtyLabel: record.qtyLabel || "",
          status: record.status || "",
        }));
        if (!isMounted) return;
        setInventoryRecords(normalized);
        setRecordsError("");
      } catch (err) {
        if (!isMounted) return;
        setInventoryRecords([]);
        setRecordsError(err?.message || "Unable to load inventory records.");
      } finally {
        if (isMounted) setRecordsLoading(false);
      }
    };

    loadRecords();
    return () => {
      isMounted = false;
    };
  }, [activeView, recordSearch, stockRefreshKey]);

  useEffect(() => {
    if (activeView === "Transactions") return undefined;
    let isMounted = true;

    const loadDailyTransactions = async () => {
      if (!dailyFilterDate) return;
      setDailyLoading(true);
      try {
        const type =
          activeView === "Stock Out" ? "Stock Out" : "Stock In";
        const payload = await fetchAllPages(
          "/api/inventory/stock-transactions",
          {
            date: dailyFilterDate,
            type,
            sort: "-date",
          },
        );
        const normalized = payload.map((row, index) => {
          const qtyValue = Number(row.qty);
          const dateValue = row.date || row.createdAt || "";
          const brandGroup = row.brandGroup || "";
          const variantName = row.variantName || "";
          const variantSku = row.variantSku || "";
          return {
            id: row._id || row.txid || `${index}`,
            txid: row.txid || "",
            item: row.item || "",
            sku: row.sku || "",
            brandGroup,
            variantName,
            variantSku,
            variantLabel: buildVariantLabel({
              brandGroup,
              variantName,
              variantSku,
            }),
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
        setDailyTransactions(normalized);
      } catch (err) {
        if (!isMounted) return;
        setDailyTransactions([]);
      } finally {
        if (isMounted) setDailyLoading(false);
      }
    };

    loadDailyTransactions();
    return () => {
      isMounted = false;
    };
  }, [activeView, dailyFilterDate, stockRefreshKey]);

  const total = meta.total || rows.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + rows.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;
  const formWarehouseOptions = Array.from(
    new Set(
      [...warehouseOptions, formData.source, formData.destination].filter(
        Boolean,
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const isStockOutFlow = activeView === "Stock Out";
  const stockTransactionType = isStockOutFlow ? "Stock Out" : "Stock In";
  const isStockOutFilter =
    activeView === "Transactions" && typeFilter === "Stock Out";
  const transactionsBySku = dailyTransactions.reduce((acc, tx) => {
    const key = String(tx.sku || "").trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {});

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

  const handleViewChange = (view) => {
    setActiveView(view);
    setPage(1);
  };

  const handleRecordSearchChange = (event) => {
    setRecordSearch(event.target.value);
  };

  const updateEntryField = (entryKey, field) => (event) => {
    const value = event.target.value;
    setEntryState((prev) => ({
      ...prev,
      [entryKey]: {
        ...(prev[entryKey] || {}),
        [field]: value,
        error: "",
      },
    }));
  };

  const handleQuickTransaction = async (record, entry) => {
    const entryKey = buildEntryKey(record.id, entry.key);
    const current = entryState[entryKey] || {};
    const qtyValue = Number(current.qty);
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      setEntryState((prev) => ({
        ...prev,
        [entryKey]: {
          ...(prev[entryKey] || {}),
          error: "Quantity must be greater than 0.",
        },
      }));
      return;
    }
    if (current.isSaving) return;

    const isRecordEntry = entry.key === "record";

    setEntryState((prev) => ({
      ...prev,
      [entryKey]: {
        ...(prev[entryKey] || {}),
        isSaving: true,
        error: "",
      },
    }));

    try {
      const payload = {
        item: record.item,
        sku: record.sku,
        type: stockTransactionType,
        qty: Math.abs(qtyValue),
        date: buildStockDateTime(dailyFilterDate),
        staff: current.staff || "",
        notes:
          stockTransactionType === "Stock Out"
            ? current.recipient || ""
            : current.notes || "",
        source:
          stockTransactionType === "Stock Out"
            ? current.orderNumber || ""
            : current.location || "",
        brandGroup: isRecordEntry ? "" : entry.brandGroup || "",
        variantName: isRecordEntry ? "" : entry.variantName || "",
        variantSku: isRecordEntry ? "" : entry.variantSku || "",
      };

      await fetchInventory("/api/inventory/stock-transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setEntryState((prev) => ({
        ...prev,
        [entryKey]: {
          ...(prev[entryKey] || {}),
          qty: "",
          notes: "",
          orderNumber: "",
          recipient: "",
          error: "",
          isSaving: false,
        },
      }));
      triggerStockRefresh();
    } catch (err) {
      setEntryState((prev) => ({
        ...prev,
        [entryKey]: {
          ...(prev[entryKey] || {}),
          isSaving: false,
          error: err?.message || "Unable to log transaction.",
        },
      }));
    }
  };

  const downloadCsv = (rowsForExport, fileName) => {
    if (!rowsForExport.length) return;
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
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (!rows.length) {
      toastInfo("No rows to export.");
      return;
    }
    const rowsForExport = rows.map((row) => ({
      TXID: row.txid,
      Item: row.item,
      "Item ID": row.sku,
      "Brand Group": row.brandGroup,
      Variant: row.variantName,
      "Variant Item ID": row.variantSku,
      Type: row.type,
      Qty: row.qty,
      Source: row.source,
      Destination: row.destination,
      Date: row.date,
      "Handled By": row.staff,
      Notes: row.notes,
    }));

    downloadCsv(
      rowsForExport,
      `stock-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    toastSuccess("Current view exported.");
  };

  const handleDailyExport = async () => {
    if (!dailyReportDate) {
      toastInfo("Select a report date first.");
      return;
    }
    if (isDailyExporting) return;

    setIsDailyExporting(true);
    try {
      const payload = await fetchInventory(
        `/api/inventory/stock-transactions/daily-report?date=${encodeURIComponent(
          dailyReportDate,
        )}`,
      );
      const reportRows = Array.isArray(payload?.rows) ? payload.rows : [];
      if (!reportRows.length) {
        toastInfo(`No transactions for ${dailyReportDate}.`);
        return;
      }
      const reportDateLabel = payload?.date || dailyReportDate;
      const rowsForExport = reportRows.map((row) => ({
        "Report Date": reportDateLabel,
        Item: row.item,
        "Item ID": row.sku,
        Warehouse: row.warehouse,
        "Opening Qty": row.openingQty,
        "Qty In": row.qtyIn,
        "Qty Out": row.qtyOut,
        "Net Change": row.netChange,
        "Closing Qty": row.closingQty,
        Transactions: row.transactions,
      }));

      downloadCsv(
        rowsForExport,
        `stock-daily-report-${reportDateLabel}.csv`,
      );
      toastSuccess("Daily report exported.");
    } catch (err) {
      toastError(err?.message || "Unable to export daily report.");
    } finally {
      setIsDailyExporting(false);
    }
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
      brandGroup: row.brandGroup || "",
      variantName: row.variantName || "",
      variantSku: row.variantSku || "",
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
    if (!formData.sku.trim()) {
      setActionError("Item ID is required.");
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
        brandGroup: formData.brandGroup,
        variantName: formData.variantName,
        variantSku: formData.variantSku,
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

      <div className="stock-transactions-tabs">
        {VIEW_OPTIONS.map((view) => (
          <button
            type="button"
            key={view}
            className={`tab ${activeView === view ? "active" : ""}`}
            onClick={() => handleViewChange(view)}
          >
            {view}
          </button>
        ))}
      </div>

      {activeView === "Transactions" ? (
        <>
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
              <div className="daily-report-group">
                <input
                  type="date"
                  className="filter-select"
                  aria-label="Daily report date"
                  value={dailyReportDate}
                  onChange={(event) => setDailyReportDate(event.target.value)}
                />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleDailyExport}
                  disabled={isDailyExporting}
                >
                  <DownloadIcon className="button-icon" />
                  {isDailyExporting ? "Exporting..." : "Daily CSV"}
                </button>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Export current view"
                onClick={handleExport}
              >
                <DownloadIcon />
              </button>
            </div>
          </div>

          <div
            className={`table-card mobile-card-table${
              isStockOutFilter ? " stock-out-table" : ""
            }`}
          >
            <div
              className={`table-header${
                isStockOutFilter ? " stock-out" : ""
              }`}
            >
              {isStockOutFilter ? (
                <>
                  <span>TXID</span>
                  <span>Item</span>
                  <span>Type</span>
                  <span>Qty</span>
                  <span>Order Number</span>
                  <span>Date</span>
                  <span>Handled By</span>
                  <span>Recipient</span>
                  <span>Actions</span>
                </>
              ) : (
                <>
                  <span>TXID</span>
                  <span>Item</span>
                  <span>Type</span>
                  <span>Qty</span>
                  <span>Source</span>
                  <span>Destination</span>
                  <span>Date</span>
                  <span>Handled By</span>
                  <span>Notes</span>
                  <span>Actions</span>
                </>
              )}
            </div>
            <div className="table-body">
              {rows.map((row) => (
                <div
                  className={`table-row${
                    isStockOutFilter ? " stock-out" : ""
                  }`}
                  key={row.id}
                >
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
                      {row.variantLabel ? (
                        <span className="muted">{row.variantLabel}</span>
                      ) : null}
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
                  {isStockOutFilter ? (
                    <>
                      <div className="cell muted" data-label="Order Number">
                        {row.source || "-"}
                      </div>
                      <div className="cell muted" data-label="Date">
                        {row.date}
                      </div>
                      <div className="cell staff" data-label="Handled By">
                        {row.staff || "-"}
                      </div>
                      <div className="cell muted notes full" data-label="Recipient">
                        {row.notes || "-"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="cell muted" data-label="Source">
                        {row.source || "-"}
                      </div>
                      <div className="cell muted" data-label="Destination">
                        {row.destination || "-"}
                      </div>
                      <div className="cell muted" data-label="Date">
                        {row.date}
                      </div>
                      <div className="cell staff" data-label="Handled By">
                        {row.staff || "-"}
                      </div>
                      <div className="cell muted notes full" data-label="Notes">
                        {row.notes || "-"}
                      </div>
                    </>
                  )}
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
        </>
      ) : (
        <>
          <div className="filters-card">
            <div className="stock-flow-filters">
              <div className="input-shell">
                <SearchIcon className="search-icon" />
                <input
                  type="text"
                  placeholder="Search inventory records"
                  value={recordSearch}
                  onChange={handleRecordSearchChange}
                />
              </div>
              <div className="daily-filter-group">
                <span className="muted">Daily filter</span>
                <input
                  type="date"
                  className="filter-select"
                  aria-label="Daily filter date"
                  value={dailyFilterDate}
                  onChange={(event) => setDailyFilterDate(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={triggerStockRefresh}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="stock-flow-list">
            {recordsLoading ? (
              <div className="empty-state">
                <p>Loading inventory records...</p>
              </div>
            ) : recordsError ? (
              <div className="empty-state">
                <p>{recordsError}</p>
              </div>
            ) : inventoryRecords.length === 0 ? (
              <div className="empty-state">
                <p>No inventory records found.</p>
              </div>
            ) : (
              inventoryRecords.map((record) => {
                const entries = buildRecordEntries(record);
                const recordTransactions =
                  transactionsBySku[record.sku] || [];
                const recordQtyLabel =
                  record.qtyLabel ||
                  (Number.isFinite(record.qtyValue)
                    ? formatQtyLabel(record.qtyValue)
                    : "");
                const isStockOutEntry = stockTransactionType === "Stock Out";
                const locationLabel = isStockOutEntry ? "Order Number" : "Source";

                return (
                  <div className="stock-record-card" key={record.id}>
                    <div className="stock-record-header">
                      <div>
                        <h3>{record.item}</h3>
                        <div className="muted">
                          <span className="mono">{record.sku}</span>
                          {record.warehouse ? ` - ${record.warehouse}` : ""}
                        </div>
                      </div>
                      <div className="record-qty">
                        <span>{recordQtyLabel || "Qty -"} </span>
                      </div>
                    </div>

                    <div className="stock-entry-list">
                      {entries.map((entry) => {
                        const entryKey = buildEntryKey(record.id, entry.key);
                        const entryData = entryState[entryKey] || {};
                        return (
                          <div className="stock-entry-row" key={entryKey}>
                            <div className="stock-entry-meta">
                              <strong>
                                {entry.variantName || "Variant"}
                              </strong>
                              {entry.brandGroup ? (
                                <span className="muted">
                                  {entry.brandGroup}
                                </span>
                              ) : null}
                              {entry.variantSku ? (
                                <span className="muted mono">
                                  {entry.variantSku}
                                </span>
                              ) : null}
                              {entry.qtyLabel ? (
                                <span className="muted">
                                  {entry.qtyLabel}
                                </span>
                              ) : null}
                            </div>
                            <div
                              className={`stock-entry-form${
                                isStockOutEntry ? " stock-out" : ""
                              }`}
                            >
                              <label className="entry-field">
                                <span>Qty</span>
                                <input
                                  type="number"
                                  value={entryData.qty || ""}
                                  onChange={updateEntryField(entryKey, "qty")}
                                  placeholder="0"
                                />
                              </label>
                              <label className="entry-field">
                                <span>{locationLabel}</span>
                                <input
                                  type="text"
                                  value={
                                    isStockOutEntry
                                      ? entryData.orderNumber || ""
                                      : entryData.location || ""
                                  }
                                  onChange={updateEntryField(
                                    entryKey,
                                    isStockOutEntry ? "orderNumber" : "location",
                                  )}
                                  placeholder={locationLabel}
                                />
                              </label>
                              {isStockOutEntry ? (
                                <label className="entry-field">
                                  <span>Recipient</span>
                                  <input
                                    type="text"
                                    value={entryData.recipient || ""}
                                    onChange={updateEntryField(
                                      entryKey,
                                      "recipient",
                                    )}
                                    placeholder="Recipient"
                                  />
                                </label>
                              ) : null}
                              <label className="entry-field">
                                <span>Handled By</span>
                                <input
                                  type="text"
                                  value={entryData.staff || ""}
                                  onChange={updateEntryField(
                                    entryKey,
                                    "staff",
                                  )}
                                  placeholder="Handled by"
                                />
                              </label>
                              {!isStockOutEntry ? (
                                <label className="entry-field entry-notes">
                                  <span>Notes</span>
                                  <input
                                    type="text"
                                    value={entryData.notes || ""}
                                    onChange={updateEntryField(
                                      entryKey,
                                      "notes",
                                    )}
                                    placeholder="Notes"
                                  />
                                </label>
                              ) : null}
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() =>
                                  handleQuickTransaction(record, entry)
                                }
                                disabled={entryData.isSaving}
                              >
                                {entryData.isSaving
                                  ? "Saving..."
                                  : `Log ${stockTransactionType}`}
                              </button>
                            </div>
                            {entryData.error ? (
                              <span className="entry-error">
                                {entryData.error}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <div className="stock-record-transactions">
                      <div className="stock-record-transactions-header">
                        <strong>
                          Transactions for {dailyFilterDate || "today"}
                        </strong>
                        <span className="muted">
                          {recordTransactions.length} entries
                        </span>
                      </div>
                      {dailyLoading ? (
                        <span className="muted">Loading transactions...</span>
                      ) : recordTransactions.length ? (
                        <div className="stock-transaction-list">
                          {recordTransactions.map((tx) => (
                            <div
                              className={`stock-transaction-row${
                                isStockOutFlow ? " stock-out" : ""
                              }`}
                              key={tx.id}
                            >
                              <span className={getQtyClass(tx.qty)}>
                                {tx.qty > 0 ? `+${tx.qty}` : tx.qty}
                              </span>
                              <span className="stock-transaction-meta">
                                {tx.variantLabel || tx.item}
                              </span>
                              {isStockOutFlow ? (
                                <>
                                  <span className="stock-transaction-meta">
                                    {tx.source || "-"}
                                  </span>
                                  <span className="stock-transaction-meta">
                                    {tx.staff || "Unassigned"}
                                  </span>
                                  <span className="stock-transaction-notes">
                                    {tx.notes || "-"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="stock-transaction-meta">
                                    {tx.staff || "Unassigned"}
                                  </span>
                                  <span className="stock-transaction-meta">
                                    {formatShortTime(tx.dateRaw)}
                                  </span>
                                  <span className="stock-transaction-notes">
                                    {tx.notes || "-"}
                                  </span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">
                          No transactions for this date.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

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
        {(() => {
          const isModalStockOut = formData.type === "Stock Out";
          return (
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
              <span>Item ID</span>
              <input
                type="text"
                value={formData.sku}
                onChange={updateField("sku")}
                placeholder="Item ID"
              />
            </label>
            <label className="modal-field">
              <span>Brand Group</span>
              <input
                type="text"
                value={formData.brandGroup}
                onChange={updateField("brandGroup")}
                placeholder="Optional"
              />
            </label>
            <label className="modal-field">
              <span>Variant Name</span>
              <input
                type="text"
                value={formData.variantName}
                onChange={updateField("variantName")}
                placeholder="Optional"
              />
            </label>
            <label className="modal-field">
              <span>Variant Item ID</span>
              <input
                type="text"
                value={formData.variantSku}
                onChange={updateField("variantSku")}
                placeholder="Optional"
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
              <span>{isModalStockOut ? "Order Number" : "Source"}</span>
              <input
                type="text"
                list="stock-transactions-warehouse-options"
                value={formData.source}
                onChange={updateField("source")}
                placeholder={
                  isModalStockOut ? "Order number" : "Select or type warehouse"
                }
              />
            </label>
            {!isModalStockOut ? (
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
            ) : null}
            <label className="modal-field">
              <span>Date</span>
              <input
                type="datetime-local"
                value={formData.date}
                onChange={updateField("date")}
              />
            </label>
            <label className="modal-field">
              <span>Handled By</span>
              <input
                type="text"
                value={formData.staff}
                onChange={updateField("staff")}
                placeholder="Handled by"
              />
            </label>
            <label className="modal-field full">
              <span>{isModalStockOut ? "Recipient" : "Notes"}</span>
              <textarea
                rows="3"
                value={formData.notes}
                onChange={updateField("notes")}
                placeholder={
                  isModalStockOut
                    ? "Recipient name"
                    : "Notes about this movement"
                }
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
          );
        })()}
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
