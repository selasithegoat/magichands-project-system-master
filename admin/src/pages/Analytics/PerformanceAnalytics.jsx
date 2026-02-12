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

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const formatBucketUnit = (label) => {
  if (!label) return "period";
  const normalized = label.toLowerCase();
  if (normalized.includes("day")) return "day";
  if (normalized.includes("week")) return "week";
  if (normalized.includes("month")) return "month";
  return "period";
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
};

const Sparkline = ({ points }) => {
  const width = 140;
  const height = 42;
  const values = points
    .map((point) => point.avgHours)
    .filter((value) => value !== null && value !== undefined);
  if (!values.length) {
    return <div className="sparkline-empty">No trend data</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = points.length > 1 ? (width - 4) / (points.length - 1) : 0;
  let path = "";
  let move = true;
  let lastPoint = null;

  points.forEach((point, index) => {
    const value = point.avgHours;
    if (value === null || value === undefined) {
      move = true;
      return;
    }
    const x = 2 + index * step;
    const y = height - 2 - ((value - min) / range) * (height - 6);
    if (move) {
      path += `M ${x} ${y}`;
      move = false;
    } else {
      path += ` L ${x} ${y}`;
    }
    lastPoint = { x, y };
  });

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      {lastPoint ? (
        <circle cx={lastPoint.x} cy={lastPoint.y} r="3.5" fill="currentColor" />
      ) : null}
    </svg>
  );
};

const Distribution = ({ distribution, median }) => {
  const bins = distribution?.bins || [];
  if (!bins.length) {
    return <div className="distribution-empty">No distribution data</div>;
  }
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const minValue = bins[0]?.start ?? 0;
  const maxValue = bins[bins.length - 1]?.end ?? 0;
  const midValue = (minValue + maxValue) / 2;
  return (
    <div className="distribution">
      <div className="distribution-chart">
        <div className="distribution-y-label">Projects</div>
        <div className="distribution-bars" role="img" aria-label="Project duration distribution">
          {bins.map((bin, index) => {
            const height = `${(bin.count / maxCount) * 100}%`;
            const title = `${bin.count} project(s) - ${formatDuration(bin.start)} to ${formatDuration(
              bin.end,
            )}`;
            return (
              <div
                key={`${bin.start}-${index}`}
                className="distribution-bar"
                style={{ height }}
                title={title}
              />
            );
          })}
        </div>
        <div className="distribution-x-scale">
          <span>{formatDuration(minValue)}</span>
          <span>{formatDuration(midValue)}</span>
          <span>{formatDuration(maxValue)}</span>
        </div>
        <div className="distribution-x-label">Duration</div>
      </div>
      <div className="distribution-meta">
        <span>25th pct: {formatDuration(distribution.q1)}</span>
        <span>Median: {formatDuration(median)}</span>
        <span>75th pct: {formatDuration(distribution.q3)}</span>
      </div>
    </div>
  );
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
  const orderedStages = useMemo(() => {
    if (!stageStats.length) return [];
    const processStage = stageStats.find((stage) => stage.isProcess);
    const otherStages = stageStats.filter((stage) => !stage.isProcess);
    return processStage ? [processStage, ...otherStages] : stageStats;
  }, [stageStats]);

  const handleExportCSV = () => {
    if (!data) return;

    const rows = [];
    rows.push(["Report Range", fromDate, toDate].map(escapeCSV));
    rows.push([]);
    rows.push(["Stage Summary"].map(escapeCSV));
    rows.push(
      [
        "Stage",
        "Definition",
        "Projects",
        "Avg Hours",
        "Median Hours",
        "Min Hours",
        "Max Hours",
      ].map(escapeCSV),
    );

    stageStats.forEach((stage) => {
      const definitionParts = [];
      if (stage.description) definitionParts.push(stage.description);
      if (stage.rangeLabel) definitionParts.push(stage.rangeLabel);
      rows.push(
        [
          stage.label,
          definitionParts.join(" | "),
          stage.count,
          stage.avgHours?.toFixed(2) ?? "",
          stage.medianHours?.toFixed(2) ?? "",
          stage.minHours?.toFixed(2) ?? "",
          stage.maxHours?.toFixed(2) ?? "",
        ].map(escapeCSV),
      );
    });

    rows.push([]);
    rows.push(["Project Durations"].map(escapeCSV));
    rows.push(
      [
        "Order ID",
        "Project ID",
        "Project Name",
        "Status",
        "End-to-End Hours",
        "End-to-End Start",
        "End-to-End End",
        "Mockup Hours",
        "Production Hours",
        "Packaging Hours",
        "Mockup Start",
        "Mockup End",
        "Production Start",
        "Production End",
        "Packaging Start",
        "Packaging End",
      ].map(escapeCSV),
    );

    projectRows.forEach((row) => {
      rows.push(
        [
          row.orderId || "",
          row.projectId,
          row.projectName,
          row.status,
          row.endToEnd?.hours?.toFixed(2) ?? "",
          formatDateTime(row.endToEnd?.start),
          formatDateTime(row.endToEnd?.end),
          row.stages.mockup?.hours?.toFixed(2) ?? "",
          row.stages.production?.hours?.toFixed(2) ?? "",
          row.stages.packaging?.hours?.toFixed(2) ?? "",
          formatDateTime(row.stages.mockup?.start),
          formatDateTime(row.stages.mockup?.end),
          formatDateTime(row.stages.production?.start),
          formatDateTime(row.stages.production?.end),
          formatDateTime(row.stages.packaging?.start),
          formatDateTime(row.stages.packaging?.end),
        ].map(escapeCSV),
      );
    });

    const csvContent = `\ufeff${rows.map((row) => row.join(",")).join("\n")}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `performance-analytics-${fromDate}-to-${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="performance-page">
      <div className="performance-header">
        <div>
          <h1>Performance Analytics</h1>
          <p>Stage and end-to-end duration tracking for the project lifecycle.</p>
        </div>
        <div className="header-actions">
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
          <button
            type="button"
            className="export-button"
            onClick={handleExportCSV}
            disabled={!data || loading}
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="performance-loading">Loading analytics...</div>
      ) : error ? (
        <div className="performance-error">{error}</div>
      ) : (
        <>
          <div className="stat-grid">
            {orderedStages.map((stage) => (
              <div
                key={stage.key}
                className={`stat-card${stage.isProcess ? " stat-card--process" : ""}`}
              >
                <div className="stat-label">{stage.label}</div>
                {stage.description ? (
                  <div className="stat-caption">{stage.description}</div>
                ) : null}
                {stage.rangeLabel ? (
                  <div className="stat-range">From {stage.rangeLabel}</div>
                ) : null}
                <div className="stat-metric">
                  {formatDuration(stage.avgHours)}
                </div>
                <div className="stat-meta">
                  <span>Typical (Median): {formatDuration(stage.medianHours)}</span>
                  <span>Fastest: {formatDuration(stage.minHours)}</span>
                  <span>Slowest: {formatDuration(stage.maxHours)}</span>
                  <span>Projects analyzed: {stage.count}</span>
                </div>
                <div className="stat-section">
                  <div className="stat-section-title">
                    Average duration per {formatBucketUnit(stage.trend?.bucketLabel)}
                  </div>
                  <Sparkline points={stage.trend?.points || []} />
                </div>
                <div className="stat-section">
                  <div className="stat-section-title">Distribution (projects by duration)</div>
                  <Distribution
                    distribution={stage.distribution}
                    median={stage.medianHours}
                  />
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
                      <th>End-to-End</th>
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
                        <td>{formatDuration(row.endToEnd?.hours)}</td>
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

