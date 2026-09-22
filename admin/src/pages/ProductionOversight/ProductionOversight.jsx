import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatProjectDisplayName } from "../../utils/projectName";
import "./ProductionOversight.css";

const EMPTY_DATA = {
  asOf: null,
  summary: {
    total: 0,
    queued: 0,
    inProgress: 0,
    atRisk: 0,
    overdue: 0,
    unassigned: 0,
  },
  projects: [],
};

const FILTERS = [
  { key: "all", label: "All Active", summaryKey: "total", tone: "blue" },
  { key: "queued", label: "Queued", summaryKey: "queued", tone: "slate" },
  {
    key: "in_progress",
    label: "In Progress",
    summaryKey: "inProgress",
    tone: "cyan",
  },
  { key: "at_risk", label: "At Risk", summaryKey: "atRisk", tone: "amber" },
  { key: "overdue", label: "Overdue", summaryKey: "overdue", tone: "red" },
];

const RISK_META = {
  overdue: { label: "Overdue", tone: "red" },
  at_risk: { label: "At Risk", tone: "amber" },
  deadline_required: { label: "Deadline Required", tone: "violet" },
  attention: { label: "Attention", tone: "amber" },
  on_track: { label: "On Track", tone: "green" },
  not_started: { label: "Not Calculated", tone: "slate" },
};

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Accra",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatPerson = (person) => {
  if (!person) return "Unassigned";
  if (typeof person === "string") return person;
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    person.name ||
    person.employeeId ||
    "Unassigned"
  );
};

