import { useEffect, useState } from "react";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  fetchInventory,
  formatShortDate,
  formatShortDateTime,
  parseListResponse,
} from "../../utils/inventoryApi";
import { formatCurrencyValue, useInventoryCurrency } from "../../utils/currency";
import { getExportExtension } from "../../utils/exportFormat";
import { buildInventoryRecordExportRows } from "../../utils/inventoryRecordExport";
import Breadcrumb from "../../components/ui/Breadcrumb";
import "./Settings.css";

const DEFAULT_SETTINGS = {
  organizationName: "MagicHands Logistics",
  primaryContactEmail: "ops@magichands.io",
  currency: "GHS",
  currencyRate: 1,
  timezone: "Africa/Accra",
  dateFormat: "DD MMM, YYYY",
  numberFormat: "1,234.56",
  notifyLowStock: true,
  notifyPurchaseOrders: true,
  notifyWeeklySummary: false,
  defaultWarehouse: "Central Warehouse",
  lowStockThreshold: 18,
  unitOfMeasure: "Pieces",
  autoReorder: false,
  theme: "System",
  tableDensity: "Comfortable",
  defaultExportFormat: "CSV",
  dataRetention: "24 months",
  auditLogAccess: "Admins only",
};

const Settings = () => {
  const { currency, rate } = useInventoryCurrency();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const normalizeThemeSetting = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "light") return "Light";
    if (normalized === "dark") return "Dark";
    if (normalized === "system") return "System";
    return value || "System";
  };

  const buildCsvContent = (rows = []) => {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    return [
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

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const [settingsPayload, warehousePayload] = await Promise.all([
          fetchInventory("/api/inventory/settings"),
          fetchInventory("/api/inventory/warehouses/options"),
        ]);
        if (!isMounted) return;
        const merged = { ...DEFAULT_SETTINGS, ...settingsPayload };
        const warehouseParsed = parseListResponse(warehousePayload);
        const optionList = Array.isArray(warehouseParsed?.data)
          ? warehouseParsed.data
          : [];
        const combined = Array.from(
          new Set([merged.defaultWarehouse, ...optionList].filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b));
        setSettings(merged);
        setSavedSettings(merged);
        setWarehouseOptions(combined);
        setStatusMessage("");
      } catch (err) {
        if (!isMounted) return;
        setStatusMessage(err?.message || "Unable to load settings.");
      }
    };

    loadSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleAppearanceChange = (event) => {
      const nextTheme = normalizeThemeSetting(event?.detail?.theme);
      const nextDensity = event?.detail?.tableDensity;
      if (!nextTheme && !nextDensity) return;
      setSettings((prev) => ({
        ...prev,
        ...(nextTheme ? { theme: nextTheme } : {}),
        ...(nextDensity ? { tableDensity: nextDensity } : {}),
      }));
      setSavedSettings((prev) => ({
        ...prev,
        ...(nextTheme ? { theme: nextTheme } : {}),
        ...(nextDensity ? { tableDensity: nextDensity } : {}),
      }));
    };
    window.addEventListener(
      "inventory:appearance-changed",
      handleAppearanceChange,
    );
    return () =>
      window.removeEventListener(
        "inventory:appearance-changed",
        handleAppearanceChange,
      );
  }, []);

  const updateField = (field) => (event) => {
    const value =
      event?.target?.type === "checkbox"
        ? event.target.checked
        : event.target.value;
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const updateNotificationSetting = (field) => async (event) => {
    const nextValue = Boolean(event?.target?.checked);
    setSettings((prev) => ({ ...prev, [field]: nextValue }));
    setStatusMessage("");
    setIsSavingNotifications(true);
    try {
      await fetchInventory("/api/inventory/settings", {
        method: "PATCH",
        body: JSON.stringify({ [field]: nextValue }),
        toast: { silent: true },
      });
      setSavedSettings((prev) => ({ ...prev, [field]: nextValue }));
      setStatusMessage("Notification settings updated.");
    } catch (err) {
      const fallback =
        savedSettings[field] ?? DEFAULT_SETTINGS[field] ?? false;
      setSettings((prev) => ({ ...prev, [field]: fallback }));
      setStatusMessage(err?.message || "Unable to update notification settings.");
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...settings,
        lowStockThreshold: Number.isFinite(Number(settings.lowStockThreshold))
          ? Math.min(100, Math.max(0, Number(settings.lowStockThreshold)))
          : settings.lowStockThreshold,
        currencyRate: Number.isFinite(Number(settings.currencyRate))
          ? Number(settings.currencyRate)
          : settings.currencyRate,
      };
      const updated = await fetchInventory("/api/inventory/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
        toast: { silent: true },
      });
      const merged = { ...DEFAULT_SETTINGS, ...updated };
      setSettings(merged);
      setSavedSettings(merged);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("inventory-currency", merged.currency);
        window.localStorage.setItem(
          "inventory-currency-rate",
          String(merged.currencyRate ?? 1),
        );
        window.localStorage.setItem(
          "inventory-export-format",
          String(merged.defaultExportFormat || "CSV").toUpperCase(),
        );
        window.dispatchEvent(
          new CustomEvent("inventory:appearance-changed", {
            detail: {
              theme: merged.theme,
              tableDensity: merged.tableDensity,
            },
          }),
        );
        window.dispatchEvent(
          new CustomEvent("inventory:export-format-changed", {
            detail: {
              format: merged.defaultExportFormat,
            },
          }),
        );
      }
      setStatusMessage("Settings saved.");
    } catch (err) {
      setStatusMessage(err?.message || "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSettings(savedSettings);
    setStatusMessage("Changes discarded.");
  };

  const handleExportData = async () => {
    if (isExportingData) return;
    setIsExportingData(true);
    setStatusMessage("");
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
            Brand:
              Array.isArray(record.brandGroups) && record.brandGroups.length
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
            Value: formatCurrencyValue(
              record.valueValue ?? record.value,
              currency,
              rate,
            ),
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
        const extension = getExportExtension(settings.defaultExportFormat);

        if (module.key === "inventory-records") {
          const rows = buildInventoryRecordExportRows(data, currency, rate);
          if (!rows.length) continue;
          downloadCsvFile(
            rows,
            `inventory-${module.key}-${dateStamp}.${extension}`,
          );
          continue;
        }
        const rows = data.map(module.mapRow);
        downloadCsvFile(
          rows,
          `inventory-${module.key}-${dateStamp}.${extension}`,
        );
      }
      setStatusMessage("Export complete.");
    } catch (err) {
      setStatusMessage(err?.message || "Unable to export data.");
    } finally {
      setIsExportingData(false);
    }
  };

  const requestDeleteData = () => {
    setShowDeleteDialog(true);
  };

  const closeDeleteData = () => {
    if (isDeletingData) return;
    setShowDeleteDialog(false);
  };

  const confirmDeleteData = async () => {
    if (isDeletingData) return;
    setIsDeletingData(true);
    setStatusMessage("");
    try {
      await fetchInventory("/api/inventory/data", {
        method: "DELETE",
        toast: { silent: true },
      });
      setStatusMessage("All inventory data deleted.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("mh:data-changed", {
            detail: { source: "settings" },
          }),
        );
      }
    } catch (err) {
      setStatusMessage(err?.message || "Unable to delete inventory data.");
    } finally {
      setIsDeletingData(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <section className="settings-page">
    <header className="settings-header">
      <div>
        <Breadcrumb pageKey="settings" />
        <h2>Settings</h2>
        <p>Manage organization preferences, security, and portal defaults.</p>
      </div>
    </header>

    <div className="settings-layout">
      <aside className="settings-nav">
        <span className="nav-title">Sections</span>
        <a href="#org-locale">Organization &amp; Locale</a>
        <a href="#notifications">Notifications</a>
        <a href="#inventory-preferences">Inventory Preferences</a>
        <a href="#appearance">Appearance</a>
        <a href="#integrations">Integrations</a>
        <a href="#data-privacy">Data &amp; Privacy</a>
      </aside>

      <div className="settings-content">
        <section className="settings-card" id="org-locale">
          <header>
            <h3>Organization &amp; Locale</h3>
            <p>Set currency, timezone, and regional defaults for all users.</p>
          </header>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Organization Name</span>
              <input
                type="text"
                value={settings.organizationName}
                onChange={updateField("organizationName")}
              />
            </label>
            <label className="settings-field">
              <span>Primary Contact Email</span>
              <input
                type="email"
                value={settings.primaryContactEmail}
                onChange={updateField("primaryContactEmail")}
              />
            </label>
            <label className="settings-field">
              <span>Currency</span>
              <select
                value={settings.currency}
                onChange={updateField("currency")}
              >
                <option value="GHS">GHS (Default)</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Conversion Rate (GHS per USD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.currencyRate}
                onChange={updateField("currencyRate")}
              />
            </label>
            <label className="settings-field">
              <span>Timezone</span>
              <select
                value={settings.timezone}
                onChange={updateField("timezone")}
              >
                <option value="Africa/Accra">Africa/Accra (GMT+00:00)</option>
                <option value="America/New_York">
                  America/New_York (GMT-05:00)
                </option>
                <option value="Europe/London">
                  Europe/London (GMT+00:00)
                </option>
                <option value="Asia/Dubai">Asia/Dubai (GMT+04:00)</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Date Format</span>
              <select
                value={settings.dateFormat}
                onChange={updateField("dateFormat")}
              >
                <option>DD MMM, YYYY</option>
                <option>MM/DD/YYYY</option>
                <option>YYYY-MM-DD</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Number Format</span>
              <select
                value={settings.numberFormat}
                onChange={updateField("numberFormat")}
              >
                <option>1,234.56</option>
                <option>1.234,56</option>
                <option>1234.56</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-card" id="notifications">
          <header>
            <h3>Notifications</h3>
            <p>Control alerts sent to email and in-app channels.</p>
          </header>
          <div className="settings-toggles">
            <div className="toggle-row">
              <div>
                <strong>Low Stock Alerts</strong>
                <p>Notify when items hit the minimum threshold.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.notifyLowStock}
                  onChange={updateNotificationSetting("notifyLowStock")}
                  disabled={isSavingNotifications}
                />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-row">
              <div>
                <strong>Purchase Order Updates</strong>
                <p>Send updates when POs are approved or received.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.notifyPurchaseOrders}
                  onChange={updateNotificationSetting("notifyPurchaseOrders")}
                  disabled={isSavingNotifications}
                />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-row">
              <div>
                <strong>Weekly Summary</strong>
                <p>Deliver a digest every Monday morning.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.notifyWeeklySummary}
                  onChange={updateNotificationSetting("notifyWeeklySummary")}
                  disabled={isSavingNotifications}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </section>

        <section className="settings-card" id="inventory-preferences">
          <header>
            <h3>Inventory Preferences</h3>
            <p>Configure default warehouse and stocking rules.</p>
          </header>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Default Warehouse</span>
              <input
                type="text"
                list="inventory-settings-warehouse-options"
                value={settings.defaultWarehouse}
                onChange={updateField("defaultWarehouse")}
                placeholder="Select or type warehouse"
              />
            </label>
            <label className="settings-field">
              <span>Low Stock Threshold (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={settings.lowStockThreshold}
                onChange={updateField("lowStockThreshold")}
              />
            </label>
            <label className="settings-field">
              <span>Unit of Measure</span>
              <select
                value={settings.unitOfMeasure}
                onChange={updateField("unitOfMeasure")}
              >
                <option>Pieces</option>
                <option>Packs</option>
                <option>Kilograms</option>
              </select>
            </label>
          </div>
          <div className="settings-toggles">
            <div className="toggle-row">
              <div>
                <strong>Auto-Reorder</strong>
                <p>Automatically create draft POs when stock is critical.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.autoReorder}
                  onChange={updateField("autoReorder")}
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        </section>

        <section className="settings-card" id="appearance">
          <header>
            <h3>Appearance</h3>
            <p>Adjust default layout density and theme.</p>
          </header>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Theme</span>
              <select
                value={settings.theme}
                onChange={updateField("theme")}
              >
                <option>System</option>
                <option>Light</option>
                <option>Dark</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Table Density</span>
              <select
                value={settings.tableDensity}
                onChange={updateField("tableDensity")}
              >
                <option>Comfortable</option>
                <option>Compact</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-card" id="integrations">
          <header>
            <h3>Integrations</h3>
            <p>Manage external systems and export defaults.</p>
          </header>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Default Export Format</span>
              <select
                value={settings.defaultExportFormat}
                onChange={updateField("defaultExportFormat")}
              >
                <option>CSV</option>
                <option>PDF</option>
                <option>XLSX</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-card" id="data-privacy">
          <header>
            <h3>Data &amp; Privacy</h3>
            <p>Control exports and retention policy.</p>
          </header>
          <div className="settings-grid">
            <label className="settings-field">
              <span>Data Retention</span>
              <select
                value={settings.dataRetention}
                onChange={updateField("dataRetention")}
              >
                <option>12 months</option>
                <option>24 months</option>
                <option>36 months</option>
                <option>Indefinite</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Audit Log Access</span>
              <select
                value={settings.auditLogAccess}
                onChange={updateField("auditLogAccess")}
              >
                <option>Admins only</option>
                <option>Admins + Managers</option>
                <option>All staff</option>
              </select>
            </label>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportData}
              disabled={isExportingData}
            >
              {isExportingData ? "Exporting..." : "Export Data"}
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={requestDeleteData}
              disabled={isDeletingData}
            >
              {isDeletingData ? "Deleting..." : "Delete Organization Data"}
            </button>
          </div>
        </section>

        <div className="settings-footer">
          <div className="footer-note">
            {statusMessage || "Changes will apply to all users in your organization."}
          </div>
          <div className="footer-actions">
            <button type="button" className="ghost-button" onClick={handleCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
    <datalist id="inventory-settings-warehouse-options">
      {warehouseOptions.map((warehouse) => (
        <option key={warehouse} value={warehouse} />
      ))}
    </datalist>
    <ConfirmDialog
      isOpen={showDeleteDialog}
      title="Delete Organization Data"
      message="This will permanently delete all inventory data, reports, and notifications in this portal. This action cannot be undone."
      confirmText={isDeletingData ? "Deleting..." : "Delete Data"}
      cancelText="Cancel"
      onConfirm={confirmDeleteData}
      onClose={closeDeleteData}
    />
  </section>
  );
};

export default Settings;
