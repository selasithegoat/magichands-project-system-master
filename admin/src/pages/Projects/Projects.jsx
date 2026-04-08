import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import "./Projects.css";
import { TrashIcon, ProjectsIcon } from "../../icons/Icons";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";
import { renderProjectName } from "../../utils/projectName";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
} from "@client/utils/quoteStatus";

const GROUP_ROW_TRANSITION_MS = 220;
const URGENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const CLOSED_PROJECT_STATUSES = new Set(["Completed", "Finished", "Declined"]);
const PENDING_PROJECT_STATUSES = new Set([
  "Order Created",
  "Quote Created",
  "Pending Acceptance",
]);
const DELIVERY_PROJECT_STATUSES = new Set(["Pending Delivery/Pickup"]);
const POST_DELIVERY_PROJECT_STATUSES = new Set([
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
  "Declined",
]);
const FINISHED_STATUS_QUERY_VALUES = new Set([
  "completed",
  "finished",
  "declined",
  "closed",
  "archive",
  "archived",
]);

const ACTIVE_STATUS_OPTIONS = [
  { value: "All", label: "All Active Statuses" },
  { value: "__PENDING__", label: "Pending Acceptance" },
  { value: "__DELIVERY__", label: "Pending Delivery" },
  { value: "__QUOTE__", label: "Quotes" },
  { value: "__CORPORATE__", label: "Corporate Projects" },
  { value: "__EMERGENCY__", label: "Emergencies" },
  { value: "__URGENT__", label: "Critical / Overdue" },
  { value: "Draft", label: "Draft" },
  { value: "New Order", label: "New Order" },
  { value: "Order Created", label: "Order Created" },
  { value: "Pending Approval", label: "Pending Approval" },
  { value: "Pending Scope Approval", label: "Pending Scope Approval" },
  {
    value: "Pending Departmental Meeting",
    label: "Pending Departmental Meeting",
  },
  {
    value: "Pending Departmental Engagement",
    label: "Pending Departmental Engagement",
  },
  {
    value: "Departmental Engagement Completed",
    label: "Departmental Engagement Completed",
  },
  { value: "Pending Mockup", label: "Pending Mockup" },
  { value: "Pending Master Approval", label: "Pending Master Approval" },
  { value: "Pending Production", label: "Pending Production" },
  { value: "Pending Quality Control", label: "Pending Quality Control" },
  { value: "Pending Photography", label: "Pending Photography" },
  { value: "Pending Packaging", label: "Pending Packaging" },
  { value: "Pending Delivery/Pickup", label: "Pending Delivery/Pickup" },
  { value: "On Hold", label: "On Hold" },
  { value: "In Progress", label: "In Progress" },
  { value: "Pending Feedback", label: "Pending Feedback" },
  { value: "Feedback Completed", label: "Feedback Completed" },
  { value: "Delivered", label: "Delivered" },
  { value: "Quote Created", label: "Quote Created" },
  {
    value: "Pending Quote Requirements",
    label: "Pending Quote Requirements",
  },
  { value: "Pending Cost Verification", label: "Pending Cost" },
  {
    value: "Cost Verification Completed",
    label: "Cost Completed",
  },
  {
    value: "Pending Sample Retrieval",
    label: "Pending Sample Retrieval",
  },
  {
    value: "Pending Quote Submission",
    label: "Pending Quote Submission",
  },
  {
    value: "Pending Bid Submission / Documents",
    label: "Pending Bid Submission / Documents",
  },
  {
    value: "Quote Submission Completed",
    label: "Quote Submission Completed",
  },
  { value: "Pending Client Decision", label: "Pending Client Decision" },
];

const FINISHED_STATUS_OPTIONS = [
  { value: "All", label: "All Finished Statuses" },
  { value: "Completed", label: "Completed" },
  { value: "Finished", label: "Finished" },
  { value: "Declined", label: "Declined" },
];

const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";
const isQuoteProject = (project) => project?.projectType === "Quote";
const isCorporateProject = (project) => project?.projectType === "Corporate Job";
const isPendingDeliveryProject = (project) =>
  DELIVERY_PROJECT_STATUSES.has(project?.status);
