import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import "./ProjectRevisionHistory.css";

const REVISION_SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "project_details", label: "Project Details" },
  { key: "items", label: "Order Items" },
  { key: "files", label: "Files & References" },
  { key: "people_departments", label: "People & Departments" },
  { key: "risks_challenges", label: "Risks & Challenges" },
];

const SECTION_LABELS = Object.fromEntries(
  REVISION_SECTIONS.map((section) => [section.key, section.label]),
);

const SOURCE_LABELS = {
  admin_project_details: "Admin Project Details",
  front_desk_order_revision: "Front Desk Revision",
  order_item_add: "Order Item Added",
  order_item_update: "Order Item Updated",
  order_item_delete: "Order Item Removed",
  departments_update: "Departments Updated",
  delivery_schedule_update: "Delivery Schedule",
  mockup_upload: "Mockup Upload",
  mockup_delete: "Mockup Removed",
  project_type_update: "Project Type",
  sample_requirement_update: "Sample Requirement",
  corporate_emergency_update: "Corporate Emergency",
  challenge_add: "Challenge Added",
  challenge_update: "Challenge Updated",
  challenge_delete: "Challenge Removed",
  production_risk_add: "Production Risk Added",
  production_risk_update: "Production Risk Updated",
  production_risk_delete: "Production Risk Removed",
  uncontrollable_factor_add: "Factor Added",
  uncontrollable_factor_update: "Factor Updated",
  uncontrollable_factor_delete: "Factor Removed",
};

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getActorName = (revision) => {
  const actor = revision?.actor;
  const populatedName = actor
    ? `${actor.firstName || ""} ${actor.lastName || ""}`.trim()
    : "";
  return populatedName || actor?.name || revision?.actorName || "Unknown User";
};

