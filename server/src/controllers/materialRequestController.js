const mongoose = require("mongoose");
const MaterialRequest = require("../models/MaterialRequest");
const InventoryRecord = require("../models/InventoryRecord");
const Project = require("../models/Project");

const REVIEWER_DEPARTMENTS = new Set([
  "administration",
  "stores",
  "stock",
  "packaging",
]);

const VALID_STATUSES = new Set([
  "Pending",
  "In Review",
  "Ordered",
  "Fulfilled",
  "Declined",
]);

const VALID_PRIORITIES = new Set(["Low", "Normal", "High", "Urgent"]);
const MAX_REQUEST_ITEMS = 25;

const parseString = (value) => String(value ?? "").trim();

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value._id) return toEntityId(value._id);
  if (value.id) return toEntityId(value.id);
  return "";
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSearchRegexes = (value) => {
  const term = parseString(value).slice(0, 120);
  if (!term) return [];

  const candidates = [
    term,
    ...(term.toLowerCase().match(/[a-z0-9]+/g) || []).filter(
      (token) => token.length >= 2,
    ),
  ];

  return Array.from(
    new Map(
      candidates.map((candidate) => [
        candidate.toLowerCase(),
        new RegExp(escapeRegex(candidate), "i"),
      ]),
    ).values(),
  ).slice(0, 9);
};

const scoreInventoryMatch = (record, rawQuery) => {
  const query = parseString(rawQuery).toLowerCase();
  if (!query) return 0;

  const item = parseString(record?.item).toLowerCase();
  const sku = parseString(record?.sku).toLowerCase();
  const searchableText = [
    record?.item,
    record?.sku,
    record?.brand,
    record?.category,
    record?.warehouse,
    record?.subtext,
    record?.shelfLocation,
    ...(Array.isArray(record?.variants)
      ? record.variants.flatMap((variant) => [
          variant?.name,
          variant?.color,
          variant?.sku,
        ])
      : []),
  ]
    .map(parseString)
    .join(" ")
    .toLowerCase();
  const tokens = (query.match(/[a-z0-9]+/g) || []).filter(
    (token) => token.length >= 2,
  );

  let score = 0;
  if (sku === query) score += 140;
  if (item === query) score += 120;
  if (item.startsWith(query)) score += 80;
  if (item.includes(query)) score += 60;
  if (searchableText.includes(query)) score += 35;
  tokens.forEach((token) => {
    if (item.includes(token)) score += 18;
    else if (searchableText.includes(token)) score += 8;
  });
  return score;
};

