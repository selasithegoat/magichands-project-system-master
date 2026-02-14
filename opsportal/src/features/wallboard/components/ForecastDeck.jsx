import {
  formatDeadlineTimestamp,
  formatNumber,
  formatPercent,
  formatRelativeHours,
} from "../../../utils/formatters";

const ForecastDeck = ({ forecast = {} }) => {
  const sla = forecast?.sla || {};
  const predictedMisses = forecast?.predictedMisses || {};
  const atRiskProjects = predictedMisses?.atRiskProjects || [];
  const incomingLoadForecast = forecast?.incomingLoadForecast || [];
  const maxExpected = Math.max(
    ...incomingLoadForecast.map((entry) => entry.expectedOrders || 0),
    1,
  );

  return (
    <div className="deck-grid deck-grid-forecast">
      <article className="panel panel-span-2">
        <div className="panel-head">
          <h2>SLA + Predictive Outlook</h2>
        </div>

        <div className="stat-grid">
          <div className="stat-tile">
            <span>On-Time Today</span>
            <strong>{formatPercent(sla?.onTimeRateToday || 0)}</strong>
            <small>
              {formatNumber(sla?.onTimeCompletedToday || 0)} / {formatNumber(sla?.completedWithDueDateToday || 0)}
            </small>
          </div>
          <div className="stat-tile">
            <span>On-Time (7d)</span>
            <strong>{formatPercent(sla?.onTimeRate7d || 0)}</strong>
            <small>
              {formatNumber(sla?.onTimeCompleted7d || 0)} / {formatNumber(sla?.completedWithDueDate7d || 0)}
            </small>
          </div>
          <div className="stat-tile">
            <span>Predicted Misses (24h)</span>
            <strong>{formatNumber(predictedMisses?.next24h || 0)}</strong>
          </div>
          <div className="stat-tile">
            <span>Predicted Misses (72h)</span>
            <strong>{formatNumber(predictedMisses?.next72h || 0)}</strong>
          </div>
        </div>

        {incomingLoadForecast.length ? (
          <div className="forecast-inline">
            <div className="panel-head">
              <h2>Expected Incoming Load</h2>
              <div className="panel-stat">Next 6 hours</div>
            </div>
            <div className="forecast-bars">
              {incomingLoadForecast.map((entry) => (
                <div className="forecast-point" key={entry.label}>
                  <div className="forecast-bar">
                    <span
                      style={{
                        height: `${Math.max(((entry.expectedOrders || 0) / maxExpected) * 100, 4)}%`,
                      }}
                    />
                  </div>
                  <small>{entry.label}</small>
                  <strong>{formatNumber(entry.expectedOrders || 0)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="empty-state">No incoming load forecast available.</p>
        )}
      </article>

      <article className="panel panel-span-2">
        <div className="panel-head">
          <h2>Projects At Risk</h2>
          <div className="panel-stat">Likely misses in next 72h</div>
        </div>

        {atRiskProjects.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Owner</th>
                  <th>Risk Signals</th>
                </tr>
              </thead>
              <tbody>
                {atRiskProjects.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.orderId}</td>
                    <td>{item.projectName}</td>
                    <td>{item.status}</td>
                    <td>
                      {Number.isFinite(item.hoursRemaining)
                        ? formatRelativeHours(item.hoursRemaining)
                        : "No deadline"}
                      <small>
                        {item.dueAt
                          ? formatDeadlineTimestamp(item.dueAt, item.deliveryTime)
                          : "--"}
                      </small>
                    </td>
                    <td>{item.owner}</td>
                    <td>{(item.reasons || []).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No predicted misses in the next 72 hours.</p>
        )}
      </article>
    </div>
  );
};

export default ForecastDeck;
