import React from "react";
import { Link } from "react-router-dom";
import "./ReferenceProjectsCard.css";

const toProjectId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    if (value._id) return toProjectId(value._id);
    if (value.id) return String(value.id).trim();
  }
  return "";
};

const normalizeReferenceProject = (value) => {
  const project = value?.project || value || {};
  const id = toProjectId(project);
  if (!id) return null;
  const details = project.details || {};

  return {
    _id: id,
    orderId: String(project.orderId || value?.orderId || "").trim(),
    projectName: String(
      details.projectName || project.projectName || value?.projectName || "",
    ).trim(),
    client: String(details.client || project.client || value?.client || "").trim(),
    projectType: String(project.projectType || value?.projectType || "").trim(),
    status: String(project.status || value?.status || "").trim(),
  };
};

const getReferenceTitle = (reference) => {
  const orderId = reference.orderId;
  const projectName = reference.projectName;
  if (orderId && projectName) return `${orderId} - ${projectName}`;
  return orderId || projectName || "Referenced order";
};

const ReferenceProjectsCard = ({
  project,
  variant = "detail",
  className = "",
}) => {
  const currentProjectId = toProjectId(project);
  const seen = new Set();
  const references = (Array.isArray(project?.referenceProjects)
    ? project.referenceProjects
    : []
  )
    .map(normalizeReferenceProject)
    .filter((reference) => {
      if (!reference?._id || seen.has(reference._id)) return false;
      seen.add(reference._id);
      return true;
    });

  if (references.length === 0) return null;

  const cardClassName = [
    "reference-projects-card",
    `reference-projects-card-${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={cardClassName}>
      <div className="reference-projects-card-header">
        <span className="reference-projects-kicker">Linked context</span>
        <h3>Reference Orders</h3>
      </div>
      <div className="reference-projects-list">
        {references.map((reference) => {
          const search = currentProjectId
            ? `?referenceFrom=${encodeURIComponent(currentProjectId)}`
            : "";
          return (
            <Link
              key={reference._id}
              to={{
                pathname: `/detail/${reference._id}`,
                search,
              }}
              className="reference-project-link"
            >
              <span className="reference-project-link-title">
                {getReferenceTitle(reference)}
              </span>
              <span className="reference-project-link-meta">
                {[reference.client, reference.projectType, reference.status]
                  .filter(Boolean)
                  .join(" - ")}
              </span>
              <span className="reference-project-link-action">Open project</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default ReferenceProjectsCard;
