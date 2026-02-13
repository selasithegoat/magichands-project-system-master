import { formatClock } from "../../../utils/formatters";

const EventTicker = ({ events = [] }) => {
  if (!events.length) {
    return (
      <section className="ticker-shell">
        <div className="ticker-content static">No recent events captured.</div>
      </section>
    );
  }

  const labels = events.slice(0, 14).map((event) => {
    const projectLabel = event.orderId || event.projectName || "System";
    return `${formatClock(event.timestamp)} | ${event.title} | ${projectLabel} | ${event.userName}`;
  });

  const scrollingItems = [...labels, ...labels];

  return (
    <section className="ticker-shell">
      <div className="ticker-content">
        <div className="ticker-track">
          {scrollingItems.map((text, index) => (
            <span key={`${text}-${index}`} className="ticker-item">
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default EventTicker;
