import { useMemo } from "react";
import {
  BuildingIcon,
  ChevronDownIcon,
  ClockIcon,
  DownloadIcon,
  EditIcon,
  FileTextIcon,
  MoreVerticalIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "../../components/icons/Icons";
import { suppliers } from "../../data/suppliers";
import "./Suppliers.css";

const getStatusClass = (status) =>
  `po-pill ${String(status || "").toLowerCase()}`;

const Suppliers = () => {
  const rows = useMemo(() => suppliers, []);

  return (
    <section className="suppliers-page">
      <header className="suppliers-header">
        <div>
          <div className="breadcrumb">Operations / Suppliers</div>
          <h2>Suppliers</h2>
        </div>
        <div className="suppliers-actions">
          <button type="button" className="ghost-button">
            <DownloadIcon className="button-icon" />
            Export
          </button>
          <button type="button" className="primary-button">
            <PlusIcon className="button-icon" />
            Add Supplier
          </button>
        </div>
      </header>

      <div className="filters-card">
        <div className="filters-row">
          <div className="filter-pill">
            <span>Category:</span>
            <select aria-label="Filter by category">
              <option>All Products</option>
              <option>Electronics</option>
              <option>Logistics</option>
              <option>Packaging</option>
            </select>
            <ChevronDownIcon className="chevron" />
          </div>
          <div className="filter-pill">
            <span>Status:</span>
            <select aria-label="Filter by status">
              <option>Active</option>
              <option>Paused</option>
              <option>Onboarding</option>
            </select>
            <ChevronDownIcon className="chevron" />
          </div>
          <div className="filter-pill">
            <span>Region:</span>
            <select aria-label="Filter by region">
              <option>Global</option>
              <option>North America</option>
              <option>Europe</option>
              <option>Asia Pacific</option>
            </select>
            <ChevronDownIcon className="chevron" />
          </div>
          <button type="button" className="clear-filters">
            Clear all filters
          </button>
        </div>
      </div>

      <div className="suppliers-table mobile-card-table">
        <div className="table-header">
          <span>Supplier Name</span>
          <span>Contact Person</span>
          <span>Contact Info</span>
          <span>Products Supplied</span>
          <span>Open POs</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {rows.map((supplier) => (
            <div className="table-row" key={supplier.id}>
              <div
                className="supplier-cell cell supplier-name full"
                data-label="Supplier"
              >
                <div className={`supplier-icon ${supplier.tone}`}>
                  <BuildingIcon />
                </div>
                <div className="supplier-info">
                  <strong>{supplier.name}</strong>
                  <span className="muted">{supplier.code}</span>
                </div>
              </div>
              <div className="supplier-cell cell" data-label="Contact">
                <strong>{supplier.contactPerson}</strong>
                <span className="muted">{supplier.role}</span>
              </div>
              <div className="supplier-cell cell" data-label="Contact Info">
                <span>{supplier.phone}</span>
                <span className="muted">{supplier.email}</span>
              </div>
              <div
                className="supplier-cell cell supplier-tags full"
                data-label="Products"
              >
                {supplier.products.map((product) => (
                  <span
                    key={product.label}
                    className={`tag ${product.tone}`}
                  >
                    {product.label}
                  </span>
                ))}
              </div>
              <div className="supplier-cell cell" data-label="Open POs">
                <span className={getStatusClass(supplier.openPO.status)}>
                  {supplier.openPO.label}
                </span>
              </div>
              <div
                className="supplier-cell cell supplier-actions full"
                data-label="Actions"
              >
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Edit ${supplier.name}`}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label={`More actions for ${supplier.name}`}
                >
                  <MoreVerticalIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="table-footer">
          <span>Showing 1-4 of 42 suppliers</span>
          <div className="pagination">
            <button type="button" className="ghost-button">Previous</button>
            <button type="button" className="page active">1</button>
            <button type="button" className="page">2</button>
            <button type="button" className="page">3</button>
            <button type="button" className="ghost-button">Next</button>
          </div>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-header">
            <span>Active Contracts</span>
            <span className="summary-icon">
              <FileTextIcon />
            </span>
          </div>
          <div className="summary-value">38</div>
          <div className="summary-meta positive">+2 this month</div>
        </div>
        <div className="summary-card">
          <div className="summary-header">
            <span>Average Delivery Time</span>
            <span className="summary-icon info">
              <ClockIcon />
            </span>
          </div>
          <div className="summary-value">4.2 Days</div>
          <div className="summary-meta positive">-0.5 days avg</div>
        </div>
        <div className="summary-card">
          <div className="summary-header">
            <span>Supply Risk Level</span>
            <span className="summary-icon success">
              <ShieldCheckIcon />
            </span>
          </div>
          <div className="summary-value">Low</div>
          <div className="summary-meta">Stable inventory</div>
        </div>
      </div>
    </section>
  );
};

export default Suppliers;
