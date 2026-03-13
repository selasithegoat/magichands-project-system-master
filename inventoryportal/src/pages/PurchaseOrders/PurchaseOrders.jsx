import { useMemo, useState } from "react";
import {
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SortIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import { purchaseOrders } from "../../data/purchaseOrders";
import "./PurchaseOrders.css";

const getStatusClass = (status) =>
  `status-${String(status || "").toLowerCase().replace(/\s+/g, "-")}`;

const PurchaseOrders = () => {
  const initialOrders = useMemo(() => purchaseOrders, []);
  const [orders, setOrders] = useState(initialOrders);

  const handleStatusChange = (orderId, nextStatus) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) =>
        order.id === orderId ? { ...order, status: nextStatus } : order,
      ),
    );
  };

  return (
    <section className="purchase-orders-page">
      <header className="purchase-orders-header">
        <div>
          <div className="breadcrumb">Purchasing / Orders</div>
          <h2>Purchase Orders</h2>
        </div>
        <div className="purchase-orders-actions">
          <button type="button" className="ghost-button">
            <SortIcon className="button-icon" />
            Filter
          </button>
          <button type="button" className="ghost-button">
            <DownloadIcon className="button-icon" />
            Export
          </button>
          <button type="button" className="primary-button">
            <PlusIcon className="button-icon" />
            Create PO
          </button>
        </div>
      </header>

      <div className="orders-tabs">
        <button type="button" className="tab active">
          All Orders <span className="tab-count">42</span>
        </button>
        <button type="button" className="tab">
          Pending
        </button>
        <button type="button" className="tab">
          Ordered
        </button>
        <button type="button" className="tab">
          Received
        </button>
        <button type="button" className="tab">
          Cancelled
        </button>
      </div>

      <div className="orders-table-card mobile-card-table">
        <div className="table-header">
          <span>PO Number</span>
          <span>Supplier</span>
          <span>Items Ordered</span>
          <span>Total Cost</span>
          <span>Status</span>
          <span>Created Date</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {orders.map((order) => (
            <div className="table-row" key={order.id}>
              <div className="cell mono" data-label="PO Number">
                {order.id}
              </div>
              <div className="cell supplier-cell full" data-label="Supplier">
                <div className={`supplier-avatar ${order.supplierTone}`}>
                  {order.supplierInitials}
                </div>
                <div>
                  <strong>{order.supplier}</strong>
                </div>
              </div>
              <div className="cell items-cell full" data-label="Items Ordered">
                <div className="item-stack" aria-hidden="true">
                  {order.items.map((item) => (
                    <span key={item.id} className="item-avatar">
                      <img src={item.image} alt={item.name} />
                    </span>
                  ))}
                </div>
                <span className="muted items-count">
                  {order.itemsCount} items
                </span>
              </div>
              <div className="cell total-cost" data-label="Total Cost">
                {order.total}
              </div>
              <div className="cell" data-label="Status">
                <select
                  className={`status-select ${getStatusClass(order.status)}`}
                  defaultValue={order.status}
                  aria-label={`Status for ${order.id}`}
                  onChange={(event) =>
                    handleStatusChange(order.id, event.target.value)
                  }
                >
                  <option>Pending</option>
                  <option>Ordered</option>
                  <option>Received</option>
                  <option>Cancelled</option>
                </select>
              </div>
              <div className="cell muted" data-label="Created Date">
                {order.created}
              </div>
              <div className="cell actions-cell" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Edit ${order.id}`}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Delete ${order.id}`}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="table-footer">
          <span>Showing 1 to 5 of 42 orders</span>
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
            <span className="page-ellipsis">…</span>
            <button type="button" className="page">
              9
            </button>
            <button type="button" className="ghost-button">
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="orders-summary">
        <article className="summary-card">
          <span className="summary-label">Total Spending (MTD)</span>
          <div className="summary-value">$142,500.20</div>
          <div className="summary-meta positive">+12.5%</div>
        </article>
        <article className="summary-card">
          <span className="summary-label">Pending Approvals</span>
          <div className="summary-value">08</div>
          <div className="summary-meta">Requires action</div>
        </article>
        <article className="summary-card">
          <span className="summary-label">In Transit</span>
          <div className="summary-value">14</div>
          <div className="summary-meta">Incoming POs</div>
        </article>
      </div>
    </section>
  );
};

export default PurchaseOrders;
