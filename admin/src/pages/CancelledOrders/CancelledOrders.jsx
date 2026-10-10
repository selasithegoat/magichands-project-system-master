import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import usePersistedState from "@client/hooks/usePersistedState";
import ConfirmDialog from "@client/components/ui/ConfirmDialog";
import ProjectReactivateModal from "../../components/ProjectReactivateModal/ProjectReactivateModal";
import { renderProjectName } from "../../utils/projectName";
import "./CancelledOrders.css";

const PAGE_SIZE_OPTIONS = [6, 10, 20];
const DAY_MS = 24 * 60 * 60 * 1000;

const getGroupProjects = (group) =>
  (Array.isArray(group?.projects) ? group.projects : []).slice();

const toTimestamp = (value) => {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatDateTime = (value) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMoney = (value, currency = "GHS") => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not quoted";
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currency || "GHS",
    maximumFractionDigits: 0,
  }).format(amount);
};

const getQuoteAmount = (project) => {
  const amount = Number(project?.quoteDetails?.costVerification?.amount);
  return Number.isFinite(amount) ? amount : null;
};

const getReasonCategory = (reason) => {
  const token = String(reason || "").trim().toLowerCase();
  if (!token) return "No reason provided";
  if (/client|customer|cancel/.test(token)) return "Client cancelled";
  if (/budget|cost|price|payment|fund/.test(token)) return "Budget / cost";
  if (/no response|unresponsive|abandon|ghost|no feedback/.test(token)) {
    return "No response";
  }
  if (/duplicate|internal|mistake|error|test/.test(token)) {
    return "Internal / duplicate";
  }
  return "Other reasons";
};

const getPersonName = (person) => {
  if (!person) return "Not recorded";
  if (typeof person === "string") return "Recorded user";
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    person.name ||
    person.employeeId ||
    "Recorded user"
  );
};

const getFrozenDays = (project) => {
  const cancelledAt = toTimestamp(project?.cancellation?.cancelledAt);
  if (!cancelledAt) return 0;
  return Math.max(0, Math.floor((Date.now() - cancelledAt) / DAY_MS));
};

const MetricIcon = ({ type }) => {
  const paths = {
    archive: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M3 8h18M9 12h6" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></>,
    reason: <><path d="M5 5h14v11H9l-4 3V5Z" /><path d="M9 9h6M9 12h4" /></>,
    restore: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8" /><path d="M4 4v4h4" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      {paths[type] || paths.archive}
    </svg>
  );
};

