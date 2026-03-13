import "./Settings.css";

const Settings = () => (
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
              <input type="text" defaultValue="MagicHands Logistics" />
            </label>
            <label className="settings-field">
              <span>Primary Contact Email</span>
              <input type="email" defaultValue="ops@magichands.io" />
            </label>
            <label className="settings-field">
              <span>Currency</span>
              <select defaultValue="GHS">
                <option value="GHS">GHS (Default)</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Timezone</span>
              <select defaultValue="Africa/Accra">
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
              <select defaultValue="DD MMM, YYYY">
                <option>DD MMM, YYYY</option>
                <option>MM/DD/YYYY</option>
                <option>YYYY-MM-DD</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Number Format</span>
              <select defaultValue="1,234.56">
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
                <input type="checkbox" defaultChecked />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-row">
              <div>
                <strong>Purchase Order Updates</strong>
                <p>Send updates when POs are approved or received.</p>
              </div>
              <label className="switch">
                <input type="checkbox" defaultChecked />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-row">
              <div>
                <strong>Weekly Summary</strong>
                <p>Deliver a digest every Monday morning.</p>
              </div>
              <label className="switch">
                <input type="checkbox" />
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
              <select defaultValue="Central Warehouse">
                <option>Central Warehouse</option>
                <option>Main Hub</option>
                <option>East Branch</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Low Stock Threshold</span>
              <input type="number" defaultValue="18" />
            </label>
            <label className="settings-field">
              <span>Unit of Measure</span>
              <select defaultValue="Pieces">
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
                <input type="checkbox" />
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
              <select defaultValue="System">
                <option>System</option>
                <option>Light</option>
                <option>Dark</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Table Density</span>
              <select defaultValue="Comfortable">
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
              <select defaultValue="CSV">
                <option>CSV</option>
                <option>PDF</option>
                <option>XLSX</option>
              </select>
            </label>
            <label className="settings-field">
              <span>POS/ERP Connection</span>
              <input type="text" defaultValue="Not connected" />
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
              <select defaultValue="24 months">
                <option>12 months</option>
                <option>24 months</option>
                <option>36 months</option>
                <option>Indefinite</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Audit Log Access</span>
              <select defaultValue="Admins only">
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
            Changes will apply to all users in your organization.
          </div>
          <div className="footer-actions">
            <button type="button" className="ghost-button">
              Cancel
            </button>
            <button type="button" className="primary-button">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default Settings;
