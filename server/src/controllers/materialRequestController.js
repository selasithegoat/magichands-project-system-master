const mongoose = require("mongoose");
const MaterialRequest = require("../models/MaterialRequest");
const InventoryRecord = require("../models/InventoryRecord");
const Project = require("../models/Project");
const StockTransaction = require("../models/StockTransaction");

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
  "Partially Fulfilled",
  "Fulfilled",
  "Declined",
]);

const VALID_PRIORITIES = new Set(["Low", "Normal", "High", "Urgent"]);
const MAX_REQUEST_ITEMS = 25;

const parseString = (value) => String(value ?? "").trim();

const formatQuantityLabel = (value) => {
  if (!Number.isFinite(value)) return "";
  const normalized = Number.isInteger(value) ? value : Number(value.toFixed(2));
  return `${normalized.toLocaleString("en-US")} Units`;
};

const computeQtyMetaFromCapacity = (qtyValue, maxQty) => {
  if (!Number.isFinite(qtyValue) || !Number.isFinite(maxQty) || maxQty <= 0) {
    return "";
  }
  return `${Math.round((qtyValue / maxQty) * 100)}%`;
};

const parsePositiveQuantity = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number.parseFloat(match[0]);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const parseNonNegativeQuantity = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number.parseFloat(match[0]);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

const roundQuantity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(4));
};

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value.toHexString === "function") return value.toHexString();
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

const populateMaterialRequestQuery = (query) =>
  query
    .populate("requestedBy", "firstName lastName employeeId department avatarUrl")
    .populate("statusUpdatedBy", "firstName lastName employeeId")
    .populate("items.inventoryRecord", "item sku qtyValue qtyLabel qtyMeta status warehouse shelfLocation subtext")
    .populate("inventoryRecord", "item sku qtyValue qtyLabel qtyMeta status warehouse shelfLocation subtext")
    .populate("items.fulfilledBy", "firstName lastName employeeId")
    .populate("items.stockTransaction", "txid type qty beforeQty afterQty date")
    .populate("items.stockTransactions", "txid type qty beforeQty afterQty date");

const getPopulatedMaterialRequestById = (requestId) =>
  populateMaterialRequestQuery(MaterialRequest.findById(requestId)).lean();

const isRequestOwner = (request, user) =>
  String(request?.requestedBy || "") === String(user?._id || "");

const hasFulfilledRequestLine = (request) =>
  Array.isArray(request?.items) &&
  request.items.some(
    (item) =>
      item?.fulfillmentStatus === "Fulfilled" ||
      item?.fulfillmentStatus === "Partially Fulfilled" ||
      (Number(item?.fulfilledQuantity) || 0) > 0,
  );