const formatMinutes = (value) => {
  const minutes = Math.max(0, Math.round(Number(value) || 0));
  if (!minutes) return "Not calculated";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

const formatCountdown = (value, nowMs) => {
  const date = toDate(value);
  if (!date) return "Delivery deadline needed";
  const totalMinutes = Math.ceil((date.getTime() - nowMs) / 60000);
  const overdue = totalMinutes < 0;
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const duration = hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  return overdue ? `${duration} overdue` : `${duration} remaining`;
};

const getSearchValue = (project) => {
  const workstreams = (project?.productionTracking?.workstreams || [])
    .map((entry) => entry?.department)
    .filter(Boolean)
    .join(" ");
  return [
    project?.orderId,
    formatProjectDisplayName(project?.details),
    project?.details?.client,
    formatPerson(project?.productionOwnerId),
    formatPerson(project?.projectLeadId),
    workstreams,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const matchesFilter = (project, filter) => {
  const riskLevel = project?.productionTracking?.riskLevel || "not_started";
  if (filter === "queued") return project?.status === "Pending Production";
  if (filter === "in_progress") {
    return project?.status === "Production In Progress";
  }
  if (filter === "at_risk") return riskLevel === "at_risk";
  if (filter === "overdue") return riskLevel === "overdue";
  return true;
};

const ProductionOversight = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const {
    data = EMPTY_DATA,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["projects", "production", "overview"],
    queryFn: async () => {
      const response = await fetch("/api/projects/production/overview", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Production overview could not be loaded.");
      }
      return {
        ...EMPTY_DATA,
        ...payload,
        summary: { ...EMPTY_DATA.summary, ...(payload.summary || {}) },
        projects: Array.isArray(payload.projects) ? payload.projects : [],
      };
    },
    refetchInterval: 60000,
    meta: { realtimePaths: ["/api/projects"] },
  });

  const visibleProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return data.projects.filter(
      (project) =>
        matchesFilter(project, activeFilter) &&
        (!normalizedSearch || getSearchValue(project).includes(normalizedSearch)),
    );
  }, [activeFilter, data.projects, search]);

  return (
    <div className="production-oversight-page">
      <header className="production-oversight-hero">
        <div>
          <span className="production-oversight-eyebrow">Operations control</span>
          <h1>Production Oversight</h1>
          <p>
            Monitor every queued and active Production job, its owner, deadline,
            forecast, and current delivery risk.
          </p>
        </div>
        <div className="production-oversight-refresh">
          <span>Last refreshed</span>
          <strong>{data.asOf ? formatDateTime(data.asOf) : "Waiting for data"}</strong>
          <button type="button" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </header>

      <section className="production-oversight-summary" aria-label="Production summary">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`production-summary-card ${filter.tone} ${
              activeFilter === filter.key ? "active" : ""
            }`}
            onClick={() => setActiveFilter(filter.key)}
          >
            <span>{filter.label}</span>
            <strong>{data.summary[filter.summaryKey] || 0}</strong>
            <small>
              {filter.key === "all"
                ? `${data.summary.unassigned || 0} unassigned`
                : "View jobs"}
            </small>
          </button>
        ))}
      </section>

      <section className="production-oversight-workspace">
        <div className="production-oversight-toolbar">
          <div>
            <strong>{visibleProjects.length} jobs</strong>
            <span>Risk-prioritized, then ordered by production deadline</span>
          </div>
          <label>
            <span className="sr-only">Search Production jobs</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search project, client, owner, or workstream"
            />
          </label>
        </div>

        {isPending ? (
          <div className="production-oversight-state">Loading Production workload…</div>
        ) : isError ? (
          <div className="production-oversight-state error">
            <strong>Production oversight could not be loaded.</strong>
            <button type="button" onClick={() => refetch()}>Try again</button>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="production-oversight-state">
            <strong>No Production jobs match this view.</strong>
            <span>Try another filter or clear the search.</span>
          </div>
        ) : (
          <div className="production-oversight-list">
            {visibleProjects.map((project) => {
              const tracking = project.productionTracking || {};
              const risk = RISK_META[tracking.riskLevel] || RISK_META.not_started;
              const inProgress = project.status === "Production In Progress";
              const workstreams = (tracking.workstreams || [])
                .map((entry) => entry?.department)
                .filter(Boolean);

              return (
                <article
                  key={project._id}
                  className={`production-oversight-job risk-${risk.tone}`}
                >
                  <div className="production-job-identity">
                    <div className="production-job-tags">
                      <span className="production-order-id">
                        {project.orderId || "Order pending"}
                      </span>
                      <span className={`production-execution ${inProgress ? "active" : "queued"}`}>
                        {inProgress ? "In Progress" : "Queued"}
                      </span>
                      <span className={`production-risk ${risk.tone}`}>{risk.label}</span>
                    </div>
                    <h2>{formatProjectDisplayName(project.details)}</h2>
                    <p>{project.details?.client || "Client not provided"}</p>
                    {workstreams.length > 0 && (
                      <div className="production-workstreams">
                        {workstreams.slice(0, 4).map((workstream) => (
                          <span key={workstream}>{workstream.replace(/-/g, " ")}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="production-job-people">
                    <div>
                      <span>Production owner</span>
                      <strong className={!project.productionOwnerId ? "unassigned" : ""}>
                        {formatPerson(project.productionOwnerId)}
                      </strong>
                    </div>
                    <div>
                      <span>Project lead</span>
                      <strong>{formatPerson(project.projectLeadId)}</strong>
                    </div>
                  </div>

                  <div className="production-job-metrics">
                    <div>
                      <span>Production deadline</span>
                      <strong>{formatDateTime(tracking.productionDueAt)}</strong>
                      <small>{formatCountdown(tracking.productionDueAt, nowMs)}</small>
                    </div>
                    <div>
                      <span>Predicted completion</span>
                      <strong>{formatDateTime(tracking.predictedCompletionAt)}</strong>
                      <small>
                        {tracking.totalQuantity || 0} items · {formatMinutes(tracking.estimatedProductionMinutes)} estimate
                      </small>
                    </div>
                  </div>

                  <div className="production-job-action">
                    {Array.isArray(tracking.riskReasons) && tracking.riskReasons[0] && (
                      <p>{tracking.riskReasons[0]}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${project._id}`)}
                    >
                      Open project <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ProductionOversight;
