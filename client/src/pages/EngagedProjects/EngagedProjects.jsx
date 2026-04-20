import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
  getDepartmentLabel,
  normalizeDepartmentId,
} from "../../constants/departments";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Toast from "../../components/ui/Toast";
import ContextualHelpLink from "../../components/features/ContextualHelpLink";
import usePersistedState from "../../hooks/usePersistedState";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import useAuthorizedProjectNavigation from "../../hooks/useAuthorizedProjectNavigation.jsx";
import {
  getFullName,
  getLeadDisplay,
  getLeadSearchText,
} from "../../utils/leadDisplay";
import { normalizeProjectUpdateText } from "../../utils/projectUpdateText";
import { renderProjectName } from "../../utils/projectName";
import {
  getQuoteRequirementSummary,
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
  isQuoteMockupCompletionConfirmed,
  normalizeQuoteChecklist,
  normalizeQuoteStatus,
} from "../../utils/quoteStatus";
import {
  getLatestMockupVersion,
  isMockupAwaitingGraphicsValidation,
  isMockupClientRejected,
} from "../../utils/mockupWorkflow";
import "./EngagedProjects.css";

const STATUS_OPTIONS = [
  "All",
  "Pending Departmental Meeting",
  "Pending Departmental Engagement",
  "Pending Mockup",
  "Pending Master Approval",
  "Pending Production",
  "Pending Quality Control",
  "Pending Photography",
  "Pending Packaging",
  "Pending Delivery/Pickup",
  "Order Created",
  "In Progress",
];

const STATUS_ACTIONS = {
  Graphics: {
    label: "Mockup",
    pending: "Pending Mockup",
    complete: "Mockup Completed",
  },
  Production: {
    label: "Production Complete",
    pending: "Pending Production",
    complete: "Production Completed",
  },
  Photography: {
    label: "Photography Complete",
    pending: "Pending Photography",
    complete: "Photography Completed",
  },
  Stores: {
    label: "Stocks & Packaging Complete",
    pending: "Pending Packaging",
    complete: "Packaging Completed",
  },
};

const ITEMS_PER_PAGE = 15;
const ACKNOWLEDGE_PHRASE = "I agree to be engaged in this project";
const COMPLETE_PHRASE = "I confirm this engagement is complete";
const SCOPE_APPROVAL_READY_STATUSES = new Set([
  "Scope Approval Completed",
  "Pending Departmental Meeting",
  "Pending Departmental Engagement",
  "Departmental Engagement Completed",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Master Approval",
  "Master Approval Completed",
  "Pending Production",
  "Production Completed",
  "Pending Quality Control",
  "Quality Control Completed",
  "Pending Photography",
  "Photography Completed",
  "Pending Packaging",
  "Packaging Completed",
  "Pending Delivery/Pickup",
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Finished",
  "In Progress",
  "Completed",
  "On Hold",
  "Pending Cost Verification",
  "Cost Verification Completed",
  "Pending Sample Retrieval",
  "Pending Sample / Work done Retrieval",
  "Pending Quote Requirements",
  "Pending Sample Production",
  "Pending Bid Submission / Documents",
  "Pending Quote Submission",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Declined",
]);

const isScopeApprovalComplete = (status) =>
  Boolean(status && SCOPE_APPROVAL_READY_STATUSES.has(status));
const normalizeBatchStatus = (status) =>
  String(status || "").trim().toLowerCase();
const QUOTE_MOCKUP_PENDING_UPLOAD_STATUSES = new Set([
  "assigned",
  "in_progress",
  "client_revision_requested",
  "blocked",
]);
const QUOTE_SAMPLE_PRODUCTION_COMPLETE_STATUSES = new Set([
  "dept_submitted",
  "frontdesk_review",
  "sent_to_client",
  "client_approved",
  "completed",
]);
const STANDARD_DEPARTMENT_COMPLETION_STATUS_SETS = {
  Graphics: new Set([
    "Mockup Completed",
    "Pending Master Approval",
    "Master Approval Completed",
    "Pending Production",
    "Production Completed",
    "Pending Quality Control",
    "Quality Control Completed",
    "Pending Photography",
    "Photography Completed",
    "Pending Packaging",
    "Packaging Completed",
    "Pending Delivery/Pickup",
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
    "In Progress",
  ]),
  Production: new Set([
    "Production Completed",
    "Pending Quality Control",
    "Quality Control Completed",
    "Pending Photography",
    "Photography Completed",
    "Pending Packaging",
    "Packaging Completed",
    "Pending Delivery/Pickup",
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
    "In Progress",
  ]),
  Photography: new Set([
    "Photography Completed",
    "Pending Packaging",
    "Packaging Completed",
    "Pending Delivery/Pickup",
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
    "In Progress",
  ]),
  Stores: new Set([
    "Packaging Completed",
    "Pending Delivery/Pickup",
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
    "In Progress",
  ]),
};
const ENGAGED_TAB_OPTIONS = ["active", "history"];
const KPI_FILTER_OPTIONS = [
  "all",
  "pendingAcceptance",
  "waitingMockup",
  "completedActions",
];

const normalizeObjectId = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const normalizeDepartmentList = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : value ? [value] : [])
        .map(normalizeDepartmentId)
        .filter(Boolean),
    ),
  );

const getQuoteRequirementState = (project = {}, key = "") => {
  const quoteDetails = project?.quoteDetails || {};
  const checklistRequired = Boolean(quoteDetails?.checklist?.[key]);
  const rawItems =
    quoteDetails?.requirementItems &&
    typeof quoteDetails.requirementItems === "object"
      ? quoteDetails.requirementItems
      : {};
  const rawItem =
    rawItems?.[key] && typeof rawItems[key] === "object" ? rawItems[key] : {};
  const rawStatus = String(rawItem?.status || "").trim().toLowerCase();
  const isRequired = Boolean(rawItem?.isRequired) || checklistRequired;
  const status = isRequired
    ? rawStatus && rawStatus !== "not_required"
      ? rawStatus
      : "assigned"
    : "not_required";

  return {
    isRequired,
    status,
  };
};

