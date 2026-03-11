import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import "./Dashboard.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { getDepartmentLabel } from "../../constants/departments";
import { useNavigate } from "react-router-dom";
import FolderIcon from "../../components/icons/FolderIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import AlertTriangleIcon from "../../components/icons/AlertTriangleIcon";
import TruckIcon from "../../components/icons/TruckIcon";
import BuildingIcon from "../../components/icons/BuildingIcon";
import ChevronRightIcon from "../../components/icons/ChevronRightIcon";
import LayoutGridIcon from "../../components/icons/LayoutGridIcon";
import MenuIcon from "../../components/icons/MenuIcon";
import EyeIcon from "../../components/icons/EyeIcon";
import ThreeDotsIcon from "../../components/icons/ThreeDotsIcon";
import XIcon from "../../components/icons/XIcon";
import FabButton from "../../components/ui/FabButton";
import Toast from "../../components/ui/Toast";
import UserAvatar from "../../components/ui/UserAvatar";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { playNotificationSound } from "../../utils/notificationSound";
import { getLeadAvatarUrl, getLeadDisplay } from "../../utils/leadDisplay";

const HISTORY_PROJECT_STATUSES = new Set(["Finished"]);
const OVERDUE_EXCLUDED_STATUSES = new Set([
  "Delivered",
  "Pending Feedback",
  "Pending Delivery/Pickup",
  "Feedback Completed",
  "Completed",
  "Finished",
]);

const STATUS_LABEL_OVERRIDES = {
  "Order Confirmed": "Waiting Acceptance",
  "Pending Delivery/Pickup": "Pending Delivery",
};

const PROJECT_TYPE_META = {
  emergency: { label: "Emergency", className: "type-emergency" },
  corporate: { label: "Corporate", className: "type-corporate" },
  quote: { label: "Quote", className: "type-quote" },
  standard: { label: "Standard", className: "type-standard" },
};

const STANDARD_PROGRESS_MAP = {
  "Order Confirmed": 5,
  "Pending Scope Approval": 15,
  "Scope Approval Completed": 22,
  "Pending Departmental Engagement": 27,
  "Departmental Engagement Completed": 32,
  "Pending Mockup": 38,
  "Mockup Completed": 44,
  "Pending Proof Reading": 48,
  "Proof Reading Completed": 52,
  "Pending Production": 58,
  "Production Completed": 66,
  "Pending Quality Control": 72,
  "Quality Control Completed": 76,
  "Pending Photography": 80,
  "Photography Completed": 84,
  "Pending Packaging": 88,
  "Packaging Completed": 92,
  "Pending Delivery/Pickup": 95,
  Delivered: 97,
  "Pending Feedback": 98,
  "Feedback Completed": 99,
  Completed: 100,
  Finished: 100,
};

const QUOTE_PROGRESS_MAP = {
  "Order Confirmed": 5,
  "Pending Scope Approval": 25,
  "Scope Approval Completed": 35,
  "Pending Departmental Engagement": 42,
  "Departmental Engagement Completed": 48,
  "Pending Quote Request": 50,
  "Quote Request Completed": 60,
  "Pending Send Response": 75,
  "Response Sent": 90,
  Delivered: 95,
  "Pending Feedback": 97,
  "Feedback Completed": 99,
  Completed: 100,
  Finished: 100,
};

const WORKLOAD_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#8b5cf6",
  "#f97316",
  "#e11d48",
  "#14b8a6",
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;
const TIMELINE_LOOKAHEAD_DAYS = 3;
const RECENT_PROJECT_LIMIT = 5;
const IMAGE_FILE_EXTENSIONS = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const DRAWER_TRANSITION_MS = 280;

const isPendingAcceptanceProject = (project) => project.status === "Order Confirmed";
const isPendingDeliveryProject = (project) =>
  project?.status === "Pending Delivery/Pickup";
const isQuoteProject = (project) => project?.projectType === "Quote";
const isCorporateProject = (project) => project?.projectType === "Corporate Job";
const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

const parseDeliveryTimeParts = (value) => {
  if (!value) return { hours: 23, minutes: 59, seconds: 59 };
  const raw = String(value).trim();
  if (!raw) return { hours: 23, minutes: 59, seconds: 59 };

  if (raw.includes("T")) {
    const parsedIso = new Date(raw);
    if (!Number.isNaN(parsedIso.getTime())) {
      return {
        hours: parsedIso.getHours(),
        minutes: parsedIso.getMinutes(),
        seconds: parsedIso.getSeconds(),
      };
    }
  }

  const match12h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12h) {
    let hours = Number.parseInt(match12h[1], 10);
    const minutes = Number.parseInt(match12h[2], 10);
    const seconds = Number.parseInt(match12h[3] || "0", 10);
    const period = match12h[4].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return { hours, minutes, seconds };
  }

  const match24h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24h) {
    const hours = Number.parseInt(match24h[1], 10);
    const minutes = Number.parseInt(match24h[2], 10);
    const seconds = Number.parseInt(match24h[3] || "0", 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes, seconds };
    }
  }

  return { hours: 23, minutes: 59, seconds: 59 };
};

