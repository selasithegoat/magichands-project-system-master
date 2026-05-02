import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import { format, differenceInHours } from "date-fns";
import Spinner from "../../components/ui/Spinner";
import { DownloadIcon } from "../../components/icons/DownloadIcon"; // Assuming exists or I will create an inline SVG
import FilterIcon from "../../components/icons/FilterIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import { PrinterIcon } from "../../components/icons/DeptIcons1";
import "./EndOfDayUpdate.css";
import usePersistedState from "../../hooks/usePersistedState";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";
import { normalizeProjectUpdateText } from "../../utils/projectUpdateText";
import { buildProjectNameRuns, renderProjectName } from "../../utils/projectName";
import EndOfDayRouteTabs from "./EndOfDayRouteTabs";

const ALL_FILTER_VALUE = "All";

const UPDATE_FILTER_OPTIONS = [
  { value: ALL_FILTER_VALUE, label: "All Updates" },
  { value: "with", label: "With Updates" },
  { value: "without", label: "No Updates" },
];
const UPDATE_FILTER_VALUES = UPDATE_FILTER_OPTIONS.map((option) => option.value);

const sanitizeTextFilter = (value, fallback) =>
  typeof value === "string" ? value : fallback;

const sanitizeDateFilter = (value, fallback) =>
  typeof value === "string" && (!value || /^\d{4}-\d{2}-\d{2}$/.test(value))
    ? value
    : fallback;

const sanitizeUpdateFilter = (value) =>
  UPDATE_FILTER_VALUES.includes(value) ? value : ALL_FILTER_VALUE;

const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";

const toText = (value) => String(value || "").trim();

const createSortedUniqueOptions = (values = []) =>
  Array.from(new Set(values.map(toText).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" }),
  );

const getProjectTypeFilterValue = (project) =>
  toText(project?.projectType) || "Standard";

const getDeliveryDateFilterValue = (project) => {
  const rawDate = project?.details?.deliveryDate;
  if (!rawDate) return "";

  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) return "";

  return format(parsedDate, "yyyy-MM-dd");
};

const getProjectNameText = (project) =>
  buildProjectNameRuns(project?.details, null, "Untitled")
    .map((run) => run.text || "")
    .join("")
    .trim() || "Untitled";

const escapeHtml = (value) =>
  toText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getUpdateSourceName = (project) => {
  const source = project?.endOfDayUpdateBy;
  if (!source || typeof source === "string") return "";

  return `${source.firstName || ""} ${source.lastName || ""}`.trim();
};

const stripDepartmentNudge = (content) =>
  String(content || "").replace(/^\[[^\]]+\]\s*/, "").trim();

const getDisplayUpdateContent = (content) =>
  stripDepartmentNudge(normalizeProjectUpdateText(content));

const DOCX_COLUMN_WEIGHT_MAP = {
  dept: 18,
  lead: 14,
  deliveryDate: 18,
  itemInformation: 28,
  statusUpdate: 22,
};

const getDepartmentColumnWidth = (column, columns = []) => {
  const totalWeight = columns.reduce(
    (sum, currentColumn) =>
      sum + (DOCX_COLUMN_WEIGHT_MAP[currentColumn.id] || 18),
    0,
  );
  const columnWeight = DOCX_COLUMN_WEIGHT_MAP[column.id] || 18;
  return Math.max(8, Math.round((columnWeight / Math.max(totalWeight, 1)) * 100));
};

const getDepartmentCellValue = (row, column) => {
  if (column.id === "dept") return toText(row?.dept);
  if (column.id === "lead") return toText(row?.leadName);
  return toText(row?.values?.[column.id]);
};

const normalizeDocxCellText = (value) =>
  toText(value)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");

