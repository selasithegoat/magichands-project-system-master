import React, { useEffect, useMemo, useState } from "react";
import "./PerformanceAnalytics.css";

const formatDateInput = (date) => date.toISOString().slice(0, 10);

const formatDuration = (hours) => {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return `${days}d ${rem.toFixed(1)}h`;
};

const PerformanceAnalytics = () => {
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(
    formatDateInput(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)),
  );
  const [toDate, setToDate] = useState(formatDateInput(today));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
      });
      const res = await fetch(`/api/admin/analytics/stage-durations?${params}`, { credentials: "include" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load analytics.");
      }
      const payload = await res.json();
      setData(payload);
    } catch (err) {
      setError(err.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [fromDate, toDate]);

  const stageStats = data?.stages || [];
  const projectRows = data?.projects || [];

  return (
    <div className="performance-page">
      <div className="performance-header">
        <div>
          <h1>Performance Analytics</h1>
          <p>Stage duration tracking for Mockup, Production, and Packaging.</p>
        </div>
        <div className="date-controls">
          <label>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="performance-loading">Loading analytics...</div>
      ) : error ? (
        <div className="performance-error">{error}</div>
      ) : (
        <>
          <div className="stat-grid">
            {stageStats.map((stage) => (
              <div key={stage.key} className="stat-card">
                <div className="stat-label">{stage.label}</div>
                <div className="stat-metric">
                  {formatDuration(stage.avgHours)}
                </div>
                <div className="stat-meta">
                  <span>Median: {formatDuration(stage.medianHours)}</span>
                  <span>Min: {formatDuration(stage.minHours)}</span>
                  <span>Max: {formatDuration(stage.maxHours)}</span>
                  <span>Projects: {stage.count}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="table-card">
            <div className="table-header">
              <div>
                <h2>Project Durations</h2>
                <p>{projectRows.length} projects in range</p>
              </div>
            </div>
            {projectRows.length === 0 ? (
              <div className="empty-state">No project durations found.</div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Status</th>
                      <th>Mockup</th>
                      <th>Production</th>
                      <th>Packaging</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectRows.map((row) => (
                      <tr key={row.projectId}>
                        <td>
                          <div className="project-cell">
                            <span className="project-id">
                              {row.orderId || row.projectId.slice(-6).toUpperCase()}
                            </span>
                            <span className="project-name">{row.projectName}</span>
                          </div>
                        </td>
                        <td>{row.status}</td>
                        <td>{formatDuration(row.stages.mockup?.hours)}</td>
                        <td>{formatDuration(row.stages.production?.hours)}</td>
                        <td>{formatDuration(row.stages.packaging?.hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PerformanceAnalytics;

