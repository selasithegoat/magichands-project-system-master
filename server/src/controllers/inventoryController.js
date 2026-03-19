const ClientInventoryItem = require("../models/ClientInventoryItem");
const PurchasingOrder = require("../models/PurchasingOrder");
const Supplier = require("../models/Supplier");
const InventoryCategory = require("../models/InventoryCategory");
const InventoryRecord = require("../models/InventoryRecord");
const InventoryItemIdentity = require("../models/InventoryItemIdentity");
const StockTransaction = require("../models/StockTransaction");
const InventoryReport = require("../models/InventoryReport");
const InventorySettings = require("../models/InventorySettings");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { createNotification } = require("../utils/notificationService");

const STORES_DEPARTMENTS = new Set(["stores", "front desk"]);
const INVENTORY_NOTIFICATION_DEPARTMENTS = ["Front Desk", "Stores"];

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

const getInventoryNotificationRecipients = async () => {
  const candidates = await User.find({
    $or: [
      { role: "admin" },
      { department: { $in: INVENTORY_NOTIFICATION_DEPARTMENTS } },
    ],
  }).select("_id role department");

  return candidates
    .filter((user) => canAccessInventory(user))
    .map((user) => user._id);
};

const notifyInventoryUsers = async (senderId, { type, title, message }) => {
  if (!senderId || !title || !message) return;
  const recipients = await getInventoryNotificationRecipients();
  if (!recipients.length) return;

  await Promise.allSettled(
    recipients.map((recipientId) =>
      createNotification(recipientId, senderId, null, type, title, message, {
        source: "inventory",
      }),
    ),
  );
};

const getActorLabel = (user) => {
  const name = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (name) return name;
  const employeeId = parseStringValue(user?.employeeId);
  if (employeeId) return employeeId;
  return "A team member";
};

const addActorToMessage = (message, user) => {
  const actor = getActorLabel(user);
  let base = String(message || "").trim();
  if (base.endsWith(".")) {
    base = base.slice(0, -1).trim();
  }
  if (!base) return `By ${actor}`;
  return `${base} (by ${actor})`;
};

const notifyInventoryUsersWithActor = async (user, payload) => {
  const senderId = user?._id;
  if (!senderId) return;
  const message = addActorToMessage(payload?.message, user);
  await notifyInventoryUsers(senderId, { ...payload, message });
};

const getInventorySettingsSnapshot = async () => {
  try {
    const settings = await InventorySettings.findOne({}).lean();
    return settings || {};
  } catch (error) {
    console.error("Error loading inventory settings:", error);
    return {};
  }
};

const formatQtyForMessage = (value, unitLabel) => {
  if (!Number.isFinite(value)) return "unknown";
  const normalized = Number.isInteger(value) ? value : Number(value.toFixed(2));
  const formatted = normalized.toLocaleString("en-US");
  return `${formatted} ${unitLabel}`;
};

const computeQtyPercent = (qtyValue, maxQty, qtyMeta) => {
  if (Number.isFinite(qtyValue) && Number.isFinite(maxQty) && maxQty > 0) {
    return (qtyValue / maxQty) * 100;
  }
  const parsedMeta = parsePercentValue(qtyMeta);
  return Number.isFinite(parsedMeta) ? parsedMeta : null;
};

