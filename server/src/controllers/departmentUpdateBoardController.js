const mongoose = require("mongoose");
const DepartmentUpdateBoard = require("../models/DepartmentUpdateBoard");

const BOARD_KEY = "frontdesk-department-updates";
const BOARD_TITLE = "Department Updates";
const CORE_COLUMNS = [
  { id: "dept", label: "Dept", kind: "text", isCore: true },
  { id: "lead", label: "Lead", kind: "lead", isCore: true },
  { id: "deliveryDate", label: "Delivery Date", kind: "date", isCore: true },
  {
    id: "itemInformation",
    label: "Item(s)/ Information",
    kind: "textarea",
    isCore: true,
  },
  {
    id: "statusUpdate",
    label: "Status / Update",
    kind: "textarea",
    isCore: true,
  },
];
const DEFAULT_SECTIONS = [
  {
    id: "production-maintenance",
    title: "DEPARTMENTAL ENGAGEMENTS - PRODUCTION & MACHINE MAINTENANCE",
    rows: [
      "UV / UV DTF",
      "Screen Print",
      "Large Format",
      "Digital Press",
      "Embroidery",
      "Sublimation",
      "Woodme",
      "Engraving",
    ],
  },
  {
    id: "operations-admin-graphics",
    title: "OPERATIONS, ADMIN & GRAPHICS",
    rows: [
      "Digital Marketing & IT",
      "Vehicle",
      "ECG & Gen",
      "Front Desk",
      "Projects",
      "Graphics",
      "HR & Op.",
      "MD's Office",
      "Stores & Packaging",
    ],
  },
];
const CORE_COLUMN_ID_SET = new Set(CORE_COLUMNS.map((column) => column.id));
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const createId = () => new mongoose.Types.ObjectId().toString();

const toText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const toInlineText = (value) => toText(value).replace(/\s+/g, " ");

const toMultilineText = (value) =>
  String(value === null || value === undefined ? "" : value)
    .replace(/\r\n/g, "\n")
    .trim();

const toObjectIdString = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value._id) {
    return String(value._id);
  }
  return String(value);
};

const isFrontDeskUser = (user) => {
  const departments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];
  return departments.includes("Front Desk");
};

const ensureFrontDeskAccess = (req, res) => {
  if (isFrontDeskUser(req.user)) {
    return true;
  }

  res.status(403).json({
    message: "Only Front Desk can access Department Updates.",
  });
  return false;
};

const getUserDisplayName = (user) => {
  const firstName = toText(user?.firstName);
  const lastName = toText(user?.lastName);
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return fullName || toText(user?.employeeId) || "Front Desk";
};

const cloneCoreColumn = (column) => ({
  id: column.id,
  label: column.label,
  kind: column.kind,
  isCore: true,
});

const buildDefaultBoardData = () => ({
  boardKey: BOARD_KEY,
  title: BOARD_TITLE,
  columns: CORE_COLUMNS.map(cloneCoreColumn),
  sections: DEFAULT_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    rows: section.rows.map((dept) => ({
      id: createId(),
      dept,
      leadName: "",
      leadUserId: null,
      values: {
        deliveryDate: "",
        itemInformation: "",
        statusUpdate: "",
      },
      lastUpdatedAt: null,
      lastUpdatedBy: null,
    })),
  })),
  lastUpdatedAt: null,
  lastUpdatedBy: null,
});

const sanitizeDateValue = (value) => {
  const normalized = toText(value);
  return DATE_VALUE_PATTERN.test(normalized) ? normalized : "";
};

