const NotificationItem = ({ icon, title, description, meta, badge }) => (
  <div className="activity-item">
    <div className="activity-icon">{icon}</div>
    <div className="activity-body">
      <div className="activity-title">
        <span>{title}</span>
        {badge ? <span className="activity-badge">{badge}</span> : null}
      </div>
      <p>{description}</p>
      {meta ? <span className="activity-meta">{meta}</span> : null}
    </div>
  </div>
);

export default NotificationItem;
