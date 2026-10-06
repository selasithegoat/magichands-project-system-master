import React, { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getDepartmentLabel } from "@client/constants/departments";
import { openDeliveryCalendar } from "@client/utils/deliveryCalendar";
import "./Deadlines.css";

const BUSINESS_TIME_ZONE = "Africa/Accra";
const EMPTY_RESPONSE = {
  asOf: null,
  businessDate: null,
  summary: {
    totalProjects: 0,
    totalOrders: 0,
    todayProjects: 0,
    todayOrders: 0,
    overdueProjects: 0,
    overdueOrders: 0,
    nextSevenDaysProjects: 0,
    nextSevenDaysOrders: 0,
    unassignedProjects: 0,
    quoteProjects: 0,
  },
  filterOptions: {
    leads: [],
    statuses: [],
    projectTypes: [],
    priorities: [],
  },
  pagination: { page: 1, limit: 25, total: 0, totalOrders: 0, totalPages: 1 },
  rows: [],
};

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const toDateKey = (value = new Date()) => {
  const parts = dateKeyFormatter.formatToParts(value).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const addDaysToDateKey = (dateKey, days) => {
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const formatDate = (value, options = {}) => {
  if (!value) return "Not scheduled";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not scheduled";
  return parsed.toLocaleDateString("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
};

const formatTime = (row) => {
  if (row?.deliveryTime) return row.deliveryTime;
  return "End of day";
};

const formatRelativeDeadline = (row) => {
  const hours = Number(row?.hoursUntilDue);
  if (!Number.isFinite(hours)) return "";
  const absoluteHours = Math.abs(hours);
  const days = Math.floor(absoluteHours / 24);
  const remainingHours = Math.max(1, Math.round(absoluteHours % 24));
  const duration = days > 0 ? `${days}d ${remainingHours}h` : `${Math.max(1, Math.round(absoluteHours))}h`;
  return row.isOverdue ? `Overdue by ${duration}` : `Due in ${duration}`;
};

const getDeadlineTone = (row) => {
  if (row?.isOverdue) return "overdue";
  if (row?.isUrgent) return "urgent";
  if (row?.projectType === "Quote") return "quote";
  return "normal";
};

const getDateGroupLabel = (row) => {
  if (row?.isToday) return "Today";
  return formatDate(row?.dueAt, { weekday: "long" });
};

const buildGroups = (rows, groupBy) => {
  if (groupBy === "none") return [{ key: "all", label: "", rows }];
  const groups = new Map();
  rows.forEach((row) => {
    let key = row.orderId || row.projectId;
    let label = `Order ${row.orderId || "Unassigned"}`;
    if (groupBy === "lead") {
      key = row.projectLead?.id || "unassigned";
      label = row.projectLead?.name || "Unassigned";
    }
    if (groupBy === "date") {
      key = toDateKey(new Date(row.dueAt));
      label = getDateGroupLabel(row);
    }
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key).rows.push(row);
  });
  return Array.from(groups.values());
};

const DeadlineMetricIcon = ({ type }) => {
  const paths = {
    portfolio: <><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    overdue: <><path d="M12 4 3 20h18Z" /><path d="M12 9v4M12 17h.01" /></>,
    today: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    week: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    coverage: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="10" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">{paths[type] || paths.portfolio}</svg>;
};

const SummaryCard = ({ tone, icon, value, label, unit, detail, meta, progress, onClick, active }) => (
  <button
    type="button"
    className={`deadline-summary-card ${tone} ${active ? "active" : ""}`}
    onClick={onClick}
  >
    <span className="deadline-summary-icon"><DeadlineMetricIcon type={icon} /></span>
    {meta && <span className="deadline-summary-meta">{meta}</span>}
    <span className="deadline-summary-label">{label}</span>
    <div><strong>{value}</strong><small>{unit}</small></div>
    <span className="deadline-summary-foot">{detail}</span>
    <span className="deadline-summary-track"><span style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }} /></span>
  </button>
);

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const getInitials = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "--";

const Deadlines = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(initialSearch);
  const deferredSearch = useDeferredValue(searchInput.trim());
  const [expandedRows, setExpandedRows] = useState({});

  const scope = searchParams.get("scope") || "today";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const lead = searchParams.get("lead") || "";
  const status = searchParams.get("status") || "";
  const projectType = searchParams.get("projectType") || "";
  const priority = searchParams.get("priority") || "";
  const sort = searchParams.get("sort") || "deadline-asc";
  const groupBy = searchParams.get("groupBy") || "order";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10));

  const updateParams = (updates, { keepPage = false } = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    });
    if (!keepPage) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const choosePreset = (nextScope) => {
    const today = toDateKey();
    if (nextScope === "tomorrow") {
      const tomorrow = addDaysToDateKey(today, 1);
      updateParams({ scope: "range", from: tomorrow, to: tomorrow });
      return;
    }
    if (nextScope === "week") {
      updateParams({ scope: "range", from: today, to: addDaysToDateKey(today, 6) });
      return;
    }
    updateParams({ scope: nextScope, from: "", to: "" });
  };

  const requestParams = useMemo(() => {
    const params = new URLSearchParams({
      source: "admin",
      scope,
      sort,
      page: String(page),
      limit: "25",
    });
    if (scope === "range" && from) params.set("from", from);
    if (scope === "range" && to) params.set("to", to);
    if (lead) params.set("lead", lead);
    if (status) params.set("status", status);
    if (projectType) params.set("projectType", projectType);
    if (priority) params.set("priority", priority);
    if (deferredSearch) params.set("search", deferredSearch);
    return params.toString();
  }, [deferredSearch, from, lead, page, priority, projectType, scope, sort, status, to]);

  const { data = EMPTY_RESPONSE, isPending, isFetching, error } = useQuery({
    queryKey: ["projects", "deadlines", "admin", requestParams],
    queryFn: async () => {
      const response = await fetch(`/api/projects/deadlines?${requestParams}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load deadlines.");
      }
      return {
        ...EMPTY_RESPONSE,
        ...payload,
        summary: { ...EMPTY_RESPONSE.summary, ...(payload?.summary || {}) },
        filterOptions: {
          ...EMPTY_RESPONSE.filterOptions,
          ...(payload?.filterOptions || {}),
        },
        pagination: {
          ...EMPTY_RESPONSE.pagination,
          ...(payload?.pagination || {}),
        },
        rows: Array.isArray(payload?.rows) ? payload.rows : [],
      };
    },
    meta: { realtimePaths: ["/api/projects"] },
  });

  const rows = useMemo(
    () => (Array.isArray(data.rows) ? data.rows : []),
    [data.rows],
  );
  const groups = useMemo(() => buildGroups(rows, groupBy), [groupBy, rows]);
  const summary = data.summary || EMPTY_RESPONSE.summary;
  const options = data.filterOptions || EMPTY_RESPONSE.filterOptions;
  const pagination = data.pagination || EMPTY_RESPONSE.pagination;
  const coveragePercent = summary.totalProjects
    ? Math.round(
        ((summary.totalProjects - summary.overdueProjects) / summary.totalProjects) *
          1000,
      ) / 10
    : 100;
  const currentUrgency = useMemo(() => {
    const overdue = rows.filter((row) => row.isOverdue).length;
    const urgent = rows.filter((row) => row.isUrgent && !row.isOverdue).length;
    const ready = rows.filter((row) => row.readiness?.key === "ready").length;
    return {
      overdue,
      urgent,
      ready,
      onTrack: Math.max(0, rows.length - overdue - urgent - ready),
    };
  }, [rows]);
  const leadWorkload = useMemo(() => {
    const leads = new Map();
    rows.forEach((row) => {
      const name = row.projectLead?.name || "Unassigned";
      const current = leads.get(name) || {
        name,
        count: 0,
        overdue: 0,
        urgent: 0,
      };
      current.count += 1;
      if (row.isOverdue) current.overdue += 1;
      else if (row.isUrgent) current.urgent += 1;
      leads.set(name, current);
    });
    return Array.from(leads.values())
      .sort((left, right) => right.overdue - left.overdue || right.urgent - left.urgent || right.count - left.count)
      .slice(0, 5);
  }, [rows]);
  const attentionRows = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            row.isOverdue ||
            row.isUrgent ||
            ["blocked", "at-risk", "unassigned"].includes(row.readiness?.key),
        )
        .slice(0, 3),
    [rows],
  );
  const activeFilterCount = [lead, status, projectType, priority, deferredSearch].filter(
    Boolean,
  ).length;
  const asOfLabel = data.asOf
    ? new Date(data.asOf).toLocaleString("en-GB", {
        timeZone: BUSINESS_TIME_ZONE,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Live";

  const clearFilters = () => {
    setSearchInput("");
    updateParams({
      search: "",
      lead: "",
      status: "",
      projectType: "",
      priority: "",
      sort: "deadline-asc",
      groupBy: "order",
    });
  };

  const handleExportCsv = () => {
    const csvRows = [
      [
        "Order",
        "Project",
        "Client",
        "Deadline",
        "Lead",
        "Status",
        "Readiness",
        "Priority",
        "Departments",
      ],
      ...rows.map((row) => [
        row.orderId,
        row.projectName,
        row.client,
        `${formatDate(row.dueAt)} ${formatTime(row)}`,
        row.projectLead?.name || "Unassigned",
        row.status,
        row.readiness?.label || "In progress",
        row.priority,
        (row.departments || []).map(getDepartmentLabel).join(" / "),
      ]),
    ];
    const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `deadline-intelligence-${toDateKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const toggleExpanded = (projectId) => {
    setExpandedRows((current) => ({
      ...current,
      [projectId]: !current[projectId],
    }));
  };

  const openProject = (event, projectId) => {
    event.stopPropagation();
    navigate(`/projects/${projectId}`);
  };

  const openOrder = (event, orderId) => {
    event.stopPropagation();
    navigate(`/projects/orders/${encodeURIComponent(orderId)}`);
  };

  return (
    <div className="deadline-intelligence-page">
      <header className="deadline-hero">
        <div>
          <div className="deadline-title-line">
            <h1>Deadline Intelligence &amp; Delivery Control</h1>
            <span>Live operational data</span>
          </div>
          <p>
            Delivery urgency, commitment status, and floor allocation across all
            active projects and production orders.
          </p>
        </div>
        <div className="deadline-hero-actions">
          <span className="deadline-as-of">As of {asOfLabel} · Accra</span>
          <button type="button" onClick={openDeliveryCalendar} aria-haspopup="dialog">
            <DeadlineMetricIcon type="week" /> Calendar
          </button>
          <button type="button" onClick={handleExportCsv}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg>
            Export CSV
          </button>
          <button type="button" className="primary" onClick={() => choosePreset("overdue")}>
            Review critical deadlines
          </button>
        </div>
      </header>

      <section className="deadline-summary-grid" aria-label="Deadline summary">
        <SummaryCard
          tone="indigo"
          icon="portfolio"
          label="Portfolio deadlines"
          value={summary.totalOrders}
          unit="active orders"
          detail={`${summary.totalProjects} scheduled projects`}
          meta={`${summary.quoteProjects} quotes`}
          progress={100}
          active={scope === "all"}
          onClick={() => choosePreset("all")}
        />
        <SummaryCard
          tone="red"
          icon="overdue"
          label="Overdue commitments"
          value={summary.overdueOrders}
          unit="orders"
          detail={`${summary.overdueProjects} projects require attention`}
          meta="Critical"
          progress={summary.totalProjects ? (summary.overdueProjects / summary.totalProjects) * 100 : 0}
          active={scope === "overdue"}
          onClick={() => choosePreset("overdue")}
        />
        <SummaryCard
          tone="amber"
          icon="today"
          label="Due today"
          value={summary.todayOrders}
          unit="orders"
          detail={`${summary.todayProjects} projects scheduled today`}
          meta={`${summary.unassignedProjects} unassigned`}
          progress={summary.totalProjects ? (summary.todayProjects / summary.totalProjects) * 100 : 0}
          active={scope === "today"}
          onClick={() => choosePreset("today")}
        />
        <SummaryCard
          tone="blue"
          icon="week"
          label="Next 7 days"
          value={summary.nextSevenDaysOrders}
          unit="orders"
          detail={`${summary.nextSevenDaysProjects} projects in the window`}
          meta="7-day horizon"
          progress={summary.totalProjects ? (summary.nextSevenDaysProjects / summary.totalProjects) * 100 : 0}
          active={scope === "range" && from === toDateKey()}
          onClick={() => choosePreset("week")}
        />
        <SummaryCard
          tone="green"
          icon="coverage"
          label="On-time coverage"
          value={`${coveragePercent}%`}
          unit="portfolio"
          detail={`${summary.totalProjects - summary.overdueProjects} projects remain on time`}
          meta={summary.overdueProjects ? `${summary.overdueProjects} overdue` : "All clear"}
          progress={coveragePercent}
          active={false}
          onClick={() => choosePreset("all")}
        />
      </section>

      {(summary.overdueProjects > 0 || summary.unassignedProjects > 0) && (
        <section className="deadline-risk-banner" aria-label="Urgent delivery risk">
          <span className="deadline-risk-icon"><DeadlineMetricIcon type="overdue" /></span>
          <div>
            <strong>Urgent delivery risks require review</strong>
            <span>
              {summary.overdueProjects} overdue projects and {summary.unassignedProjects}{" "}
              unassigned commitments are currently visible in the portfolio.
            </span>
          </div>
          <div>
            <button type="button" onClick={() => choosePreset("overdue")}>Review overdue</button>
            <button type="button" className="primary" onClick={() => updateParams({ lead: "unassigned" })}>Review unassigned</button>
          </div>
        </section>
      )}

      <section className="deadline-workspace">
        <div className="deadline-presets" aria-label="Date presets">
          <span className="deadline-presets-label">View</span>
          <button className={scope === "today" ? "active" : ""} onClick={() => choosePreset("today")}>Today <span>{summary.todayOrders}</span></button>
          <button
            className={
              scope === "range" &&
              from === addDaysToDateKey(toDateKey(), 1) &&
              to === from
                ? "active"
                : ""
            }
            onClick={() => choosePreset("tomorrow")}
          >
            Tomorrow
          </button>
          <button className={scope === "overdue" ? "active danger" : ""} onClick={() => choosePreset("overdue")}>Overdue <span>{summary.overdueOrders}</span></button>
          <button
            className={scope === "range" && from === toDateKey() && to === addDaysToDateKey(toDateKey(), 6) ? "active" : ""}
            onClick={() => choosePreset("week")}
          >
            Next 7 days <span>{summary.nextSevenDaysOrders}</span>
          </button>
          <button className={scope === "all" ? "active" : ""} onClick={() => choosePreset("all")}>All active</button>
          <div className="deadline-custom-range">
            <input
              type="date"
              aria-label="Deadline range start"
              value={from}
              onChange={(event) =>
                updateParams({
                  scope: "range",
                  from: event.target.value,
                  to: to || event.target.value,
                })
              }
            />
            <span>to</span>
            <input
              type="date"
              aria-label="Deadline range end"
              value={to}
              onChange={(event) =>
                updateParams({
                  scope: "range",
                  from: from || event.target.value,
                  to: event.target.value,
                })
              }
            />
          </div>
        </div>

        <div className="deadline-filter-grid">
          <label className="deadline-search-field">
            <span>Search</span>
            <input
              type="search"
              placeholder="Order, project, client or lead"
              value={searchInput}
              onChange={(event) => {
                const value = event.target.value;
                setSearchInput(value);
                updateParams({ search: value });
              }}
            />
          </label>
          <label>
            <span>Project lead</span>
            <select value={lead} onChange={(event) => updateParams({ lead: event.target.value })}>
              <option value="">All leads</option>
              <option value="unassigned">Unassigned</option>
              {(options.leads || []).map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => updateParams({ status: event.target.value })}>
              <option value="">All statuses</option>
              {(options.statuses || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Project type</span>
            <select value={projectType} onChange={(event) => updateParams({ projectType: event.target.value })}>
              <option value="">All types</option>
              {(options.projectTypes || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select value={priority} onChange={(event) => updateParams({ priority: event.target.value })}>
              <option value="">All priorities</option>
              {(options.priorities || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => updateParams({ sort: event.target.value })}>
              <option value="deadline-asc">Deadline: earliest</option>
              <option value="deadline-desc">Deadline: latest</option>
              <option value="lead-asc">Lead: A–Z</option>
              <option value="lead-desc">Lead: Z–A</option>
              <option value="urgency">Urgency first</option>
              <option value="updated-desc">Recently updated</option>
            </select>
          </label>
          <label>
            <span>Group by</span>
            <select value={groupBy} onChange={(event) => updateParams({ groupBy: event.target.value })}>
              <option value="order">Order</option>
              <option value="lead">Project lead</option>
              <option value="date">Deadline date</option>
              <option value="none">No grouping</option>
            </select>
          </label>
          {activeFilterCount > 0 && (
            <button type="button" className="deadline-clear-filters" onClick={clearFilters}>
              Reset {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
            </button>
          )}
        </div>

        <div className="deadline-results-header">
          <div>
            <strong>Delivery commitments</strong>
            <span>{pagination.totalOrders} orders · {pagination.total} matching projects</span>
          </div>
          <span className="deadline-results-context">
            {groupBy === "order" ? "Grouped by order" : groupBy === "lead" ? "Grouped by lead" : groupBy === "date" ? "Grouped by date" : "Ungrouped"}
            {isFetching && !isPending && <b className="deadline-refreshing">Refreshing…</b>}
          </span>
        </div>

        {isPending ? (
          <div className="deadline-state">Loading deadline intelligence…</div>
        ) : error ? (
          <div className="deadline-state error">{error.message}</div>
        ) : rows.length === 0 ? (
          <div className="deadline-state">
            <strong>No deadlines match this view.</strong>
            <span>Try another date range or clear one of the filters.</span>
          </div>
        ) : (
          <div className="deadline-groups">
            {groups.map((group) => (
              <section className="deadline-result-group" key={group.key}>
                {group.label && (
                  <header>
                    <div><strong>{group.label}</strong><span>{group.rows.length} project{group.rows.length === 1 ? "" : "s"}</span></div>
                    {groupBy === "order" && group.rows[0]?.client && <small>{group.rows[0].client}</small>}
                  </header>
                )}
                <div className="deadline-table-wrap">
                  <table
                    className="deadline-table"
                  >
                    <thead>
                      <tr>
                        <th>Deadline</th>
                        <th>Project</th>
                        <th>Client</th>
                        <th>Project lead</th>
                        <th>Stage</th>
                        <th>Readiness</th>
                        <th aria-label="Actions"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => {
                        const expanded = Boolean(expandedRows[row.projectId]);
                        const tone = getDeadlineTone(row);
                        return (
                          <React.Fragment key={row.projectId}>
                            <tr
                              className={`deadline-row ${tone} ${expanded ? "expanded" : ""}`}
                              onClick={() => toggleExpanded(row.projectId)}
                            >
                              <td data-label="Deadline">
                                <div className="deadline-date-cell">
                                  <span className={`deadline-tone-dot ${tone}`}></span>
                                  <div>
                                    <strong>{formatDate(row.dueAt)}</strong>
                                    <span>{formatTime(row)} · {formatRelativeDeadline(row)}</span>
                                  </div>
                                </div>
                              </td>
                              <td data-label="Project" data-table-primary="true">
                                <div className="deadline-project-cell">
                                  <strong>{row.projectName}</strong>
                                  <span>
                                    {row.orderId}
                                    <b className={`deadline-type-badge ${row.projectType === "Quote" ? "quote" : ""}`}>{row.projectType}</b>
                                  </span>
                                </div>
                              </td>
                              <td data-label="Client">{row.client}</td>
                              <td data-label="Project lead">
                                <div className="deadline-lead-cell">
                                  <strong>{row.projectLead?.name || "Unassigned"}</strong>
                                  {row.assistantLead?.name && <span>with {row.assistantLead.name}</span>}
                                </div>
                              </td>
                              <td data-label="Stage"><span className="deadline-status-pill">{row.status}</span></td>
                              <td data-label="Readiness">
                                <span className={`deadline-readiness ${row.readiness?.key || "in-progress"}`}>{row.readiness?.label || "In progress"}</span>
                              </td>
                              <td className="deadline-row-action">
                                <button type="button" aria-label={expanded ? "Collapse deadline details" : "Expand deadline details"} onClick={(event) => { event.stopPropagation(); toggleExpanded(row.projectId); }}>
                                  {expanded ? "−" : "+"}
                                </button>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="deadline-detail-row">
                                <td colSpan="7">
                                  <div className="deadline-detail-grid">
                                    <div>
                                      <span>Delivery</span>
                                      <strong>{formatDate(row.dueAt)} at {formatTime(row)}</strong>
                                      <small>{row.deliveryLocation || "No delivery location recorded"}</small>
                                    </div>
                                    <div>
                                      <span>Production scope</span>
                                      <strong>{row.itemCount} item lines · {row.totalQuantity} units</strong>
                                      <small>{row.departments.length ? row.departments.map(getDepartmentLabel).join(" · ") : "No departments assigned"}</small>
                                    </div>
                                    <div>
                                      <span>Operational signal</span>
                                      <strong>{row.readiness?.label || "In progress"}</strong>
                                      <small>{row.readiness?.reason || row.status}</small>
                                    </div>
                                    <div>
                                      <span>Challenges</span>
                                      <strong>{row.openChallengeCount} open</strong>
                                      <small>{row.openChallenges?.map((challenge) => challenge.title).join(" · ") || "No open challenges"}</small>
                                    </div>
                                  </div>
                                  <div className="deadline-detail-actions">
                                    {row.isGroupOrder && (
                                      <button type="button" onClick={(event) => openOrder(event, row.orderId)}>Open Group</button>
                                    )}
                                    <button type="button" className="primary" onClick={(event) => openProject(event, row.projectId)}>Open Project</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <nav className="deadline-pagination" aria-label="Deadline pages">
            <button type="button" disabled={pagination.page <= 1} onClick={() => updateParams({ page: pagination.page - 1 }, { keepPage: true })}>Previous</button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => updateParams({ page: pagination.page + 1 }, { keepPage: true })}>Next</button>
          </nav>
        )}
      </section>

      {rows.length > 0 && (
        <section className="deadline-operations-footer">
          <div className="deadline-allocation-panel">
            <header>
              <div>
                <span>Current view</span>
                <h2>Urgency Allocation &amp; Floor SLA Meter</h2>
              </div>
              <small>Based on {rows.length} visible commitments</small>
            </header>
            <div className="deadline-allocation-bar" aria-label="Urgency allocation">
              <span className="overdue" style={{ width: `${(currentUrgency.overdue / rows.length) * 100}%` }} />
              <span className="urgent" style={{ width: `${(currentUrgency.urgent / rows.length) * 100}%` }} />
              <span className="track" style={{ width: `${(currentUrgency.onTrack / rows.length) * 100}%` }} />
              <span className="ready" style={{ width: `${(currentUrgency.ready / rows.length) * 100}%` }} />
            </div>
            <div className="deadline-allocation-legend">
              <span><i className="overdue" />{currentUrgency.overdue} overdue</span>
              <span><i className="urgent" />{currentUrgency.urgent} urgent</span>
              <span><i className="track" />{currentUrgency.onTrack} on track</span>
              <span><i className="ready" />{currentUrgency.ready} ready</span>
            </div>
            <div className="deadline-attention-grid">
              {attentionRows.length > 0 ? attentionRows.map((row) => (
                <button type="button" key={row.projectId} onClick={(event) => openProject(event, row.projectId)}>
                  <span>{row.readiness?.label || "Attention"}</span>
                  <strong>{row.projectName}</strong>
                  <small>{row.orderId} · {row.projectLead?.name || "Unassigned"}</small>
                </button>
              )) : (
                <div className="deadline-all-clear">
                  <DeadlineMetricIcon type="coverage" />
                  <strong>No visible commitments require escalation.</strong>
                </div>
              )}
            </div>
          </div>

          <aside className="deadline-leads-panel">
            <header>
              <div><span>Ownership</span><h2>Floor Leads</h2></div>
              <small>{leadWorkload.length} visible</small>
            </header>
            <div>
              {leadWorkload.map((leadRow) => (
                <button
                  type="button"
                  key={leadRow.name}
                  onClick={() => {
                    const option = (options.leads || []).find((entry) => entry.name === leadRow.name);
                    updateParams({ lead: option?.id || (leadRow.name === "Unassigned" ? "unassigned" : "") });
                  }}
                >
                  <span className="deadline-lead-avatar">{getInitials(leadRow.name)}</span>
                  <span><strong>{leadRow.name}</strong><small>{leadRow.count} commitments</small></span>
                  <em className={leadRow.overdue ? "danger" : leadRow.urgent ? "warning" : "success"}>
                    {leadRow.overdue ? `${leadRow.overdue} overdue` : leadRow.urgent ? `${leadRow.urgent} urgent` : "On track"}
                  </em>
                </button>
              ))}
            </div>
          </aside>
        </section>
      )}
    </div>
  );
};

export default Deadlines;
