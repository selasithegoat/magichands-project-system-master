import { useEffect, useState } from "react";
import {
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SortIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import {
  fetchInventory,
  formatShortDate,
  parseListResponse,
} from "../../utils/inventoryApi";
import "./PurchaseOrders.css";

const getStatusClass = (status) =>
  `status-${String(status || "").toLowerCase().replace(/\s+/g, "-")}`;

const DEFAULT_LIMIT = 5;

const buildInitials = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const PurchaseOrders = () => {
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadOrders = async () => {
      try {
        const payload = await fetchInventory(
          `/api/inventory/purchase-orders?limit=${DEFAULT_LIMIT}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((order, index) => {
          const supplier = order.supplierName || order.supplier || "";
          const items = Array.isArray(order.items) ? order.items : [];
          return {
            id: order._id || order.id || `${index}`,
            poNumber: order.poNumber || order.orderNo || order.id || "",
            supplier,
            supplierInitials:
              order.supplierInitials || buildInitials(supplier),
            supplierTone: order.supplierTone || "blue",
            items: items.map((item, itemIndex) => ({
              id: item._id || item.id || `${order._id || index}-${itemIndex}`,
              name: item.name || "",
              image: item.image || "",
            })),
            itemsCount: Number.isFinite(order.itemsCount)
              ? order.itemsCount
              : items.length,
            total: order.total || "",
            status: order.status || order.requestStatus || "Pending",
            created: formatShortDate(
              order.dateRequestPlaced || order.createdAt || order.created,
            ),
          };
        });

        if (!isMounted) return;
        setOrders(normalized);
        setMeta({
          page: parsed.page,
          limit: parsed.limit || DEFAULT_LIMIT,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setOrders([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load purchase orders.");
      }
    };

    loadOrders();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleStatusChange = async (orderId, nextStatus) => {
    const previousStatus = orders.find((order) => order.id === orderId)?.status;
    setOrders((prevOrders) =>
      prevOrders.map((order) =>
        order.id === orderId ? { ...order, status: nextStatus } : order,
      ),
    );

    try {
      await fetchInventory(`/api/inventory/purchase-orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch (err) {
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: previousStatus } : order,
        ),
      );
      setError(err?.message || "Unable to update status.");
    }
  };

  const total = meta.total || orders.length;
  const startIndex = total ? (meta.page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + orders.length - 1, total) : 0;

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
          All Orders <span className="tab-count">{total || 0}</span>
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
                {order.poNumber}
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
                  value={order.status}
                  aria-label={`Status for ${order.poNumber}`}
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
          <span>
            {error
              ? error
              : `Showing ${startIndex} to ${endIndex} of ${total} orders`}
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
            <span className="page-ellipsis">...</span>
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
