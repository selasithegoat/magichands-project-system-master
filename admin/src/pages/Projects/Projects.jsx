import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import "./Projects.css";
import { TrashIcon, ProjectsIcon } from "../../icons/Icons";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";
import usePersistedState from "@client/hooks/usePersistedState";
import { getLeadDisplay } from "../../utils/leadDisplay";
import { renderProjectName } from "../../utils/projectName";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
} from "@client/utils/quoteStatus";
import { getDepartmentLabel } from "@client/constants/departments";

const GROUP_ROW_TRANSITION_MS = 220;
const URGENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const PROJECT_VIEW_MODES = ["active", "finished"];
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
  { value: "Production In Progress", label: "Production In Progress" },
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

const getDefaultFilterStatus = () => "All";

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

const getWorkflowProgress = (project) => {
  const status = getProjectStatusDisplay(project).toLowerCase();
  if (/completed|finished|delivered|declined/.test(status)) return 100;
  if (/delivery|pickup/.test(status)) return 92;
  if (/packaging/.test(status)) return 84;
  if (/photography/.test(status)) return 78;
  if (/quality/.test(status)) return 72;
  if (/production|fabrication/.test(status)) return 62;
  if (/master approval|mockup/.test(status)) return 42;
  if (/scope approval|engagement|meeting/.test(status)) return 28;
  if (/acceptance|approval|created|new order/.test(status)) return 15;
  if (/quote|cost|sample|bid/.test(status)) return 32;
  if (/hold|blocked/.test(status)) return 20;
  return 10;
};

const isDueToday = (project) => {
  const value = project?.details?.deliveryDate;
  if (!value) return false;
  const dueDate = new Date(value);
  const now = new Date();
  return (
    dueDate.getFullYear() === now.getFullYear() &&
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getDate() === now.getDate()
  );
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const PipelineIcon = ({ type }) => {
  if (type === "proofing") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m8 3 8 8M14 3l7 7-9 9H5v-7Z" />
        <path d="m3 21 5-5" />
      </svg>
    );
  }
  if (type === "production") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M4 21V8l5 3V8l5 3V4h6v17Z" />
        <path d="M8 17h2M14 17h2" />
      </svg>
    );
  }
  if (type === "dispatch") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </svg>
    );
  }
  return <ProjectsIcon />;
};