const EngagedProjects = ({ user }) => {
  const navigate = useNavigate();
  const { navigateToProject, projectRouteChoiceDialog } =
    useAuthorizedProjectNavigation(user);
  const [activeTab, setActiveTab] = usePersistedState(
    "client-engaged-projects-tab",
    "active",
    {
      sanitize: (value) =>
        ENGAGED_TAB_OPTIONS.includes(value) ? value : "active",
    },
  );
  const [projects, setProjects] = useState([]);
  const [historyProjects, setHistoryProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Filter State
  const [statusFilter, setStatusFilter] = usePersistedState(
    "client-engaged-projects-status-filter",
    "All",
    {
      sanitize: (value) =>
        STATUS_OPTIONS.includes(value) ? value : "All",
    },
  );
  const [departmentFilter, setDepartmentFilter] = usePersistedState(
    "client-engaged-projects-department-filter",
    "All",
  );
  const [searchQuery, setSearchQuery] = usePersistedState(
    "client-engaged-projects-search",
    "",
  );
  const [kpiFilter, setKpiFilter] = usePersistedState(
    "client-engaged-projects-kpi-filter",
    "all",
    {
      sanitize: (value) =>
        KPI_FILTER_OPTIONS.includes(value) ? value : "all",
    },
  );
  const [historyProjectIdQuery, setHistoryProjectIdQuery] = usePersistedState(
    "client-engaged-projects-history-project-query",
    "",
  );
  const [historyDeptFilter, setHistoryDeptFilter] = usePersistedState(
    "client-engaged-projects-history-department-filter",
    "All",
  );

  // Pagination State
  const [currentPage, setCurrentPage] = usePersistedState(
    "client-engaged-projects-page",
    1,
    {
      sanitize: (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
      },
    },
  );
  const [historyPage, setHistoryPage] = usePersistedState(
    "client-engaged-projects-history-page",
    1,
    {
      sanitize: (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
      },
    },
  );

  // Modal State
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    content: "",
    category: "Production",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [acknowledgeTarget, setAcknowledgeTarget] = useState(null);
  const [acknowledgeInput, setAcknowledgeInput] = useState("");
  const [acknowledgeSubmitting, setAcknowledgeSubmitting] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeInput, setCompleteInput] = useState("");
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [showMockupModal, setShowMockupModal] = useState(false);
  const [mockupTarget, setMockupTarget] = useState(null);
  const [mockupFiles, setMockupFiles] = useState([]);
  const [mockupNote, setMockupNote] = useState("");
  const [mockupUploading, setMockupUploading] = useState(false);

  const userDepartments = useMemo(
    () => normalizeDepartmentList(user?.department),
    [user?.department],
  );
  const hasGraphicsParent = userDepartments.includes("Graphics/Design");
  const hasProductionParent = userDepartments.includes("Production");
  const hasStoresParent = userDepartments.includes("Stores");
  const hasPhotographyParent = userDepartments.includes("Photography");
  const hasPackagingRole =
    hasStoresParent ||
    userDepartments.some((dept) => STORES_SUB_DEPARTMENTS.includes(dept));

  const productionSubDepts = useMemo(() => {
    return userDepartments.filter((d) =>
      PRODUCTION_SUB_DEPARTMENTS.includes(d),
    );
  }, [userDepartments]);
  const effectiveProductionSubDepts = useMemo(
    () =>
      hasProductionParent
        ? PRODUCTION_SUB_DEPARTMENTS
        : productionSubDepts,
    [hasProductionParent, productionSubDepts],
  );

  // Determine all engaged departments the user belongs to
  const userEngagedDepts = useMemo(() => {
    const found = [];
    if (hasProductionParent || effectiveProductionSubDepts.length > 0) {
      found.push("Production");
    }
    if (
      hasGraphicsParent ||
      userDepartments.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Graphics");
    if (
      hasStoresParent ||
      userDepartments.some((d) => STORES_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Stores");
    if (
      hasPhotographyParent ||
      userDepartments.some((d) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Photography");
    return found;
  }, [
    userDepartments,
    hasProductionParent,
    effectiveProductionSubDepts,
    hasGraphicsParent,
    hasStoresParent,
    hasPhotographyParent,
  ]);

  // Determine sub-departments to check based on the selected department filter
  const engagedSubDepts = useMemo(() => {
    // If filtering by a specific department
    if (departmentFilter === "Graphics") return GRAPHICS_SUB_DEPARTMENTS;
    if (departmentFilter === "Stores") return STORES_SUB_DEPARTMENTS;
    if (departmentFilter === "Photography") return PHOTOGRAPHY_SUB_DEPARTMENTS;
    if (departmentFilter === "Production") return effectiveProductionSubDepts;

    // If "All" or default, aggregate from all user's engaged departments
    let aggregated = [];
    if (effectiveProductionSubDepts.length > 0)
      aggregated = [...aggregated, ...effectiveProductionSubDepts];
    if (userEngagedDepts.includes("Graphics"))
      aggregated = [...aggregated, ...GRAPHICS_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Stores"))
      aggregated = [...aggregated, ...STORES_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Photography"))
      aggregated = [...aggregated, ...PHOTOGRAPHY_SUB_DEPARTMENTS];

    return aggregated;
  }, [userEngagedDepts, departmentFilter, effectiveProductionSubDepts]);

  // Determine user's primary label for the current view
  const primaryDeptLabel = useMemo(() => {
    if (departmentFilter !== "All") return departmentFilter;
    if (userEngagedDepts.length === 1) return userEngagedDepts[0];
    return "Engaged";
  }, [userEngagedDepts, departmentFilter]);

  useEffect(() => {
    if (departmentFilter === "All" || userEngagedDepts.includes(departmentFilter)) {
      return;
    }
    setDepartmentFilter("All");
  }, [departmentFilter, setDepartmentFilter, userEngagedDepts]);

  useEffect(() => {
    fetchEngagedProjects();
  }, [engagedSubDepts]);

  useRealtimeRefresh(() => fetchEngagedProjects(), {
    paths: ["/api/projects", "/api/updates"],
    excludePaths: ["/api/projects/activities", "/api/projects/ai"],
    shouldRefresh: (detail) => {
      if (detail.path.startsWith("/api/updates")) {
        return Boolean(
          selectedProject?._id &&
            detail.projectId &&
            detail.projectId === selectedProject._id,
        );
      }

      return true;
    },
  });

  const fetchEngagedProjects = async () => {
    try {
      // Use mode=engaged to bypass lead filtering and get all projects
      const res = await fetch("/api/projects?mode=engaged");
      if (res.ok) {
        const data = await res.json();
        // Filter projects that have at least one production sub-department engaged
        const engaged = data.filter((project) => {
          const hasDeptMatch =
            Array.isArray(project?.departments) &&
            project.departments.some((dept) =>
              engagedSubDepts.includes(normalizeDepartmentId(dept)),
            );
          if (hasDeptMatch) return true;
          if (
            !hasPackagingRole ||
            !["All", "Stores"].includes(departmentFilter)
          )
            return false;
          const batches = Array.isArray(project?.batches) ? project.batches : [];
          return batches.some((batch) =>
            ["produced", "in_packaging"].includes(
              normalizeBatchStatus(batch?.status),
            ),
          );
        });
        const completedStatuses = new Set(["Completed", "Finished"]);
        const postDeliveryStatuses = new Set([
          "Delivered",
          "Pending Feedback",
          "Feedback Completed",
        ]);
        // Active engaged (exclude completed/finished/post-delivery)
        const activeEngaged = engaged.filter(
          (p) =>
            !completedStatuses.has(p.status) &&
            !postDeliveryStatuses.has(p.status),
        );
        // History engaged (completed/finished only)
        const historyEngaged = engaged.filter((p) =>
          completedStatuses.has(p.status),
        );
        setProjects(activeEngaged);
        setHistoryProjects(historyEngaged);
      }
    } catch (err) {
      console.error("Error fetching engaged projects:", err);
      setToast({ type: "error", message: "Failed to load projects." });
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  useEffect(() => {
    setHistoryPage(1);
    setHistoryDeptFilter("All");
  }, [departmentFilter]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyProjectIdQuery, historyDeptFilter]);

  useEffect(() => {
    if (
      historyDeptFilter === "All" ||
      Array.from(new Set(engagedSubDepts)).includes(historyDeptFilter)
    ) {
      return;
    }
    setHistoryDeptFilter("All");
  }, [engagedSubDepts, historyDeptFilter, setHistoryDeptFilter]);

  const filteredHistoryProjects = useMemo(() => {
    return historyProjects.filter((project) => {
      const engagedDeptsForUser = normalizeDepartmentList(project.departments).filter(
        (dept) => engagedSubDepts.includes(dept),
      );
      if (engagedDeptsForUser.length === 0) return false;

      if (historyProjectIdQuery.trim()) {
        const query = historyProjectIdQuery.toLowerCase();
        const projectId = (project.orderId || project._id).toLowerCase();
        if (!projectId.includes(query)) return false;
      }

      if (
        historyDeptFilter !== "All" &&
        !engagedDeptsForUser.includes(historyDeptFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [
    historyProjects,
    historyProjectIdQuery,
    historyDeptFilter,
    engagedSubDepts,
  ]);

  const historyTotalPages = Math.ceil(
    filteredHistoryProjects.length / ITEMS_PER_PAGE,
  );
  const paginatedHistoryProjects = useMemo(() => {
    const startIndex = (historyPage - 1) * ITEMS_PER_PAGE;
    return filteredHistoryProjects.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE,
    );
  }, [filteredHistoryProjects, historyPage]);

  // Check if project is emergency
  const isEmergency = (project) => {
    return project.priority === "Urgent" || project.projectType === "Emergency";
  };

  // Check if delivery is approaching (within 2 days)
  const isApproachingDelivery = (project) => {
    const deliveryDate = project.details?.deliveryDate;
    if (!deliveryDate) return false;
    const delivery = new Date(deliveryDate);
    const now = new Date();
    const diffMs = delivery - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 2;
  };

  const projectHasDept = (project, dept) => {
    const projDepts = normalizeDepartmentList(project.departments);
    if (dept === "Graphics")
      return projDepts.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d));
    if (dept === "Production")
      return projDepts.some((d) => effectiveProductionSubDepts.includes(d));
    if (dept === "Photography")
      return projDepts.some((d) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(d));
    if (dept === "Stores")
      return projDepts.some((d) => STORES_SUB_DEPARTMENTS.includes(d));
    return false;
  };

  const getDeptActionsForProject = (project) => {
    let allowed = userEngagedDepts.filter((d) => STATUS_ACTIONS[d]);
    if (departmentFilter !== "All") {
      allowed = allowed.filter((d) => d === departmentFilter);
    }
    return allowed
      .filter((dept) => projectHasDept(project, dept))
      .map((dept) => ({ dept, ...STATUS_ACTIONS[dept] }));
  };

  const getProjectLeadMatch = (project) => {
    const currentUserId = normalizeObjectId(user?._id || user?.id);
    const projectLeadId = normalizeObjectId(project?.projectLeadId);
    return Boolean(currentUserId && projectLeadId && currentUserId === projectLeadId);
  };

  const getRelevantDepartmentTokens = (dept) => {
    if (dept === "Graphics") return GRAPHICS_SUB_DEPARTMENTS;
    if (dept === "Stores") return STORES_SUB_DEPARTMENTS;
    if (dept === "Photography") return PHOTOGRAPHY_SUB_DEPARTMENTS;
    if (dept === "Production") return effectiveProductionSubDepts;
    return [];
  };

  const getMatchedProjectDepartments = (project, dept) => {
    const relevantTokens = getRelevantDepartmentTokens(dept);
    if (!relevantTokens.length) return [];
    const projectDepartments = Array.isArray(project?.departments)
      ? project.departments
      : [];
    return projectDepartments.filter((token) => relevantTokens.includes(token));
  };

  const isDepartmentAcknowledged = (project, dept) => {
    const matchedDepartments = getMatchedProjectDepartments(project, dept);
    if (!matchedDepartments.length) return false;
    const acknowledged = new Set(
      (Array.isArray(project?.acknowledgements) ? project.acknowledgements : [])
        .map((entry) => entry?.department)
        .filter(Boolean),
    );
    return matchedDepartments.some((token) => acknowledged.has(token));
  };

  const canDepartmentTakeAction = (project, dept) => {
    const isProjectLead = getProjectLeadMatch(project);
    if (isProjectLead && dept !== "Graphics") return false;
    if (dept === "Graphics" && isProjectLead) {
      return true;
    }
    return isDepartmentAcknowledged(project, dept);
  };

  const resolveQuoteChecklist = (projectRecord) => {
    const base = normalizeQuoteChecklist(
      projectRecord?.quoteDetails?.checklist || {},
    );
    const sampleProductionSelected = Boolean(base.sampleProduction);
    const requirementItems =
      projectRecord?.quoteDetails?.requirementItems || {};

    Object.keys(base).forEach((key) => {
      if (!base[key] && requirementItems?.[key]?.isRequired) {
        if (sampleProductionSelected && key === "mockup") return;
        base[key] = true;
      }
    });

    return base;
  };

  const getQuoteSummaryForProject = (project) =>
    getQuoteRequirementSummary(resolveQuoteChecklist(project));

  const getEffectiveQuoteMockupRequirement = (project) => {
    const summary = getQuoteSummaryForProject(project);
    const base = getQuoteRequirementState(project, "mockup");
    if (summary.includesSampleProduction) {
      return {
        ...base,
        isRequired: true,
        status: base.status === "not_required" ? "assigned" : base.status,
      };
    }
    return base;
  };

  const isQuoteDepartmentActionCompleted = (project, dept) => {
    const summary = getQuoteSummaryForProject(project);

    if (dept === "Graphics") {
      if (!summary.includesMockup) return false;
      return isQuoteMockupCompletionConfirmed(project, summary.mode);
    }

    if (dept === "Production") {
      if (!summary.includesSampleProduction) return false;
      const requirement = getQuoteRequirementState(project, "sampleProduction");
      return QUOTE_SAMPLE_PRODUCTION_COMPLETE_STATUSES.has(requirement.status);
    }

    return false;
  };

  const isDepartmentActionCompleted = (project, dept) => {
    if (project?.projectType === "Quote") {
      return isQuoteDepartmentActionCompleted(project, dept);
    }
    return Boolean(
      STANDARD_DEPARTMENT_COMPLETION_STATUS_SETS[dept]?.has(project?.status),
    );
  };

  const isGraphicsMockupWaitingForUpload = (project) => {
    if (!projectHasDept(project, "Graphics")) return false;
    if (!canDepartmentTakeAction(project, "Graphics")) return false;

    const latestMockupVersion = getLatestMockupVersion(project?.mockup || {});

    if (project?.projectType === "Quote") {
      const normalizedQuoteStatus = String(
        normalizeQuoteStatus(project?.status || ""),
      ).trim();
      if (!isScopeApprovalComplete(normalizedQuoteStatus)) return false;

      const summary = getQuoteSummaryForProject(project);
      if (!summary.includesMockup) return false;
      if (isQuoteMockupCompletionConfirmed(project, summary.mode)) return false;

      const requirement = getEffectiveQuoteMockupRequirement(project);
      if (!requirement.isRequired) return false;
      if (!QUOTE_MOCKUP_PENDING_UPLOAD_STATUSES.has(requirement.status)) {
        return false;
      }

      if (!latestMockupVersion?.fileUrl) return true;
      return (
        isMockupAwaitingGraphicsValidation(latestMockupVersion) ||
        isMockupClientRejected(latestMockupVersion)
      );
    }

    if (project?.status !== "Pending Mockup") return false;
    if (!latestMockupVersion?.fileUrl) return true;
    return (
      isMockupAwaitingGraphicsValidation(latestMockupVersion) ||
      isMockupClientRejected(latestMockupVersion)
    );
  };

  const activeDepartmentAssignments = projects.flatMap((project) =>
    getDeptActionsForProject(project).map((action) => ({
      project,
      dept: action.dept,
    })),
  );
  const actionableDepartmentAssignments = activeDepartmentAssignments.filter(
    ({ project, dept }) =>
      !(getProjectLeadMatch(project) && dept !== "Graphics"),
  );

  const pendingAcceptanceCount = actionableDepartmentAssignments.filter(
    ({ project, dept }) =>
      isScopeApprovalComplete(project?.status) &&
      !(dept === "Graphics" && getProjectLeadMatch(project)) &&
      !isDepartmentAcknowledged(project, dept),
  ).length;
  const projectMatchesPendingAcceptance = (project) =>
    actionableDepartmentAssignments.some(
      (assignment) =>
        assignment.project?._id === project?._id &&
        isScopeApprovalComplete(assignment.project?.status) &&
        !isDepartmentAcknowledged(assignment.project, assignment.dept),
    );
  const projectMatchesCompletedAction = (project) =>
    actionableDepartmentAssignments.some(
      (assignment) =>
        assignment.project?._id === project?._id &&
        isDepartmentActionCompleted(assignment.project, assignment.dept),
    );
  const getProjectAcknowledgementRows = (project) => {
    const projectDepartments = Array.isArray(project?.departments)
      ? project.departments
      : [];
    const ackEntries = Array.isArray(project?.acknowledgements)
      ? project.acknowledgements
      : [];
    const relevantDepartments =
      departmentFilter === "All"
        ? userEngagedDepts.filter((dept) => projectHasDept(project, dept))
        : userEngagedDepts
            .filter((dept) => dept === departmentFilter)
            .filter((dept) => projectHasDept(project, dept));

    return relevantDepartments
      .map((dept) => {
        const matchedTokens = getRelevantDepartmentTokens(dept).filter((token) =>
          projectDepartments.includes(token),
        );
        if (!matchedTokens.length) return null;

        const matchedAcknowledgements = ackEntries.filter((entry) =>
          matchedTokens.includes(entry?.department),
        );
        if (!matchedAcknowledgements.length) return null;

        const names = Array.from(
          new Set(
            matchedAcknowledgements
              .map((entry) => getFullName(entry?.user))
              .filter(Boolean),
          ),
        );
        if (!names.length) return null;

        return {
          dept,
          label: dept,
          names,
        };
      })
      .filter(Boolean);
  };

  const departmentActionCompletedCount = actionableDepartmentAssignments.filter(
    ({ project, dept }) => isDepartmentActionCompleted(project, dept),
  ).length;
  const departmentActionTotalCount = actionableDepartmentAssignments.length;
  const departmentCompletionPercent =
    departmentActionTotalCount > 0
      ? Math.round(
          (departmentActionCompletedCount / departmentActionTotalCount) * 100,
        )
      : 0;

  const canShowMockupUploadKpi =
    userEngagedDepts.includes("Graphics") &&
    ["All", "Graphics"].includes(departmentFilter);
  const waitingForMockupUploadCount = canShowMockupUploadKpi
    ? projects.filter((project) => isGraphicsMockupWaitingForUpload(project))
        .length
    : 0;
  const engagedContextLabel =
    departmentFilter === "All"
      ? "your engaged departments"
      : `${departmentFilter.toLowerCase()} work`;
  const kpiFilterLabels = {
    all: "All Active Projects",
    pendingAcceptance: "Pending Acceptance",
    waitingMockup: "Waiting for Mockup Upload",
    completedActions: "Department Completion",
  };

  useEffect(() => {
    if (kpiFilter === "waitingMockup" && !canShowMockupUploadKpi) {
      setKpiFilter("all");
    }
  }, [kpiFilter, canShowMockupUploadKpi]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (
        kpiFilter === "pendingAcceptance" &&
        !projectMatchesPendingAcceptance(project)
      ) {
        return false;
      }

      if (
        kpiFilter === "waitingMockup" &&
        !isGraphicsMockupWaitingForUpload(project)
      ) {
        return false;
      }

      if (
        kpiFilter === "completedActions" &&
        !projectMatchesCompletedAction(project)
      ) {
        return false;
      }

      if (statusFilter !== "All" && project.status !== statusFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const projectId = (project.orderId || project._id).toLowerCase();
        const projectName = (project.details?.projectName || "").toLowerCase();
        const lead = getLeadSearchText(project);

        if (
          !projectId.includes(query) &&
          !projectName.includes(query) &&
          !lead.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    projects,
    kpiFilter,
    statusFilter,
    searchQuery,
  ]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, departmentFilter, searchQuery, kpiFilter]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredProjects, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, setCurrentPage, totalPages]);

  useEffect(() => {
    if (historyPage > historyTotalPages && historyTotalPages > 0) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages, setHistoryPage]);

  const handleCompleteStatus = async (project, action) => {
    try {
      const res = await fetch(`/api/projects/${project._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.complete }),
      });

      if (res.ok) {
        setToast({
          type: "success",
          message: `${action.label} recorded.`,
        });
        fetchEngagedProjects();
        return true;
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: errorData.message || "Failed to update status.",
        });
        return false;
      }
    } catch (err) {
      console.error("Error updating status:", err);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
      return false;
    }
  };

  const handleSubmitUpdate = async (e) => {
    e.preventDefault();
    if (!updateForm.content || !updateForm.department) {
      setToast({
        type: "error",
        message: "Please provide update content and select a department.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append(
        "content",
        `[${getDepartmentLabel(updateForm.department)}] ${updateForm.content}`,
      );
      data.append("category", updateForm.category);

      const res = await fetch(`/api/updates/project/${selectedProject._id}`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        setToast({ type: "success", message: "Update posted successfully!" });
        await fetchEngagedProjects();
        setShowUpdateModal(false);
        setSelectedProject(null);
        setUpdateForm({ content: "", category: "Production", department: "" });
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Failed to post update.",
        });
      }
    } catch (err) {
      console.error("Error posting update:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (project, department) => {
    try {
      const res = await fetch(`/api/projects/${project._id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department }),
      });

      if (res.ok) {
        setToast({
          type: "success",
          message: `${getDepartmentLabel(department)} acknowledged!`,
        });
        fetchEngagedProjects(); // Refresh the list
        return true;
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Acknowledgement failed.",
        });
        return false;
      }
    } catch (err) {
      console.error("Error acknowledging project:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
      return false;
    }
  };

  const closeAcknowledgeModal = () => {
    setShowAcknowledgeModal(false);
    setAcknowledgeTarget(null);
    setAcknowledgeInput("");
    setAcknowledgeSubmitting(false);
  };

  const handleConfirmAcknowledge = async () => {
    if (!acknowledgeTarget) return;
    if (acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE) return;

    setAcknowledgeSubmitting(true);
    const acknowledged = await handleAcknowledge(
      acknowledgeTarget.project,
      acknowledgeTarget.department,
    );
    setAcknowledgeSubmitting(false);
    if (acknowledged) {
      setShowAcknowledgeModal(false);
      setAcknowledgeTarget(null);
      setAcknowledgeInput("");
    }
  };

  const openCompleteModal = (project, action) => {
    setCompleteTarget({ project, action });
    setCompleteInput("");
    setShowCompleteModal(true);
  };

  const closeCompleteModal = () => {
    setShowCompleteModal(false);
    setCompleteTarget(null);
    setCompleteInput("");
    setCompleteSubmitting(false);
  };

  const closeMockupModal = () => {
    setShowMockupModal(false);
    setMockupTarget(null);
    setMockupFiles([]);
    setMockupNote("");
    setMockupUploading(false);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget) return;
    if (completeInput.trim() !== COMPLETE_PHRASE) return;

    setCompleteSubmitting(true);
    const completed = await handleCompleteStatus(
      completeTarget.project,
      completeTarget.action,
    );
    setCompleteSubmitting(false);
    if (completed) {
      setShowCompleteModal(false);
      setCompleteTarget(null);
      setCompleteInput("");
    }
  };

  const handleUploadMockup = async (e) => {
    e.preventDefault();
    if (!mockupTarget) return;
    if (mockupFiles.length === 0) {
      setToast({ type: "error", message: "Please select a mockup file." });
      return;
    }

    setMockupUploading(true);
    const target = mockupTarget;
    try {
      const data = new FormData();
      mockupFiles.forEach((file) => data.append("mockup", file));
      if (mockupNote.trim()) data.append("note", mockupNote.trim());

      const res = await fetch(`/api/projects/${target.project._id}/mockup`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setToast({
          type: "success",
          message:
            mockupFiles.length > 1
              ? "Mockups uploaded. Please confirm completion."
              : "Mockup uploaded. Please confirm completion.",
        });
        closeMockupModal();
        fetchEngagedProjects();
        openCompleteModal(updatedProject || target.project, target.action);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: errorData.message || "Failed to upload mockup.",
        });
      }
    } catch (err) {
      console.error("Error uploading mockup:", err);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
    } finally {
      setMockupUploading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "TBD";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    return timeStr;
  };

  const formatUpdateDateTime = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getRevisionCount = (project) => {
    const rawCount = Number(project?.orderRevisionCount);
    if (Number.isFinite(rawCount) && rawCount > 0) return rawCount;
    return project?.orderRevisionMeta?.updatedAt ? 1 : 0;
  };

  const getProjectVersion = (project) => {
    const parsedVersion = Number(project?.versionNumber);
    return Number.isFinite(parsedVersion) && parsedVersion > 0
      ? parsedVersion
      : 1;
  };

  if (loading) {
    return (
      <div className="engaged-projects-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="engaged-projects-container">
      <header className="engaged-header">
        <h1>
          {activeTab === "active"
            ? `${primaryDeptLabel} Projects`
            : `${primaryDeptLabel} Project History`}
        </h1>
        <p className="engaged-subtitle">
          {activeTab === "active"
            ? "Projects where your department is actively engaged."
            : "Completed or finished projects for your engaged departments."}
        </p>
        <ContextualHelpLink
          label="Help with engagement"
          topic="engagement-issue"
          category="Engagement"
          question="How should I handle my department engagement?"
        />
      </header>

      <div className="engaged-tabs">
        <button
          className={`engaged-tab ${activeTab === "active" ? "active" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          Active
        </button>
        <button
          className={`engaged-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      {activeTab === "active" && (
        <div className="engaged-kpi-grid">
          <button
            type="button"
            className={`engaged-kpi-card warning ${kpiFilter === "pendingAcceptance" ? "active" : ""}`}
            onClick={() =>
              setKpiFilter((current) =>
                current === "pendingAcceptance" ? "all" : "pendingAcceptance",
              )
            }
            aria-pressed={kpiFilter === "pendingAcceptance"}
          >
            <div className="engaged-kpi-header">
              <span>Pending Acceptance</span>
              <strong>{pendingAcceptanceCount}</strong>
            </div>
            <p>
              Department engagements ready for your acknowledgement across{" "}
              {engagedContextLabel}.
            </p>
          </button>

          {canShowMockupUploadKpi && (
            <button
              type="button"
              className={`engaged-kpi-card info ${kpiFilter === "waitingMockup" ? "active" : ""}`}
              onClick={() =>
                setKpiFilter((current) =>
                  current === "waitingMockup" ? "all" : "waitingMockup",
                )
              }
              aria-pressed={kpiFilter === "waitingMockup"}
            >
              <div className="engaged-kpi-header">
                <span>Waiting for Mockup Upload</span>
                <strong>{waitingForMockupUploadCount}</strong>
              </div>
              <p>
                Graphics projects currently waiting for a first mockup upload or
                a revised upload.
              </p>
            </button>
          )}

          <button
            type="button"
            className={`engaged-kpi-card success ${kpiFilter === "completedActions" ? "active" : ""}`}
            onClick={() =>
              setKpiFilter((current) =>
                current === "completedActions" ? "all" : "completedActions",
              )
            }
            aria-pressed={kpiFilter === "completedActions"}
          >
            <div className="engaged-kpi-header">
              <span>Department Completion</span>
              <strong>{departmentCompletionPercent}%</strong>
            </div>
            <p>
              {departmentActionCompletedCount} of {departmentActionTotalCount}{" "}
              active department actions are already completed.
            </p>
          </button>
        </div>
      )}

      {/* Filter Controls */}
      {activeTab === "active" ? (
        <div className="filter-controls">
          {userEngagedDepts.length > 1 && (
            <div className="filter-group">
              <label>Department</label>
              <select
                className="filter-select"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="All">All Departments</option>
                {userEngagedDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-group">
            <label>Status</label>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group search-group">
            <label>Search</label>
            <input
              type="text"
              className="filter-input"
              placeholder="Project ID, Name, or Lead..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-results">
            Showing {filteredProjects.length} of {projects.length} projects
            {kpiFilter !== "all" && (
              <>
                {" "}
                • KPI Filter: {kpiFilterLabels[kpiFilter] || "Active"}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="filter-controls">
          {userEngagedDepts.length > 1 && (
            <div className="filter-group">
              <label>Department</label>
              <select
                className="filter-select"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="All">All Departments</option>
                {userEngagedDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-group">
            <label>Engaged Department</label>
            <select
              className="filter-select"
              value={historyDeptFilter}
              onChange={(e) => setHistoryDeptFilter(e.target.value)}
            >
              <option value="All">All Engaged</option>
              {Array.from(new Set(engagedSubDepts)).map((dept) => (
                <option key={dept} value={dept}>
                  {getDepartmentLabel(dept)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group search-group">
            <label>Project ID</label>
            <input
              type="text"
              className="filter-input"
              placeholder="Filter by Project ID..."
              value={historyProjectIdQuery}
              onChange={(e) => setHistoryProjectIdQuery(e.target.value)}
            />
          </div>

          <div className="filter-results">
            Showing {filteredHistoryProjects.length} of{" "}
            {historyProjects.length} projects
          </div>
        </div>
      )}

      {activeTab === "active" ? (
        <>
          <div className="engaged-table-wrapper">
            {filteredProjects.length === 0 ? (
              <div className="empty-state">
                <p>No projects match your filters.</p>
              </div>
            ) : (
              <table className="engaged-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Project ID</th>
                    <th>Project Name</th>
                    <th>Lead</th>
                    <th>Client</th>
                    <th>Delivery Date & Time</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProjects.map((project) => {
                    const lead = getLeadDisplay(project, "Unassigned");
                    const client = project.details?.client || "N/A";
                    const deliveryDate = formatDate(project.details?.deliveryDate);
                    const deliveryTime = formatTime(project.details?.deliveryTime);
                    const projectName = renderProjectName(
                      project.details,
                      null,
                      "Untitled",
                    );
                    const displayStatus =
                      project.projectType === "Quote"
                        ? getQuoteStatusDisplay(
                            project.status,
                            getQuoteRequirementMode(
                              project?.quoteDetails?.checklist || {},
                            ),
                          )
                        : project.status;
                    const revisionCount = getRevisionCount(project);
                    const emergency = isEmergency(project);
                    const approaching = isApproachingDelivery(project);
                    const projectVersion = getProjectVersion(project);
                    const showVersionTag = projectVersion > 1;
                    const acknowledgementRows =
                      getProjectAcknowledgementRows(project);

                    return (
                      <tr
                        key={project._id}
                        className={`${emergency ? "emergency-row" : ""} ${approaching ? "approaching-row" : ""} clickable-row`}
                        onClick={() =>
                          navigate(`/engaged-projects/actions/${project._id}`)
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/engaged-projects/actions/${project._id}`);
                          }
                        }}
                      >
                        <td className="indicator-cell">
                          {emergency && (
                            <span
                              className="indicator emergency"
                              title="Emergency"
                            >
                              🔥
                            </span>
                          )}
                          {approaching && !emergency && (
                            <span
                              className="indicator approaching"
                              title="Approaching Delivery"
                            >
                              ⏰
                            </span>
                          )}
                        </td>
                        <td
                          className="project-id-cell"
                        >
                          <div className="project-id-stack">
                            <div className="project-id-with-version">
                              <span>
                                {project.orderId || project._id.slice(-6).toUpperCase()}
                              </span>
                              {showVersionTag && (
                                <span className="project-version-chip">
                                  v{projectVersion}
                                </span>
                              )}
                            </div>
                            {acknowledgementRows.length > 0 && (
                              <div className="engagement-ack-list">
                                {acknowledgementRows.map((ackRow) => (
                                  <span
                                    key={`${project._id}-${ackRow.dept}`}
                                    className="engagement-ack-chip"
                                    title={`${ackRow.label} acknowledged by ${ackRow.names.join(", ")}`}
                                  >
                                    {ackRow.label}: {ackRow.names.join(", ")}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="project-name-cell">
                          <div className="project-name-stack">
                            <div className="project-name-text">{projectName}</div>
                            {revisionCount > 0 && (
                              <div className="revision-badge">
                                Revision v{revisionCount}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>{lead}</td>
                        <td>{client}</td>
                        <td className={approaching ? "delivery-approaching" : ""}>
                          {deliveryDate}
                          {deliveryTime && ` (${deliveryTime})`}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${String(displayStatus || "")
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {displayStatus}
                          </span>
                        </td>
                        <td>
                          <button
                            className="update-btn view-actions-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/engaged-projects/actions/${project._id}`);
                            }}
                          >
                            View Actions
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                ← Previous
              </button>
              <div className="pagination-info">
                Page {currentPage} of {totalPages}
              </div>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="engaged-table-wrapper">
            {filteredHistoryProjects.length === 0 ? (
              <div className="empty-state">
                <p>No history projects match your filters.</p>
              </div>
            ) : (
              <table className="engaged-table">
                <thead>
                  <tr>
                    <th>Project ID</th>
                    <th>Lead</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistoryProjects.map((project) => {
                    const lead = getLeadDisplay(project, "Unassigned");
                    const client = project.details?.client || "N/A";
                    const projectId =
                      project.orderId || project._id.slice(-6).toUpperCase();
                    const projectName = renderProjectName(
                      project.details,
                      null,
                      "Untitled",
                    );
                    const displayStatus =
                      project.projectType === "Quote"
                        ? getQuoteStatusDisplay(
                            project.status,
                            getQuoteRequirementMode(
                              project?.quoteDetails?.checklist || {},
                            ),
                          )
                        : project.status;
                    const revisionCount = getRevisionCount(project);
                    const engagedDeptsForUser = normalizeDepartmentList(
                      project.departments,
                    )
                      .filter((dept) => engagedSubDepts.includes(dept))
                      .map((dept) => getDepartmentLabel(dept));
                    const engagedDeptLabel =
                      engagedDeptsForUser.length > 0
                        ? engagedDeptsForUser.join(", ")
                        : "N/A";
                    const projectVersion = getProjectVersion(project);
                    const showVersionTag = projectVersion > 1;

                    return (
                      <tr key={project._id}>
                        <td
                          className="project-id-cell"
                          onClick={() =>
                            navigateToProject(project, {
                              fallbackPath: "/engaged-projects",
                              title: "Choose Authorized Page",
                              message:
                                "Project Details is only available to the assigned lead for this project. Choose an authorized page instead.",
                            })
                          }
                        >
                          <div className="project-id-stack">
                            <div className="project-id-with-version">
                              <span>{projectId}</span>
                              {showVersionTag && (
                                <span className="project-version-chip">
                                  v{projectVersion}
                                </span>
                              )}
                            </div>
                            <div className="project-name-text">{projectName}</div>
                            {revisionCount > 0 && (
                              <div className="revision-badge">
                                Revision v{revisionCount}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>{lead}</td>
                        <td>{client}</td>
                        <td>
                          <span
                            className={`status-badge ${String(displayStatus || "")
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {displayStatus}
                          </span>
                        </td>
                        <td>{engagedDeptLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {historyTotalPages > 1 && (
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage === 1}
              >
                ← Previous
              </button>
              <div className="pagination-info">
                Page {historyPage} of {historyTotalPages}
              </div>
              <button
                className="pagination-btn"
                onClick={() =>
                  setHistoryPage((p) => Math.min(historyTotalPages, p + 1))
                }
                disabled={historyPage === historyTotalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
      {projectRouteChoiceDialog}
      {/* Update Modal */}
      {showUpdateModal && selectedProject && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              Post Update for {selectedProject.orderId || "Project"}
            </h3>

            {/* Engaged Departments */}
            <div className="engaged-depts-section">
              <label>Engaged Departments</label>
              <div className="dept-chips">
                {normalizeDepartmentList(selectedProject.departments)
                  .filter((dept) => engagedSubDepts.includes(dept))
                  .map((dept) => (
                    <span
                      key={dept}
                      className={`dept-chip ${updateForm.department === dept ? "selected" : ""}`}
                      onClick={() => {
                        let category = "Production";
                        if (GRAPHICS_SUB_DEPARTMENTS.includes(dept))
                          category = "Graphics";
                        else if (STORES_SUB_DEPARTMENTS.includes(dept))
                          category = "Stores";
                        else if (PHOTOGRAPHY_SUB_DEPARTMENTS.includes(dept))
                          category = "Photography";

                        setUpdateForm({
                          ...updateForm,
                          department: normalizeDepartmentId(dept),
                          category,
                        });
                      }}
                    >
                      {getDepartmentLabel(dept)}
                    </span>
                  ))}
              </div>
            </div>

            <div className="latest-update-snapshot">
              <p className="latest-update-snapshot-label">Latest Shared Update</p>
              {String(selectedProject?.endOfDayUpdate || "").trim() ? (
                <>
                  <p className="latest-update-snapshot-content">
                    {normalizeProjectUpdateText(selectedProject.endOfDayUpdate)}
                  </p>
                  <p className="latest-update-snapshot-meta">
                    Last updated:{" "}
                    {formatUpdateDateTime(selectedProject.endOfDayUpdateDate)}
                  </p>
                </>
              ) : (
                <p className="latest-update-snapshot-empty">
                  No updates yet. Share what changed so others avoid duplicate
                  updates.
                </p>
              )}
            </div>

            <form onSubmit={handleSubmitUpdate}>
              <div className="form-group">
                <label>Update Content</label>
                <textarea
                  className="input-field"
                  rows="4"
                  value={updateForm.content}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, content: e.target.value })
                  }
                  placeholder="What's the latest update from your department?"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setSelectedProject(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? "Posting..." : "Post Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="ui-toast-container">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}

      {/* Mockup Upload Modal */}
      {showMockupModal && mockupTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Upload Approved Mockup</h3>
            <p className="acknowledge-confirm-text">
              Upload the approved mockup for project{" "}
              <strong>
                {mockupTarget.project.orderId ||
                  mockupTarget.project._id.slice(-6).toUpperCase()}
              </strong>
              .
            </p>
            <form onSubmit={handleUploadMockup}>
              <div className="form-group">
                <label>Approved Mockup File(s)</label>
                <input
                  type="file"
                  className="input-field"
                  multiple
                  onChange={(e) =>
                    setMockupFiles(Array.from(e.target.files || []))
                  }
                  required
                />
                <div
                  className="file-hint"
                  style={{ marginTop: "0.5rem" }}
                >
                  Any file type allowed (e.g., .cdr, .pdf, .png). Select multiple
                  files to upload several mockups at once.
                </div>
                {mockupFiles.length > 0 && (
                  <div className="file-hint" style={{ marginTop: "0.25rem" }}>
                    Selected: {mockupFiles.map((file) => file.name).join(", ")}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={mockupNote}
                  onChange={(e) => setMockupNote(e.target.value)}
                  placeholder="Add a short note for production..."
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeMockupModal}
                  disabled={mockupUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={mockupUploading || mockupFiles.length === 0}
                >
                  {mockupUploading ? "Uploading..." : "Upload & Continue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Engagement Confirmation Modal */}
      {showCompleteModal && completeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Completion</h3>
            <p className="acknowledge-confirm-text">
              You are about to mark{" "}
              <strong>{completeTarget.action.label}</strong> for project{" "}
              <strong>
                {completeTarget.project.orderId ||
                  completeTarget.project._id.slice(-6).toUpperCase()}
              </strong>
              .
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{COMPLETE_PHRASE}</div>
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={completeInput}
                onChange={(e) => setCompleteInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCompleteModal}
                disabled={completeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmComplete}
                disabled={
                  completeSubmitting ||
                  completeInput.trim() !== COMPLETE_PHRASE
                }
              >
                {completeSubmitting ? "Confirming..." : "Confirm Completion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledge Confirmation Modal */}
      {showAcknowledgeModal && acknowledgeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Acceptance</h3>
            <p className="acknowledge-confirm-text">
              You are about to acknowledge engagement for{" "}
              <strong>{getDepartmentLabel(acknowledgeTarget.department)}</strong>{" "}
              on project{" "}
              <strong>
                {acknowledgeTarget.project.orderId ||
                  acknowledgeTarget.project._id.slice(-6).toUpperCase()}
              </strong>
              .
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{ACKNOWLEDGE_PHRASE}</div>
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={acknowledgeInput}
                onChange={(e) => setAcknowledgeInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeAcknowledgeModal}
                disabled={acknowledgeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmAcknowledge}
                disabled={
                  acknowledgeSubmitting ||
                  acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE
                }
              >
                {acknowledgeSubmitting ? "Confirming..." : "Confirm Acceptance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngagedProjects;


