import { formatRelativeHours, formatTimestamp } from "../../../utils/formatters";

const getDeadlineClass = (hoursRemaining) => {
  if (!Number.isFinite(hoursRemaining)) return "deadline-neutral";
  if (hoursRemaining < 0) return "deadline-critical";
  if (hoursRemaining <= 24) return "deadline-high";
  if (hoursRemaining <= 72) return "deadline-medium";
  return "deadline-neutral";
};

const DeadlinesPanel = ({ deadlines = [] }) => (
  <article className="panel panel-deadlines">
    <div className="panel-head">
      <h2>Approaching Deadlines</h2>
    </div>

    {deadlines.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Project</th>
              <th>Status</th>
              <th>Deadline</th>
              <th>Lead</th>
            </tr>
          </thead>
          <tbody>
            {deadlines.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.orderId}</td>
                <td>
                  <span className="row-title">{item.projectName}</span>
                  <small>{item.client}</small>
                </td>
                <td>{item.status}</td>
                <td>
                  <span className={`deadline-chip ${getDeadlineClass(item.hoursRemaining)}`}>
                    {formatRelativeHours(item.hoursRemaining)}
                  </span>
                  <small>{formatTimestamp(item.dueAt)}</small>
                </td>
                <td>{item.lead}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="empty-state">No delivery deadlines recorded.</p>
    )}
  </article>
);

export default DeadlinesPanel;