const Projects = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [expandedOrderGroups, setExpandedOrderGroups] = useState({});
  const [collapsingOrderGroups, setCollapsingOrderGroups] = useState({});
  const collapseTimersRef = useRef({});

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    projectId: null,
  });
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);

  // Pagination & Filter State
  const [viewMode, setViewMode] = usePersistedState(
    "admin-projects-view-mode",
    "active",
    {
      sanitize: (value) =>
        PROJECT_VIEW_MODES.includes(value) ? value : "active",
    },
  );
  const [filterStatus, setFilterStatus] = usePersistedState(
    "admin-projects-filter-status",
    getDefaultFilterStatus("active"),
  );
  const [searchQuery, setSearchQuery] = usePersistedState(
    "admin-projects-search",
    "",
  );
  const [clientFilter, setClientFilter] = usePersistedState(
    "admin-projects-client-filter",
    "All",
  );
  const [leadFilter, setLeadFilter] = usePersistedState(
    "admin-projects-lead-filter",
    "All",
  );
  const [typeFilter, setTypeFilter] = usePersistedState(
    "admin-projects-type-filter",
    "All",
  );
  const [currentPage, setCurrentPage] = usePersistedState(
    "admin-projects-page",
    1,
    {
      sanitize: (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
      },
    },
  );
  const [itemsPerPage] = useState(10);
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

  const { data: groupedOrders = [], isPending: loading } = useQuery({
    queryKey: ["projects", "orders", "admin"],
    queryFn: async () => {
      const groupedRes = await fetch(
        "/api/projects/orders?source=admin&collapseRevisions=true",
        {
          credentials: "include",
        },
      );

      if (groupedRes.ok) {
        const groupedData = await groupedRes.json();
        return Array.isArray(groupedData) ? groupedData : [];
      }
      const projectsRes = await fetch("/api/projects?source=admin", {
        credentials: "include",
      });
      const projectsPayload = projectsRes.ok ? await projectsRes.json() : [];
      const projectsData = Array.isArray(projectsPayload)
        ? projectsPayload
        : [];
      return buildFallbackOrderGroups(projectsData);
    },
    meta: {
      realtimePaths: ["/api/projects"],
    },
  });

  useEffect(() => {
    const viewQuery = searchParams.get("view");
    const statusQuery = searchParams.get("status");
    if (!viewQuery && !statusQuery) {
      return;
    }

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
  }, [searchParams, setCurrentPage, setFilterStatus, setViewMode]);

  useEffect(
    () => () => {
      Object.values(collapseTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      collapseTimersRef.current = {};
    },
    [],
  );

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
        setDeleteModal({ isOpen: false, projectId: null });
      } else {
        alert("Failed to delete project");
      }
    } catch (err) {
      console.error("Error deleting project:", err);
      alert("Error deleting project");
    }
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

  const allProjects = useMemo(
    () => groupedOrders.flatMap((group) => getGroupProjects(group)),
    [groupedOrders],
  );

  const pipelineSummary = useMemo(() => {
    const activeProjects = allProjects.filter((project) => !isClosedProject(project));
    const urgentProjects = activeProjects.filter(isUrgentProject);
    const pendingProofing = activeProjects.filter((project) =>
      /mockup|scope approval|master approval|proof/i.test(getProjectStatusDisplay(project)),
    );
    const production = activeProjects.filter((project) =>
      /production|quality control|photography|packaging|fabrication/i.test(
        getProjectStatusDisplay(project),
      ),
    );
    const dispatch = activeProjects.filter(isPendingDeliveryProject);
    const productionDepartments = new Set(
      production.flatMap((project) =>
        Array.isArray(project?.departments) ? project.departments.filter(Boolean) : [],
      ),
    );
    const productionOnTrack = production.filter(
      (project) => !isUrgentProject(project),
    ).length;

    return {
      active: activeProjects.length,
      onSchedule: Math.max(0, activeProjects.length - urgentProjects.length),
      flagged: urgentProjects.length,
      pendingProofing: pendingProofing.length,
      proofingUrgent: pendingProofing.filter(isUrgentProject).length,
      production: production.length,
      productionDepartments: productionDepartments.size,
      productionOnTrackPercent: production.length
        ? Math.round((productionOnTrack / production.length) * 100)
        : 0,
      dispatch: dispatch.length,
      dispatchDueToday: dispatch.filter(isDueToday).length,
    };
  }, [allProjects]);

  const getGroupClient = (group, projects = []) =>
    group?.client ||
    projects.find((project) => project?.details?.client)?.details?.client ||
    "-";

  const matchesStatusFilter = useCallback((project) => {
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
  }, [filterStatus, isFinishedView]);

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
    [matchesStatusFilter, modeScopedOrderGroups],
  );

  const handleViewModeChange = (nextViewMode) => {
    if (nextViewMode === viewMode) return;

    setViewMode(nextViewMode);
    setFilterStatus(getDefaultFilterStatus(nextViewMode));
    setTypeFilter("All");
    setCurrentPage(1);

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

  const uniqueTypes = [
    ...new Set(
      modeScopedOrderGroups.flatMap((group) =>
        getGroupProjects(group).map((project) => project?.projectType || "Standard"),
      ),
    ),
  ].sort();

  // Filter Logic
  const filteredOrderGroups = statusScopedOrderGroups.filter((group) => {
    const projectsInGroup = getGroupProjects(group);
    if (projectsInGroup.length === 0) return false;

    if (searchQuery) {
      const normalizedSearch = searchQuery.trim().toLowerCase();
      const searchableValues = [
        group?.orderNumber,
        getGroupClient(group, projectsInGroup),
        group?.clientEmail,
        group?.clientPhone,
        ...projectsInGroup.flatMap((project) => [
          project?.orderId,
          renderProjectName(project?.details, null, ""),
          project?.details?.client,
          project?.details?.clientEmail,
          project?.details?.clientPhone,
          getLeadDisplay(project, ""),
        ]),
      ];
      if (
        !searchableValues.some((value) =>
          String(value || "").toLowerCase().includes(normalizedSearch),
        )
      ) {
        return false;
      }
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
    if (typeFilter !== "All") {
      const hasType = projectsInGroup.some(
        (project) => (project?.projectType || "Standard") === typeFilter,
      );
      if (!hasType) return false;
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
  const visibleProjectIds = paginatedOrderGroups
    .flatMap((group) => getGroupProjects(group))
    .map((project) => project?._id)
    .filter(Boolean);
  const allVisibleSelected =
    visibleProjectIds.length > 0 &&
    visibleProjectIds.every((projectId) => selectedProjectIds.includes(projectId));
  const hasActiveFilters = Boolean(
    searchQuery ||
      filterStatus !== "All" ||
      clientFilter !== "All" ||
      leadFilter !== "All" ||
      typeFilter !== "All",
  );

  const clearProjectFilters = () => {
    setSearchQuery("");
    setFilterStatus(getDefaultFilterStatus(viewMode));
    setClientFilter("All");
    setLeadFilter("All");
    setTypeFilter("All");
    setCurrentPage(1);
  };

  const toggleProjectSelection = (projectIds, checked) => {
    const normalizedIds = (Array.isArray(projectIds) ? projectIds : [projectIds]).filter(
      Boolean,
    );
    setSelectedProjectIds((current) => {
      const next = new Set(current);
      normalizedIds.forEach((projectId) => {
        if (checked) next.add(projectId);
        else next.delete(projectId);
      });
      return Array.from(next);
    });
  };

  const handleExportCsv = () => {
    const projectsToExport = filteredOrderGroups.flatMap((group) =>
      getGroupProjects(group).map((project) => ({ project, group })),
    );
    const rows = [
      [
        "Order ID",
        "Project",
        "Type",
        "Client",
        "Contact",
        "Submitted",
        "Deadline",
        "Status",
        "Departments",
        "Lead",
      ],
      ...projectsToExport.map(({ project, group }) => [
        project?.orderId || group?.orderNumber || "",
        renderProjectName(project?.details, null, "Untitled"),
        project?.projectType || "Standard",
        project?.details?.client || group?.client || "",
        project?.details?.clientEmail ||
          project?.details?.clientPhone ||
          group?.clientEmail ||
          group?.clientPhone ||
          "",
        formatDate(project?.orderDate || project?.createdAt),
        formatDate(project?.details?.deliveryDate),
        getProjectStatusDisplay(project),
        (project?.departments || []).map(getDepartmentLabel).join(" / "),
        getLeadDisplay(project, "Unassigned"),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${isFinishedView ? "finished" : "active"}-projects-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, setCurrentPage, totalPages]);

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

  const renderTypeBadge = (projectType, displayLabel) => {
    const typeLabel = projectType || "Standard";
    const normalizedType = typeLabel.toLowerCase();
    const typeClass = normalizedType.includes("emergency")
      ? "emergency"
      : normalizedType.includes("corporate")
        ? "corporate"
        : normalizedType.includes("quote")
          ? "quote"
          : normalizedType.includes("mixed")
            ? "mixed"
            : "standard";

    return (
      <span className={`project-type-badge ${typeClass}`}>
        {displayLabel || typeLabel}
      </span>
    );
  };

  const getInitials = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || normalized === "-") return "--";
    return normalized
      .split(/\s+|\//)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  };

  const getProjectDescriptor = (project) => {
    const items = Array.isArray(project?.items) ? project.items : [];
    const totalQuantity = items.reduce(
      (sum, item) => sum + (Number(item?.qty) || 0),
      0,
    );
    const parts = [];
    if (items[0]?.description) parts.push(items[0].description);
    if (items.length > 1) parts.push(`${items.length} line items`);
    if (totalQuantity > 0) parts.push(`${totalQuantity.toLocaleString()} units`);
    return parts.join(" · ") || project?.projectType || "Project order";
  };

  const renderClientCell = (project, group) => {
    const client = project?.details?.client || group?.client || "Unknown client";
    const contact =
      project?.details?.clientEmail ||
      project?.details?.clientPhone ||
      group?.clientEmail ||
      group?.clientPhone ||
      "No contact recorded";
    return (
      <div className="project-client-cell">
        <span className="project-person-avatar" aria-hidden="true">
          {getInitials(client)}
        </span>
        <span className="project-person-copy">
          <strong>{client}</strong>
          <small>{contact}</small>
        </span>
      </div>
    );
  };

  const renderScheduleCell = (project) => {
    const urgent = isUrgentProject(project);
    return (
      <div className="project-schedule-cell">
        <span>
          <small>Submitted</small>
          <strong>{formatDate(project?.orderDate || project?.createdAt)}</strong>
        </span>
        <span className={urgent ? "is-urgent" : ""}>
          <small>{isDueToday(project) ? "Due today" : "Deadline"}</small>
          <strong>
            {formatDate(project?.details?.deliveryDate)}
            {project?.details?.deliveryTime
              ? ` · ${formatTime(project.details.deliveryTime)}`
              : ""}
          </strong>
        </span>
      </div>
    );
  };

  const renderWorkflowCell = (project) => {
    const status = getProjectStatusDisplay(project) || "Draft";
    const progress = getWorkflowProgress(project);
    const departments = Array.isArray(project?.departments)
      ? project.departments.map(getDepartmentLabel).filter(Boolean)
      : [];
    return (
      <div className="project-workflow-cell">
        <div>
          <strong>{status}</strong>
          <span>{progress}%</span>
        </div>
        <div className="project-progress-track" aria-label={`${progress}% workflow progress`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <small>
          {departments.length > 0
            ? departments.slice(0, 2).join(" / ")
            : "Department not assigned"}
        </small>
      </div>
    );
  };

  const renderLeadCell = (project) => {
    const lead = getLeadDisplay(project, "Unassigned");
    return (
      <div className="project-lead-cell">
        <span className="project-person-avatar" aria-hidden="true">
          {getInitials(lead)}
        </span>
        <strong>{lead}</strong>
      </div>
    );
  };

  const canDeleteProject = (project) =>
    !(
      user &&
      (project?.projectLeadId?._id === user._id ||
        project?.projectLeadId === user._id)
    );

  const renderProjectActions = (project) => (
    <div className="project-row-actions">
      <button
        type="button"
        className="project-open-btn"
        onClick={(event) => {
          event.stopPropagation();
          openProjectDetails(project);
        }}
      >
        <span>Open</span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7.25 4.75 12.5 10l-5.25 5.25" />
        </svg>
      </button>
      {canDeleteProject(project) && (
        <button
          type="button"
          className="project-more-btn project-delete-action"
          onClick={(event) => handleDeleteClick(event, project._id)}
          aria-label="Delete project"
          title="Delete project"
        >
          <TrashIcon width="15" height="15" />
        </button>
      )}
    </div>
  );

  const handleRowKeyDown = (event, openRow) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openRow();
  };

  const pipelineCards = [
    {
      key: "queue",
      tone: "indigo",
      icon: "queue",
      label: "Active queue load",
      value: pipelineSummary.active,
      unit: "projects booked",
      left: `${pipelineSummary.onSchedule} on schedule`,
      right: `${pipelineSummary.flagged} flagged`,
      progress: pipelineSummary.active
        ? Math.round((pipelineSummary.onSchedule / pipelineSummary.active) * 100)
        : 0,
    },
    {
      key: "proofing",
      tone: "amber",
      icon: "proofing",
      label: "Pending mockup & proofing",
      value: pipelineSummary.pendingProofing,
      unit: "projects awaiting review",
      left: "Client or team sign-off",
      right: `${pipelineSummary.proofingUrgent} urgent`,
      progress: pipelineSummary.active
        ? Math.round((pipelineSummary.pendingProofing / pipelineSummary.active) * 100)
        : 0,
    },
    {
      key: "production",
      tone: "emerald",
      icon: "production",
      label: "In production / fabrication",
      value: pipelineSummary.production,
      unit: "projects in production",
      left: `${pipelineSummary.productionDepartments} departments active`,
      right: `${pipelineSummary.productionOnTrackPercent}% on track`,
      progress: pipelineSummary.productionOnTrackPercent,
    },
    {
      key: "dispatch",
      tone: "violet",
      icon: "dispatch",
      label: "Ready for dispatch / pickup",
      value: pipelineSummary.dispatch,
      unit: "projects staged",
      left: "Delivery queue",
      right: `${pipelineSummary.dispatchDueToday} due today`,
      progress: pipelineSummary.active
        ? Math.round((pipelineSummary.dispatch / pipelineSummary.active) * 100)
        : 0,
    },
  ];

  const paginationPages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(
      (page) =>
        page === 1 ||
        page === totalPages ||
        Math.abs(page - currentPage) <= 1,
    );
  const selectedStatusLabel =
    pageConfig.statusOptions.find((option) => option.value === filterStatus)?.label ||
    filterStatus;

  return (
    <div className="projects-page">
      <div className="projects-header">
        <div className="projects-header-copy">
          <div className="projects-title-line">
            <h1>
              {isFinishedView
                ? "Finished Projects & Production Orders"
                : "Projects & Production Orders"}
            </h1>
            <span>Live pipeline</span>
          </div>
          <p>
            {isFinishedView
              ? pageConfig.description
              : "Active production orders, fabrication pipelines, and departmental deliverables."}
          </p>
        </div>
        <div className="projects-header-actions">
          <div className="projects-view-toggle" aria-label="Project views">
            <button
              type="button"
              className={`projects-view-btn ${!isFinishedView ? "active" : ""}`}
              onClick={() => handleViewModeChange("active")}
            >
              Active Projects <span>{projectCounts.active}</span>
            </button>
            <button
              type="button"
              className={`projects-view-btn ${isFinishedView ? "active" : ""}`}
              onClick={() => handleViewModeChange("finished")}
            >
              Finished Projects <span>{projectCounts.finished}</span>
            </button>
          </div>
          <button type="button" className="projects-export-btn" onClick={handleExportCsv}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
            </svg>
            Export CSV
          </button>
          <button
            type="button"
            className="projects-create-btn"
            onClick={() => navigate("/new-orders/form")}
          >
            <span aria-hidden="true">+</span> New Project / Order
          </button>
        </div>
      </div>

      <section className="projects-pipeline-cards" aria-label="Production pipeline summary">
        {pipelineCards.map((card) => (
          <article key={card.key} className={`projects-pipeline-card tone-${card.tone}`}>
            <div className="projects-pipeline-card-top">
              <span className="projects-pipeline-icon">
                <PipelineIcon type={card.icon} />
              </span>
              <span className="projects-pipeline-badge">{card.right}</span>
            </div>
            <span className="projects-pipeline-label">{card.label}</span>
            <div className="projects-pipeline-value">
              <strong>{card.value.toLocaleString()}</strong>
              <span>{card.unit}</span>
            </div>
            <div className="projects-pipeline-meta">
              <span>{card.left}</span>
              <span>{card.right}</span>
            </div>
            <div className="projects-pipeline-track">
              <span style={{ width: `${Math.min(100, Math.max(0, card.progress))}%` }} />
            </div>
          </article>
        ))}
      </section>

      <div className="projects-table-container">
        <div className="table-controls">
          <div className="filter-bar">
            <div className="search-pill-wrapper">
              <input
                type="text"
                placeholder="Search by order, job title, client name, or lead..."
                aria-label="Search projects"
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

            <select
              aria-label="Filter projects by status"
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

            <select
              aria-label="Filter projects by client"
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

            <select
              aria-label="Filter projects by lead"
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

            <select
              aria-label="Filter projects by type"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-pill"
            >
              <option value="All">Type: Any</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="table-toolbar-meta">
            {hasActiveFilters && (
              <button
                type="button"
                className="clear-filters-btn"
                onClick={clearProjectFilters}
              >
                Clear filters
              </button>
            )}
            <div className="result-count" aria-live="polite">
              Showing <strong>{paginatedOrderGroups.length}</strong> of{" "}
              {filteredOrderGroups.length} orders
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="projects-filter-summary">
            <span>Filtered by:</span>
            {filterStatus !== "All" && <strong>Status: {selectedStatusLabel}</strong>}
            {clientFilter !== "All" && <strong>Client: {clientFilter}</strong>}
            {leadFilter !== "All" && <strong>Lead: {leadFilter}</strong>}
            {typeFilter !== "All" && <strong>Type: {typeFilter}</strong>}
            {searchQuery && <strong>Search: {searchQuery}</strong>}
            <button type="button" onClick={clearProjectFilters}>Reset filters</button>
          </div>
        )}

        {loading ? (
          <div className="loading-state">{pageConfig.loadingLabel}</div>
        ) : filteredOrderGroups.length === 0 ? (
          <div className="empty-state">{pageConfig.emptyLabel}</div>
        ) : (
          <>
            <table className="projects-table">
              <thead>
                <tr>
                  <th className="projects-select-column">
                    <input
                      type="checkbox"
                      aria-label="Select all projects on this page"
                      checked={allVisibleSelected}
                      onChange={(event) =>
                        toggleProjectSelection(visibleProjectIds, event.target.checked)
                      }
                    />
                  </th>
                  <th>Order ID &amp; job description</th>
                  <th>Priority / type</th>
                  <th>Client &amp; contact</th>
                  <th>Submitted &amp; deadline</th>
                  <th>Department &amp; progress</th>
                  <th>Assigned lead</th>
                  <th aria-label="Actions" />
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
                    const orderNumber =
                      project.orderId || group?.orderNumber || "N/A";
                    return (
                      <tr
                        key={project._id}
                        className={`project-operation-row is-clickable ${
                          isEmergencyProject(project) ? "is-emergency" : ""
                        }`}
                        role="link"
                        tabIndex={0}
                        aria-label={`Open ${renderProjectName(project.details, null, "project")}`}
                        onClick={() => openProjectDetails(project)}
                        onKeyDown={(event) =>
                          handleRowKeyDown(event, () => openProjectDetails(project))
                        }
                      >
                        <td className="projects-select-column">
                          <input
                            type="checkbox"
                            aria-label={`Select project ${orderNumber}`}
                            checked={selectedProjectIds.includes(project._id)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              toggleProjectSelection(project._id, event.target.checked)
                            }
                          />
                        </td>
                        <td className="operations-project-cell">
                          <div className="project-identity">
                            <div className="project-identity-meta">
                              <span className="project-order-code">
                                #{orderNumber}
                              </span>
                              <span className="project-record-label">
                                Project
                              </span>
                            </div>
                            <strong className="project-title">
                              {renderProjectName(
                                project.details,
                                null,
                                "Untitled",
                              )}
                            </strong>
                            <small className="project-description">
                              {getProjectDescriptor(project)}
                            </small>
                          </div>
                        </td>
                        <td className="operations-type-cell">
                          {renderTypeBadge(project.projectType)}
                        </td>
                        <td className="operations-client-column">
                          {renderClientCell(project, group)}
                        </td>
                        <td className="operations-schedule-column">
                          {renderScheduleCell(project)}
                        </td>
                        <td className="operations-workflow-column">
                          {renderWorkflowCell(project)}
                        </td>
                        <td className="operations-lead-column">
                          {renderLeadCell(project)}
                        </td>
                        <td className="operations-actions-cell">
                          {renderProjectActions(project)}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={groupKey}>
                      <tr
                        className="project-group-header-row is-clickable"
                        role="link"
                        tabIndex={0}
                        aria-label={`Open order ${group?.orderNumber || "N/A"}`}
                        onClick={() => openOrderGroup(group?.orderNumber)}
                        onKeyDown={(event) =>
                          handleRowKeyDown(event, () => openOrderGroup(group?.orderNumber))
                        }
                      >
                        <td className="projects-select-column">
                          <input
                            type="checkbox"
                            aria-label={`Select order ${group?.orderNumber || "N/A"}`}
                            checked={projectsInGroup.every((project) =>
                              selectedProjectIds.includes(project._id),
                            )}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              toggleProjectSelection(
                                projectsInGroup.map((project) => project._id),
                                event.target.checked,
                              )
                            }
                          />
                        </td>
                        <td className="operations-project-cell">
                          <div className="project-group-identity">
                            <button
                              type="button"
                              className={`project-group-toggle-btn ${
                                expanded ? "is-expanded" : ""
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleOrderGroup(groupKey);
                              }}
                              aria-expanded={expanded}
                              aria-label={`${expanded ? "Collapse" : "Expand"} order ${
                                group?.orderNumber || "N/A"
                              }`}
                            >
                              <svg viewBox="0 0 20 20" aria-hidden="true">
                                <path d="m7 4.75 5.25 5.25L7 15.25" />
                              </svg>
                            </button>
                            <div className="project-identity">
                              <div className="project-identity-meta">
                                <span className="project-order-code">
                                  #{group?.orderNumber || "N/A"}
                                </span>
                                <span className="project-group-count">
                                  {projectsInGroup.length} projects
                                </span>
                              </div>
                              <strong className="project-title">
                                {groupClient}
                              </strong>
                              <small className="project-group-subtitle">
                                {expanded
                                  ? "Showing every project in this order"
                                  : `${projectsInGroup.length} linked production projects`}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="operations-type-cell">
                          {groupTypes.length === 1
                            ? renderTypeBadge(groupTypes[0])
                            : renderTypeBadge(
                                "Mixed",
                                `Mixed (${groupTypes.length})`,
                              )}
                        </td>
                        <td className="operations-client-column">
                          {renderClientCell(primaryProject, group)}
                        </td>
                        <td className="operations-schedule-column">
                          {renderScheduleCell(primaryProject)}
                        </td>
                        <td className="operations-workflow-column">
                          {renderWorkflowCell(primaryProject)}
                        </td>
                        <td className="operations-lead-column">
                          <div className="project-lead-cell">
                            <span className="project-person-avatar" aria-hidden="true">ML</span>
                            <strong>Multiple leads</strong>
                          </div>
                        </td>
                        <td className="operations-actions-cell">
                          <button
                            type="button"
                            className="project-open-btn project-group-open-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              openOrderGroup(group?.orderNumber);
                            }}
                          >
                            <span>View group</span>
                            <svg viewBox="0 0 20 20" aria-hidden="true">
                              <path d="M7.25 4.75 12.5 10l-5.25 5.25" />
                            </svg>
                          </button>
                        </td>
                      </tr>

                      {showGroupChildren &&
                        projectsInGroup.map((project, projectIndex) => {
                          return (
                            <tr
                              key={project._id}
                              className={`project-group-child-row ${
                                isCollapsing
                                  ? "project-group-child-row-collapsing"
                                  : "project-group-child-row-expanding"
                              } ${
                                isEmergencyProject(project)
                                  ? "is-emergency"
                                  : ""
                              } is-clickable`}
                              role="link"
                              tabIndex={0}
                              aria-label={`Open ${renderProjectName(project.details, null, "project")}`}
                              onClick={() => openProjectDetails(project)}
                              onKeyDown={(event) =>
                                handleRowKeyDown(event, () => openProjectDetails(project))
                              }
                            >
                              <td className="projects-select-column">
                                <input
                                  type="checkbox"
                                  aria-label={`Select project ${projectIndex + 1}`}
                                  checked={selectedProjectIds.includes(project._id)}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    toggleProjectSelection(
                                      project._id,
                                      event.target.checked,
                                    )
                                  }
                                />
                              </td>
                              <td className="operations-project-cell">
                                <div className="project-child-identity">
                                  <span
                                    className="project-child-connector"
                                    aria-hidden="true"
                                  />
                                  <div className="project-identity">
                                    <div className="project-identity-meta">
                                      <span className="project-record-label">
                                        Project {projectIndex + 1} of{" "}
                                        {projectsInGroup.length}
                                      </span>
                                    </div>
                                    <strong className="project-title">
                                      {renderProjectName(
                                        project.details,
                                        null,
                                        "Untitled",
                                      )}
                                    </strong>
                                    <small className="project-description">
                                      {getProjectDescriptor(project)}
                                    </small>
                                  </div>
                                </div>
                              </td>
                              <td className="operations-type-cell">
                                {renderTypeBadge(project.projectType)}
                              </td>
                              <td className="operations-client-column">
                                {renderClientCell(project, group)}
                              </td>
                              <td className="operations-schedule-column">
                                {renderScheduleCell(project)}
                              </td>
                              <td className="operations-workflow-column">
                                {renderWorkflowCell(project)}
                              </td>
                              <td className="operations-lead-column">
                                {renderLeadCell(project)}
                              </td>
                              <td className="operations-actions-cell">
                                {renderProjectActions(project)}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            <div className="pagination-container">
              <div className="pagination-info">
                <span>
                  Showing {indexOfFirstItem + 1}–
                  {Math.min(indexOfLastItem, filteredOrderGroups.length)} of{" "}
                  {filteredOrderGroups.length} orders
                </span>
                <span>Rows per page: <strong>{itemsPerPage}</strong></span>
                {selectedProjectIds.length > 0 && (
                  <span>{selectedProjectIds.length} projects selected</span>
                )}
              </div>
              <div className="pagination-pages" aria-label="Pagination">
                <button
                  className="pagination-btn pagination-arrow"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                {paginationPages.map((page, index) => (
                  <React.Fragment key={page}>
                    {index > 0 && page - paginationPages[index - 1] > 1 && (
                      <span className="pagination-ellipsis">…</span>
                    )}
                    <button
                      type="button"
                      className={`pagination-btn ${page === currentPage ? "active" : ""}`}
                      onClick={() => setCurrentPage(page)}
                      aria-current={page === currentPage ? "page" : undefined}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                ))}
                <button
                  className="pagination-btn pagination-arrow"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
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

