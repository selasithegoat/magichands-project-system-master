import { useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  DownloadIcon,
  FileTextIcon,
  ReportIcon,
  SearchIcon,
  SortIcon,
  SuppliersIcon,
  SwapIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Breadcrumb from "../../components/ui/Breadcrumb";
import { reportCards } from "../../data/reports";
import {
  fetchInventory,
  formatShortDateTime,
  formatShortDate,
  parseListResponse,
} from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import useInventoryGlobalSearch from "../../hooks/useInventoryGlobalSearch";
import {
  formatCurrencyValue,
  parseCurrencyValue,
  useInventoryCurrency,
} from "../../utils/currency";
import {
  getExportExtension,
  useInventoryExportFormat,
} from "../../utils/exportFormat";
import { buildInventoryRecordExportRows } from "../../utils/inventoryRecordExport";
import "./Reports.css";

const cardIconMap = {
  summary: FileTextIcon,
  lowStock: AlertCircleIcon,
  movement: SwapIcon,
  valuation: ReportIcon,
  supplier: SuppliersIcon,
};

const getStatusClass = (status) =>
  `status-pill ${String(status || "").toLowerCase().replace(/\s+/g, "-")}`;

const STATUS_FILTERS = ["All", "Ready", "Expired"];
const DOWNLOAD_EXTENSION_MAP = {
  CSV: "csv",
  PDF: "pdf",
  XLSX: "xlsx",
};
const REPORT_TYPE_MAP = {
  "inventory-summary": "summary",
  "low-stock": "lowStock",
  "inventory-movement": "movement",
  valuation: "valuation",
  "supplier-history": "supplier",
};

const getCardTypeByTitle = (cards, name) => {
  if (!name) return "";
  const match = cards.find(
    (card) => String(card.title || "").toLowerCase() === String(name).toLowerCase(),
  );
  if (!match) return "";
  return REPORT_TYPE_MAP[match.id] || "";
};

const inferReportType = (report) => {
  const value = String(report?.type || report?.name || "").toLowerCase();
  if (value.includes("low stock")) return "lowStock";
  if (value.includes("movement")) return "movement";
  if (value.includes("valuation")) return "valuation";
  if (value.includes("supplier")) return "supplier";
  return "summary";
};

const slugifyFileName = (value, fallback = "report") => {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
};

const buildCsvContent = (rows = []) => {
  if (!rows.length) return "";
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
  return csv;
};

const downloadCsvFile = (rows, filename) => {
  if (!rows.length) return;
  const csv = buildCsvContent(rows);
  if (!csv) return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const toNumber = (value) => {
  if (Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number.parseFloat(trimmed.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getRecordQty = (record) =>
  toNumber(record?.qtyValue ?? record?.qtyLabel ?? record?.qty);

const getRecordValue = (record) => {
  const direct =
    toNumber(record?.valueValue ?? record?.value) ??
    parseCurrencyValue(record?.value);
  return Number.isFinite(direct) ? direct : null;
};

const getRecordPrice = (record) => {
  const direct =
    toNumber(record?.priceValue ?? record?.price) ??
    parseCurrencyValue(record?.price);
  return Number.isFinite(direct) ? direct : null;
};

const getRecordPercent = (record) => {
  const qty = getRecordQty(record);
  const maxQty = toNumber(record?.maxQty);
  if (Number.isFinite(qty) && Number.isFinite(maxQty) && maxQty > 0) {
    return (qty / maxQty) * 100;
  }
  const meta = toNumber(record?.qtyMeta);
  return Number.isFinite(meta) ? meta : null;
};

const buildInventorySummaryRows = (records, currency, rate) => {
  const grouped = new Map();
  records.forEach((record) => {
    const category = record.category || "Uncategorized";
    if (!grouped.has(category)) {
      grouped.set(category, { items: 0, qty: 0, value: 0 });
    }
    const entry = grouped.get(category);
    entry.items += 1;
    const qty = getRecordQty(record);
    if (Number.isFinite(qty)) entry.qty += qty;
    const value = getRecordValue(record);
    if (Number.isFinite(value)) entry.value += value;
  });

  return Array.from(grouped.entries()).map(([category, stats]) => ({
    Category: category,
    "Items Count": stats.items,
    "Total Quantity": Number.isFinite(stats.qty) ? stats.qty : "",
    "Total Value": formatCurrencyValue(stats.value, currency, rate),
  }));
};

const buildLowStockRows = (records, threshold) =>
  records
    .filter((record) => {
      const percent = getRecordPercent(record);
      return Number.isFinite(percent) && percent <= threshold;
    })
    .map((record) => {
      const percent = getRecordPercent(record);
      return {
        Item: record.item || "",
        "Item ID": record.sku || "",
        Category: record.category || "",
        Warehouse: record.warehouse || record.subtext || "",
        Quantity: record.qtyLabel || record.qtyValue || "",
        "Capacity %": Number.isFinite(percent)
          ? `${Math.round(percent * 10) / 10}%`
          : "",
        Threshold: `${threshold}%`,
        Status: record.status || "",
      };
    });

const buildMovementRows = (transactions) =>
  transactions.map((tx) => ({
    TXID: tx.txid || "",
    Item: tx.item || "",
    "Item ID": tx.sku || "",
    Type: tx.type || "",
    Qty: tx.qty ?? "",
    Source: tx.source || "",
    Destination: tx.destination || "",
    Date: formatShortDateTime(tx.date || tx.createdAt),
    Staff: tx.staff || "",
    Notes: tx.notes || "",
  }));

const buildValuationRows = (records, currency, rate) =>
  records.map((record) => ({
    Item: record.item || "",
    "Item ID": record.sku || "",
    Brand: Array.isArray(record.brandGroups) && record.brandGroups.length
      ? record.brandGroups
          .map((group) => group?.name || "")
          .filter(Boolean)
          .join(", ")
      : record.brand || "",
    Category: record.category || "",
    Warehouse: record.warehouse || record.subtext || "",
    Quantity: record.qtyLabel || record.qtyValue || "",
    Price: formatCurrencyValue(getRecordPrice(record), currency, rate),
    Value: formatCurrencyValue(getRecordValue(record), currency, rate),
  }));

const buildSupplierHistoryRows = (orders, currency, rate) => {
  const supplierMap = new Map();
  orders.forEach((order) => {
    const supplier = order.supplierName || order.supplier || "Unknown";
    if (!supplierMap.has(supplier)) {
      supplierMap.set(supplier, {
        orders: 0,
        spend: 0,
        lastOrder: null,
      });
    }
    const entry = supplierMap.get(supplier);
    entry.orders += 1;
    const total = parseCurrencyValue(order.total);
    entry.spend += total;
    const date = new Date(
      order.dateRequestPlaced || order.createdAt || order.created || "",
    );
    if (!Number.isNaN(date.getTime())) {
      if (!entry.lastOrder || date > entry.lastOrder) {
        entry.lastOrder = date;
      }
    }
  });

  return Array.from(supplierMap.entries()).map(([supplier, stats]) => ({
    Supplier: supplier,
    "Orders Count": stats.orders,
    "Total Spend": formatCurrencyValue(stats.spend, currency, rate),
    "Last Order Date": stats.lastOrder
      ? formatShortDateTime(stats.lastOrder)
      : "",
  }));
};

const Reports = () => {
  const cards = useMemo(() => reportCards, []);
  const [reports, setReports] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: 4,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { currency, rate } = useInventoryCurrency();
  const { format: exportFormat } = useInventoryExportFormat();

  useEffect(() => {
    let isMounted = true;

    const loadReports = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(meta.limit));
        if (statusFilter !== "All") {
          params.set("status", statusFilter);
        }
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        const payload = await fetchInventory(
          `/api/inventory/reports?${params.toString()}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((report, index) => ({
          id: report._id || report.id || `${index}`,
          name: report.name || "",
          type:
            report.type ||
            getCardTypeByTitle(cards, report.name) ||
            "",
          created: formatShortDateTime(
            report.createdAtOverride || report.createdAt || report.created,
          ),
          generatedBy: report.generatedBy || "",
          status: report.status || "Ready",
          downloads: ["CSV"],
        }));

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setReports(normalized);
        setMeta({
          limit: parsed.limit || meta.limit,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setReports([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load reports.");
      }
    };

    loadReports();
    return () => {
      isMounted = false;
    };
  }, [meta.limit, page, refreshKey, searchTerm, statusFilter]);

  const total = meta.total || reports.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + reports.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
    setPage(1);
  });

  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    if (meta.totalPages && nextPage > meta.totalPages) return;
    setPage(nextPage);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleStatusChange = (event) => {
    setStatusFilter(event.target.value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("All");
    setPage(1);
  };

  const createReport = async (name, type) => {
    const payload = await fetchInventory("/api/inventory/reports", {
      method: "POST",
      body: JSON.stringify({ name, type }),
    });
    return payload;
  };

  const resolveReportType = (report, fallback) =>
    report?.type ||
    fallback ||
    getCardTypeByTitle(cards, report?.name) ||
    inferReportType(report);

  const downloadReportData = async (report, format) => {
    if (!report) return;
    const extension =
      DOWNLOAD_EXTENSION_MAP[format] ||
      String(format || "csv").toLowerCase();
    const safeName = slugifyFileName(report.name, "report");
    const fileName = `${safeName}.${extension}`;
    const reportType = resolveReportType(report);

    if (reportType === "movement") {
      const transactions = await fetchAllPages(
        "/api/inventory/stock-transactions",
      );
      const rows = buildMovementRows(transactions);
      downloadCsvFile(rows, fileName);
      return;
    }

    if (reportType === "supplier") {
      const orders = await fetchAllPages("/api/inventory/purchase-orders");
      const rows = buildSupplierHistoryRows(orders, currency, rate);
      downloadCsvFile(rows, fileName);
      return;
    }

    if (reportType === "valuation") {
      const records = await fetchAllPages("/api/inventory/inventory-records");
      const rows = buildValuationRows(records, currency, rate);
      downloadCsvFile(rows, fileName);
      return;
    }

    if (reportType === "lowStock") {
      const [records, settings] = await Promise.all([
        fetchAllPages("/api/inventory/inventory-records"),
        fetchInventory("/api/inventory/settings").catch(() => ({})),
      ]);
      const thresholdRaw = Number(settings?.lowStockThreshold ?? 0);
      const threshold = Number.isFinite(thresholdRaw)
        ? Math.min(100, Math.max(0, thresholdRaw))
        : 0;
      const rows = buildLowStockRows(
        records,
        Number.isFinite(threshold) ? threshold : 0,
      );
      downloadCsvFile(rows, fileName);
      return;
    }

    const records = await fetchAllPages("/api/inventory/inventory-records");
    const rows = buildInventorySummaryRows(records, currency, rate);
    downloadCsvFile(rows, fileName);
  };

  const handleGenerateReport = async (card) => {
    setError("");
    try {
      const reportType = REPORT_TYPE_MAP[card.id] || "summary";
      await createReport(card.title, reportType);
      setPage(1);
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to generate report.");
    }
  };

  const handleExportReport = async (card) => {
    setError("");
    try {
      const reportType = REPORT_TYPE_MAP[card.id] || "summary";
      const created = await createReport(card.title, reportType);
      const formatted = {
        id: created?._id || created?.id || card.id,
        name: created?.name || card.title,
        type: created?.type || reportType,
        created: formatShortDateTime(
          created?.createdAtOverride || created?.createdAt || created?.created,
        ),
        generatedBy: created?.generatedBy || "",
        status: created?.status || "Ready",
      };
      await downloadReportData(formatted, exportFormat || "CSV");
      setPage(1);
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to export report.");
    }
  };

  const handleDownloadReport = async (report, format) => {
    setError("");
    try {
      await downloadReportData(report, format);
    } catch (err) {
      setError(err?.message || "Unable to download report.");
    }
  };

  const fetchAllPages = async (endpoint) => {
    const limit = 100;
    let pageNumber = 1;
    let totalPages = 1;
    const all = [];

    while (pageNumber <= totalPages) {
      const payload = await fetchInventory(
        `${endpoint}?page=${pageNumber}&limit=${limit}`,
      );
      const parsed = parseListResponse(payload);
      all.push(...parsed.data);
      totalPages = parsed.totalPages || 1;
      pageNumber += 1;
      if (!parsed.data.length && pageNumber > 1) break;
    }

    return all;
  };

  const handleExportAll = async () => {
    if (isExportingAll) return;
    setIsExportingAll(true);
    setError("");
    const dateStamp = new Date().toISOString().slice(0, 10);

    try {
      const modules = [
        {
          key: "client-items",
          endpoint: "/api/inventory/client-items",
          mapRow: (item) => ({
            Client: item.clientName || item.client || "",
            Phone: item.clientPhone || item.phone || "",
            Item: item.itemName || item.item || "",
            "Order Number": item.orderNo || item.serialNumber || item.serial || "",
            Received: formatShortDate(
              item.receivedAt || item.received || item.dateReceived,
            ),
            Warehouse: item.warehouse || "",
            Status: item.status || "",
            Notes: item.notes || "",
          }),
        },
        {
          key: "suppliers",
          endpoint: "/api/inventory/suppliers",
          mapRow: (supplier) => ({
            Supplier: supplier.name || "",
            Code: supplier.code || "",
            "Contact Person": supplier.contactPerson || "",
            Role: supplier.role || "",
            Phone: supplier.phone || "",
            Email: supplier.email || "",
            Products: Array.isArray(supplier.products)
              ? supplier.products
                  .map((product) => product?.label || product?.name || "")
                  .filter(Boolean)
                  .join(", ")
              : "",
            "Open PO": supplier.openPO?.label || "",
            "Open PO Status": supplier.openPO?.status || "",
          }),
        },
        {
          key: "purchase-orders",
          endpoint: "/api/inventory/purchase-orders",
          mapRow: (order) => ({
            "PO Number": order.poNumber || order.orderNo || "",
            Supplier: order.supplierName || order.supplier || "",
            "Item Names": Array.isArray(order.items)
              ? order.items
                  .map((item) => item?.name || "")
                  .filter(Boolean)
                  .join(", ")
              : "",
            "Items Count": Number.isFinite(order.itemsCount)
              ? order.itemsCount
              : Array.isArray(order.items)
                ? order.items.length
                : "",
            Category: order.category || "",
            "Total Cost": formatCurrencyValue(order.total, currency, rate),
            Status: order.status || order.requestStatus || "",
            "Created Date": formatShortDateTime(
              order.dateRequestPlaced || order.createdAt || order.created,
            ),
          }),
        },
        {
          key: "inventory-records",
          endpoint: "/api/inventory/inventory-records",
          mapRow: (record) => ({
            Item: record.item || "",
            "Item ID": record.sku || "",
            Brand: Array.isArray(record.brandGroups) && record.brandGroups.length
              ? record.brandGroups
                  .map((group) => group?.name || "")
                  .filter(Boolean)
                  .join(", ")
              : record.brand || "",
            Category: record.category || "",
            Warehouse: record.warehouse || record.subtext || "",
            Quantity: record.qtyLabel || record.qtyValue || "",
            Variations: record.variations || "",
            "Colors/Kind": record.colors || "",
            Price: formatCurrencyValue(
              record.priceValue ?? record.price,
              currency,
              rate,
            ),
            Value: formatCurrencyValue(record.valueValue ?? record.value, currency, rate),
            Status: record.status || "",
          }),
        },
        {
          key: "stock-transactions",
          endpoint: "/api/inventory/stock-transactions",
          mapRow: (tx) => ({
            TXID: tx.txid || "",
            Item: tx.item || "",
            "Item ID": tx.sku || "",
            Type: tx.type || "",
            Qty: tx.qty || "",
            Source: tx.source || "",
            Supplier: tx.supplierName || tx.supplier || "",
            Destination: tx.destination || "",
            Date: formatShortDateTime(tx.date || tx.createdAt),
            Staff: tx.staff || "",
            Notes: tx.notes || "",
          }),
        },
        {
          key: "inventory-categories",
          endpoint: "/api/inventory/categories",
          mapRow: (category) => ({
            Category: category.name || "",
            Description: category.description || "",
          }),
        },
        {
          key: "reports",
          endpoint: "/api/inventory/reports",
          mapRow: (report) => ({
            "Report Name": report.name || "",
            "Generated By": report.generatedBy || "",
            Status: report.status || "",
            "Created Date": formatShortDateTime(
              report.createdAtOverride || report.createdAt || report.created,
            ),
          }),
        },
      ];

      for (const module of modules) {
        const data = await fetchAllPages(module.endpoint);
        if (!data.length) continue;
        if (module.key === "inventory-records") {
          const rows = buildInventoryRecordExportRows(data, currency, rate);
          if (!rows.length) continue;
          downloadCsvFile(
            rows,
            `inventory-${module.key}-${dateStamp}.${getExportExtension(
              exportFormat,
            )}`,
          );
          continue;
        }
        const rows = data.map(module.mapRow);
        downloadCsvFile(
          rows,
          `inventory-${module.key}-${dateStamp}.${getExportExtension(
            exportFormat,
          )}`,
        );
      }
    } catch (err) {
      setError(err?.message || "Unable to export data.");
    } finally {
      setIsExportingAll(false);
    }
  };

  const requestDelete = (report) => {
    setDeleteTarget(report);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(`/api/inventory/reports/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setPage(1);
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete report.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  return (
    <section className="reports-page">
      <header className="reports-header">
        <div>
          <Breadcrumb pageKey="reports" />
          <h2>Analytics &amp; Reports</h2>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={handleExportAll}
          disabled={isExportingAll}
        >
          <DownloadIcon className="button-icon" />
          {isExportingAll ? "Exporting..." : "Export All Data"}
        </button>
      </header>

      <div className="reports-cards">
        {cards.map((card) => {
          const Icon = cardIconMap[card.icon];
          return (
            <article className="report-card" key={card.id}>
              <div className={`report-icon ${card.tone}`}>
                {Icon ? <Icon /> : null}
              </div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <div className="report-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleGenerateReport(card)}
                >
                  Generate
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleExportReport(card)}
                >
                  Export
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="reports-table-card mobile-card-table">
        <div className="reports-table-header">
          <h3>Recent Reports</h3>
          <div className="reports-table-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Filter"
              onClick={() => setFiltersOpen((prev) => !prev)}
            >
              <SortIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Refresh"
              onClick={triggerRefresh}
            >
              <SwapIcon />
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="reports-filters">
            <div className="reports-filters-row">
              <div className="input-shell">
                <SearchIcon className="search-icon" />
                <input
                  type="text"
                  placeholder="Search reports or generated by..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
              <select
                className="filter-select"
                aria-label="Filter by status"
                value={statusFilter}
                onChange={handleStatusChange}
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
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

        <div className="table-header">
          <span>Report Name</span>
          <span>Date Created</span>
          <span>Generated By</span>
          <span>Status</span>
          <span>Downloads</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {reports.map((report) => (
            <div className="table-row" key={report.id}>
              <div className="cell report-name full" data-label="Report Name">
                <span className="file-icon">
                  <FileTextIcon />
                </span>
                <strong>{report.name}</strong>
              </div>
              <div className="cell muted" data-label="Date Created">
                {report.created}
              </div>
              <div className="cell muted" data-label="Generated By">
                {report.generatedBy}
              </div>
              <div className="cell" data-label="Status">
                <span className={getStatusClass(report.status)}>
                  {report.status}
                </span>
              </div>
              <div className="cell downloads-cell" data-label="Downloads">
                {report.downloads.map((download) => (
                  <button
                    type="button"
                    key={download}
                    className={`download-link ${
                      report.status === "Expired" ? "disabled" : ""
                    }`}
                    disabled={report.status === "Expired"}
                    onClick={() =>
                      report.status === "Expired"
                        ? null
                        : handleDownloadReport(report, download)
                    }
                  >
                    {download}
                  </button>
                ))}
              </div>
              <div className="cell actions-cell" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Delete ${report.name}`}
                  onClick={() => requestDelete(report)}
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
              : `Showing ${startIndex} to ${endIndex} of ${total} reports`}
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

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Report"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name}? This cannot be undone.`
            : "Delete this report?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </section>
  );
};

export default Reports;
