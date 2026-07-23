const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require("docx");
const DepartmentUpdateBoard = require("../models/DepartmentUpdateBoard");
const Project = require("../models/Project");
require("../models/User");
const {
  normalizeProjectUpdateContent,
} = require("../utils/projectUpdateText");

const DEPARTMENT_BOARD_KEY = "frontdesk-department-updates";
const DEFAULT_TIME_ZONE = "Africa/Accra";
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const DOCX_COLUMN_WEIGHT_MAP = {
  dept: 18,
  lead: 14,
  deliveryDate: 18,
  itemInformation: 28,
  statusUpdate: 22,
};

const toText = (value) => String(value || "").trim();

const getName = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const normalized = toText(value);
    return /^[a-f0-9]{24}$/i.test(normalized) ? "" : normalized;
  }

  const fullName = `${toText(value.firstName)} ${toText(value.lastName)}`.trim();
  return (
    fullName ||
    toText(value.name) ||
    toText(value.fullName) ||
    toText(value.label)
  );
};

const getFirstName = (value) => {
  const name = getName(value);
  return name ? name.split(/\s+/)[0] : "";
};

const getEntityId = (value) => {
  if (!value || typeof value !== "object") return "";
  return toText(value._id || value.id || value.value);
};

const getLeadDisplay = (project, fallback = "Unassigned") => {
  const leadSource = project?.projectLeadId || project?.details?.lead;
  const assistantSource =
    project?.assistantLeadId || project?.details?.assistantLead;
  const leadId = getEntityId(leadSource);
  const assistantId = getEntityId(assistantSource);
  const leadFull = getName(leadSource);
  const assistantFull = getName(assistantSource);
  const samePerson =
    (leadId && assistantId && leadId === assistantId) ||
    (!leadId &&
      !assistantId &&
      leadFull &&
      assistantFull &&
      leadFull.toLowerCase() === assistantFull.toLowerCase());

  const leadFirst = getFirstName(leadSource);
  const assistantFirst = samePerson ? "" : getFirstName(assistantSource);

  if (leadFirst && assistantFirst) return `${leadFirst} / ${assistantFirst}`;
  return leadFull || (samePerson ? "" : assistantFull) || leadFirst || assistantFirst || fallback;
};

const getLatestFeedbackTimestamp = (feedbackEntries = []) =>
  feedbackEntries.reduce((latest, feedback) => {
    const rawDate = feedback?.createdAt || feedback?.date;
    const parsedMs = rawDate ? new Date(rawDate).getTime() : Number.NaN;
    return Number.isFinite(parsedMs) ? Math.max(latest, parsedMs) : latest;
  }, 0);

const shouldIncludeProject = (project, nowMs = Date.now()) => {
  if (!project || project?.cancellation?.isCancelled) return false;
  if (project?.includeInEndOfDayUpdates) return true;
  if (project?.excludeFromEndOfDayUpdates) return false;
  if (project?.status === "Completed") return false;
  if (project?.status !== "Finished") return true;

  const feedbackEntries = Array.isArray(project.feedbacks)
    ? project.feedbacks
    : [];
  if (feedbackEntries.length === 0) return true;

  const latestFeedbackMs = getLatestFeedbackTimestamp(feedbackEntries);
  if (!latestFeedbackMs) return true;
  return (nowMs - latestFeedbackMs) / (1000 * 60 * 60) < 24;
};

const sortProjectsByLead = (projects = []) =>
  [...projects].sort((left, right) => {
    const leftLead = getLeadDisplay(left);
    const rightLead = getLeadDisplay(right);
    const leftUnassigned = leftLead.toLowerCase() === "unassigned";
    const rightUnassigned = rightLead.toLowerCase() === "unassigned";

    if (leftUnassigned !== rightUnassigned) return leftUnassigned ? 1 : -1;

    const leadCompare = leftLead.localeCompare(rightLead, "en", {
      sensitivity: "base",
    });
    if (leadCompare !== 0) return leadCompare;

    return toText(left?.details?.projectName).localeCompare(
      toText(right?.details?.projectName),
      "en",
      { sensitivity: "base" },
    );
  });

const loadEndOfDayReportData = async ({ now = new Date() } = {}) => {
  const nowMs = now.getTime();
  const [allProjects, departmentBoard] = await Promise.all([
    Project.find({
      "cancellation.isCancelled": { $ne: true },
    })
      .select(
        [
          "orderId",
          "versionNumber",
          "details.projectName",
          "details.projectNameRaw",
          "details.projectIndicator",
          "details.deliveryDate",
          "details.deliveryTime",
          "details.lead",
          "details.assistantLead",
          "projectType",
          "priority",
          "status",
          "projectLeadId",
          "assistantLeadId",
          "endOfDayUpdate",
          "feedbacks.createdAt",
          "cancellation.isCancelled",
          "includeInEndOfDayUpdates",
          "excludeFromEndOfDayUpdates",
        ].join(" "),
      )
      .populate("projectLeadId", "firstName lastName")
      .populate("assistantLeadId", "firstName lastName")
      .lean(),
    DepartmentUpdateBoard.findOne({ boardKey: DEPARTMENT_BOARD_KEY }).lean(),
  ]);

  const projects = sortProjectsByLead(
    allProjects.filter((project) => shouldIncludeProject(project, nowMs)),
  );

  return {
    projects,
    departmentBoard,
    projectCount: projects.length,
  };
};

const getZonedDateParts = (date, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
};

