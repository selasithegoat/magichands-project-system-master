import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AlertBanner from "../../components/ui/AlertBanner";
import NotificationItem from "../../components/ui/NotificationItem";
import Breadcrumb from "../../components/ui/Breadcrumb";
import {
  CheckIcon,
  ChevronDownIcon,
  TruckIcon,
  UserIcon,
  WarningIcon,
} from "../../components/icons/Icons";
import {
  formatCurrencyPair,
  formatCurrencyValue,
  useInventoryCurrency,
} from "../../utils/currency";
import { fetchInventory, parseListResponse } from "../../utils/inventoryApi";
import "./Dashboard.css";

const buildRelativeTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);
  if (diffSeconds < 60) return "Just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const parseNumericValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseCurrencyNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const numeric = Number.parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
};

const sumColorQty = (colors = []) => {
  const values = colors
    .map((color) => parseNumericValue(color?.qtyValue))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
};

const sumVariantQty = (variants = []) => {
  const values = variants
    .map((variant) => {
      const direct = parseNumericValue(variant?.qtyValue);
      if (direct !== null) return direct;
      return sumColorQty(variant?.colors);
    })
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
};

const computeRecordQty = (record) => {
  const direct = parseNumericValue(record?.qtyValue);
  if (direct !== null) return direct;

  const brandGroups = Array.isArray(record?.brandGroups)
    ? record.brandGroups
    : [];
  if (brandGroups.length) {
    const grouped = brandGroups
      .map((group) => sumVariantQty(group?.variants || []))
      .filter((value) => Number.isFinite(value));
    if (grouped.length) {
      return grouped.reduce((sum, value) => sum + value, 0);
    }
  }

  return sumVariantQty(record?.variants || []);
};

const computeRecordPercent = (record) => {
  const qtyValue = computeRecordQty(record);
  const maxQty = parseNumericValue(record?.maxQty);
  if (Number.isFinite(qtyValue) && Number.isFinite(maxQty) && maxQty > 0) {
    return (qtyValue / maxQty) * 100;
  }
  const meta = parseNumericValue(record?.qtyMeta);
  return Number.isFinite(meta) ? meta : null;
};

const computeRecordValue = (record) => {
  const directValue = parseNumericValue(record?.valueValue);
  if (directValue !== null) return directValue;

  const qtyValue = computeRecordQty(record);
  const brandGroups = Array.isArray(record?.brandGroups)
    ? record.brandGroups
    : [];

  if (brandGroups.length) {
    let totalValue = 0;
    let hasValue = false;

    brandGroups.forEach((group) => {
      const priceValue =
        parseNumericValue(group?.priceValue) ??
        parseCurrencyNumber(group?.price);
      const groupQty = sumVariantQty(group?.variants || []);
      const resolvedQty =
        groupQty !== null
          ? groupQty
          : brandGroups.length === 1
            ? qtyValue
            : null;

      if (priceValue !== null && resolvedQty !== null) {
        totalValue += priceValue * resolvedQty;
        hasValue = true;
      }
    });

    if (hasValue) return totalValue;
  }

  const priceValue =
    parseNumericValue(record?.priceValue) ??
    parseCurrencyNumber(record?.price);
  if (priceValue !== null && qtyValue !== null) {
    return priceValue * qtyValue;
  }

  return null;
};