const normalizeDepartmentKey = (value) =>
  parseString(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[_/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const normalizeDepartmentList = (value) => {
  if (Array.isArray(value)) return value.map(parseString).filter(Boolean);
  const single = parseString(value);
  return single ? [single] : [];
};

const getUserDisplayName = (user) => {
  const fullName = [user?.firstName, user?.lastName]
    .map(parseString)
    .filter(Boolean)
    .join(" ");
  if (fullName) return fullName;
  return parseString(user?.name) || parseString(user?.employeeId) || "User";
};

const canReviewMaterialRequests = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;

  return normalizeDepartmentList(user.department)
    .map((department) => department.toLowerCase())
    .some((department) => REVIEWER_DEPARTMENTS.has(department));
};

const resolveRequestedDepartment = (user, rawDepartment) => {
  const userDepartments = normalizeDepartmentList(user?.department);
  const requestedDepartment = parseString(rawDepartment);
  const reviewer = canReviewMaterialRequests(user);

  if (!requestedDepartment) {
    return userDepartments[0] || "";
  }

  if (reviewer) return requestedDepartment;

  const requestedKey = normalizeDepartmentKey(requestedDepartment);
  const ownsDepartment = userDepartments.some(
    (department) => normalizeDepartmentKey(department) === requestedKey,
  );

  return ownsDepartment ? requestedDepartment : "";
};

const buildListFilter = (req) => {
  const filter = {};
  const reviewer = canReviewMaterialRequests(req.user);
  const departmentKey = normalizeDepartmentKey(req.query.department);
  const status = parseString(req.query.status);
  const mineOnly = parseString(req.query.mine).toLowerCase() === "true";

  if (!reviewer || mineOnly) {
    filter.requestedBy = req.user._id;
  }

  if (departmentKey && departmentKey !== "all") {
    filter.departmentKey = departmentKey;
  }

  if (status && status.toLowerCase() !== "all" && VALID_STATUSES.has(status)) {
    filter.status = status;
  }

  return filter;
};

const buildSummary = (requests) => {
  const departmentMap = new Map();
  const statusCounts = {};

  requests.forEach((request) => {
    const department = parseString(request.department);
    const key = parseString(request.departmentKey) || normalizeDepartmentKey(department);
    if (department && key && !departmentMap.has(key)) {
      departmentMap.set(key, { key, label: department });
    }

    const status = parseString(request.status) || "Pending";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return {
    departments: Array.from(departmentMap.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    ),
    statusCounts,
  };
};

const isRequestOwner = (request, user) =>
  String(request?.requestedBy || "") === String(user?._id || "");

const canCreateProjectRequest = (project, user) => {
  if (!project || !user) return false;
  if (user.role === "admin") return true;

  const userId = toEntityId(user._id || user.id);
  const allowedLeadIds = [
    project.projectLeadId,
    project.assistantLeadId,
  ]
    .map(toEntityId)
    .filter(Boolean);

  return Boolean(userId && allowedLeadIds.includes(userId));
};

const findProjectItem = (project, projectItemId) => {
  const normalizedItemId = toEntityId(projectItemId);
  if (!normalizedItemId) return null;

  if (typeof project.items?.id === "function") {
    const subdocument = project.items.id(normalizedItemId);
    if (subdocument) return subdocument;
  }

  return (project.items || []).find(
    (item) => toEntityId(item?._id || item?.id) === normalizedItemId,
  );
};

const getProjectName = (project) =>
  parseString(project?.details?.projectNameRaw) ||
  parseString(project?.details?.projectName) ||
  parseString(project?.orderId) ||
  "Untitled Project";

const getProjectClientName = (project) =>
  parseString(project?.details?.client) || parseString(project?.clientName);

const formatInventoryMatch = (record) => ({
  _id: record?._id,
  item: parseString(record?.item),
  sku: parseString(record?.sku),
  brand: parseString(record?.brand),
  category: parseString(record?.category),
  warehouse: parseString(record?.warehouse || record?.subtext),
  shelfLocation: parseString(record?.shelfLocation),
  qtyValue:
    typeof record?.qtyValue === "number" && Number.isFinite(record.qtyValue)
      ? record.qtyValue
      : null,
  qtyLabel: parseString(record?.qtyLabel),
  qtyMeta: parseString(record?.qtyMeta),
  status: parseString(record?.status),
  variants: Array.isArray(record?.variants)
    ? record.variants.slice(0, 4).map((variant) => ({
        name: parseString(variant?.name),
        color: parseString(variant?.color),
        sku: parseString(variant?.sku),
        qtyValue:
          typeof variant?.qtyValue === "number" && Number.isFinite(variant.qtyValue)
            ? variant.qtyValue
            : null,
        qtyLabel: parseString(variant?.qtyLabel),
        status: parseString(variant?.status),
      }))
    : [],
});

const buildInventorySnapshot = (record) => {
  if (!record) return {};
  const formatted = formatInventoryMatch(record);
  return {
    inventoryRecord: record._id,
    inventoryItemName: formatted.item,
    inventorySku: formatted.sku,
    inventoryWarehouse: formatted.warehouse,
    inventoryShelfLocation: formatted.shelfLocation,
    inventoryStatus: formatted.status,
    inventoryQtyLabel: formatted.qtyLabel,
    inventoryQtyValue: formatted.qtyValue,
  };
};

const readRequestItems = (body = {}) => {
  const rawItems =
    Array.isArray(body.items) && body.items.length
      ? body.items
      : [
          {
            materialName: body.materialName,
            quantity: body.quantity,
            unit: body.unit,
          },
        ];

  if (rawItems.length > MAX_REQUEST_ITEMS) {
    return {
      error: `A material request can contain up to ${MAX_REQUEST_ITEMS} items.`,
    };
  }

  const items = rawItems.map((item) => ({
    materialName: parseString(
      item?.materialName ?? item?.name ?? item?.description,
    ),
    quantity: parseString(item?.quantity ?? item?.qty),
    unit: parseString(item?.unit),
  }));

  const incompleteItemIndex = items.findIndex(
    (item) => !item.materialName || !item.quantity,
  );
  if (incompleteItemIndex >= 0) {
    return {
      error: `Item ${incompleteItemIndex + 1} needs a material name and quantity.`,
    };
  }

  return { data: items };
};

const readProjectMaterialRequestPayload = async (user, body = {}) => {
  const projectId = parseString(body.projectId || body.project);
  const submittedItems =
    Array.isArray(body.items) && body.items.length ? body.items : null;
  const primaryProjectItemId = parseString(body.projectItemId);
  const projectItemIds = Array.from(
    new Set(
      (
        submittedItems
          ? submittedItems.map((item) => item?.projectItemId)
          : Array.isArray(body.projectItemIds) && body.projectItemIds.length
            ? body.projectItemIds
            : [body.projectItemId]
      )
        .map(parseString)
        .filter(Boolean),
    ),
  );
  const rawPriority = parseString(body.priority) || "Normal";
  const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : "Normal";
  const rawNeededBy = parseString(body.neededBy);
  const neededBy = rawNeededBy ? new Date(rawNeededBy) : null;
  const notes = parseString(body.notes);
  const inventoryRecordId = parseString(
    body.inventoryRecordId || body.inventoryRecord || body.inventoryMatchId,
  );

  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return { error: "Choose a valid project for this material request." };
  }
  if (!mongoose.Types.ObjectId.isValid(primaryProjectItemId)) {
    return { error: "Choose an item from the project order list." };
  }
  const requestItemCount = submittedItems?.length || projectItemIds.length;
  if (requestItemCount > MAX_REQUEST_ITEMS) {
    return {
      error: `A project request can contain up to ${MAX_REQUEST_ITEMS} items.`,
    };
  }
  if (projectItemIds.some((itemId) => !mongoose.Types.ObjectId.isValid(itemId))) {
    return { error: "Choose valid items from the project order list." };
  }
  if (neededBy && Number.isNaN(neededBy.getTime())) {
    return { error: "Needed by date is invalid." };
  }

  const project = await Project.findById(projectId);
  if (!project) {
    return { error: "Project not found.", statusCode: 404 };
  }
  if (!canCreateProjectRequest(project, user)) {
    return {
      error: "Only the assigned project lead can request materials for this project.",
      statusCode: 403,
    };
  }

  const linkedProjectItems = projectItemIds.map((itemId) => ({
    itemId,
    item: findProjectItem(project, itemId),
  }));
  if (linkedProjectItems.some(({ item }) => !item)) {
    return { error: "One of the selected project items was not found.", statusCode: 404 };
  }

  const projectItemMap = new Map(
    linkedProjectItems.map(({ itemId, item }) => [itemId, item]),
  );
  const projectItem =
    projectItemMap.get(primaryProjectItemId) ||
    findProjectItem(project, primaryProjectItemId);
  if (!projectItem) {
    return { error: "Selected project item was not found.", statusCode: 404 };
  }

  const defaultUnit = parseString(body.unit) || "pcs";
  const requestItems = submittedItems
    ? submittedItems.map((item) => {
        const linkedItemId = parseString(item?.projectItemId);
        const linkedItem = linkedItemId ? projectItemMap.get(linkedItemId) : null;
        return {
          materialName:
            parseString(item?.materialName ?? item?.name ?? item?.description) ||
            parseString(linkedItem?.description),
          quantity:
            parseString(item?.quantity ?? item?.qty) ||
            parseString(linkedItem?.qty),
          unit: parseString(item?.unit) || defaultUnit,
          projectItemId: linkedItem?._id || null,
          projectItemBreakdown: parseString(linkedItem?.breakdown),
          projectItemQuantity:
            typeof linkedItem?.qty === "number" && Number.isFinite(linkedItem.qty)
              ? linkedItem.qty
              : null,
          inventoryRecordId:
            parseString(item?.inventoryRecordId || item?.inventoryRecord) ||
            (linkedItemId === primaryProjectItemId ? inventoryRecordId : ""),
        };
      })
    : linkedProjectItems.map(({ itemId, item }) => ({
        materialName: parseString(item.description),
        quantity: parseString(item.qty),
        unit: defaultUnit,
        projectItemId: item._id,
        projectItemBreakdown: parseString(item.breakdown),
        projectItemQuantity:
          typeof item.qty === "number" && Number.isFinite(item.qty)
            ? item.qty
            : null,
        inventoryRecordId:
          itemId === primaryProjectItemId ? inventoryRecordId : "",
      }));

  const primaryRequestItem = requestItems.find(
    (item) => toEntityId(item.projectItemId) === primaryProjectItemId,
  );
  if (!primaryRequestItem) {
    return { error: "Keep the selected order item in this project request." };
  }

  const materialName = primaryRequestItem.materialName;
  const quantity = primaryRequestItem.quantity;
  const unit = primaryRequestItem.unit;
  const department =
    resolveRequestedDepartment(user, body.department) ||
    normalizeDepartmentList(user?.department)[0] ||
    "Project Lead";
  const departmentKey = normalizeDepartmentKey(department);

  if (!materialName) {
    return { error: "Selected project item does not have a description." };
  }
  if (!quantity) {
    return { error: "Selected project item does not have a quantity." };
  }
  const incompleteItemIndex = requestItems.findIndex(
    (item) => !item.materialName || !item.quantity,
  );
  if (incompleteItemIndex >= 0) {
    return {
      error: `Request item ${incompleteItemIndex + 1} needs a material name and quantity.`,
    };
  }
  if (!departmentKey) {
    return {
      error: "Choose one of your departments for this material request.",
    };
  }

  const inventoryRecordIds = Array.from(
    new Set(requestItems.map((item) => item.inventoryRecordId).filter(Boolean)),
  );
  if (
    inventoryRecordIds.some(
      (recordId) => !mongoose.Types.ObjectId.isValid(recordId),
    )
  ) {
    return { error: "One of the selected inventory items is invalid." };
  }
  if (inventoryRecordIds.length) {
    const inventoryRecords = await InventoryRecord.find({
      _id: { $in: inventoryRecordIds },
    }).lean();
    const inventoryRecordMap = new Map(
      inventoryRecords.map((record) => [toEntityId(record._id), record]),
    );
    const missingInventoryRecordId = inventoryRecordIds.find(
      (recordId) => !inventoryRecordMap.has(recordId),
    );
    if (missingInventoryRecordId) {
      return {
        error: "One of the selected inventory items was not found.",
        statusCode: 404,
      };
    }
    requestItems.forEach((item) => {
      const record = inventoryRecordMap.get(item.inventoryRecordId);
      item.inventorySnapshot = record ? buildInventorySnapshot(record) : {};
    });
  }

  return {
    data: {
      requestType: "project",
      materialName,
      quantity,
      unit,
      items: requestItems.map((item) => ({
        materialName: item.materialName,
        quantity: item.quantity,
        unit: item.unit,
        projectItemId: item.projectItemId,
        projectItemBreakdown: item.projectItemBreakdown,
        projectItemQuantity: item.projectItemQuantity,
        ...(item.inventorySnapshot || {}),
      })),
      department,
      departmentKey,
      priority,
      neededBy,
      notes,
      project: project._id,
      projectOrderId: parseString(project.orderId),
      projectName: getProjectName(project),
      projectClientName: getProjectClientName(project),
      projectLeadName: getUserDisplayName(user),
      projectItemId: projectItem._id,
      projectItemDescription: materialName,
      projectItemBreakdown: parseString(projectItem.breakdown),
      projectItemQuantity:
        typeof projectItem.qty === "number" && Number.isFinite(projectItem.qty)
          ? projectItem.qty
          : null,
      ...(primaryRequestItem.inventorySnapshot || {}),
    },
  };
};

const readMaterialRequestPayload = (user, body = {}) => {
  const requestItems = readRequestItems(body);
  if (requestItems.error) return requestItems;

  const items = requestItems.data;
  const firstItem = items[0];
  const materialName = firstItem.materialName;
  const quantity = firstItem.quantity;
  const unit = firstItem.unit;
  const department = resolveRequestedDepartment(user, body.department);
  const departmentKey = normalizeDepartmentKey(department);
  const notes = parseString(body.notes);
  const rawPriority = parseString(body.priority) || "Normal";
  const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : "Normal";
  const rawNeededBy = parseString(body.neededBy);
  const neededBy = rawNeededBy ? new Date(rawNeededBy) : null;

  if (!materialName) {
    return { error: "Material name is required." };
  }
  if (!quantity) {
    return { error: "Quantity is required." };
  }
  if (!department || !departmentKey) {
    return {
      error: "Choose one of your departments for this material request.",
    };
  }
  if (neededBy && Number.isNaN(neededBy.getTime())) {
    return { error: "Needed by date is invalid." };
  }

  return {
    data: {
      materialName,
      quantity,
      unit,
      items,
      department,
      departmentKey,
      priority,
      neededBy,
      notes,
    },
  };
};

const getMaterialRequestInventoryMatches = async (req, res) => {
  try {
    const rawQuery = parseString(req.query.query || req.query.search);
    const searches = buildSearchRegexes(rawQuery);
    if (!searches.length) {
      return res.json({ matches: [] });
    }

    const searchFields = [
      "item",
      "brand",
      "sku",
      "category",
      "subtext",
      "warehouse",
      "shelfLocation",
      "variants.name",
      "variants.color",
      "variants.sku",
    ];
    const records = await InventoryRecord.find({
      $or: searches.flatMap((search) =>
        searchFields.map((field) => ({ [field]: search })),
      ),
    })
      .select(
        "item sku brand category warehouse subtext shelfLocation qtyValue qtyLabel qtyMeta status variants updatedAt",
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(40)
      .lean();

    res.json({
      matches: records
        .map((record) => ({
          record,
          score: scoreInventoryMatch(record, rawQuery),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 8)
        .map(({ record }) => formatInventoryMatch(record)),
    });
  } catch (error) {
    console.error("Error fetching material request inventory matches:", error);
    res.status(500).json({ message: "Failed to fetch inventory matches." });
  }
};

const getMaterialRequests = async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 100, 1),
      300,
    );
    const filter = buildListFilter(req);
    const summaryFilter = { ...filter };
    delete summaryFilter.departmentKey;
    delete summaryFilter.status;

    const [requests, summaryRequests] = await Promise.all([
      MaterialRequest.find(filter)
        .populate("requestedBy", "firstName lastName employeeId department avatarUrl")
        .populate("statusUpdatedBy", "firstName lastName employeeId")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      MaterialRequest.find(summaryFilter)
        .select("department departmentKey status")
        .sort({ department: 1 })
        .lean(),
    ]);

    res.json({
      requests,
      ...buildSummary(summaryRequests),
      canReview: canReviewMaterialRequests(req.user),
    });
  } catch (error) {
    console.error("Error fetching material requests:", error);
    res.status(500).json({ message: "Failed to fetch material requests." });
  }
};

const createMaterialRequest = async (req, res) => {
  try {
    const requestType =
      parseString(req.body.requestType).toLowerCase() === "project"
        ? "project"
        : "department";
    const payload =
      requestType === "project"
        ? await readProjectMaterialRequestPayload(req.user, req.body)
        : readMaterialRequestPayload(req.user, req.body);
    if (payload.error) {
      return res.status(payload.statusCode || 400).json({ message: payload.error });
    }

    const request = await MaterialRequest.create({
      ...payload.data,
      requestedBy: req.user._id,
      requestedByName: getUserDisplayName(req.user),
      requestedByEmployeeId: parseString(req.user.employeeId),
      requesterDepartments: normalizeDepartmentList(req.user.department),
    });

    const populated = await MaterialRequest.findById(request._id)
      .populate("requestedBy", "firstName lastName employeeId department avatarUrl")
      .populate("statusUpdatedBy", "firstName lastName employeeId")
      .lean();

    res.status(201).json(populated);
  } catch (error) {
    console.error("Error creating material request:", error);
    res.status(500).json({ message: "Failed to create material request." });
  }
};

const updateMaterialRequest = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid material request ID." });
    }

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Material request not found." });
    }

    if (!isRequestOwner(request, req.user)) {
      return res.status(403).json({
        message: "Only the requester can edit this material request.",
      });
    }

    const payload = readMaterialRequestPayload(req.user, req.body);
    if (payload.error) {
      return res.status(400).json({ message: payload.error });
    }

    Object.assign(request, payload.data, {
      requestedByName: getUserDisplayName(req.user),
      requestedByEmployeeId: parseString(req.user.employeeId),
      requesterDepartments: normalizeDepartmentList(req.user.department),
    });

    await request.save();

    const populated = await MaterialRequest.findById(request._id)
      .populate("requestedBy", "firstName lastName employeeId department avatarUrl")
      .populate("statusUpdatedBy", "firstName lastName employeeId")
      .lean();

    res.json(populated);
  } catch (error) {
    console.error("Error updating material request:", error);
    res.status(500).json({ message: "Failed to update material request." });
  }
};

