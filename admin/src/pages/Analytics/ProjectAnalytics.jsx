import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./ProjectAnalytics.css";

const formatDuration = (hours) => {
  if (hours === null || hours === undefined) return "-";
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

const formatDelta = (hours) => {
  if (hours === null || hours === undefined) return "-";
  const sign = hours >= 0 ? "+" : "-";
  return `${sign}${formatDuration(Math.abs(hours))}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTimeISO = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const formatShortDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
};

const downloadCSV = (rows, filename) => {
  const csvContent = `\ufeff${rows.map((row) => row.join(",")).join("\n")}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const LineChart = ({ points, label }) => {
  const width = 640;
  const height = 240;
  const padding = { top: 20, right: 24, bottom: 40, left: 56 };
  const values = points
    .map((point) => point.value)
    .filter((value) => value !== null && value !== undefined);
  if (!values.length) {
    return <div className="line-chart-empty">No trend data</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const step = points.length > 1 ? chartWidth / (points.length - 1) : 0;

  let path = "";
  let move = true;
  let lastPoint = null;

  points.forEach((point, index) => {
    const value = point.value;
    if (value === null || value === undefined) {
      move = true;
      return;
    }
    const x = padding.left + index * step;
    const y =
      padding.top + chartHeight - ((value - min) / range) * chartHeight;
    if (move) {
      path += `M ${x} ${y}`;
      move = false;
    } else {
      path += ` L ${x} ${y}`;
    }
    lastPoint = { x, y };
  });

  const yLabels = [
    { value: max, y: padding.top },
    { value: min + range / 2, y: padding.top + chartHeight / 2 },
    { value: min, y: padding.top + chartHeight },
  ];
  const firstLabel = formatShortDate(points[0]?.at);
  const midLabel = formatShortDate(points[Math.floor(points.length / 2)]?.at);
  const lastLabel = formatShortDate(points[points.length - 1]?.at);

  return (
    <div className="line-chart">
      <svg
        className="line-chart-svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
      >
        <rect
          x={padding.left}
          y={padding.top}
          width={chartWidth}
          height={chartHeight}
          className="line-chart-frame"
        />
        {yLabels.map((labelItem, index) => (
          <g key={`y-${index}`}>
            <line
              x1={padding.left}
              x2={padding.left + chartWidth}
              y1={labelItem.y}
              y2={labelItem.y}
              className="line-chart-grid"
            />
            <text
              x={padding.left - 12}
              y={labelItem.y + 4}
              className="line-chart-axis"
              textAnchor="end"
            >
              {formatDuration(labelItem.value)}
            </text>
          </g>
        ))}
        <line
          x1={padding.left}
          x2={padding.left + chartWidth}
          y1={padding.top + chartHeight}
          y2={padding.top + chartHeight}
          className="line-chart-axis-line"
        />
        <path d={path} className="line-chart-line" />
        {lastPoint ? (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r="4"
            className="line-chart-point"
          />
        ) : null}
        <text
          x={padding.left}
          y={height - 10}
          className="line-chart-axis"
          textAnchor="start"
        >
          {firstLabel}
        </text>
        <text
          x={padding.left + chartWidth / 2}
          y={height - 10}
          className="line-chart-axis"
          textAnchor="middle"
        >
          {midLabel}
        </text>
        <text
          x={padding.left + chartWidth}
          y={height - 10}
          className="line-chart-axis"
          textAnchor="end"
        >
          {lastLabel}
        </text>
        <text
          x={padding.left - 40}
          y={padding.top - 6}
          className="line-chart-axis-label"
        >
          Hours
        </text>
        <text
          x={padding.left + chartWidth}
          y={height - 26}
          className="line-chart-axis-label"
          textAnchor="end"
        >
          Date
        </text>
      </svg>
    </div>
  );
};

const ProjectAnalytics = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let isActive = true;

    const fetchProjectAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/analytics/project/${id}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to load project analytics.");
        }
        const payload = await res.json();
        if (isActive) {
          setData(payload);
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load project analytics.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchProjectAnalytics();

    return () => {
      isActive = false;
    };
  }, [id]);

  const project = data?.project;
  const stages = data?.stages || [];
  const benchmarks = data?.benchmarks || [];
  const timeline = data?.timeline || [];
  const endToEnd = data?.endToEnd || null;

  const benchmarkMap = useMemo(
    () => new Map(benchmarks.map((stage) => [stage.key, stage])),
    [benchmarks],
  );
  const totalStageHours = useMemo(
    () =>
      stages.reduce(
        (total, stage) => total + (stage.hours ? stage.hours : 0),
        0,
      ),
    [stages],
  );
  const progressPoints = useMemo(() => {
    if (!timeline.length) return [];
    const startAt = new Date(timeline[0].at);
    if (Number.isNaN(startAt.getTime())) return [];
    return timeline
      .map((event) => {
        const at = new Date(event.at);
        if (Number.isNaN(at.getTime())) return null;
        return {
          at,
          value: (at.getTime() - startAt.getTime()) / 36e5,
        };
      })
      .filter(Boolean);
  }, [timeline]);
  const lastEvent = timeline.length ? timeline[timeline.length - 1] : null;
  const endToEndBenchmark = benchmarkMap.get("endToEnd");

  const handleExportStageCSV = () => {
    if (!data) return;

    const rows = [];
    rows.push(
      [
        "Project",
        project?.name || "",
        project?.orderId || project?.id || "",
      ].map(escapeCSV),
    );
    rows.push(["Status", project?.status || ""].map(escapeCSV));
    rows.push([]);
    rows.push(["Stage Breakdown"].map(escapeCSV));
    rows.push(
      [
        "Stage",
        "Start Status",
        "End Status",
        "Start",
        "End",
        "Duration Hours",
        "Percent of Total",
        "Benchmark Avg Hours",
        "Delta Hours",
      ].map(escapeCSV),
    );

    stages.forEach((stage) => {
      const benchmark = benchmarkMap.get(stage.key);
      const delta =
        stage.hours !== null &&
        stage.hours !== undefined &&
        benchmark?.avgHours !== null &&
        benchmark?.avgHours !== undefined
          ? stage.hours - benchmark.avgHours
          : null;
      rows.push(
        [
          stage.label,
          stage.startStatus,
          stage.endStatus,
          formatDateTimeISO(stage.start),
          formatDateTimeISO(stage.end),
          stage.hours?.toFixed(2) ?? "",
          stage.percentOfTotal !== null && stage.percentOfTotal !== undefined
            ? stage.percentOfTotal.toFixed(2)
            : "",
          benchmark?.avgHours?.toFixed(2) ?? "",
          delta !== null && delta !== undefined ? delta.toFixed(2) : "",
        ].map(escapeCSV),
      );
    });

    const filename = `project-stage-breakdown-${project?.orderId || project?.id || "analytics"}.csv`;
    downloadCSV(rows, filename);
  };

  return (
    <div className="project-analytics-page">
      <div className="project-analytics-header">
        <div>
          <h1>{project?.name || "Project Analytics"}</h1>
          <p>
            Order {project?.orderId || project?.id || "-"} - {project?.status || "-"}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="back-button"
            onClick={() => navigate("/analytics")}
          >
            Back to Analytics
          </button>
          <button
            type="button"
            className="export-button"
            onClick={handleExportStageCSV}
            disabled={!data || loading}
          >
            Export Stage Breakdown
          </button>
        </div>
      </div>

      {loading ? (
        <div className="project-analytics-loading">Loading project analytics...</div>
      ) : error ? (
        <div className="project-analytics-error">{error}</div>
      ) : (
        <>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-label">End-to-End</div>
              <div className="summary-value">{formatDuration(endToEnd?.hours)}</div>
              <div className="summary-meta">
                {endToEnd?.start && endToEnd?.end
                  ? `${formatDateTime(endToEnd.start)} to ${formatDateTime(endToEnd.end)}`
                  : "Not completed yet"}
              </div>
              <div className="summary-sub">
                Benchmark avg: {formatDuration(endToEndBenchmark?.avgHours)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Bottleneck Stage</div>
              <div className="summary-value">
                {data?.bottleneck?.label || "-"}
              </div>
              <div className="summary-meta">
                {formatDuration(data?.bottleneck?.hours)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Stage Time</div>
              <div className="summary-value">{formatDuration(totalStageHours)}</div>
              <div className="summary-meta">Sum of completed stages</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Last Status Change</div>
              <div className="summary-value">{lastEvent?.to || "-"}</div>
              <div className="summary-meta">
                {lastEvent ? formatDateTime(lastEvent.at) : "No status changes yet"}
              </div>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h2>End-to-End Progress</h2>
                <p>Cumulative duration since the first status change.</p>
              </div>
            </div>
            <LineChart
              points={progressPoints}
              label="End-to-end duration progression"
            />
          </div>

          <div className="analytics-card">
            <h2>Project Snapshot</h2>
            <div className="snapshot-grid">
              <div className="snapshot-item">
                <span className="snapshot-label">Project Name</span>
                <span className="snapshot-value">{project?.name || "-"}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Order ID</span>
                <span className="snapshot-value">{project?.orderId || "-"}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Client</span>
                <span className="snapshot-value">{project?.client || "-"}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Project Type</span>
                <span className="snapshot-value">{project?.type || "-"}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Priority</span>
                <span className="snapshot-value">{project?.priority || "-"}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Lead</span>
                <span className="snapshot-value">{project?.lead || "-"}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Assistant Lead</span>
                <span className="snapshot-value">{project?.assistantLead || "-"}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Created</span>
                <span className="snapshot-value">{formatDate(project?.createdAt)}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Order Date</span>
                <span className="snapshot-value">{formatDate(project?.orderDate)}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-label">Delivery Date</span>
                <span className="snapshot-value">{formatDate(project?.deliveryDate)}</span>
              </div>
            </div>
          </div>

          <div className="analytics-card">
            <div className="card-header">
              <div>
                <h2>Stage Breakdown</h2>
                <p>How long each phase took, versus the global average.</p>
              </div>
            </div>
            {stages.length === 0 ? (
              <div className="empty-state">No stage data available yet.</div>
            ) : (
              <div className="table-scroll">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Duration</th>
                      <th>% of Total</th>
                      <th>Benchmark Avg</th>
                      <th>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((stage) => {
                      const benchmark = benchmarkMap.get(stage.key);
                      const delta =
                        stage.hours !== null &&
                        stage.hours !== undefined &&
                        benchmark?.avgHours !== null &&
                        benchmark?.avgHours !== undefined
                          ? stage.hours - benchmark.avgHours
                          : null;
                      return (
                        <tr key={stage.key}>
                          <td>
                            <div className="stage-cell">
                              <span className="stage-label">{stage.label}</span>
                              <span className="stage-range">
                                {stage.startStatus} to {stage.endStatus}
                              </span>
                            </div>
                          </td>
                          <td>{formatDateTime(stage.start)}</td>
                          <td>{formatDateTime(stage.end)}</td>
                          <td>{formatDuration(stage.hours)}</td>
                          <td>
                            {stage.percentOfTotal !== null &&
                            stage.percentOfTotal !== undefined
                              ? `${stage.percentOfTotal.toFixed(1)}%`
                              : "-"}
                          </td>
                          <td>{formatDuration(benchmark?.avgHours)}</td>
                          <td
                            className={
                              delta === null
                                ? ""
                                : delta > 0
                                  ? "delta-up"
                                  : "delta-down"
                            }
                          >
                            {formatDelta(delta)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="analytics-card">
            <div className="card-header">
              <div>
                <h2>Workflow Timeline</h2>
                <p>Status changes across the lifecycle.</p>
              </div>
            </div>
            {timeline.length === 0 ? (
              <div className="empty-state">No status changes logged yet.</div>
            ) : (
              <div className="timeline-list">
                {timeline.map((event, index) => (
                  <div key={`${event.at}-${index}`} className="timeline-item">
                    <div className="timeline-title">
                      {event.from || "-"} to {event.to || "-"}
                    </div>
                    <div className="timeline-meta">
                      <span>{formatDateTime(event.at)}</span>
                      <span>{event.by?.name || "System"}</span>
                    </div>
                    {event.description ? (
                      <div className="timeline-description">{event.description}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectAnalytics;