const getProjectStatusDisplay = (project) =>
  isQuoteProject(project)
    ? getQuoteStatusDisplay(
        project?.status || "",
        getQuoteRequirementMode(project?.quoteDetails?.checklist || {}),
      )
    : project?.status || "";
const isClosedProject = (project) =>
  CLOSED_PROJECT_STATUSES.has(getProjectStatusDisplay(project));

const isUrgentProject = (project) => {
  const deliveryDateValue = project?.details?.deliveryDate;
  if (!deliveryDateValue) return false;

  const deliveryDate = new Date(deliveryDateValue);
  if (Number.isNaN(deliveryDate.getTime())) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return (
    deliveryDate - now <= URGENT_WINDOW_MS &&
    !POST_DELIVERY_PROJECT_STATUSES.has(project?.status)
  );
};

const getDefaultFilterStatus = (mode) => "All";

const getMappedStatusFilter = (normalizedStatus, mode) => {
  if (!normalizedStatus) return null;

  if (mode === "finished") {
    if (normalizedStatus === "completed") return "Completed";
    if (normalizedStatus === "finished") return "Finished";
    if (normalizedStatus === "declined") return "Declined";
    if (
      normalizedStatus === "closed" ||
      normalizedStatus === "archive" ||
      normalizedStatus === "archived"
    ) {
      return "All";
    }
    return null;
  }

  if (normalizedStatus === "active") return "All";
  if (normalizedStatus === "pending") return "__PENDING__";
  if (normalizedStatus === "delivery" || normalizedStatus === "pending-delivery")
    return "__DELIVERY__";
  if (normalizedStatus === "quote" || normalizedStatus === "quotes")
    return "__QUOTE__";
  if (normalizedStatus === "corporate" || normalizedStatus === "corporates")
    return "__CORPORATE__";
  if (normalizedStatus === "emergency" || normalizedStatus === "emergencies")
    return "__EMERGENCY__";
  if (
    normalizedStatus === "critical" ||
    normalizedStatus === "urgent" ||
    normalizedStatus === "overdue"
  ) {
    return "__URGENT__";
  }

  return ACTIVE_STATUS_OPTIONS.some(
    (option) => option.value === normalizedStatus || option.value.toLowerCase() === normalizedStatus,
  )
    ? ACTIVE_STATUS_OPTIONS.find(
        (option) =>
          option.value === normalizedStatus ||
          option.value.toLowerCase() === normalizedStatus,
      )?.value || null
    : null;
};

const getPageConfig = (mode) =>
  mode === "finished"
    ? {
        title: "Finished Projects",
        description:
          "Completed, finished, and declined projects are archived here.",
        loadingLabel: "Loading finished projects...",
        emptyLabel: "No finished projects found matching filter.",
        statusOptions: FINISHED_STATUS_OPTIONS,
      }
    : {
        title: "Projects",
        description: "Active projects currently moving through production.",
        loadingLabel: "Loading active projects...",
        emptyLabel: "No active projects found matching filter.",
        statusOptions: ACTIVE_STATUS_OPTIONS,
      };