const formatPercentLabel = (value) => {
  if (!Number.isFinite(value)) return "unknown";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}%`;
};

const shouldNotifyLowStock = (record, previousQtyValue, settings) => {
  const notifyLowStock = settings?.notifyLowStock !== false;
  if (!notifyLowStock) return false;
  const thresholdRaw = parsePercentValue(settings?.lowStockThreshold);
  const threshold = clampPercentValue(
    Number.isFinite(thresholdRaw) ? thresholdRaw : 18,
  );
  const percent = computeQtyPercent(
    record?.qtyValue,
    record?.maxQty,
    record?.qtyMeta,
  );
  if (!Number.isFinite(percent)) return false;
  const isLow = percent <= threshold;
  if (!isLow) return false;
  if (!Number.isFinite(previousQtyValue)) return true;
  const previousPercent = computeQtyPercent(
    previousQtyValue,
    record?.maxQty,
    record?.qtyMeta,
  );
  if (!Number.isFinite(previousPercent)) return true;
  return previousPercent > threshold;
};

const parseStringValue = (value) => String(value ?? "").trim();
const normalizeKey = (value) => parseStringValue(value).toLowerCase();
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildExactMatchRegex = (value) => {
  const trimmed = parseStringValue(value);
  if (!trimmed) return null;
  return new RegExp(`^${escapeRegex(trimmed)}$`, "i");
};
const isDuplicateKeyError = (error) =>
  Boolean(error && (error.code === 11000 || error.name === "MongoServerError"));

const formatOpenPOStatusLabel = (status) => {
  const raw = parseStringValue(status);
  if (!raw) return "";
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const parsePercentValue = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const clampPercentValue = (value) => {
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
};

const parseListParam = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => parseStringValue(entry)).filter(Boolean);
  }
  const normalized = parseStringValue(value);
  if (!normalized) return [];
  return normalized
    .split(",")
    .map((entry) => parseStringValue(entry))
    .filter(Boolean);
};

const parseCurrencyNumber = (value) => {
  const raw = parseStringValue(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.,-]/g, "");
  const numeric = Number.parseFloat(cleaned.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const ensureInventoryCategory = async (name, userId) => {
  const trimmed = parseStringValue(name);
  if (!trimmed) return null;
  const escaped = escapeRegex(trimmed);
  const existing = await InventoryCategory.findOne({
    name: new RegExp(`^${escaped}$`, "i"),
  });
  if (existing) return existing;
  return InventoryCategory.create({
    name: trimmed,
    description: "",
    createdBy: userId,
    updatedBy: userId,
  });
};

const CATEGORY_TONES = ["blue", "indigo", "slate", "amber"];
const STATUS_TONES = ["blue", "green", "amber", "rose", "indigo", "slate"];
const SUPPLIER_TONES = ["blue", "indigo", "amber", "green"];

const ITEM_ID_SOURCES = [
  {
    model: InventoryRecord,
    itemField: "item",
    idField: "sku",
    label: "Inventory Records",
    excludeKey: "inventoryRecordId",
  },
  {
    model: ClientInventoryItem,
    itemField: "itemName",
    idField: "serialNumber",
    label: "Client Items",
    excludeKey: "clientItemId",
  },
  {
    model: StockTransaction,
    itemField: "item",
    idField: "sku",
    label: "Stock Transactions",
    excludeKey: "stockTransactionId",
  },
];

const buildRegistryConflict = ({ itemName, itemId, registry }) => {
  if (!registry) return null;
  const inputNameKey = normalizeKey(itemName);
  const inputIdKey = normalizeKey(itemId);
  const registryNameKey = normalizeKey(registry.itemName);
  const registryIdKey = normalizeKey(registry.itemId);

  if (registryNameKey === inputNameKey && registryIdKey !== inputIdKey) {
    return {
      type: "name",
      source: "Inventory ID Registry",
      existingItemName: registry.itemName,
      existingItemId: registry.itemId,
    };
  }
  if (registryIdKey === inputIdKey && registryNameKey !== inputNameKey) {
    return {
      type: "id",
      source: "Inventory ID Registry",
      existingItemName: registry.itemName,
      existingItemId: registry.itemId,
    };
  }
  return null;
};

const ensureInventoryItemIdentity = async ({ itemName, itemId }) => {
  const itemNameKey = normalizeKey(itemName);
  const itemIdKey = normalizeKey(itemId);
  if (!itemNameKey || !itemIdKey) return { ok: false };

  const existing = await InventoryItemIdentity.findOne({
    $or: [{ itemNameKey }, { itemIdKey }],
  }).lean();

  if (existing) {
    const conflict = buildRegistryConflict({
      itemName,
      itemId,
      registry: existing,
    });
    if (conflict) return { conflict };
    return { ok: true };
  }

  try {
    await InventoryItemIdentity.create({
      itemName: parseStringValue(itemName),
      itemId: parseStringValue(itemId),
      itemNameKey,
      itemIdKey,
    });
    return { ok: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const latest = await InventoryItemIdentity.findOne({
        $or: [{ itemNameKey }, { itemIdKey }],
      }).lean();
      const conflict = buildRegistryConflict({
        itemName,
        itemId,
        registry: latest,
      });
      if (conflict) return { conflict };
      return { ok: true };
    }
    throw error;
  }
};

const hasItemIdentityInUse = async ({ itemName, itemId }) => {
  const nameRegex = buildExactMatchRegex(itemName);
  const idRegex = buildExactMatchRegex(itemId);
  if (!nameRegex || !idRegex) return false;

  for (const source of ITEM_ID_SOURCES) {
    const matchCount = await source.model.countDocuments({
      [source.itemField]: nameRegex,
      [source.idField]: idRegex,
    });
    if (matchCount > 0) return true;
  }
  return false;
};

const cleanupInventoryItemIdentity = async ({ itemName, itemId }) => {
  const itemNameKey = normalizeKey(itemName);
  const itemIdKey = normalizeKey(itemId);
  if (!itemNameKey || !itemIdKey) return;
  const inUse = await hasItemIdentityInUse({ itemName, itemId });
  if (inUse) return;
  await InventoryItemIdentity.deleteOne({ itemNameKey, itemIdKey });
};

const buildItemIdConflictMessage = ({ inputName, inputId, conflict }) => {
  if (!conflict) return "Item ID conflict detected.";
  const safeName = parseStringValue(inputName);
  const safeId = parseStringValue(inputId);
  const conflictName = parseStringValue(conflict.existingItemName);
  const conflictId = parseStringValue(conflict.existingItemId);
  if (conflict.type === "name") {
    return `Item "${safeName}" already uses ID "${conflictId}" (${conflict.source}). Use that ID or change the name.`;
  }
  if (conflict.type === "id") {
    return `ID "${safeId}" is already assigned to "${conflictName}" (${conflict.source}). Use a different ID or rename the item.`;
  }
  return "Item ID conflict detected.";
};

const findItemIdConflict = async ({ itemName, itemId, excludeIds = {} }) => {
  const normalizedName = normalizeKey(itemName);
  const normalizedId = normalizeKey(itemId);
  if (!normalizedName || !normalizedId) return null;
  const nameRegex = buildExactMatchRegex(itemName);
  const idRegex = buildExactMatchRegex(itemId);
  if (!nameRegex || !idRegex) return null;

  for (const source of ITEM_ID_SOURCES) {
    const excludeId = excludeIds[source.excludeKey];
    const baseFilter = excludeId ? { _id: { $ne: excludeId } } : {};

    const nameMatches = await source.model
      .find({ ...baseFilter, [source.itemField]: nameRegex })
      .select({ [source.itemField]: 1, [source.idField]: 1 })
      .lean();

    const nameConflict = nameMatches.find((entry) => {
      const entryId = normalizeKey(entry?.[source.idField]);
      return entryId && entryId !== normalizedId;
    });
    if (nameConflict) {
      return {
        type: "name",
        source: source.label,
        existingItemName: nameConflict?.[source.itemField],
        existingItemId: nameConflict?.[source.idField],
      };
    }

    const idMatches = await source.model
      .find({ ...baseFilter, [source.idField]: idRegex })
      .select({ [source.itemField]: 1, [source.idField]: 1 })
      .lean();

    const idConflict = idMatches.find((entry) => {
      const entryName = normalizeKey(entry?.[source.itemField]);
      return entryName && entryName !== normalizedName;
    });
    if (idConflict) {
      return {
        type: "id",
        source: source.label,
        existingItemName: idConflict?.[source.itemField],
        existingItemId: idConflict?.[source.idField],
      };
    }
  }

  return null;
};

const pickRandomTone = (tones) =>
  tones[Math.floor(Math.random() * tones.length)];

const computeQtyMetaFromCapacity = (qtyValue, maxQty) => {
  if (!Number.isFinite(qtyValue) || !Number.isFinite(maxQty) || maxQty <= 0) {
    return "";
  }
  const ratio = Math.round((qtyValue / maxQty) * 100);
  return `${ratio}%`;
};

const parseVariantQuantity = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const parseVariantColors = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((color) => {
      const qtyValue = parseVariantQuantity(
        color?.qtyValue ?? color?.qty ?? color?.quantity,
      );
      return {
        name: parseStringValue(color?.name || color?.color || color?.kind),
        qtyValue,
        qtyLabel: formatVariantQtyLabel(qtyValue),
      };
    })
    .filter((color) => color.name || Number.isFinite(color.qtyValue));
};

const parseQtyValue = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const parseQtyValueFromLabel = (value) => {
  const raw = parseStringValue(value);
  if (!raw) return null;
  const numeric = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const parseMaxQty = (value) => {
  const numeric = parseQtyValue(value);
  if (numeric === null) return null;
  return numeric < 0 ? 0 : numeric;
};

const formatVariantQtyLabel = (value) => {
  if (!Number.isFinite(value)) return "";
  const normalized = Number.isInteger(value)
    ? value
    : Number(value.toFixed(2));
  return `${normalized.toLocaleString("en-US")} Units`;
};

const parseVariants = (value, fallbackStatus = "") => {
  if (!Array.isArray(value)) return [];
  return value
    .map((variant) => {
      const colors = parseVariantColors(
        variant?.colors || variant?.colorBreakdown || variant?.kinds,
      );
      const qtyFromColors = sumVariantQty(colors);
      const qtyValue =
        qtyFromColors !== null
          ? qtyFromColors
          : parseVariantQuantity(variant?.qtyValue);
      const status =
        parseStringValue(variant?.status) || parseStringValue(fallbackStatus);
      const priceValue = Number.isFinite(variant?.priceValue)
        ? variant.priceValue
        : parseCurrencyNumber(variant?.price);
      return {
        name: parseStringValue(
          variant?.name || variant?.variantName || variant?.variation,
        ),
        color: parseStringValue(variant?.color) || colors[0]?.name || "",
        colors,
        sku: parseStringValue(variant?.sku),
        price: parseStringValue(variant?.price),
        priceValue,
        status,
        qtyValue,
        qtyLabel: formatVariantQtyLabel(qtyValue),
      };
    })
    .filter(
      (variant) =>
        variant.name ||
        variant.color ||
        variant.sku ||
        Number.isFinite(variant.qtyValue),
    );
};

const parseBrandGroups = (value, fallbackStatus = "") => {
  if (!Array.isArray(value)) return [];
  return value
    .map((group) => ({
      name: parseStringValue(group?.name || group?.brand || group?.label),
      price: parseStringValue(group?.price),
      priceValue: parseCurrencyNumber(group?.price),
      variants: parseVariants(group?.variants || group?.items, fallbackStatus),
    }))
    .filter((group) => group.name || group.variants.length);
};

const flattenBrandGroups = (groups) =>
  groups.reduce(
    (acc, group) => acc.concat(group?.variants || []),
    [],
  );

const computeBrandGroupTotals = (groups, fallbackQty) => {
  if (!Array.isArray(groups) || !groups.length) {
    return { totalValue: null, minPrice: null };
  }

  let totalValue = 0;
  let hasValue = false;
  const priceValues = [];

  groups.forEach((group) => {
    const priceValue = Number.isFinite(group?.priceValue)
      ? group.priceValue
      : parseCurrencyNumber(group?.price);
    if (Number.isFinite(priceValue)) {
      priceValues.push(priceValue);
    }

    const variants = Array.isArray(group?.variants) ? group.variants : [];
    if (variants.length) {
      variants.forEach((variant) => {
        const variantPriceValue = Number.isFinite(variant?.priceValue)
          ? variant.priceValue
          : parseCurrencyNumber(variant?.price);
        if (Number.isFinite(variantPriceValue)) {
          priceValues.push(variantPriceValue);
        }
        const resolvedPrice = Number.isFinite(variantPriceValue)
          ? variantPriceValue
          : Number.isFinite(priceValue)
            ? priceValue
            : null;
        const variantQty = sumVariantQty([variant]);
        const resolvedQty =
          Number.isFinite(variantQty)
            ? variantQty
            : variants.length === 1
              ? fallbackQty
              : null;
        if (Number.isFinite(resolvedPrice) && Number.isFinite(resolvedQty)) {
          totalValue += resolvedPrice * resolvedQty;
          hasValue = true;
        }
      });
      return;
    }

    const groupQty = sumVariantQty(group?.variants || []);
    const resolvedQty =
      Number.isFinite(groupQty)
        ? groupQty
        : groups.length === 1
          ? fallbackQty
          : null;

    if (Number.isFinite(priceValue) && Number.isFinite(resolvedQty)) {
      totalValue += priceValue * resolvedQty;
      hasValue = true;
    }
  });

  return {
    totalValue: hasValue ? totalValue : null,
    minPrice: priceValues.length ? Math.min(...priceValues) : null,
  };
};

const buildQtyLabelFromVariants = (variants) => {
  const values = variants
    .map((variant) => variant?.qtyValue)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return "";
  const total = values.reduce((sum, value) => sum + value, 0);
  return formatVariantQtyLabel(total);
};

const sumVariantQty = (variants) => {
  const values = variants
    .map((variant) => variant?.qtyValue)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
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

const normalizeStockTransactionQty = (type, qty) => {
  const numericQty = Number(qty);
  if (!Number.isFinite(numericQty)) return 0;
  const absQty = Math.abs(numericQty);
  const normalizedType = normalizeKey(type);
  if (normalizedType === "stock out") return -absQty;
  if (normalizedType === "stock in") return absQty;
  if (normalizedType === "transfer") return 0;
  return numericQty;
};

const resolveTransactionVariantTarget = (
  record,
  { brandGroup, variantName, variantSku, allowRecordLevel = false } = {},
) => {
  const groupValue = parseStringValue(brandGroup);
  const nameValue = parseStringValue(variantName);
  const skuValue = parseStringValue(variantSku);
  const hasTarget = Boolean(groupValue || nameValue || skuValue);

  const groups = Array.isArray(record?.brandGroups)
    ? record.brandGroups
    : [];
  const hasBrandGroups = groups.length > 0;
  const variants = hasBrandGroups
    ? flattenBrandGroups(groups)
    : Array.isArray(record?.variants)
      ? record.variants
      : [];

  if (!variants.length) {
    return {
      mode: "record",
      brandGroup: "",
      variantName: "",
      variantSku: "",
    };
  }

  const normalizedGroup = normalizeKey(groupValue);
  const normalizedName = normalizeKey(nameValue);
  const normalizedSku = normalizeKey(skuValue);

  const matchesVariant = (variant) => {
    if (normalizedSku && normalizeKey(variant?.sku) !== normalizedSku) {
      return false;
    }
    if (normalizedName && normalizeKey(variant?.name) !== normalizedName) {
      return false;
    }
    return true;
  };

  if (hasTarget) {
    if (hasBrandGroups) {
      for (const group of groups) {
        if (normalizedGroup && normalizeKey(group?.name) !== normalizedGroup) {
          continue;
        }
        const groupVariants = Array.isArray(group?.variants)
          ? group.variants
          : [];
        if (!groupVariants.length) continue;

        if (!normalizedSku && !normalizedName && groupVariants.length === 1) {
          const variant = groupVariants[0];
          return {
            mode: "variant",
            group,
            variant,
            brandGroup: group?.name || "",
            variantName: variant?.name || "",
            variantSku: variant?.sku || "",
          };
        }

        const match = groupVariants.find(matchesVariant);
        if (match) {
          return {
            mode: "variant",
            group,
            variant: match,
            brandGroup: group?.name || "",
            variantName: match?.name || "",
            variantSku: match?.sku || "",
          };
        }
      }
    } else {
      const match = variants.find(matchesVariant);
      if (match) {
        return {
          mode: "variant",
          group: null,
          variant: match,
          brandGroup: groupValue || "",
          variantName: match?.name || "",
          variantSku: match?.sku || "",
        };
      }
    }

    if (allowRecordLevel) {
      return {
        mode: "record",
        brandGroup: "",
        variantName: "",
        variantSku: "",
      };
    }

    return { error: "Variant not found for this item." };
  }

  if (variants.length === 1) {
    if (hasBrandGroups) {
      for (const group of groups) {
        const groupVariants = Array.isArray(group?.variants)
          ? group.variants
          : [];
        if (groupVariants.length === 1) {
          const variant = groupVariants[0];
          return {
            mode: "variant",
            group,
            variant,
            brandGroup: group?.name || "",
            variantName: variant?.name || "",
            variantSku: variant?.sku || "",
          };
        }
      }
    }

    const variant = variants[0];
    return {
      mode: "variant",
      group: null,
      variant,
      brandGroup: groupValue || "",
      variantName: variant?.name || "",
      variantSku: variant?.sku || "",
    };
  }

  if (allowRecordLevel) {
    return {
      mode: "record",
      brandGroup: "",
      variantName: "",
      variantSku: "",
    };
  }

  return { error: "Variant is required for this item." };
};

const syncRecordFromVariants = (record) => {
  const hasBrandGroups =
    Array.isArray(record?.brandGroups) && record.brandGroups.length;
  const variants = hasBrandGroups
    ? flattenBrandGroups(record.brandGroups)
    : Array.isArray(record?.variants)
      ? record.variants
      : [];

  if (hasBrandGroups) {
    record.variants = variants;
  }

  const totalQty = sumVariantQty(variants);
  if (totalQty !== null) {
    record.qtyValue = totalQty;
  }
  record.qtyLabel =
    buildQtyLabelFromVariants(variants) ||
    formatVariantQtyLabel(record.qtyValue);
  record.qtyMeta = computeQtyMetaFromCapacity(
    record.qtyValue,
    record.maxQty,
  );

  if (hasBrandGroups) {
    const brandTotals = computeBrandGroupTotals(
      record.brandGroups,
      record.qtyValue,
    );
    record.priceValue = brandTotals?.minPrice ?? null;
    const computedValue =
      brandTotals?.totalValue !== null &&
      brandTotals?.totalValue !== undefined
        ? Number(brandTotals.totalValue.toFixed(2))
        : Number.isFinite(record.priceValue) && Number.isFinite(record.qtyValue)
          ? Number((record.priceValue * record.qtyValue).toFixed(2))
          : null;
    record.valueValue = computedValue;
    record.value = computedValue !== null ? computedValue.toFixed(2) : "";
  } else if (Number.isFinite(record.priceValue)) {
    const computedValue = Number.isFinite(record.qtyValue)
      ? Number((record.priceValue * record.qtyValue).toFixed(2))
      : null;
    record.valueValue = computedValue;
    record.value = computedValue !== null ? computedValue.toFixed(2) : "";
  } else {
    record.valueValue = null;
    record.value = "";
  }
};

const applyInventoryQtyDelta = async (
  record,
  delta,
  actorId,
  targetOptions = {},
) => {
  const resolved = resolveTransactionVariantTarget(record, targetOptions);
  if (resolved.error) {
    return { error: resolved.error };
  }

  if (resolved.mode === "variant") {
    const beforeQty = Number.isFinite(resolved.variant?.qtyValue)
      ? resolved.variant.qtyValue
      : 0;
    const afterQty = beforeQty + delta;

    if (delta !== 0) {
      resolved.variant.qtyValue = afterQty;
      resolved.variant.qtyLabel = formatVariantQtyLabel(afterQty);
      syncRecordFromVariants(record);
      record.updatedBy = actorId;
      await record.save();
    }

    return {
      beforeQty,
      afterQty,
      target: {
        brandGroup: resolved.brandGroup,
        variantName: resolved.variantName,
        variantSku: resolved.variantSku,
      },
    };
  }

  const beforeQty = Number.isFinite(record?.qtyValue) ? record.qtyValue : 0;
  const afterQty = beforeQty + delta;

  if (delta !== 0) {
    record.qtyValue = afterQty;
    record.qtyLabel = formatVariantQtyLabel(afterQty);
    record.qtyMeta = computeQtyMetaFromCapacity(afterQty, record.maxQty);
    if (Number.isFinite(record.priceValue)) {
      record.valueValue = Number((record.priceValue * afterQty).toFixed(2));
      record.value = record.valueValue.toFixed(2);
    } else {
      record.valueValue = null;
      record.value = "";
    }
    record.updatedBy = actorId;
    await record.save();
  }

  return { beforeQty, afterQty };
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
        { orderNo: search },
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
    const orderNo = parseStringValue(
      req.body.orderNo || req.body.serialNumber || req.body.serial,
    );
    const serialNumber = orderNo;
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
    if (!orderNo) {
      return res.status(400).json({ message: "Order number is required." });
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

    const mappingConflict = await findItemIdConflict({
      itemName,
      itemId: serialNumber,
    });
    if (mappingConflict) {
      return res
        .status(409)
        .json({
          message: buildItemIdConflictMessage({
            inputName: itemName,
            inputId: serialNumber,
            conflict: mappingConflict,
          }),
        });
    }

    const identityResult = await ensureInventoryItemIdentity({
      itemName,
      itemId: serialNumber,
    });
    if (identityResult?.conflict) {
      return res.status(409).json({
        message: buildItemIdConflictMessage({
          inputName: itemName,
          inputId: serialNumber,
          conflict: identityResult.conflict,
        }),
      });
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
      orderNo,
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

    await notifyInventoryUsersWithActor(req.user, {
      type: "SYSTEM",
      title: "Client item received",
      message: `${itemName} received from ${clientName}${
        warehouse ? ` (Warehouse: ${warehouse})` : ""
      }.`,
    });

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

    const previousItemName = record.itemName;
    const previousOrderNo = record.orderNo || record.serialNumber;
    const hasItemNamePayload =
      Object.prototype.hasOwnProperty.call(req.body, "itemName") ||
      Object.prototype.hasOwnProperty.call(req.body, "item");
    const hasOrderPayload =
      Object.prototype.hasOwnProperty.call(req.body, "orderNo") ||
      Object.prototype.hasOwnProperty.call(req.body, "serialNumber") ||
      Object.prototype.hasOwnProperty.call(req.body, "serial");
    const nextItemName = hasItemNamePayload
      ? parseStringValue(req.body.itemName || req.body.item)
      : record.itemName;
    const nextOrderNo = hasOrderPayload
      ? parseStringValue(
          req.body.orderNo || req.body.serialNumber || req.body.serial,
        )
      : record.orderNo || record.serialNumber;

    if (!nextItemName) {
      return res.status(400).json({ message: "itemName cannot be empty." });
    }
    if (!nextOrderNo) {
      return res.status(400).json({ message: "Order number is required." });
    }

    const mappingConflict = await findItemIdConflict({
      itemName: nextItemName,
      itemId: nextOrderNo,
      excludeIds: { clientItemId: record._id },
    });
    if (mappingConflict) {
      return res
        .status(409)
        .json({
          message: buildItemIdConflictMessage({
            inputName: nextItemName,
            inputId: nextOrderNo,
            conflict: mappingConflict,
          }),
        });
    }

    const identityResult = await ensureInventoryItemIdentity({
      itemName: nextItemName,
      itemId: nextOrderNo,
    });
    if (identityResult?.conflict) {
      return res.status(409).json({
        message: buildItemIdConflictMessage({
          inputName: nextItemName,
          inputId: nextOrderNo,
          conflict: identityResult.conflict,
        }),
      });
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

    if (hasItemNamePayload) {
      record.itemName = nextItemName;
    }

    if (hasOrderPayload) {
      record.orderNo = nextOrderNo;
      record.serialNumber = nextOrderNo;
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

    if (
      normalizeKey(previousItemName) !== normalizeKey(record.itemName) ||
      normalizeKey(previousOrderNo) !== normalizeKey(record.orderNo)
    ) {
      try {
        await cleanupInventoryItemIdentity({
          itemName: previousItemName,
          itemId: previousOrderNo,
        });
      } catch (error) {
        console.error("Unable to cleanup client item identity:", error);
      }
    }

    const populated = await ClientInventoryItem.findById(record._id)
      .populate("createdBy", "firstName lastName employeeId")
      .populate("updatedBy", "firstName lastName employeeId");

    await notifyInventoryUsersWithActor(req.user, {
      type: "UPDATE",
      title: "Client item updated",
      message: `${record.itemName || "Client item"} for ${
        record.clientName || "client"
      } was updated.`,
    });

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
    await notifyInventoryUsersWithActor(req.user, {
      type: "ACTIVITY",
      title: "Client item removed",
      message: `${deleted.itemName || "Client item"} for ${
        deleted.clientName || "client"
      } was removed.`,
    });
    try {
      await cleanupInventoryItemIdentity({
        itemName: deleted.itemName,
        itemId: deleted.orderNo || deleted.serialNumber,
      });
    } catch (error) {
      console.error("Unable to cleanup client item identity:", error);
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
    const category = parseStringValue(req.body.category);
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

    const poNumberRegex = buildExactMatchRegex(poNumber);
    if (poNumberRegex) {
      const existingPo = await PurchasingOrder.findOne({ poNumber: poNumberRegex });
      if (existingPo) {
        return res.status(409).json({
          message: `poNumber "${poNumber}" already exists. Use a different PO number.`,
        });
      }
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
      category,
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

    const settings = await getInventorySettingsSnapshot();
    if (settings.notifyPurchaseOrders !== false) {
      await notifyInventoryUsersWithActor(req.user, {
        type: "SYSTEM",
        title: "Purchase order created",
        message: `${poNumber} created for ${supplierName} (${status}).`,
      });
    }

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

    const previousStatus = record.status;

    if (Object.prototype.hasOwnProperty.call(req.body, "poNumber")) {
      const poNumber = parseStringValue(req.body.poNumber);
      if (!poNumber) {
        return res.status(400).json({ message: "poNumber cannot be empty." });
      }
      const poNumberRegex = buildExactMatchRegex(poNumber);
      if (poNumberRegex) {
        const existingPo = await PurchasingOrder.findOne({
          poNumber: poNumberRegex,
          _id: { $ne: record._id },
        });
        if (existingPo) {
          return res.status(409).json({
            message: `poNumber "${poNumber}" already exists. Use a different PO number.`,
          });
        }
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

    if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
      record.category = parseStringValue(req.body.category);
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

    const settings = await getInventorySettingsSnapshot();
    if (settings.notifyPurchaseOrders !== false) {
      if (previousStatus !== record.status) {
        await notifyInventoryUsersWithActor(req.user, {
          type: "UPDATE",
          title: "Purchase order status updated",
          message: `${record.poNumber} is now ${record.status}.`,
        });
      } else {
        await notifyInventoryUsersWithActor(req.user, {
          type: "UPDATE",
          title: "Purchase order updated",
          message: `${record.poNumber} was updated.`,
        });
      }
    }

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
    const settings = await getInventorySettingsSnapshot();
    if (settings.notifyPurchaseOrders !== false) {
      await notifyInventoryUsersWithActor(req.user, {
        type: "ACTIVITY",
        title: "Purchase order removed",
        message: `${deleted.poNumber || "Purchase order"} was removed.`,
      });
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

    const openPOBody = req.body.openPO || {};
    const openPOStatus = parseStringValue(openPOBody.status) || "open";
    const openPOLabel =
      parseStringValue(openPOBody.label) ||
      formatOpenPOStatusLabel(openPOStatus);

    const record = await Supplier.create({
      code: parseStringValue(req.body.code),
      name,
      contactPerson: parseStringValue(req.body.contactPerson),
      role: parseStringValue(req.body.role),
      phone: parseStringValue(req.body.phone),
      email: parseStringValue(req.body.email),
      products: Array.isArray(req.body.products) ? req.body.products : [],
      openPO: {
        label: openPOLabel,
        status: openPOStatus,
      },
      tone: pickRandomTone(SUPPLIER_TONES),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await notifyInventoryUsersWithActor(req.user, {
      type: "SYSTEM",
      title: "New supplier added",
      message: `${name} has been added to suppliers.`,
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
      const openPOBody = req.body.openPO || {};
      const openPOStatus =
        parseStringValue(openPOBody.status) ||
        parseStringValue(record.openPO?.status) ||
        "open";
      const openPOLabel =
        parseStringValue(openPOBody.label) ||
        formatOpenPOStatusLabel(openPOStatus) ||
        parseStringValue(record.openPO?.label);
      record.openPO = {
        label: openPOLabel,
        status: openPOStatus,
      };
    }

    if (!record.tone) {
      record.tone = pickRandomTone(SUPPLIER_TONES);
    }

    record.updatedBy = req.user._id;
    await record.save();

    await notifyInventoryUsersWithActor(req.user, {
      type: "UPDATE",
      title: "Supplier updated",
      message: `${record.name} supplier details were updated.`,
    });

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
    await notifyInventoryUsersWithActor(req.user, {
      type: "ACTIVITY",
      title: "Supplier removed",
      message: `${deleted.name || "Supplier"} was removed.`,
    });
    res.json({ message: "Supplier deleted successfully." });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getInventoryCategories = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const pagination = parsePaginationParams(req);
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const sortResult = parseSortParam(req, ["createdAt", "name"], {
      createdAt: -1,
    });
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const search = buildSearchRegex(req.query.search);
    if (search) {
      filter.$or = [{ name: search }, { description: search }];
    }

    const [records, total] = await Promise.all([
      InventoryCategory.find(filter)
        .sort(sortResult.sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      InventoryCategory.countDocuments(filter),
    ]);

    const names = records.map((record) => record.name).filter(Boolean);
    let usageMap = {};
    if (names.length) {
      const usage = await InventoryRecord.aggregate([
        { $match: { category: { $in: names } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]);
      usageMap = usage.reduce((acc, entry) => {
        acc[entry._id] = entry.count;
        return acc;
      }, {});
    }

    const data = records.map((record) => ({
      ...record,
      usageCount: usageMap[record.name] || 0,
    }));

    res.json(
      buildPagedResponse({
        data,
        total,
        page: pagination.page,
        limit: pagination.limit,
      }),
    );
  } catch (error) {
    console.error("Error fetching inventory categories:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getInventoryCategoryOptions = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const categories = await InventoryRecord.distinct("category", {
      category: { $ne: "" },
    });
    const sorted = categories
      .map((value) => parseStringValue(value))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    res.json({ data: sorted });
  } catch (error) {
    console.error("Error fetching inventory category options:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getInventoryWarehouseOptions = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const [
      recordWarehouses,
      recordSubtexts,
      clientWarehouses,
      settings,
    ] = await Promise.all([
      InventoryRecord.distinct("warehouse", { warehouse: { $ne: "" } }),
      InventoryRecord.distinct("subtext", {
        subtext: { $ne: "" },
        warehouse: { $in: ["", null] },
      }),
      ClientInventoryItem.distinct("warehouse", { warehouse: { $ne: "" } }),
      InventorySettings.findOne({}).lean(),
    ]);

    const values = [
      ...(recordWarehouses || []),
      ...(recordSubtexts || []),
      ...(clientWarehouses || []),
      settings?.defaultWarehouse,
    ]
      .map((value) => parseStringValue(value))
      .filter(Boolean);

    const sorted = Array.from(new Set(values)).sort((a, b) =>
      a.localeCompare(b),
    );

    res.json({ data: sorted });
  } catch (error) {
    console.error("Error fetching warehouse options:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const purgeInventoryData = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const results = await Promise.all([
      ClientInventoryItem.deleteMany({}),
      Supplier.deleteMany({}),
      PurchasingOrder.deleteMany({}),
      InventoryCategory.deleteMany({}),
      InventoryRecord.deleteMany({}),
      StockTransaction.deleteMany({}),
      InventoryReport.deleteMany({}),
      Notification.deleteMany({ source: "inventory" }),
    ]);

    res.json({
      message: "Inventory data deleted.",
      counts: {
        clientItems: results[0]?.deletedCount ?? 0,
        suppliers: results[1]?.deletedCount ?? 0,
        purchaseOrders: results[2]?.deletedCount ?? 0,
        categories: results[3]?.deletedCount ?? 0,
        inventoryRecords: results[4]?.deletedCount ?? 0,
        stockTransactions: results[5]?.deletedCount ?? 0,
        reports: results[6]?.deletedCount ?? 0,
        notifications: results[7]?.deletedCount ?? 0,
      },
    });

  } catch (error) {
    console.error("Error deleting inventory data:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const createInventoryCategory = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const name = parseStringValue(req.body.name);
    const description = parseStringValue(req.body.description);
    if (!name) {
      return res.status(400).json({ message: "name is required." });
    }

    const exists = await InventoryCategory.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (exists) {
      return res.status(400).json({ message: "Category already exists." });
    }

    const record = await InventoryCategory.create({
      name,
      description,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await notifyInventoryUsersWithActor(req.user, {
      type: "SYSTEM",
      title: "Category created",
      message: `${name} category has been added.`,
    });

    res.status(201).json(record);
  } catch (error) {
    console.error("Error creating inventory category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateInventoryCategory = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const record = await InventoryCategory.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: "Category not found." });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const name = parseStringValue(req.body.name);
      if (!name) {
        return res.status(400).json({ message: "name cannot be empty." });
      }
      const exists = await InventoryCategory.findOne({
        _id: { $ne: record._id },
        name: new RegExp(
          `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      });
      if (exists) {
        return res.status(400).json({ message: "Category already exists." });
      }
      record.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "description")) {
      record.description = parseStringValue(req.body.description);
    }

    record.updatedBy = req.user._id;
    await record.save();

    await notifyInventoryUsersWithActor(req.user, {
      type: "UPDATE",
      title: "Category updated",
      message: `${record.name} category was updated.`,
    });

    res.json(record);
  } catch (error) {
    console.error("Error updating inventory category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteInventoryCategory = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const deleted = await InventoryCategory.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found." });
    }
    await notifyInventoryUsersWithActor(req.user, {
      type: "ACTIVITY",
      title: "Category removed",
      message: `${deleted.name || "Category"} was removed.`,
    });
    res.json({ message: "Category deleted successfully." });
  } catch (error) {
    console.error("Error deleting inventory category:", error);
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
      [
        "createdAt",
        "item",
        "sku",
        "category",
        "status",
        "warehouse",
        "priceValue",
      ],
      { createdAt: -1 },
    );
    if (sortResult.error) {
      return res.status(400).json({ message: sortResult.error });
    }

    const filter = {};
    const statusList = parseListParam(req.query.status);
    const categoryList = parseListParam(req.query.category);
    const variantStatusList = parseListParam(req.query.variantStatus);
    const warehouse = parseStringValue(req.query.warehouse);
    const reorderRaw = req.query.reorder;
    const search = buildSearchRegex(req.query.search);
    const andFilters = [];

    if (statusList.length) filter.status = { $in: statusList };
    if (categoryList.length) filter.category = { $in: categoryList };
    if (variantStatusList.length) {
      filter["variants.status"] = { $in: variantStatusList };
    }
    if (warehouse) {
      const warehouseRegex = new RegExp(
        warehouse.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      andFilters.push({
        $or: [{ warehouse: warehouseRegex }, { subtext: warehouseRegex }],
      });
    }
    if (reorderRaw !== undefined && reorderRaw !== null && reorderRaw !== "") {
      const normalized = String(reorderRaw).trim().toLowerCase();
      if (normalized === "true" || normalized === "false") {
        filter.reorder = normalized === "true";
      }
    }
    if (search) {
      andFilters.push({
        $or: [
          { item: search },
          { brand: search },
          { sku: search },
          { subtext: search },
          { warehouse: search },
          { "variants.name": search },
          { "variants.color": search },
          { "variants.colors.name": search },
          { "variants.sku": search },
        ],
      });
    }

    if (andFilters.length) {
      filter.$and = andFilters;
    }

    const priceMinResult = parseNumberValue(req.query.priceMin, "priceMin", {
      min: 0,
    });
    if (priceMinResult.error) {
      return res.status(400).json({ message: priceMinResult.error });
    }
    const priceMaxResult = parseNumberValue(req.query.priceMax, "priceMax", {
      min: 0,
    });
    if (priceMaxResult.error) {
      return res.status(400).json({ message: priceMaxResult.error });
    }

    if (priceMinResult.value !== null || priceMaxResult.value !== null) {
      filter.priceValue = {};
      if (priceMinResult.value !== null) {
        filter.priceValue.$gte = priceMinResult.value;
      }
      if (priceMaxResult.value !== null) {
        filter.priceValue.$lte = priceMaxResult.value;
      }
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
    const warehouse = parseStringValue(req.body.warehouse || req.body.subtext);
    const recordStatus = parseStringValue(req.body.status) || "In Stock";
    const category = parseStringValue(req.body.category);
    if (!item) {
      return res.status(400).json({ message: "item is required." });
    }
    if (!sku) {
      return res.status(400).json({ message: "sku is required." });
    }

    if (category) {
      await ensureInventoryCategory(category, req.user?._id);
    }

    const mappingConflict = await findItemIdConflict({
      itemName: item,
      itemId: sku,
    });
    if (mappingConflict) {
      return res
        .status(409)
        .json({
          message: buildItemIdConflictMessage({
            inputName: item,
            inputId: sku,
            conflict: mappingConflict,
          }),
        });
    }

    const identityResult = await ensureInventoryItemIdentity({
      itemName: item,
      itemId: sku,
    });
    if (identityResult?.conflict) {
      return res.status(409).json({
        message: buildItemIdConflictMessage({
          inputName: item,
          inputId: sku,
          conflict: identityResult.conflict,
        }),
      });
    }

    const brandGroups = parseBrandGroups(req.body.brandGroups, recordStatus);
    const primaryBrand =
      brandGroups.find((group) => group.name)?.name ||
      parseStringValue(req.body.brand);
    const maxQty = parseMaxQty(req.body.maxQty);
    const variants = brandGroups.length
      ? flattenBrandGroups(brandGroups)
      : parseVariants(req.body.variants, recordStatus);
    const rawQtyValue =
      parseQtyValue(req.body.qtyValue) ??
      parseQtyValueFromLabel(req.body.qtyLabel);
    const derivedQtyValue = variants.length
      ? sumVariantQty(variants) ?? rawQtyValue
      : rawQtyValue;
    const derivedLabel = variants.length
      ? buildQtyLabelFromVariants(variants) ||
        formatVariantQtyLabel(derivedQtyValue)
      : formatVariantQtyLabel(derivedQtyValue);
    const qtyMeta = computeQtyMetaFromCapacity(derivedQtyValue, maxQty);
    const brandTotals = brandGroups.length
      ? computeBrandGroupTotals(brandGroups, derivedQtyValue)
      : null;
    const priceValue = brandGroups.length
      ? brandTotals?.minPrice
      : parseCurrencyNumber(req.body.price);
    const computedValue =
      brandTotals?.totalValue !== null && brandTotals?.totalValue !== undefined
        ? Number(brandTotals.totalValue.toFixed(2))
        : Number.isFinite(priceValue) && Number.isFinite(derivedQtyValue)
          ? Number((priceValue * derivedQtyValue).toFixed(2))
          : null;

    const record = await InventoryRecord.create({
      item,
      subtext: warehouse,
      warehouse,
      sku,
      brand: primaryBrand,
      brandGroups,
      category,
      categoryTone: pickRandomTone(CATEGORY_TONES),
      qtyLabel: derivedLabel,
      qtyValue: derivedQtyValue,
      maxQty,
      qtyMeta,
      variations: parseStringValue(req.body.variations),
      colors: parseStringValue(req.body.colors),
      variants,
      price: brandGroups.length ? "" : parseStringValue(req.body.price),
      priceValue,
      value: computedValue !== null ? computedValue.toFixed(2) : "",
      valueValue: computedValue,
      status: recordStatus,
      statusTone: pickRandomTone(STATUS_TONES),
      reorder: parseBooleanValue(req.body.reorder, false),
      image: parseStringValue(req.body.image),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await notifyInventoryUsersWithActor(req.user, {
      type: "SYSTEM",
      title: "Inventory record created",
      message: `${item} (${sku}) added${warehouse ? ` to ${warehouse}` : ""}.`,
    });

    const settings = await getInventorySettingsSnapshot();
    if (shouldNotifyLowStock(record, null, settings)) {
      const percent = computeQtyPercent(
        record.qtyValue,
        record.maxQty,
        record.qtyMeta,
      );
      await notifyInventoryUsersWithActor(req.user, {
        type: "SYSTEM",
        title: "Low stock alert",
        message: `${item} is low (${formatPercentLabel(
          percent,
        )} of capacity).`,
      });
    }

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

    const previousStatus = record.status;
    const previousQtyValue = record.qtyValue;
    const previousItem = record.item;
    const previousSku = record.sku;

    const hasItemPayload = Object.prototype.hasOwnProperty.call(req.body, "item");
    const hasSkuPayload = Object.prototype.hasOwnProperty.call(req.body, "sku");
    const nextItem = hasItemPayload ? parseStringValue(req.body.item) : record.item;
    const nextSku = hasSkuPayload ? parseStringValue(req.body.sku) : record.sku;

    if (!nextItem) {
      return res.status(400).json({ message: "item cannot be empty." });
    }
    if (!nextSku) {
      return res.status(400).json({ message: "sku is required." });
    }

    const mappingConflict = await findItemIdConflict({
      itemName: nextItem,
      itemId: nextSku,
      excludeIds: { inventoryRecordId: record._id },
    });
    if (mappingConflict) {
      return res
        .status(409)
        .json({
          message: buildItemIdConflictMessage({
            inputName: nextItem,
            inputId: nextSku,
            conflict: mappingConflict,
          }),
        });
    }

    const identityResult = await ensureInventoryItemIdentity({
      itemName: nextItem,
      itemId: nextSku,
    });
    if (identityResult?.conflict) {
      return res.status(409).json({
        message: buildItemIdConflictMessage({
          inputName: nextItem,
          inputId: nextSku,
          conflict: identityResult.conflict,
        }),
      });
    }

    const updatableFields = [
      "item",
      "sku",
      "brand",
      "category",
      "variations",
      "colors",
      "status",
      "image",
    ];

    updatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        record[field] = parseStringValue(req.body[field]);
      }
    });

    if (Object.prototype.hasOwnProperty.call(req.body, "warehouse")) {
      const nextWarehouse = parseStringValue(req.body.warehouse);
      record.warehouse = nextWarehouse;
      record.subtext = nextWarehouse;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "subtext")) {
      const nextWarehouse = parseStringValue(req.body.subtext);
      record.subtext = nextWarehouse;
      record.warehouse = nextWarehouse;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
      record.category = parseStringValue(req.body.category);
      record.categoryTone = pickRandomTone(CATEGORY_TONES);
      if (record.category) {
        await ensureInventoryCategory(record.category, req.user?._id);
      }
    }

    const fallbackStatus =
      parseStringValue(req.body.status) || record.status || "In Stock";

    if (Object.prototype.hasOwnProperty.call(req.body, "brandGroups")) {
      record.brandGroups = parseBrandGroups(
        req.body.brandGroups,
        fallbackStatus,
      );
      const primaryBrand = record.brandGroups.find(
        (group) => group.name,
      )?.name;
      record.brand = primaryBrand || "";
      record.variants = flattenBrandGroups(record.brandGroups);
      record.price = "";
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "qtyValue")) {
      record.qtyValue = parseQtyValue(req.body.qtyValue);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "maxQty")) {
      record.maxQty = parseMaxQty(req.body.maxQty);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "variants")) {
      if (
        !Object.prototype.hasOwnProperty.call(req.body, "brandGroups")
      ) {
        record.variants = parseVariants(req.body.variants, fallbackStatus);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "status")) {
      record.status = parseStringValue(req.body.status);
      record.statusTone = pickRandomTone(STATUS_TONES);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "price")) {
      const nextPrice = parseStringValue(req.body.price);
      record.price = nextPrice;
      record.priceValue = parseCurrencyNumber(nextPrice);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "reorder")) {
      record.reorder = parseBooleanValue(req.body.reorder, record.reorder);
    }

    const variants = Array.isArray(record.variants) ? record.variants : [];
    if (variants.length) {
      const totalQty = sumVariantQty(variants);
      const derivedLabel =
        buildQtyLabelFromVariants(variants) ||
        formatVariantQtyLabel(totalQty);
      if (totalQty !== null) {
        record.qtyValue = totalQty;
      }
      if (derivedLabel) {
        record.qtyLabel = derivedLabel;
      }
      record.qtyMeta = computeQtyMetaFromCapacity(
        record.qtyValue,
        record.maxQty,
      );
    } else {
      if (
        Object.prototype.hasOwnProperty.call(req.body, "qtyValue") ||
        Object.prototype.hasOwnProperty.call(req.body, "maxQty")
      ) {
        record.qtyLabel = formatVariantQtyLabel(record.qtyValue);
        record.qtyMeta = computeQtyMetaFromCapacity(
          record.qtyValue,
          record.maxQty,
        );
      }
    }

    const hasBrandGroups =
      Array.isArray(record.brandGroups) && record.brandGroups.length;
    const brandTotals = hasBrandGroups
      ? computeBrandGroupTotals(record.brandGroups, record.qtyValue)
      : null;
    if (hasBrandGroups) {
      record.priceValue = brandTotals?.minPrice ?? null;
    }

    const computedValue =
      brandTotals?.totalValue !== null && brandTotals?.totalValue !== undefined
        ? Number(brandTotals.totalValue.toFixed(2))
        : Number.isFinite(record.priceValue) && Number.isFinite(record.qtyValue)
          ? Number((record.priceValue * record.qtyValue).toFixed(2))
          : null;
    record.valueValue = computedValue;
    record.value = computedValue !== null ? computedValue.toFixed(2) : "";

    record.updatedBy = req.user._id;
    await record.save();

    const statusChanged = previousStatus !== record.status;
    const qtyChanged =
      Number.isFinite(previousQtyValue) || Number.isFinite(record.qtyValue)
        ? previousQtyValue !== record.qtyValue
        : false;
    const detailParts = [];
    if (statusChanged) {
      detailParts.push(`Status: ${record.status}`);
    }
    if (qtyChanged && Number.isFinite(record.qtyValue)) {
      detailParts.push(`Qty: ${record.qtyValue}`);
    }
    const details = detailParts.length ? ` (${detailParts.join(" | ")})` : "";
    await notifyInventoryUsersWithActor(req.user, {
      type: "UPDATE",
      title: "Inventory record updated",
      message: `${record.item} (${record.sku}) updated${details}.`,
    });


    const settings = await getInventorySettingsSnapshot();
    if (shouldNotifyLowStock(record, previousQtyValue, settings)) {
      const percent = computeQtyPercent(
        record.qtyValue,
        record.maxQty,
        record.qtyMeta,
      );
      await notifyInventoryUsersWithActor(req.user, {
        type: "SYSTEM",
        title: "Low stock alert",
        message: `${record.item} is low (${formatPercentLabel(
          percent,
        )} of capacity).`,
      });
    }

    if (
      normalizeKey(previousItem) !== normalizeKey(record.item) ||
      normalizeKey(previousSku) !== normalizeKey(record.sku)
    ) {
      try {
        await cleanupInventoryItemIdentity({
          itemName: previousItem,
          itemId: previousSku,
        });
      } catch (error) {
        console.error("Unable to cleanup inventory record identity:", error);
      }
    }

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
    await notifyInventoryUsersWithActor(req.user, {
      type: "ACTIVITY",
      title: "Inventory record removed",
      message: `${deleted.item || "Inventory record"}${
        deleted.sku ? ` (${deleted.sku})` : ""
      } was removed.`,
    });
    try {
      await cleanupInventoryItemIdentity({
        itemName: deleted.item,
        itemId: deleted.sku,
      });
    } catch (error) {
      console.error("Unable to cleanup inventory record identity:", error);
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
    const sku = parseStringValue(req.query.sku);
    const item = parseStringValue(req.query.item);
    const brandGroup = parseStringValue(req.query.brandGroup);
    const variantName = parseStringValue(req.query.variantName);
    const variantSku = parseStringValue(req.query.variantSku);
    const rangeResult = parseNumberValue(req.query.range, "range", { min: 1 });
    const search = buildSearchRegex(req.query.search);
    const dailyDate = parseOptionalDate(req.query.date);
    const dateFrom = parseOptionalDate(req.query.dateFrom);
    const dateTo = parseOptionalDate(req.query.dateTo);

    if (rangeResult.error) {
      return res.status(400).json({ message: rangeResult.error });
    }

    if (type) filter.type = type;
    if (sku) filter.sku = sku;
    if (item) filter.item = item;
    if (brandGroup) filter.brandGroup = brandGroup;
    if (variantName) filter.variantName = variantName;
    if (variantSku) filter.variantSku = variantSku;
    if (dailyDate) {
      const dayStart = new Date(dailyDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dailyDate);
      dayEnd.setHours(23, 59, 59, 999);
      filter.date = { $gte: dayStart, $lte: dayEnd };
    } else if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    } else if (rangeResult.value) {
      const start = new Date();
      start.setDate(start.getDate() - rangeResult.value);
      filter.date = { $gte: start };
    }
    if (search) {
      filter.$or = [
        { item: search },
        { sku: search },
        { brandGroup: search },
        { variantName: search },
        { variantSku: search },
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

const getStockTransactionsDailyReport = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const reportDate = parseOptionalDate(req.query.date);
    if (!reportDate) {
      return res.status(400).json({ message: "date is required." });
    }

    const dayStart = new Date(reportDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(reportDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dayTransactions = await StockTransaction.find({
      date: { $gte: dayStart, $lte: dayEnd },
    }).lean();

    if (!dayTransactions.length) {
      return res.json({ date: dayStart.toISOString().slice(0, 10), rows: [] });
    }

    const skuSet = new Set(
      dayTransactions
        .map((tx) => String(tx?.sku || "").trim())
        .filter(Boolean),
    );
    const skuList = Array.from(skuSet);

    const [records, afterTransactions] = await Promise.all([
      InventoryRecord.find({ sku: { $in: skuList } })
        .select("item sku qtyValue warehouse")
        .lean(),
      StockTransaction.find({
        sku: { $in: skuList },
        date: { $gt: dayEnd },
      })
        .select("sku item qty")
        .lean(),
    ]);

    const recordBySku = new Map(
      records.map((record) => [String(record.sku), record]),
    );
    const afterDeltaBySku = new Map();
    afterTransactions.forEach((tx) => {
      const sku = String(tx?.sku || "").trim();
      if (!sku) return;
      const qty = Number(tx?.qty || 0);
      afterDeltaBySku.set(sku, (afterDeltaBySku.get(sku) || 0) + qty);
    });

    const dayAgg = new Map();
    dayTransactions.forEach((tx) => {
      const sku = String(tx?.sku || "").trim();
      if (!sku) return;
      const qty = Number(tx?.qty || 0);
      const existing = dayAgg.get(sku) || {
        sku,
        item: tx?.item || recordBySku.get(sku)?.item || "",
        qtyIn: 0,
        qtyOut: 0,
        netChange: 0,
        transactions: 0,
      };
      existing.netChange += qty;
      if (qty > 0) existing.qtyIn += qty;
      if (qty < 0) existing.qtyOut += Math.abs(qty);
      existing.transactions += 1;
      dayAgg.set(sku, existing);
    });

    const rows = Array.from(dayAgg.values()).map((entry) => {
      const record = recordBySku.get(entry.sku);
      const currentQty = Number(record?.qtyValue);
      const safeCurrentQty = Number.isFinite(currentQty) ? currentQty : 0;
      const afterDelta = afterDeltaBySku.get(entry.sku) || 0;
      const closingQty = safeCurrentQty - afterDelta;
      const openingQty = closingQty - entry.netChange;
      return {
        sku: entry.sku,
        item: entry.item || record?.item || "",
        warehouse: record?.warehouse || "",
        openingQty,
        qtyIn: entry.qtyIn,
        qtyOut: entry.qtyOut,
        netChange: entry.netChange,
        closingQty,
        transactions: entry.transactions,
      };
    });

    rows.sort((a, b) => {
      const itemCompare = String(a.item || "").localeCompare(
        String(b.item || ""),
      );
      if (itemCompare !== 0) return itemCompare;
      return String(a.sku || "").localeCompare(String(b.sku || ""));
    });

    return res.json({ date: dayStart.toISOString().slice(0, 10), rows });
  } catch (error) {
    console.error("Error fetching daily stock transaction report:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const createStockTransaction = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const item = parseStringValue(req.body.item);
    const sku = parseStringValue(req.body.sku);
    const type = parseStringValue(req.body.type);
    const qtyResult = parseNumberValue(req.body.qty, "qty", {
      required: true,
      min: null,
    });

    if (!item) {
      return res.status(400).json({ message: "item is required." });
    }
    if (!sku) {
      return res.status(400).json({ message: "sku is required." });
    }
    if (!type) {
      return res.status(400).json({ message: "type is required." });
    }
    if (qtyResult.error) {
      return res.status(400).json({ message: qtyResult.error });
    }

    const mappingConflict = await findItemIdConflict({
      itemName: item,
      itemId: sku,
    });
    if (mappingConflict) {
      return res
        .status(409)
        .json({
          message: buildItemIdConflictMessage({
            inputName: item,
            inputId: sku,
            conflict: mappingConflict,
          }),
        });
    }

    const identityResult = await ensureInventoryItemIdentity({
      itemName: item,
      itemId: sku,
    });
    if (identityResult?.conflict) {
      return res.status(409).json({
        message: buildItemIdConflictMessage({
          inputName: item,
          inputId: sku,
          conflict: identityResult.conflict,
        }),
      });
    }

    const txid =
      parseStringValue(req.body.txid) ||
      `TR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const txidRegex = buildExactMatchRegex(txid);
    if (txidRegex) {
      const existingTx = await StockTransaction.findOne({ txid: txidRegex });
      if (existingTx) {
        return res
          .status(409)
          .json({
            message: `txid "${txid}" already exists. Choose a different transaction ID.`,
          });
      }
    }
    const date =
      parseOptionalDate(req.body.date) ||
      parseOptionalDate(req.body.createdAt) ||
      new Date();
    const brandGroup = parseStringValue(req.body.brandGroup);
    const variantName = parseStringValue(req.body.variantName);
    const variantSku = parseStringValue(req.body.variantSku);

    const normalizedQty = normalizeStockTransactionQty(type, qtyResult.value);
    const inventoryRecord = await InventoryRecord.findOne({ sku });
    if (!inventoryRecord) {
      return res.status(404).json({
        message: `Inventory record not found for Item ID "${sku}". Create the inventory record first.`,
      });
    }
    const qtyResultWithTarget = await applyInventoryQtyDelta(
      inventoryRecord,
      normalizedQty,
      req.user._id,
      {
        brandGroup,
        variantName,
        variantSku,
      },
    );
    if (qtyResultWithTarget?.error) {
      return res.status(400).json({ message: qtyResultWithTarget.error });
    }
    const { beforeQty, afterQty } = qtyResultWithTarget;
    const resolvedTarget = qtyResultWithTarget?.target || {
      brandGroup,
      variantName,
      variantSku,
    };

    const record = await StockTransaction.create({
      txid,
      item,
      sku,
      brandGroup: resolvedTarget.brandGroup || "",
      variantName: resolvedTarget.variantName || "",
      variantSku: resolvedTarget.variantSku || "",
      type,
      qty: normalizedQty,
      beforeQty,
      afterQty,
      source: parseStringValue(req.body.source),
      destination: parseStringValue(req.body.destination),
      date,
      staff: parseStringValue(req.body.staff),
      notes: parseStringValue(req.body.notes),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await notifyInventoryUsersWithActor(req.user, {
      type: "UPDATE",
      title: "Stock transaction logged",
      message: `${txid} - ${type} - ${normalizedQty} units for ${item}.`,
    });

    res.status(201).json(record);
  } catch (error) {
    console.error("Error creating stock transaction:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateStockTransaction = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const record = await StockTransaction.findById(req.params.id);
    if (!record) {
      return res
        .status(404)
        .json({ message: "Stock transaction not found." });
    }

    const previousItem = record.item;
    const previousSku = record.sku;
    const previousType = record.type;
    const previousQty = record.qty;
    const previousBrandGroup = record.brandGroup;
    const previousVariantName = record.variantName;
    const previousVariantSku = record.variantSku;
    const hasItemPayload = Object.prototype.hasOwnProperty.call(req.body, "item");
    const hasSkuPayload = Object.prototype.hasOwnProperty.call(req.body, "sku");
    const hasTxidPayload = Object.prototype.hasOwnProperty.call(req.body, "txid");
    const hasTypePayload = Object.prototype.hasOwnProperty.call(req.body, "type");
    const hasQtyPayload = Object.prototype.hasOwnProperty.call(req.body, "qty");
    const hasBrandGroupPayload = Object.prototype.hasOwnProperty.call(
      req.body,
      "brandGroup",
    );
    const hasVariantNamePayload = Object.prototype.hasOwnProperty.call(
      req.body,
      "variantName",
    );
    const hasVariantSkuPayload = Object.prototype.hasOwnProperty.call(
      req.body,
      "variantSku",
    );
    const nextItem = hasItemPayload ? parseStringValue(req.body.item) : record.item;
    const nextSku = hasSkuPayload ? parseStringValue(req.body.sku) : record.sku;
    const nextBrandGroup = hasBrandGroupPayload
      ? parseStringValue(req.body.brandGroup)
      : record.brandGroup;
    const nextVariantName = hasVariantNamePayload
      ? parseStringValue(req.body.variantName)
      : record.variantName;
    const nextVariantSku = hasVariantSkuPayload
      ? parseStringValue(req.body.variantSku)
      : record.variantSku;

    if (!nextItem) {
      return res.status(400).json({ message: "item is required." });
    }
    if (!nextSku) {
      return res.status(400).json({ message: "sku is required." });
    }

    const mappingConflict = await findItemIdConflict({
      itemName: nextItem,
      itemId: nextSku,
      excludeIds: { stockTransactionId: record._id },
    });
    if (mappingConflict) {
      return res
        .status(409)
        .json({
          message: buildItemIdConflictMessage({
            inputName: nextItem,
            inputId: nextSku,
            conflict: mappingConflict,
          }),
        });
    }

    const identityResult = await ensureInventoryItemIdentity({
      itemName: nextItem,
      itemId: nextSku,
    });
    if (identityResult?.conflict) {
      return res.status(409).json({
        message: buildItemIdConflictMessage({
          inputName: nextItem,
          inputId: nextSku,
          conflict: identityResult.conflict,
        }),
      });
    }

    if (hasTxidPayload) {
      const txid = parseStringValue(req.body.txid);
      if (!txid) {
        return res.status(400).json({ message: "txid cannot be empty." });
      }
      const txidRegex = buildExactMatchRegex(txid);
      if (txidRegex) {
        const existingTx = await StockTransaction.findOne({
          txid: txidRegex,
          _id: { $ne: record._id },
        });
        if (existingTx) {
          return res
            .status(409)
            .json({
              message: `txid "${txid}" already exists. Choose a different transaction ID.`,
            });
        }
      }
      record.txid = txid;
    }

    if (hasItemPayload) {
      record.item = nextItem;
    }

    const nextType = hasTypePayload ? parseStringValue(req.body.type) : record.type;
    if (hasTypePayload && !nextType) {
      return res.status(400).json({ message: "type is required." });
    }

    let nextQtyRaw = record.qty;
    if (hasQtyPayload) {
      const qtyResult = parseNumberValue(req.body.qty, "qty", { min: null });
      if (qtyResult.error) {
        return res.status(400).json({ message: qtyResult.error });
      }
      nextQtyRaw = qtyResult.value;
    }
    const normalizedQty = normalizeStockTransactionQty(nextType, nextQtyRaw);

    if (hasSkuPayload) {
      record.sku = nextSku;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "source")) {
      record.source = parseStringValue(req.body.source);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "destination")) {
      record.destination = parseStringValue(req.body.destination);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "date")) {
      const dateResult = parseDateValue(req.body.date, "date", {
        required: true,
      });
      if (dateResult.error) {
        return res.status(400).json({ message: dateResult.error });
      }
      record.date = dateResult.value;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "staff")) {
      record.staff = parseStringValue(req.body.staff);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "notes")) {
      record.notes = parseStringValue(req.body.notes);
    }

    const previousDelta = normalizeStockTransactionQty(previousType, previousQty);
    const nextDelta = normalizedQty;
    const targetChanged =
      normalizeKey(previousBrandGroup) !== normalizeKey(nextBrandGroup) ||
      normalizeKey(previousVariantName) !== normalizeKey(nextVariantName) ||
      normalizeKey(previousVariantSku) !== normalizeKey(nextVariantSku);
    const impactChanged =
      normalizeKey(previousSku) !== normalizeKey(nextSku) ||
      previousDelta !== nextDelta ||
      targetChanged;
    const hasSnapshot =
      Number.isFinite(record.beforeQty) && Number.isFinite(record.afterQty);

    if (impactChanged) {
      const previousInventoryRecord = await InventoryRecord.findOne({
        sku: previousSku,
      });
      if (!previousInventoryRecord) {
        return res.status(404).json({
          message: `Inventory record not found for Item ID "${previousSku}".`,
        });
      }

      let nextInventoryRecord = previousInventoryRecord;
      if (normalizeKey(previousSku) !== normalizeKey(nextSku)) {
        nextInventoryRecord = await InventoryRecord.findOne({ sku: nextSku });
        if (!nextInventoryRecord) {
          return res.status(404).json({
            message: `Inventory record not found for Item ID "${nextSku}".`,
          });
        }
      }

      if (hasSnapshot && previousDelta !== 0) {
        const revertResult = await applyInventoryQtyDelta(
          previousInventoryRecord,
          -previousDelta,
          req.user._id,
          {
            brandGroup: previousBrandGroup,
            variantName: previousVariantName,
            variantSku: previousVariantSku,
            allowRecordLevel:
              !previousBrandGroup && !previousVariantName && !previousVariantSku,
          },
        );
        if (revertResult?.error) {
          return res.status(400).json({ message: revertResult.error });
        }
      }

      const applyResult = await applyInventoryQtyDelta(
        nextInventoryRecord,
        nextDelta,
        req.user._id,
        {
          brandGroup: nextBrandGroup,
          variantName: nextVariantName,
          variantSku: nextVariantSku,
          allowRecordLevel:
            !nextBrandGroup &&
            !nextVariantName &&
            !nextVariantSku &&
            !hasBrandGroupPayload &&
            !hasVariantNamePayload &&
            !hasVariantSkuPayload,
        },
      );
      if (applyResult?.error) {
        return res.status(400).json({ message: applyResult.error });
      }
      record.beforeQty = applyResult.beforeQty;
      record.afterQty = applyResult.afterQty;
      const resolvedTarget = applyResult?.target || {
        brandGroup: nextBrandGroup,
        variantName: nextVariantName,
        variantSku: nextVariantSku,
      };
      record.brandGroup = resolvedTarget.brandGroup || "";
      record.variantName = resolvedTarget.variantName || "";
      record.variantSku = resolvedTarget.variantSku || "";
    }

    if (!impactChanged) {
      if (hasBrandGroupPayload) {
        record.brandGroup = nextBrandGroup;
      }
      if (hasVariantNamePayload) {
        record.variantName = nextVariantName;
      }
      if (hasVariantSkuPayload) {
        record.variantSku = nextVariantSku;
      }
    }

    record.type = nextType;
    record.qty = normalizedQty;
    record.updatedBy = req.user._id;
    await record.save();

    await notifyInventoryUsersWithActor(req.user, {
      type: "UPDATE",
      title: "Stock transaction updated",
      message: `${record.txid} updated (${record.type}, ${record.qty} units).`,
    });

    if (
      normalizeKey(previousItem) !== normalizeKey(record.item) ||
      normalizeKey(previousSku) !== normalizeKey(record.sku)
    ) {
      try {
        await cleanupInventoryItemIdentity({
          itemName: previousItem,
          itemId: previousSku,
        });
      } catch (error) {
        console.error("Unable to cleanup stock transaction identity:", error);
      }
    }

    res.json(record);
  } catch (error) {
    console.error("Error updating stock transaction:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteStockTransaction = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const deleted = await StockTransaction.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res
        .status(404)
        .json({ message: "Stock transaction not found." });
    }

    const deletionDelta = normalizeStockTransactionQty(
      deleted.type,
      deleted.qty,
    );
    const hasSnapshot =
      Number.isFinite(deleted.beforeQty) && Number.isFinite(deleted.afterQty);
    if (hasSnapshot && deletionDelta !== 0) {
      const inventoryRecord = await InventoryRecord.findOne({ sku: deleted.sku });
      if (inventoryRecord) {
        const revertResult = await applyInventoryQtyDelta(
          inventoryRecord,
          -deletionDelta,
          req.user._id,
          {
            brandGroup: deleted.brandGroup,
            variantName: deleted.variantName,
            variantSku: deleted.variantSku,
            allowRecordLevel:
              !deleted.brandGroup &&
              !deleted.variantName &&
              !deleted.variantSku,
          },
        );
        if (revertResult?.error) {
          console.error(
            "Unable to revert inventory quantity for deleted transaction:",
            revertResult.error,
          );
        }
      }
    }
    await notifyInventoryUsersWithActor(req.user, {
      type: "ACTIVITY",
      title: "Stock transaction removed",
      message: `${deleted.txid} was removed.`,
    });
    try {
      await cleanupInventoryItemIdentity({
        itemName: deleted.item,
        itemId: deleted.sku,
      });
    } catch (error) {
      console.error("Unable to cleanup stock transaction identity:", error);
    }
    res.json({ message: "Stock transaction deleted successfully." });
  } catch (error) {
    console.error("Error deleting stock transaction:", error);
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

    const generatedBy =
      parseStringValue(req.body.generatedBy) ||
      parseStringValue(
        [req.user?.firstName, req.user?.lastName].filter(Boolean).join(" "),
      ) ||
      parseStringValue(req.user?.employeeId);

    const report = await InventoryReport.create({
      name,
      type: parseStringValue(req.body.type || req.body.reportType),
      createdAtOverride: parseOptionalDate(req.body.createdAt),
      generatedBy,
      status: parseStringValue(req.body.status) || "Ready",
      downloads: Array.isArray(req.body.downloads)
        ? req.body.downloads
        : ["PDF", "CSV", "EXCEL"],
      createdBy: req.user._id,
    });

    await notifyInventoryUsersWithActor(req.user, {
      type: "SYSTEM",
      title: "Report generated",
      message: `${name} report was generated.`,
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
    await notifyInventoryUsersWithActor(req.user, {
      type: "ACTIVITY",
      title: "Report deleted",
      message: `${deleted.name || "Report"} was deleted.`,
    });
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
          settings[field] = Number.isFinite(parsed)
            ? Math.min(100, Math.max(0, parsed))
            : settings[field];
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
  getInventoryCategories,
  getInventoryCategoryOptions,
  getInventoryWarehouseOptions,
  createInventoryCategory,
  updateInventoryCategory,
  deleteInventoryCategory,
  purgeInventoryData,
  getInventoryRecords,
  createInventoryRecord,
  updateInventoryRecord,
  deleteInventoryRecord,
  getStockTransactions,
  getStockTransactionsDailyReport,
  createStockTransaction,
  updateStockTransaction,
  deleteStockTransaction,
  getReports,
  createReport,
  deleteReport,
  getInventorySettings,
  updateInventorySettings,
};