const formatReportDate = (date, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = getZonedDateParts(date, timeZone);
  return `${parts.weekday}. ${parts.day} ${parts.month} ${parts.year}`;
};

const formatFileDate = (date, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const formatDeliveryDate = (value, timeZone = DEFAULT_TIME_ZONE) => {
  if (!value) return "N/A";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
};

const stripDepartmentNudge = (value) =>
  toText(value).replace(/^\[[^\]]+\]\s*/, "").trim();

const getUpdateContent = (value) =>
  stripDepartmentNudge(normalizeProjectUpdateContent(value)) ||
  "No updates yet";

const buildProjectNameRuns = (details = {}) => {
  const base =
    toText(details.projectNameRaw) ||
    toText(details.projectName) ||
    "Untitled";
  const indicator = toText(details.projectIndicator).toUpperCase();
  if (!indicator) return [{ text: base, bold: false }];
  return [
    { text: `${base} for `, bold: false },
    { text: indicator, bold: true },
  ];
};

const getDepartmentColumnWidth = (column, columns = []) => {
  const totalWeight = columns.reduce(
    (sum, currentColumn) =>
      sum + (DOCX_COLUMN_WEIGHT_MAP[currentColumn.id] || 18),
    0,
  );
  const columnWeight = DOCX_COLUMN_WEIGHT_MAP[column.id] || 18;
  return Math.max(
    8,
    Math.round((columnWeight / Math.max(totalWeight, 1)) * 100),
  );
};

const getDepartmentCellValue = (row, column) => {
  if (column.id === "dept") return toText(row?.dept);
  if (column.id === "lead") return toText(row?.leadName);
  return toText(row?.values?.[column.id]);
};

const formatDepartmentValue = (column, value, timeZone) => {
  const normalized = toText(value);
  if (!normalized) return "";
  if (column.kind !== "date") {
    return normalized
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" | ");
  }

  const parsedDate = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) return normalized;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
};

const buildDepartmentUpdateTable = (board, timeZone) => {
  const columns = Array.isArray(board?.columns) ? board.columns : [];
  const sections = Array.isArray(board?.sections) ? board.sections : [];
  if (columns.length === 0 || sections.length === 0) return null;

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
          children: columns.map(
            (column) =>
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
              formatDepartmentValue(
                column,
                getDepartmentCellValue(row, column),
                timeZone,
              ),
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

const buildHeaderTable = ({ generatedBy, reportDate }) =>
  new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: generatedBy,
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
            },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: reportDate,
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

const buildProjectTable = (projects, now, timeZone) => {
  const rows = [
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
            shading: { fill: "FFFFFF" },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
          }),
      ),
    }),
  ];

  projects.forEach((project) => {
    const parsedVersion = Number(project?.versionNumber);
    const version =
      Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
    const orderNumber = toText(project.orderId) || "N/A";
    const versionedOrderNumber =
      version > 1 ? `${orderNumber} (v${version})` : orderNumber;
    const deliveryContent = `${formatDeliveryDate(
      project.details?.deliveryDate,
      timeZone,
    )} ${toText(project.details?.deliveryTime)}`.trim();

    const isEmergency =
      project.projectType === "Emergency" || project.priority === "Urgent";
    const deliveryMs = project.details?.deliveryDate
      ? new Date(project.details.deliveryDate).getTime()
      : Number.NaN;
    const isUrgent =
      Number.isFinite(deliveryMs) &&
      (deliveryMs - now.getTime()) / (1000 * 60 * 60) <= 72;
    const textColor = isUrgent || isEmergency ? "FF0000" : "000000";

    const rowColors = {
      Emergency: "FEF2F2",
      "Corporate Job": "F0FDF4",
      Quote: "FFFBEB",
    };
    const rowColor = rowColors[project.projectType] || "EFF6FF";

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

    rows.push(
      new TableRow({
        children: [
          buildTextCell(getLeadDisplay(project)),
          buildTextCell(versionedOrderNumber),
          buildCell(
            buildProjectNameRuns(project.details).map(
              (run) =>
                new TextRun({
                  text: run.text,
                  bold: run.bold,
                  color: textColor,
                  font: "Calibri",
                }),
            ),
          ),
          buildTextCell(deliveryContent),
          buildTextCell(toText(project.status) || "N/A"),
          buildTextCell(getUpdateContent(project.endOfDayUpdate)),
        ],
      }),
    );
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
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
  });
};

const generateEndOfDayReport = async ({
  projects,
  departmentBoard,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
  generatedBy = "Front Desk",
}) => {
  const reportDate = formatReportDate(now, timeZone);
  const departmentTable = buildDepartmentUpdateTable(
    departmentBoard,
    timeZone,
  );
  const children = [buildProjectTable(projects, now, timeZone)];

  if (departmentTable) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: "" })] }),
      departmentTable,
    );
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri" },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
          },
        },
        headers: {
          default: new Header({
            children: [
              buildHeaderTable({
                generatedBy: toText(generatedBy) || "Front Desk",
                reportDate,
              }),
            ],
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
                    size: 20,
                    color: "64748B",
                    font: "Calibri",
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  const fileDate = formatFileDate(now, timeZone);
  return {
    buffer,
    contentType: DOCX_CONTENT_TYPE,
    filename: `SCRUM UPDATE - ${fileDate}.docx`,
    reportDate,
  };
};

module.exports = {
  DEFAULT_TIME_ZONE,
  DOCX_CONTENT_TYPE,
  formatFileDate,
  formatReportDate,
  generateEndOfDayReport,
  loadEndOfDayReportData,
  shouldIncludeProject,
};
