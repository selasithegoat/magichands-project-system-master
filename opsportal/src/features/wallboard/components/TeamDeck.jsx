import CapacityPanel from "./CapacityPanel";
import {
  formatNumber,
  formatRelativeHours,
} from "../../../utils/formatters";

const TeamDeck = ({ workload = [], team = {}, summary = {} }) => {
  const handoffGaps = team?.handoffGaps || [];

  return (
    <div className="deck-grid deck-grid-team">
      <CapacityPanel
        workload={workload}
        teamUtilizationPercent={summary?.teamUtilizationPercent || 0}
      />

      <article className="panel">
        <div className="panel-head">
          <h2>Assignment Coverage</h2>
        </div>

        <div className="stat-grid stat-grid-compact">
          <div className="stat-tile">
            <span>Unassigned</span>
            <strong>{formatNumber(team?.unassignedProjects || 0)}</strong>
          </div>
          <div className="stat-tile">
            <span>Handoff Gaps</span>
            <strong>{formatNumber(team?.handoffGapCount || 0)}</strong>
          </div>
          <div className="stat-tile">
            <span>Over Capacity</span>
            <strong>{formatNumber(team?.overloadedContributors || 0)}</strong>
          </div>
          <div className="stat-tile">
            <span>Active Contributors</span>
            <strong>{formatNumber(summary?.activeContributors || 0)}</strong>
          </div>
        </div>
      </article>

      <article className="panel panel-span-2">
        <div className="panel-head">
          <h2>Handoff Gaps</h2>
          <div className="panel-stat">Lead/assistant coverage gaps</div>
        </div>

        {handoffGaps.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Project</th>
                  <th>Gap Type</th>
                  <th>Lead</th>
                  <th>Assistant</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {handoffGaps.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{item.orderId}</td>
                    <td>
                      <span className="row-title">{item.projectName}</span>
                      <small>{item.status}</small>
                    </td>
                    <td>{item.gapType}</td>
                    <td>{item.lead}</td>
                    <td>{item.assistant}</td>
                    <td>
                      {Number.isFinite(item.hoursRemaining)
                        ? formatRelativeHours(item.hoursRemaining)
                        : "No deadline"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No assignment handoff gaps detected.</p>
        )}
      </article>
    </div>
  );
};

export default TeamDeck;
