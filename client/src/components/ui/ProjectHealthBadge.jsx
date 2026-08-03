import React from "react";
import "./ProjectHealthBadge.css";

const ProjectHealthBadge = ({ health, showScore = true, expanded = false }) => {
  if (!health?.level) return null;
  const reasons = Array.isArray(health.reasons) ? health.reasons : [];
  const title = reasons.length
    ? reasons.map((reason) => reason.label).join(" · ")
    : "No active health concerns";

  return (
    <div className={`project-health ${health.level} ${expanded ? "expanded" : ""}`} title={title}>
      <div className="project-health-summary">
        <span className="project-health-dot" aria-hidden="true" />
        <strong>{health.label || "Health"}</strong>
        {showScore && <span>{Number(health.score) || 0}/100</span>}
      </div>
      {expanded && (
        <div className="project-health-reasons">
          {reasons.length > 0 ? (
            reasons.map((reason) => <span key={reason.code}>• {reason.label}</span>)
          ) : (
            <span>No active health concerns.</span>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectHealthBadge;