const Projects = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [expandedOrderGroups, setExpandedOrderGroups] = useState({});
  const [collapsingOrderGroups, setCollapsingOrderGroups] = useState({});
  const collapseTimersRef = useRef({});
  const [loading, setLoading] = useState(true);

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    projectId: null,
  });

  // Pagination & Filter State
  const [viewMode, setViewMode] = useState("active");
  const [filterStatus, setFilterStatus] = useState(getDefaultFilterStatus("active"));
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("All");
  const [leadFilter, setLeadFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);
  const isFinishedView = viewMode === "finished";
  const pageConfig = getPageConfig(viewMode);

  const openProjectDetails = (project) => {
    const projectId = project?._id;
    if (!projectId) return;
    navigate(`/projects/${projectId}`, { state: { project } });
  };

  const openOrderGroup = (orderNumber) => {
    const normalized = String(orderNumber || "").trim();
    if (!normalized) return;
    navigate(`/projects/orders/${encodeURIComponent(normalized)}`);
  };

  const buildFallbackOrderGroups = (projectList = []) => {
    const groups = new Map();

    projectList.forEach((project, index) => {
      const orderNumber = String(
        project?.orderRef?.orderNumber || project?.orderId || "UNASSIGNED",
      ).trim();
      const groupKey = orderNumber || project?._id || `fallback-${index}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          orderRef: project?.orderRef?._id || project?.orderRef || null,
          orderNumber: orderNumber || "UNASSIGNED",
          orderDate: project?.orderRef?.orderDate || project?.orderDate || null,
          client: project?.orderRef?.client || project?.details?.client || "",
          clientEmail:
            project?.orderRef?.clientEmail || project?.details?.clientEmail || "",
          clientPhone:
            project?.orderRef?.clientPhone || project?.details?.clientPhone || "",
          projects: [],
        });
      }

      groups.get(groupKey).projects.push(project);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aTime = new Date(
        a.orderDate || a.projects?.[0]?.createdAt || 0,
      ).getTime();
      const bTime = new Date(
        b.orderDate || b.projects?.[0]?.createdAt || 0,
      ).getTime();
      return bTime - aTime;
    });
  };

  const fetchProjects = async () => {
    try {
      const [projectsRes, groupedRes] = await Promise.all([
        fetch("/api/projects?source=admin", {
          credentials: "include",
        }),
        fetch("/api/projects/orders?source=admin&collapseRevisions=true", {
          credentials: "include",
        }),
      ]);

      let projectsData = [];

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        projectsData = Array.isArray(data) ? data : [];
      } else {
        console.error("Failed to fetch projects");
      }

      if (groupedRes.ok) {
        const groupedData = await groupedRes.json();
        setGroupedOrders(Array.isArray(groupedData) ? groupedData : []);
      } else {
        setGroupedOrders(buildFallbackOrderGroups(projectsData));
        console.error("Failed to fetch grouped orders");
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
      setGroupedOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    const viewQuery = searchParams.get("view");
    const statusQuery = searchParams.get("status");
    let nextViewMode = viewQuery === "finished" ? "finished" : "active";

    if (statusQuery) {
      const normalizedStatus = statusQuery.trim().toLowerCase();
      if (FINISHED_STATUS_QUERY_VALUES.has(normalizedStatus)) {
        nextViewMode = "finished";
      }
    }

    setViewMode(nextViewMode);

    if (!statusQuery) {
      setFilterStatus(getDefaultFilterStatus(nextViewMode));
      setCurrentPage(1);
      return;
    }

    const normalized = statusQuery.trim().toLowerCase();
    const mappedStatus = getMappedStatusFilter(normalized, nextViewMode);

    if (!mappedStatus) {
      setFilterStatus(getDefaultFilterStatus(nextViewMode));
      setCurrentPage(1);
      return;
    }

    setFilterStatus(mappedStatus);
    setCurrentPage(1);
  }, [searchParams]);

  useEffect(
    () => () => {
      Object.values(collapseTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      collapseTimersRef.current = {};
    },
    [],
  );

  useRealtimeRefresh(() => fetchProjects());

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

  const handleDeleteClick = (e, projectId) => {
    e.stopPropagation();
    setDeleteModal({ isOpen: true, projectId });
  };

  const handleDeleteConfirm = async () => {
    const { projectId } = deleteModal;
    if (!projectId) return;

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        await fetchProjects();
      } else {
        alert("Failed to delete project");
      }
    } catch (err) {
      console.error("Error deleting project:", err);
      alert("Error deleting project");
    }
  };

  const getStatusClass = (status) => {
    if (!status) return "draft";
    const lower = status.toLowerCase();
    if (lower.includes("hold")) return "on-hold";
    if (lower.includes("feedback")) return "in-progress";
    if (lower.includes("pending")) return "pending";
    if (lower.includes("finished")) return "completed";
    if (lower.includes("completed")) return "completed";
    if (lower.includes("delivered")) return "in-progress";
    if (lower.includes("progress") || lower.includes("sent"))
      return "in-progress";
    return "draft";
  };

  const getGroupProjects = (group) =>
    Array.isArray(group?.projects) ? group.projects : [];

  const projectCounts = useMemo(
    () =>
      groupedOrders.reduce(
        (counts, group) => {
          const projectsInGroup = Array.isArray(group?.projects) ? group.projects : [];
          projectsInGroup.forEach((project) => {
            if (isClosedProject(project)) {
              counts.finished += 1;
            } else {
              counts.active += 1;
            }
          });
          return counts;
        },
        { active: 0, finished: 0 },
      ),
    [groupedOrders],
  );

  const getGroupClient = (group, projects = []) =>
    group?.client ||
    projects.find((project) => project?.details?.client)?.details?.client ||
    "-";

  const getGroupLeadText = (projects = []) => {
    const leads = Array.from(
      new Set(
        projects
          .map((project) => getLeadDisplay(project, "Unassigned"))
          .filter(Boolean),
      ),
    );
    return leads.length > 0 ? leads.join(", ") : "Unassigned";
  };

  const getGroupStatusSummary = (projects = []) => {
    const statuses = Array.from(
      new Set(projects.map((project) => getProjectStatusDisplay(project)).filter(Boolean)),
    );
    if (statuses.length === 0) {
      return { label: "Draft", className: getStatusClass("Draft") };
    }
    const primary = statuses[0];
    return {
      label:
        statuses.length === 1 ? primary : `${primary} +${statuses.length - 1} more`,
      className: getStatusClass(primary),
    };
  };

  const matchesStatusFilter = (project) => {
    const projectStatus = getProjectStatusDisplay(project);

    if (filterStatus === "All") return true;
    if (isFinishedView) {
      return projectStatus === filterStatus;
    }
    if (filterStatus === "__ACTIVE__") {
      return !CLOSED_PROJECT_STATUSES.has(projectStatus);
    }
    if (filterStatus === "__PENDING__") {
      return PENDING_PROJECT_STATUSES.has(projectStatus);
    }
    if (filterStatus === "__DELIVERY__") {
      return isPendingDeliveryProject(project);
    }
    if (filterStatus === "__QUOTE__") {
      return isQuoteProject(project) && !CLOSED_PROJECT_STATUSES.has(projectStatus);
    }
    if (filterStatus === "__CORPORATE__") {
      return (
        isCorporateProject(project) && !CLOSED_PROJECT_STATUSES.has(projectStatus)
      );
    }
    if (filterStatus === "__EMERGENCY__") {
      return isEmergencyProject(project);
    }
    if (filterStatus === "__URGENT__") {
      return isUrgentProject(project);
    }
    return projectStatus === filterStatus;
  };

  const modeScopedOrderGroups = useMemo(
    () =>
      groupedOrders
        .map((group) => {
          const scopedProjects = getGroupProjects(group).filter((project) =>
            isFinishedView ? isClosedProject(project) : !isClosedProject(project),
          );

          if (scopedProjects.length === 0) return null;

          return {
            ...group,
            projects: scopedProjects,
          };
        })
        .filter(Boolean),
    [groupedOrders, isFinishedView],
  );

  const statusScopedOrderGroups = useMemo(
    () =>
      modeScopedOrderGroups
        .map((group) => {
          const scopedProjects = getGroupProjects(group).filter((project) =>
            matchesStatusFilter(project),
          );

          if (scopedProjects.length === 0) return null;

          return {
            ...group,
            projects: scopedProjects,
          };
        })
        .filter(Boolean),
    [filterStatus, modeScopedOrderGroups],
  );

  const handleViewModeChange = (nextViewMode) => {
    if (nextViewMode === viewMode) return;

    const params = new URLSearchParams(searchParams);
    if (nextViewMode === "finished") {
      params.set("view", "finished");
    } else {
      params.delete("view");
    }
    params.delete("status");

    const queryString = params.toString();
    navigate(queryString ? `/projects?${queryString}` : "/projects", {
      replace: true,
    });
  };

  // Derived Lists
  const uniqueClients = [
    ...new Set(
      modeScopedOrderGroups
        .map((group) => getGroupClient(group, getGroupProjects(group)))
        .filter((c) => c && c.trim() !== ""),
    ),
  ].sort();

  const uniqueLeads = [
    ...new Set(
      modeScopedOrderGroups.flatMap((group) =>
        getGroupProjects(group).map((project) => getLeadDisplay(project, "")),
      ),
    ),
  ]
    .filter((l) => l && l !== "" && l !== "Unassigned")
    .sort();

  // Filter Logic
  const filteredOrderGroups = statusScopedOrderGroups.filter((group) => {
    const projectsInGroup = getGroupProjects(group);
    if (projectsInGroup.length === 0) return false;

    if (
      searchQuery &&
      !String(group?.orderNumber || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    if (
      clientFilter !== "All" &&
      getGroupClient(group, projectsInGroup) !== clientFilter
    ) {
      return false;
    }

    if (leadFilter !== "All") {
      const hasLead = projectsInGroup.some(
        (project) => getLeadDisplay(project, "") === leadFilter,
      );
      if (!hasLead) return false;
    }
    return true;
  });

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedOrderGroups = filteredOrderGroups.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );
  const totalPages = Math.ceil(filteredOrderGroups.length / itemsPerPage);

  useEffect(() => {
    setExpandedOrderGroups((prev) => {
      const next = {};
      filteredOrderGroups.forEach((group) => {
        const key = group?.id || group?.orderNumber;
        if (!key) return;
        next[key] = prev[key] || false;
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }

      return prev;
    });
  }, [filteredOrderGroups]);

  useEffect(() => {
    setCollapsingOrderGroups((prev) => {
      const next = {};
      filteredOrderGroups.forEach((group) => {
        const key = group?.id || group?.orderNumber;
        if (!key) return;
        if (prev[key]) next[key] = true;
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }

      return prev;
    });
  }, [filteredOrderGroups]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toggleOrderGroup = (groupKey) => {
    if (!groupKey) return;
    const isExpanded = Boolean(expandedOrderGroups[groupKey]);

    if (isExpanded) {
      setCollapsingOrderGroups((prev) => ({
        ...prev,
        [groupKey]: true,
      }));

      if (collapseTimersRef.current[groupKey]) {
        clearTimeout(collapseTimersRef.current[groupKey]);
      }

      collapseTimersRef.current[groupKey] = window.setTimeout(() => {
        setExpandedOrderGroups((prev) => ({
          ...prev,
          [groupKey]: false,
        }));
        setCollapsingOrderGroups((prev) => {
          const next = { ...prev };
          delete next[groupKey];
          return next;
        });
        delete collapseTimersRef.current[groupKey];
      }, GROUP_ROW_TRANSITION_MS);
      return;
    }

    if (collapseTimersRef.current[groupKey]) {
      clearTimeout(collapseTimersRef.current[groupKey]);
      delete collapseTimersRef.current[groupKey];
    }

    setCollapsingOrderGroups((prev) => {
      if (!prev[groupKey]) return prev;
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
    setExpandedOrderGroups((prev) => ({
      ...prev,
      [groupKey]: true,
    }));
  };

  const renderTypeBadge = (projectType) => {
    const typeLabel = projectType || "Standard";
    const isEmergency = typeLabel === "Emergency";
    const isCorporate = typeLabel === "Corporate Job";
    const isQuote = typeLabel === "Quote";

    const backgroundColor = isEmergency
      ? "#fef2f2"
      : isCorporate
        ? "#f0fdf4"
        : isQuote
          ? "#fffbeb"
          : "#eff6ff";
    const textColor = isEmergency
      ? "#e74c3c"
      : isCorporate
        ? "#42a165"
        : isQuote
          ? "#f39c12"
          : "#3498db";
    const borderColor = isEmergency
      ? "#e74c3c40"
      : isCorporate
        ? "#42a16540"
        : isQuote
          ? "#f39c1240"
          : "#3498db40";

    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: "700",
          backgroundColor,
          color: textColor,
          border: `1px solid ${borderColor}`,
        }}
      >
        {typeLabel}
      </span>
    );
  };

  return (
    <div className="projects-page">
      <div className="projects-header">
        <div className="projects-header-copy">
          <h1>
            <ProjectsIcon className="text-secondary" /> {pageConfig.title}
          </h1>
          <p>{pageConfig.description}</p>
        </div>
        <div className="projects-view-toggle" aria-label="Project views">
          <button
            type="button"
            className={`projects-view-btn ${
              !isFinishedView ? "active" : ""
            }`}
            onClick={() => handleViewModeChange("active")}
          >
            Active Projects ({projectCounts.active})
          </button>
          <button
            type="button"
            className={`projects-view-btn ${
              isFinishedView ? "active" : ""
            }`}
            onClick={() => handleViewModeChange("finished")}
          >
            Finished Projects ({projectCounts.finished})
          </button>
        </div>
      </div>

      <div className="projects-table-container">
        <div className="table-controls">
          {/* Filter Bar */}
          <div className="filter-bar">
            {/* Search Order # */}
            <div className="search-pill-wrapper">
              <input
                type="text"
                placeholder="Search Order #..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
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

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-pill"
            >
              {pageConfig.statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* Client Filter */}
            <select
              value={clientFilter}
              onChange={(e) => {
                setClientFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-pill"
            >
              <option value="All">All Clients</option>
              {uniqueClients.map((client, idx) => (
                <option key={idx} value={client}>
                  {client}
                </option>
              ))}
            </select>

            {/* Lead Filter */}
            <select
              value={leadFilter}
              onChange={(e) => {
                setLeadFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-pill"
            >
              <option value="All">All Leads</option>
              {uniqueLeads.map((lead, idx) => (
                <option key={idx} value={lead}>
                  {lead}
                </option>
              ))}
            </select>
          </div>
          <div className="result-count">
            Showing {paginatedOrderGroups.length} of {filteredOrderGroups.length}{" "}
            results
          </div>
        </div>

        {loading ? (
          <div className="loading-state">{pageConfig.loadingLabel}</div>
        ) : filteredOrderGroups.length === 0 ? (
          <div className="empty-state">{pageConfig.emptyLabel}</div>
        ) : (
          <>
            <table className="projects-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Project Name</th>
                  <th>Type</th>
                  <th>Lead</th>
                  <th>Client</th>
                  <th>Assigned Date</th>
                  <th>Received Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrderGroups.map((group) => {
                  const groupKey = group?.id || group?.orderNumber || "order";
                  const projectsInGroup = getGroupProjects(group);
                  const isGrouped = projectsInGroup.length > 1;
                  const primaryProject = projectsInGroup[0] || null;

                  if (!primaryProject) return null;

                  const groupClient = getGroupClient(group, projectsInGroup);
                  const groupStatus = getGroupStatusSummary(projectsInGroup);
                  const expanded = Boolean(expandedOrderGroups[groupKey]);
                  const isCollapsing = Boolean(collapsingOrderGroups[groupKey]);
                  const showGroupChildren = expanded || isCollapsing;
                  const groupTypes = Array.from(
                    new Set(
                      projectsInGroup
                        .map((project) => project?.projectType || "Standard")
                        .filter(Boolean),
                    ),
                  );

                  if (!isGrouped) {
                    const project = primaryProject;
                    return (
                      <tr key={project._id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>
                            {project.orderId || group?.orderNumber || "N/A"}
                          </span>
                        </td>
                        <td>
                          {renderProjectName(project.details, null, "Untitled")}
                        </td>
                        <td>{renderTypeBadge(project.projectType)}</td>
                        <td>{getLeadDisplay(project, "Unassigned")}</td>
                        <td>{groupClient}</td>
                        <td>{formatDate(project.orderDate || project.createdAt)}</td>
                        <td>{formatTime(project.receivedTime)}</td>
                        <td>
                          <span
                            className={`status-badge ${getStatusClass(
                              getProjectStatusDisplay(project),
                            )}`}
                          >
                            {getProjectStatusDisplay(project)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="action-btn"
                            onClick={() => openProjectDetails(project)}
                          >
                            View
                          </button>
                          {!(
                            user &&
                            (project.projectLeadId?._id === user._id ||
                              project.projectLeadId === user._id)
                          ) && (
                            <button
                              className="action-btn delete-btn"
                              onClick={(e) => handleDeleteClick(e, project._id)}
                              style={{
                                marginLeft: "0.5rem",
                                background: "rgba(239, 68, 68, 0.1)",
                                color: "#ef4444",
                                border: "1px solid rgba(239, 68, 68, 0.2)",
                              }}
                              title="Delete Project"
                            >
                              <TrashIcon width="16" height="16" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={groupKey}>
                      <tr className="project-group-header-row">
                        <td>
                          <div className="project-group-order-cell">
                            <button
                              type="button"
                              className="project-group-toggle-btn"
                              onClick={() => toggleOrderGroup(groupKey)}
                              aria-expanded={expanded}
                            >
                              {expanded ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  version="1.1"
                                  xmlns="http://www.w3.org/2000/svg"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  <polygon points="8 5 8 19 16 12" />
                                </svg>
                              ) : (
                                <svg
                                  viewBox="0 0 24 24"
                                  version="1.1"
                                  xmlns="http://www.w3.org/2000/svg"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  <polygon points="5 8 12 16 19 8" />
                                </svg>
                              )}
                            </button>
                            <div className="project-group-order-text">
                              <span className="project-group-order-id">
                                {group?.orderNumber || "N/A"}
                              </span>
                              <span className="project-group-order-count">
                                {projectsInGroup.length} projects
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="project-group-project-cell">
                            <span className="project-group-title">Grouped Order</span>
                            <span className="project-group-subtitle">
                              Expand to view all projects under this order
                            </span>
                          </div>
                        </td>
                        <td>
                          {groupTypes.length === 1
                            ? renderTypeBadge(groupTypes[0])
                            : `Mixed (${groupTypes.length})`}
                        </td>
                        <td>Multiple Leads</td>
                        <td>{groupClient}</td>
                        <td>{formatDate(group?.orderDate || primaryProject?.orderDate || primaryProject?.createdAt)}</td>
                        <td>-</td>
                        <td>
                          <span className={`status-badge ${groupStatus.className}`}>
                            {groupStatus.label}
                          </span>
                        </td>
                        <td>
                          <button
                            className="action-btn"
                            onClick={() => openOrderGroup(group?.orderNumber)}
                          >
                            View Group
                          </button>
                        </td>
                      </tr>

                      {showGroupChildren &&
                        projectsInGroup.map((project) => (
                          <tr
                            key={project._id}
                            className={`project-group-child-row ${
                              isCollapsing
                                ? "project-group-child-row-collapsing"
                                : "project-group-child-row-expanding"
                            }`}
                          >
                            <td>
                              <span
                                style={{ fontWeight: 600 }}
                                className="project-group-child-order-id"
                              >
                                -
                              </span>
                            </td>
                            <td>
                              {renderProjectName(
                                project.details,
                                null,
                                "Untitled",
                              )}
                            </td>
                            <td>{renderTypeBadge(project.projectType)}</td>
                            <td>{getLeadDisplay(project, "Unassigned")}</td>
                            <td>{project.details?.client || groupClient}</td>
                            <td>{formatDate(project.orderDate || project.createdAt)}</td>
                            <td>{formatTime(project.receivedTime)}</td>
                            <td>
                              <span
                                className={`status-badge ${getStatusClass(
                                  getProjectStatusDisplay(project),
                                )}`}
                              >
                                {getProjectStatusDisplay(project)}
                              </span>
                            </td>
                            <td>
                              <button
                                className="action-btn"
                                onClick={() => openProjectDetails(project)}
                              >
                                View
                              </button>
                              {!(
                                user &&
                                (project.projectLeadId?._id === user._id ||
                                  project.projectLeadId === user._id)
                              ) && (
                                <button
                                  className="action-btn delete-btn"
                                  onClick={(e) => handleDeleteClick(e, project._id)}
                                  style={{
                                    marginLeft: "0.5rem",
                                    background: "rgba(239, 68, 68, 0.1)",
                                    color: "#ef4444",
                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                  }}
                                  title="Delete Project"
                                >
                                  <TrashIcon width="16" height="16" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination-container">
                <button
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
        onConfirm={handleDeleteConfirm}
        title="Delete Project"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        isDangerous={true}
      />
    </div>
  );
};

export default Projects;