const CancelledOrders = () => {
  const navigate = useNavigate();
  const {
    data: orderGroups = [],
    error: cancelledOrdersError,
    isPending: loading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["projects", "orders", "admin", "cancelled"],
    queryFn: async () => {
      const res = await fetch(
        "/api/projects/orders?source=admin&collapseRevisions=true&cancelled=true",
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) throw new Error("Failed to load cancelled orders.");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    meta: { realtimePaths: ["/api/projects"] },
  });

  const [searchQuery, setSearchQuery] = usePersistedState(
    "admin-cancelled-orders-search",
    "",
  );
  const [stageFilter, setStageFilter] = usePersistedState(
    "admin-cancelled-orders-stage",
    "all",
  );
  const [reasonFilter, setReasonFilter] = usePersistedState(
    "admin-cancelled-orders-reason",
    "all",
  );
  const [dateRange, setDateRange] = usePersistedState(
    "admin-cancelled-orders-date",
    "all",
  );
  const [activeView, setActiveView] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState([]);
  const [reactivatingId, setReactivatingId] = useState("");
  const [reactivateModalProject, setReactivateModalProject] = useState(null);
  const [reactivateError, setReactivateError] = useState("");
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  const projects = useMemo(
    () =>
      orderGroups
        .flatMap((group) =>
          getGroupProjects(group).map((project) => ({
            ...project,
            groupClient: group?.client || "",
            groupOrderNumber: group?.orderNumber || project?.orderId || "UNASSIGNED",
          })),
        )
        .sort(
          (a, b) =>
            toTimestamp(b?.cancellation?.cancelledAt) -
            toTimestamp(a?.cancellation?.cancelledAt),
        ),
    [orderGroups],
  );

  const stageOptions = useMemo(
    () =>
      Array.from(
        new Set(
          projects
            .map((project) =>
              String(
                project?.cancellation?.resumedStatus || project?.status || "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      ).sort(),
    [projects],
  );

  const reasonSummary = useMemo(() => {
    const counts = new Map();
    projects.forEach((project) => {
      const category = getReasonCategory(project?.cancellation?.reason);
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([label, count]) => ({
        label,
        count,
        percentage: projects.length ? Math.round((count / projects.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const token = searchQuery.trim().toLowerCase();
    const dayLimit = dateRange === "all" ? 0 : Number(dateRange);
    const cutoff = dayLimit ? Date.now() - dayLimit * DAY_MS : 0;

    return projects.filter((project) => {
      const cancellation = project?.cancellation || {};
      const stage = String(cancellation.resumedStatus || project?.status || "");
      const reasonCategory = getReasonCategory(cancellation.reason);
      const ready = Boolean(String(cancellation.resumedStatus || "").trim());
      const searchable = [
        project?.orderId,
        project?.groupOrderNumber,
        renderProjectName(project?.details, null, ""),
        project?.details?.client,
        project?.groupClient,
        cancellation.reason,
        stage,
        getPersonName(cancellation.cancelledBy),
      ].join(" ").toLowerCase();

      if (token && !searchable.includes(token)) return false;
      if (stageFilter !== "all" && stage !== stageFilter) return false;
      if (reasonFilter !== "all" && reasonCategory !== reasonFilter) return false;
      if (cutoff && toTimestamp(cancellation.cancelledAt) < cutoff) return false;
      if (activeView === "ready" && !ready) return false;
      if (activeView === "no-reason" && reasonCategory !== "No reason provided") return false;
      return true;
    });
  }, [activeView, dateRange, projects, reasonFilter, searchQuery, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const pagedProjects = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, page, pageSize]);

  const readyCount = projects.filter((project) =>
    Boolean(String(project?.cancellation?.resumedStatus || "").trim()),
  ).length;
  const namedReasonCount = projects.filter((project) =>
    Boolean(String(project?.cancellation?.reason || "").trim()),
  ).length;
  const preservedHoldCount = projects.filter(
    (project) => project?.cancellation?.resumedHoldState,
  ).length;
  const orderCount = new Set(
    projects.map((project) => project?.groupOrderNumber || project?.orderId).filter(Boolean),
  ).size;
  const quotedValue = projects.reduce(
    (sum, project) => sum + (getQuoteAmount(project) || 0),
    0,
  );
  const averageFrozenDays = projects.length
    ? Math.round(
        projects.reduce((sum, project) => sum + getFrozenDays(project), 0) /
          projects.length,
      )
    : 0;
  const topReason = reasonSummary[0] || { label: "No data", percentage: 0, count: 0 };
  const pageIds = pagedProjects.map((project) => String(project?._id || "")).filter(Boolean);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const selectedProjects = projects.filter((project) =>
    selectedIds.includes(String(project?._id || "")),
  );
  const error = cancelledOrdersError?.message || "";

  useEffect(() => {
    setPage(1);
  }, [activeView, dateRange, pageSize, reasonFilter, searchQuery, stageFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const currentIds = new Set(projects.map((project) => String(project?._id || "")));
    setSelectedIds((current) => current.filter((id) => currentIds.has(id)));
  }, [projects]);

  const resetFilters = () => {
    setSearchQuery("");
    setStageFilter("all");
    setReasonFilter("all");
    setDateRange("all");
    setActiveView("all");
  };

  const toggleSelected = (projectId) => {
    const id = String(projectId || "");
    if (!id) return;
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const togglePageSelection = () => {
    setSelectedIds((current) => {
      if (allPageSelected) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  };

  const handleOpenProject = (projectId) => {
    if (projectId) navigate(`/projects/${projectId}`);
  };

  const closeReactivateModal = () => {
    if (reactivatingId) return;
    setReactivateModalProject(null);
    setReactivateError("");
  };

  const handleOpenReactivateModal = (project) => {
    if (!project?._id || reactivatingId) return;
    setReactivateModalProject(project);
    setReactivateError("");
    setActionNotice("");
  };

  const reactivateProject = async (projectId) => {
    const res = await fetch(`/api/projects/${projectId}/reactivate?source=admin`, {
      method: "PATCH",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Failed to reactivate project.");
    return data;
  };

  const handleReactivate = async () => {
    const projectId = reactivateModalProject?._id;
    if (!projectId || reactivatingId) return;
    setReactivatingId(projectId);
    setReactivateError("");
    try {
      await reactivateProject(projectId);
      setReactivateModalProject(null);
      setActionNotice("Project reactivated and restored to its preserved stage.");
      await refetch();
    } catch (requestError) {
      setReactivateError(requestError.message || "Failed to reactivate project.");
    } finally {
      setReactivatingId("");
    }
  };

  const handleBulkReactivate = async () => {
    if (!selectedProjects.length || reactivatingId) return;
    setBulkDialogOpen(false);
    setReactivatingId("bulk");
    setActionNotice("");
    const results = await Promise.allSettled(
      selectedProjects.map((project) => reactivateProject(project._id)),
    );
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failedCount = results.length - successCount;
    setSelectedIds([]);
    setReactivatingId("");
    setActionNotice(
      failedCount
        ? `${successCount} project${successCount === 1 ? "" : "s"} reactivated; ${failedCount} could not be restored.`
        : `${successCount} project${successCount === 1 ? "" : "s"} reactivated successfully.`,
    );
    await refetch();
  };

  const exportAuditLog = () => {
    const rows = filteredProjects.map((project) => {
      const cancellation = project?.cancellation || {};
      return [
        project?.orderId || project?.groupOrderNumber || "",
        renderProjectName(project?.details, null, "Unnamed Project"),
        project?.details?.client || project?.groupClient || "",
        cancellation.resumedStatus || project?.status || "",
        cancellation.reason || "",
        formatDateTime(cancellation.cancelledAt),
        getPersonName(cancellation.cancelledBy),
        getQuoteAmount(project) ?? "",
      ];
    });
    const csv = [
      ["Order", "Project", "Client", "Frozen Stage", "Cancellation Reason", "Cancelled At", "Cancelled By", "Quoted Value"],
      ...rows,
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cancelled-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const metrics = [
    {
      icon: "archive", tone: "indigo", label: "Total frozen projects", value: projects.length,
      meta: `${orderCount} order${orderCount === 1 ? "" : "s"}`,
      detail: quotedValue ? `${formatMoney(quotedValue)} recorded quote value` : "No verified quote values",
      progress: projects.length ? 100 : 0,
    },
    {
      icon: "clock", tone: "green", label: "Average frozen age", value: `${averageFrozenDays}d`, meta: "Live age",
      detail: "Calculated from cancellation timestamps", progress: Math.min(100, (averageFrozenDays / 90) * 100),
    },
    {
      icon: "reason", tone: "amber", label: "Top cancellation reason", value: topReason.label,
      meta: `${topReason.percentage}% share`, detail: `${topReason.count} project${topReason.count === 1 ? "" : "s"} in this category`, progress: topReason.percentage,
    },
    {
      icon: "restore", tone: "violet", label: "Ready to reactivate", value: readyCount,
      meta: projects.length ? `${Math.round((readyCount / projects.length) * 100)}% ready` : "0% ready",
      detail: "Preserved resume stage is available", progress: projects.length ? (readyCount / projects.length) * 100 : 0,
    },
  ];

  return (
    <div className="cancelled-orders-page">
      <header className="cancelled-orders-header">
        <div>
          <div className="cancelled-orders-title-line">
            <h1>Cancelled Orders &amp; Frozen Pipeline</h1>
            <span>Recovery desk</span>
          </div>
          <p>Cancelled projects remain safely frozen with their production state, cancellation context, and previous workflow position preserved.</p>
        </div>
        <div className="cancelled-orders-header-actions">
          <button type="button" onClick={exportAuditLog} disabled={!filteredProjects.length}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg>
            Export audit log
          </button>
          <button type="button" className="primary" disabled={!selectedProjects.length || Boolean(reactivatingId)} onClick={() => setBulkDialogOpen(true)}>
            Reactivate selected ({selectedProjects.length})
          </button>
        </div>
      </header>

      <section className="cancelled-metrics-grid" aria-label="Cancelled project summary">
        {metrics.map((metric) => (
          <article className={`cancelled-metric-card ${metric.tone}`} key={metric.label}>
            <span className="cancelled-metric-icon"><MetricIcon type={metric.icon} /></span>
            <span className="cancelled-metric-meta">{metric.meta}</span>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
            <div><span style={{ width: `${Math.max(0, Math.min(100, metric.progress))}%` }} /></div>
          </article>
        ))}
      </section>

      {actionNotice && <div className="cancelled-action-notice">{actionNotice}</div>}

      <section className="cancelled-orders-workspace">
        <nav className="cancelled-view-tabs" aria-label="Cancelled project views">
          <button type="button" className={activeView === "all" ? "active" : ""} onClick={() => setActiveView("all")}>All cancelled <span>{projects.length}</span></button>
          <button type="button" className={activeView === "ready" ? "active" : ""} onClick={() => setActiveView("ready")}>Ready to resume <span>{readyCount}</span></button>
          <button type="button" className={activeView === "no-reason" ? "active" : ""} onClick={() => setActiveView("no-reason")}>No reason recorded <span>{projects.length - namedReasonCount}</span></button>
          <button type="button" className="cancelled-refresh-button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Refreshing…" : "Refresh"}</button>
        </nav>

        <div className="cancelled-filter-grid">
          <label className="cancelled-search-field"><span>Search</span><input type="search" placeholder="Order ID, project, client, reason…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
          <label><span>Frozen stage</span><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="all">All stages</option>{stageOptions.map((stage) => <option value={stage} key={stage}>{stage}</option>)}</select></label>
          <label><span>Reason</span><select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}><option value="all">All reasons</option>{reasonSummary.map((reason) => <option value={reason.label} key={reason.label}>{reason.label}</option>)}</select></label>
          <label><span>Date range</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value)}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
          <button type="button" className="cancelled-reset-button" onClick={resetFilters}>Reset</button>
        </div>

        <div className="cancelled-selection-bar">
          <label><input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} />Select this page</label>
          <span>{selectedProjects.length} selected for batch action</span>
        </div>

        {loading ? (
          <div className="cancelled-orders-empty">Loading cancelled projects…</div>
        ) : error ? (
          <div className="cancelled-orders-empty error">{error}</div>
        ) : !filteredProjects.length ? (
          <div className="cancelled-orders-empty"><strong>No cancelled projects match this view.</strong><span>Adjust the filters or clear the current search.</span></div>
        ) : (
          <div className="cancelled-project-table" role="table" aria-label="Cancelled projects">
            <div className="cancelled-project-table-head" role="row"><span>Order</span><span>Project &amp; client</span><span>Frozen stage &amp; state</span><span>Cancellation reason &amp; stamp</span><span>Quote &amp; actions</span></div>
            <div role="rowgroup">
              {pagedProjects.map((project) => {
                const projectId = String(project?._id || "");
                const cancellation = project?.cancellation || {};
                const stage = cancellation.resumedStatus || project?.status || "Not recorded";
                const quoteAmount = getQuoteAmount(project);
                const selected = selectedIds.includes(projectId);
                return (
                  <article className={`cancelled-project-row ${selected ? "selected" : ""}`} key={projectId || project?.orderId} role="row" tabIndex="0" onClick={() => handleOpenProject(projectId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleOpenProject(projectId); }}>
                    <div className="cancelled-order-cell" role="cell">
                      <input type="checkbox" checked={selected} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(projectId)} aria-label={`Select ${project?.orderId || projectId}`} />
                      <span><strong>{project?.orderId || project?.groupOrderNumber || "Unassigned"}</strong><small>{getFrozenDays(project)} days frozen</small></span>
                    </div>
                    <div className="cancelled-project-cell" role="cell">
                      <strong>{renderProjectName(project?.details, null, "Unnamed Project")}</strong>
                      <span>{project?.details?.client || project?.groupClient || "Unknown client"}</span>
                      {project?.details?.projectIndicator && <small>{project.details.projectIndicator}</small>}
                    </div>
                    <div className="cancelled-stage-cell" role="cell">
                      <strong><i />{stage}</strong>
                      <span>{cancellation.resumedStatus ? "Resume stage preserved" : "Current stage used as fallback"}</span>
                      {cancellation.resumedHoldState && <small>Previous hold state retained</small>}
                    </div>
                    <div className="cancelled-reason-cell" role="cell">
                      <span className={`cancelled-reason-pill ${getReasonCategory(cancellation.reason) === "No reason provided" ? "neutral" : ""}`}>{getReasonCategory(cancellation.reason)}</span>
                      <strong>{cancellation.reason?.trim() || "No cancellation reason was provided."}</strong>
                      <small>{formatDateTime(cancellation.cancelledAt)} · {getPersonName(cancellation.cancelledBy)}</small>
                    </div>
                    <div className="cancelled-value-cell" role="cell">
                      <strong>{quoteAmount === null ? "Not quoted" : formatMoney(quoteAmount, project?.quoteDetails?.costVerification?.currency)}</strong>
                      <div>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleOpenProject(projectId); }}>Snapshot</button>
                        <button type="button" className="reactivate" disabled={Boolean(reactivatingId)} onClick={(event) => { event.stopPropagation(); handleOpenReactivateModal(project); }}>Reactivate</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        <footer className="cancelled-pagination">
          <span>Showing {filteredProjects.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredProjects.length)} of {filteredProjects.length}</span>
          <label>Rows per page <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
          <div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>‹</button><span>{page} / {totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>›</button></div>
        </footer>
      </section>

      <section className="cancelled-insights-grid">
        <article className="cancelled-readiness-panel">
          <header><div><span>Recovery telemetry</span><h2>Reactivation Readiness</h2></div><small>{readyCount} ready now</small></header>
          <p>Projects with a preserved resume stage can return to the production workflow without manually rebuilding their previous position.</p>
          <div className="cancelled-readiness-track"><span style={{ width: `${projects.length ? (readyCount / projects.length) * 100 : 0}%` }} /></div>
          <div className="cancelled-readiness-cards"><div><strong>{readyCount}</strong><span>Resume stages stored</span></div><div><strong>{preservedHoldCount}</strong><span>Hold states retained</span></div><div><strong>{namedReasonCount}</strong><span>Reasons documented</span></div></div>
        </article>
        <article className="cancelled-reasons-panel">
          <header><div><span>Current frozen pipeline</span><h2>Reason Distribution</h2></div><small>{projects.length} projects</small></header>
          <div>
            {reasonSummary.slice(0, 5).map((reason) => (
              <button type="button" key={reason.label} onClick={() => { setReasonFilter(reason.label); setActiveView("all"); }}><span><strong>{reason.label}</strong><em>{reason.count} · {reason.percentage}%</em></span><i><b style={{ width: `${reason.percentage}%` }} /></i></button>
            ))}
            {!reasonSummary.length && <p>No cancellation reasons available.</p>}
          </div>
        </article>
      </section>

      <ProjectReactivateModal
        isOpen={Boolean(reactivateModalProject)}
        onClose={closeReactivateModal}
        onConfirm={handleReactivate}
        isSubmitting={Boolean(reactivatingId)}
        orderId={reactivateModalProject?.orderId}
        projectName={renderProjectName(reactivateModalProject?.details, null, "Unnamed Project")}
        frozenStage={reactivateModalProject?.cancellation?.resumedStatus || reactivateModalProject?.status}
        errorMessage={reactivateError}
      />
      <ConfirmDialog
        isOpen={bulkDialogOpen}
        title="Reactivate selected projects"
        message={`Restore ${selectedProjects.length} selected project${selectedProjects.length === 1 ? "" : "s"} to their preserved workflow stages? Each project will notify its assigned team.`}
        confirmText="Reactivate selected"
        cancelText="Keep frozen"
        type="primary"
        onConfirm={handleBulkReactivate}
        onCancel={() => setBulkDialogOpen(false)}
      />
    </div>
  );
};

export default CancelledOrders;
