import OrderTrendPanel from "./OrderTrendPanel";
import { formatNumber } from "../../../utils/formatters";

const FlowDeck = ({ flow = {}, trend = [] }) => {
  const stageBottlenecks = flow?.stageBottlenecks || [];
  const stalledProjects = flow?.stalledProjects || [];
  const stuckProjects48h = Number(flow?.stuckProjects48h || 0);
  const maxCount = Math.max(...stageBottlenecks.map((item) => item.count || 0), 1);

  return (
    <div className="deck-grid deck-grid-flow">
      <article className="panel">
        <div className="panel-head">
          <h2>Stage Bottleneck Heatmap</h2>
          <div className="panel-stat">{formatNumber(stuckProjects48h)} stuck 48h+</div>
        </div>

        {stageBottlenecks.length ? (
          <div className="heatmap-list">
            {stageBottlenecks.map((item) => {
              const width = ((item.count || 0) / maxCount) * 100;
              return (
                <div className="heatmap-row" key={item.key}>
                  <div className="heatmap-meta">
                    <strong>{item.label}</strong>
                    <span>{formatNumber(item.count)} projects</span>
                  </div>
                  <div className="heatmap-track">
                    <span style={{ width: `${Math.max(width, 4)}%` }} />
                  </div>
                  <div className="heatmap-stats">
                    <span>Avg {item.averageAgeHours}h</span>
                    <span>Max {item.maxAgeHours}h</span>
                    <span>{item.stuck48hCount} 48h+</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">No flow bottleneck data available.</p>
        )}
      </article>

      <OrderTrendPanel trend={trend} />

      <article className="panel panel-span-2">
        <div className="panel-head">
          <h2>Stalled Projects (48h+)</h2>
          <div className="panel-stat">Needs manager unblocking</div>
        </div>

        {stalledProjects.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Project</th>
                  <th>Stage</th>
                  <th>Age</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {stalledProjects.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.orderId}</td>
                    <td>
                      <span className="row-title">{item.projectName}</span>
                      <small>{item.status}</small>
                    </td>
                    <td>{item.pipelineLabel}</td>
                    <td>{item.ageHours}h</td>
                    <td>{item.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No stalled projects over 48 hours.</p>
        )}
      </article>
    </div>
  );
};

export default FlowDeck;
