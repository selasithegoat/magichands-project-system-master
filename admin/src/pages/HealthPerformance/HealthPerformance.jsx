import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import ProjectHealthBadge from "@client/components/ui/ProjectHealthBadge";
import { renderProjectName } from "../../utils/projectName";
import "./HealthPerformance.css";

const HealthPerformance = () => {
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery({
    queryKey: ["projects", "health-performance", "admin"],
    queryFn: async () => {
      const response = await fetch("/api/projects/health-performance?source=admin", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load project performance.");
      return response.json();
    },
    meta: { realtimePaths: ["/api/projects"] },
  });

  if (isPending) return <div className="health-performance-state">Loading project performance…</div>;
  if (error) return <div className="health-performance-state error">{error.message}</div>;

  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const leads = Array.isArray(data?.leads) ? data.leads : [];

  return (
    <div className="health-performance-page">
      <header className="health-performance-hero">
        <div>
          <span>Portfolio intelligence</span>
          <h1>Project Performance</h1>
          <p>Best-performing active projects and project leads, ranked by explainable health risk.</p>
        </div>
        <div className="health-performance-method">
          <strong>Fair-ranking rule</strong>
          <span>Leads need at least {data?.methodology?.minimumLeadProjects || 3} active projects for an official rank.</span>
        </div>
      </header>

      <div className="health-performance-summary">
        <div><strong>{data?.summary?.activeProjects || 0}</strong><span>Active projects</span></div>
        <div><strong>{data?.summary?.rankedLeads || 0}</strong><span>Ranked leads</span></div>
        <div><strong>{data?.summary?.provisionalLeads || 0}</strong><span>Provisional leads</span></div>
      </div>

      <section className="health-ranking-section">
        <div className="health-ranking-heading">
          <div><span>Project ranking</span><h2>Best Performing Projects</h2></div>
          <p>Active projects with the strongest current health and fewest operational risks.</p>
        </div>
        <div className="health-ranking-table">
          {projects.map((project, index) => (
            <button key={project._id} type="button" className="health-project-row" onClick={() => navigate(`/projects/${project._id}`)}>
              <span className="health-rank">#{index + 1}</span>
              <span className="health-project-name">
                <strong>{project.orderId || "Order"} · {renderProjectName(project.details, null, "Untitled Project")}</strong>
                <small>{project.details?.client || "Unknown client"} · {project.status}</small>
              </span>
              <span className="health-lead-name">{project.lead?.firstName || project.lead?.name || "Unassigned"} {project.lead?.lastName || ""}</span>
              <ProjectHealthBadge health={project.health} />
            </button>
          ))}
          {projects.length === 0 && <div className="health-empty">No active projects available.</div>}
        </div>
      </section>

      <section className="health-ranking-section">
        <div className="health-ranking-heading">
          <div><span>Lead ranking</span><h2>Best Performing Leads</h2></div>
          <p>Average health across each lead’s current active project portfolio.</p>
        </div>
        <div className="lead-ranking-grid">
          {leads.map((entry, index) => (
            <article key={entry.lead?._id || index} className={`lead-ranking-card ${entry.rankingEligible ? "" : "provisional"}`}>
              <div className="lead-ranking-top">
                <span className="health-rank">#{entry.rankingEligible ? index + 1 : "–"}</span>
                <div><h3>{entry.lead?.name || "Unknown lead"}</h3><small>{entry.rankingEligible ? "Official ranking" : "Provisional · fewer than 3 projects"}</small></div>
                <strong className="lead-average">{entry.averageHealth}<small>/100</small></strong>
              </div>
              <div className="lead-risk-mix">
                <span>{entry.projectCount} projects</span><span>{entry.healthy} healthy</span><span>{entry.watch} watch</span><span>{entry.atRisk} at risk</span><span>{entry.critical} critical</span>
              </div>
            </article>
          ))}
          {leads.length === 0 && <div className="health-empty">No assigned active projects available.</div>}
        </div>
      </section>
    </div>
  );
};

export default HealthPerformance;
