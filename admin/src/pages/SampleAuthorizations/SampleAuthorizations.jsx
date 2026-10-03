import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import usePersistedState from "@client/hooks/usePersistedState";
import useUnsavedChangesGuard from "@client/hooks/useUnsavedChangesGuard";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";
import "./SampleAuthorizations.css";

const STATUS_LABELS = {
  draft: "Draft",
  awaiting_authorization: "Awaiting authorization",
  changes_requested: "Changes requested",
  authorization_rejected: "Authorization rejected",
  authorized: "Ready for release",
  dispatched: "Dispatched",
  in_client_custody: "In client custody",
  partially_returned: "Partially returned",
  ownership_transfer_pending: "Ownership decision pending",
  returned: "Returned",
  client_owned: "Client-owned",
  lost_unrecoverable: "Lost / unrecoverable",
  cancelled: "Cancelled",
};

const DOCUMENT_TYPE_LABELS = {
  custody_note: "Custody note / waybill",
  signed_custody_note: "Signed custody note",
  ownership_transfer_addendum: "Ownership transfer addendum",
  client_confirmation: "Client confirmation",
  supporting_document: "Supporting document",
};

const QUEUES = [
  { key: "release", label: "Release requests", status: "awaiting_authorization" },
  { key: "ownership", label: "Ownership requests", status: "ownership_transfer_pending" },
  { key: "register", label: "Decision register" },
];

const DECISIONS = {
  authorize: {
    title: "Authorize sample release",
    description: "The Front Desk will be able to release this sample after approval.",
    endpoint: "authorize",
    confirm: "Authorize release",
    tone: "approve",
  },
  changes: {
    title: "Request changes",
    description: "Return this request to Front Desk with clear corrections to make.",
    endpoint: "request-changes",
    confirm: "Return for changes",
    tone: "changes",
    noteRequired: true,
  },
  reject: {
    title: "Reject sample release",
    description: "Close this authorization request and preserve the decision in its audit history.",
    endpoint: "reject",
    confirm: "Reject request",
    tone: "reject",
    noteRequired: true,
  },
  approveOwnership: {
    title: "Approve client ownership",
    description: "The samples become client property and will no longer require retrieval.",
    endpoint: "approve-ownership-transfer",
    confirm: "Approve ownership",
    tone: "approve",
    noteRequired: true,
  },
  rejectOwnership: {
    title: "Decline client ownership",
    description: "The samples remain in client custody and retrieval tracking will continue.",
    endpoint: "reject-ownership-transfer",
    confirm: "Decline ownership",
    tone: "reject",
    noteRequired: true,
  },
};

