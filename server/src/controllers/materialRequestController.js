const mongoose = require("mongoose");
const MaterialRequest = require("../models/MaterialRequest");

const REVIEWER_DEPARTMENTS = new Set([
  "administration",
  "stores",
  "stock",
  "packaging",
]);

const VALID_STATUSES = new Set([
  "Pending",
  "In Review",
  "Fulfilled",
  "Declined",
]);

const VALID_PRIORITIES = new Set(["Low", "Normal", "High", "Urgent"]);

const parseString = (value) => String(value ?? "").trim();

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

const readMaterialRequestPayload = (user, body = {}) => {
  const materialName = parseString(body.materialName);
  const quantity = parseString(body.quantity);
  const unit = parseString(body.unit);
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
      department,
      departmentKey,
      priority,
      neededBy,
      notes,
    },
  };
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
    const payload = readMaterialRequestPayload(req.user, req.body);
    if (payload.error) {
      return res.status(400).json({ message: payload.error });
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
      return res.status(404).json({ message: "Material request not found." });
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
  getMaterialRequests,
  createMaterialRequest,
  updateMaterialRequest,
  updateMaterialRequestStatus,
  deleteMaterialRequest,
};
