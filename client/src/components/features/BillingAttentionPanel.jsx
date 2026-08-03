import React from "react";
import { renderProjectName } from "../../utils/projectName";
import "./BillingAttentionPanel.css";

const CATEGORY_COPY = {
  blocked: { label: "Blocked", tone: "danger" },
  override_active: { label: "Override active", tone: "warning" },
  delivered_unresolved: { label: "Delivered unresolved", tone: "critical" },
};

const BillingAttentionPanel = ({ summary, loading = false, onOpenProject }) => {
  const counts = summary?.counts || {};
  const projects = Array.isArray(summary?.projects) ? summary.projects : [];
  const total = Number(counts.total) || 0;

  if (!loading && total === 0) return null;

  return (
    <section className="billing-attention-panel" aria-label="Billing attention">
      <div className="billing-attention-heading">
        <div>
          <span className="billing-attention-eyebrow">Immediate attention</span>
          <h2>Billing Attention</h2>
          <p>Projects remain here until the required invoice or payment is verified.</p>
        </div>
        <div className="billing-attention-total">{loading ? "…" : total}</div>
      </div>

      {!loading && (
        <div className="billing-attention-counts">
          <span>{Number(counts.blocked) || 0} blocked</span>
          <span>{Number(counts.override_active) || 0} overridden</span>
          <span>{Number(counts.delivered_unresolved) || 0} delivered unresolved</span>
        </div>
      )}

      <div className="billing-attention-list">
        {projects.map((project) => {
          const category = CATEGORY_COPY[project.category] || CATEGORY_COPY.blocked;
          const projectName = renderProjectName(project.details, null, "Untitled Project");
          return (
            <button
              key={project._id}
              type="button"
              className="billing-attention-row"
              onClick={() => onOpenProject?.(project)}
            >
              <span className={`billing-attention-status ${category.tone}`}>
                {category.label}
              </span>
              <span className="billing-attention-project">
                <strong>{project.orderId || "Order"} · {projectName}</strong>
                <small>
                  {project.details?.client || "Unknown client"} · {project.status || "Unknown status"}
                </small>
              </span>
              <span className="billing-attention-missing">
                <strong>Missing</strong>
                <small>{(project.missingLabels || []).join(", ")}</small>
                {project.override?.reason && <em>Override: {project.override.reason}</em>}
              </span>
              <span className="billing-attention-arrow" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
      {!loading && total > projects.length && (
        <p className="billing-attention-more">Showing the {projects.length} most urgent of {total} projects.</p>
      )}
    </section>
  );
};

export default BillingAttentionPanel;
