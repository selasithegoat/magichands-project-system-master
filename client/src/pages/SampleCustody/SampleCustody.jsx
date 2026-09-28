import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SampleMovementDetails from "./SampleMovementDetails";
import SampleMovementForm from "./SampleMovementForm";
import {
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_TONES,
  formatSampleDate,
  formatSampleStatus,
  getProjectLabel,
  requestSampleMovement,
} from "../../utils/sampleMovementApi";
import "./SampleCustody.css";

const QUICK_FILTERS = [
  { key: "all", label: "All records" },
  { key: "active", label: "Active custody", scope: "active" },
  { key: "with_clients", label: "With clients", scope: "with_clients" },
  { key: "closed", label: "Closed", scope: "closed" },
];

const KPI_DEFINITIONS = [
  {
    key: "awaitingAuthorization",
    label: "Awaiting Admin",
    description: "Pending authorization",
    tone: "warning",
    status: "awaiting_authorization",
  },
  {
    key: "readyForRelease",
    label: "Ready for Release",
    description: "Authorized and ready",
    tone: "info",
    status: "authorized",
  },
  {
    key: "withClients",
    label: "With Clients",
    description: "Currently outside premises",
    tone: "success",
    scope: "with_clients",
  },
  {
    key: "dueSoon",
    label: "Due Soon",
    description: "Due within seven days",
    tone: "warning",
    attention: "due_soon",
  },
  {
    key: "overdue",
    label: "Overdue",
    description: "Retrieval date has passed",
    tone: "danger",
    attention: "overdue",
  },
  {
    key: "ownershipTransferPending",
    label: "Ownership Requests",
    description: "Waiting for Admin decision",
    tone: "purple",
    status: "ownership_transfer_pending",
  },
];

const useDebouncedValue = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
};