const buildDeliveryDateTime = (deliveryDate, deliveryTime) => {
  if (!deliveryDate) return null;
  const parsedDate = new Date(deliveryDate);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const timeParts = parseDeliveryTimeParts(deliveryTime);
  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    timeParts.hours,
    timeParts.minutes,
    timeParts.seconds,
    0,
  );
};

const formatDueDate = (dueAt) => {
  if (!dueAt) return "No due date";
  return dueAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelativeDue = (dueAt) => {
  if (!dueAt) return "Needs schedule";
  const diff = dueAt.getTime() - Date.now();
  const absolute = Math.abs(diff);
  if (diff < 0) {
    if (absolute < HOUR_IN_MS) return "Overdue <1h";
    if (absolute < DAY_IN_MS) return `Overdue ${Math.round(absolute / HOUR_IN_MS)}h`;
    return `Overdue ${Math.round(absolute / DAY_IN_MS)}d`;
  }
  if (absolute < HOUR_IN_MS) return "Due <1h";
  if (absolute < DAY_IN_MS) return `Due in ${Math.round(absolute / HOUR_IN_MS)}h`;
  return `Due in ${Math.ceil(absolute / DAY_IN_MS)}d`;
};

const resolveTimelineTone = (dueAt) => {
  if (!dueAt) return "normal";
  const diff = dueAt.getTime() - Date.now();
  if (diff < 0) return "critical";
  if (diff <= DAY_IN_MS) return "high";
  if (diff <= 3 * DAY_IN_MS) return "medium";
  return "normal";
};

const resolveProjectTypeKey = (project) => {
  if (isEmergencyProject(project)) return "emergency";
  if (isCorporateProject(project)) return "corporate";
  if (isQuoteProject(project)) return "quote";
  return "standard";
};

const getProjectProgress = (project) => {
  const map = isQuoteProject(project) ? QUOTE_PROGRESS_MAP : STANDARD_PROGRESS_MAP;
  return map[project?.status] ?? 5;
};

const formatProjectStatus = (status = "") =>
  STATUS_LABEL_OVERRIDES[status] ||
  (status.startsWith("Pending ") ? status.replace("Pending ", "") : status || "Draft");

const getStatusTone = (status = "") => {
  if (["Completed", "Finished"].includes(status)) return "success";
  if (status === "Pending Delivery/Pickup") return "info";
  if (status === "Order Confirmed") return "attention";
  if (status.toLowerCase().includes("pending")) return "warning";
  return "neutral";
};

const getTrendMeta = (percentage, averagePercentage) => {
  if (percentage >= averagePercentage + 8) {
    return { direction: "up", label: "Rising", icon: "\u2191" };
  }
  if (percentage <= averagePercentage - 8) {
    return { direction: "down", label: "Cooling", icon: "\u2193" };
  }
  return { direction: "flat", label: "Stable", icon: "\u2192" };
};

const getProjectDepartmentIds = (project) => {
  if (!Array.isArray(project?.departments)) return [];
  return project.departments.map((department) => toEntityId(department)).filter(Boolean);
};

const normalizeReferencePath = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if (typeof value.url === "string") return value.url.trim();
    if (typeof value.fileUrl === "string") return value.fileUrl.trim();
    if (typeof value.path === "string") return value.path.trim();
  }
  return "";
};

const getProjectReferenceImage = (project) => {
  const sampleImage = normalizeReferencePath(
    project?.sampleImage || project?.details?.sampleImage,
  );
  if (sampleImage) return sampleImage;

  const attachments = [
    ...(Array.isArray(project?.attachments) ? project.attachments : []),
    ...(Array.isArray(project?.details?.attachments) ? project.details.attachments : []),
  ];

  const firstImage = attachments
    .map((attachment) => normalizeReferencePath(attachment))
    .find((path) => {
      const cleanPath = path.split("?")[0].trim();
      return IMAGE_FILE_EXTENSIONS.test(cleanPath);
    });

  return firstImage || "";
};

