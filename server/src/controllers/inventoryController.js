const ClientInventoryItem = require("../models/ClientInventoryItem");
const PurchasingOrder = require("../models/PurchasingOrder");
const Supplier = require("../models/Supplier");
const InventoryRecord = require("../models/InventoryRecord");
const StockTransaction = require("../models/StockTransaction");
const InventoryReport = require("../models/InventoryReport");
const InventorySettings = require("../models/InventorySettings");

const STORES_DEPARTMENTS = new Set(["stores", "front desk"]);

const normalizeDepartments = (departments) => {
  if (Array.isArray(departments)) return departments;
  if (departments) return [departments];
  return [];
};

const canAccessInventory = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const userDepartments = normalizeDepartments(user.department).map((dept) =>
    String(dept).trim().toLowerCase(),
  );
  return userDepartments.some((dept) => STORES_DEPARTMENTS.has(dept));
};

const ensureInventoryAccess = (req, res) => {
  if (!canAccessInventory(req.user)) {
    res
      .status(403)
      .json({ message: "Not authorized to access inventory records." });
    return false;
  }
  return true;
};

const parseStringValue = (value) => String(value || "").trim();

const parseDateValue = (value, fieldName, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      return { error: `${fieldName} is required.` };
    }
    return { value: null };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: `${fieldName} must be a valid date.` };
  }
  return { value: parsed };
};

const parseNumberValue = (
  value,
  fieldName,
  { required = false, min = 0 } = {},
) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      return { error: `${fieldName} is required.` };
    }
    return { value: null };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { error: `${fieldName} must be a valid number.` };
  }
  if (Number.isFinite(min) && parsed < min) {
    return {
      error: `${fieldName} must be a number greater than or equal to ${min}.`,
    };
  }
  return { value: parsed };
};

const parseOptionalDate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseBooleanValue = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return defaultValue;
};

const buildInitials = (value) => {
  const words = parseStringValue(value).split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    name: parseStringValue(item?.name),
    image: parseStringValue(item?.image),
    qty: Number.isFinite(Number(item?.qty)) ? Number(item.qty) : 0,
  }));
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const parsePaginationParams = (
  req,
  { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {},
) => {
  const pageRaw = req?.query?.page;
  const limitRaw = req?.query?.limit;

  let page = 1;
  let limit = defaultLimit;

  if (pageRaw !== undefined) {
    const parsedPage = Number.parseInt(pageRaw, 10);
    if (!Number.isFinite(parsedPage) || parsedPage < 1) {
      return { error: "page must be a positive integer." };
    }
    page = parsedPage;
  }

  if (limitRaw !== undefined) {
    const parsedLimit = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      return { error: "limit must be a positive integer." };
    }
    if (parsedLimit > maxLimit) {
      return { error: `limit must be ${maxLimit} or less.` };
    }
    limit = parsedLimit;
  }

  return { page, limit, skip: (page - 1) * limit };
};

const parseSortParam = (req, allowedFields, fallbackSort) => {
  const raw = parseStringValue(req?.query?.sort);
  if (!raw) return { sort: fallbackSort };

  const direction = raw.startsWith("-") ? -1 : 1;
  const field = raw.replace(/^-/, "");
  if (!allowedFields.includes(field)) {
    return {
      error: `sort must be one of: ${allowedFields.join(", ")}`,
    };
  }

  return { sort: { [field]: direction } };
};

const buildPagedResponse = ({ data, total, page, limit }) => ({
  data,
  total,
  page,
  limit,
  totalPages: limit ? Math.ceil(total / limit) : 0,
});