const hasUnissuedMatchedRequestLine = (request) =>
  Array.isArray(request?.items) &&
  request.items.some(
    (item) =>
      toEntityId(item?.inventoryRecord) &&
      item?.fulfillmentStatus !== "Fulfilled",
  );

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
  if (
    primaryProjectItemId &&
    !mongoose.Types.ObjectId.isValid(primaryProjectItemId)
  ) {
    return { error: "Choose a valid item from the project order list." };
  }
  const requestItemCount = submittedItems?.length || projectItemIds.length;
  if (requestItemCount < 1) {
    return { error: "Add at least one material to request." };
  }
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
  const projectItem = primaryProjectItemId
    ? projectItemMap.get(primaryProjectItemId) ||
      findProjectItem(project, primaryProjectItemId)
    : null;
  if (primaryProjectItemId && !projectItem) {
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

  const primaryRequestItem = primaryProjectItemId
    ? requestItems.find(
        (item) => toEntityId(item.projectItemId) === primaryProjectItemId,
      )
    : requestItems[0];
  if (!primaryRequestItem) {
    return { error: "Add at least one material to request." };
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
      projectItemId: projectItem?._id || null,
      projectItemDescription: projectItem ? materialName : "",
      projectItemBreakdown: parseString(projectItem?.breakdown),
      projectItemQuantity:
        typeof projectItem?.qty === "number" && Number.isFinite(projectItem.qty)
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
      populateMaterialRequestQuery(
        MaterialRequest.find(filter).sort({ createdAt: -1 }).limit(limit),
      ).lean(),
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

    const populated = await getPopulatedMaterialRequestById(request._id);

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
    if (hasFulfilledRequestLine(request)) {
      return res.status(400).json({
        message:
          "This request has issued stock and can no longer be edited. Create a new request for changes.",
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

    const populated = await getPopulatedMaterialRequestById(request._id);

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
    if (status === "Fulfilled" && hasUnissuedMatchedRequestLine(request)) {
      return res.status(400).json({
        message:
          "Issue matched inventory lines from stock before marking this request fulfilled.",
      });
    }

    request.status = status;
    request.statusNote = parseString(req.body.statusNote);
    request.statusUpdatedBy = req.user._id;
    request.statusUpdatedAt = new Date();
    await request.save();

    const populated = await getPopulatedMaterialRequestById(request._id);

    res.json(populated);
  } catch (error) {
    console.error("Error updating material request status:", error);
    res.status(500).json({ message: "Failed to update material request." });
  }
};

const fulfillMaterialRequestItem = async (req, res) => {
  try {
    if (!canReviewMaterialRequests(req.user)) {
      return res.status(403).json({
        message: "Only Admin and Stores users can fulfil material requests.",
      });
    }

    const requestId = parseString(req.params.id);
    const itemId = parseString(req.params.itemId);
    if (
      !mongoose.Types.ObjectId.isValid(requestId) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      return res.status(400).json({ message: "Invalid material request item." });
    }

    const request = await MaterialRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Material request not found." });
    }
    if (request.status === "Declined") {
      return res.status(400).json({
        message: "Declined material requests cannot be fulfilled.",
      });
    }

    const lineItem =
      typeof request.items?.id === "function" ? request.items.id(itemId) : null;
    if (!lineItem) {
      return res.status(404).json({ message: "Material request item not found." });
    }
    if (lineItem.fulfillmentStatus === "Fulfilled") {
      return res.status(400).json({
        message: "This material request item has already been fulfilled.",
      });
    }

    const inventoryRecordId = toEntityId(lineItem.inventoryRecord);
    if (!mongoose.Types.ObjectId.isValid(inventoryRecordId)) {
      return res.status(400).json({
        message: "Match this request item to an inventory record before issuing stock.",
      });
    }

    const requestedQty = parsePositiveQuantity(lineItem.quantity);
    const alreadyIssuedQty = roundQuantity(Number(lineItem.fulfilledQuantity) || 0);
    const remainingBeforeIssue = requestedQty
      ? roundQuantity(Math.max(requestedQty - alreadyIssuedQty, 0))
      : null;
    if (remainingBeforeIssue !== null && remainingBeforeIssue <= 0) {
      lineItem.fulfillmentStatus = "Fulfilled";
      lineItem.remainingQuantity = 0;
      lineItem.quantityToOrder = 0;
      await request.save();
      return res.status(400).json({
        message: "This material request item has already been fully issued.",
      });
    }

    const issueQty =
      parsePositiveQuantity(
        req.body.issuedQuantity ??
          req.body.issueQuantity ??
          req.body.quantity ??
          req.body.qty,
      ) ||
      remainingBeforeIssue ||
      parsePositiveQuantity(lineItem.quantity);
    if (!issueQty) {
      return res.status(400).json({
        message:
          "This request item needs a numeric quantity before stock can be issued.",
      });
    }
    if (
      remainingBeforeIssue !== null &&
      issueQty > remainingBeforeIssue + 0.0001
    ) {
      return res.status(400).json({
        message: `This line only has ${remainingBeforeIssue} remaining to issue.`,
      });
    }

    const totalIssuedQty = roundQuantity(alreadyIssuedQty + issueQty);
    const calculatedRemainingQty = requestedQty
      ? roundQuantity(Math.max(requestedQty - totalIssuedQty, 0))
      : 0;
    const suppliedQuantityToOrder = parseNonNegativeQuantity(
      req.body.remainingToOrder ??
        req.body.quantityToOrder ??
        req.body.remainingQuantity,
    );
    const quantityToOrder =
      suppliedQuantityToOrder === null
        ? calculatedRemainingQty
        : roundQuantity(suppliedQuantityToOrder);
    if (
      requestedQty &&
      quantityToOrder > calculatedRemainingQty + 0.0001
    ) {
      return res.status(400).json({
        message:
          "The quantity remaining to order cannot be greater than the unissued balance.",
      });
    }

    const existingRecord = await InventoryRecord.findById(inventoryRecordId)
      .select("item sku qtyValue qtyLabel qtyMeta maxQty priceValue warehouse subtext shelfLocation status")
      .lean();
    if (!existingRecord) {
      return res.status(404).json({
        message: "Matched inventory record was not found.",
      });
    }

    const availableQty = Number.isFinite(existingRecord.qtyValue)
      ? existingRecord.qtyValue
      : 0;
    if (availableQty < issueQty) {
      return res.status(400).json({
        message: `Not enough stock to issue ${issueQty}. Available stock is ${availableQty}.`,
      });
    }

    const updatedInventory = await InventoryRecord.findOneAndUpdate(
      {
        _id: inventoryRecordId,
        qtyValue: { $gte: issueQty },
      },
      {
        $inc: { qtyValue: -issueQty },
        $set: { updatedBy: req.user._id },
      },
      { new: true },
    );
    if (!updatedInventory) {
      return res.status(409).json({
        message:
          "Stock changed while fulfilling this request. Refresh and try again.",
      });
    }

    const afterQty = Number.isFinite(updatedInventory.qtyValue)
      ? updatedInventory.qtyValue
      : 0;
    const beforeQty = Number((afterQty + issueQty).toFixed(4));
    const qtyLabel = formatQuantityLabel(afterQty);
    const qtyMeta = computeQtyMetaFromCapacity(afterQty, updatedInventory.maxQty);
    const inventoryMetaUpdate = {
      qtyLabel,
      qtyMeta,
      updatedBy: req.user._id,
    };
    if (Number.isFinite(updatedInventory.priceValue)) {
      const valueValue = Number((updatedInventory.priceValue * afterQty).toFixed(2));
      inventoryMetaUpdate.valueValue = valueValue;
      inventoryMetaUpdate.value = valueValue.toFixed(2);
    } else {
      inventoryMetaUpdate.valueValue = null;
      inventoryMetaUpdate.value = "";
    }
    await InventoryRecord.updateOne(
      { _id: updatedInventory._id, qtyValue: afterQty },
      { $set: inventoryMetaUpdate },
    );

    const now = new Date();
    const transaction = await StockTransaction.create({
      txid: `MR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      item: parseString(updatedInventory.item) || lineItem.materialName,
      sku: parseString(updatedInventory.sku) || parseString(lineItem.inventorySku),
      type: "Stock Out",
      qty: -Math.abs(issueQty),
      beforeQty,
      afterQty,
      source:
        parseString(updatedInventory.warehouse) ||
        parseString(updatedInventory.subtext) ||
        parseString(lineItem.inventoryWarehouse),
      destination: request.projectOrderId
        ? `Project ${request.projectOrderId}`
        : request.department,
      date: now,
      staff: getUserDisplayName(req.user),
      notes:
        parseString(req.body.note) ||
        (quantityToOrder > 0
          ? `Issued ${issueQty} for material request ${request._id}: ${lineItem.materialName}. ${quantityToOrder} remaining to order.`
          : `Issued for material request ${request._id}: ${lineItem.materialName}`),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const isFullyFulfilled = requestedQty
      ? totalIssuedQty >= requestedQty - 0.0001
      : quantityToOrder <= 0;

    lineItem.fulfillmentStatus = isFullyFulfilled
      ? "Fulfilled"
      : "Partially Fulfilled";
    lineItem.fulfilledQuantity = totalIssuedQty;
    lineItem.remainingQuantity = isFullyFulfilled ? 0 : calculatedRemainingQty;
    lineItem.quantityToOrder = isFullyFulfilled ? 0 : quantityToOrder;
    lineItem.fulfilledAt = now;
    lineItem.fulfilledBy = req.user._id;
    lineItem.fulfilledByName = getUserDisplayName(req.user);
    lineItem.fulfillmentNote = parseString(req.body.note);
    lineItem.stockTransaction = transaction._id;
    if (!Array.isArray(lineItem.stockTransactions)) {
      lineItem.stockTransactions = [];
    }
    lineItem.stockTransactions.push(transaction._id);
    lineItem.stockBeforeQty = beforeQty;
    lineItem.stockAfterQty = afterQty;

    if (toEntityId(request.inventoryRecord) === inventoryRecordId) {
      request.inventoryQtyValue = afterQty;
      request.inventoryQtyLabel = qtyLabel;
      request.inventoryStatus = parseString(updatedInventory.status);
      request.inventoryWarehouse = parseString(
        updatedInventory.warehouse || updatedInventory.subtext,
      );
      request.inventoryShelfLocation = parseString(updatedInventory.shelfLocation);
    }

    const requestItems = Array.isArray(request.items) ? request.items : [];
    const allFulfilled =
      requestItems.length > 0 &&
      requestItems.every((item) => item.fulfillmentStatus === "Fulfilled");
    const anyPartiallyFulfilled = requestItems.some(
      (item) =>
        item.fulfillmentStatus === "Partially Fulfilled" ||
        (Number(item.fulfilledQuantity) || 0) > 0,
    );
    request.status = allFulfilled
      ? "Fulfilled"
      : anyPartiallyFulfilled
        ? "Partially Fulfilled"
        : "In Review";
    request.statusNote = allFulfilled
      ? "All matched material lines issued from stock."
      : quantityToOrder > 0
        ? `${formatQuantityLabel(issueQty)} issued. ${formatQuantityLabel(
            quantityToOrder,
          )} remaining to order.`
        : "Some matched material lines have been issued from stock.";
    request.statusUpdatedBy = req.user._id;
    request.statusUpdatedAt = now;

    await request.save();

    const populated = await getPopulatedMaterialRequestById(request._id);
    res.json({
      request: populated,
      stockTransaction: transaction,
    });
  } catch (error) {
    console.error("Error fulfilling material request item:", error);
    res.status(500).json({ message: "Failed to fulfil material request item." });
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
    if (hasFulfilledRequestLine(request)) {
      return res.status(400).json({
        message:
          "This request has issued stock and cannot be deleted from the request queue.",
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
  fulfillMaterialRequestItem,
  updateMaterialRequestStatus,
  deleteMaterialRequest,
};
