#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const resolveEnvPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, "..", raw);
};

const dotenvPath =
  resolveEnvPath(process.env.DOTENV_FILE) || path.resolve(__dirname, "../.env");
dotenv.config({ path: dotenvPath });

const PurchasingOrder = require("../src/models/PurchasingOrder");
const Supplier = require("../src/models/Supplier");
const User = require("../src/models/User");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const SUPPLIER_TONES = ["blue", "indigo", "amber", "green"];
const SUPPLIER_PRODUCT_TONES = [...SUPPLIER_TONES, "slate"];
const PURCHASE_ORDER_CLOSED_STATUSES = new Set([
  "received",
  "fully received",
  "cancelled",
  "closed",
  "complete",
  "completed",
]);
const PURCHASE_ORDER_TO_SUPPLIER_STATUS = Object.freeze({
  open: "open",
  pending: "pending",
  requested: "pending",
  ordered: "processing",
  processing: "processing",
  active: "active",
  "partially received": "processing",
});

const parseStringValue = (value) => String(value ?? "").trim();
const normalizeKey = (value) => parseStringValue(value).toLowerCase();

const pickRandomTone = (tones) =>
  tones[Math.floor(Math.random() * tones.length)];

const pickToneFromSeed = (seed, tones) => {
  const palette = Array.isArray(tones) && tones.length ? tones : SUPPLIER_TONES;
  const normalizedSeed = parseStringValue(seed);
  if (!normalizedSeed) return pickRandomTone(palette);
  const hash = normalizedSeed
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return palette[hash % palette.length];
};

