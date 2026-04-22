#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const InventoryCategory = require("../src/models/InventoryCategory");
const InventoryItemIdentity = require("../src/models/InventoryItemIdentity");
const InventoryRecord = require("../src/models/InventoryRecord");
const PurchasingOrder = require("../src/models/PurchasingOrder");
const StockTransaction = require("../src/models/StockTransaction");

const resolveEnvPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, "..", raw);
};

const dotenvPath =
  resolveEnvPath(process.env.DOTENV_FILE) || path.resolve(__dirname, "../.env");
dotenv.config({ path: dotenvPath });

const DEFAULT_INPUT_FILE = path.resolve(
  __dirname,
  "../data/inventory-imports/souvenir-price-list/souvenir-price-list.clean.json",
);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const parseStringValue = (value) => String(value ?? "").trim();
const normalizeKey = (value) => parseStringValue(value).toLowerCase();
const escapeRegex = (value) =>
  parseStringValue(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) return fallback;
  return args[index + 1];
};

const buildExactRegex = (value) =>
  new RegExp(`^${escapeRegex(parseStringValue(value))}$`, "i");

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment.");
    process.exit(1);
  }

  const fileArg = getArgValue("--file", DEFAULT_INPUT_FILE);
  const filePath = path.isAbsolute(fileArg)
    ? fileArg
    : path.resolve(process.cwd(), fileArg);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error("Souvenir inventory import file must contain an array.");
  }

  const skuList = Array.from(
    new Set(entries.map((entry) => parseStringValue(entry?.sku)).filter(Boolean)),
  );
  const categoryList = Array.from(
    new Set(
      entries.map((entry) => parseStringValue(entry?.category)).filter(Boolean),
    ),
  );

  await mongoose.connect(process.env.MONGO_URI);

  const records = await InventoryRecord.find({ sku: { $in: skuList } })
    .select("_id sku item category createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const recordSkuList = records.map((record) => record.sku);
  const stockTransactions = await StockTransaction.find({
    sku: { $in: recordSkuList },
  })
    .select("_id sku item type createdAt")
    .lean();

  if (stockTransactions.length) {
    console.error(
      `Refusing to retract ${recordSkuList.length} souvenir inventory records because ${stockTransactions.length} stock transactions already reference them.`,
    );
    console.error(
      "Delete or migrate those stock transactions first if you truly want to remove the mistaken inventory records.",
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const identities = await InventoryItemIdentity.find({
    itemId: { $in: recordSkuList },
  })
    .select("_id itemName itemId createdAt")
    .lean();

  const createdAtValues = records
    .map((record) => record.createdAt)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const importWindowStart = createdAtValues.length
    ? new Date(createdAtValues[0].getTime() - 10 * 60 * 1000)
    : null;
  const importWindowEnd = createdAtValues.length
    ? new Date(createdAtValues[createdAtValues.length - 1].getTime() + 10 * 60 * 1000)
    : null;

  let categoriesDeleted = 0;
  const categoryPreview = [];

  for (const categoryName of categoryList) {
    const categoryDoc = await InventoryCategory.findOne({
      name: buildExactRegex(categoryName),
    });
    if (!categoryDoc) continue;

    const [remainingInventoryCount, purchasingOrderCount] = await Promise.all([
      InventoryRecord.countDocuments({
        _id: { $nin: records.map((record) => record._id) },
        category: buildExactRegex(categoryName),
      }),
      PurchasingOrder.countDocuments({
        category: buildExactRegex(categoryName),
      }),
    ]);

    const createdAt = categoryDoc.createdAt ? new Date(categoryDoc.createdAt) : null;
    const withinImportWindow =
      createdAt &&
      importWindowStart &&
      importWindowEnd &&
      createdAt >= importWindowStart &&
      createdAt <= importWindowEnd;

    const shouldDelete =
      remainingInventoryCount === 0 &&
      purchasingOrderCount === 0 &&
      Boolean(withinImportWindow);

    categoryPreview.push({
      name: categoryDoc.name,
      remainingInventoryCount,
      purchasingOrderCount,
      withinImportWindow: Boolean(withinImportWindow),
      action: shouldDelete ? "delete" : "keep",
    });

    if (APPLY && shouldDelete) {
      await InventoryCategory.deleteOne({ _id: categoryDoc._id });
      categoriesDeleted += 1;
    }
  }

  console.log(`Input file: ${filePath}`);
  console.log(`Target souvenir SKUs: ${skuList.length}`);
  console.log(`Inventory records found: ${records.length}`);
  console.log(`Inventory identities found: ${identities.length}`);
  console.log(`Categories considered: ${categoryList.length}`);

  if (categoryPreview.length) {
    console.log("");
    console.log("Category cleanup preview:");
    categoryPreview.forEach((entry) => {
      console.log(
        `- ${entry.action.toUpperCase()}: ${entry.name} | Remaining inventory: ${entry.remainingInventoryCount} | Purchase orders: ${entry.purchasingOrderCount} | Imported window match: ${entry.withinImportWindow}`,
      );
    });
  }

  if (!APPLY) {
    console.log("");
    console.log(
      "Dry run only. Re-run with --apply to retract the mistaken souvenir inventory import.",
    );
    await mongoose.disconnect();
    return;
  }

  const recordDeleteResult = await InventoryRecord.deleteMany({
    sku: { $in: recordSkuList },
  });
  const identityDeleteResult = await InventoryItemIdentity.deleteMany({
    itemId: { $in: recordSkuList },
  });

  console.log("");
  console.log(`Deleted inventory records: ${recordDeleteResult.deletedCount || 0}`);
  console.log(
    `Deleted inventory item identities: ${identityDeleteResult.deletedCount || 0}`,
  );
  console.log(`Deleted unused categories: ${categoriesDeleted}`);
  console.log("Souvenir inventory rollback complete.");

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Souvenir inventory rollback failed:", error);
  process.exit(1);
});