const SampleCustody = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState("");
  const [disposition, setDisposition] = useState("");
  const [handoverMethod, setHandoverMethod] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [attention, setAttention] = useState("");
  const [page, setPage] = useState(1);
  const [formMovement, setFormMovement] = useState(undefined);
  const [selectedId, setSelectedId] = useState("");
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const selectedQuickFilter = QUICK_FILTERS.find((item) => item.key === quickFilter);
  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "40" });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (status) params.set("status", status);
    if (disposition) params.set("disposition", disposition);
    if (handoverMethod) params.set("handoverMethod", handoverMethod);
    if (attention) params.set("attention", attention);
    if (!status && !attention && selectedQuickFilter?.scope) {
      params.set("scope", selectedQuickFilter.scope);
    }
    return params.toString();
  }, [attention, debouncedSearch, disposition, handoverMethod, page, selectedQuickFilter, status]);

  const movementsQuery = useQuery({
    queryKey: ["sample-movements", queryParams],
    queryFn: () => requestSampleMovement(`?${queryParams}`),
    placeholderData: (previousData) => previousData,
    meta: { realtimePaths: ["/api/sample-movements"] },
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", "sample-custody-options"],
    queryFn: async () => {
      const response = await fetch("/api/projects?mode=report", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load project options.");
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    },
    staleTime: 60_000,
    meta: { realtimePaths: ["/api/projects"] },
  });

  const detailQuery = useQuery({
    queryKey: ["sample-movement", selectedId],
    queryFn: () => requestSampleMovement(`/${selectedId}`),
    enabled: Boolean(selectedId),
    meta: { realtimePaths: ["/api/sample-movements"] },
  });

  const data = movementsQuery.data || {};
  const movements = data.movements || [];
  const summary = data.summary || {};
  const pagination = data.pagination || { page: 1, pages: 1, total: 0 };

  const applyKpi = (definition) => {
    setPage(1);
    setStatus(definition.status || "");
    setAttention(definition.attention || "");
    setQuickFilter(definition.scope || "all");
  };

  const clearFilters = () => {
    setPage(1);
    setSearch("");
    setStatus("");
    setDisposition("");
    setHandoverMethod("");
    setAttention("");
    setQuickFilter("all");
  };

  const invalidateRecords = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sample-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["sample-movement"] }),
    ]);
  };

  const handleSaved = async (saved, message) => {
    setFormMovement(undefined);
    setSelectedId(saved._id);
    queryClient.setQueryData(["sample-movement", saved._id], saved);
    setFeedback({ type: "success", message });
    await invalidateRecords();
  };

  const handleChanged = async (updated, message) => {
    queryClient.setQueryData(["sample-movement", updated._id], updated);
    setFeedback({ type: "success", message });
    await invalidateRecords();
  };

  const hasFilters = Boolean(
    search || status || disposition || handoverMethod || attention || quickFilter !== "all",
  );

  return (
    <div className="sample-custody-page">
      {feedback && <div className={`sample-page-feedback ${feedback.type}`} role="status">{feedback.message}</div>}

      <header className="sample-page-hero">
        <div>
          <span className="sample-eyebrow">Front Desk · Chain of custody</span>
          <h1>Sample Custody & Returns</h1>
          <p>Authorize, release, track, retrieve, or transfer ownership of client samples.</p>
        </div>
        <button type="button" className="sample-primary-button sample-create-button" onClick={() => setFormMovement(null)}>
          <span>+</span> New sample movement
        </button>
      </header>

      <section className="sample-kpi-grid" aria-label="Sample custody summary">
        {KPI_DEFINITIONS.map((definition) => (
          <button
            type="button"
            key={definition.key}
            className={`sample-kpi-card ${definition.tone} ${(status === definition.status && definition.status) || (attention === definition.attention && definition.attention) || (definition.scope && quickFilter === definition.scope) ? "active" : ""}`}
            onClick={() => applyKpi(definition)}
          >
            <span>{definition.label}</span>
            <strong>{movementsQuery.isPending ? "—" : summary[definition.key] || 0}</strong>
            <small>{definition.description}</small>
          </button>
        ))}
      </section>

      <section className="sample-register-card">
        <div className="sample-register-toolbar">
          <div className="sample-register-title">
            <div><h2>Custody register</h2><p>{pagination.total || 0} record{pagination.total === 1 ? "" : "s"}</p></div>
            <div className="sample-scope-tabs" aria-label="Register view">
              {QUICK_FILTERS.map((filter) => (
                <button key={filter.key} type="button" className={quickFilter === filter.key && !status && !attention ? "active" : ""} onClick={() => { setPage(1); setQuickFilter(filter.key); setStatus(""); setAttention(""); }}>
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sample-filter-grid">
            <label className="sample-search-field">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search reference, client, project or item" aria-label="Search custody register" />
            </label>
            <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); setAttention(""); }} aria-label="Filter by status">
              <option value="">All statuses</option>
              {Object.entries(SAMPLE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={disposition} onChange={(event) => { setPage(1); setDisposition(event.target.value); }} aria-label="Filter by disposition">
              <option value="">All dispositions</option>
              <option value="returnable">Returnable</option>
              <option value="decision_pending">Decision pending</option>
              <option value="client_owned">Client-owned</option>
            </select>
            <select value={handoverMethod} onChange={(event) => { setPage(1); setHandoverMethod(event.target.value); }} aria-label="Filter by handover method">
              <option value="">All handover methods</option>
              <option value="pickup">Client pick-up</option>
              <option value="dispatch">Dispatch</option>
            </select>
            {hasFilters && <button type="button" className="sample-clear-filter" onClick={clearFilters}>Clear filters</button>}
          </div>
        </div>

        {movementsQuery.isError ? (
          <div className="sample-empty-state error"><strong>Could not load sample custody records</strong><p>{movementsQuery.error?.message}</p><button type="button" onClick={() => movementsQuery.refetch()}>Try again</button></div>
        ) : movementsQuery.isPending ? (
          <div className="sample-loading-state"><span className="sample-spinner" />Loading custody register…</div>
        ) : movements.length === 0 ? (
          <div className="sample-empty-state"><div className="sample-empty-icon">◇</div><strong>{hasFilters ? "No matching records" : "No sample movements yet"}</strong><p>{hasFilters ? "Try clearing one or more filters." : "Create the first custody record when a sample is ready to leave the premises."}</p>{hasFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : <button type="button" onClick={() => setFormMovement(null)}>Create sample movement</button>}</div>
        ) : (
          <>
            <div className="sample-table-wrap">
              <table className="sample-register-table">
                <thead><tr><th>Reference</th><th>Client & project</th><th>Samples</th><th>Handover</th><th>Expected return</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {movements.map((movement) => {
                    const quantity = (movement.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                    return (
                      <tr key={movement._id} onClick={() => setSelectedId(movement._id)}>
                        <td><button type="button" className="sample-reference-link" onClick={() => setSelectedId(movement._id)}>{movement.reference}</button><small>{formatSampleDate(movement.createdAt)}</small></td>
                        <td><strong>{movement.client?.name || "Unknown client"}</strong><small>{getProjectLabel(movement.project || movement)}</small></td>
                        <td><strong>{quantity} {movement.items?.[0]?.unit || "unit(s)"}</strong><small>{movement.items?.length || 0} line item{movement.items?.length === 1 ? "" : "s"}</small></td>
                        <td><span className="sample-method-badge">{movement.handoverMethod === "pickup" ? "Pick-up" : "Dispatch"}</span><small>{movement.disposition?.replace(/_/g, " ")}</small></td>
                        <td><strong className={movement.attentionState === "overdue" ? "sample-overdue-text" : ""}>{movement.disposition === "client_owned" ? "Not required" : formatSampleDate(movement.expectedReturnAt)}</strong>{movement.attentionState !== "none" && <small className={`sample-attention-text ${movement.attentionState}`}>{movement.attentionState === "overdue" ? "Retrieval overdue" : "Due soon"}</small>}</td>
                        <td><span className={`sample-status ${SAMPLE_STATUS_TONES[movement.status] || "neutral"}`}>{formatSampleStatus(movement.status)}</span></td>
                        <td><button type="button" className="sample-row-action" onClick={(event) => { event.stopPropagation(); setSelectedId(movement._id); }} aria-label={`Open ${movement.reference}`}>›</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pagination.pages > 1 && (
              <div className="sample-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)}>Next</button></div>
            )}
          </>
        )}
      </section>

      {formMovement !== undefined && (
        <SampleMovementForm
          movement={formMovement}
          projects={projectsQuery.data || []}
          onClose={() => setFormMovement(undefined)}
          onSaved={handleSaved}
        />
      )}

      {selectedId && (
        <SampleMovementDetails
          movement={detailQuery.data}
          loading={detailQuery.isPending}
          error={detailQuery.error}
          onClose={() => setSelectedId("")}
          onEdit={(movement) => setFormMovement(movement)}
          onChanged={handleChanged}
        />
      )}
    </div>
  );
};

export default SampleCustody;
