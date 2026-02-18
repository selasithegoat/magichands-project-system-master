const ClientInventoryItem = require("../models/ClientInventoryItem");
const PurchasingOrder = require("../models/PurchasingOrder");

const STORES_DEPARTMENTS = new Set(["stores", "stock", "packaging"]);

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
  if (!Number.isFinite(parsed) || parsed < min) {
    return { error: `${fieldName} must be a number greater than or equal to ${min}.` };
  }
  return { value: parsed };
};

const getClientItems = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const records = await ClientInventoryItem.find({})
      .sort({ dateReceived: -1, createdAt: -1 })
      .populate("createdBy", "firstName lastName employeeId")
      .populate("updatedBy", "firstName lastName employeeId");

    res.json(records);
  } catch (error) {
    console.error("Error fetching client inventory items:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createClientItem = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const orderNo = String(req.body.orderNo || "").trim();
    const jobLead = String(req.body.jobLead || "").trim();
    const itemDescription = String(req.body.itemDescription || "").trim();
    const production = String(req.body.production || "").trim();

    if (!orderNo) {
      return res.status(400).json({ message: "orderNo is required." });
    }

    if (!itemDescription) {
      return res.status(400).json({ message: "itemDescription is required." });
    }

    const quantityResult = parseNumberValue(req.body.quantity, "quantity", {
      required: true,
      min: 1,
    });
    if (quantityResult.error) {
      return res.status(400).json({ message: quantityResult.error });
    }

    const dateReceivedResult = parseDateValue(req.body.dateReceived, "dateReceived", {
      required: true,
    });
    if (dateReceivedResult.error) {
      return res.status(400).json({ message: dateReceivedResult.error });
    }

    const deliveryResult = parseDateValue(
      req.body.deliveryDateTime,
      "deliveryDateTime",
    );
    if (deliveryResult.error) {
      return res.status(400).json({ message: deliveryResult.error });
    }

    const record = await ClientInventoryItem.create({
      orderNo,
      jobLead,
      dateReceived: dateReceivedResult.value,
      itemDescription,
      quantity: quantityResult.value,
      production,
      deliveryDateTime: deliveryResult.value,
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

    if (Object.prototype.hasOwnProperty.call(req.body, "orderNo")) {
      const orderNo = String(req.body.orderNo || "").trim();
      if (!orderNo) {
        return res.status(400).json({ message: "orderNo cannot be empty." });
      }
      record.orderNo = orderNo;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "jobLead")) {
      record.jobLead = String(req.body.jobLead || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "itemDescription")) {
      const itemDescription = String(req.body.itemDescription || "").trim();
      if (!itemDescription) {
        return res
          .status(400)
          .json({ message: "itemDescription cannot be empty." });
      }
      record.itemDescription = itemDescription;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "production")) {
      record.production = String(req.body.production || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "quantity")) {
      const quantityResult = parseNumberValue(req.body.quantity, "quantity", {
        required: true,
        min: 1,
      });
      if (quantityResult.error) {
        return res.status(400).json({ message: quantityResult.error });
      }
      record.quantity = quantityResult.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "dateReceived")) {
      const dateReceivedResult = parseDateValue(req.body.dateReceived, "dateReceived", {
        required: true,
      });
      if (dateReceivedResult.error) {
        return res.status(400).json({ message: dateReceivedResult.error });
      }
      record.dateReceived = dateReceivedResult.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "deliveryDateTime")) {
      const deliveryResult = parseDateValue(
        req.body.deliveryDateTime,
        "deliveryDateTime",
      );
      if (deliveryResult.error) {
        return res.status(400).json({ message: deliveryResult.error });
      }
      record.deliveryDateTime = deliveryResult.value;
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
    const records = await PurchasingOrder.find({})
      .sort({ dateRequestPlaced: -1, createdAt: -1 })
      .populate("createdBy", "firstName lastName employeeId")
      .populate("updatedBy", "firstName lastName employeeId");

    res.json(records);
  } catch (error) {
    console.error("Error fetching purchasing orders:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createPurchasingOrder = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const orderNo = String(req.body.orderNo || "").trim();
    const dept = String(req.body.dept || "").trim();
    const description = String(req.body.description || "").trim();
    const requestStatus = String(req.body.requestStatus || "").trim();
    const receivedBy = String(req.body.receivedBy || "").trim();

    if (!orderNo) {
      return res.status(400).json({ message: "orderNo is required." });
    }
    if (!dept) {
      return res.status(400).json({ message: "dept is required." });
    }
    if (!description) {
      return res.status(400).json({ message: "description is required." });
    }
    if (!requestStatus) {
      return res.status(400).json({ message: "requestStatus is required." });
    }

    const qtyResult = parseNumberValue(req.body.qty, "qty", {
      required: true,
      min: 1,
    });
    if (qtyResult.error) {
      return res.status(400).json({ message: qtyResult.error });
    }

    const qtyReceivedResult = parseNumberValue(
      req.body.qtyReceivedBrought,
      "qtyReceivedBrought",
      {
        min: 0,
      },
    );
    if (qtyReceivedResult.error) {
      return res.status(400).json({ message: qtyReceivedResult.error });
    }

    const dateRequestPlacedResult = parseDateValue(
      req.body.dateRequestPlaced,
      "dateRequestPlaced",
      { required: true },
    );
    if (dateRequestPlacedResult.error) {
      return res.status(400).json({ message: dateRequestPlacedResult.error });
    }

    const dateItemReceivedResult = parseDateValue(
      req.body.dateItemReceived,
      "dateItemReceived",
    );
    if (dateItemReceivedResult.error) {
      return res.status(400).json({ message: dateItemReceivedResult.error });
    }

    const record = await PurchasingOrder.create({
      orderNo,
      dept,
      description,
      qty: qtyResult.value,
      requestStatus,
      qtyReceivedBrought: qtyReceivedResult.value,
      dateItemReceived: dateItemReceivedResult.value,
      receivedBy,
      dateRequestPlaced: dateRequestPlacedResult.value,
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

    if (Object.prototype.hasOwnProperty.call(req.body, "orderNo")) {
      const orderNo = String(req.body.orderNo || "").trim();
      if (!orderNo) {
        return res.status(400).json({ message: "orderNo cannot be empty." });
      }
      record.orderNo = orderNo;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "dept")) {
      const dept = String(req.body.dept || "").trim();
      if (!dept) {
        return res.status(400).json({ message: "dept cannot be empty." });
      }
      record.dept = dept;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
      const description = String(req.body.description || "").trim();
      if (!description) {
        return res.status(400).json({ message: "description cannot be empty." });
      }
      record.description = description;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "requestStatus")) {
      const requestStatus = String(req.body.requestStatus || "").trim();
      if (!requestStatus) {
        return res.status(400).json({ message: "requestStatus cannot be empty." });
      }
      record.requestStatus = requestStatus;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "receivedBy")) {
      record.receivedBy = String(req.body.receivedBy || "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "qty")) {
      const qtyResult = parseNumberValue(req.body.qty, "qty", {
        required: true,
        min: 1,
      });
      if (qtyResult.error) {
        return res.status(400).json({ message: qtyResult.error });
      }
      record.qty = qtyResult.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "qtyReceivedBrought")) {
      const qtyReceivedResult = parseNumberValue(
        req.body.qtyReceivedBrought,
        "qtyReceivedBrought",
        { min: 0 },
      );
      if (qtyReceivedResult.error) {
        return res.status(400).json({ message: qtyReceivedResult.error });
      }
      record.qtyReceivedBrought = qtyReceivedResult.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "dateRequestPlaced")) {
      const dateRequestPlacedResult = parseDateValue(
        req.body.dateRequestPlaced,
        "dateRequestPlaced",
        { required: true },
      );
      if (dateRequestPlacedResult.error) {
        return res.status(400).json({ message: dateRequestPlacedResult.error });
      }
      record.dateRequestPlaced = dateRequestPlacedResult.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "dateItemReceived")) {
      const dateItemReceivedResult = parseDateValue(
        req.body.dateItemReceived,
        "dateItemReceived",
      );
      if (dateItemReceivedResult.error) {
        return res.status(400).json({ message: dateItemReceivedResult.error });
      }
      record.dateItemReceived = dateItemReceivedResult.value;
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

module.exports = {
  getClientItems,
  createClientItem,
  updateClientItem,
  deleteClientItem,
  getPurchasingOrders,
  createPurchasingOrder,
  updatePurchasingOrder,
  deletePurchasingOrder,
};