const formatDepartmentDocxValue = (column, value) => {
  const normalizedValue = toText(value);
  if (!normalizedValue) return "";
  if (column.kind !== "date") {
    return normalizeDocxCellText(normalizedValue);
  }

  const parsedDate = new Date(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedValue;
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getLatestProjectFeedbackTimestamp = (feedbackEntries = []) =>
  feedbackEntries.reduce((latest, feedback) => {
    const rawDate = feedback?.createdAt || feedback?.date;
    if (!rawDate) return latest;
    const parsedMs = new Date(rawDate).getTime();
    if (Number.isNaN(parsedMs)) return latest;
    return Math.max(latest, parsedMs);
  }, 0);

const shouldShowProjectInEndOfDayByDefault = (project, nowMs = Date.now()) => {
  if (project?.status === "Completed") return false;
  if (project?.status !== "Finished") return true;

  const feedbackEntries = Array.isArray(project?.feedbacks)
    ? project.feedbacks
    : [];
  if (feedbackEntries.length === 0) return true;

  const latestFeedbackMs = getLatestProjectFeedbackTimestamp(feedbackEntries);
  if (!latestFeedbackMs) return true;

  const elapsedHours = (nowMs - latestFeedbackMs) / (1000 * 60 * 60);
  return elapsedHours < 24;
};

const shouldShowProjectInEndOfDay = (project, nowMs = Date.now()) => {
  if (project?.cancellation?.isCancelled) return false;
  if (project?.includeInEndOfDayUpdates) return true;
  if (project?.excludeFromEndOfDayUpdates) return false;
  return shouldShowProjectInEndOfDayByDefault(project, nowMs);
};

const sortProjectsByLeadName = (list) =>
  [...list].sort((a, b) => {
    const aLead = getLeadDisplay(a, "Unassigned").trim();
    const bLead = getLeadDisplay(b, "Unassigned").trim();
    const aIsUnassigned = aLead.toLowerCase() === "unassigned";
    const bIsUnassigned = bLead.toLowerCase() === "unassigned";

    if (aIsUnassigned && !bIsUnassigned) return 1;
    if (!aIsUnassigned && bIsUnassigned) return -1;

    const leadCompare = aLead.localeCompare(bLead, "en", {
      sensitivity: "base",
    });
    if (leadCompare !== 0) return leadCompare;

    const aProjectName = a?.details?.projectName || "";
    const bProjectName = b?.details?.projectName || "";
    return aProjectName.localeCompare(bProjectName, "en", {
      sensitivity: "base",
    });
  });

const fetchDepartmentUpdateBoardForExport = async () => {
  const response = await fetch("/api/projects/department-updates", {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Failed to load Department Updates.");
  }
  return payload;
};

const buildDepartmentUpdateDocxTable = (board, docx) => {
  const columns = Array.isArray(board?.columns) ? board.columns : [];
  const sections = Array.isArray(board?.sections) ? board.sections : [];

  if (columns.length === 0 || sections.length === 0) {
    return null;
  }

  const {
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
  } = docx;

  const createDataCell = (text, column) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: text || "",
              font: "Calibri",
              size: 22,
              color: "000000",
            }),
          ],
          alignment: AlignmentType.LEFT,
        }),
      ],
      width: {
        size: getDepartmentColumnWidth(column, columns),
        type: WidthType.PERCENTAGE,
      },
      margins: { top: 90, bottom: 90, left: 90, right: 90 },
      shading: { fill: "FFFFFF" },
    });

  const rows = [];

  sections.forEach((section, sectionIndex) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: toText(section?.title),
                    bold: true,
                    size: 24,
                    color: "000000",
                    font: "Calibri",
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
            columnSpan: Math.max(columns.length, 1),
            shading: { fill: "A3A3A3" },
            margins: { top: 90, bottom: 90, left: 90, right: 90 },
          }),
        ],
      }),
    );

    if (sectionIndex === 0) {
      rows.push(
        new TableRow({
          children: columns.map((column) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: toText(column?.label),
                      bold: true,
                      size: 22,
                      color: "000000",
                      font: "Calibri",
                    }),
                  ],
                  alignment: AlignmentType.LEFT,
                }),
              ],
              width: {
                size: getDepartmentColumnWidth(column, columns),
                type: WidthType.PERCENTAGE,
              },
              shading: { fill: "F4F4F4" },
              margins: { top: 90, bottom: 90, left: 90, right: 90 },
            }),
          ),
        }),
      );
    }

    (Array.isArray(section?.rows) ? section.rows : []).forEach((row) => {
      rows.push(
        new TableRow({
          children: columns.map((column) =>
            createDataCell(
              formatDepartmentDocxValue(column, getDepartmentCellValue(row, column)),
              column,
            ),
          ),
        }),
      );
    });
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        size: 1,
        color: "000000",
      },
      insideVertical: {
        style: BorderStyle.SINGLE,
        size: 1,
        color: "000000",
      },
    },
  });
};