const updateMaterialRequestStatus = async (req, res) => {
  try {
    if (!canReviewMaterialRequests(req.user)) {
      return res.status(403).json({
        message: "Only Admin and Stores users can update material requests.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid material request ID." });
    }

    const status = parseString(req.body.status);
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid material request status." });
    }

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.json({
        id: req.params.id,
        message: "Material request deleted.",
        alreadyDeleted: true,
      });
    }

    request.status = status;
    request.statusNote = parseString(req.body.statusNote);
    request.statusUpdatedBy = req.user._id;
    request.statusUpdatedAt = new Date();
    await request.save();

    const populated = await MaterialRequest.findById(request._id)
      .populate("requestedBy", "firstName lastName employeeId department avatarUrl")
      .populate("statusUpdatedBy", "firstName lastName employeeId")
      .lean();

    res.json(populated);
  } catch (error) {
    console.error("Error updating material request status:", error);
    res.status(500).json({ message: "Failed to update material request." });
  }
};

const deleteMaterialRequest = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid material request ID." });
    }

    const request = await MaterialRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Material request not found." });
    }

    if (!isRequestOwner(request, req.user) && !canReviewMaterialRequests(req.user)) {
      return res.status(403).json({
        message: "Only the requester, Admin, or Stores users can delete this request.",
      });
    }

    await request.deleteOne();

    res.json({
      id: req.params.id,
      message: "Material request deleted.",
    });
  } catch (error) {
    console.error("Error deleting material request:", error);
    res.status(500).json({ message: "Failed to delete material request." });
  }
};

module.exports = {
  getMaterialRequestInventoryMatches,
  getMaterialRequests,
  createMaterialRequest,
  updateMaterialRequest,
  updateMaterialRequestStatus,
  deleteMaterialRequest,
};