const requestSampleMovements = async (path = "", options = {}) => {
  const response = await fetch(`/api/sample-movements${path}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Sample authorization request failed.");
  return payload;
};

const formatDate = (value, includeTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

const personName = (person) =>
  [person?.firstName, person?.lastName].filter(Boolean).join(" ") ||
  person?.name ||
  "—";

const projectLabel = (movement) => {
  const orderId = movement?.projectSnapshot?.orderId || movement?.project?.orderId || "";
  const name =
    movement?.projectSnapshot?.projectName ||
    movement?.project?.details?.projectNameRaw ||
    movement?.project?.details?.projectName ||
    "Untitled project";
  return orderId ? `${orderId} · ${name}` : name;
};

const totalQuantity = (movement) =>
  (movement?.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);

const formatStatus = (status) =>
  STATUS_LABELS[status] ||
  String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusTone = (status) => {
  if (["authorization_rejected", "lost_unrecoverable"].includes(status)) return "danger";
  if (["awaiting_authorization", "changes_requested", "partially_returned"].includes(status)) return "warning";
  if (["ownership_transfer_pending"].includes(status)) return "purple";
  if (["authorized", "dispatched"].includes(status)) return "info";
  if (["returned", "client_owned", "in_client_custody"].includes(status)) return "success";
  return "neutral";
};

const DecisionDialog = ({ movement, decision, onClose, onCompleted }) => {
  const meta = DECISIONS[decision];
  const [note, setNote, clearSavedNote] = usePersistedState(
    `sample-authorization-decision:${movement._id}:${decision}`,
    "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const hasUnsavedNote = note.length > 0;

  useUnsavedChangesGuard(hasUnsavedNote && !saving);

  const requestClose = () => {
    if (saving) return;
    if (hasUnsavedNote) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const submit = async () => {
    if (meta.noteRequired && !note.trim()) {
      setError("Enter a decision note before continuing.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await requestSampleMovements(
        `/${movement._id}/${meta.endpoint}`,
        { method: "POST", body: JSON.stringify({ note: note.trim() }) },
      );
      clearSavedNote();
      onCompleted(updated, `${meta.title} recorded.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sample-auth-modal-backdrop" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
      <section
        className="sample-auth-decision-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-auth-decision-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className={`sample-auth-decision-icon ${meta.tone}`} aria-hidden="true">
            {meta.tone === "approve" ? "✓" : meta.tone === "changes" ? "↩" : "!"}
          </div>
          <div>
            <span>{movement.reference}</span>
            <h2 id="sample-auth-decision-title">{meta.title}</h2>
          </div>
          <button type="button" className="sample-auth-icon-button" onClick={requestClose} aria-label="Close decision dialog">×</button>
        </header>
        <div className="sample-auth-decision-body">
          <p>{meta.description}</p>
          {error && <div className="sample-auth-error" role="alert">{error}</div>}
          <label>
            <span>Decision note {meta.noteRequired ? "*" : "(optional)"}</span>
            <textarea
              rows="5"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={meta.noteRequired ? "State the reason and any next action required…" : "Add any instruction for Front Desk…"}
              autoFocus
            />
            <small className="sample-auth-autosave-note">Decision note saved automatically on this device.</small>
          </label>
          <div className="sample-auth-decision-context">
            <span>Client</span><strong>{movement.client?.name || "—"}</strong>
            <span>Project</span><strong>{projectLabel(movement)}</strong>
          </div>
        </div>
        <footer>
          <button type="button" className="sample-auth-button secondary" onClick={requestClose}>Close for now</button>
          <button type="button" className={`sample-auth-button ${meta.tone}`} disabled={saving} onClick={submit}>
            {saving ? "Recording…" : meta.confirm}
          </button>
        </footer>
      </section>
      <ConfirmationModal
        isOpen={confirmClose}
        title="Close and continue later?"
        message="Your decision note is saved locally and will be restored when you reopen this request."
        confirmText="Close and keep note"
        cancelText="Keep editing"
        onClose={() => setConfirmClose(false)}
        onConfirm={onClose}
      />
    </div>
  );
};