const formatOpenPOStatusLabel = (status) => {
  const raw = parseStringValue(status);
  if (!raw) return "";
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const normalizeSupplierProducts = (products) => {
  if (!Array.isArray(products)) return [];

  const deduped = new Map();
  products.forEach((entry) => {
    const label = parseStringValue(
      typeof entry === "string" ? entry : entry?.label,
    );
    if (!label) return;

    const key = normalizeKey(label);
    const tone =
      parseStringValue(typeof entry === "object" ? entry?.tone : "") ||
      pickToneFromSeed(label, SUPPLIER_PRODUCT_TONES);

    if (!deduped.has(key)) {
      deduped.set(key, { label, tone });
    }
  });

  return Array.from(deduped.values());
};

const mergeSupplierProducts = (existingProducts, nextProducts) =>
  normalizeSupplierProducts([
    ...(Array.isArray(existingProducts) ? existingProducts : []),
    ...(Array.isArray(nextProducts) ? nextProducts : []),
  ]);

const buildPurchaseOrderSupplierProducts = (purchaseOrder) => {
  const items = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
  const itemLabels = items
    .map((item) => parseStringValue(item?.name))
    .filter(Boolean);
  const fallbackCategory = parseStringValue(purchaseOrder?.category);
  const labels = itemLabels.length
    ? itemLabels
    : fallbackCategory
      ? [fallbackCategory]
      : [];

  return normalizeSupplierProducts(labels);
};

const mapPurchaseOrderStatusToSupplierOpenPOStatus = (status) => {
  const normalizedStatus = normalizeKey(status);
  if (!normalizedStatus || PURCHASE_ORDER_CLOSED_STATUSES.has(normalizedStatus)) {
    return "";
  }
  return PURCHASE_ORDER_TO_SUPPLIER_STATUS[normalizedStatus] || "open";
};

const buildSupplierOpenPOSummary = (orders = []) => {
  const openStatuses = orders
    .map((order) =>
      mapPurchaseOrderStatusToSupplierOpenPOStatus(
        order?.status || order?.requestStatus,
      ),
    )
    .filter(Boolean);

  if (!openStatuses.length) {
    return { label: "0 Open", status: "open" };
  }

  const uniqueStatuses = Array.from(new Set(openStatuses));
  if (uniqueStatuses.length === 1) {
    const status = uniqueStatuses[0];
    return {
      label: `${openStatuses.length} ${formatOpenPOStatusLabel(status)}`,
      status,
    };
  }

  return {
    label: `${openStatuses.length} Open`,
    status: "open",
  };
};

const formatProductLabels = (products = []) =>
  normalizeSupplierProducts(products)
    .map((product) => product.label)
    .join(", ");

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const actor = await User.findOne({ role: "admin" }).select("_id").lean();
  const purchaseOrders = await PurchasingOrder.find({
    supplierName: { $exists: true, $nin: ["", null] },
  })
    .select("poNumber supplierName supplierTone category items status requestStatus")
    .sort({ dateRequestPlaced: 1, createdAt: 1 })
    .lean();
  const suppliers = await Supplier.find({}).sort({ createdAt: 1 });

  const supplierDocsByKey = new Map();
  const duplicateSupplierKeys = [];
  suppliers.forEach((supplier) => {
    const key = normalizeKey(supplier.name);
    if (!key) return;
    if (supplierDocsByKey.has(key)) {
      duplicateSupplierKeys.push(
        `${supplierDocsByKey.get(key).name} <-> ${supplier.name}`,
      );
      return;
    }
    supplierDocsByKey.set(key, supplier);
  });

  const groups = new Map();
  purchaseOrders.forEach((order) => {
    const supplierName = parseStringValue(order.supplierName);
    if (!supplierName) return;

    const key = normalizeKey(supplierName);
    if (!groups.has(key)) {
      groups.set(key, {
        name: supplierName,
        orders: [],
        supplierTone: parseStringValue(order.supplierTone),
      });
    }

    const entry = groups.get(key);
    entry.orders.push(order);
    if (!entry.supplierTone) {
      entry.supplierTone = parseStringValue(order.supplierTone);
    }
  });

  const summary = {
    purchaseOrders: purchaseOrders.length,
    supplierGroups: groups.size,
    existingSuppliers: suppliers.length,
    duplicateSupplierKeys: duplicateSupplierKeys.length,
    created: 0,
    updated: 0,
    unchanged: 0,
  };

  const preview = [];

  for (const [key, group] of groups.entries()) {
    const existingSupplier = supplierDocsByKey.get(key) || null;
    const poProducts = group.orders.flatMap((order) =>
      buildPurchaseOrderSupplierProducts(order),
    );
    const nextProducts = mergeSupplierProducts(
      existingSupplier?.products,
      poProducts,
    );
    const nextOpenPO = buildSupplierOpenPOSummary(group.orders);
    const canonicalName = parseStringValue(existingSupplier?.name) || group.name;
    const nextTone =
      parseStringValue(existingSupplier?.tone) ||
      parseStringValue(group.supplierTone) ||
      pickToneFromSeed(canonicalName, SUPPLIER_TONES);

    if (!existingSupplier) {
      summary.created += 1;
      preview.push({
        action: "create",
        supplier: canonicalName,
        products: formatProductLabels(nextProducts),
        openPO: nextOpenPO.label,
      });

      if (APPLY) {
        const created = await Supplier.create({
          name: canonicalName,
          products: nextProducts,
          openPO: nextOpenPO,
          tone: nextTone,
          createdBy: actor?._id,
          updatedBy: actor?._id,
        });
        supplierDocsByKey.set(key, created);
      }
      continue;
    }

    const currentProducts = normalizeSupplierProducts(existingSupplier.products);
    const currentOpenPO = {
      label: parseStringValue(existingSupplier.openPO?.label),
      status: parseStringValue(existingSupplier.openPO?.status),
    };
    const currentTone = parseStringValue(existingSupplier.tone);

    const productChanged =
      JSON.stringify(currentProducts) !== JSON.stringify(nextProducts);
    const openPOChanged =
      currentOpenPO.label !== nextOpenPO.label ||
      currentOpenPO.status !== nextOpenPO.status;
    const toneChanged = currentTone !== nextTone;

    if (!productChanged && !openPOChanged && !toneChanged) {
      summary.unchanged += 1;
      continue;
    }

    summary.updated += 1;
    preview.push({
      action: "update",
      supplier: canonicalName,
      products: formatProductLabels(nextProducts),
      openPO: nextOpenPO.label,
    });

    if (APPLY) {
      existingSupplier.products = nextProducts;
      existingSupplier.openPO = nextOpenPO;
      existingSupplier.tone = nextTone;
      if (actor?._id) {
        existingSupplier.updatedBy = actor._id;
      }
      await existingSupplier.save();
    }
  }

  console.log(`Purchase orders scanned: ${summary.purchaseOrders}`);
  console.log(`Supplier groups found in POs: ${summary.supplierGroups}`);
  console.log(`Existing suppliers: ${summary.existingSuppliers}`);
  if (duplicateSupplierKeys.length) {
    console.log(
      `Warning: ${duplicateSupplierKeys.length} duplicate supplier names found (case-insensitive).`,
    );
  }
  console.log(`Would create: ${summary.created}`);
  console.log(`Would update: ${summary.updated}`);
  console.log(`Unchanged: ${summary.unchanged}`);
  console.log(
    "Backfill source fields: supplier name, PO item names/category, supplier tone, and open-PO summary.",
  );
  console.log(
    "Contact person, phone, email, and code are preserved because they cannot be inferred from old purchase orders.",
  );

  if (preview.length) {
    console.log("");
    console.log("Preview:");
    preview.slice(0, 12).forEach((entry) => {
      console.log(
        `- ${entry.action.toUpperCase()}: ${entry.supplier} | Products: ${
          entry.products || "-"
        } | Open PO: ${entry.openPO}`,
      );
    });
    if (preview.length > 12) {
      console.log(`...and ${preview.length - 12} more`);
    }
  }

  if (!APPLY) {
    console.log("");
    console.log(
      "Dry run only. Re-run with --apply to write supplier backfill changes.",
    );
    await mongoose.disconnect();
    return;
  }

  console.log("");
  console.log("Supplier backfill complete.");
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Supplier backfill failed:", error);
  process.exit(1);
});