const sanitizeColumnArray = (columns) => {
  const incomingColumns = Array.isArray(columns) ? columns : [];
  const customColumns = [];
  const seenCustomIds = new Set();
  const coreColumnsById = new Map();

  incomingColumns.forEach((column) => {
    const columnId = toInlineText(column?.id);
    if (!columnId) return;

    if (CORE_COLUMN_ID_SET.has(columnId)) {
      const fallback = CORE_COLUMNS.find((entry) => entry.id === columnId);
      coreColumnsById.set(columnId, {
        id: columnId,
        label: toInlineText(column?.label) || fallback.label,
        kind: fallback.kind,
        isCore: true,
      });
      return;
    }

    const normalizedId = seenCustomIds.has(columnId) ? createId() : columnId;
    seenCustomIds.add(normalizedId);
    customColumns.push({
      id: normalizedId,
      label: toInlineText(column?.label) || "Custom Column",
      kind: "text",
      isCore: false,
    });
  });

  return [
    ...CORE_COLUMNS.map((column) =>
      coreColumnsById.get(column.id) || cloneCoreColumn(column),
    ),
    ...customColumns,
  ];
};

const sanitizeValuesObject = (value, columns) => {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const nextValues = {};

  columns.forEach((column) => {
    if (column.id === "dept" || column.id === "lead") {
      return;
    }

    if (column.kind === "date") {
      nextValues[column.id] = sanitizeDateValue(source[column.id]);
      return;
    }

    if (column.kind === "textarea") {
      nextValues[column.id] = toMultilineText(source[column.id]);
      return;
    }

    nextValues[column.id] = toMultilineText(source[column.id]);
  });

  return nextValues;
};

const extractComparableRowShape = (row = {}, columns = []) => ({
  dept: toInlineText(row.dept),
  leadName: toInlineText(row.leadName),
  leadUserId: toObjectIdString(row.leadUserId),
  values: sanitizeValuesObject(row.values, columns),
});

const areRowShapesEqual = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);

const extractComparableBoardShape = (board = {}) => ({
  title: toInlineText(board.title || BOARD_TITLE),
  columns: sanitizeColumnArray(board.columns).map((column) => ({
    id: column.id,
    label: column.label,
    kind: column.kind,
    isCore: Boolean(column.isCore),
  })),
  sections: (Array.isArray(board.sections) ? board.sections : []).map(
    (section) => ({
      id: toInlineText(section.id),
      title: toInlineText(section.title),
      rows: (Array.isArray(section.rows) ? section.rows : []).map((row) =>
        extractComparableRowShape(row, sanitizeColumnArray(board.columns)),
      ),
    }),
  ),
});

const sanitizeLeadReference = (value) => {
  const candidate = toText(value);
  return mongoose.Types.ObjectId.isValid(candidate) ? candidate : null;
};

const sanitizeRow = (row, existingRow, columns, actorId, now) => {
  const sanitizedRow = {
    id: toInlineText(row?.id) || existingRow?.id || createId(),
    dept: toInlineText(row?.dept),
    leadName: toInlineText(row?.leadName),
    leadUserId: sanitizeLeadReference(row?.leadUserId),
    values: sanitizeValuesObject(row?.values, columns),
    lastUpdatedAt: existingRow?.lastUpdatedAt || null,
    lastUpdatedBy: existingRow?.lastUpdatedBy || null,
  };

  const previousShape = existingRow
    ? extractComparableRowShape(existingRow, columns)
    : null;
  const nextShape = extractComparableRowShape(sanitizedRow, columns);
  const rowChanged = !previousShape || !areRowShapesEqual(previousShape, nextShape);

  if (rowChanged) {
    sanitizedRow.lastUpdatedAt = now;
    sanitizedRow.lastUpdatedBy = actorId;
  }

  return sanitizedRow;
};

const sanitizeSections = (sections, existingBoard, columns, actorId, now) => {
  const incomingSections = Array.isArray(sections) ? sections : [];
  const existingSections = Array.isArray(existingBoard?.sections)
    ? existingBoard.sections
    : [];

  return DEFAULT_SECTIONS.map((defaultSection) => {
    const incomingSection =
      incomingSections.find(
        (section) => toInlineText(section?.id) === defaultSection.id,
      ) || {};
    const existingSection =
      existingSections.find(
        (section) => toInlineText(section?.id) === defaultSection.id,
      ) || {};
    const incomingRows = Array.isArray(incomingSection.rows)
      ? incomingSection.rows
      : Array.isArray(existingSection.rows)
        ? existingSection.rows
        : defaultSection.rows.map((dept) => ({ dept }));

    const existingRowMap = new Map(
      (Array.isArray(existingSection.rows) ? existingSection.rows : []).map(
        (row) => [toInlineText(row?.id), row],
      ),
    );

    return {
      id: defaultSection.id,
      title:
        toInlineText(incomingSection.title) ||
        toInlineText(existingSection.title) ||
        defaultSection.title,
      rows: incomingRows.map((row) =>
        sanitizeRow(
          row,
          existingRowMap.get(toInlineText(row?.id)) || null,
          columns,
          actorId,
          now,
        ),
      ),
    };
  });
};

