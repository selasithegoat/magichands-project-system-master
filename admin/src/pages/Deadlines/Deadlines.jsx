import React, { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./Deadlines.css";

const BUSINESS_TIME_ZONE = "Africa/Accra";
const EMPTY_RESPONSE = {
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

const SummaryCard = ({ tone, value, label, detail, onClick, active }) => (
  <button
    type="button"
    className={`deadline-summary-card ${tone} ${active ? "active" : ""}`}
    onClick={onClick}
  >
    <span className="deadline-summary-label">{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </button>
);

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
          <span className="deadline-eyebrow">Operations control</span>
          <h1>Deadline Intelligence</h1>
          <p>
            Delivery and quote deadlines across every active order, calculated in
            Africa/Accra time.
          </p>
        </div>
        <div className="deadline-hero-note">
          <span>Current portfolio</span>
          <strong>{summary.totalOrders} orders</strong>
          <small>{summary.quoteProjects} scheduled quote projects included</small>
        </div>
      </header>

      <section className="deadline-summary-grid" aria-label="Deadline summary">
        <SummaryCard
          tone="red"
          label="Overdue"
          value={summary.overdueOrders}
          detail={`${summary.overdueProjects} projects`}
          active={scope === "overdue"}
          onClick={() => choosePreset("overdue")}
        />
        <SummaryCard
          tone="amber"
          label="Due today"
          value={summary.todayOrders}
          detail={`${summary.todayProjects} projects`}
          active={scope === "today"}
          onClick={() => choosePreset("today")}
        />
        <SummaryCard
          tone="blue"
          label="Next 7 days"
          value={summary.nextSevenDaysOrders}
          detail={`${summary.nextSevenDaysProjects} projects`}
          active={scope === "range" && from === toDateKey()}
          onClick={() => choosePreset("week")}
        />
        <SummaryCard
          tone="slate"
          label="Unassigned"
          value={summary.unassignedProjects}
          detail="Projects needing a lead"
          active={lead === "unassigned"}
          onClick={() =>
            updateParams({
              lead: lead === "unassigned" ? "" : "unassigned",
              scope: lead === "unassigned" ? scope : "all",
              from: lead === "unassigned" ? from : "",
              to: lead === "unassigned" ? to : "",
            })
          }
        />
      </section>

      <section className="deadline-workspace">
        <div className="deadline-presets" aria-label="Date presets">
          <button className={scope === "today" ? "active" : ""} onClick={() => choosePreset("today")}>Today</button>
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
          <button className={scope === "overdue" ? "active danger" : ""} onClick={() => choosePreset("overdue")}>Overdue</button>
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
        </div>

        <div className="deadline-results-header">
          <div>
            <strong>{pagination.totalOrders} orders</strong>
            <span>{pagination.total} matching projects</span>
          </div>
          {isFetching && !isPending && <span className="deadline-refreshing">Refreshing…</span>}
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
                  <table className="deadline-table">
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
                              <td data-label="Project">
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
                                      <small>{row.departments.length ? row.departments.join(" · ") : "No departments assigned"}</small>
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
                                    <button type="button" onClick={(event) => openOrder(event, row.orderId)}>Open order</button>
                                    <button type="button" className="primary" onClick={(event) => openProject(event, row.projectId)}>Open project</button>
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
    </div>
  );
};

export default Deadlines;
