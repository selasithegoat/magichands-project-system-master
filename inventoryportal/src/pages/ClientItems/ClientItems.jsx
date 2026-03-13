import { useEffect, useState } from "react";
import {
  ClockIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import {
  fetchInventory,
  formatShortDate,
  parseListResponse,
} from "../../utils/inventoryApi";
import "./ClientItems.css";

const DEFAULT_LIMIT = 6;

const ClientItems = () => {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadItems = async () => {
      try {
        const payload = await fetchInventory(
          `/api/inventory/client-items?limit=${DEFAULT_LIMIT}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((item, index) => ({
          id: item._id || item.id || `${index}`,
          client: item.clientName || item.client || "",
          phone: item.clientPhone || item.phone || "",
          item: item.itemName || item.item || "",
          serial: item.serialNumber || item.serial || "",
          received: formatShortDate(
            item.receivedAt || item.received || item.dateReceived,
          ),
          warehouse: item.warehouse || "",
        }));

        if (!isMounted) return;
        setItems(normalized);
        setMeta({
          page: parsed.page,
          limit: parsed.limit || DEFAULT_LIMIT,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setItems([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load client items.");
      }
    };

    loadItems();
    return () => {
      isMounted = false;
    };
  }, []);

  const total = meta.total || items.length;
  const startIndex = total ? (meta.page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + items.length - 1, total) : 0;

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
                  {(item.client || "?").charAt(0)}
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
          <span>
            {error
              ? error
              : `Showing ${startIndex} to ${endIndex} of ${total} items`}
          </span>
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