const buildSearchRegex = (value) => {
  const term = parseStringValue(value);
  if (!term) return null;
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

const getClientItems = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const pagination = parsePaginationParams(req);
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const sortResult = parseSortParam(
      req,
      ["receivedAt", "createdAt", "clientName", "itemName", "status", "warehouse"],
      { receivedAt: -1, createdAt: -1 },
    );
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const status = parseStringValue(req.query.status);
    const warehouse = parseStringValue(req.query.warehouse);
    const search = buildSearchRegex(req.query.search);

    if (status) filter.status = status;
    if (warehouse) filter.warehouse = warehouse;
    if (search) {
      filter.$or = [
        { clientName: search },
        { clientPhone: search },
        { itemName: search },
        { serialNumber: search },
      ];
    }

    const [records, total] = await Promise.all([
      ClientInventoryItem.find(filter)
        .sort(sortResult.sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate("createdBy", "firstName lastName employeeId")
        .populate("updatedBy", "firstName lastName employeeId"),
      ClientInventoryItem.countDocuments(filter),
    ]);

    res.json(
      buildPagedResponse({
        data: records,
        total,
        page: pagination.page,
        limit: pagination.limit,
      }),
    );
  } catch (error) {
    console.error("Error fetching client inventory items:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createClientItem = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const clientName = parseStringValue(req.body.clientName || req.body.client);
    const clientPhone = parseStringValue(
      req.body.clientPhone || req.body.phone,
    );
    const itemName = parseStringValue(req.body.itemName || req.body.item);
    const serialNumber = parseStringValue(
      req.body.serialNumber || req.body.serial,
    );
    const warehouse = parseStringValue(req.body.warehouse);
    const status = parseStringValue(req.body.status) || "Received";
    const notes = parseStringValue(req.body.notes);
    const receivedAtResult = parseDateValue(
      req.body.receivedAt || req.body.received || req.body.dateReceived,
      "receivedAt",
      { required: true },
    );

    if (!clientName) {
      return res.status(400).json({ message: "clientName is required." });
    }
    if (!itemName) {
      return res.status(400).json({ message: "itemName is required." });
    }
    if (receivedAtResult.error) {
      return res.status(400).json({ message: receivedAtResult.error });
    }

    const quantityResult = parseNumberValue(req.body.quantity, "quantity", {
      min: 0,
    });
    if (quantityResult.error) {
      return res.status(400).json({ message: quantityResult.error });
    }

    const record = await ClientInventoryItem.create({
      clientName,
      clientPhone,
      itemName,
      serialNumber,
      receivedAt: receivedAtResult.value,
      warehouse,
      status,
      notes,
      orderNo: parseStringValue(req.body.orderNo),
      jobLead: parseStringValue(req.body.jobLead),
      dateReceived: receivedAtResult.value,
      itemDescription: parseStringValue(req.body.itemDescription),
      quantity: quantityResult.value ?? 0,
      production: parseStringValue(req.body.production),
      deliveryDateTime: parseOptionalDate(req.body.deliveryDateTime),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populated = await ClientInventoryItem.findById(record._id)
      .populate("createdBy", "firstName lastName employeeId")
      .populate("updatedBy", "firstName lastName employeeId");

    res.status(201).json(populated);
  } catch (error) {
    console.error("Error creating client inventory item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateClientItem = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const record = await ClientInventoryItem.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Client inventory item not found." });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "clientName")) {
      const clientName = parseStringValue(req.body.clientName);
      if (!clientName) {
        return res.status(400).json({ message: "clientName cannot be empty." });
      }
      record.clientName = clientName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "clientPhone")) {
      record.clientPhone = parseStringValue(req.body.clientPhone);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "itemName")) {
      const itemName = parseStringValue(req.body.itemName);
      if (!itemName) {
        return res.status(400).json({ message: "itemName cannot be empty." });
      }
      record.itemName = itemName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "serialNumber")) {
      record.serialNumber = parseStringValue(req.body.serialNumber);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "receivedAt")) {
      const receivedAtResult = parseDateValue(
        req.body.receivedAt,
        "receivedAt",
        { required: true },
      );
      if (receivedAtResult.error) {
        return res.status(400).json({ message: receivedAtResult.error });
      }
      record.receivedAt = receivedAtResult.value;
      record.dateReceived = receivedAtResult.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "warehouse")) {
      record.warehouse = parseStringValue(req.body.warehouse);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
      record.status = parseStringValue(req.body.status);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
      record.notes = parseStringValue(req.body.notes);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "quantity")) {
      const quantityResult = parseNumberValue(req.body.quantity, "quantity", {
        min: 0,
      });
      if (quantityResult.error) {
        return res.status(400).json({ message: quantityResult.error });
      }
      record.quantity = quantityResult.value ?? 0;
    }

    record.updatedBy = req.user._id;
    await record.save();

    const populated = await ClientInventoryItem.findById(record._id)
      .populate("createdBy", "firstName lastName employeeId")
      .populate("updatedBy", "firstName lastName employeeId");

    res.json(populated);
  } catch (error) {
    console.error("Error updating client inventory item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteClientItem = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const deleted = await ClientInventoryItem.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Client inventory item not found." });
    }
    res.json({ message: "Client inventory item deleted successfully." });
  } catch (error) {
    console.error("Error deleting client inventory item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getPurchasingOrders = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const pagination = parsePaginationParams(req);
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const sortResult = parseSortParam(
      req,
      ["dateRequestPlaced", "createdAt", "supplierName", "status", "poNumber"],
      { dateRequestPlaced: -1, createdAt: -1 },
    );
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const status = parseStringValue(req.query.status);
    const supplier = parseStringValue(req.query.supplier);
    const search = buildSearchRegex(req.query.search);

    if (status) filter.status = status;
    if (supplier) filter.supplierName = supplier;
    if (search) {
      filter.$or = [
        { supplierName: search },
        { poNumber: search },
        { description: search },
      ];
    }

    const [records, total] = await Promise.all([
      PurchasingOrder.find(filter)
        .sort(sortResult.sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate("createdBy", "firstName lastName employeeId")
        .populate("updatedBy", "firstName lastName employeeId"),
      PurchasingOrder.countDocuments(filter),
    ]);

    res.json(
      buildPagedResponse({
        data: records,
        total,
        page: pagination.page,
        limit: pagination.limit,
      }),
    );
  } catch (error) {
    console.error("Error fetching purchasing orders:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createPurchasingOrder = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const poNumber =
      parseStringValue(req.body.poNumber) ||
      parseStringValue(req.body.orderNo) ||
      parseStringValue(req.body.id);
    const supplierName =
      parseStringValue(req.body.supplierName) ||
      parseStringValue(req.body.supplier);
    const supplierInitials =
      parseStringValue(req.body.supplierInitials) || buildInitials(supplierName);
    const supplierTone = parseStringValue(req.body.supplierTone);
    const total = parseStringValue(req.body.total);
    const status =
      parseStringValue(req.body.status) ||
      parseStringValue(req.body.requestStatus) ||
      "Pending";
    const items = normalizeItems(req.body.items);
    const itemsCountValue =
      Number.isFinite(Number(req.body.itemsCount))
        ? Number(req.body.itemsCount)
        : items.length;
    const dateRequestPlaced =
      parseOptionalDate(req.body.dateRequestPlaced) ||
      parseOptionalDate(req.body.createdAt) ||
      parseOptionalDate(req.body.created) ||
      new Date();

    if (!poNumber) {
      return res.status(400).json({ message: "poNumber is required." });
    }
    if (!supplierName) {
      return res.status(400).json({ message: "supplierName is required." });
    }
    if (!total) {
      return res.status(400).json({ message: "total is required." });
    }

    const qtyResult = parseNumberValue(req.body.qty, "qty", { min: 0 });
    if (qtyResult.error) {
      return res.status(400).json({ message: qtyResult.error });
    }

    const record = await PurchasingOrder.create({
      poNumber,
      supplierName,
      supplierInitials,
      supplierTone,
      items,
      itemsCount: itemsCountValue,
      total,
      status,
      dateRequestPlaced,
      dept: parseStringValue(req.body.dept),
      description: parseStringValue(req.body.description),
      qty: qtyResult.value ?? 0,
      requestStatus: parseStringValue(req.body.requestStatus) || status,
      qtyReceivedBrought: Number.isFinite(Number(req.body.qtyReceivedBrought))
        ? Number(req.body.qtyReceivedBrought)
        : null,
      dateItemReceived: parseOptionalDate(req.body.dateItemReceived),
      receivedBy: parseStringValue(req.body.receivedBy),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const populated = await PurchasingOrder.findById(record._id)
      .populate("createdBy", "firstName lastName employeeId")
      .populate("updatedBy", "firstName lastName employeeId");

    res.status(201).json(populated);
  } catch (error) {
    console.error("Error creating purchasing order:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updatePurchasingOrder = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const record = await PurchasingOrder.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Purchasing order not found." });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "poNumber")) {
      const poNumber = parseStringValue(req.body.poNumber);
      if (!poNumber) {
        return res.status(400).json({ message: "poNumber cannot be empty." });
      }
      record.poNumber = poNumber;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "supplierName")) {
      const supplierName = parseStringValue(req.body.supplierName);
      if (!supplierName) {
        return res
          .status(400)
          .json({ message: "supplierName cannot be empty." });
      }
      record.supplierName = supplierName;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "supplierInitials")) {
      record.supplierInitials = parseStringValue(req.body.supplierInitials);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "supplierTone")) {
      record.supplierTone = parseStringValue(req.body.supplierTone);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "items")) {
      const items = normalizeItems(req.body.items);
      record.items = items;
      record.itemsCount = items.length;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "itemsCount")) {
      const itemsCountResult = parseNumberValue(
        req.body.itemsCount,
        "itemsCount",
        { min: 0 },
      );
      if (itemsCountResult.error) {
        return res.status(400).json({ message: itemsCountResult.error });
      }
      record.itemsCount = itemsCountResult.value ?? 0;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "total")) {
      const total = parseStringValue(req.body.total);
      if (!total) {
        return res.status(400).json({ message: "total cannot be empty." });
      }
      record.total = total;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
      record.status = parseStringValue(req.body.status);
      if (!record.requestStatus) {
        record.requestStatus = record.status;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "requestStatus")) {
      record.requestStatus = parseStringValue(req.body.requestStatus);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "dateRequestPlaced")) {
      const dateResult = parseDateValue(
        req.body.dateRequestPlaced,
        "dateRequestPlaced",
        { required: true },
      );
      if (dateResult.error) {
        return res.status(400).json({ message: dateResult.error });
      }
      record.dateRequestPlaced = dateResult.value;
    }

    record.updatedBy = req.user._id;
    await record.save();

    const populated = await PurchasingOrder.findById(record._id)
      .populate("createdBy", "firstName lastName employeeId")
      .populate("updatedBy", "firstName lastName employeeId");

    res.json(populated);
  } catch (error) {
    console.error("Error updating purchasing order:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deletePurchasingOrder = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const deleted = await PurchasingOrder.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Purchasing order not found." });
    }
    res.json({ message: "Purchasing order deleted successfully." });
  } catch (error) {
    console.error("Error deleting purchasing order:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getSuppliers = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const pagination = parsePaginationParams(req);
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const sortResult = parseSortParam(
      req,
      ["createdAt", "name", "code"],
      { createdAt: -1 },
    );
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const search = buildSearchRegex(req.query.search);
    if (search) {
      filter.$or = [
        { name: search },
        { contactPerson: search },
        { email: search },
        { phone: search },
      ];
    }

    const [records, total] = await Promise.all([
      Supplier.find(filter)
        .sort(sortResult.sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate("createdBy", "firstName lastName employeeId")
        .populate("updatedBy", "firstName lastName employeeId"),
      Supplier.countDocuments(filter),
    ]);

    res.json(
      buildPagedResponse({
        data: records,
        total,
        page: pagination.page,
        limit: pagination.limit,
      }),
    );
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createSupplier = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const name = parseStringValue(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "name is required." });
    }

    const record = await Supplier.create({
      code: parseStringValue(req.body.code),
      name,
      contactPerson: parseStringValue(req.body.contactPerson),
      role: parseStringValue(req.body.role),
      phone: parseStringValue(req.body.phone),
      email: parseStringValue(req.body.email),
      products: Array.isArray(req.body.products) ? req.body.products : [],
      openPO: req.body.openPO || {},
      tone: parseStringValue(req.body.tone),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json(record);
  } catch (error) {
    console.error("Error creating supplier:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateSupplier = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const record = await Supplier.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Supplier not found." });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "code")) {
      record.code = parseStringValue(req.body.code);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const name = parseStringValue(req.body.name);
      if (!name) {
        return res.status(400).json({ message: "name cannot be empty." });
      }
      record.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "contactPerson")) {
      record.contactPerson = parseStringValue(req.body.contactPerson);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
      record.role = parseStringValue(req.body.role);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "phone")) {
      record.phone = parseStringValue(req.body.phone);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "email")) {
      record.email = parseStringValue(req.body.email);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "products")) {
      record.products = Array.isArray(req.body.products)
        ? req.body.products
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "openPO")) {
      record.openPO = req.body.openPO || {};
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "tone")) {
      record.tone = parseStringValue(req.body.tone);
    }

    record.updatedBy = req.user._id;
    await record.save();
    res.json(record);
  } catch (error) {
    console.error("Error updating supplier:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteSupplier = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const deleted = await Supplier.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Supplier not found." });
    }
    res.json({ message: "Supplier deleted successfully." });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getInventoryRecords = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const pagination = parsePaginationParams(req);
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const sortResult = parseSortParam(
      req,
      ["createdAt", "item", "sku", "category", "status"],
      { createdAt: -1 },
    );
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const status = parseStringValue(req.query.status);
    const category = parseStringValue(req.query.category);
    const search = buildSearchRegex(req.query.search);

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [{ item: search }, { sku: search }, { location: search }];
    }

    const [records, total] = await Promise.all([
      InventoryRecord.find(filter)
        .sort(sortResult.sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate("createdBy", "firstName lastName employeeId")
        .populate("updatedBy", "firstName lastName employeeId"),
      InventoryRecord.countDocuments(filter),
    ]);

    res.json(
      buildPagedResponse({
        data: records,
        total,
        page: pagination.page,
        limit: pagination.limit,
      }),
    );
  } catch (error) {
    console.error("Error fetching inventory records:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createInventoryRecord = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const item = parseStringValue(req.body.item);
    const sku = parseStringValue(req.body.sku);
    if (!item) {
      return res.status(400).json({ message: "item is required." });
    }
    if (!sku) {
      return res.status(400).json({ message: "sku is required." });
    }

    const record = await InventoryRecord.create({
      item,
      subtext: parseStringValue(req.body.subtext),
      sku,
      category: parseStringValue(req.body.category),
      categoryTone: parseStringValue(req.body.categoryTone),
      qtyLabel: parseStringValue(req.body.qtyLabel),
      qtyMeta: parseStringValue(req.body.qtyMeta),
      qtyState: parseStringValue(req.body.qtyState),
      qtyFill: parseStringValue(req.body.qtyFill),
      price: parseStringValue(req.body.price),
      value: parseStringValue(req.body.value),
      location: parseStringValue(req.body.location),
      status: parseStringValue(req.body.status),
      statusTone: parseStringValue(req.body.statusTone),
      reorder: parseBooleanValue(req.body.reorder, false),
      image: parseStringValue(req.body.image),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json(record);
  } catch (error) {
    console.error("Error creating inventory record:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateInventoryRecord = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const record = await InventoryRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Inventory record not found." });
    }

    const updatableFields = [
      "item",
      "subtext",
      "sku",
      "category",
      "categoryTone",
      "qtyLabel",
      "qtyMeta",
      "qtyState",
      "qtyFill",
      "price",
      "value",
      "location",
      "status",
      "statusTone",
      "image",
    ];

    updatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        record[field] = parseStringValue(req.body[field]);
      }
    });

    if (Object.prototype.hasOwnProperty.call(req.body, "reorder")) {
      record.reorder = parseBooleanValue(req.body.reorder, record.reorder);
    }

    record.updatedBy = req.user._id;
    await record.save();
    res.json(record);
  } catch (error) {
    console.error("Error updating inventory record:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteInventoryRecord = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const deleted = await InventoryRecord.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Inventory record not found." });
    }
    res.json({ message: "Inventory record deleted successfully." });
  } catch (error) {
    console.error("Error deleting inventory record:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getStockTransactions = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const pagination = parsePaginationParams(req);
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const sortResult = parseSortParam(
      req,
      ["date", "createdAt", "item", "type", "staff"],
      { date: -1, createdAt: -1 },
    );
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const type = parseStringValue(req.query.type);
    const search = buildSearchRegex(req.query.search);

    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { item: search },
        { sku: search },
        { staff: search },
        { source: search },
        { destination: search },
      ];
    }

    const [records, total] = await Promise.all([
      StockTransaction.find(filter)
        .sort(sortResult.sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate("createdBy", "firstName lastName employeeId")
        .populate("updatedBy", "firstName lastName employeeId"),
      StockTransaction.countDocuments(filter),
    ]);

    res.json(
      buildPagedResponse({
        data: records,
        total,
        page: pagination.page,
        limit: pagination.limit,
      }),
    );
  } catch (error) {
    console.error("Error fetching stock transactions:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createStockTransaction = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const item = parseStringValue(req.body.item);
    const type = parseStringValue(req.body.type);
    const qtyResult = parseNumberValue(req.body.qty, "qty", {
      required: true,
      min: null,
    });

    if (!item) {
      return res.status(400).json({ message: "item is required." });
    }
    if (!type) {
      return res.status(400).json({ message: "type is required." });
    }
    if (qtyResult.error) {
      return res.status(400).json({ message: qtyResult.error });
    }

    const txid =
      parseStringValue(req.body.txid) ||
      `TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const date =
      parseOptionalDate(req.body.date) ||
      parseOptionalDate(req.body.createdAt) ||
      new Date();

    const record = await StockTransaction.create({
      txid,
      item,
      sku: parseStringValue(req.body.sku),
      type,
      qty: qtyResult.value,
      source: parseStringValue(req.body.source),
      destination: parseStringValue(req.body.destination),
      date,
      staff: parseStringValue(req.body.staff),
      notes: parseStringValue(req.body.notes),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json(record);
  } catch (error) {
    console.error("Error creating stock transaction:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getReports = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const pagination = parsePaginationParams(req);
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const sortResult = parseSortParam(
      req,
      ["createdAt", "name", "status"],
      { createdAt: -1 },
    );
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const status = parseStringValue(req.query.status);
    const search = buildSearchRegex(req.query.search);

    if (status) filter.status = status;
    if (search) {
      filter.$or = [{ name: search }, { generatedBy: search }];
    }

    const [records, total] = await Promise.all([
      InventoryReport.find(filter)
        .sort(sortResult.sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate("createdBy", "firstName lastName employeeId"),
      InventoryReport.countDocuments(filter),
    ]);

    res.json(
      buildPagedResponse({
        data: records,
        total,
        page: pagination.page,
        limit: pagination.limit,
      }),
    );
  } catch (error) {
    console.error("Error fetching inventory reports:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createReport = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const name = parseStringValue(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "name is required." });
    }

    const report = await InventoryReport.create({
      name,
      createdAtOverride: parseOptionalDate(req.body.createdAt),
      generatedBy: parseStringValue(req.body.generatedBy),
      status: parseStringValue(req.body.status) || "Ready",
      downloads: Array.isArray(req.body.downloads)
        ? req.body.downloads
        : ["PDF", "CSV", "EXCEL"],
      createdBy: req.user._id,
    });

    res.status(201).json(report);
  } catch (error) {
    console.error("Error creating inventory report:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteReport = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const deleted = await InventoryReport.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Report not found." });
    }
    res.json({ message: "Report deleted successfully." });
  } catch (error) {
    console.error("Error deleting inventory report:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getInventorySettings = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    let settings = await InventorySettings.findOne({});
    if (!settings) {
      settings = await InventorySettings.create({});
    }
    res.json(settings);
  } catch (error) {
    console.error("Error fetching inventory settings:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateInventorySettings = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    let settings = await InventorySettings.findOne({});
    if (!settings) {
      settings = await InventorySettings.create({});
    }

    const updatableFields = [
      "organizationName",
      "primaryContactEmail",
      "currency",
      "currencyRate",
      "timezone",
      "dateFormat",
      "numberFormat",
      "notifyLowStock",
      "notifyPurchaseOrders",
      "notifyWeeklySummary",
      "defaultWarehouse",
      "lowStockThreshold",
      "unitOfMeasure",
      "autoReorder",
      "theme",
      "tableDensity",
      "defaultExportFormat",
      "posErpConnection",
      "dataRetention",
      "auditLogAccess",
    ];

    updatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (
          field === "notifyLowStock" ||
          field === "notifyPurchaseOrders" ||
          field === "notifyWeeklySummary" ||
          field === "autoReorder"
        ) {
          settings[field] = parseBooleanValue(req.body[field], settings[field]);
        } else if (field === "lowStockThreshold") {
          const parsed = Number(req.body[field]);
          settings[field] = Number.isFinite(parsed) ? parsed : settings[field];
        } else if (field === "currencyRate") {
          const parsed = Number(req.body[field]);
          settings[field] =
            Number.isFinite(parsed) && parsed > 0 ? parsed : settings[field];
        } else {
          settings[field] = parseStringValue(req.body[field]);
        }
      }
    });

    settings.updatedBy = req.user._id;
    await settings.save();
    res.json(settings);
  } catch (error) {
    console.error("Error updating inventory settings:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getClientItems,
  createClientItem,
  updateClientItem,
  deleteClientItem,
  getPurchasingOrders,
  createPurchasingOrder,
  updatePurchasingOrder,
  deletePurchasingOrder,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getInventoryRecords,
  createInventoryRecord,
  updateInventoryRecord,
  deleteInventoryRecord,
  getStockTransactions,
  createStockTransaction,
  getReports,
  createReport,
  deleteReport,
  getInventorySettings,
  updateInventorySettings,
};
