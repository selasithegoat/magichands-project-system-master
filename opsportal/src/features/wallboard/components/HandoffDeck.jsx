import {
  formatDeadlineTimestamp,
  formatRelativeHours,
  formatTimestamp,
} from "../../../utils/formatters";

const HandoffDeck = ({ handoff = {} }) => {
  const majorStatusChanges = handoff?.majorStatusChanges30m || [];
  const actionRequired = handoff?.actionRequired || [];

  return (
    <div className="deck-grid deck-grid-handoff">
      <article className="panel panel-span-2">
        <div className="panel-head">
          <h2>Status Changes (Last 30m)</h2>
        </div>

        {majorStatusChanges.length ? (
          <div className="action-list">
            {majorStatusChanges.map((item) => (
              <div key={item.id} className="action-item">
                <p className="action-title">
                  {item.orderId || item.projectName || "Project"}
                </p>
                <p className="action-meta">
                  {item.fromStatus} {"->"} {item.toStatus}
                </p>
                <p className="action-meta">
                  {item.userName} | {formatTimestamp(item.timestamp)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No major status changes in the last 30 minutes.</p>
        )}
      </article>

      <article className="panel panel-span-2">
        <div className="panel-head">
          <h2>Owner Actions Before Next Shift</h2>
          <div className="panel-stat">Critical / High / Medium</div>
        </div>

        {actionRequired.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Project</th>
                  <th>Severity</th>
                  <th>Reason</th>
                  <th>Owner</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {actionRequired.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.orderId}</td>
                    <td>
                      <span className="row-title">{item.projectName}</span>
                      <small>{item.status}</small>
                    </td>
                    <td>
                      <span className={`load-pill load-${item.severity === "critical" ? "overloaded" : item.severity === "high" ? "high" : "balanced"}`}>
                        {item.severity}
                      </span>
                    </td>
                    <td>{item.reason}</td>
                    <td>{item.owner}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No immediate owner actions required.</p>
        )}
      </article>
    </div>
  );
};

export default HandoffDeck;