const DashboardRedesign = ({ onNavigateProject, onCreateProject, user, onProjectChange }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [projectViewMode, setProjectViewMode] = useState("grid");
  const [pipelineView, setPipelineView] = useState("acceptance");
  const [selectedWorkloadDept, setSelectedWorkloadDept] = useState("");
  const [activeTimelineEvent, setActiveTimelineEvent] = useState(null);
  const [isDrawerMounted, setIsDrawerMounted] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

  const leadUserId = toEntityId(user?._id || user?.id);
  const previousLeadPendingIdsRef = useRef(new Set());
  const drawerCloseTimeoutRef = useRef(null);
  const drawerOpenFrameRef = useRef(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useRealtimeRefresh(() => fetchProjects());

  const openTimelineDrawer = useCallback(
    (eventItem) => {
      if (!eventItem) return;
      if (drawerCloseTimeoutRef.current) {
        clearTimeout(drawerCloseTimeoutRef.current);
        drawerCloseTimeoutRef.current = null;
      }
      if (drawerOpenFrameRef.current) {
        cancelAnimationFrame(drawerOpenFrameRef.current);
        drawerOpenFrameRef.current = null;
      }

      setActiveTimelineEvent(eventItem);

      if (isDrawerMounted) {
        setIsDrawerExpanded(true);
        return;
      }

      setIsDrawerMounted(true);
      setIsDrawerExpanded(false);
      drawerOpenFrameRef.current = requestAnimationFrame(() => {
        setIsDrawerExpanded(true);
        drawerOpenFrameRef.current = null;
      });
    },
    [isDrawerMounted],
  );

  const closeTimelineDrawer = useCallback(() => {
    if (!activeTimelineEvent || !isDrawerMounted) return;
    setIsDrawerExpanded(false);
    if (drawerCloseTimeoutRef.current) {
      clearTimeout(drawerCloseTimeoutRef.current);
    }
    drawerCloseTimeoutRef.current = setTimeout(() => {
      setIsDrawerMounted(false);
      setActiveTimelineEvent(null);
      drawerCloseTimeoutRef.current = null;
    }, DRAWER_TRANSITION_MS);
  }, [activeTimelineEvent, isDrawerMounted]);

  useEffect(
    () => () => {
      if (drawerCloseTimeoutRef.current) {
        clearTimeout(drawerCloseTimeoutRef.current);
      }
      if (drawerOpenFrameRef.current) {
        cancelAnimationFrame(drawerOpenFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeTimelineEvent) return undefined;
    const onEscape = (event) => {
      if (event.key === "Escape") closeTimelineDrawer();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [activeTimelineEvent, closeTimelineDrawer]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects", {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const sortedProjects = data.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        );
        setProjects(sortedProjects);
      } else {
        console.error("Failed to fetch projects");
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDetailsClick = (projectId) => {
    if (!projectId) return;
    if (onNavigateProject) {
      onNavigateProject(projectId);
      return;
    }
    navigate(`/detail/${projectId}`);
  };

  const handleUpdateStatusClick = async (projectId, currentStatus) => {
    if (currentStatus !== "Completed") {
      setToast({
        message: "Project must be 'Completed' before marking as finished.",
        type: "error",
      });
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Finished" }),
      });

      if (res.ok) {
        setToast({ message: "Project marked as Finished.", type: "success" });
        closeTimelineDrawer();
        fetchProjects();
        if (onProjectChange) onProjectChange();
      } else {
        setToast({ message: "Failed to update status.", type: "error" });
      }
    } catch (error) {
      console.error(error);
      setToast({ message: "Server error while updating status.", type: "error" });
    }
  };

  const handleStatsNavigate = (targetPath) => {
    navigate(targetPath);
  };

  const handleStatsCardKeyDown = (event, targetPath) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleStatsNavigate(targetPath);
    }
  };

  const formatDigestDate = (value, time) => {
    if (!value) return "No date";
    const dateLabel = new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return time ? `${dateLabel} (${time})` : dateLabel;
  };

  const formatAssignedDate = (project) => {
    const sourceDate = project?.updatedAt || project?.createdAt || project?.orderDate;
    if (!sourceDate) return "today";
    const parsed = new Date(sourceDate);
    if (Number.isNaN(parsed.getTime())) return "today";
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleAcceptPendingProject = (project) => {
    const projectId = project?._id;
    if (!projectId) return;
    const route =
      project?.projectType === "Quote"
        ? `/create/quote-wizard?edit=${projectId}`
        : `/create/wizard?edit=${projectId}`;
    navigate(route);
  };

  const pendingAcceptanceProjects = useMemo(
    () => projects.filter((project) => isPendingAcceptanceProject(project)),
    [projects],
  );

  const activeProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          !isPendingAcceptanceProject(project) &&
          !HISTORY_PROJECT_STATUSES.has(project.status || ""),
      ),
    [projects],
  );

  const completedProjects = useMemo(
    () =>
      projects.filter((project) =>
        HISTORY_PROJECT_STATUSES.has(project.status || ""),
      ),
    [projects],
  );

  const overdueProjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projects.filter((project) => {
      if (!project?.details?.deliveryDate) return false;
      const deliveryDate = new Date(project.details.deliveryDate);
      return (
        deliveryDate < today &&
        !OVERDUE_EXCLUDED_STATUSES.has(project.status || "")
      );
    });
  }, [projects]);

  const emergencyProjects = useMemo(
    () => projects.filter((project) => isEmergencyProject(project)),
    [projects],
  );

  const pendingDeliveryProjects = useMemo(
    () => projects.filter((project) => isPendingDeliveryProject(project)),
    [projects],
  );

  const quoteProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          isQuoteProject(project) &&
          !HISTORY_PROJECT_STATUSES.has(project.status || ""),
      ),
    [projects],
  );

  const corporateProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          isCorporateProject(project) &&
          !HISTORY_PROJECT_STATUSES.has(project.status || ""),
      ),
    [projects],
  );

  const leadPendingAssignmentProjects = useMemo(
    () =>
      projects.filter((project) => {
        const leadId = toEntityId(project?.projectLeadId);
        return (
          Boolean(leadUserId) &&
          leadId === leadUserId &&
          isPendingAcceptanceProject(project)
        );
      }),
    [projects, leadUserId],
  );

  useEffect(() => {
    const nextIds = new Set(
      leadPendingAssignmentProjects
        .map((project) => toEntityId(project?._id))
        .filter(Boolean),
    );
    const hasNewAssignment = Array.from(nextIds).some(
      (projectId) => !previousLeadPendingIdsRef.current.has(projectId),
    );
    const allowSound = user?.notificationSettings?.sound ?? true;

    if (hasNewAssignment && allowSound) {
      playNotificationSound("ASSIGNMENT", allowSound).catch(() => {});
    }

    previousLeadPendingIdsRef.current = nextIds;
  }, [leadPendingAssignmentProjects, user?.notificationSettings?.sound]);

  const pipelineOptions = useMemo(
    () => [
      {
        id: "acceptance",
        label: "Acceptance",
        description: "New projects waiting acceptance",
        route: "/create",
        count: pendingAcceptanceProjects.length,
        projects: pendingAcceptanceProjects,
      },
      {
        id: "quotes",
        label: "Quotes",
        description: "Quote jobs waiting conversion",
        route: "/projects?view=quotes",
        count: quoteProjects.length,
        projects: quoteProjects,
      },
      {
        id: "delivery",
        label: "Delivery",
        description: "Projects ready for delivery",
        route: "/projects?view=pending-delivery",
        count: pendingDeliveryProjects.length,
        projects: pendingDeliveryProjects,
      },
    ],
    [quoteProjects, pendingAcceptanceProjects, pendingDeliveryProjects],
  );

  const activePipelineOption =
    pipelineOptions.find((option) => option.id === pipelineView) || pipelineOptions[0];

  const pipelinePreviewProjects = useMemo(
    () => (activePipelineOption?.projects || []).slice(0, 3),
    [activePipelineOption],
  );

  const workloadStats = useMemo(() => {
    const departmentCounts = new Map();
    if (!activeProjects.length) return [];

    activeProjects.forEach((project) => {
      getProjectDepartmentIds(project).forEach((departmentId) => {
        departmentCounts.set(departmentId, (departmentCounts.get(departmentId) || 0) + 1);
      });
    });

    const rows = Array.from(departmentCounts.entries())
      .map(([departmentId, count], index) => ({
        departmentId,
        count,
        percentage: Math.max(1, Math.round((count / activeProjects.length) * 100)),
        color: WORKLOAD_COLORS[index % WORKLOAD_COLORS.length],
        label: getDepartmentLabel(departmentId),
      }))
      .sort((left, right) => right.count - left.count);

    const averagePercentage =
      rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length || 0;

    return rows.map((row) => ({
      ...row,
      trend: getTrendMeta(row.percentage, averagePercentage),
    }));
  }, [activeProjects]);

  const filteredProjects = useMemo(() => {
    const scopedProjects = selectedWorkloadDept
      ? activeProjects.filter((project) =>
          getProjectDepartmentIds(project).includes(selectedWorkloadDept),
        )
      : activeProjects;
    return scopedProjects.slice(0, RECENT_PROJECT_LIMIT);
  }, [activeProjects, selectedWorkloadDept]);

  const timelineEvents = useMemo(() => {
    const now = Date.now();
    const windowEnd = now + TIMELINE_LOOKAHEAD_DAYS * DAY_IN_MS;
    const events = [];

    activeProjects.forEach((project) => {
      const dueAt = buildDeliveryDateTime(
        project?.details?.deliveryDate,
        project?.details?.deliveryTime,
      );
      if (!dueAt) return;
      const dueTime = dueAt.getTime();
      if (dueTime < now || dueTime > windowEnd) return;
      const projectId = toEntityId(project?._id || project?.id);
      events.push({
        id: `project-${projectId || project?.orderId || dueTime}`,
        source: "project",
        projectId,
        title: project?.details?.projectName || "Untitled Project",
        subtitle: formatProjectStatus(project?.status || ""),
        orderId: project?.orderId || "",
        owner: getLeadDisplay(project, "Unassigned"),
        dueAt,
        tone: resolveTimelineTone(dueAt),
        project,
      });
    });

    return events
      .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())
      .slice(0, 10);
  }, [activeProjects]);

  const activeTimelineProject = useMemo(() => {
    if (!activeTimelineEvent) return null;
    if (activeTimelineEvent.project) return activeTimelineEvent.project;
    const targetId = activeTimelineEvent.projectId;
    if (!targetId) return null;
    return (
      projects.find(
        (project) => toEntityId(project?._id || project?.id) === toEntityId(targetId),
      ) || null
    );
  }, [activeTimelineEvent, projects]);

  const selectedDepartmentLabel = selectedWorkloadDept
    ? getDepartmentLabel(selectedWorkloadDept)
    : "";

  const greetingName = user?.firstName || user?.name || "User";
  const totalProjectsLabel = `${projects.length} total projects`;

  const renderProject = (project) => {
    const projectId = toEntityId(project?._id || project?.id);
    const projectTypeKey = resolveProjectTypeKey(project);
    const projectTypeMeta = PROJECT_TYPE_META[projectTypeKey] || PROJECT_TYPE_META.standard;
    const statusTone = getStatusTone(project?.status || "");
    const progress = getProjectProgress(project);
    const dueAt = buildDeliveryDateTime(
      project?.details?.deliveryDate,
      project?.details?.deliveryTime,
    );
  const leadDisplay = getLeadDisplay(project, "Unassigned");
  const leadAvatarUrl = getLeadAvatarUrl(project);
    const departments = getProjectDepartmentIds(project);
    const visibleDepartments = departments.slice(0, 2);
    const extraDepartmentCount = Math.max(0, departments.length - visibleDepartments.length);
    const referenceImage = getProjectReferenceImage(project);

    return (
      <article
        key={projectId || project?.orderId}
        className={`dashboard-project-item ${projectViewMode} project-${projectTypeKey}`}
        role="button"
        tabIndex={0}
        onClick={() => handleDetailsClick(projectId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleDetailsClick(projectId);
          }
        }}
      >
        <div className="dashboard-project-header">
          <div className="dashboard-project-header-main">
            <div className="dashboard-project-reference" aria-hidden={!referenceImage}>
              {referenceImage ? (
                <img
                  src={referenceImage}
                  alt={`${project?.details?.projectName || "Project"} reference`}
                  loading="lazy"
                />
              ) : (
                <div className="dashboard-project-reference-placeholder">
                  <FolderIcon width="16" height="16" />
                </div>
              )}
            </div>
            <div className="dashboard-project-title-wrap">
              <h4 className="dashboard-project-title">
                {project?.details?.projectName || "Untitled Project"}
              </h4>
              <p className="dashboard-project-order">
                {project?.orderId || "Order ID pending"}
              </p>
            </div>
          </div>
          <div className="dashboard-project-actions" aria-label="Quick project actions">
            <button
              type="button"
              className="dashboard-quick-action"
              title="Open details"
              aria-label="Open project details"
              onClick={(event) => {
                event.stopPropagation();
                handleDetailsClick(projectId);
              }}
            >
              <EyeIcon width="16" height="16" />
            </button>
            <button
              type="button"
              className="dashboard-quick-action"
              title={
                project?.status === "Completed"
                  ? "Mark as finished"
                  : "Project must be Completed first"
              }
              aria-label="Mark project as finished"
              onClick={(event) => {
                event.stopPropagation();
                handleUpdateStatusClick(projectId, project?.status);
              }}
            >
              <CheckCircleIcon width="16" height="16" />
            </button>
            <button
              type="button"
              className="dashboard-quick-action"
              title="Open in side panel"
              aria-label="Open project in side panel"
              onClick={(event) => {
                event.stopPropagation();
                openTimelineDrawer({
                  id: `project-${projectId}`,
                  source: "project",
                  projectId,
                  title: project?.details?.projectName || "Untitled Project",
                  subtitle: formatProjectStatus(project?.status || ""),
                  orderId: project?.orderId || "",
                  owner: getLeadDisplay(project, "Unassigned"),
                  dueAt,
                  tone: resolveTimelineTone(dueAt),
                  project,
                });
              }}
            >
              <ThreeDotsIcon width="16" height="16" />
            </button>
          </div>
        </div>

        <div className="dashboard-project-badges">
          <span className={`dashboard-type-badge ${projectTypeMeta.className}`}>
            {projectTypeMeta.label}
          </span>
          <span className={`dashboard-status-badge tone-${statusTone}`}>
            {formatProjectStatus(project?.status || "")}
          </span>
        </div>

        <div className="dashboard-project-progress-block">
          <div className="dashboard-project-progress-head">
            <span>Progress</span>
            <strong>{progress}%</strong>
          </div>
          <div className="dashboard-project-progress-track">
            <div
              className="dashboard-project-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="dashboard-project-meta">
          <div className="dashboard-project-lead">
            <UserAvatar
              name={leadDisplay}
              width="24px"
              height="24px"
              backgroundColor="#0f172a"
              src={leadAvatarUrl}
            />
            <span>{leadDisplay}</span>
          </div>
          <div className="dashboard-project-due">
            <span>{formatDueDate(dueAt)}</span>
            <em>{formatRelativeDue(dueAt)}</em>
          </div>
        </div>

        <div className="dashboard-project-departments">
          {visibleDepartments.length ? (
            visibleDepartments.map((departmentId) => (
              <span key={departmentId} className="dashboard-project-chip">
                {getDepartmentLabel(departmentId)}
              </span>
            ))
          ) : (
            <span className="dashboard-project-chip muted">No department set</span>
          )}
          {extraDepartmentCount > 0 && (
            <span className="dashboard-project-chip muted">
              +{extraDepartmentCount} more
            </span>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="dashboard-container dashboard-redesign">
      <div className="dashboard-page-header dashboard-header-v2">
        <div>
          <div className="dashboard-date">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </div>
          <h1 className="dashboard-greeting">Hello, {greetingName}</h1>
          <p className="dashboard-subtitle">
            Action workspace for delivery, approvals, and team load.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <span className="dashboard-total-projects">{totalProjectsLabel}</span>
        </div>
      </div>

      {leadPendingAssignmentProjects.length > 0 && (
        <section className="dashboard-lead-alert" role="alert" aria-live="assertive">
          <div className="dashboard-lead-alert-head">
            <span className="dashboard-alert-pill">New Assignment</span>
            <h2>
              {leadPendingAssignmentProjects.length} project
              {leadPendingAssignmentProjects.length === 1 ? "" : "s"} waiting for
              acceptance
            </h2>
            <p>Accept these jobs to clear the blocker and start production.</p>
          </div>
          <div className="dashboard-lead-alert-list">
            {leadPendingAssignmentProjects.map((project) => (
              <article key={project._id} className="dashboard-lead-alert-item">
                <div>
                  <p className="dashboard-lead-alert-id">
                    {project.orderId || "Order pending"}
                  </p>
                  <h3>{project.details?.projectName || "Untitled Project"}</h3>
                  <p className="dashboard-lead-alert-meta">
                    Assigned {formatAssignedDate(project)}
                    {project.details?.client ? ` | ${project.details.client}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="dashboard-lead-alert-action"
                  onClick={() => handleAcceptPendingProject(project)}
                >
                  Accept
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-kpi-layout">
        <div className="dashboard-kpi-panel">
          <div className="dashboard-panel-header">
            <h2>Requires Immediate Action</h2>
            <span className="panel-kicker">Priority</span>
          </div>
          <button
            type="button"
            className="dashboard-kpi-card-emergency kpi-emergency"
            onClick={() => handleStatsNavigate("/projects?view=emergencies")}
            onKeyDown={(event) =>
              handleStatsCardKeyDown(event, "/projects?view=emergencies")
            }
          >
            <span className="dashboard-kpi-icon emergency">
              <AlertTriangleIcon width="20" height="20" />
            </span>
            <div>
              <strong>{emergencyProjects.length}</strong>
              <p>Emergency projects</p>
            </div>
            <ChevronRightIcon width="16" height="16" />
          </button>
          <div className="dashboard-kpi-mini-grid">
            <button
              type="button"
              className="dashboard-kpi-mini-card kpi-overdue"
              onClick={() => handleStatsNavigate("/projects?view=overdue")}
            >
              <span className="dashboard-kpi-icon overdue">
                <ClockIcon width="16" height="16" />
              </span>
              <span>Overdue</span>
              <strong>{overdueProjects.length}</strong>
            </button>
            <button
              type="button"
              className="dashboard-kpi-mini-card kpi-delivery"
              onClick={() => handleStatsNavigate("/projects?view=pending-delivery")}
            >
              <span className="dashboard-kpi-icon delivery">
                <TruckIcon width="16" height="16" />
              </span>
              <span>Pending Delivery</span>
              <strong>{pendingDeliveryProjects.length}</strong>
            </button>
          </div>
        </div>

        <div className="dashboard-kpi-panel">
          <div className="dashboard-panel-header">
            <h2>Status Overview</h2>
            <span className="panel-kicker">Snapshot</span>
          </div>
          <div className="dashboard-kpi-mini-grid three">
            <button
              type="button"
              className="dashboard-kpi-mini-card kpi-active"
              onClick={() => handleStatsNavigate("/projects?view=active")}
            >
              <span className="dashboard-kpi-icon active">
                <FolderIcon width="16" height="16" />
              </span>
              <span>Active</span>
              <strong>{activeProjects.length}</strong>
            </button>
            <button
              type="button"
              className="dashboard-kpi-mini-card kpi-completed"
              onClick={() => handleStatsNavigate("/history")}
            >
              <span className="dashboard-kpi-icon completed">
                <CheckCircleIcon width="16" height="16" />
              </span>
              <span>Completed</span>
              <strong>{completedProjects.length}</strong>
            </button>
            <button
              type="button"
              className="dashboard-kpi-mini-card kpi-corporate"
              onClick={() => handleStatsNavigate("/projects?view=corporate")}
            >
              <span className="dashboard-kpi-icon corporate">
                <BuildingIcon width="16" height="16" />
              </span>
              <span>Corporate</span>
              <strong>{corporateProjects.length}</strong>
            </button>
          </div>
        </div>

        <div className="dashboard-pipeline-card">
          <div className="dashboard-panel-header">
            <h2>Pipeline</h2>
            <span className="panel-kicker">Switch View</span>
          </div>
          <div className="dashboard-pipeline-tabs">
            {pipelineOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === activePipelineOption.id ? "active" : ""}
                onClick={() => setPipelineView(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="dashboard-pipeline-main">
            <strong>{activePipelineOption.count}</strong>
            <p>{activePipelineOption.description}</p>
          </div>
          <div className="dashboard-pipeline-preview">
            {pipelinePreviewProjects.length ? (
              pipelinePreviewProjects.map((project) => (
                <button
                  type="button"
                  key={toEntityId(project?._id || project?.id) || project?.orderId}
                  className="dashboard-pipeline-project"
                  onClick={() =>
                    handleDetailsClick(toEntityId(project?._id || project?.id))
                  }
                >
                  <div>
                    <strong>{project?.details?.projectName || "Untitled Project"}</strong>
                    <p>{project?.orderId || "Order pending"}</p>
                  </div>
                  <ChevronRightIcon width="14" height="14" />
                </button>
              ))
            ) : (
              <p className="dashboard-empty-inline">No projects in this stage.</p>
            )}
          </div>
          <button
            type="button"
            className="dashboard-pipeline-open"
            onClick={() => handleStatsNavigate(activePipelineOption.route)}
          >
            Open {activePipelineOption.label}
            <ChevronRightIcon width="14" height="14" />
          </button>
        </div>
      </section>
      <section className="dashboard-workspace">
        <div className="dashboard-projects-panel">
          <div className="dashboard-section-header">
            <div>
              <h3>Recent Projects</h3>
              <p>
                {selectedDepartmentLabel
                  ? `Filtered by ${selectedDepartmentLabel}`
                  : `Latest ${RECENT_PROJECT_LIMIT} active projects`}
              </p>
            </div>
            <div className="dashboard-section-actions">
              {selectedWorkloadDept && (
                <button
                  type="button"
                  className="dashboard-clear-filter"
                  onClick={() => setSelectedWorkloadDept("")}
                >
                  Clear Filter
                </button>
              )}
              <div className="dashboard-view-toggle" role="group" aria-label="Project view">
                <button
                  type="button"
                  className={projectViewMode === "list" ? "active" : ""}
                  onClick={() => setProjectViewMode("list")}
                  aria-label="List view"
                >
                  <MenuIcon width="16" height="16" />
                </button>
                <button
                  type="button"
                  className={projectViewMode === "grid" ? "active" : ""}
                  onClick={() => setProjectViewMode("grid")}
                  aria-label="Grid view"
                >
                  <LayoutGridIcon width="16" height="16" />
                </button>
              </div>
              <button
                type="button"
                className="dashboard-see-all"
                onClick={() => handleStatsNavigate("/projects?view=active")}
              >
                See All
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="dashboard-loading-wrap">
              <LoadingSpinner />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="dashboard-empty">
              <p>No projects match this view.</p>
            </div>
          ) : (
            <div className={`dashboard-projects-feed ${projectViewMode}`}>
              {filteredProjects.map((project) => renderProject(project))}
            </div>
          )}
        </div>

        <aside className="dashboard-insights">
          <div className="dashboard-action-center">
            <div className="dashboard-section-header">
              <div>
                <h3>Action Center</h3>
                <p>Upcoming project deadlines in the next 3 days.</p>
              </div>
              <div className="dashboard-digest-meta">
                Next 3 days
              </div>
            </div>

            {timelineEvents.length ? (
              <ul className="dashboard-timeline">
                {timelineEvents.map((eventItem) => (
                  <li key={eventItem.id}>
                    <button
                      type="button"
                      className={`dashboard-timeline-item tone-${eventItem.tone}`}
                      onClick={() => openTimelineDrawer(eventItem)}
                    >
                      <div className="dashboard-timeline-main">
                        <span className={`dashboard-timeline-type ${eventItem.source}`}>
                          Deadline
                        </span>
                        <strong>{eventItem.title}</strong>
                        <p>
                          {eventItem.orderId ? `${eventItem.orderId} | ` : ""}
                          {eventItem.subtitle}
                        </p>
                      </div>
                      <div className="dashboard-timeline-side">
                        <span>{eventItem.dueAt ? formatDueDate(eventItem.dueAt) : "No date"}</span>
                        <em>
                          {eventItem.dueAt
                            ? formatRelativeDue(eventItem.dueAt)
                            : "Needs schedule"}
                        </em>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dashboard-empty">
                <p>No upcoming project deadlines in the next 3 days.</p>
              </div>
            )}
          </div>

          <div className="dashboard-workload">
            <div className="dashboard-section-header">
              <div>
                <h3>Department Workload</h3>
                <p>Click a bar to filter projects by department.</p>
              </div>
            </div>
            {workloadStats.length ? (
              <div className="dashboard-workload-list">
                {workloadStats.map((row) => {
                  const isActive = selectedWorkloadDept === row.departmentId;
                  return (
                    <button
                      type="button"
                      key={row.departmentId}
                      className={`dashboard-workload-row ${isActive ? "active" : ""}`}
                      onClick={() =>
                        setSelectedWorkloadDept((current) =>
                          current === row.departmentId ? "" : row.departmentId,
                        )
                      }
                      title={`${row.label}: ${row.count} projects (${row.percentage}%)`}
                    >
                      <div className="dashboard-workload-head">
                        <strong>{row.label}</strong>
                        <span>
                          {row.percentage}% ({row.count})
                        </span>
                      </div>
                      <div className="dashboard-workload-track">
                        <span
                          className="dashboard-workload-fill"
                          style={{
                            width: `${row.percentage}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                      <div className={`dashboard-workload-trend ${row.trend.direction}`}>
                        <span>{row.trend.icon}</span>
                        <span>{row.trend.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="dashboard-empty">
                <p>No department data available.</p>
              </div>
            )}
          </div>
        </aside>
      </section>
      {isDrawerMounted && activeTimelineEvent && (
        <>
          <button
            type="button"
            className={`dashboard-drawer-backdrop ${isDrawerExpanded ? "open" : "closing"}`}
            aria-label="Close project panel"
            onClick={closeTimelineDrawer}
          />
          <aside
            className={`dashboard-project-drawer ${isDrawerExpanded ? "open" : "closing"}`}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="dashboard-drawer-close"
              onClick={closeTimelineDrawer}
              aria-label="Close"
            >
              <XIcon width="18" height="18" />
            </button>
            <div className="dashboard-drawer-head">
              <span className={`dashboard-timeline-type ${activeTimelineEvent.source}`}>
                {activeTimelineEvent.source === "project" ? "Project Detail" : "Digest Detail"}
              </span>
              <h3>
                {activeTimelineProject?.details?.projectName || activeTimelineEvent.title}
              </h3>
              <p>{activeTimelineProject?.orderId || activeTimelineEvent.orderId || "Order pending"}</p>
            </div>

            <div className="dashboard-drawer-grid">
              <div>
                <span>Status</span>
                <strong>
                  {activeTimelineProject
                    ? formatProjectStatus(activeTimelineProject.status || "")
                    : activeTimelineEvent.subtitle}
                </strong>
              </div>
              <div>
                <span>Due</span>
                <strong>
                  {activeTimelineEvent.dueAt
                    ? formatDigestDate(
                        activeTimelineEvent.dueAt,
                        activeTimelineEvent.dueAt.toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      )
                    : "Not scheduled"}
                </strong>
              </div>
              <div>
                <span>Owner</span>
                <strong>
                  {activeTimelineProject
                    ? getLeadDisplay(activeTimelineProject, "Unassigned")
                    : activeTimelineEvent.owner || "Team"}
                </strong>
              </div>
              <div>
                <span>Type</span>
                <strong>
                  {activeTimelineProject
                    ? PROJECT_TYPE_META[resolveProjectTypeKey(activeTimelineProject)]?.label
                    : activeTimelineEvent.source === "digest"
                      ? "Digest Action"
                      : "Project"}
                </strong>
              </div>
            </div>

            {activeTimelineProject && (
              <div className="dashboard-drawer-progress">
                <div className="dashboard-project-progress-head">
                  <span>Progress</span>
                  <strong>{getProjectProgress(activeTimelineProject)}%</strong>
                </div>
                <div className="dashboard-project-progress-track">
                  <div
                    className="dashboard-project-progress-fill"
                    style={{ width: `${getProjectProgress(activeTimelineProject)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="dashboard-drawer-actions">
              {activeTimelineProject && (
                <>
                  <button
                    type="button"
                    className="dashboard-drawer-primary"
                    onClick={() =>
                      handleDetailsClick(
                        toEntityId(activeTimelineProject?._id || activeTimelineProject?.id),
                      )
                    }
                  >
                    Open Project
                  </button>
                  <button
                    type="button"
                    className="dashboard-drawer-secondary"
                    onClick={() =>
                      handleUpdateStatusClick(
                        toEntityId(activeTimelineProject?._id || activeTimelineProject?.id),
                        activeTimelineProject?.status,
                      )
                    }
                  >
                    Mark as Finished
                  </button>
                </>
              )}
            </div>
          </aside>
        </>
      )}

      <FabButton onClick={onCreateProject} />

      {toast && (
        <div className="ui-toast-container">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
};

export default DashboardRedesign;
