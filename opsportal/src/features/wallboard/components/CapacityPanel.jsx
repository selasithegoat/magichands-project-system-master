import { formatNumber, formatPercent } from "../../../utils/formatters";

const CapacityPanel = ({ workload = [], teamUtilizationPercent = 0 }) => (
  <article className="panel">
    <div className="panel-head">
      <h2>Team Capacity</h2>
      <div className="panel-stat">{formatPercent(teamUtilizationPercent)} avg load</div>
    </div>

    {workload.length ? (
      <div className="capacity-list">
        {workload.map((person) => (
          <div className="capacity-item" key={person.userId}>
            <div className="capacity-head">
              <strong>{person.name}</strong>
              <span className={`load-pill load-${person.loadStatus}`}>
                {formatPercent(person.utilizationPercent)}
              </span>
            </div>
            <div className="capacity-meta">
              <span>{formatNumber(person.projects)} active</span>
              <span>{person.urgentProjects} urgent</span>
              <span>{person.overdueProjects} overdue</span>
            </div>
            <div className="capacity-track">
              <span style={{ width: `${Math.min(person.utilizationPercent, 150)}%` }} />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <p className="empty-state">No assigned workload data.</p>
    )}
  </article>
);

export default CapacityPanel;
