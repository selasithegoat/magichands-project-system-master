import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import "./PerformanceAnalytics.css";
import usePersistedState from "@client/hooks/usePersistedState";
import { renderProjectName } from "../../utils/projectName";

const HIDDEN_STAGE_KEYS = new Set(["proofReading", "qualityControl", "photography"]);

const formatDateInput = (date) => date.toISOString().slice(0, 10);

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

const getTableStatusTone = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (
    normalized.includes("completed") ||
    normalized.includes("finished") ||
    normalized.includes("delivered")
  )
    return "is-success";
  if (
    normalized.includes("hold") ||
    normalized.includes("declined") ||
    normalized.includes("blocked") ||
    normalized.includes("overdue")
  )
    return "is-danger";
  if (normalized.includes("quote") || normalized.includes("engagement"))
    return "is-violet";
  if (normalized.includes("pending") || normalized.includes("awaiting"))
    return "is-warning";
  if (
    normalized.includes("progress") ||
    normalized.includes("feedback") ||
    normalized.includes("created")
  )
    return "is-info";
  return "is-neutral";
};

const formatDateTime = (value) => {
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

const LineChart = ({ points, label }) => {
  const width = 640;
  const height = 240;
  const padding = { top: 20, right: 24, bottom: 40, left: 56 };
  const values = points
    .map((point) => point.avgHours)
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
    const value = point.avgHours;
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
  const firstLabel = formatShortDate(points[0]?.start);
  const midLabel = formatShortDate(points[Math.floor(points.length / 2)]?.start);
  const lastLabel = formatShortDate(points[points.length - 1]?.start);

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
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = usePersistedState(
    "admin-performance-analytics-from-date",
    formatDateInput(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)),
  );
  const [toDate, setToDate] = usePersistedState(
    "admin-performance-analytics-to-date",
    formatDateInput(today),
  );
  const {
    data,
    error: analyticsError,
    isPending: loading,
  } = useQuery({
    queryKey: ["admin", "analytics", "stage-durations", fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
      });
      const res = await fetch(
        `/api/admin/analytics/stage-durations?${params}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load analytics.");
      }
      return res.json();
    },
    meta: {
      realtimePaths: ["/api/projects", "/api/updates"],
    },
  });
  const error = analyticsError?.message || "";
  const [searchQuery, setSearchQuery] = usePersistedState(
    "admin-performance-analytics-search",
    "",
  );
  const [statusFilter, setStatusFilter] = usePersistedState(
    "admin-performance-analytics-status-filter",
    "All",
  );
  const [currentPage, setCurrentPage] = usePersistedState(
    "admin-performance-analytics-page",
    1,
    {
      sanitize: (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
      },
    },
  );
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const itemsPerPage = 15;

  const stageStats = useMemo(() => data?.stages || [], [data]);
  const projectRows = useMemo(() => data?.projects || [], [data]);
  const orderedStages = useMemo(() => {
    if (!stageStats.length) return [];
    const processStage = stageStats.find((stage) => stage.isProcess);
    const otherStages = stageStats.filter((stage) => !stage.isProcess);
    return processStage ? [processStage, ...otherStages] : stageStats;
  }, [stageStats]);
  const visibleStages = useMemo(
    () => orderedStages.filter((stage) => !HIDDEN_STAGE_KEYS.has(stage.key)),
    [orderedStages],
  );
  const endToEndStage = useMemo(
    () =>
      stageStats.find((stage) => stage.isProcess) ||
      stageStats.find((stage) => stage.key === "endToEnd"),
    [stageStats],
  );
  const statusOptions = useMemo(() => {
    const statuses = projectRows
      .map((row) => row.status)
      .filter((status) => status && String(status).trim() !== "");
    return ["All", ...Array.from(new Set(statuses)).sort()];
  }, [projectRows]);

  const effectiveStatusFilter = statusOptions.includes(statusFilter)
    ? statusFilter
    : "All";
  const filteredProjects = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return projectRows.filter((row) => {
      if (effectiveStatusFilter !== "All" && row.status !== effectiveStatusFilter)
        return false;
      if (!term) return true;
      const haystack = [
        row.projectName,
        row.orderId,
        row.projectId,
        row.status,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return haystack.some((value) => value.includes(term));
    });
  }, [effectiveStatusFilter, projectRows, searchQuery]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredProjects.length / itemsPerPage),
  );
  const activePage = Math.min(currentPage, totalPages);
  const paginatedProjects = useMemo(() => {
    const start = (activePage - 1) * itemsPerPage;
    return filteredProjects.slice(start, start + itemsPerPage);
  }, [activePage, filteredProjects, itemsPerPage]);

  const selectedProject =
    projectRows.find((row) => row.projectId === selectedProjectId) ||
    paginatedProjects[0] ||
    null;
  const slowestStage = visibleStages
    .filter((stage) => !stage.isProcess && stage.avgHours !== null)
    .sort((left, right) => right.avgHours - left.avgHours)[0] || null;
  const endToEndDistribution = endToEndStage?.distribution;
  const outlierThreshold =
    endToEndDistribution?.q3 !== null &&
    endToEndDistribution?.q3 !== undefined &&
    endToEndDistribution?.iqr !== null &&
    endToEndDistribution?.iqr !== undefined
      ? endToEndDistribution.q3 + 1.5 * endToEndDistribution.iqr
      : null;
  const outlierProjects = outlierThreshold === null
    ? []
    : projectRows.filter((row) => Number(row.totalHours) > outlierThreshold);
  const completedProjects = projectRows.filter((row) =>
    /completed|finished|delivered/i.test(String(row.status || "")),
  );

  const handleExportStageCSV = () => {
    if (!data) return;

    const rows = [];
    rows.push(["Report Range", fromDate, toDate].map(escapeCSV));
    rows.push([]);
    rows.push(["Stage Breakdown"].map(escapeCSV));
    rows.push(
      [
        "Stage",
        "Definition",
        "Status Range",
        "Projects",
        "Avg Hours",
        "Median Hours",
        "Min Hours",
        "Max Hours",
      ].map(escapeCSV),
    );

    stageStats.forEach((stage) => {
      rows.push(
        [
          stage.label,
          stage.description || "",
          stage.rangeLabel || "",
          stage.count,
          stage.avgHours?.toFixed(2) ?? "",
          stage.medianHours?.toFixed(2) ?? "",
          stage.minHours?.toFixed(2) ?? "",
          stage.maxHours?.toFixed(2) ?? "",
        ].map(escapeCSV),
      );
    });

    downloadCSV(
      rows,
      `performance-stage-breakdown-${fromDate}-to-${toDate}.csv`,
    );
  };

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

    downloadCSV(rows, `performance-analytics-${fromDate}-to-${toDate}.csv`);
  };

  return (
    <div className="performance-page">
      <header className="performance-hero">
        <div>
          <span>Operations Core / Intelligence / Fabrication Stage Analytics</span>
          <div className="performance-title-line"><h1>Performance &amp; Fabrication Stage Analytics</h1><em>Live data</em></div>
          <p>Real project duration tracking, stage latency diagnostics, distribution analysis, and workflow bottleneck telemetry.</p>
        </div>
        <div className="performance-actions">
          <div className="date-controls"><label><span>From</span><input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setCurrentPage(1); }} /></label><i>to</i><label><span>To</span><input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setCurrentPage(1); }} /></label></div>
          <button type="button" onClick={handleExportCSV} disabled={!data || loading}>Export CSV</button>
          <button type="button" className="primary" onClick={handleExportStageCSV} disabled={!data || loading}>Export stage breakdown</button>
        </div>
      </header>

      {loading ? <div className="performance-state">Loading analytics…</div> : error ? <div className="performance-state error">{error}</div> : (
        <>
          <section className="performance-overview-grid">
            <article className="duration-trend-card">
              <header><div><span>Cycle telemetry</span><h2>End-to-End Duration Trend</h2><p>Average turnaround time per {formatBucketUnit(endToEndStage?.trend?.bucketLabel)}.</p></div><div><em>Peak: {formatDuration(endToEndStage?.maxHours)}</em><strong>Median: {formatDuration(endToEndStage?.medianHours)}</strong></div></header>
              <LineChart points={endToEndStage?.trend?.points || []} label="End-to-end duration over time" />
            </article>
            <aside className="queue-friction-card">
              <header><span>Latency intelligence</span><h2>Queue Friction Monitor</h2><p>Signals calculated from measured stage and project-duration records.</p></header>
              <div className="queue-signal danger"><span>Slowest average stage</span><strong>{slowestStage?.label || "Not enough data"}</strong><em>{formatDuration(slowestStage?.avgHours)}</em></div>
              <div className="queue-signal warning"><span>Statistical outliers</span><strong>{outlierProjects.length} projects</strong><em>{outlierThreshold === null ? "No threshold" : `Above ${formatDuration(outlierThreshold)}`}</em></div>
              <div className="queue-signal success"><span>Completed in range</span><strong>{completedProjects.length} projects</strong><em>{projectRows.length ? `${Math.round((completedProjects.length / projectRows.length) * 100)}% of measured records` : "No records"}</em></div>
              <footer><button type="button" onClick={() => slowestStage && document.getElementById(`stage-${slowestStage.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} disabled={!slowestStage}>Review slowest stage</button><button type="button" className="primary" onClick={() => (outlierProjects[0] || projectRows[0]) && navigate(`/analytics/projects/${(outlierProjects[0] || projectRows[0]).projectId}`)} disabled={!projectRows.length}>Open highest latency project</button></footer>
            </aside>
          </section>

          <section className="stage-performance-grid" aria-label="Stage performance summary">
            {visibleStages.map((stage) => (
              <article id={`stage-${stage.key}`} key={stage.key} className={`stage-performance-card ${stage.key} ${stage.isProcess ? "process" : ""}`}>
                <header><div><span>{stage.isProcess ? "Full lifecycle" : "Fabrication stage"}</span><h3>{stage.label}</h3><p>{stage.rangeLabel}</p></div><em>{stage.count} analyzed</em></header>
                <strong className="stage-average">{formatDuration(stage.avgHours)}</strong><span className="stage-average-label">Average duration</span>
                <div className="stage-stat-strip"><span>Typical <strong>{formatDuration(stage.medianHours)}</strong></span><span>Fastest <strong>{formatDuration(stage.minHours)}</strong></span><span>Slowest <strong>{formatDuration(stage.maxHours)}</strong></span></div>
                <div className="stage-mini-chart"><span>Average duration per {formatBucketUnit(stage.trend?.bucketLabel)}</span><Sparkline points={stage.trend?.points || []} /></div>
                <Distribution distribution={stage.distribution} median={stage.medianHours} />
              </article>
            ))}
          </section>

          <section className="performance-detail-grid">
            <article className="project-duration-card">
              <header><div><span>Project telemetry</span><h2>Project Durations</h2><p>{projectRows.length} measured projects in the selected range</p></div><em>Showing {paginatedProjects.length} of {filteredProjects.length}</em></header>
              <div className="performance-table-controls"><input type="search" placeholder="Search project, order ID, client, or status…" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }} /><select value={effectiveStatusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }}>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
              {!projectRows.length ? <div className="empty-state">No project durations found.</div> : !filteredProjects.length ? <div className="empty-state">No projects match these filters.</div> : (
                <div className="table-scroll admin-data-table-scroll admin-data-table-scroll--embedded"><table className="admin-data-table admin-data-table--interactive" style={{ "--admin-table-min-width": "820px" }}><thead><tr><th>Project / order</th><th>Status</th><th>End-to-end</th><th>Mockup</th><th>Production</th><th>Packaging</th><th>Action</th></tr></thead><tbody>{paginatedProjects.map((row) => <tr key={row.projectId} className={selectedProject?.projectId === row.projectId ? "is-selected" : ""} onClick={() => setSelectedProjectId(row.projectId)}><td data-label="Project" data-table-primary="true"><div className="project-cell admin-table-identity"><span className="project-id admin-table-code">#{row.orderId || row.projectId.slice(-6).toUpperCase()}</span><span className="project-name admin-table-title">{renderProjectName(row.projectName, row.projectIndicator, "Untitled Project")}</span><small>{row.client || "Client not recorded"}</small></div></td><td data-label="Status"><span className={`admin-table-status ${getTableStatusTone(row.status)}`}>{row.status}</span></td><td data-label="End-to-end"><span className="admin-table-metric-value">{formatDuration(row.endToEnd?.hours)}</span></td><td data-label="Mockup">{formatDuration(row.stages.mockup?.hours)}</td><td data-label="Production">{formatDuration(row.stages.production?.hours)}</td><td data-label="Packaging">{formatDuration(row.stages.packaging?.hours)}</td><td data-label="Action"><button type="button" className="open-analysis-button" onClick={(event) => { event.stopPropagation(); navigate(`/analytics/projects/${row.projectId}`); }}>Open</button></td></tr>)}</tbody></table></div>
              )}
              <nav className="performance-pagination"><span>Page {activePage} of {totalPages}</span><div><button type="button" disabled={activePage === 1} onClick={() => setCurrentPage(Math.max(1, activePage - 1))}>Previous</button><button type="button" disabled={activePage === totalPages} onClick={() => setCurrentPage(Math.min(totalPages, activePage + 1))}>Next</button></div></nav>
            </article>

            <aside className="selected-project-analytics">
              {selectedProject ? <><header><span>Selected project</span><h2>{renderProjectName(selectedProject.projectName, selectedProject.projectIndicator, "Untitled Project")}</h2><p>Order #{selectedProject.orderId || selectedProject.projectId.slice(-6).toUpperCase()} · {selectedProject.client || "Client not recorded"}</p></header><div className="selected-project-kpis"><article><span>End-to-end cycle</span><strong>{formatDuration(selectedProject.endToEnd?.hours)}</strong><small>{selectedProject.status}</small></article><article className="danger"><span>Longest measured stage</span><strong>{Object.entries(selectedProject.stages || {}).sort(([, left], [, right]) => (right?.hours || 0) - (left?.hours || 0))[0]?.[0] || "Not available"}</strong><small>{formatDuration(Object.entries(selectedProject.stages || {}).sort(([, left], [, right]) => (right?.hours || 0) - (left?.hours || 0))[0]?.[1]?.hours)}</small></article></div><div className="selected-stage-list">{["mockup", "production", "packaging"].map((key) => <div key={key}><span>{key}</span><strong>{formatDuration(selectedProject.stages?.[key]?.hours)}</strong></div>)}</div><button type="button" className="selected-project-open" onClick={() => navigate(`/analytics/projects/${selectedProject.projectId}`)}>Open full project analysis</button></> : <div className="empty-state">Select a project to inspect its stage durations.</div>}
            </aside>
          </section>

          <footer className="analytics-method-note"><strong>Measurement methodology</strong><span>Durations are calculated from actual project status-change timestamps. Blank values indicate that a stage has not completed within the selected reporting range.</span></footer>
        </>
      )}
    </div>
  );
};

export default PerformanceAnalytics;

