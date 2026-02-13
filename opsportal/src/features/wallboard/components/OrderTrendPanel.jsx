import { formatNumber } from "../../../utils/formatters";

const OrderTrendPanel = ({ trend = [] }) => {
  const max = Math.max(...trend.map((entry) => entry.count || 0), 1);
  const total = trend.reduce((sum, entry) => sum + (entry.count || 0), 0);

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Order Intake (12h)</h2>
        <div className="panel-stat">{formatNumber(total)} new orders</div>
      </div>

      {trend.length ? (
        <div className="trend-plot">
          {trend.map((entry, index) => (
            <div className="trend-point" key={`${entry.label}-${index}`}>
              <div className="trend-bar">
                <span style={{ height: `${Math.max((entry.count / max) * 100, 4)}%` }} />
              </div>
              <small>{index % 2 === 0 ? entry.label : ""}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">No trend data available.</p>
      )}
    </article>
  );
};

export default OrderTrendPanel;
