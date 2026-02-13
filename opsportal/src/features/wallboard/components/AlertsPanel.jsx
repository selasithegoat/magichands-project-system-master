const AlertsPanel = ({ alerts = [] }) => (
  <article className="panel">
    <div className="panel-head">
      <h2>Operational Alerts</h2>
    </div>

    {alerts.length ? (
      <div className="alerts-list">
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert-item severity-${alert.severity}`}>
            <p className="alert-title">{alert.title}</p>
            <p className="alert-message">{alert.message}</p>
          </div>
        ))}
      </div>
    ) : (
      <p className="empty-state">No alerts available.</p>
    )}
  </article>
);

export default AlertsPanel;