const isEmptyValue = (value) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const valueSearchText = (value) => {
  if (isEmptyValue(value)) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const describeObject = (value) => {
  if (!value || typeof value !== "object") return String(value ?? "");
  if (value.description) {
    const qty = value.qty !== undefined ? ` · Qty ${value.qty}` : "";
    return `${value.description}${qty}`;
  }
  if (value.fileName || value.fileUrl) {
    return [value.fileName || value.fileUrl, value.note ? `Note: ${value.note}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  if (value.department) {
    return [value.department, value.scope].filter(Boolean).join(": ");
  }
  if (value.project) return String(value.project);
  if (value.label) return String(value.label);
  return JSON.stringify(value, null, 2);
};

const RevisionValue = ({ value, emptyLabel = "Not set" }) => {
  if (isEmptyValue(value)) {
    return <span className="revision-empty-value">{emptyLabel}</span>;
  }
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="revision-value-list">
        {value.map((entry, index) => (
          <li key={entry?._id || `${describeObject(entry)}-${index}`}>
            {describeObject(entry)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return <pre className="revision-value-json">{describeObject(value)}</pre>;
  }
  return <span className="revision-text-value">{String(value)}</span>;
};

export const ProjectRevisionStamp = ({ project, section, onOpen }) => {
  const meta = project?.revisionTracking?.sections?.[section];
  if (!meta?.revisionNumber) return null;

  return (
    <button
      type="button"
      className="project-revision-stamp"
      onClick={onOpen}
      title={`Open ${SECTION_LABELS[section] || "section"} revision history`}
    >
      Revised in R{meta.revisionNumber} by {meta.updatedByName || "Unknown User"}
      {meta.updatedAt ? ` · ${formatDateTime(meta.updatedAt)}` : ""}
    </button>
  );
};

const ProjectRevisionHistory = ({ project, source = "" }) => {
  const [sectionFilter, setSectionFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const projectId = project?._id;
  const queryString = source
    ? `?source=${encodeURIComponent(source)}&limit=100`
    : "?limit=100";

  const {
    data = { revisions: [], summary: {} },
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["project", projectId, "revisions", source],
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/revisions${queryString}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Failed to load revision history.");
      }
      return response.json();
    },
    enabled: Boolean(projectId),
    meta: {
      realtimePaths: ["/api/projects"],
      projectId,
    },
  });

  const revisionItems = data?.revisions;
  const revisions = useMemo(
    () => (Array.isArray(revisionItems) ? revisionItems : []),
    [revisionItems],
  );
  const filteredRevisions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return revisions.filter((revision) => {
      if (
        sectionFilter !== "all" &&
        !revision.sections?.includes(sectionFilter)
      ) {
        return false;
      }
      if (!normalizedSearch) return true;
      const searchable = [
        `R${revision.revisionNumber}`,
        getActorName(revision),
        revision.reason,
        SOURCE_LABELS[revision.source] || revision.source,
        ...(revision.sections || []).map((section) => SECTION_LABELS[section]),
        ...(revision.changes || []).flatMap((change) => [
          change.label,
          valueSearchText(change.before),
          valueSearchText(change.after),
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [revisions, searchTerm, sectionFilter]);

  const currentRevision = Number(
    data?.summary?.currentRevision ?? project?.revisionTracking?.currentRevision,
  );

  return (
    <section className="project-revision-history" aria-label="Project revision history">
      <div className="revision-history-heading">
        <div>
          <div className="revision-history-eyebrow">CONTENT AUDIT TRAIL</div>
          <h2>Revision History</h2>
          <p>
            Project content changes are grouped by save. Workflow actions remain
            in Activity History.
          </p>
        </div>
        <div className="revision-current-badge">
          {currentRevision > 0 ? `Current R${currentRevision}` : "No revisions yet"}
          {Number(data?.summary?.projectVersionNumber || project?.versionNumber) > 1 && (
            <span>
              Project v{data?.summary?.projectVersionNumber || project?.versionNumber}
            </span>
          )}
        </div>
      </div>

      <div className="revision-history-controls">
        <label className="revision-search-field">
          <span>Search</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="User, field, reason, or value..."
          />
        </label>
        <label className="revision-filter-field">
          <span>Section</span>
          <select
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value)}
          >
            <option value="all">All sections</option>
            {REVISION_SECTIONS.map((section) => (
              <option value={section.key} key={section.key}>
                {section.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isPending && <div className="revision-history-state">Loading revisions...</div>}
      {isError && (
        <div className="revision-history-state error">
          {error?.message || "Revision history could not be loaded."}
        </div>
      )}
      {!isPending && !isError && filteredRevisions.length === 0 && (
        <div className="revision-history-state">
          {revisions.length === 0
            ? "No structured revisions have been recorded yet. Tracking begins with the next content change."
            : "No revisions match these filters."}
        </div>
      )}

      <div className="revision-timeline">
        {filteredRevisions.map((revision) => (
          <article className="revision-card" key={revision._id}>
            <div className="revision-card-marker" aria-hidden="true">
              R{revision.revisionNumber}
            </div>
            <div className="revision-card-content">
              <div className="revision-card-header">
                <div>
                  <h3>
                    Revision R{revision.revisionNumber}
                    <span>Project v{revision.projectVersionNumber || 1}</span>
                  </h3>
                  <p>
                    {getActorName(revision)} · {formatDateTime(revision.createdAt)}
                  </p>
                </div>
                <span className="revision-source">
                  {SOURCE_LABELS[revision.source] || "Project Edit"}
                </span>
              </div>

              <div className="revision-section-chips">
                {(revision.sections || []).map((section) => (
                  <span key={section}>{SECTION_LABELS[section] || section}</span>
                ))}
              </div>

              {revision.reason && (
                <div className="revision-reason">
                  <strong>Reason</strong>
                  <span>{revision.reason}</span>
                </div>
              )}

              <details className="revision-change-disclosure">
                <summary>
                  View {revision.changes?.length || 0}{" "}
                  {revision.changes?.length === 1 ? "change" : "changes"}
                </summary>
                <div className="revision-change-list">
                  {(revision.changes || []).map((change, index) => (
                    <div
                      className={`revision-change-row ${change.changeType}`}
                      key={`${change.field}-${index}`}
                    >
                      <div className="revision-change-title">
                        <span className="revision-change-type">
                          {change.changeType}
                        </span>
                        <strong>{change.label}</strong>
                        <span>{SECTION_LABELS[change.section] || change.section}</span>
                      </div>
                      <div className="revision-diff-grid">
                        <div>
                          <label>Before</label>
                          <RevisionValue value={change.before} />
                        </div>
                        <div>
                          <label>After</label>
                          <RevisionValue value={change.after} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default ProjectRevisionHistory;
