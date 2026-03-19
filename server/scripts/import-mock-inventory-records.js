const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const InventoryRecord = require("../src/models/InventoryRecord");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const CATEGORY_TONES = ["blue", "indigo", "slate", "amber"];
const STATUS_TONES = ["blue", "green", "amber", "rose", "indigo", "slate"];

const parseStringValue = (value) => String(value ?? "").trim();

const parseCurrencyNumber = (value) => {
  const raw = parseStringValue(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.,-]/g, "");
  const numeric = Number.parseFloat(cleaned.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
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

const formatVariantQtyLabel = (value) => {
  if (!Number.isFinite(value)) return "";
  const normalized = Number.isInteger(value)
    ? value
    : Number(value.toFixed(2));
  return `${normalized.toLocaleString("en-US")} Units`;
};

const sumVariantQty = (variants) => {
  if (!Array.isArray(variants)) return null;
  const values = variants
    .map((variant) => variant?.qtyValue)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
};

const buildQtyLabelFromVariants = (variants) => {
  const total = sumVariantQty(variants);
  if (!Number.isFinite(total)) return "";
  return formatVariantQtyLabel(total);
};

const flattenBrandGroups = (groups) =>
  groups.reduce((acc, group) => acc.concat(group?.variants || []), []);

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
        const resolvedQty = Number.isFinite(variantQty)
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
    const resolvedQty = Number.isFinite(groupQty)
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

const ensureSeedUser = async () => {
  let user = await User.findOne({ role: "admin" });
  if (user) return user;

  user = await User.create({
    firstName: "Inventory",
    lastName: "Seed",
    employeeId: "INV-SEED",
    password: "ChangeMe123!",
    role: "admin",
    department: ["Administration"],
  });

  return user;
};

const normalizeVariant = (variant) => {
  const qtyValue = Number.isFinite(variant?.qtyValue)
    ? Number(variant.qtyValue)
    : null;
  return {
    name: parseStringValue(variant?.name || variant?.variantName),
    color: parseStringValue(variant?.color),
    sku: parseStringValue(variant?.sku),
    price: parseStringValue(variant?.price),
    priceValue: Number.isFinite(variant?.priceValue)
      ? Number(variant.priceValue)
      : parseCurrencyNumber(variant?.price),
    status: parseStringValue(variant?.status) || "In Stock",
    qtyValue,
    qtyLabel: formatVariantQtyLabel(qtyValue),
  };
};

const normalizeBrandGroups = (brandGroups) =>
  (Array.isArray(brandGroups) ? brandGroups : []).map((group) => {
    const variants = Array.isArray(group?.variants)
      ? group.variants.map(normalizeVariant)
      : [];
    const priceValue = Number.isFinite(group?.priceValue)
      ? Number(group.priceValue)
      : parseCurrencyNumber(group?.price);
    return {
      name: parseStringValue(group?.name || group?.brand),
      price: parseStringValue(group?.price),
      priceValue,
      variants,
    };
  });

const buildInventoryRecord = (entry, auditFields) => {
  const item = parseStringValue(entry.item);
  const sku = parseStringValue(entry.sku);
  const warehouse = parseStringValue(entry.warehouse);
  const brandGroups = normalizeBrandGroups(entry.brandGroups);
  const hasBrandGroups = brandGroups.length > 0;
  const variants = hasBrandGroups
    ? flattenBrandGroups(brandGroups)
    : Array.isArray(entry.variants)
      ? entry.variants.map(normalizeVariant)
      : [];

  const rawQtyValue = Number.isFinite(entry.qtyValue)
    ? Number(entry.qtyValue)
    : null;
  const derivedQtyValue = variants.length
    ? sumVariantQty(variants) ?? rawQtyValue
    : rawQtyValue;
  const derivedLabel = variants.length
    ? buildQtyLabelFromVariants(variants) || formatVariantQtyLabel(derivedQtyValue)
    : formatVariantQtyLabel(derivedQtyValue);

  const maxQty = Number.isFinite(entry.maxQty) ? Number(entry.maxQty) : null;
  const qtyMeta = computeQtyMetaFromCapacity(derivedQtyValue, maxQty);

  const brandTotals = hasBrandGroups
    ? computeBrandGroupTotals(brandGroups, derivedQtyValue)
    : null;

  const priceValue = hasBrandGroups
    ? brandTotals?.minPrice ?? null
    : parseCurrencyNumber(entry.price);

  const computedValue = hasBrandGroups
    ? brandTotals?.totalValue
    : Number.isFinite(priceValue) && Number.isFinite(derivedQtyValue)
      ? Number((priceValue * derivedQtyValue).toFixed(2))
      : null;

  const primaryBrand = hasBrandGroups
    ? brandGroups.find((group) => group.name)?.name || ""
    : parseStringValue(entry.brand);

  return {
    item,
    warehouse,
    subtext: warehouse,
    sku,
    brand: primaryBrand,
    brandGroups: hasBrandGroups ? brandGroups : [],
    category: parseStringValue(entry.category),
    categoryTone: pickRandomTone(CATEGORY_TONES),
    qtyLabel: derivedLabel,
    qtyValue: derivedQtyValue,
    maxQty,
    qtyMeta,
    variations: parseStringValue(entry.variations),
    colors: parseStringValue(entry.colors),
    variants: hasBrandGroups ? variants : variants,
    price: hasBrandGroups ? "" : parseStringValue(entry.price),
    priceValue,
    value: computedValue !== null ? Number(computedValue).toFixed(2) : "",
    valueValue: computedValue !== null ? Number(computedValue) : null,
    status: parseStringValue(entry.status) || "In Stock",
    statusTone: pickRandomTone(STATUS_TONES),
    reorder: Boolean(entry.reorder),
    image: parseStringValue(entry.image),
    ...auditFields,
  };
};

const importRecords = async () => {
  const fileArgIndex = process.argv.indexOf("--file");
  const filePath =
    fileArgIndex >= 0 && process.argv[fileArgIndex + 1]
      ? process.argv[fileArgIndex + 1]
      : path.resolve(__dirname, "mock-inventory-records.json");
  const shouldUpsert = process.argv.includes("--upsert");
  const isDryRun = process.argv.includes("--dry-run");

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set.");
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const raw = fs.readFileSync(absolutePath, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error("Mock inventory file must contain an array.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const seedUser = await ensureSeedUser();
  const auditFields = seedUser
    ? { createdBy: seedUser._id, updatedBy: seedUser._id }
    : {};

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    const sku = parseStringValue(entry.sku);
    const item = parseStringValue(entry.item);
    if (!sku || !item) {
      skipped += 1;
      continue;
    }

    const existing = await InventoryRecord.findOne({ sku });
    if (existing && !shouldUpsert) {
      skipped += 1;
      continue;
    }

    const payload = buildInventoryRecord(entry, auditFields);

    if (isDryRun) {
      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
      continue;
    }

    if (existing) {
      await InventoryRecord.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...payload,
            createdBy: existing.createdBy || auditFields.createdBy,
          },
        },
      );
      updated += 1;
    } else {
      await InventoryRecord.create(payload);
      created += 1;
    }
  }

  console.log(
    `Mock inventory import complete. Created: ${created}. Updated: ${updated}. Skipped: ${skipped}.`,
  );

  await mongoose.disconnect();
};

importRecords().catch((error) => {
  console.error("Mock inventory import failed:", error);
  mongoose.disconnect();
  process.exit(1);
});
