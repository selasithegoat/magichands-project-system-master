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
  legacy_revision_import: "Legacy Revision Summary",
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
      <details className="revision-value-disclosure">
        <summary>
          View {value.length} {value.length === 1 ? "entry" : "entries"}
        </summary>
        <ul className="revision-value-list">
          {value.map((entry, index) => (
            <li key={entry?._id || `${describeObject(entry)}-${index}`}>
              {describeObject(entry)}
            </li>
          ))}
        </ul>
      </details>
    );
  }
  if (typeof value === "object") {
    const description = describeObject(value);
    if (!description.trim().startsWith("{")) {
      return <span className="revision-text-value">{description}</span>;
    }
    return (
      <details className="revision-value-disclosure">
        <summary>View details</summary>
        <pre className="revision-value-json">{description}</pre>
      </details>
    );
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

const RevisionChangeRow = ({ change }) => {
  const isAdded = change.changeType === "added";
  const isRemoved = change.changeType === "removed";
  const showSingleValue = isAdded || isRemoved;
  const singleValue = isRemoved ? change.before : change.after;
  const singleValueLabel = isRemoved ? "Removed value" : "Added value";

  return (
    <div className={`revision-change-row ${change.changeType}`}>
      <div className="revision-change-title">
        <span className="revision-change-type">
          {change.changeType}
        </span>
        <strong>{change.label}</strong>
      </div>
      {showSingleValue ? (
        <div className="revision-single-value">
          <label>{singleValueLabel}</label>
          <RevisionValue value={singleValue} />
        </div>
      ) : (
        <div className="revision-diff-grid">
          <div>
            <label>Previous</label>
            <RevisionValue value={change.before} />
          </div>
          <div className="revision-after-value">
            <label>Updated</label>
            <RevisionValue value={change.after} />
          </div>
        </div>
      )}
    </div>
  );
};

const RevisionSectionGroup = ({
  section,
  changes,
  forceOpen,
}) => (
  <details className="revision-section-group" open={forceOpen || undefined}>
    <summary>
      <span className="revision-section-initial" aria-hidden="true">
        {(SECTION_LABELS[section] || section || "?").charAt(0)}
      </span>
      <strong>{SECTION_LABELS[section] || section}</strong>
      <small>
        {changes.length} {changes.length === 1 ? "change" : "changes"}
      </small>
      <span className="revision-section-chevron" aria-hidden="true" />
    </summary>
    <div className="revision-section-change-list">
      {changes.map((change, index) => (
        <RevisionChangeRow
          key={`${change.field}-${index}`}
          change={change}
        />
      ))}
    </div>
  </details>
);

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
  const sectionCounts = useMemo(() => {
    const counts = Object.fromEntries(
      REVISION_SECTIONS.map((section) => [section.key, 0]),
    );
    revisions.forEach((revision) => {
      (revision.changes || []).forEach((change) => {
        if (Object.prototype.hasOwnProperty.call(counts, change.section)) {
          counts[change.section] += 1;
        }
      });
    });
    return counts;
  }, [revisions]);
  const filteredRevisions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return revisions
      .map((revision) => {
        const sectionChanges = (revision.changes || []).filter(
          (change) => sectionFilter === "all" || change.section === sectionFilter,
        );
        const revisionSearchText = [
        `R${revision.revisionNumber}`,
        getActorName(revision),
        revision.reason,
        SOURCE_LABELS[revision.source] || revision.source,
        ...(revision.sections || []).map((section) => SECTION_LABELS[section]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
        const revisionMatchesSearch =
          normalizedSearch && revisionSearchText.includes(normalizedSearch);
        const visibleChanges = !normalizedSearch || revisionMatchesSearch
          ? sectionChanges
          : sectionChanges.filter((change) =>
              [
                change.label,
                SECTION_LABELS[change.section] || change.section,
                change.changeType,
                valueSearchText(change.before),
                valueSearchText(change.after),
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(normalizedSearch),
            );
        const showMetadataOnlyRevision =
          (revision.changes || []).length === 0 &&
          sectionFilter === "all" &&
          (!normalizedSearch || revisionMatchesSearch);

        return {
          ...revision,
          visibleChanges,
          showMetadataOnlyRevision,
          visibleSections: Array.from(
            new Set(visibleChanges.map((change) => change.section)),
          ),
        };
      })
      .filter(
        (revision) =>
          revision.visibleChanges.length > 0 || revision.showMetadataOnlyRevision,
      );
  }, [revisions, searchTerm, sectionFilter]);

  const totalChangeCount = revisions.reduce(
    (total, revision) => total + (revision.changes?.length || 0),
    0,
  );
  const visibleChangeCount = filteredRevisions.reduce(
    (total, revision) => total + revision.visibleChanges.length,
    0,
  );
  const hasActiveFilters = sectionFilter !== "all" || Boolean(searchTerm.trim());

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
          <span>Find a change</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search field, person, reason, or value"
          />
        </label>
        <div className="revision-filter-summary">
          <span>
            {revisions.length} {revisions.length === 1 ? "entry" : "entries"}
          </span>
          <strong>{totalChangeCount} tracked changes</strong>
        </div>
      </div>

      <div className="revision-section-filters" aria-label="Filter by project section">
        <button
          type="button"
          className={sectionFilter === "all" ? "active" : ""}
          aria-pressed={sectionFilter === "all"}
          onClick={() => setSectionFilter("all")}
        >
          <span>All</span>
          <small>{revisions.length}</small>
        </button>
        {REVISION_SECTIONS.map((section) => (
          <button
            type="button"
            key={section.key}
            className={sectionFilter === section.key ? "active" : ""}
            aria-pressed={sectionFilter === section.key}
            onClick={() => setSectionFilter(section.key)}
            disabled={sectionCounts[section.key] === 0}
          >
            <span>{section.label}</span>
            <small>{sectionCounts[section.key]}</small>
          </button>
        ))}
      </div>

      <div className="revision-results-summary" aria-live="polite">
        <span>
          Showing <strong>{filteredRevisions.length}</strong>{" "}
          {filteredRevisions.length === 1 ? "history entry" : "history entries"}
          {" and "}
          <strong>{visibleChangeCount}</strong>{" "}
          {visibleChangeCount === 1 ? "change" : "changes"}
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setSectionFilter("all");
              setSearchTerm("");
            }}
          >
            Clear filters
          </button>
        )}
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
        {filteredRevisions.map((revision) => {
          const isLegacyRevision = revision.source === "legacy_revision_import";
          const sectionGroups = revision.visibleSections.map((section) => ({
            section,
            changes: revision.visibleChanges.filter(
              (change) => change.section === section,
            ),
          }));
          const forceSectionsOpen = hasActiveFilters || sectionGroups.length === 1;

          return (
            <article className="revision-card" key={revision._id}>
              <div className="revision-card-marker" aria-hidden="true">
                R{revision.revisionNumber}
              </div>
              <div className="revision-card-content">
                <div className="revision-card-header">
                  <div>
                    <div className="revision-card-title-row">
                      <h3>
                        {isLegacyRevision
                          ? `Legacy revisions through R${revision.revisionNumber}`
                          : `Revision R${revision.revisionNumber}`}
                      </h3>
                      <span className="revision-project-version">
                        Project v{revision.projectVersionNumber || 1}
                      </span>
                    </div>
                    <p>
                      {getActorName(revision)} · {formatDateTime(revision.createdAt)}
                    </p>
                  </div>
                  <div className="revision-card-summary-count">
                    {isLegacyRevision ? (
                      <span>Legacy summary</span>
                    ) : (
                      <>
                        <strong>{revision.visibleChanges.length}</strong>
                        <span>
                          {revision.visibleChanges.length === 1
                            ? "change"
                            : "changes"}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="revision-card-context">
                  <span className="revision-source">
                    {SOURCE_LABELS[revision.source] || "Project Edit"}
                  </span>
                  {sectionGroups.length > 0 && (
                    <span>
                      {sectionGroups.length} project{" "}
                      {sectionGroups.length === 1 ? "section" : "sections"}
                    </span>
                  )}
                </div>

                {isLegacyRevision ? (
                  <div className="revision-legacy-note">
                    <strong>Earlier revision activity</strong>
                    <span>
                      {revision.reason ||
                        "Revision activity was recorded before detailed field tracking began. Field-level differences are unavailable."}
                    </span>
                  </div>
                ) : (
                  revision.reason && (
                    <div className="revision-reason">
                      <strong>Reason</strong>
                      <span>{revision.reason}</span>
                    </div>
                  )
                )}

                <div className="revision-section-groups">
                  {sectionGroups.map(({ section, changes }) => (
                    <RevisionSectionGroup
                      key={section}
                      section={section}
                      changes={changes}
                      forceOpen={forceSectionsOpen}
                    />
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ProjectRevisionHistory;