const ensureBoardDocument = async () => {
  let board = await DepartmentUpdateBoard.findOne({ boardKey: BOARD_KEY });
  if (board) {
    return board;
  }

  board = await DepartmentUpdateBoard.create(buildDefaultBoardData());
  return board;
};

const populateBoard = async () =>
  DepartmentUpdateBoard.findOne({ boardKey: BOARD_KEY })
    .populate("lastUpdatedBy", "firstName lastName employeeId")
    .populate("sections.rows.lastUpdatedBy", "firstName lastName employeeId");

const toBoardResponse = (boardDoc) => {
  if (!boardDoc) return null;
  const board = boardDoc.toObject({ depopulate: false });
  return {
    ...board,
    title: toInlineText(board.title) || BOARD_TITLE,
    columns: sanitizeColumnArray(board.columns),
    sections: Array.isArray(board.sections)
      ? board.sections.map((section) => ({
          ...section,
          title: toInlineText(section.title),
          rows: Array.isArray(section.rows)
            ? section.rows.map((row) => ({
                ...row,
                dept: toInlineText(row.dept),
                leadName: toInlineText(row.leadName),
                values: sanitizeValuesObject(
                  row.values,
                  sanitizeColumnArray(board.columns),
                ),
              }))
            : [],
        }))
      : [],
  };
};

const buildSanitizedBoardPayload = (body, existingBoard, actorId, now) => {
  const columns = sanitizeColumnArray(body?.columns);
  const sections = sanitizeSections(
    body?.sections,
    existingBoard,
    columns,
    actorId,
    now,
  );

  return {
    title: BOARD_TITLE,
    columns,
    sections,
  };
};

const boardsDiffer = (existingBoard, nextBoard) =>
  JSON.stringify(extractComparableBoardShape(existingBoard)) !==
  JSON.stringify(extractComparableBoardShape(nextBoard));

const getDepartmentUpdateBoard = async (req, res) => {
  try {
    if (!ensureFrontDeskAccess(req, res)) {
      return;
    }

    await ensureBoardDocument();
    const board = await populateBoard();
    return res.json(toBoardResponse(board));
  } catch (error) {
    console.error("Error loading Department Update board:", error);
    return res.status(500).json({
      message: "Failed to load Department Updates board.",
    });
  }
};

const saveDepartmentUpdateBoard = async (req, res) => {
  try {
    if (!ensureFrontDeskAccess(req, res)) {
      return;
    }

    const board = await ensureBoardDocument();
    const actorId = req.user?._id || req.user?.id || null;
    const now = new Date();
    const nextBoard = buildSanitizedBoardPayload(req.body, board, actorId, now);
    const boardChanged = boardsDiffer(board, nextBoard);

    board.title = BOARD_TITLE;
    board.columns = nextBoard.columns;
    board.sections = nextBoard.sections;

    if (boardChanged) {
      board.lastUpdatedAt = now;
      board.lastUpdatedBy = actorId;
    }

    await board.save();
    const populatedBoard = await populateBoard();

    return res.json({
      ...toBoardResponse(populatedBoard),
      boardUpdated: boardChanged,
      updatedByName: getUserDisplayName(req.user),
    });
  } catch (error) {
    console.error("Error saving Department Update board:", error);
    return res.status(500).json({
      message: "Failed to save Department Updates board.",
    });
  }
};

module.exports = {
  getDepartmentUpdateBoard,
  saveDepartmentUpdateBoard,
};
