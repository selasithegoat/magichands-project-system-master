#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const InventoryRecord = require("../src/models/InventoryRecord");
const InventoryCategory = require("../src/models/InventoryCategory");
const User = require("../src/models/User");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const normalizeName = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeName(value).toLowerCase();

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const adminUser = await User.findOne({ role: "admin" }).select("_id");
  const existing = await InventoryCategory.find()
    .select("name")
    .lean();

  const existingKeys = new Map();
  const duplicateKeys = [];
  existing.forEach((category) => {
    const key = normalizeKey(category.name);
    if (!key) return;
    if (existingKeys.has(key) && existingKeys.get(key) !== category.name) {
      duplicateKeys.push([existingKeys.get(key), category.name]);
      return;
    }
    existingKeys.set(key, category.name);
  });

  const rawCategories = await InventoryRecord.distinct("category", {
    category: { $ne: "" },
  });

  const toCreate = [];
  rawCategories.forEach((entry) => {
    const name = normalizeName(entry);
    if (!name) return;
    const key = normalizeKey(name);
    if (!key || existingKeys.has(key)) return;
    existingKeys.set(key, name);
    toCreate.push({
      name,
      description: "",
      createdBy: adminUser?._id,
      updatedBy: adminUser?._id,
    });
  });

  console.log(
    `Inventory categories found in records: ${rawCategories.length}. Existing: ${existing.length}. To create: ${toCreate.length}.`,
  );
  if (duplicateKeys.length) {
    console.log(
      `Warning: ${duplicateKeys.length} duplicate category keys found (case-insensitive).`,
    );
  }

  const normalization = [];
  for (const rawEntry of rawCategories) {
    const rawValue = String(rawEntry || "");
    const normalized = normalizeName(rawValue);
    if (!normalized) continue;
    const key = normalizeKey(normalized);
    const canonical = existingKeys.get(key);
    if (!canonical) continue;
    if (rawValue === canonical) continue;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalization.push({
      rawValue,
      canonical,
      regex: new RegExp(`^\\s*${escaped}\\s*$`, "i"),
    });
  }

  console.log(
    `Inventory records needing category normalization: ${normalization.length}.`,
  );

  if (!APPLY) {
    console.log("Dry run only. Use --apply to insert categories.");
    await mongoose.disconnect();
    return;
  }

  if (toCreate.length) {
    await InventoryCategory.insertMany(toCreate, { ordered: false });
  }

  let updatedCount = 0;
  for (const entry of normalization) {
    const result = await InventoryRecord.updateMany(
      { category: entry.regex },
      { category: entry.canonical },
    );
    updatedCount += result.modifiedCount || 0;
  }

  console.log(`Inventory records normalized: ${updatedCount}.`);

  console.log("Inventory category backfill complete.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Inventory category backfill failed:", err);
  process.exit(1);
});
