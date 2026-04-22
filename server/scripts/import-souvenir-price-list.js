#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const PriceListItem = require("../src/models/PriceListItem");
const User = require("../src/models/User");

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
  "../data/inventory-imports/souvenir-price-list/souvenir-price-list.items.json",
);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const parseStringValue = (value) => String(value ?? "").trim();

const parseNumberValue = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeList = (value) =>
  Array.isArray(value)
    ? value.map((entry) => parseStringValue(entry)).filter(Boolean)
    : [];

const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) return fallback;
  return args[index + 1];
};

const buildPayload = (entry, actorId) => {
  const priceValues = normalizeList(entry.priceValues)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  return {
    entryKey: parseStringValue(entry.entryKey),
    slug: parseStringValue(entry.slug),
    title: parseStringValue(entry.title),
    titleKey: parseStringValue(entry.titleKey).toLowerCase(),
    sectionKey: parseStringValue(entry.sectionKey),
    sectionTitle: parseStringValue(entry.sectionTitle),
    sectionDescription: parseStringValue(entry.sectionDescription),
    sectionOrder: parseNumberValue(entry.sectionOrder) || 0,
    pageRangeLabel: parseStringValue(entry.pageRangeLabel),
    pageNumber: parseNumberValue(entry.pageNumber) || 0,
    pageLabel: parseStringValue(entry.pageLabel),
    itemOrder: parseNumberValue(entry.itemOrder) || 0,
    catalogOrder: parseNumberValue(entry.catalogOrder) || 0,
    description: parseStringValue(entry.description),
    detailLines: normalizeList(entry.detailLines),
    detailSummary: parseStringValue(entry.detailSummary),
    priceText: parseStringValue(entry.priceText),
    priceLines: normalizeList(entry.priceLines),
    priceMode: parseStringValue(entry.priceMode) || "single",
    priceValues,
    priceMin:
      parseNumberValue(entry.priceMin) ??
      (priceValues.length ? Math.min(...priceValues) : null),
    priceMax:
      parseNumberValue(entry.priceMax) ??
      (priceValues.length ? Math.max(...priceValues) : null),
    searchText: parseStringValue(entry.searchText),
    sourcePdf: parseStringValue(entry.sourcePdf),
    sourcePath: parseStringValue(entry.sourcePath),
    sourceTable: parseNumberValue(entry.sourceTable) || 0,
    sourceRow: parseNumberValue(entry.sourceRow) || 0,
    isActive: entry.isActive !== false,
    createdBy: actorId,
    updatedBy: actorId,
  };
};

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
    throw new Error("Price list import file must contain an array.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const actor = await User.findOne({ role: "admin" }).select("_id").lean();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const preview = [];

  for (const entry of entries) {
    const entryKey = parseStringValue(entry.entryKey);
    const title = parseStringValue(entry.title);
    if (!entryKey || !title) {
      skipped += 1;
      continue;
    }

    const existing = await PriceListItem.findOne({ entryKey }).select("_id createdBy");
    const payload = buildPayload(entry, actor?._id);

    if (!existing) {
      created += 1;
      preview.push({
        action: "create",
        title,
        section: payload.sectionTitle,
        page: payload.pageLabel,
      });

      if (APPLY) {
        await PriceListItem.create(payload);
      }
      continue;
    }

    updated += 1;
    preview.push({
      action: "update",
      title,
      section: payload.sectionTitle,
      page: payload.pageLabel,
    });

    if (APPLY) {
      await PriceListItem.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...payload,
            createdBy: existing.createdBy || actor?._id,
          },
        },
      );
    }
  }

  console.log(`Input file: ${filePath}`);
  console.log(`Rows scanned: ${entries.length}`);
  console.log(`Would create: ${created}`);
  console.log(`Would update: ${updated}`);
  console.log(`Skipped: ${skipped}`);

  if (preview.length) {
    console.log("");
    console.log("Preview:");
    preview.slice(0, 12).forEach((entry) => {
      console.log(
        `- ${entry.action.toUpperCase()}: ${entry.title} | ${entry.section} | ${entry.page}`,
      );
    });
    if (preview.length > 12) {
      console.log(`...and ${preview.length - 12} more`);
    }
  }

  if (!APPLY) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to write price list items.");
    await mongoose.disconnect();
    return;
  }

  console.log("");
  console.log("Souvenir price list import complete.");
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Souvenir price list import failed:", error);
  process.exit(1);
});
