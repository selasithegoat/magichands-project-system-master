import { formatCurrencyValue, parseCurrencyValue } from "./currency";

const EXPORT_HEADERS = [
  "Item",
  "SKU",
  "Category",
  "Warehouse",
  "Brand",
  "Variant",
  "Variant SKU",
  "Variant Status",
  "Colors/Kind",
  "Quantity",
  "Total Quantity",
  "Price",
  "Value",
  "Record Status",
  "Reorder",
];

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseQtyValue = (entry) =>
  parseNumber(entry?.qtyValue ?? entry?.qtyLabel ?? entry?.qty);

const sumQty = (values) => {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0);
};

const resolveVariantQty = (variant) => {
  if (Array.isArray(variant?.colors) && variant.colors.length) {
    const colorQty = variant.colors.map(parseQtyValue);
    const total = sumQty(colorQty);
    if (Number.isFinite(total)) return total;
  }
  return parseQtyValue(variant);
};

const resolveRecordQty = (record, brandGroups) => {
  const direct = parseNumber(record?.qtyValue ?? record?.qtyLabel);
  if (Number.isFinite(direct)) return direct;

  const variantTotals = [];
  brandGroups.forEach((group) => {
    if (!Array.isArray(group?.variants)) return;
    group.variants.forEach((variant) => {
      const qty = resolveVariantQty(variant);
      if (Number.isFinite(qty)) {
        variantTotals.push(qty);
      }
    });
  });

  return sumQty(variantTotals);
};

const resolveBrandGroups = (record) => {
  const groups = Array.isArray(record?.brandGroups)
    ? record.brandGroups
    : [];
  if (groups.length) return groups;
  return [
    {
      name: record?.brand || "",
      price: record?.price || "",
      priceValue:
        parseNumber(record?.priceValue) ?? parseCurrencyValue(record?.price),
      variants: Array.isArray(record?.variants) ? record.variants : [],
    },
  ];
};

const formatQty = (value) => {
  if (!Number.isFinite(value)) return "";
  const normalized = Number.isInteger(value) ? value : Number(value.toFixed(2));
  return normalized.toLocaleString("en-US");
};

const buildRow = (data) =>
  EXPORT_HEADERS.reduce((acc, key) => {
    acc[key] = data[key] ?? "";
    return acc;
  }, {});

const buildRowValue = (rowQty, unitValue, currency, rate) => {
  if (!Number.isFinite(rowQty) || !Number.isFinite(unitValue)) return "";
  const total = Number((unitValue * rowQty).toFixed(2));
  return formatCurrencyValue(total, currency, rate);
};

export const buildInventoryRecordExportRows = (
  records = [],
  currency = "GHS",
  rate = 1,
) => {
  const rows = [];

  records.forEach((record) => {
    const brandGroups = resolveBrandGroups(record);
    const recordQty = resolveRecordQty(record, brandGroups);
    const recordValueTotal = parseNumber(
      record?.valueValue ?? record?.value,
    );
    const recordUnitValue =
      Number.isFinite(recordValueTotal) && Number.isFinite(recordQty) && recordQty
        ? recordValueTotal / recordQty
        : null;

    const base = {
      Item: record?.item || "",
      SKU: record?.sku || "",
      Category: record?.category || "",
      Warehouse: record?.warehouse || record?.subtext || "",
      "Record Status": record?.status || "",
      Reorder: record?.reorder ? "Yes" : "No",
    };

    brandGroups.forEach((group) => {
      const groupPriceValue =
        parseNumber(group?.priceValue) ?? parseCurrencyValue(group?.price);
      const unitValue = Number.isFinite(groupPriceValue)
        ? groupPriceValue
        : recordUnitValue;
      const priceLabel = Number.isFinite(unitValue)
        ? formatCurrencyValue(unitValue, currency, rate)
        : "";
      const variants = Array.isArray(group?.variants) ? group.variants : [];
      const brandName = group?.name || record?.brand || "";

      if (!variants.length) {
        rows.push(
          buildRow({
            ...base,
            Brand: brandName,
            Variant: "",
            "Variant SKU": "",
            "Variant Status": "",
            "Colors/Kind": "",
            Quantity: formatQty(recordQty),
            "Total Quantity": formatQty(recordQty),
            Price: priceLabel,
            Value: buildRowValue(recordQty, unitValue, currency, rate),
          }),
        );
        return;
      }

      variants.forEach((variant) => {
        const variantPriceValue =
          parseNumber(variant?.priceValue) ??
          parseCurrencyValue(variant?.price);
        const rowUnitValue = Number.isFinite(variantPriceValue)
          ? variantPriceValue
          : unitValue;
        const rowPriceLabel = Number.isFinite(rowUnitValue)
          ? formatCurrencyValue(rowUnitValue, currency, rate)
          : "";
        const variantName =
          variant?.name || variant?.variantName || variant?.variation || "";
        const variantSku = variant?.sku || "";
        const variantStatus = variant?.status || record?.status || "";
        const variantQty = resolveVariantQty(variant);
        const colors = Array.isArray(variant?.colors)
          ? variant.colors.filter(
              (color) =>
                color?.name ||
                color?.color ||
                color?.kind ||
                Number.isFinite(parseQtyValue(color)),
            )
          : [];

        if (colors.length) {
          colors.forEach((color) => {
            const colorName = color?.name || color?.color || color?.kind || "";
            const colorQty = parseQtyValue(color);
            const rowQty = Number.isFinite(colorQty)
              ? colorQty
              : Number.isFinite(variantQty)
                ? variantQty
                : recordQty;
            rows.push(
              buildRow({
                ...base,
                Brand: brandName,
                Variant: variantName,
                "Variant SKU": variantSku,
                "Variant Status": variantStatus,
                "Colors/Kind": colorName,
                Quantity: formatQty(rowQty),
                "Total Quantity": formatQty(recordQty),
                Price: rowPriceLabel || priceLabel,
                Value: buildRowValue(rowQty, rowUnitValue, currency, rate),
              }),
            );
          });
          return;
        }

        const rowQty = Number.isFinite(variantQty) ? variantQty : recordQty;
        rows.push(
          buildRow({
            ...base,
            Brand: brandName,
            Variant: variantName,
            "Variant SKU": variantSku,
            "Variant Status": variantStatus,
            "Colors/Kind": "",
            Quantity: formatQty(rowQty),
            "Total Quantity": formatQty(recordQty),
            Price: rowPriceLabel || priceLabel,
            Value: buildRowValue(rowQty, rowUnitValue, currency, rate),
          }),
        );
      });
    });
  });

  return rows;
};

export const INVENTORY_RECORD_EXPORT_HEADERS = EXPORT_HEADERS;
