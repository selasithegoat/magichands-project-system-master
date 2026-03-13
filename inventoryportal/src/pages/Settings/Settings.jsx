import { useEffect, useState } from "react";
import { fetchInventory } from "../../utils/inventoryApi";
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
  posErpConnection: "Not connected",
  dataRetention: "24 months",
  auditLogAccess: "Admins only",
};

const Settings = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const payload = await fetchInventory("/api/inventory/settings");
        if (!isMounted) return;
        const merged = { ...DEFAULT_SETTINGS, ...payload };
        setSettings(merged);
        setSavedSettings(merged);
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

  const updateField = (field) => (event) => {
    const value =
      event?.target?.type === "checkbox"
        ? event.target.checked
        : event.target.value;
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        ...settings,
        lowStockThreshold: Number.isFinite(Number(settings.lowStockThreshold))
          ? Number(settings.lowStockThreshold)
          : settings.lowStockThreshold,
        currencyRate: Number.isFinite(Number(settings.currencyRate))
          ? Number(settings.currencyRate)
          : settings.currencyRate,
      };
      const updated = await fetchInventory("/api/inventory/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
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

  return (
    <section className="settings-page">
    <header className="settings-header">
      <div>
        <div className="breadcrumb">System / Settings</div>
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
                  onChange={updateField("notifyLowStock")}
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
                  onChange={updateField("notifyPurchaseOrders")}
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
                  onChange={updateField("notifyWeeklySummary")}
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
              <select
                value={settings.defaultWarehouse}
                onChange={updateField("defaultWarehouse")}
              >
                <option>Central Warehouse</option>
                <option>Main Hub</option>
                <option>East Branch</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Low Stock Threshold</span>
              <input
                type="number"
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
            <label className="settings-field">
              <span>POS/ERP Connection</span>
              <input
                type="text"
                value={settings.posErpConnection}
                onChange={updateField("posErpConnection")}
              />
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
            <button type="button" className="ghost-button">
              Export Data
            </button>
            <button type="button" className="danger-button">
              Delete Organization Data
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
  </section>
  );
};

export default Settings;
