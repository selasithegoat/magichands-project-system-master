import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ColumnsIcon,
  DownloadIcon,
  EditIcon,
  MoreVerticalIcon,
  PlusIcon,
  SortIcon,
  WarningIcon,
} from "../../components/icons/Icons";
import { fetchInventory, parseListResponse } from "../../utils/inventoryApi";
import NewInventoryRecordModal from "../../components/modals/NewInventoryRecordModal";
import "./InventoryRecords.css";

const InventoryRecords = () => {
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({
    page: 1,
    limit: 4,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");
  const [isNewRecordOpen, setIsNewRecordOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadRecords = async () => {
      try {
        const payload = await fetchInventory(
          `/api/inventory/inventory-records?limit=${meta.limit}`,
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
        setRecords(normalized);
        setMeta({
          page: parsed.page,
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
  }, [meta.limit]);

  const total = meta.total || records.length;
  const startIndex = total ? (meta.page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + records.length - 1, total) : 0;

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
            onClick={() => setIsNewRecordOpen(true)}
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
                    {record.price}
                  </div>
                  <div className="cell value" data-label="Value">
                    {record.value}
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
                    <button type="button" className="action-button">
                      <EditIcon />
                    </button>
                    <button type="button" className="action-button">
                      <MoreVerticalIcon />
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
      </div>

      <NewInventoryRecordModal
        isOpen={isNewRecordOpen}
        onClose={() => setIsNewRecordOpen(false)}
        onSave={() => setIsNewRecordOpen(false)}
      />
    </section>
  );
};

export default InventoryRecords;
