import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const {
    data,
    error: analyticsError,
    isPending: loading,
  } = useQuery({
    queryKey: ["admin", "analytics", "project", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/project/${id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to load project analytics.",
        );
      }
      return res.json();
    },
    meta: {
      realtimePaths: ["/api/projects", "/api/updates"],
      projectId: id,
    },
    enabled: Boolean(id),
  });
  const error = analyticsError?.message || "";

  const project = data?.project;
  const stages = useMemo(() => data?.stages || [], [data]);
  const benchmarks = useMemo(() => data?.benchmarks || [], [data]);
  const timeline = useMemo(() => data?.timeline || [], [data]);
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

  const handleExportTimelineCSV = () => {
    if (!timeline.length) return;
    const rows = [
      ["Timestamp", "From Status", "To Status", "Changed By", "Description"].map(
        escapeCSV,
      ),
      ...timeline.map((event) =>
        [
          formatDateTimeISO(event.at),
          event.from || "",
          event.to || "",
          event.by?.name || "System",
          event.description || "",
        ].map(escapeCSV),
      ),
    ];
    downloadCSV(
      rows,
      `project-workflow-audit-${project?.orderId || project?.id || "analytics"}.csv`,
    );
  };

  return (
    <div className="project-analytics-page">
      <header className="project-analytics-hero">
        <div><span>Analytics / Individual Project Intelligence</span><div><h1>{project?.name || "Project Analytics"}</h1><em>{project?.status || "Loading"}</em></div><p>Order #{project?.orderId || project?.id || "-"} · {project?.client || "Client not recorded"}</p></div>
        <div className="project-analytics-actions"><button type="button" onClick={() => navigate("/analytics")}>Back to analytics</button><button type="button" onClick={() => project?.id && navigate(`/projects/${project.id}`)} disabled={!project?.id}>Open project</button><button type="button" className="primary" onClick={handleExportStageCSV} disabled={!data || loading}>Export stage breakdown</button></div>
      </header>

      {loading ? <div className="project-analytics-state">Loading project analytics…</div> : error ? <div className="project-analytics-state error">{error}</div> : (
        <>
          <section className="project-summary-grid">
            <article><span>End-to-end cycle</span><strong>{formatDuration(endToEnd?.hours)}</strong><p>{endToEnd?.start && endToEnd?.end ? `${formatDate(endToEnd.start)} – ${formatDate(endToEnd.end)}` : "Not completed yet"}</p><em>Benchmark: {formatDuration(endToEndBenchmark?.avgHours)}</em></article>
            <article className="danger"><span>Bottleneck stage</span><strong>{data?.bottleneck?.label || "Not available"}</strong><p>{formatDuration(data?.bottleneck?.hours)}</p><em>Longest completed phase</em></article>
            <article><span>Total stage time</span><strong>{formatDuration(totalStageHours)}</strong><p>{stages.filter((stage) => stage.hours !== null).length} of {stages.length} stages measured</p><em>Completed phases only</em></article>
            <article><span>Last status change</span><strong>{lastEvent?.to || "No event"}</strong><p>{lastEvent ? formatDateTime(lastEvent.at) : "No status changes yet"}</p><em>{lastEvent?.by?.name || "System"}</em></article>
          </section>

          <section className="project-analytics-overview">
            <article className="project-progress-card"><header><div><span>Lifecycle telemetry</span><h2>End-to-End Cumulative Progress</h2><p>Elapsed duration from the first recorded status transition.</p></div><em>{progressPoints.length} events</em></header><LineChart points={progressPoints} label="End-to-end duration progression" /></article>
            <aside className="project-snapshot-card"><header><span>Project snapshot</span><h2>Operational Context</h2></header><div>{[
              ["Order ID", project?.orderId || "-"],
              ["Client", project?.client || "-"],
              ["Project type", project?.type || "-"],
              ["Priority", project?.priority || "-"],
              ["Project lead", project?.lead || "-"],
              ["Assistant lead", project?.assistantLead || "-"],
              ["Order date", formatDate(project?.orderDate)],
              ["Delivery date", formatDate(project?.deliveryDate)],
            ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div></aside>
          </section>

          <section className="project-analytics-detail-grid">
            <article className="project-stage-breakdown"><header><div><span>Benchmark comparison</span><h2>Stage Breakdown</h2><p>Actual elapsed time versus the global average for every measurable stage.</p></div><button type="button" onClick={handleExportStageCSV}>Export CSV</button></header>{!stages.length ? <div className="empty-state">No stage data available yet.</div> : <div className="table-scroll admin-data-table-scroll admin-data-table-scroll--embedded"><table className="admin-data-table" style={{ "--admin-table-min-width": "780px" }}><thead><tr><th>Stage</th><th>Window</th><th>Duration</th><th>% total</th><th>Benchmark</th><th>Delta</th></tr></thead><tbody>{stages.map((stage) => { const benchmark = benchmarkMap.get(stage.key); const delta = stage.hours !== null && stage.hours !== undefined && benchmark?.avgHours !== null && benchmark?.avgHours !== undefined ? stage.hours - benchmark.avgHours : null; return <tr key={stage.key} className={data?.bottleneck?.key === stage.key ? "is-bottleneck" : ""}><td data-label="Stage" data-table-primary="true"><div className="stage-cell admin-table-identity"><span className="stage-label admin-table-title">{stage.label}</span><span className="stage-range admin-table-subtitle">{stage.startStatus} → {stage.endStatus}</span></div></td><td data-label="Window"><span>{formatDateTime(stage.start)}</span><small>{stage.end ? ` to ${formatDateTime(stage.end)}` : "Not completed"}</small></td><td data-label="Duration"><strong>{formatDuration(stage.hours)}</strong></td><td data-label="% total">{stage.percentOfTotal !== null && stage.percentOfTotal !== undefined ? `${stage.percentOfTotal.toFixed(1)}%` : "-"}</td><td data-label="Benchmark">{formatDuration(benchmark?.avgHours)}</td><td data-label="Delta"><span className={`admin-table-status ${delta === null ? "is-neutral" : delta > 0 ? "is-danger" : "is-success"}`}>{formatDelta(delta)}</span></td></tr>; })}</tbody></table></div>}</article>

            <aside className="project-workflow-timeline"><header><div><span>Workflow audit</span><h2>Status Event Chain</h2><p>Recorded status changes and responsible users.</p></div><button type="button" onClick={handleExportTimelineCSV} disabled={!timeline.length}>Export audit log</button></header>{!timeline.length ? <div className="empty-state">No status changes logged yet.</div> : <div className="timeline-list">{timeline.map((event, index) => <article key={`${event.at}-${index}`} className={index === timeline.length - 1 ? "latest" : ""}><i /><div><strong>{event.from || "Project created"} → {event.to || "Unknown status"}</strong><span>{formatDateTime(event.at)} · {event.by?.name || "System"}</span>{event.description ? <p>{event.description}</p> : null}</div></article>)}</div>}</aside>
          </section>

          <footer className="project-analytics-method"><strong>Analytics source</strong><span>All durations and audit entries are calculated from actual project status-change records. Missing values indicate incomplete or unrecorded transitions.</span></footer>
        </>
      )}
    </div>
  );
};

export default ProjectAnalytics;