const EndOfDayUpdate = ({ user }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Hook

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);
  const [searchQuery, setSearchQuery] = usePersistedState(
    "client-eod-updates-search",
    "",
    { sanitize: sanitizeTextFilter },
  );
  const [leadFilter, setLeadFilter] = usePersistedState(
    "client-eod-updates-lead-filter",
    ALL_FILTER_VALUE,
    { sanitize: sanitizeTextFilter },
  );
  const [statusFilter, setStatusFilter] = usePersistedState(
    "client-eod-updates-status-filter",
    ALL_FILTER_VALUE,
    { sanitize: sanitizeTextFilter },
  );
  const [projectTypeFilter, setProjectTypeFilter] = usePersistedState(
    "client-eod-updates-type-filter",
    ALL_FILTER_VALUE,
    { sanitize: sanitizeTextFilter },
  );
  const [updateFilter, setUpdateFilter] = usePersistedState(
    "client-eod-updates-update-filter",
    ALL_FILTER_VALUE,
    { sanitize: sanitizeUpdateFilter },
  );
  const [deliveryFrom, setDeliveryFrom] = usePersistedState(
    "client-eod-updates-delivery-from",
    "",
    { sanitize: sanitizeDateFilter },
  );
  const [deliveryTo, setDeliveryTo] = usePersistedState(
    "client-eod-updates-delivery-to",
    "",
    { sanitize: sanitizeDateFilter },
  );

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects?mode=report");
      if (res.ok) {
        const data = await res.json();
        const nowMs = Date.now();
        const activeProjects = data.filter((project) =>
          shouldShowProjectInEndOfDay(project, nowMs),
        );
        setProjects(sortProjectsByLeadName(activeProjects));
        setCurrentPage(1); // Reset to page 1 on new fetch
      }
    } catch (err) {
      console.error("Failed to fetch projects", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Redirect if user is loaded but not Front Desk
    if (user && !user.department?.includes("Front Desk")) {
      navigate("/client", { replace: true });
      return;
    }

    fetchProjects();
  }, [fetchProjects, user, navigate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    leadFilter,
    statusFilter,
    projectTypeFilter,
    updateFilter,
    deliveryFrom,
    deliveryTo,
  ]);

  const isFrontDesk = user?.department?.includes("Front Desk");
  useRealtimeRefresh(() => fetchProjects(), {
    enabled: Boolean(isFrontDesk),
    paths: ["/api/projects", "/api/updates"],
    excludePaths: ["/api/projects/activities", "/api/projects/ai"],
    shouldRefresh: (detail) => {
      if (detail.path.startsWith("/api/updates")) {
        return projects.some((project) => project?._id === detail.projectId);
      }

      return true;
    },
  });

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return "";
    return timeString;
  };

  const getProjectVersion = (project) => {
    const parsedVersion = Number(project?.versionNumber);
    return Number.isFinite(parsedVersion) && parsedVersion > 0
      ? parsedVersion
      : 1;
  };

  const leadOptions = useMemo(
    () =>
      createSortedUniqueOptions(
        projects.map((project) => getLeadDisplay(project, "Unassigned")),
      ),
    [projects],
  );

  const statusOptions = useMemo(
    () => createSortedUniqueOptions(projects.map((project) => project.status)),
    [projects],
  );

  const projectTypeOptions = useMemo(
    () =>
      createSortedUniqueOptions(
        projects.map((project) => getProjectTypeFilterValue(project)),
      ),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const searchTerms = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return projects.filter((project) => {
      const leadName = getLeadDisplay(project, "Unassigned");
      const projectType = getProjectTypeFilterValue(project);
      const updateContent = toText(project.endOfDayUpdate);
      const deliveryDate = getDeliveryDateFilterValue(project);

      if (leadFilter !== ALL_FILTER_VALUE && leadName !== leadFilter) {
        return false;
      }

      if (statusFilter !== ALL_FILTER_VALUE && project.status !== statusFilter) {
        return false;
      }

      if (
        projectTypeFilter !== ALL_FILTER_VALUE &&
        projectType !== projectTypeFilter
      ) {
        return false;
      }

      if (updateFilter === "with" && !updateContent) {
        return false;
      }

      if (updateFilter === "without" && updateContent) {
        return false;
      }

      if (deliveryFrom || deliveryTo) {
        if (!deliveryDate) return false;
        if (deliveryFrom && deliveryDate < deliveryFrom) return false;
        if (deliveryTo && deliveryDate > deliveryTo) return false;
      }

      if (searchTerms.length > 0) {
        const searchableText = [
          project.orderId,
          project.details?.projectName,
          project.details?.projectIndicator,
          project.details?.client,
          project.details?.companyName,
          project.details?.contactPerson,
          leadName,
          project.status,
          projectType,
          project.priority,
          getDisplayUpdateContent(project.endOfDayUpdate),
          getUpdateSourceName(project),
        ]
          .map(toText)
          .join(" ")
          .toLowerCase();

        if (!searchTerms.every((term) => searchableText.includes(term))) {
          return false;
        }
      }

      return true;
    });
  }, [
    projects,
    searchQuery,
    leadFilter,
    statusFilter,
    projectTypeFilter,
    updateFilter,
    deliveryFrom,
    deliveryTo,
  ]);

  const activeFilterLabels = useMemo(() => {
    const labels = [];
    const trimmedSearch = searchQuery.trim();

    if (trimmedSearch) labels.push(`Search: ${trimmedSearch}`);
    if (leadFilter !== ALL_FILTER_VALUE) labels.push(`Lead: ${leadFilter}`);
    if (statusFilter !== ALL_FILTER_VALUE) labels.push(`Status: ${statusFilter}`);
    if (projectTypeFilter !== ALL_FILTER_VALUE) {
      labels.push(`Type: ${projectTypeFilter}`);
    }
    if (updateFilter !== ALL_FILTER_VALUE) {
      const updateLabel =
        UPDATE_FILTER_OPTIONS.find((option) => option.value === updateFilter)
          ?.label || updateFilter;
      labels.push(updateLabel);
    }
    if (deliveryFrom) labels.push(`Delivery from ${deliveryFrom}`);
    if (deliveryTo) labels.push(`Delivery to ${deliveryTo}`);

    return labels;
  }, [
    searchQuery,
    leadFilter,
    statusFilter,
    projectTypeFilter,
    updateFilter,
    deliveryFrom,
    deliveryTo,
  ]);

  const hasActiveFilters = activeFilterLabels.length > 0;
  const filterSummaryText = hasActiveFilters
    ? activeFilterLabels.join(" | ")
    : "All active projects";

  const clearFilters = () => {
    setSearchQuery("");
    setLeadFilter(ALL_FILTER_VALUE);
    setStatusFilter(ALL_FILTER_VALUE);
    setProjectTypeFilter(ALL_FILTER_VALUE);
    setUpdateFilter(ALL_FILTER_VALUE);
    setDeliveryFrom("");
    setDeliveryTo("");
  };

  const handleDownload = async () => {
    if (!filteredProjects.length) return;

    try {
      const departmentBoardPromise = fetchDepartmentUpdateBoardForExport();
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
        BorderStyle,
        PageOrientation,
        AlignmentType,
        Footer,
        Header,
      } = await import("docx");
      const { saveAs } = await import("file-saver");
      const departmentBoard = await departmentBoardPromise;
      const userName = user
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
        : "User";
      // Refinement: Month in words (MMMM)
      const dateStr = format(new Date(), "EEEE. dd MMMM yy");
      // Title text is now used in Header, not body

      const tableRows = [
        new TableRow({
          children: [
            "Lead Name",
            "Order Number",
            "Order Name",
            "Delivery Date & Time",
            "Status",
            "Latest Update",
          ].map(
            (text) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text,
                        bold: true,
                        size: 24,
                        color: "000000",
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: 16, type: WidthType.PERCENTAGE },
                shading: { fill: "ffffff" },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
              }),
          ),
        }),
      ];

      filteredProjects.forEach((project) => {
        const leadName = getLeadDisplay(project, "Unassigned");
        const projectVersion = getProjectVersion(project);
        const orderNumber = project.orderId || "N/A";
        const orderNumberWithVersion =
          projectVersion > 1 ? `${orderNumber} (v${projectVersion})` : orderNumber;

        const deliveryContent = `${formatDate(
          project.details?.deliveryDate,
        )} ${formatTime(project.details?.deliveryTime)}`;

        const updateContent = project.endOfDayUpdate
          ? getDisplayUpdateContent(project.endOfDayUpdate)
          : "No updates yet";

        // Urgency Check
        const isEmergency = isEmergencyProject(project);
        let isUrgent = false;
        if (project.details?.deliveryDate) {
          const deliveryDate = new Date(project.details.deliveryDate);
          const hoursDiff = differenceInHours(deliveryDate, new Date());
          if (hoursDiff <= 72) {
            isUrgent = true;
          }
        }

        const textColor = isUrgent || isEmergency ? "FF0000" : "000000";

        const getRowColor = (type) => {
          switch (type) {
            case "Emergency":
              return "FEF2F2";
            case "Corporate Job":
              return "F0FDF4";
            case "Quote":
              return "FFFBEB";
            default:
              return "EFF6FF";
          }
        };

        const rowColor = getRowColor(project.projectType);
        const buildCell = (runs) =>
          new TableCell({
            children: [
              new Paragraph({
                children: runs,
                alignment: AlignmentType.LEFT,
              }),
            ],
            width: { size: 16, type: WidthType.PERCENTAGE },
            shading: { fill: rowColor },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
          });

        const buildTextCell = (text) =>
          buildCell([
            new TextRun({
              text: text || "",
              color: textColor,
              font: "Calibri",
            }),
          ]);

        const projectNameRuns = buildProjectNameRuns(
          project.details,
          null,
          "Untitled",
        ).map(
          (run) =>
            new TextRun({
              text: run.text || "",
              bold: run.bold,
              color: textColor,
              font: "Calibri",
            }),
        );

        tableRows.push(
          new TableRow({
            children: [
              buildTextCell(leadName),
              buildTextCell(orderNumberWithVersion),
              buildCell(projectNameRuns),
              buildTextCell(deliveryContent),
              buildTextCell(project.status || "N/A"),
              buildTextCell(updateContent),
            ],
          }),
        );
      });

      // Custom Header Table (Invisible Borders)
      const headerTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: userName,
                        bold: true,
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.LEFT,
                  }),
                ],
                width: { size: 30, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "SCRUM UPDATE",
                        bold: true,
                        size: 28,
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: 40, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: dateStr,
                        bold: true,
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.RIGHT,
                  }),
                ],
                width: { size: 30, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
              }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideVertical: { style: BorderStyle.NONE },
        },
      });

      const departmentUpdatesTable = buildDepartmentUpdateDocxTable(
        departmentBoard,
        {
          Paragraph,
          TextRun,
          Table,
          TableRow,
          TableCell,
          WidthType,
          BorderStyle,
          AlignmentType,
        },
      );

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: "Calibri",
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                size: {
                  orientation: PageOrientation.LANDSCAPE,
                },
              },
            },
            headers: {
              default: new Header({
                children: [headerTable],
              }),
            },
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "OFFICIAL DOCUMENT OF MAGICHANDS CO. LTD.",
                        bold: true,
                        size: 20, // 10pt
                        color: "64748B",
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
            },
            children: [
              // No Title Paragraph here anymore
              new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                  right: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                  insideHorizontal: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                  insideVertical: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                },
              }),
              ...(departmentUpdatesTable
                ? [
                    new Paragraph({
                      children: [new TextRun({ text: "" })],
                    }),
                    departmentUpdatesTable,
                  ]
                : []),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `SCRUM UPDATE - ${userName} - ${dateStr}.docx`);
    } catch (error) {
      console.error("Error generating document:", error);
      alert("Failed to generate document.");
    }
  };

  const handlePrint = () => {
    if (!filteredProjects.length) return;

    const userName = user
      ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
      : "User";
    const dateStr = format(new Date(), "EEEE. dd MMMM yy");
    const generatedBy = userName || "User";

    const rowsHtml = filteredProjects
      .map((project) => {
        const leadName = getLeadDisplay(project, "Unassigned");
        const projectVersion = getProjectVersion(project);
        const orderNumber = project.orderId || "N/A";
        const orderNumberWithVersion =
          projectVersion > 1 ? `${orderNumber} (v${projectVersion})` : orderNumber;
        const deliveryContent = `${formatDate(
          project.details?.deliveryDate,
        )} ${formatTime(project.details?.deliveryTime)}`.trim();
        const updateContent = project.endOfDayUpdate
          ? getDisplayUpdateContent(project.endOfDayUpdate)
          : "No updates yet";
        const updateSourceName = getUpdateSourceName(project);
        const updateMeta = project.endOfDayUpdateDate
          ? `Last updated: ${formatDateTime(project.endOfDayUpdateDate)}`
          : "";
        const isUrgent =
          project.details?.deliveryDate &&
          differenceInHours(new Date(project.details.deliveryDate), new Date()) <=
            72;
        const isEmergency = isEmergencyProject(project);
        const projectTypeClass = getProjectTypeFilterValue(project)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");

        return `
          <tr class="row-${projectTypeClass}${isUrgent ? " urgent" : ""}${isEmergency ? " emergency" : ""}">
            <td>${escapeHtml(leadName)}</td>
            <td>${escapeHtml(orderNumberWithVersion)}</td>
            <td>${escapeHtml(getProjectNameText(project))}</td>
            <td>${escapeHtml(deliveryContent || "N/A")}</td>
            <td>${escapeHtml(project.status || "N/A")}</td>
            <td>
              <div>${escapeHtml(updateContent)}</div>
              ${
                updateSourceName
                  ? `<div class="update-meta">${escapeHtml(updateSourceName)}</div>`
                  : ""
              }
              ${
                updateMeta
                  ? `<div class="update-meta">${escapeHtml(updateMeta)}</div>`
                  : ""
              }
            </td>
          </tr>
        `;
      })
      .join("");

    const printHtml = `
      <!doctype html>
      <html>
        <head>
          <title>End of Day Update - ${escapeHtml(dateStr)}</title>
          <style>
            @page { size: landscape; margin: 0.42in; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #111827;
              font-family: Calibri, Arial, sans-serif;
              font-size: 11px;
              line-height: 1.35;
            }
            .report-header {
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              gap: 16px;
              align-items: end;
              margin-bottom: 14px;
              border-bottom: 2px solid #111827;
              padding-bottom: 8px;
            }
            .report-title {
              text-align: center;
              font-size: 18px;
              font-weight: 700;
              letter-spacing: 0.04em;
            }
            .report-date { text-align: right; font-weight: 700; }
            .report-user { font-weight: 700; }
            .report-summary {
              margin: 0 0 12px;
              color: #475569;
              font-size: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th,
            td {
              border: 1px solid #cbd5e1;
              padding: 6px 7px;
              vertical-align: top;
              overflow-wrap: anywhere;
            }
            th {
              background: #f1f5f9;
              text-transform: uppercase;
              font-size: 9px;
              letter-spacing: 0.04em;
              text-align: left;
            }
            th:nth-child(1), td:nth-child(1) { width: 13%; }
            th:nth-child(2), td:nth-child(2) { width: 12%; }
            th:nth-child(3), td:nth-child(3) { width: 20%; }
            th:nth-child(4), td:nth-child(4) { width: 17%; }
            th:nth-child(5), td:nth-child(5) { width: 12%; }
            th:nth-child(6), td:nth-child(6) { width: 26%; }
            .row-emergency { background: #fef2f2; }
            .row-corporate-job { background: #f0fdf4; }
            .row-quote { background: #fffbeb; }
            .row-standard { background: #eff6ff; }
            tr.urgent td,
            tr.emergency td {
              color: #dc2626;
            }
            .update-meta {
              margin-top: 3px;
              color: #64748b;
              font-size: 9px;
            }
            tr.urgent .update-meta,
            tr.emergency .update-meta {
              color: #dc2626;
            }
          </style>
        </head>
        <body>
          <header class="report-header">
            <div class="report-user">${escapeHtml(generatedBy)}</div>
            <div class="report-title">SCRUM UPDATE</div>
            <div class="report-date">${escapeHtml(dateStr)}</div>
          </header>
          <p class="report-summary">
            ${escapeHtml(filterSummaryText)} - ${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"}
          </p>
          <table>
            <thead>
              <tr>
                <th>Lead Name</th>
                <th>Order Number</th>
                <th>Order Name</th>
                <th>Delivery Date & Time</th>
                <th>Status</th>
                <th>Latest Update</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const printDocument = iframe.contentDocument || iframe.contentWindow?.document;
    if (!printDocument || !iframe.contentWindow) {
      iframe.remove();
      return;
    }

    let didPrint = false;
    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 0);
    };
    const finalizePrint = () => {
      if (didPrint) return;
      didPrint = true;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };

    iframe.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    iframe.onload = () => window.setTimeout(finalizePrint, 50);
    printDocument.open();
    printDocument.write(printHtml);
    printDocument.close();
    window.setTimeout(finalizePrint, 250);
    window.setTimeout(cleanup, 60000);
  };

  // Derived Pagination Data
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedProjects = filteredProjects.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);

  if (loading) {
    return (
      <div className="spinner-container">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="end-of-day-container">
      <div
        className="page-header eod-page-header"
      >
        <div>
          <h1>End of Day Update</h1>
          <p>Latest updates on all active projects</p>
        </div>
        <div className="eod-header-actions">
          <button
            type="button"
            className="eod-action-btn eod-print-btn"
            onClick={handlePrint}
            disabled={filteredProjects.length === 0}
          >
            <PrinterIcon />
            Print Report
          </button>
          <button
            type="button"
            className="download-btn"
            onClick={handleDownload}
            disabled={filteredProjects.length === 0}
          >
            <DownloadIcon width={18} height={18} />
            Download Report
          </button>
        </div>
      </div>

      <EndOfDayRouteTabs />

      <div className="eod-filter-panel" aria-label="End of Day filters">
        <div className="eod-filter-heading">
          <FilterIcon width="18" height="18" />
          <span>Filters</span>
        </div>

        <div className="eod-filter-grid">
          <label className="eod-filter-field eod-search-field">
            <span>Search</span>
            <div className="eod-search-control">
              <SearchIcon width="16" height="16" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Order, project, lead, update..."
              />
            </div>
          </label>

          <label className="eod-filter-field">
            <span>Lead</span>
            <select
              value={leadFilter}
              onChange={(event) => setLeadFilter(event.target.value)}
            >
              <option value={ALL_FILTER_VALUE}>All Leads</option>
              {leadOptions.map((leadName) => (
                <option key={leadName} value={leadName}>
                  {leadName}
                </option>
              ))}
            </select>
          </label>

          <label className="eod-filter-field">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value={ALL_FILTER_VALUE}>All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="eod-filter-field">
            <span>Type</span>
            <select
              value={projectTypeFilter}
              onChange={(event) => setProjectTypeFilter(event.target.value)}
            >
              <option value={ALL_FILTER_VALUE}>All Types</option>
              {projectTypeOptions.map((projectType) => (
                <option key={projectType} value={projectType}>
                  {projectType}
                </option>
              ))}
            </select>
          </label>

          <label className="eod-filter-field">
            <span>Updates</span>
            <select
              value={updateFilter}
              onChange={(event) => setUpdateFilter(event.target.value)}
            >
              {UPDATE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="eod-filter-field">
            <span>Delivery From</span>
            <input
              type="date"
              value={deliveryFrom}
              max={deliveryTo}
              onChange={(event) => setDeliveryFrom(event.target.value)}
            />
          </label>

          <label className="eod-filter-field">
            <span>Delivery To</span>
            <input
              type="date"
              value={deliveryTo}
              min={deliveryFrom}
              onChange={(event) => setDeliveryTo(event.target.value)}
            />
          </label>
        </div>

        <div className="eod-filter-footer">
          <span>
            Showing {filteredProjects.length} of {projects.length} project
            {projects.length === 1 ? "" : "s"}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              className="eod-clear-filters-btn"
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        <table className="update-table">
          <thead>
            <tr>
              <th>Lead Name</th>
              <th>Order Number</th>
              <th>Order Name</th>
              <th>Delivery Date & Time</th>
              <th>Status</th>
              <th>Latest Update</th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.length > 0 ? (
              paginatedProjects.map((project) => {
                const getRowClass = (type) => {
                  switch (type) {
                    case "Emergency":
                      return "row-emergency";
                    case "Corporate Job":
                      return "row-corporate";
                    case "Quote":
                      return "row-quote";
                    default:
                      return "row-standard";
                  }
                };
                const isUrgent =
                  project.details?.deliveryDate &&
                  differenceInHours(
                    new Date(project.details.deliveryDate),
                    new Date(),
                  ) <= 72;
                const isEmergency = isEmergencyProject(project);
                const projectVersion = getProjectVersion(project);
                const updateSourceName = getUpdateSourceName(project);

                return (
                  <tr
                    key={project._id}
                    className={`${getRowClass(project.projectType)} ${isUrgent ? "is-urgent" : ""} ${isEmergency ? "is-emergency" : ""}`}
                  >
                    <td>
                      {getLeadDisplay(project, "Unassigned")}
                    </td>
                    <td>
                      <div className="order-number-cell">
                        <span>{project.orderId || "N/A"}</span>
                        {projectVersion > 1 && (
                          <span className="order-version-sub">
                            Version v{projectVersion}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {renderProjectName(project.details, null, "Untitled")}
                    </td>
                    <td>
                      <div className="delivery-cell">
                        <span>{formatDate(project.details?.deliveryDate)}</span>
                        <span className="time-sub">
                          {formatTime(project.details?.deliveryTime)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="status-cell">
                        <span
                          className={`status-badge ${project.status
                            ?.toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {project.status}
                        </span>
                        {isEmergency && (
                          <span className="emergency-marker">Emergency</span>
                        )}
                      </div>
                    </td>
                    <td className="update-cell">
                      {project.endOfDayUpdate ? (
                        <div className="update-content">
                          <p>{getDisplayUpdateContent(project.endOfDayUpdate)}</p>
                          {updateSourceName && (
                            <span className="update-source">{updateSourceName}</span>
                          )}
                          <span
                            className="update-date"
                            style={{
                              fontSize: "0.75rem",
                              color: "#64748b",
                              display: "block",
                              marginTop: "4px",
                            }}
                          >
                            Last updated:{" "}
                            {formatDateTime(project.endOfDayUpdateDate)}
                          </span>
                        </div>
                      ) : (
                        <span className="no-update">No updates yet</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="empty-state">
                  {projects.length > 0
                    ? "No projects match the selected filters."
                    : "No active projects found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="eod-pagination">
            <span className="eod-pagination-summary">
              Showing {indexOfFirstItem + 1}-{indexOfFirstItem + paginatedProjects.length} of{" "}
              {filteredProjects.length} projects
            </span>
            <div className="eod-pagination-controls">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="eod-pagination-btn"
              >
                Previous
              </button>
              <span className="eod-page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="eod-pagination-btn"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EndOfDayUpdate;

