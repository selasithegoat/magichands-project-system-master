import { useMemo } from "react";
import {
  ClockIcon,
  DownloadIcon,
  EditIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import { clientItems } from "../../data/clientItems";
import "./ClientItems.css";

const ClientItems = () => {
  const items = useMemo(() => clientItems, []);

  return (
    <section className="client-items-page">
      <header className="client-items-header">
        <div>
          <div className="breadcrumb">Service Desk / Client Items</div>
          <h2>Client Item Tracking</h2>
          <p>
            Register, monitor, and manage items received from clients for
            service and repair work.
          </p>
        </div>
        <div className="client-items-actions">
          <button type="button" className="primary-button">
            <PlusIcon className="button-icon" />
            New Intake
          </button>
        </div>
      </header>

      <div className="filters-card">
        <div className="filters-row">
          <div className="input-shell">
            <SearchIcon className="search-icon" />
            <input
              type="text"
              placeholder="Search by client, serial number, or item..."
            />
          </div>
          <button type="button" className="ghost-button">
            <ClockIcon className="button-icon" />
            Date Range
          </button>
          <button type="button" className="ghost-button">
            <SortIcon className="button-icon" />
            More Filters
          </button>
          <button type="button" className="ghost-button">
            <DownloadIcon className="button-icon" />
            Export
          </button>
        </div>
        <div className="client-items-tabs">
          <button type="button" className="client-tab active">
            All Items
          </button>
          <button type="button" className="client-tab">
            Received (6)
          </button>
          <button type="button" className="client-tab">
            Inspection (4)
          </button>
          <button type="button" className="client-tab">
            In Progress (8)
          </button>
          <button type="button" className="client-tab">
            Awaiting Parts (3)
          </button>
          <button type="button" className="client-tab">
            Completed (3)
          </button>
        </div>
      </div>

      <div className="client-items-table mobile-card-table">
        <div className="table-header">
          <span>Client / Phone</span>
          <span>Item Details</span>
          <span>Received</span>
          <span>Warehouse</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {items.map((item) => (
            <div className="table-row" key={item.id}>
              <div className="cell client-cell full" data-label="Client">
                <div className="client-avatar">
                  {item.client.charAt(0)}
                </div>
                <div className="client-info">
                  <strong>{item.client}</strong>
                  <span className="muted">{item.phone}</span>
                </div>
              </div>
              <div className="cell item-cell full" data-label="Item Details">
                <strong>{item.item}</strong>
                <span className="muted">SN: {item.serial}</span>
              </div>
              <div className="cell muted" data-label="Received">
                {item.received}
              </div>
              <div className="cell" data-label="Warehouse">
                <span className="warehouse-pill">{item.warehouse}</span>
              </div>
              <div className="cell actions-cell" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Edit ${item.client}`}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Delete ${item.client}`}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="table-footer">
          <span>Showing 1 to 6 of 24 items</span>
          <div className="pagination">
            <button type="button" className="ghost-button">
              Previous
            </button>
            <button type="button" className="page active">
              1
            </button>
            <button type="button" className="page">
              2
            </button>
            <button type="button" className="page">
              3
            </button>
            <button type="button" className="ghost-button">
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClientItems;