const Dashboard = () => {
  const { currency, rate } = useInventoryCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({
    totalItems: 0,
    totalCategories: 0,
    lowStockCount: 0,
    inventoryValue: 0,
    lowStockThreshold: 0,
    unitLabel: "Units",
    deltas: {
      items: null,
      categories: null,
    },
  });
  const [movement, setMovement] = useState({
    labels: [],
    values: [],
    linePath: "",
    fillPath: "",
  });
  const [stockFlow, setStockFlow] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);

  const fetchAllPages = useCallback(async (path, params = {}) => {
    let page = 1;
    let totalPages = 1;
    const results = [];

    while (page <= totalPages) {
      const search = new URLSearchParams({
        page: String(page),
        limit: "100",
        ...params,
      });
      const payload = await fetchInventory(`${path}?${search.toString()}`);
      const parsed = parseListResponse(payload);
      results.push(...parsed.data);
      totalPages = parsed.totalPages || 1;
      page += 1;
    }

    return results;
  }, []);

  const isMountedRef = useRef(true);

  const loadDashboard = useCallback(async () => {
    try {
      if (!isMountedRef.current) return;
      setLoading(true);
      const [settings, categoriesPayload, notifications] = await Promise.all([
        fetchInventory("/api/inventory/settings"),
        fetchInventory("/api/inventory/categories?page=1&limit=100"),
        fetchInventory("/api/notifications?source=inventory"),
      ]);

      const categoryParsed = parseListResponse(categoriesPayload);
      const categories = categoryParsed.data || [];
      const categoryCount = categoryParsed.total || categories.length;

      const [records, transactions] = await Promise.all([
        fetchAllPages("/api/inventory/inventory-records"),
        fetchAllPages("/api/inventory/stock-transactions", { range: "30" }),
      ]);

      const thresholdRaw = Number(settings?.lowStockThreshold);
      const threshold = Number.isFinite(thresholdRaw)
        ? Math.min(100, Math.max(0, thresholdRaw))
        : 0;
      const unitLabel = settings?.unitOfMeasure || "Units";

      const totalItems = records.length;
      const lowStockCount = records.filter((record) => {
        const percent = computeRecordPercent(record);
        return Number.isFinite(percent) && percent <= threshold;
      }).length;
      const inventoryValue = records.reduce((sum, record) => {
        const value = computeRecordValue(record);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);

      const now = new Date();
      const msInDay = 86400000;
      const last7Start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 6,
      );
      const prev7Start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 13,
      );

      const newItemsLast7 = records.filter((record) => {
        if (!record.createdAt) return false;
        const created = new Date(record.createdAt);
        return created >= last7Start;
      }).length;
      const newItemsPrev7 = records.filter((record) => {
        if (!record.createdAt) return false;
        const created = new Date(record.createdAt);
        return created >= prev7Start && created < last7Start;
      }).length;
      const newCategoriesLast7 = categories.filter((category) => {
        if (!category.createdAt) return false;
        const created = new Date(category.createdAt);
        return created >= last7Start;
      }).length;
      const newCategoriesPrev7 = categories.filter((category) => {
        if (!category.createdAt) return false;
        const created = new Date(category.createdAt);
        return created >= prev7Start && created < last7Start;
      }).length;

      const buildDelta = (current, previous) => {
        if (!Number.isFinite(previous) || previous === 0) return null;
        const change = ((current - previous) / previous) * 100;
        return {
          value: `${Math.abs(change).toFixed(1)}%`,
          direction: change >= 0 ? "positive" : "negative",
        };
      };

      const deltas = {
        items: buildDelta(newItemsLast7, newItemsPrev7),
        categories: buildDelta(newCategoriesLast7, newCategoriesPrev7),
      };

      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const startDate = new Date(todayStart);
      startDate.setDate(startDate.getDate() - 6);

      const labels = Array.from({ length: 7 }).map((_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        return date.toLocaleDateString("en-US", { weekday: "short" });
      });
      const values = Array.from({ length: 7 }).map(() => 0);

      const weekBuckets = [
        { label: "Week 1", inQty: 0, outQty: 0 },
        { label: "Week 2", inQty: 0, outQty: 0 },
        { label: "Week 3", inQty: 0, outQty: 0 },
      ];

      transactions.forEach((tx) => {
        const dateValue = tx.date || tx.createdAt;
        if (!dateValue) return;
        const txDate = new Date(dateValue);
        if (Number.isNaN(txDate.getTime())) return;
        const txStart = new Date(txDate);
        txStart.setHours(0, 0, 0, 0);

        const dayDiff = Math.floor((txStart - startDate) / msInDay);

        const qty = Math.abs(Number(tx.qty)) || 0;
        if (dayDiff >= 0 && dayDiff < 7) {
          values[dayDiff] += qty;
        }

        const weekDiff = Math.floor((todayStart - txStart) / msInDay);
        if (weekDiff >= 0 && weekDiff < 21) {
          const weekIndex = Math.floor(weekDiff / 7);
          const bucket = weekBuckets[weekIndex];
          if (!bucket) return;
          const type = String(tx.type || "").toLowerCase();
          if (type.includes("in")) {
            bucket.inQty += qty;
          } else if (type.includes("out")) {
            bucket.outQty += qty;
          }
        }
      });

      const maxValue = Math.max(...values, 1);
      const chartWidth = 600;
      const chartHeight = 180;
      const chartPadding = 18;
      const usableHeight = chartHeight - chartPadding * 2;
      const step = chartWidth / (values.length - 1 || 1);

      const points = values.map((value, index) => {
        const x = index * step;
        const ratio = value / maxValue;
        const y = chartHeight - chartPadding - ratio * usableHeight;
        return { x: Math.round(x), y: Math.round(y) };
      });

      const linePath = points
        .map((point, index) =>
          `${index === 0 ? "M" : "L"}${point.x} ${point.y}`,
        )
        .join(" ");
      const fillPath = `M0 ${chartHeight} ${linePath} L${chartWidth} ${chartHeight} Z`;

      const stockFlowRows = weekBuckets.map((bucket) => {
        const total = bucket.inQty + bucket.outQty;
        const inPct = total ? Math.round((bucket.inQty / total) * 100) : 0;
        const outPct = total ? Math.round((bucket.outQty / total) * 100) : 0;
        return {
          key: bucket.label,
          label: bucket.label,
          inPct,
          outPct,
          inQty: bucket.inQty,
          outQty: bucket.outQty,
        };
      });

      const feed = Array.isArray(notifications)
        ? notifications.slice(0, 5).map((item) => {
            const title = item.title || "Inventory update";
            const message = item.message || "";
            const type = String(item.type || "").toLowerCase();
            const Icon =
              message.toLowerCase().includes("low stock")
                ? WarningIcon
                : message.toLowerCase().includes("purchase order") ||
                    message.toLowerCase().includes("shipment")
                  ? TruckIcon
                  : type === "update"
                    ? CheckIcon
                    : UserIcon;
            const badge = item.type ? item.type.toUpperCase() : "";
            return {
              icon: <Icon />,
              title,
              description: message,
              meta: buildRelativeTime(item.createdAt),
              badge,
            };
          })
        : [];

      if (!isMountedRef.current) return;

      setSummary({
        totalItems,
        totalCategories: categoryCount,
        lowStockCount,
        inventoryValue,
        lowStockThreshold: threshold,
        unitLabel,
        deltas,
      });
      setMovement({
        labels,
        values,
        linePath,
        fillPath,
      });
      setStockFlow(stockFlowRows);
      setActivityFeed(feed);
      setError("");
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.message || "Unable to load dashboard data.");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [fetchAllPages]);

  useEffect(() => {
    isMountedRef.current = true;
    loadDashboard();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleRefresh = () => {
      loadDashboard();
    };
    window.addEventListener("mh:data-changed", handleRefresh);
    window.addEventListener("mh:notifications-changed", handleRefresh);
    return () => {
      window.removeEventListener("mh:data-changed", handleRefresh);
      window.removeEventListener("mh:notifications-changed", handleRefresh);
    };
  }, [loadDashboard]);

  const totalItemsDisplay = loading ? "--" : summary.totalItems.toLocaleString();
  const totalCategoriesDisplay = loading
    ? "--"
    : summary.totalCategories.toLocaleString();
  const lowStockDisplay = loading ? "--" : summary.lowStockCount.toLocaleString();
  const hasInventoryValue =
    !loading && Number.isFinite(summary.inventoryValue);
  const inventoryValueDisplay = loading
    ? "--"
    : formatCurrencyValue(
        summary.inventoryValue.toFixed(2),
        currency,
        rate,
      );
  const inventoryValueAlt = hasInventoryValue
    ? formatCurrencyPair(
        summary.inventoryValue.toFixed(2),
        currency,
        rate,
      ).alternateValue
    : undefined;

  const alertDescription = loading
    ? "Loading low stock summary..."
    : summary.lowStockCount
      ? `${summary.lowStockCount} items are at or below ${summary.lowStockThreshold}% of capacity.`
      : "All stock levels are currently healthy.";

  const alertVariant = summary.lowStockCount ? "warning" : "success";

  const handleReviewLowStock = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("inventory:navigate", {
        detail: { page: "inventory-records" },
      }),
    );
  };

  const activityContent = useMemo(() => {
    if (loading) {
      return (
        <div className="activity-meta">Loading recent activity...</div>
      );
    }
    if (!activityFeed.length) {
      return <div className="activity-meta">No recent activity yet.</div>;
    }
    return activityFeed.map((item) => (
      <NotificationItem key={item.title + item.meta} {...item} />
    ));
  }, [activityFeed, loading]);

  return (
    <>
    <div className="page-header">
      <div>
        <Breadcrumb pageKey="dashboard" />
        <h2>Inventory Dashboard</h2>
        <p>Real-time snapshots for stock health, usage, and purchasing activity.</p>
      </div>
      <AlertBanner
        variant={alertVariant}
        title="Low stock summary"
        description={alertDescription}
        actions={
          summary.lowStockCount ? (
            <button type="button" className="ghost-button" onClick={handleReviewLowStock}>
              Review now
            </button>
          ) : null
        }
      />
    </div>

    <section className="stat-grid">
      <div className="stat-card">
        <div className="stat-header">
          <span>Total Items</span>
          {summary.deltas.items ? (
            <span className={`delta ${summary.deltas.items.direction}`}>
              {summary.deltas.items.value}
            </span>
          ) : (
            <span className="delta">--</span>
          )}
        </div>
        <div className="stat-value">{totalItemsDisplay}</div>
        <div className="stat-chart">
          <div className="bar bar-1" />
          <div className="bar faint bar-2" />
          <div className="bar bar-3" />
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-header">
          <span>Inventory Categories</span>
          {summary.deltas.categories ? (
            <span className={`delta ${summary.deltas.categories.direction}`}>
              {summary.deltas.categories.value}
            </span>
          ) : (
            <span className="delta">--</span>
          )}
        </div>
        <div className="stat-value">{totalCategoriesDisplay}</div>
        <div className="stat-chart bars">
          <div className="bar-stack bar-stack-1" />
          <div className="bar-stack bar-stack-2" />
          <div className="bar-stack bar-stack-3" />
          <div className="bar-stack bar-stack-4" />
          <div className="bar-stack bar-stack-5" />
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-header">
          <span>Low Stock Alerts</span>
          <span className="delta">--</span>
        </div>
        <div className="stat-value">{lowStockDisplay}</div>
        <div className="stat-chart">
          <div className="line-track" />
          <div
            className="line-progress"
            style={{
              width: summary.totalItems
                ? `${Math.min(
                    100,
                    Math.round((summary.lowStockCount / summary.totalItems) * 100),
                  )}%`
                : "0%",
            }}
          />
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-header">
          <span>Inventory Value</span>
          <span className="delta">--</span>
        </div>
        <div
          className="stat-value tooltip-anchor"
          data-tooltip={inventoryValueAlt || undefined}
        >
          {inventoryValueDisplay}
        </div>
        <div className="stat-chart value">
          <div className="value-tag">Growth trend</div>
        </div>
      </div>
    </section>

    <section className="panel-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Inventory Movement</h3>
            <p>Unit movements over the last 7 days</p>
          </div>
          <button type="button" className="ghost-button">
            Last 7 Days
            <ChevronDownIcon className="chevron" />
          </button>
        </div>
        <div className="panel-body">
          <div className="line-chart">
            <div className="line-chart-grid" />
            <svg viewBox="0 0 600 180" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={movement.fillPath}
                fill="url(#lineFill)"
              />
              <path
                d={movement.linePath}
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="3"
              />
            </svg>
          </div>
          <div className="chart-labels">
            {(movement.labels.length
              ? movement.labels
              : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            ).map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="panel activity">
        <div className="panel-header">
          <div>
            <h3>Activity Feed</h3>
            <p>Latest inventory changes</p>
          </div>
          <button type="button" className="ghost-button">
            View all
          </button>
        </div>
        <div className="panel-body activity-list">
          {activityContent}
        </div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>Stock In vs Stock Out</h3>
          <p>Weekly comparison of stock flow</p>
        </div>
        <div className="legend">
          <span className="legend-dot stock-in" />
          Stock In
          <span className="legend-dot stock-out" />
          Stock Out
        </div>
      </div>
      <div className="panel-body">
        {stockFlow.length ? (
          stockFlow.map((row) => (
            <div key={row.key} className="stock-row">
              <div>
                <strong>{row.label}</strong>
                <span>
                  {row.inPct}% vs {row.outPct}%
                </span>
              </div>
              <div className="stock-bar">
                <div
                  className="stock-fill in"
                  style={{ width: `${row.inPct}%` }}
                />
                <div
                  className="stock-fill out"
                  style={{ width: `${row.outPct}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="activity-meta">No stock flow data yet.</div>
        )}
      </div>
    </section>
  </>
  );
};

export default Dashboard;
