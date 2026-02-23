import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import ProjectReactivateModal from "../../components/ProjectReactivateModal/ProjectReactivateModal";
import "./CancelledOrders.css";

const getGroupProjects = (group) =>
  (Array.isArray(group?.projects) ? group.projects : []).slice();

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const CancelledOrders = () => {
  const navigate = useNavigate();
  const [orderGroups, setOrderGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reactivatingId, setReactivatingId] = useState("");
  const [reactivateModalProject, setReactivateModalProject] = useState(null);
  const [reactivateError, setReactivateError] = useState("");

  const fetchCancelledOrders = async () => {
    try {
      setError("");
      const res = await fetch(
        "/api/projects/orders?source=admin&collapseRevisions=true&cancelled=true",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (!res.ok) {
        throw new Error("Failed to load cancelled orders.");
      }

      const data = await res.json();
      setOrderGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Cancelled orders fetch error:", err);
      setError(err.message || "Failed to load cancelled orders.");
      setOrderGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCancelledOrders();
  }, []);

  useRealtimeRefresh(() => fetchCancelledOrders());

  const filteredGroups = useMemo(() => {
    const token = searchQuery.trim().toLowerCase();
    if (!token) return orderGroups;

    return orderGroups
      .map((group) => {
        const projects = getGroupProjects(group).filter((project) => {
          const orderId = String(project?.orderId || "").toLowerCase();
          const projectName = String(
            project?.details?.projectName || "",
          ).toLowerCase();
          const client = String(project?.details?.client || "").toLowerCase();
          const reason = String(
            project?.cancellation?.reason || "",
          ).toLowerCase();
          return (
            orderId.includes(token) ||
            projectName.includes(token) ||
            client.includes(token) ||
            reason.includes(token)
          );
        });

        return {
          ...group,
          projects,
        };
      })
      .filter((group) => getGroupProjects(group).length > 0);
  }, [orderGroups, searchQuery]);

  const handleOpenProject = (projectId) => {
    if (!projectId) return;
    navigate(`/projects/${projectId}`);
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
  };

  const handleReactivate = async () => {
    const project = reactivateModalProject;
    const projectId = project?._id;
    if (!projectId || reactivatingId) return;

    setReactivatingId(projectId);
    setReactivateError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/reactivate?source=admin`, {
        method: "PATCH",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to reactivate project.");
      }

      setReactivateModalProject(null);
      setReactivateError("");
      await fetchCancelledOrders();
    } catch (err) {
      console.error("Project reactivation error:", err);
      setReactivateError(err.message || "Failed to reactivate project.");
    } finally {
      setReactivatingId("");
    }
  };

  return (
    <div className="cancelled-orders-page">
      <header className="cancelled-orders-header">
        <div>
          <h1>Cancelled Orders</h1>
          <p>
            Cancelled projects are frozen here until reactivated. Reactivation
            restores the project exactly where it was paused.
          </p>
        </div>
        <input
          type="text"
          className="cancelled-orders-search"
          placeholder="Search order, project, client, reason..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </header>

      {loading ? (
        <div className="cancelled-orders-empty">Loading cancelled orders...</div>
      ) : error ? (
        <div className="cancelled-orders-empty error">{error}</div>
      ) : filteredGroups.length === 0 ? (
        <div className="cancelled-orders-empty">
          No cancelled orders found.
        </div>
      ) : (
        <div className="cancelled-orders-groups">
          {filteredGroups.map((group) => {
            const projects = getGroupProjects(group).sort((a, b) => {
              const aTime = new Date(a?.cancellation?.cancelledAt || 0).getTime();
              const bTime = new Date(b?.cancellation?.cancelledAt || 0).getTime();
              return bTime - aTime;
            });
            const groupKey = group?.id || group?.orderNumber;

            return (
              <section key={groupKey} className="cancelled-order-group">
                <div className="cancelled-order-group-header">
                  <h2>{group?.orderNumber || "UNASSIGNED"}</h2>
                  <span>{group?.client || "Unknown Client"}</span>
                </div>

                <div className="cancelled-order-list">
                  {projects.map((project) => {
                    const projectId = project?._id;
                    const isReactivating = reactivatingId === projectId;
                    const cancellation = project?.cancellation || {};

                    return (
                      <article
                        key={projectId || project?.orderId}
                        className="cancelled-order-item"
                      >
                        <div>
                          <h3>{project?.details?.projectName || "Unnamed Project"}</h3>
                          <p>
                            <strong>Order:</strong> {project?.orderId || "N/A"}
                          </p>
                          <p>
                            <strong>Client:</strong>{" "}
                            {project?.details?.client || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p>
                            <strong>Frozen Stage:</strong>{" "}
                            {cancellation?.resumedStatus || project?.status || "N/A"}
                          </p>
                          <p>
                            <strong>Cancelled At:</strong>{" "}
                            {formatDateTime(cancellation?.cancelledAt)}
                          </p>
                          <p>
                            <strong>Reason:</strong>{" "}
                            {cancellation?.reason?.trim()
                              ? cancellation.reason
                              : "No reason provided."}
                          </p>
                        </div>
                        <div className="cancelled-order-actions">
                          <button
                            type="button"
                            className="cancelled-order-btn open"
                            onClick={() => handleOpenProject(projectId)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="cancelled-order-btn reactivate"
                            onClick={() => handleOpenReactivateModal(project)}
                            disabled={isReactivating}
                          >
                            {isReactivating ? "Reactivating..." : "Reactivate"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ProjectReactivateModal
        isOpen={Boolean(reactivateModalProject)}
        onClose={closeReactivateModal}
        onConfirm={handleReactivate}
        isSubmitting={Boolean(reactivatingId)}
        orderId={reactivateModalProject?.orderId}
        projectName={reactivateModalProject?.details?.projectName}
        frozenStage={
          reactivateModalProject?.cancellation?.resumedStatus ||
          reactivateModalProject?.status
        }
        errorMessage={reactivateError}
      />
    </div>
  );
};

export default CancelledOrders;
