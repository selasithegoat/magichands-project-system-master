import { formatNumber } from "../../../utils/formatters";

const PipelinePanel = ({ pipeline = [] }) => {
  const maxCount = Math.max(...pipeline.map((item) => item.count || 0), 1);

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Workflow Pipeline</h2>
      </div>

      {pipeline.length ? (
        <div className="pipeline-list">
          {pipeline.map((item) => {
            const width = ((item.count || 0) / maxCount) * 100;
            return (
              <div className="pipeline-row" key={item.key}>
                <div className="pipeline-meta">
                  <span>{item.label}</span>
                  <strong>{formatNumber(item.count || 0)}</strong>
                </div>
                <div className="pipeline-track">
                  <span style={{ width: `${Math.max(width, 4)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">No pipeline data available.</p>
      )}
    </article>
  );
};

export default PipelinePanel;
