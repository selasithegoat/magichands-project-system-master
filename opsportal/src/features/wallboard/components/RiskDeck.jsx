import AlertsPanel from "./AlertsPanel";
import DeadlinesPanel from "./DeadlinesPanel";
import {
  formatDeadlineTimestamp,
  formatRelativeHours,
} from "../../../utils/formatters";

const RiskDeck = ({ alerts = [], deadlines = [], handoff = {} }) => {
  const escalations = (handoff?.actionRequired || [])
    .filter((item) => item?.severity === "critical" || item?.severity === "high")
    .slice(0, 10);

  return (
    <div className="deck-grid deck-grid-risk">
      <div className="panel-stack">
        <AlertsPanel alerts={alerts} />
      </div>

      <DeadlinesPanel deadlines={deadlines} />

      <article className="panel">
        <div className="panel-head">
          <h2>Escalation Queue</h2>
          <div className="panel-stat">High + Critical only</div>
        </div>

        {escalations.length ? (
          <div className="action-list">
            {escalations.map((item) => (
              <div key={item.id} className={`action-item severity-${item.severity}`}>
                <p className="action-title">
                  {item.orderId} - {item.projectName}
                </p>
                <p className="action-meta">
                  {item.reason} | {item.owner || "Unassigned"}
                </p>
                <p className="action-meta">
                  {Number.isFinite(item.hoursRemaining)
                    ? formatRelativeHours(item.hoursRemaining)
                    : "No deadline"}
                  {item.dueAt
                    ? ` (${formatDeadlineTimestamp(item.dueAt, item.deliveryTime)})`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No high-priority escalations right now.</p>
        )}
      </article>
    </div>
  );
};

export default RiskDeck;
