import { useEffect, useState } from "react";
import { DownloadIcon, SearchIcon } from "../../components/icons/Icons";
import {
  fetchInventory,
  formatShortDate,
  parseListResponse,
} from "../../utils/inventoryApi";
import "./StockTransactions.css";

const getTypeClass = (type) =>
  `type-pill ${String(type).toLowerCase().replace(/\s+/g, "-")}`;

const getQtyClass = (qty) =>
  qty > 0 ? "qty positive" : qty < 0 ? "qty negative" : "qty";

const StockTransactions = () => {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({
    page: 1,
    limit: 5,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadTransactions = async () => {
      try {
        const payload = await fetchInventory(
          `/api/inventory/stock-transactions?limit=${meta.limit}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((row, index) => {
          const qtyValue = Number(row.qty);
          return {
            id: row._id || row.txid || `${index}`,
            txid: row.txid || "",
            item: row.item || "",
            sku: row.sku || "",
            type: row.type || "",
            qty: Number.isFinite(qtyValue) ? qtyValue : 0,
            source: row.source || "",
            destination: row.destination || "",
            date: formatShortDate(row.date || row.createdAt),
            staff: row.staff || "",
            notes: row.notes || "",
          };
        });

        if (!isMounted) return;
        setRows(normalized);
        setMeta({
          page: parsed.page,
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
  }, [meta.limit]);

  const total = meta.total || rows.length;
  const startIndex = total ? (meta.page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + rows.length - 1, total) : 0;

  return (
    <section className="stock-transactions">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Inventory / Stock Transactions</div>
          <h2>Stock Transactions</h2>
        </div>
        <button type="button" className="primary-button">
          + New Transaction
        </button>
      </header>

      <div className="filters-card">
        <div className="filters-row">
          <div className="input-shell">
            <SearchIcon className="search-icon" />
            <input
              type="text"
              placeholder="Search transactions, items, or staff"
            />
          </div>
          <select className="filter-select" aria-label="Filter type">
            <option>All Types</option>
            <option>Stock In</option>
            <option>Stock Out</option>
            <option>Transfer</option>
            <option>Adjustment</option>
          </select>
          <select className="filter-select" aria-label="Filter date range">
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>Last 90 Days</option>
          </select>
          <button type="button" className="icon-button" aria-label="Export">
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
        </div>
        <div className="table-body">
          {rows.map((row) => (
            <div className="table-row" key={row.id}>
              <div className="cell mono txid" data-label="Txid">
                {row.txid}
              </div>
              <div className="cell item full" data-label="Item">
                <div className="item-avatar">{row.item.charAt(0)}</div>
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
                {row.source}
              </div>
              <div className="cell muted" data-label="Destination">
                {row.destination}
              </div>
              <div className="cell muted" data-label="Date">
                {row.date}
              </div>
              <div className="cell staff" data-label="Staff">
                {row.staff}
              </div>
              <div className="cell muted notes full" data-label="Notes">
                {row.notes}
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
            <button type="button" className="ghost-button">Previous</button>
            <button type="button" className="page active">1</button>
            <button type="button" className="page">2</button>
            <button type="button" className="page">3</button>
            <button type="button" className="ghost-button">Next</button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StockTransactions;
