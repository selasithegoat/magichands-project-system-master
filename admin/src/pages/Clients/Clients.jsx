import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import "./Clients.css";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";

const Clients = ({ user }) => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState("all");
  const [expandedClients, setExpandedClients] = useState(new Set());

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/projects/clients", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data);
      } else {
        console.error("Failed to fetch clients");
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useRealtimeRefresh(() => fetchClients());

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "-";
    if (timeStr.includes("T")) {
      return new Date(timeStr).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
    if (match) {
      let [_, h, m, period] = match;
      h = parseInt(h);
      if (period.toUpperCase() === "PM" && h < 12) h += 12;
      if (period.toUpperCase() === "AM" && h === 12) h = 0;
      return `${h.toString().padStart(2, "0")}:${m}`;
    }
    return timeStr;
  };

  const getStatusClass = (status) => {
    if (!status) return "draft";
    const lower = status.toLowerCase();
    if (lower.includes("feedback")) return "in-progress";
    if (lower.includes("pending")) return "pending";
    if (lower.includes("finished")) return "completed";
    if (lower.includes("completed")) return "completed";
    if (lower.includes("delivered") || lower.includes("progress"))
      return "in-progress";
    return "draft";
  };

  const getContactOrEmail = (project) => {
    const email = (project?.details?.clientEmail || "").trim();
    const phone = (project?.details?.clientPhone || "").trim();

    if (email && phone) return `${email} / ${phone}`;
    return email || phone || "-";
  };

  const toggleClientExpand = (clientName) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientName)) {
      newExpanded.delete(clientName);
    } else {
      newExpanded.add(clientName);
    }
    setExpandedClients(newExpanded);
  };

  // Filter clients by search query and project status
  const filteredClients = clients
    .map((client) => {
      // Filter projects within each client based on status filter
      let filteredProjects = client.projects;

      if (projectStatusFilter === "ongoing") {
        filteredProjects = client.projects.filter(
          (p) => p.status !== "Completed" && p.status !== "Finished",
        );
      } else if (projectStatusFilter === "completed") {
        filteredProjects = client.projects.filter(
          (p) => p.status === "Completed" || p.status === "Finished",
        );
      }

      return {
        ...client,
        projects: filteredProjects,
        projectCount: filteredProjects.length,
      };
    })
    .filter((client) => {
      // Filter out clients with no projects after status filter
      if (client.projectCount === 0) return false;
      // Filter by client name search
      return client.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

  return (
    <div className="clients-page">
      <div className="clients-header">
        <h1>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="clients-icon"
          >
            <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
          </svg>
          Clients
        </h1>
      </div>

      <div className="clients-container">
        <div className="clients-controls">
          <div className="filter-bar">
            <div className="search-pill-wrapper">
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-pill"
              />
              <div className="search-icon-small">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <select
              value={projectStatusFilter}
              onChange={(e) => setProjectStatusFilter(e.target.value)}
              className="filter-pill"
            >
              <option value="all">All Projects</option>
              <option value="ongoing">Ongoing Projects</option>
              <option value="completed">Completed Projects</option>
            </select>
          </div>
          <div className="result-count">
            Showing {filteredClients.length} of {clients.length} clients
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading clients...</div>
        ) : filteredClients.length === 0 ? (
          <div className="empty-state">
            {searchQuery
              ? "No clients found matching your search."
              : "No clients found."}
          </div>
        ) : (
          <div className="clients-list">
            {filteredClients.map((client) => (
              <div key={client.name} className="client-card">
                <div
                  className="client-header"
                  onClick={() => toggleClientExpand(client.name)}
                >
                  <div className="client-info">
                    <h3 className="client-name">{client.name}</h3>
                    <span className="project-count">
                      {client.projectCount}{" "}
                      {client.projectCount === 1 ? "project" : "projects"}
                    </span>
                  </div>
                  <div className="expand-icon">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className={`chevron ${
                        expandedClients.has(client.name) ? "expanded" : ""
                      }`}
                    >
                      <path
                        fillRule="evenodd"
                        d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>

                {expandedClients.has(client.name) && (
                  <div className="client-projects">
                    <table className="projects-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Project Name</th>
                          <th>Lead</th>
                          <th>Assigned Date</th>
                          <th>Contact / Email</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {client.projects.map((project) => (
                          <tr key={project._id}>
                            <td>
                              <span style={{ fontWeight: 600 }}>
                                {project.orderId || "N/A"}
                              </span>
                            </td>
                            <td>
                              {project.details?.projectName || "Untitled"}
                            </td>
                            <td>
                              {getLeadDisplay(project, "Unassigned")}
                            </td>
                            <td>
                              {formatDate(
                                project.orderDate || project.createdAt,
                              )}
                            </td>
                            <td>{getContactOrEmail(project)}</td>
                            <td>
                              <span
                                className={`status-badge ${getStatusClass(
                                  project.status,
                                )}`}
                              >
                                {project.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="action-btn"
                                onClick={() =>
                                  window.location.assign(
                                    `/projects/${project._id}`,
                                  )
                                }
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Clients;