const DetailPanel = ({ movement, loading, error, onClose, onDecision }) => {
  const projectId = movement?.project?._id || movement?.project;
  const releaseDecision = movement?.status === "awaiting_authorization";
  const ownershipDecision = movement?.status === "ownership_transfer_pending";

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="sample-auth-panel-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="sample-auth-detail-panel" role="dialog" aria-modal="true" aria-label="Sample authorization details" onMouseDown={(event) => event.stopPropagation()}>
        {loading ? (
          <div className="sample-auth-panel-state"><span className="sample-auth-spinner" />Loading request…</div>
        ) : error || !movement ? (
          <div className="sample-auth-panel-state error"><strong>Could not load this request</strong><span>{error?.message}</span><button type="button" onClick={onClose}>Close</button></div>
        ) : (
          <>
            <header className="sample-auth-panel-header">
              <div><span>Authorization review</span><h2>{movement.reference}</h2></div>
              <button type="button" className="sample-auth-icon-button" onClick={onClose} aria-label="Close details">×</button>
              <div className="sample-auth-panel-status">
                <span className={`sample-auth-status ${statusTone(movement.status)}`}>{formatStatus(movement.status)}</span>
                <small>Updated {formatDate(movement.updatedAt, true)}</small>
              </div>
            </header>

            {(releaseDecision || ownershipDecision) && (
              <div className="sample-auth-panel-actions">
                {releaseDecision ? (
                  <>
                    <button type="button" className="sample-auth-button approve" onClick={() => onDecision("authorize")}>Authorize release</button>
                    <button type="button" className="sample-auth-button changes" onClick={() => onDecision("changes")}>Request changes</button>
                    <button type="button" className="sample-auth-button reject-link" onClick={() => onDecision("reject")}>Reject</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="sample-auth-button approve" onClick={() => onDecision("approveOwnership")}>Approve ownership</button>
                    <button type="button" className="sample-auth-button reject" onClick={() => onDecision("rejectOwnership")}>Decline ownership</button>
                  </>
                )}
              </div>
            )}

            <div className="sample-auth-panel-content">
              <section className="sample-auth-review-card important">
                <div className="sample-auth-card-title"><h3>Client and project</h3><span>{movement.handoverMethod === "pickup" ? "Client pick-up" : "Dispatch"}</span></div>
                <dl className="sample-auth-facts">
                  <div><dt>Client</dt><dd>{movement.client?.name || "—"}</dd></div>
                  <div><dt>Contact</dt><dd>{movement.client?.contactPerson || "—"}{movement.client?.phone ? ` · ${movement.client.phone}` : ""}</dd></div>
                  <div className="wide"><dt>Project</dt><dd>{projectId ? <Link to={`/projects/${projectId}`}>{projectLabel(movement)}</Link> : projectLabel(movement)}</dd></div>
                  <div className="wide"><dt>Purpose</dt><dd>{movement.purpose || "—"}</dd></div>
                </dl>
              </section>

              <section className="sample-auth-review-card">
                <h3>Custody plan</h3>
                <dl className="sample-auth-facts">
                  <div><dt>Disposition</dt><dd>{String(movement.disposition || "").replace(/_/g, " ")}</dd></div>
                  <div><dt>Expected retrieval</dt><dd>{movement.disposition === "client_owned" ? "Not required" : formatDate(movement.expectedReturnAt, true)}</dd></div>
                  <div><dt>Front Desk owner</dt><dd>{personName(movement.frontDeskOwner)}</dd></div>
                  <div><dt>Submitted</dt><dd>{formatDate(movement.authorization?.submittedAt, true)}</dd></div>
                </dl>
              </section>

              {ownershipDecision && (
                <section className="sample-auth-review-card ownership">
                  <div className="sample-auth-card-title"><h3>Ownership request</h3><span>Client confirmation recorded</span></div>
                  <p className="sample-auth-request-reason">{movement.ownershipTransfer?.requestReason || "No reason supplied."}</p>
                  <dl className="sample-auth-facts">
                    <div><dt>Requested by</dt><dd>{personName(movement.ownershipTransfer?.requestedBy)}</dd></div>
                    <div><dt>Requested</dt><dd>{formatDate(movement.ownershipTransfer?.requestedAt, true)}</dd></div>
                    <div><dt>Billing reference</dt><dd>{movement.ownershipTransfer?.billingReference || "—"}</dd></div>
                    <div><dt>Payment reference</dt><dd>{movement.ownershipTransfer?.paymentReference || "—"}</dd></div>
                    <div className="wide"><dt>Client confirmation</dt><dd>{movement.ownershipTransfer?.clientConfirmationNote || "Confirmed without an additional note."}</dd></div>
                  </dl>
                </section>
              )}

              <section className="sample-auth-review-card">
                <div className="sample-auth-card-title"><h3>Sample items</h3><span>{totalQuantity(movement)} total objects</span></div>
                <div className="sample-auth-items">
                  {(movement.items || []).map((item) => (
                    <article key={item._id}>
                      <div><strong>{item.description}</strong><small>{item.identifyingMarks || item.outboundCondition || "No identifying mark"}</small></div>
                      <dl>
                        <div><dt>Quantity</dt><dd>{item.quantity} {item.unit}</dd></div>
                        <div><dt>Returned</dt><dd>{item.quantityReturned || 0}</dd></div>
                        <div><dt>Production treatment</dt><dd>{String(item.productionTreatment || "not_applicable").replace(/_/g, " ")}</dd></div>
                        <div><dt>Applied</dt><dd>{item.productionQuantityApplied || 0}</dd></div>
                      </dl>
                      {((item.photos || []).length > 0 || (item.returnPhotos || []).length > 0) && (
                        <div className="sample-auth-photo-strip">
                          {[...(item.photos || []), ...(item.returnPhotos || [])].map((photo) => (
                            <a key={photo._id} href={photo.fileUrl} target="_blank" rel="noreferrer">
                              <img src={photo.fileUrl} alt={`${item.description} evidence`} />
                              <span>{(item.returnPhotos || []).some((entry) => entry._id === photo._id) ? "Return" : "Outbound"}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      {item.outboundConditionNotes && <p>{item.outboundConditionNotes}</p>}
                    </article>
                  ))}
                </div>
              </section>

              <section className="sample-auth-review-card">
                <div className="sample-auth-card-title"><h3>Waybill and evidence</h3><span>{movement.documents?.length || 0} documents</span></div>
                {(movement.documents || []).length ? (
                  <div className="sample-auth-documents">
                    {[...(movement.documents || [])].reverse().map((document) => (
                      <a key={document._id} href={document.file?.fileUrl} target="_blank" rel="noreferrer">
                        <span className="sample-auth-document-icon">{document.file?.mimeType?.includes("pdf") ? "PDF" : "FILE"}</span>
                        <span><strong>{DOCUMENT_TYPE_LABELS[document.type] || String(document.type || "").replace(/_/g, " ")}</strong><small>{document.file?.originalName || document.documentNumber} · {formatDate(document.issuedAt)}</small></span>
                        <em className={document.status === "signed" ? "signed" : ""}>{document.status}</em>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="sample-auth-evidence-warning"><strong>No custody document uploaded</strong><span>Front Desk should upload the signed waybill after handover.</span></div>
                )}
              </section>

              {movement.authorization?.decisionNote && (
                <section className="sample-auth-review-card decision-record">
                  <h3>Latest authorization decision</h3>
                  <p>{movement.authorization.decisionNote}</p>
                  <small>{personName(movement.authorization.decidedBy)} · {formatDate(movement.authorization.decidedAt, true)}</small>
                </section>
              )}

              <section className="sample-auth-review-card">
                <div className="sample-auth-card-title"><h3>Audit trail</h3><span>{movement.custodyEvents?.length || 0} events</span></div>
                <ol className="sample-auth-timeline">
                  {[...(movement.custodyEvents || [])].reverse().map((event) => (
                    <li key={event._id}>
                      <span className="sample-auth-timeline-dot" />
                      <div><strong>{formatStatus(event.toStatus || event.type)}</strong><p>{event.note || String(event.type || "").replace(/_/g, " ")}</p><small>{event.actorName || "System"} · {formatDate(event.occurredAt, true)}</small></div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </aside>
    </div>
  );
};

const SampleAuthorizations = () => {
  const queryClient = useQueryClient();
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const [queue, setQueue] = useState("release");
  const [registerFilter, setRegisterFilter] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [decision, setDecision] = useState("");
  const [feedback, setFeedback] = useState("");
  const requestedMovement = urlSearchParams.get("movement") || "";
  const requestedAttention = urlSearchParams.get("attention") || "";
  const activeSelectedId = selectedId || requestedMovement;
  const activeQueue = ["due_soon", "overdue"].includes(requestedAttention)
    ? "register"
    : queue;
  const activeRegisterFilter = ["due_soon", "overdue"].includes(
    requestedAttention,
  )
    ? requestedAttention
    : registerFilter;

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = window.setTimeout(() => setFeedback(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const selectedQueue =
    QUEUES.find((item) => item.key === activeQueue) || QUEUES[0];
  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "40" });
    if (selectedQueue.status) params.set("status", selectedQueue.status);
    if (activeQueue === "register" && activeRegisterFilter === "authorized") {
      params.set("status", "authorized");
    }
    if (activeQueue === "register" && activeRegisterFilter === "with_clients") {
      params.set("scope", "with_clients");
    }
    if (
      activeQueue === "register" &&
      ["due_soon", "overdue"].includes(activeRegisterFilter)
    ) {
      params.set("attention", activeRegisterFilter);
    }
    if (deferredSearch) params.set("search", deferredSearch);
    return params.toString();
  }, [activeQueue, activeRegisterFilter, deferredSearch, page, selectedQueue.status]);

  const listQuery = useQuery({
    queryKey: ["sample-movements", "admin-authorizations", queryParams],
    queryFn: () => requestSampleMovements(`?${queryParams}`),
    placeholderData: (previousData) => previousData,
    meta: { realtimePaths: ["/api/sample-movements"] },
  });

  const detailQuery = useQuery({
    queryKey: ["sample-movement", "admin-authorization", activeSelectedId],
    queryFn: () => requestSampleMovements(`/${activeSelectedId}`),
    enabled: Boolean(activeSelectedId),
    meta: { realtimePaths: ["/api/sample-movements"] },
  });

  const data = listQuery.data || {};
  const movements = data.movements || [];
  const summary = data.summary || {};
  const pagination = data.pagination || { page: 1, pages: 1, total: 0 };

  const switchQueue = (nextQueue, nextRegisterFilter = "") => {
    if (urlSearchParams.has("attention")) {
      const nextParams = new URLSearchParams(urlSearchParams);
      nextParams.delete("attention");
      setUrlSearchParams(nextParams, { replace: true });
    }
    setQueue(nextQueue);
    setRegisterFilter(nextQueue === "register" ? nextRegisterFilter : "");
    setPage(1);
  };

  const resultsLabel =
    activeQueue !== "register"
      ? selectedQueue.label
      : activeRegisterFilter === "authorized"
        ? "Ready for release"
        : activeRegisterFilter === "with_clients"
          ? "Samples with clients"
          : activeRegisterFilter === "overdue"
            ? "Overdue retrievals"
            : activeRegisterFilter === "due_soon"
              ? "Retrievals due soon"
          : selectedQueue.label;

  const closeDetails = () => {
    setSelectedId("");
    if (!urlSearchParams.has("movement")) return;
    const nextParams = new URLSearchParams(urlSearchParams);
    nextParams.delete("movement");
    setUrlSearchParams(nextParams, { replace: true });
  };

  const completeDecision = async (updated, message) => {
    setDecision("");
    setFeedback(message);
    queryClient.setQueryData(["sample-movement", "admin-authorization", updated._id], updated);
    await queryClient.invalidateQueries({ queryKey: ["sample-movements"] });
  };

  return (
    <div className="sample-authorizations-page">
      {feedback && <div className="sample-auth-feedback" role="status">✓ {feedback}</div>}

      <header className="sample-auth-hero">
        <div>
          <span className="sample-auth-eyebrow">Administration · Controlled release</span>
          <h1>Sample Authorizations</h1>
          <p>Review custody plans and ownership requests before samples leave active company control.</p>
        </div>
        <div className="sample-auth-hero-control">
          <span>Pending decisions</span>
          <strong>{(summary.awaitingAuthorization || 0) + (summary.ownershipTransferPending || 0)}</strong>
          <small>Requires Administration review</small>
        </div>
      </header>

      <section className="sample-auth-summary" aria-label="Sample authorization summary">
        <button type="button" className={activeQueue === "release" ? "active amber" : "amber"} onClick={() => switchQueue("release")}>
          <span>Release requests</span><strong>{summary.awaitingAuthorization || 0}</strong><small>Awaiting authorization</small>
        </button>
        <button type="button" className={activeQueue === "ownership" ? "active purple" : "purple"} onClick={() => switchQueue("ownership")}>
          <span>Ownership requests</span><strong>{summary.ownershipTransferPending || 0}</strong><small>Client retention decisions</small>
        </button>
        <button type="button" className={activeQueue === "register" && activeRegisterFilter === "authorized" ? "active blue" : "blue"} onClick={() => switchQueue("register", "authorized")}>
          <span>Ready for release</span><strong>{summary.readyForRelease || 0}</strong><small>Already authorized</small>
        </button>
        <button type="button" className={activeQueue === "register" && activeRegisterFilter === "with_clients" ? "active green" : "green"} onClick={() => switchQueue("register", "with_clients")}>
          <span>With clients</span><strong>{summary.withClients || 0}</strong><small>Outside the premises</small>
        </button>
        <button type="button" className={activeQueue === "register" && activeRegisterFilter === "due_soon" ? "active amber" : "amber"} onClick={() => switchQueue("register", "due_soon")}>
          <span>Due soon</span><strong>{summary.dueSoon || 0}</strong><small>Retrieval within seven days</small>
        </button>
        <button type="button" className={activeQueue === "register" && activeRegisterFilter === "overdue" ? "active red" : "red"} onClick={() => switchQueue("register", "overdue")}>
          <span>Overdue</span><strong>{summary.overdue || 0}</strong><small>Escalated retrievals</small>
        </button>
      </section>

      <section className="sample-auth-workspace">
        <div className="sample-auth-toolbar">
          <div className="sample-auth-tabs" role="tablist" aria-label="Authorization queues">
            {QUEUES.map((item) => (
              <button key={item.key} type="button" role="tab" aria-selected={activeQueue === item.key} className={activeQueue === item.key ? "active" : ""} onClick={() => switchQueue(item.key)}>
                {item.label}
                {item.key === "release" && summary.awaitingAuthorization > 0 && <span>{summary.awaitingAuthorization}</span>}
                {item.key === "ownership" && summary.ownershipTransferPending > 0 && <span>{summary.ownershipTransferPending}</span>}
              </button>
            ))}
          </div>
          <label className="sample-auth-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search reference, client, project or sample" aria-label="Search sample authorizations" />
          </label>
        </div>

        <div className="sample-auth-results-heading">
          <div><strong>{resultsLabel}</strong><span>{pagination.total || 0} record{pagination.total === 1 ? "" : "s"}</span></div>
          {listQuery.isFetching && !listQuery.isPending && <small>Refreshing…</small>}
        </div>

        {listQuery.isPending ? (
          <div className="sample-auth-state"><span className="sample-auth-spinner" />Loading authorization queue…</div>
        ) : listQuery.isError ? (
          <div className="sample-auth-state error"><strong>Could not load authorizations</strong><span>{listQuery.error?.message}</span><button type="button" onClick={() => listQuery.refetch()}>Try again</button></div>
        ) : movements.length === 0 ? (
          <div className="sample-auth-state empty"><div>✓</div><strong>{deferredSearch ? "No matching requests" : "This queue is clear"}</strong><span>{deferredSearch ? "Try a different reference, client, project, or item." : "There are no decisions waiting in this view."}</span></div>
        ) : (
          <div className="sample-auth-table-wrap">
            <table className="sample-auth-table">
              <thead><tr><th>Request</th><th>Client & project</th><th>Custody plan</th><th>Samples</th><th>Submitted</th><th>Status</th><th aria-label="Open"></th></tr></thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement._id} onClick={() => setSelectedId(movement._id)}>
                    <td data-label="Request"><strong className="sample-auth-reference">{movement.reference}</strong><small>{movement.status === "ownership_transfer_pending" ? "Ownership transfer" : "Sample release"}</small></td>
                    <td data-label="Client & project"><strong>{movement.client?.name || "Unknown client"}</strong><small>{projectLabel(movement)}</small></td>
                    <td data-label="Custody plan"><strong>{movement.handoverMethod === "pickup" ? "Client pick-up" : "Dispatch"}</strong><small>{String(movement.disposition || "").replace(/_/g, " ")} · Return {movement.disposition === "client_owned" ? "not required" : formatDate(movement.expectedReturnAt)}</small></td>
                    <td data-label="Samples"><strong>{totalQuantity(movement)} objects</strong><small>{movement.items?.length || 0} line item{movement.items?.length === 1 ? "" : "s"}</small></td>
                    <td data-label="Submitted"><strong>{formatDate(movement.status === "ownership_transfer_pending" ? movement.ownershipTransfer?.requestedAt : movement.authorization?.submittedAt)}</strong><small>{personName(movement.status === "ownership_transfer_pending" ? movement.ownershipTransfer?.requestedBy : movement.authorization?.submittedBy)}</small></td>
                    <td data-label="Status"><span className={`sample-auth-status ${movement.attentionState === "overdue" ? "danger" : movement.attentionState === "due_soon" ? "warning" : statusTone(movement.status)}`}>{movement.attentionState === "overdue" ? "Retrieval overdue" : movement.attentionState === "due_soon" ? "Due soon" : formatStatus(movement.status)}</span></td>
                    <td><button type="button" className="sample-auth-open" onClick={(event) => { event.stopPropagation(); setSelectedId(movement._id); }} aria-label={`Review ${movement.reference}`}>›</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="sample-auth-pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        )}
      </section>

      {activeSelectedId && (
        <DetailPanel
          movement={detailQuery.data}
          loading={detailQuery.isPending}
          error={detailQuery.error}
          onClose={closeDetails}
          onDecision={setDecision}
        />
      )}
      {decision && detailQuery.data && (
        <DecisionDialog movement={detailQuery.data} decision={decision} onClose={() => setDecision("")} onCompleted={completeDecision} />
      )}
    </div>
  );
};

export default SampleAuthorizations;
