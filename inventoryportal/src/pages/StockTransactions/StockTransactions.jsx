import { useMemo } from "react";
import { DownloadIcon, SearchIcon } from "../../components/icons/Icons";
import { stockTransactions } from "../../data/stockTransactions";
import "./StockTransactions.css";

const getTypeClass = (type) =>
  `type-pill ${String(type).toLowerCase().replace(/\s+/g, "-")}`;

const getQtyClass = (qty) =>
  qty > 0 ? "qty positive" : qty < 0 ? "qty negative" : "qty";

const StockTransactions = () => {
  const rows = useMemo(() => stockTransactions, []);

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

      <div className="table-card">
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
            <div className="table-row" key={row.txid}>
              <div className="cell mono">{row.txid}</div>
              <div className="cell item">
                <div className="item-avatar">{row.item.charAt(0)}</div>
                <div>
                  <strong>{row.item}</strong>
                  <span className="muted">{row.sku}</span>
                </div>
              </div>
              <div className="cell">
                <span className={getTypeClass(row.type)}>{row.type}</span>
              </div>
              <div className="cell">
                <span className={getQtyClass(row.qty)}>
                  {row.qty > 0 ? `+${row.qty}` : row.qty}
                </span>
              </div>
              <div className="cell muted">{row.source}</div>
              <div className="cell muted">{row.destination}</div>
              <div className="cell muted">{row.date}</div>
              <div className="cell staff">{row.staff}</div>
              <div className="cell muted">{row.notes}</div>
            </div>
          ))}
        </div>
        <div className="table-footer">
          <span>Showing 1 to 5 of 1,284 transactions</span>
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
