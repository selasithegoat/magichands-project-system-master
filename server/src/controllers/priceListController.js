const PriceListItem = require("../models/PriceListItem");
const { hasInventoryPortalAccess } = require("../middleware/authMiddleware");

const parseStringValue = (value) => String(value ?? "").trim();

const ensureInventoryAccess = (req, res) => {
  if (!hasInventoryPortalAccess(req.user)) {
    res.status(403).json({ message: "Not authorized to access price list data." });
    return false;
  }
  return true;
};

const formatPriceModeLabel = (value) => {
  const normalized = parseStringValue(value).toLowerCase();
  if (!normalized) return "Unspecified";

  const customLabels = {
    single: "Single Price",
    multi_price: "Multiple Options",
    price_range: "Price Range",
    minimum_order: "Minimum Order",
    minimum_order_unit_cost: "MOQ Unit Cost",
    price_on_request: "Price on Request",
    missing_price: "Manual Pricing",
  };

  if (customLabels[normalized]) {
    return customLabels[normalized];
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getPriceListItems = async (req, res) => {
  if (!ensureInventoryAccess(req, res)) return;

  try {
    const items = await PriceListItem.find({ isActive: true })
      .sort({
        sectionOrder: 1,
        pageNumber: 1,
        itemOrder: 1,
        catalogOrder: 1,
      })
      .lean();

    const sectionMap = new Map();
    const priceModeMap = new Map();

    items.forEach((item) => {
      const sectionKey = parseStringValue(item.sectionKey) || "general";
      const existingSection = sectionMap.get(sectionKey);
      if (!existingSection) {
        sectionMap.set(sectionKey, {
          key: sectionKey,
          title: parseStringValue(item.sectionTitle) || "General",
          description: parseStringValue(item.sectionDescription),
          order: Number(item.sectionOrder) || 0,
          pageRangeLabel: parseStringValue(item.pageRangeLabel),
          count: 1,
        });
      } else {
        existingSection.count += 1;
      }

      const priceMode = parseStringValue(item.priceMode) || "single";
      const existingMode = priceModeMap.get(priceMode);
      if (!existingMode) {
        priceModeMap.set(priceMode, {
          value: priceMode,
          label: formatPriceModeLabel(priceMode),
          count: 1,
        });
      } else {
        existingMode.count += 1;
      }
    });

    const sections = Array.from(sectionMap.values()).sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title),
    );
    const priceModes = Array.from(priceModeMap.values()).sort(
      (a, b) => a.label.localeCompare(b.label),
    );

    res.json({
      data: items,
      total: items.length,
      sections,
      priceModes,
      sourcePdf: items[0]?.sourcePdf || "",
    });
  } catch (error) {
    console.error("Error fetching price list items:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getPriceListItems,
};
