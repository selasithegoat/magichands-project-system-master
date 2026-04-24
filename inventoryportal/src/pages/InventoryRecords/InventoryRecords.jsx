import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ColumnsIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  ShareIcon,
  SortIcon,
  TrashIcon,
  WarningIcon,
} from "../../components/icons/Icons";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Breadcrumb from "../../components/ui/Breadcrumb";
import Modal from "../../components/ui/Modal";
import { fetchInventory, parseListResponse } from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import useInventoryGlobalSearch from "../../hooks/useInventoryGlobalSearch";
import {
  formatCurrencyPlaceholder,
  formatCurrencyPair,
  formatCurrencyValue,
  getCurrencyPrefix,
  parseCurrencyValue,
  useInventoryCurrency,
} from "../../utils/currency";
import {
  getExportExtension,
  useInventoryExportFormat,
} from "../../utils/exportFormat";
import { buildInventoryRecordExportRows } from "../../utils/inventoryRecordExport";
import "./InventoryRecords.css";

const DEFAULT_RECORD_FORM = {
  item: "",
  warehouse: "",
  shelfLocation: "",
  sku: "",
  category: "",
  qtyLabel: "",
  qtyValue: "",
  maxQty: "",
  variations: "",
  colors: "",
  brandGroups: [],
  price: "",
  value: "",
  status: "In Stock",
  image: "",
  reorder: false,
};

const DEFAULT_FILTERS = {
  categories: [],
  priceMin: "",
  priceMax: "",
  stockLevel: "All Stock Levels",
  variantStatus: "All Variant Statuses",
  warehouse: "All Locations",
  reorder: "all",
};

const DEFAULT_VISIBLE_COLUMNS = {
  item: true,
  sku: true,
  shelfLocation: false,
  brand: true,
  category: true,
  quantity: true,
  variations: false,
  colors: false,
  price: true,
  value: true,
  status: true,
};

const STOCK_LEVEL_OPTIONS = [
  "All Stock Levels",
  "In Stock",
  "Low Stock",
  "Out of Stock",
  "Critical",
  "Oversupply",
];

const VARIANT_STATUS_FILTER_OPTIONS = [
  "All Variant Statuses",
  "In Stock",
  "Low Stock",
  "Out of Stock",
  "Critical",
  "Oversupply",
];

const VARIANT_STATUS_OPTIONS = [
  "In Stock",
  "Low Stock",
  "Out of Stock",
  "Critical",
  "Oversupply",
];

const SORT_OPTIONS = [
  { value: "-createdAt", label: "Newest" },
  { value: "createdAt", label: "Oldest" },
  { value: "item", label: "Item A-Z" },
  { value: "-item", label: "Item Z-A" },
  { value: "sku", label: "Item ID A-Z" },
  { value: "category", label: "Category A-Z" },
  { value: "status", label: "Status A-Z" },
  { value: "priceValue", label: "Price Low-High" },
  { value: "-priceValue", label: "Price High-Low" },
];

const TAB_OPTIONS = ["All Items", "Low Stock", "In Warehouse"];

const computeQtyMeta = (qtyValue, maxQty) => {
  if (!Number.isFinite(qtyValue) || !Number.isFinite(maxQty) || maxQty <= 0) {
    return "";
  }
  const ratio = Math.round((qtyValue / maxQty) * 100);
  return `${ratio}%`;
};

const formatQtyLabel = (value) => {
  if (!Number.isFinite(value)) return "";
  const normalized = Number.isInteger(value)
    ? value
    : Number(value.toFixed(2));
  return `${normalized.toLocaleString("en-US")} Units`;
};

const parseQtyValue = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const parsePriceValue = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const numeric = parseCurrencyValue(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const resolveVariantStatus = (value, fallback) => {
  const normalized = String(value || "").trim();
  if (normalized) return normalized;
  const fallbackValue = String(fallback || "").trim();
  return fallbackValue || "In Stock";
};

const sumVariantQty = (entries) => {
  if (!Array.isArray(entries)) return null;
  const values = entries
    .map((entry) => {
      if (Array.isArray(entry?.colors) && entry.colors.length) {
        const nested = sumVariantQty(entry.colors);
        return Number.isFinite(nested) ? nested : null;
      }
      const raw = entry?.qtyValue;
      if (raw === "" || raw === null || raw === undefined) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    })
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
};

const buildQtyLabelFromVariants = (variants) => {
  const total = sumVariantQty(variants);
  if (!Number.isFinite(total)) return "";
  return formatQtyLabel(total);
};

const buildVariantSummary = (variants, fallback, type) => {
  if (!variants?.length) {
    return fallback || "-";
  }
  const values = new Set();
  variants.forEach((variant) => {
    if (type === "color") {
      if (Array.isArray(variant?.colors) && variant.colors.length) {
        variant.colors.forEach((color) => {
          if (color?.name) values.add(color.name);
        });
      } else if (variant?.color) {
        values.add(variant.color);
      }
      return;
    }
    if (variant?.name) values.add(variant.name);
  });
  const list = Array.from(values);
  if (!list.length) {
    return type === "color"
      ? `${variants.length} colors`
      : `${variants.length} variants`;
  }
  if (list.length === 1) {
    return list[0];
  }
  return type === "color"
    ? `${list.length} colors`
    : `${list.length} variants`;
};

const buildVariantStatusSummary = (variants, fallback) => {
  if (!variants?.length) return fallback || "-";
  const values = Array.from(
    new Set(
      variants
        .map((variant) => String(variant?.status || "").trim())
        .filter(Boolean),
    ),
  );
  if (!values.length) return fallback || "-";
  if (values.length <= 3) return values.join(", ");
  return `${values.length} statuses`;
};

const formatVariantColors = (variant) => {
  if (Array.isArray(variant?.colors) && variant.colors.length) {
    return variant.colors
      .map((color) => {
        const name = color?.name || "-";
        const qty =
          color?.qtyLabel ||
          (Number.isFinite(color?.qtyValue)
            ? formatQtyLabel(color.qtyValue)
            : "");
        return qty ? `${name} (${qty})` : name;
      })
      .join(", ");
  }
  return variant?.color || "-";
};

const getVariantQtyValue = (variant) => sumVariantQty([variant]);

const normalizeVariants = (variants = [], fallbackStatus = "In Stock") =>
  Array.isArray(variants)
    ? variants.map((variant, index) => ({
        id: variant._id || variant.id || `${index}`,
        name: variant.name || variant.variantName || "",
        color: variant.color || "",
        colors: Array.isArray(variant.colors)
          ? variant.colors.map((color, colorIndex) => ({
              id: color._id || color.id || `color-${index}-${colorIndex}`,
              name: color.name || color.color || "",
              qtyValue: Number.isFinite(color.qtyValue)
                ? color.qtyValue
                : color.qtyValue === 0
                  ? 0
                  : "",
              qtyLabel: color.qtyLabel || "",
            }))
          : [],
        sku: variant.sku || "",
        price: variant.price || "",
        priceValue: Number.isFinite(variant.priceValue)
          ? variant.priceValue
          : variant.price
            ? parsePriceValue(variant.price)
            : null,
        status: resolveVariantStatus(variant.status, fallbackStatus),
        qtyValue: Number.isFinite(variant.qtyValue)
          ? variant.qtyValue
          : variant.qtyValue === 0
            ? 0
            : "",
      }))
    : [];

const normalizeBrandGroups = (brandGroups = [], fallbackStatus = "In Stock") =>
  Array.isArray(brandGroups)
    ? brandGroups.map((group, index) => ({
        id: group._id || group.id || `brand-${index}`,
        name: group.name || group.brand || "",
        price: group.price || "",
        priceValue: Number.isFinite(group.priceValue)
          ? group.priceValue
          : group.price
            ? parsePriceValue(group.price)
            : null,
        variants: normalizeVariants(group.variants, fallbackStatus),
      }))
    : [];

const flattenBrandGroups = (brandGroups = []) => {
  if (!Array.isArray(brandGroups)) return [];
  return brandGroups.reduce(
    (acc, group) => acc.concat(group?.variants || []),
    [],
  );
};

const getBrandDisplay = (record) => {
  const groups = Array.isArray(record.brandGroups)
    ? record.brandGroups.filter((group) => group.name)
    : [];
  if (groups.length) {
    const primary = groups[0]?.name || "";
    return {
      primary,
      extraCount: Math.max(groups.length - 1, 0),
    };
  }
  return {
    primary: record.brand || "",
    extraCount: 0,
  };
};

const getBrandPriceValues = (brandGroups = []) => {
  const values = [];
  brandGroups.forEach((group) => {
    const groupPrice = Number.isFinite(group?.priceValue)
      ? group.priceValue
      : group?.price
        ? parsePriceValue(group.price)
        : null;
    if (Number.isFinite(groupPrice)) {
      values.push(groupPrice);
    }
    const variants = Array.isArray(group?.variants) ? group.variants : [];
    variants.forEach((variant) => {
      const variantPrice = Number.isFinite(variant?.priceValue)
        ? variant.priceValue
        : variant?.price
          ? parsePriceValue(variant.price)
          : null;
      if (Number.isFinite(variantPrice)) {
        values.push(variantPrice);
      }
    });
  });
  return values.filter((value) => Number.isFinite(value));
};

const getRecordPriceInfo = (record) => {
  if (!record) return { type: "none" };
  const brandValues = getBrandPriceValues(record.brandGroups || []);
  const normalizedValues = brandValues
    .filter((value) => Number.isFinite(value))
    .map((value) => Number(value.toFixed(2)));
  const distinctValues = Array.from(new Set(normalizedValues));
  if (distinctValues.length > 1) {
    return {
      type: "range",
      min: Math.min(...distinctValues),
      max: Math.max(...distinctValues),
    };
  }
  const fallbackValue =
    distinctValues.length === 1 ? distinctValues[0] : null;
  const recordPriceValue = Number.isFinite(record.priceValue)
    ? record.priceValue
    : record.price
      ? parsePriceValue(record.price)
      : null;
  const resolvedValue = Number.isFinite(fallbackValue)
    ? fallbackValue
    : recordPriceValue;
  if (Number.isFinite(resolvedValue)) {
    return { type: "single", value: resolvedValue };
  }
  return { type: "none" };
};

const getAlternateCurrency = (currency) =>
  String(currency || "").toUpperCase() === "USD" ? "GHS" : "USD";

const formatCurrencyRange = (min, max, currency, rate) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  const minLabel = formatCurrencyValue(min, currency, rate);
  const maxLabel = formatCurrencyValue(max, currency, rate);
  if (min === max) return minLabel;
  return `${minLabel} - ${maxLabel}`;
};

const formatCurrencyRangeTooltip = (min, max, currency, rate) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  const alt = getAlternateCurrency(currency);
  const minLabel = formatCurrencyValue(min, alt, rate);
  const maxLabel = formatCurrencyValue(max, alt, rate);
  if (min === max) return minLabel;
  return `${minLabel} - ${maxLabel}`;
};

const getBrandGroupQty = (group, fallbackQty, totalGroups) => {
  const groupQty = sumVariantQty(group?.variants || []);
  if (Number.isFinite(groupQty)) return groupQty;
  if (totalGroups === 1) return fallbackQty;
  return null;
};

const computeBrandGroupValue = (brandGroups = [], fallbackQty) => {
  if (!brandGroups.length) return null;
  let total = 0;
  let hasValue = false;
  brandGroups.forEach((group) => {
    const priceValue = Number.isFinite(group?.priceValue)
      ? group.priceValue
      : group?.price
        ? parsePriceValue(group.price)
        : null;
    const variants = Array.isArray(group?.variants) ? group.variants : [];
    if (variants.length) {
      variants.forEach((variant) => {
        const variantPrice = Number.isFinite(variant?.priceValue)
          ? variant.priceValue
          : variant?.price
            ? parsePriceValue(variant.price)
            : null;
        const resolvedPrice = Number.isFinite(variantPrice)
          ? variantPrice
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
        if (!Number.isFinite(resolvedPrice) || !Number.isFinite(resolvedQty)) {
          return;
        }
        total += resolvedPrice * resolvedQty;
        hasValue = true;
      });
      return;
    }
    if (!Number.isFinite(priceValue)) return;
    const qty = getBrandGroupQty(group, fallbackQty, brandGroups.length);
    if (!Number.isFinite(qty)) return;
    total += priceValue * qty;
    hasValue = true;
  });
  return hasValue ? total : null;
};

const buildDetailBrandGroups = (record) => {
  if (!record) return [];
  const baseGroups =
    Array.isArray(record.brandGroups) && record.brandGroups.length
      ? record.brandGroups
      : record.brand || (record.variants || []).length
        ? [
            {
              name: record.brand || "Unbranded",
              price: record.price || "",
              variants: record.variants || [],
            },
          ]
        : [];

  return baseGroups
    .map((group) => ({
      name: group.name || "Unbranded",
      price: group.price || "",
      priceValue: Number.isFinite(group.priceValue)
        ? group.priceValue
        : group.price
          ? parsePriceValue(group.price)
          : null,
      variants: normalizeVariants(
        Array.isArray(group.variants) ? group.variants : [],
        record.status || "In Stock",
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => ({
      ...group,
      variants: [...group.variants].sort((a, b) => {
        const nameA = String(a.name || "").toLowerCase();
        const nameB = String(b.name || "").toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        const colorA = String(a.color || "").toLowerCase();
        const colorB = String(b.color || "").toLowerCase();
        if (colorA !== colorB) return colorA.localeCompare(colorB);
        return String(a.sku || "").localeCompare(String(b.sku || ""));
      }),
    }));
};

const getQtyPercent = (qtyValue, maxQty, qtyMeta) => {
  if (Number.isFinite(qtyValue) && Number.isFinite(maxQty) && maxQty > 0) {
    return Math.max(0, Math.min(100, Math.round((qtyValue / maxQty) * 100)));
  }
  if (qtyMeta) {
    const parsed = Number.parseFloat(String(qtyMeta).replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
  }
  return 0;
};

const getQtyTone = (percent, lowThreshold = 40) => {
  const resolvedLow =
    Number.isFinite(lowThreshold) && lowThreshold >= 0
      ? lowThreshold
      : 40;
  const criticalThreshold = Math.min(15, resolvedLow);
  if (percent >= 100) return "full";
  if (percent <= criticalThreshold) return "critical";
  if (percent <= resolvedLow) return "low";
  return "good";
};

const formatStatusTone = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const getShelfLocation = (record) =>
  String(
    record?.shelfLocation ||
      record?.shelveLocation ||
      record?.location ||
      "",
  ).trim();

const getWarehouseLocationLabel = (record) =>
  [record?.warehouse || record?.subtext || "", getShelfLocation(record)]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join(" - ");

const formatShareTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeCategoryOptions = (payload) => {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];
  const names = list
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
};

const InventoryRecords = () => {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_RECORD_FORM);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState(null);
  const [shareRecord, setShareRecord] = useState(null);
  const [shareGeneratedAt, setShareGeneratedAt] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("-createdAt");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [filterError, setFilterError] = useState("");
  const [activeTab, setActiveTab] = useState(TAB_OPTIONS[0]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(
    DEFAULT_VISIBLE_COLUMNS,
  );
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [warehouseList, setWarehouseList] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(18);
  const [categorySuggestionsOpen, setCategorySuggestionsOpen] = useState(false);
  const selectAllRef = useRef(null);
  const shareReportRef = useRef(null);
  const { currency, rate } = useInventoryCurrency();
  const { format: exportFormat } = useInventoryExportFormat();
  const draftStorageKey = "inventory-records-draft";

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
    setPage(1);
  });

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useEffect(() => {
    let isMounted = true;

    const loadRecords = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(meta.limit));
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        if (sortOrder) {
          params.set("sort", sortOrder);
        }
        if (filters.categories.length) {
          params.set("category", filters.categories.join(","));
        }
        if (activeTab === "Low Stock") {
          params.set("status", "Low Stock,Critical,Out of Stock");
        } else if (activeTab === "In Warehouse") {
          params.set("status", "In Stock,Oversupply");
        } else if (
          filters.stockLevel &&
          filters.stockLevel !== "All Stock Levels"
        ) {
          params.set("status", filters.stockLevel);
        }
        if (filters.warehouse && filters.warehouse !== "All Locations") {
          params.set("warehouse", filters.warehouse);
        }
        if (
          filters.variantStatus &&
          filters.variantStatus !== "All Variant Statuses"
        ) {
          params.set("variantStatus", filters.variantStatus);
        }
        if (filters.reorder === "yes") {
          params.set("reorder", "true");
        }
        if (filters.reorder === "no") {
          params.set("reorder", "false");
        }
        if (filters.priceMin) {
          params.set("priceMin", filters.priceMin);
        }
        if (filters.priceMax) {
          params.set("priceMax", filters.priceMax);
        }
        const payload = await fetchInventory(
          `/api/inventory/inventory-records?${params.toString()}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((record, index) => {
          const fallbackStatus = record.status || "In Stock";
          const brandGroups = normalizeBrandGroups(
            record.brandGroups,
            fallbackStatus,
          );
          const variants = brandGroups.length
            ? flattenBrandGroups(brandGroups)
            : normalizeVariants(record.variants, fallbackStatus);
          const rawQtyValue =
            parseQtyValue(record.qtyValue) ?? parseQtyValue(record.qtyLabel);
          const totalVariantQty = variants.length
            ? sumVariantQty(variants)
            : null;
          const derivedQtyValue =
            variants.length && totalVariantQty !== null
              ? totalVariantQty
              : rawQtyValue;
          const priceValue = record.price ? parsePriceValue(record.price) : null;
          const brandValue = computeBrandGroupValue(
            brandGroups,
            derivedQtyValue,
          );
          const computedValue =
            Number.isFinite(brandValue)
              ? brandValue
              : Number.isFinite(priceValue) && Number.isFinite(derivedQtyValue)
                ? priceValue * derivedQtyValue
                : null;
          const derivedLabel = variants.length
            ? buildQtyLabelFromVariants(variants) ||
              formatQtyLabel(derivedQtyValue) ||
              record.qtyLabel
            : formatQtyLabel(derivedQtyValue) || record.qtyLabel;
          const maxQty = parseQtyValue(record.maxQty);
          const derivedMeta =
            record.qtyMeta || computeQtyMeta(derivedQtyValue, maxQty);
          return {
            id: record._id || record.id || `${index}`,
            item: record.item || "",
            warehouse: record.warehouse || record.subtext || "",
            shelfLocation: getShelfLocation(record),
            sku: record.sku || "",
            brand: record.brand || brandGroups[0]?.name || "",
            brandGroups,
            category: record.category || "",
            categoryTone: record.categoryTone || "slate",
            qtyLabel: derivedLabel || "",
            qtyValue: derivedQtyValue,
            maxQty,
            qtyMeta: derivedMeta,
            variations: record.variations || "",
            colors: record.colors || "",
            variants,
            price: record.price || "",
            value:
              record.value ||
              (Number.isFinite(computedValue)
                ? computedValue.toFixed(2)
                : ""),
            status: record.status || "In Stock",
            statusTone: formatStatusTone(record.status || "In Stock"),
            reorder: Boolean(record.reorder),
            image: record.image || "",
          };
        });

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setRecords(normalized);
        setMeta({
          limit: parsed.limit || meta.limit,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setRecords([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load inventory records.");
      }
    };

    loadRecords();
    return () => {
      isMounted = false;
    };
  }, [activeTab, filters, meta.limit, page, refreshKey, searchTerm, sortOrder]);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const payload = await fetchInventory(
          "/api/inventory/categories/options",
        );
        const categories = normalizeCategoryOptions(payload);
        if (!isMounted) return;
        setCategoryOptions(categories);
      } catch {
        if (!isMounted) return;
        setCategoryOptions([]);
      }
    };

    loadCategories();
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const settings = await fetchInventory("/api/inventory/settings");
        if (!isMounted) return;
        const parsed = Number(settings?.lowStockThreshold);
        const threshold = Number.isFinite(parsed)
          ? Math.min(100, Math.max(0, parsed))
          : 18;
        setLowStockThreshold(threshold);
      } catch {
        if (!isMounted) return;
        setLowStockThreshold(18);
      }
    };

    loadSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadWarehouses = async () => {
      try {
        const payload = await fetchInventory(
          "/api/inventory/warehouses/options",
        );
        const parsed = parseListResponse(payload);
        const options = Array.isArray(parsed?.data) ? parsed.data : [];
        if (!isMounted) return;
        const sorted = Array.from(new Set(options.filter(Boolean))).sort((a, b) =>
          a.localeCompare(b),
        );
        setWarehouseList(sorted);
      } catch {
        if (!isMounted) return;
        setWarehouseList([]);
      }
    };

    loadWarehouses();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [records]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedIds.length > 0 && selectedIds.length < records.length;
  }, [records.length, selectedIds]);

  const total = meta.total || records.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + records.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;

  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    if (meta.totalPages && nextPage > meta.totalPages) return;
    setPage(nextPage);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleSortChange = (event) => {
    setSortOrder(event.target.value);
    setPage(1);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const updateDraftFilter = (field) => (event) => {
    setDraftFilters((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const toggleCategory = (category) => {
    setDraftFilters((prev) => {
      const exists = prev.categories.includes(category);
      return {
        ...prev,
        categories: exists
          ? prev.categories.filter((item) => item !== category)
          : [...prev.categories, category],
      };
    });
  };

  const handleReorderFilter = (value) => {
    setDraftFilters((prev) => ({ ...prev, reorder: value }));
  };

  const handleApplyFilters = () => {
    setFilterError("");
    const minValue = draftFilters.priceMin
      ? Number(draftFilters.priceMin)
      : null;
    const maxValue = draftFilters.priceMax
      ? Number(draftFilters.priceMax)
      : null;

    if (draftFilters.priceMin && !Number.isFinite(minValue)) {
      setFilterError("Min price must be a number.");
      return;
    }
    if (draftFilters.priceMax && !Number.isFinite(maxValue)) {
      setFilterError("Max price must be a number.");
      return;
    }
    if (
      Number.isFinite(minValue) &&
      Number.isFinite(maxValue) &&
      minValue > maxValue
    ) {
      setFilterError("Min price cannot exceed max price.");
      return;
    }

    setFilters(draftFilters);
    setPage(1);
  };

  const handleResetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setFilterError("");
    setActiveTab(TAB_OPTIONS[0]);
    setPage(1);
  };

  const handleExport = () => {
    if (!records.length) return;
    const rows = buildInventoryRecordExportRows(records, currency, rate);
    if (!rows.length) return;

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const cell = String(row[header] ?? "");
            return `"${cell.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-records-${new Date()
      .toISOString()
      .slice(0, 10)}.${getExportExtension(exportFormat)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleToggleColumns = () => {
    setColumnsOpen((prev) => !prev);
  };

  const toggleColumn = (column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const toggleSelectAll = () => {
    if (!records.length) return;
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(records.map((record) => record.id));
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const currencyPlaceholder = formatCurrencyPlaceholder(currency);
  const currencyLabel = getCurrencyPrefix(currency);
  const rawQtyValue = parseQtyValue(formData.qtyValue);
  const formBrandVariants = flattenBrandGroups(formData.brandGroups);
  const totalVariantQty = formBrandVariants.length
    ? sumVariantQty(formBrandVariants)
    : null;
  const derivedQtyValue =
    formBrandVariants.length && totalVariantQty !== null
      ? totalVariantQty
      : rawQtyValue;
  const derivedQtyLabel =
    formBrandVariants.length > 0
      ? buildQtyLabelFromVariants(formBrandVariants) ||
        formatQtyLabel(derivedQtyValue)
      : formatQtyLabel(derivedQtyValue);
  const derivedQtyMeta = computeQtyMeta(
    derivedQtyValue,
    parseQtyValue(formData.maxQty),
  );
  const hasBrandGroupData = (formData.brandGroups || []).some((group) => {
    if (String(group?.name || "").trim()) return true;
    const variants = Array.isArray(group?.variants) ? group.variants : [];
    return variants.some((variant) => {
      const variantQty = parseQtyValue(variant?.qtyValue);
      const colors = Array.isArray(variant?.colors) ? variant.colors : [];
      const hasColorEntries = colors.some((color) => {
        const colorQty = parseQtyValue(color?.qtyValue);
        return String(color?.name || "").trim() || Number.isFinite(colorQty);
      });
      return (
        String(variant?.name || "").trim() ||
        String(variant?.sku || "").trim() ||
        String(variant?.color || "").trim() ||
        String(variant?.price || "").trim() ||
        Number.isFinite(variantQty) ||
        hasColorEntries
      );
    });
  });
  const overallPriceValue = parsePriceValue(formData.price);
  const derivedValueNumeric = hasBrandGroupData
    ? computeBrandGroupValue(formData.brandGroups, derivedQtyValue)
    : Number.isFinite(overallPriceValue) && Number.isFinite(derivedQtyValue)
      ? overallPriceValue * derivedQtyValue
      : null;
  const derivedValueLabel = Number.isFinite(derivedValueNumeric)
    ? derivedValueNumeric.toFixed(2)
    : "";
  const overallPriceTooltip = Number.isFinite(overallPriceValue)
    ? formatCurrencyPair(overallPriceValue, currency, rate).alternateValue
    : "";

  const recordWarehouses = records
    .map((record) => record.warehouse)
    .filter(Boolean);
  const warehouseOptions = Array.from(
    new Set([...warehouseList, ...recordWarehouses]),
  );
  const filterWarehouseFallback =
    draftFilters.warehouse &&
    draftFilters.warehouse !== "All Locations" &&
    !warehouseOptions.includes(draftFilters.warehouse)
      ? [draftFilters.warehouse]
      : [];
  const sortedWarehouseOptions = Array.from(
    new Set([...warehouseOptions, ...filterWarehouseFallback]),
  ).sort((a, b) => a.localeCompare(b));
  const formWarehouseOptions = Array.from(
    new Set([...warehouseList, formData.warehouse].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const categoryQuery = String(formData.category || "").trim().toLowerCase();
  const filteredCategoryOptions = categoryOptions.filter((category) =>
    categoryQuery ? category.toLowerCase().includes(categoryQuery) : true,
  );
  const visibleCategoryOptions = filteredCategoryOptions.slice(0, 6);

  const columnTemplate = [
    "48px",
    visibleColumns.item ? "2fr" : null,
    visibleColumns.sku ? "1fr" : null,
    visibleColumns.shelfLocation ? "1fr" : null,
    visibleColumns.brand ? "1fr" : null,
    visibleColumns.category ? "1fr" : null,
    visibleColumns.quantity ? "1.2fr" : null,
    visibleColumns.variations ? "1fr" : null,
    visibleColumns.colors ? "0.9fr" : null,
    visibleColumns.price ? "0.8fr" : null,
    visibleColumns.value ? "0.9fr" : null,
    visibleColumns.status ? "0.8fr" : null,
    "1fr",
  ]
    .filter(Boolean)
    .join(" ");
  const columnsStyle = { "--records-columns": columnTemplate };
  const detailGroups = detailsRecord
    ? buildDetailBrandGroups(detailsRecord)
    : [];
  const detailVariantTotal = detailGroups.length
    ? sumVariantQty(flattenBrandGroups(detailGroups))
    : null;
  const detailQtyLabel =
    detailsRecord?.qtyLabel ||
    (Number.isFinite(detailVariantTotal)
      ? formatQtyLabel(detailVariantTotal)
      : "—");
  const detailPriceInfo = detailsRecord
    ? getRecordPriceInfo(detailsRecord)
    : { type: "none" };
  const detailPriceLabel =
    detailPriceInfo.type === "range"
      ? formatCurrencyRange(
          detailPriceInfo.min,
          detailPriceInfo.max,
          currency,
          rate,
        )
      : detailPriceInfo.type === "single"
        ? formatCurrencyValue(detailPriceInfo.value, currency, rate)
        : "";
  const detailPriceTitle =
    detailPriceInfo.type === "range" ? "Price Range" : "Price";
  const detailPriceTooltip =
    detailPriceInfo.type === "range"
      ? formatCurrencyRangeTooltip(
          detailPriceInfo.min,
          detailPriceInfo.max,
          currency,
          rate,
        )
      : detailPriceInfo.type === "single"
        ? formatCurrencyPair(detailPriceInfo.value, currency, rate)
            .alternateValue
        : "";
  const detailValueTooltip = formatCurrencyPair(
    detailsRecord?.value,
    currency,
    rate,
  ).alternateValue;

  const shareGroups = shareRecord ? buildDetailBrandGroups(shareRecord) : [];
  const shareVariantTotal = shareGroups.length
    ? sumVariantQty(flattenBrandGroups(shareGroups))
    : null;
  const shareQtyLabel =
    shareRecord?.qtyLabel ||
    (Number.isFinite(shareVariantTotal)
      ? formatQtyLabel(shareVariantTotal)
      : "—");
  const sharePriceInfo = shareRecord
    ? getRecordPriceInfo(shareRecord)
    : { type: "none" };
  const sharePriceLabel =
    sharePriceInfo.type === "range"
      ? formatCurrencyRange(
          sharePriceInfo.min,
          sharePriceInfo.max,
          currency,
          rate,
        )
      : sharePriceInfo.type === "single"
        ? formatCurrencyValue(sharePriceInfo.value, currency, rate)
        : "";
  const sharePriceTitle =
    sharePriceInfo.type === "range" ? "Price Range" : "Price";

  const normalizeStatus = (value) => String(value || "").toLowerCase();
  const resolvedLowThreshold = Number.isFinite(lowStockThreshold)
    ? lowStockThreshold
    : 40;
  const criticalThreshold = Math.min(15, resolvedLowThreshold);

  const resolveStockLevel = (record) => {
    const status = normalizeStatus(record.status);
    if (status) return status;
    const percent = getQtyPercent(record.qtyValue, record.maxQty, record.qtyMeta);
    if (percent >= 100) return "oversupply";
    if (percent <= criticalThreshold) return "critical";
    if (percent <= resolvedLowThreshold) return "low stock";
    return "in stock";
  };

  const inStockCount = records.filter((record) => {
    const status = resolveStockLevel(record);
    return (
      status === "in stock" ||
      status === "oversupply"
    );
  }).length;

  const lowStockCount = records.filter((record) => {
    const status = resolveStockLevel(record);
    return status === "low stock";
  }).length;

  const outOfStockCount = records.filter((record) => {
    const status = resolveStockLevel(record);
    return status === "critical" || status === "out of stock";
  }).length;

  const openCreateModal = () => {
    setEditingRecord(null);
    if (typeof window !== "undefined") {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          const nextForm = { ...DEFAULT_RECORD_FORM, ...parsed };
          nextForm.shelfLocation =
            nextForm.shelfLocation ||
            nextForm.shelveLocation ||
            nextForm.location ||
            "";
          nextForm.brandGroups = Array.isArray(nextForm.brandGroups)
            ? nextForm.brandGroups
            : DEFAULT_RECORD_FORM.brandGroups;
          setFormData(nextForm);
        } catch {
          setFormData({
            ...DEFAULT_RECORD_FORM,
            brandGroups: [
              {
                id: `brand-${Date.now()}`,
                name: "",
                price: "",
                variants: [],
              },
            ],
          });
        }
      } else {
        setFormData({
          ...DEFAULT_RECORD_FORM,
          brandGroups: [
            {
              id: `brand-${Date.now()}`,
              name: "",
              price: "",
              variants: [],
            },
          ],
        });
      }
    } else {
      setFormData({
        ...DEFAULT_RECORD_FORM,
        brandGroups: [
          {
            id: `brand-${Date.now()}`,
            name: "",
            price: "",
            variants: [],
          },
        ],
      });
    }
    setActionError("");
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleQuickAction = (event) => {
      const action = String(event?.detail?.action || "");
      if (action !== "add-record") return;
      openCreateModal();
    };
    window.addEventListener("inventory:quick-action", handleQuickAction);
    return () =>
      window.removeEventListener("inventory:quick-action", handleQuickAction);
  }, [openCreateModal]);

  const buildEditableBrandGroups = (record) => {
    const fallbackStatus = record?.status || "In Stock";
    const normalizedGroups = normalizeBrandGroups(
      record?.brandGroups,
      fallbackStatus,
    );
    if (normalizedGroups.length) return normalizedGroups;
    const fallbackVariants = normalizeVariants(
      record?.variants,
      fallbackStatus,
    );
    if (record?.brand || fallbackVariants.length) {
      return [
        {
          id: `brand-${Date.now()}`,
          name: record?.brand || "",
          price: record?.price || "",
          priceValue: record?.price ? parsePriceValue(record.price) : null,
          variants: fallbackVariants,
        },
      ];
    }
    return [];
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setFormData({
      item: record.item || "",
      warehouse: record.warehouse || record.subtext || "",
      shelfLocation: getShelfLocation(record),
      sku: record.sku || "",
      category: record.category || "",
      qtyLabel: record.qtyLabel || "",
      qtyValue: record.qtyValue ?? "",
      maxQty: record.maxQty ?? "",
      variations: record.variations || "",
      colors: record.colors || "",
      brandGroups: buildEditableBrandGroups(record),
      price: record.price || "",
      value: record.value || "",
      status: record.status || "In Stock",
      image: record.image || "",
      reorder: Boolean(record.reorder),
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setActionError("");
  };

  const updateField = (field) => (event) => {
    const value =
      event?.target?.type === "checkbox"
        ? event.target.checked
        : event.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCategoryFocus = () => {
    setCategorySuggestionsOpen(true);
  };

  const handleCategoryBlur = () => {
    setTimeout(() => setCategorySuggestionsOpen(false), 150);
  };

  const handleCategoryInput = (event) => {
    updateField("category")(event);
    setCategorySuggestionsOpen(true);
  };

  const selectCategorySuggestion = (value) => {
    setFormData((prev) => ({ ...prev, category: value }));
    setCategorySuggestionsOpen(false);
  };

  const addBrandGroup = () => {
    setFormData((prev) => ({
      ...prev,
      brandGroups: [
        ...(prev.brandGroups || []),
        {
          id: `brand-${Date.now()}-${prev.brandGroups.length}`,
          name: "",
          price: "",
          variants: [],
        },
      ],
    }));
  };

  const updateBrandGroupName = (groupIndex) => (event) => {
    const value = event?.target?.value ?? "";
    setFormData((prev) => {
      const nextGroups = [...(prev.brandGroups || [])];
      const current = nextGroups[groupIndex] || {};
      nextGroups[groupIndex] = { ...current, name: value };
      return { ...prev, brandGroups: nextGroups };
    });
  };

  const updateBrandGroupPrice = (groupIndex) => (event) => {
    const value = event?.target?.value ?? "";
    setFormData((prev) => {
      const nextGroups = [...(prev.brandGroups || [])];
      const current = nextGroups[groupIndex] || {};
      nextGroups[groupIndex] = { ...current, price: value };
      return { ...prev, brandGroups: nextGroups };
    });
  };

  const removeBrandGroup = (groupIndex) => {
    setFormData((prev) => ({
      ...prev,
      brandGroups: (prev.brandGroups || []).filter(
        (_, index) => index !== groupIndex,
      ),
    }));
  };

  const addBrandVariant = (groupIndex) => {
    setFormData((prev) => {
      const nextGroups = [...(prev.brandGroups || [])];
      const current = nextGroups[groupIndex] || { variants: [] };
      const nextVariants = [
        ...(current.variants || []),
        {
          id: `variant-${Date.now()}-${current.variants?.length || 0}`,
          name: "",
          colors: [],
          sku: "",
          price: "",
          status: prev.status || "In Stock",
          qtyValue: "",
        },
      ];
      nextGroups[groupIndex] = { ...current, variants: nextVariants };
      return { ...prev, brandGroups: nextGroups };
    });
  };

  const updateBrandVariant = (groupIndex, variantIndex, field) => (event) => {
    const value = event?.target?.value ?? "";
    setFormData((prev) => {
      const nextGroups = [...(prev.brandGroups || [])];
      const currentGroup = nextGroups[groupIndex] || { variants: [] };
      const nextVariants = [...(currentGroup.variants || [])];
      const currentVariant = nextVariants[variantIndex] || {};
      nextVariants[variantIndex] = { ...currentVariant, [field]: value };
      nextGroups[groupIndex] = { ...currentGroup, variants: nextVariants };
      return { ...prev, brandGroups: nextGroups };
    });
  };

  const addVariantColor = (groupIndex, variantIndex) => {
    setFormData((prev) => {
      const nextGroups = [...(prev.brandGroups || [])];
      const currentGroup = nextGroups[groupIndex] || { variants: [] };
      const nextVariants = [...(currentGroup.variants || [])];
      const currentVariant = nextVariants[variantIndex] || { colors: [] };
      const nextColors = [
        ...(currentVariant.colors || []),
        {
          id: `color-${Date.now()}-${currentVariant.colors?.length || 0}`,
          name: "",
          qtyValue: "",
        },
      ];
      nextVariants[variantIndex] = { ...currentVariant, colors: nextColors };
      nextGroups[groupIndex] = { ...currentGroup, variants: nextVariants };
      return { ...prev, brandGroups: nextGroups };
    });
  };

  const updateVariantColor =
    (groupIndex, variantIndex, colorIndex, field) => (event) => {
      const value = event?.target?.value ?? "";
      setFormData((prev) => {
        const nextGroups = [...(prev.brandGroups || [])];
        const currentGroup = nextGroups[groupIndex] || { variants: [] };
        const nextVariants = [...(currentGroup.variants || [])];
        const currentVariant = nextVariants[variantIndex] || { colors: [] };
        const nextColors = [...(currentVariant.colors || [])];
        const currentColor = nextColors[colorIndex] || {};
        nextColors[colorIndex] = { ...currentColor, [field]: value };
        nextVariants[variantIndex] = { ...currentVariant, colors: nextColors };
        nextGroups[groupIndex] = { ...currentGroup, variants: nextVariants };
        return { ...prev, brandGroups: nextGroups };
      });
    };

  const removeVariantColor = (groupIndex, variantIndex, colorIndex) => {
    setFormData((prev) => {
      const nextGroups = [...(prev.brandGroups || [])];
      const currentGroup = nextGroups[groupIndex] || { variants: [] };
      const nextVariants = [...(currentGroup.variants || [])];
      const currentVariant = nextVariants[variantIndex] || { colors: [] };
      nextVariants[variantIndex] = {
        ...currentVariant,
        colors: (currentVariant.colors || []).filter(
          (_, index) => index !== colorIndex,
        ),
      };
      nextGroups[groupIndex] = { ...currentGroup, variants: nextVariants };
      return { ...prev, brandGroups: nextGroups };
    });
  };

  const removeBrandVariant = (groupIndex, variantIndex) => {
    setFormData((prev) => {
      const nextGroups = [...(prev.brandGroups || [])];
      const currentGroup = nextGroups[groupIndex] || { variants: [] };
      nextGroups[groupIndex] = {
        ...currentGroup,
        variants: (currentGroup.variants || []).filter(
          (_, index) => index !== variantIndex,
        ),
      };
      return { ...prev, brandGroups: nextGroups };
    });
  };

  const handleImageSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!reader.result) return;
      setFormData((prev) => ({ ...prev, image: reader.result }));
    };
    reader.onerror = () => {
      setActionError("Unable to read the selected image.");
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setFormData((prev) => ({ ...prev, image: "" }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.item || !formData.sku) {
      setActionError("Item name and Item ID are required.");
      return;
    }

    setIsSaving(true);
    try {
      const brandGroupsPayload = (formData.brandGroups || [])
        .map((group) => {
          const variantsPayload = (group.variants || [])
            .map((variant) => {
              const colorsPayload = (variant.colors || [])
                .map((color) => ({
                  name: color.name?.trim() || "",
                  qtyValue:
                    color.qtyValue === "" || color.qtyValue === null
                      ? null
                      : Number(color.qtyValue),
                }))
                .filter(
                  (color) => color.name || Number.isFinite(color.qtyValue),
                );
              const colorsTotal = sumVariantQty(colorsPayload);
              const qtyValue =
                Number.isFinite(colorsTotal)
                  ? colorsTotal
                  : variant.qtyValue === "" || variant.qtyValue === null
                    ? null
                    : Number(variant.qtyValue);

              return {
                name: variant.name?.trim() || "",
                color: colorsPayload[0]?.name || "",
                colors: colorsPayload,
                sku: variant.sku?.trim() || "",
                price: String(variant.price || "").trim(),
                status: variant.status?.trim() || "",
                qtyValue,
              };
            })
            .filter(
              (variant) =>
                variant.name ||
                variant.color ||
                (variant.colors || []).length ||
                variant.sku ||
                variant.price ||
                Number.isFinite(variant.qtyValue),
            );
          return {
            name: group.name?.trim() || "",
            price: String(group.price || "").trim(),
            variants: variantsPayload,
          };
        })
        .filter((group) => group.name || group.variants.length);

      const payload = {
        item: formData.item,
        warehouse: formData.warehouse,
        shelfLocation: formData.shelfLocation,
        sku: formData.sku,
        category: formData.category,
        qtyLabel: derivedQtyLabel,
        qtyValue: derivedQtyValue,
        maxQty: formData.maxQty,
        variations: formData.variations,
        colors: formData.colors,
        brandGroups: brandGroupsPayload,
        price: formData.price,
        value: derivedValueLabel,
        status: formData.status,
        image: formData.image,
        reorder: formData.reorder,
      };

      const endpoint = editingRecord
        ? `/api/inventory/inventory-records/${editingRecord.id}`
        : "/api/inventory/inventory-records";

      await fetchInventory(endpoint, {
        method: editingRecord ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      if (!editingRecord) {
        setPage(1);
      }
      if (!editingRecord && typeof window !== "undefined") {
        window.localStorage.removeItem(draftStorageKey);
      }
      triggerRefresh();
    } catch (err) {
      setActionError(err?.message || "Unable to save inventory record.");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (record) => {
    setDeleteTarget(record);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const openDetailsModal = (record) => {
    setDetailsRecord(record);
  };

  const closeDetailsModal = () => {
    setDetailsRecord(null);
  };

  const openShareModal = (record) => {
    setShareRecord(record);
    setShareGeneratedAt(formatShareTimestamp());
  };

  const closeShareModal = () => {
    setShareRecord(null);
    setShareGeneratedAt("");
  };

  const handlePrintShareReport = () => {
    if (!shareReportRef.current || typeof document === "undefined") return;
    const reportHtml = shareReportRef.current.outerHTML;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    const styles = `
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: "Segoe UI", Arial, sans-serif;
          color: #0f172a;
          padding: 24px;
        }
        .share-report { display: flex; flex-direction: column; gap: 16px; }
        .share-report-header { display: flex; justify-content: space-between; gap: 16px; }
        .share-report-title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
        .share-report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
        .share-report-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
        .share-report-card span { display: block; font-size: 12px; color: #64748b; }
        .share-report-card strong { font-size: 14px; color: #0f172a; }
        .share-report-image img { width: 160px; height: 160px; object-fit: cover; border-radius: 10px; border: 1px solid #e2e8f0; }
        .share-report-table { display: grid; gap: 6px; }
        .share-report-row { display: grid; grid-template-columns: 1fr 1fr 1.2fr 1fr 0.9fr 0.9fr 0.8fr; gap: 8px; font-size: 12px; align-items: center; }
        .share-report-row.header { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
        .status-pill { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #e2e8f0; color: #0f172a; }
        .status-pill.low-stock { background: #ffedd5; color: #c2410c; }
        .status-pill.critical { background: #fee2e2; color: #b91c1c; }
        .status-pill.in-stock { background: #dcfce7; color: #047857; }
        .status-pill.oversupply { background: #dbeafe; color: #1d4ed8; }
        @media print {
          body { padding: 0; }
        }
      </style>
    `;

    doc.open();
    doc.write(`<!doctype html><html><head><title>Inventory Record</title>${styles}</head><body>${reportHtml}</body></html>`);
    doc.close();

    const finalizePrint = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 500);
    };

    const images = Array.from(doc.images || []);
    if (!images.length) {
      finalizePrint();
      return;
    }

    let loaded = 0;
    const handleImageDone = () => {
      loaded += 1;
      if (loaded >= images.length) {
        finalizePrint();
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        handleImageDone();
      } else {
        img.onload = handleImageDone;
        img.onerror = handleImageDone;
      }
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(`/api/inventory/inventory-records/${deleteTarget.id}`, {
        method: "DELETE",
      });
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete inventory record.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  useEffect(() => {
    if (!isModalOpen || editingRecord) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(formData));
    } catch {
      // Ignore storage quota errors so the form keeps working.
    }
  }, [draftStorageKey, editingRecord, formData, isModalOpen]);

  return (
    <section className="inventory-records">
      <header className="records-header">
        <div>
          <Breadcrumb pageKey="inventory-records" />
          <h2>Inventory Records</h2>
        </div>
        <div className="records-actions">
          <button type="button" className="ghost-button" onClick={handleExport}>
            <DownloadIcon className="button-icon" />
            Export
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={openCreateModal}
          >
            <PlusIcon className="button-icon" />
            Add New Record
          </button>
        </div>
      </header>

      <div className="records-summary">
        <article className="summary-card">
          <div className="summary-icon success">
            <CheckIcon />
          </div>
          <div className="summary-meta">In Stock</div>
          <div className="summary-value">{inStockCount} Items</div>
          <span className="summary-pill success">Stable</span>
        </article>
        <article className="summary-card">
          <div className="summary-icon warning">
            <WarningIcon />
          </div>
          <div className="summary-meta">Low Stock</div>
          <div className="summary-value">{lowStockCount} Items</div>
          <span className="summary-pill warning">Action Required</span>
        </article>
        <article className="summary-card">
          <div className="summary-icon danger">
            <AlertCircleIcon />
          </div>
          <div className="summary-meta">Out of Stock</div>
          <div className="summary-value">{outOfStockCount} Items</div>
          <span className="summary-pill danger">Urgent</span>
        </article>
      </div>

      <div className="records-layout">
        <aside className="filters-panel">
          <div className="filters-header">
            <strong>Advanced Filters</strong>
            <button
              type="button"
              className="reset-button"
              onClick={handleResetFilters}
            >
              Reset
            </button>
          </div>

          <div className="filter-group">
            <span className="filter-title">Category</span>
            {categoryOptions.length ? (
              categoryOptions.map((category) => (
                <label className="check-row" key={category}>
                  <input
                    type="checkbox"
                    checked={draftFilters.categories.includes(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  {category}
                </label>
              ))
            ) : (
              <span className="muted">No categories registered.</span>
            )}
          </div>

          <div className="filter-group">
            <span className="filter-title">Price Range</span>
            <div className="range-row">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Min"
                value={draftFilters.priceMin}
                onChange={updateDraftFilter("priceMin")}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Max"
                value={draftFilters.priceMax}
                onChange={updateDraftFilter("priceMax")}
              />
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-title">Stock Level</span>
            <select
              value={draftFilters.stockLevel}
              onChange={updateDraftFilter("stockLevel")}
            >
              {STOCK_LEVEL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-title">Variant Status</span>
            <select
              value={draftFilters.variantStatus}
              onChange={updateDraftFilter("variantStatus")}
            >
              {VARIANT_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-title">Warehouse</span>
            <input
              type="text"
              list="inventory-records-warehouse-options"
              value={draftFilters.warehouse}
              onChange={updateDraftFilter("warehouse")}
              placeholder="All Locations"
            />
          </div>

          <div className="filter-group">
            <span className="filter-title">Reorder Status</span>
            <div className="pill-group">
              <button
                type="button"
                className={`pill-button ${
                  draftFilters.reorder === "all" ? "active" : ""
                }`}
                onClick={() => handleReorderFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`pill-button ${
                  draftFilters.reorder === "yes" ? "active" : ""
                }`}
                onClick={() => handleReorderFilter("yes")}
              >
                Needs Reorder
              </button>
              <button
                type="button"
                className={`pill-button ${
                  draftFilters.reorder === "no" ? "active" : ""
                }`}
                onClick={() => handleReorderFilter("no")}
              >
                No Reorder
              </button>
            </div>
          </div>

          <button
            type="button"
            className="primary-button apply-button"
            onClick={handleApplyFilters}
          >
            Apply Filters
          </button>
          {filterError ? (
            <span className="modal-help">{filterError}</span>
          ) : null}

          <div className="system-update">
            <strong>System Update</strong>
            <p>
              Inventory levels synced with Amazon, Shopify, and local POS 4
              minutes ago.
            </p>
          </div>
        </aside>

        <div className="records-table-card">
          <div className="records-toolbar">
            <div className="records-tabs">
              {TAB_OPTIONS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`tab ${activeTab === tab ? "active" : ""}`}
                  onClick={() => handleTabChange(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="records-tools">
              <div className="input-shell records-search">
                <SearchIcon className="search-icon" />
                <input
                  type="text"
                  placeholder="Search items, brand, Item ID, warehouse, or shelf"
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
              </div>
              <label className="sort-select">
                <SortIcon className="button-icon" />
                <select value={sortOrder} onChange={handleSortChange}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="columns-menu-wrapper">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleToggleColumns}
                >
                  <ColumnsIcon className="button-icon" />
                  Columns
                </button>
                {columnsOpen ? (
                  <div className="columns-menu">
                    {[
                      { key: "item", label: "Item Name" },
                      { key: "sku", label: "Item ID" },
                      { key: "shelfLocation", label: "Shelf Location" },
                      { key: "brand", label: "Brand" },
                      { key: "category", label: "Category" },
                      { key: "quantity", label: "Quantity" },
                      { key: "variations", label: "Variations" },
                      { key: "colors", label: "Colors/Kind" },
                      { key: "price", label: "Price" },
                      { key: "value", label: "Value" },
                      { key: "status", label: "Status" },
                    ].map((column) => (
                      <label className="check-row" key={column.key}>
                        <input
                          type="checkbox"
                          checked={visibleColumns[column.key]}
                          onChange={() => toggleColumn(column.key)}
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="records-total">
                {total ? `${total} items total` : "0 items total"}
              </span>
            </div>
          </div>

          <div className="records-table">
            <div className="table-header" style={columnsStyle}>
              <span>
                <input
                  type="checkbox"
                  ref={selectAllRef}
                  checked={
                    records.length > 0 && selectedIds.length === records.length
                  }
                  onChange={toggleSelectAll}
                  aria-label="Select all records"
                />
              </span>
              {visibleColumns.item ? <span>Item Name</span> : null}
              {visibleColumns.sku ? <span>Item ID</span> : null}
              {visibleColumns.shelfLocation ? (
                <span>Shelf Location</span>
              ) : null}
              {visibleColumns.brand ? <span>Brand</span> : null}
              {visibleColumns.category ? <span>Category</span> : null}
              {visibleColumns.quantity ? <span>Quantity</span> : null}
              {visibleColumns.variations ? <span>Variations</span> : null}
              {visibleColumns.colors ? <span>Colors/Kind</span> : null}
              {visibleColumns.price ? <span>Price</span> : null}
              {visibleColumns.value ? <span>Value</span> : null}
              {visibleColumns.status ? <span>Status</span> : null}
              <span>Actions</span>
            </div>
            <div className="table-body">
              {records.map((record) => {
                const qtyPercent = getQtyPercent(
                  record.qtyValue,
                  record.maxQty,
                  record.qtyMeta,
                );
                const hasCapacity =
                  Number.isFinite(record.qtyValue) &&
                  Number.isFinite(record.maxQty) &&
                  record.maxQty > 0;
                const qtyTone = getQtyTone(qtyPercent, resolvedLowThreshold);
                const qtyMetaText =
                  record.qtyMeta ||
                  (hasCapacity ? `${qtyPercent}%` : "—");
                const brandDisplay = getBrandDisplay(record);
                const priceInfo = getRecordPriceInfo(record);
                const priceLabel =
                  priceInfo.type === "range"
                    ? formatCurrencyRange(
                        priceInfo.min,
                        priceInfo.max,
                        currency,
                        rate,
                      )
                    : priceInfo.type === "single"
                      ? formatCurrencyValue(priceInfo.value, currency, rate)
                      : "";
                const priceTooltip =
                  priceInfo.type === "range"
                    ? formatCurrencyRangeTooltip(
                        priceInfo.min,
                        priceInfo.max,
                        currency,
                        rate,
                      )
                    : priceInfo.type === "single"
                        ? formatCurrencyPair(priceInfo.value, currency, rate)
                            .alternateValue
                        : "";
                const warehouseLocationLabel =
                  getWarehouseLocationLabel(record);

                return (
                  <div
                    className="table-row is-clickable"
                    style={columnsStyle}
                    key={record.id}
                    onClick={() => openDetailsModal(record)}
                  >
                  <div
                    className="cell checkbox-cell"
                    data-label="Select"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(record.id)}
                      onChange={() => toggleSelectRow(record.id)}
                      aria-label={`Select ${record.item}`}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </div>
                  {visibleColumns.item ? (
                    <div className="cell item-cell" data-label="Item Name">
                      <div className="item-thumb">
                        {record.image ? (
                          <img src={record.image} alt={record.item} />
                        ) : (
                          <span className="item-fallback">
                            {(record.item || "?").charAt(0)}
                          </span>
                        )}
                      </div>
                      <div>
                        <strong>{record.item}</strong> <br></br>
                        <span className="muted">
                          {warehouseLocationLabel || "-"}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {visibleColumns.sku ? (
                    <div className="cell mono" data-label="Item ID">
                      {record.sku}
                    </div>
                  ) : null}
                  {visibleColumns.shelfLocation ? (
                    <div className="cell" data-label="Shelf Location">
                      <span className="muted">
                        {record.shelfLocation || "-"}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.brand ? (
                    <div className="cell" data-label="Brand">
                      <div className="brand-cell">
                        <span>{brandDisplay.primary || "—"}</span>
                        {brandDisplay.extraCount ? (
                          <span className="muted">
                            +{brandDisplay.extraCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {visibleColumns.category ? (
                    <div className="cell" data-label="Category">
                      <span className={`category-pill ${record.categoryTone}`}>
                        {record.category}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.quantity ? (
                    <div className="cell qty-cell" data-label="Quantity">
                      <div className="qty-line">
                        <span>{record.qtyLabel}</span>
                        <span className={`qty-flag ${qtyTone}`}>
                          {qtyMetaText}
                        </span>
                      </div>
                      <div className="qty-bar">
                        <span
                          className={`qty-fill ${qtyTone}`}
                          style={{ width: `${qtyPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {visibleColumns.variations ? (
                    <div className="cell" data-label="Variations">
                      <span className="muted">
                        {buildVariantSummary(
                          record.variants,
                          record.variations,
                          "name",
                        )}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.colors ? (
                    <div className="cell" data-label="Colors/Kind">
                      <span className="muted">
                        {buildVariantSummary(
                          record.variants,
                          record.colors,
                          "color",
                        )}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.price ? (
                    <div className="cell price" data-label="Price">
                      <span
                        className="tooltip-anchor"
                        data-tooltip={priceTooltip || undefined}
                      >
                        {priceLabel || "—"}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.value ? (
                    <div className="cell value" data-label="Value">
                      <span
                        className="tooltip-anchor"
                        data-tooltip={
                          formatCurrencyPair(record.value, currency, rate)
                            .alternateValue || undefined
                        }
                      >
                        {formatCurrencyValue(record.value, currency, rate)}
                      </span>
                    </div>
                  ) : null}
                  {visibleColumns.status ? (
                    <div className="cell" data-label="Status">
                      <span className={`status-pill ${record.statusTone}`}>
                        {record.status}
                      </span>
                    </div>
                  ) : null}
                  <div className="cell actions-cell" data-label="Actions">
                    <button
                      type="button"
                      className="action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditModal(record);
                      }}
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openShareModal(record);
                      }}
                      aria-label={`Share ${record.item}`}
                    >
                      <ShareIcon />
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        requestDelete(record);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div className="table-footer">
            <span>
              {error
                ? error
                : `Showing ${startIndex}-${endIndex} of ${total} results`}
            </span>
            <div className="pagination">
              <button
                type="button"
                className="ghost-button"
                onClick={() => handlePageChange(page - 1)}
                disabled={isPrevDisabled}
              >
                Previous
              </button>
              {pagination.map((pageItem, index) =>
                pageItem === "ellipsis" ? (
                  <span className="page-ellipsis" key={`ellipsis-${index}`}>
                    ...
                  </span>
                ) : (
                  <button
                    type="button"
                    key={`page-${pageItem}`}
                    className={`page ${pageItem === page ? "active" : ""}`}
                    onClick={() => handlePageChange(pageItem)}
                  >
                    {pageItem}
                  </button>
                ),
              )}
              <button
                type="button"
                className="ghost-button"
                onClick={() => handlePageChange(page + 1)}
                disabled={isNextDisabled}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingRecord ? "Edit Inventory Record" : "Add Inventory Record"}
        subtitle="Update item details, quantities, and status."
        primaryText={isSaving ? "Saving..." : "Save"}
        secondaryText="Cancel"
        onConfirm={handleSave}
        onClose={closeModal}
        variant="side"
      >
        <form className="modal-form">
          <div className="modal-grid">
            <label className="modal-field">
              <span>Item Name</span>
              <input
                type="text"
                value={formData.item}
                onChange={updateField("item")}
                placeholder="Item name"
              />
            </label>
            <label className="modal-field">
              <span>Item ID</span>
              <input
                type="text"
                value={formData.sku}
                onChange={updateField("sku")}
                placeholder="Item ID"
              />
            </label>
            <label className="modal-field">
              <span>Warehouse</span>
              <input
                type="text"
                list="inventory-records-warehouse-options"
                value={formData.warehouse}
                onChange={updateField("warehouse")}
                placeholder="Select or type warehouse"
              />
            </label>
            <label className="modal-field">
              <span>Shelf Location</span>
              <input
                type="text"
                value={formData.shelfLocation}
                onChange={updateField("shelfLocation")}
                placeholder="e.g. A-04-12 or Shelf B2"
              />
            </label>
            <label className="modal-field">
              <span>Category</span>
              <div className="input-suggest">
                <input
                  type="text"
                  value={formData.category}
                  onChange={handleCategoryInput}
                  onFocus={handleCategoryFocus}
                  onBlur={handleCategoryBlur}
                  list="inventory-category-options"
                  placeholder="Electronics"
                />
                {categorySuggestionsOpen && visibleCategoryOptions.length ? (
                  <div className="suggestions-list">
                    {visibleCategoryOptions.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className="suggestion-item"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectCategorySuggestion(category);
                        }}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
            <label className="modal-field">
              <span>Current Quantity</span>
              <input
                type="number"
                min="0"
                value={
                  formBrandVariants.length > 0
                    ? derivedQtyValue ?? ""
                    : formData.qtyValue
                }
                onChange={updateField("qtyValue")}
                placeholder="0"
                readOnly={formBrandVariants.length > 0}
              />
            </label>
            <label className="modal-field">
              <span>Max Quantity</span>
              <input
                type="number"
                min="0"
                value={formData.maxQty}
                onChange={updateField("maxQty")}
                placeholder="0"
              />
            </label>
            <label className="modal-field">
              <span>Quantity Meta (Auto)</span>
              <input type="text" value={derivedQtyMeta} readOnly />
            </label>
            <label className="modal-field">
              <span>Overall Price ({currencyLabel})</span>
              <div
                className="tooltip-anchor tooltip-field"
                data-tooltip={overallPriceTooltip || undefined}
              >
                <input
                  type="text"
                  value={formData.price}
                  onChange={updateField("price")}
                  placeholder={currencyPlaceholder}
                />
              </div>
              <span className="muted">Optional if using brand/variant prices.</span>
            </label>
            <div className="brand-group-builder">
              <div className="brand-group-header">
                <div>
                  <strong>Brand Groups</strong>
                  <p className="muted">
                    Track variants by brand, color, and variation.
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={addBrandGroup}
                >
                  Add Brand
                </button>
              </div>
              {formData.brandGroups.length ? (
                <div className="brand-group-list">
                  {formData.brandGroups.map((group, groupIndex) => (
                    <div
                      className="brand-group-card"
                      key={group.id || groupIndex}
                    >
                      <div className="brand-group-title">
                        <div className="brand-group-fields">
                          <input
                            type="text"
                            placeholder="Brand name"
                            value={group.name}
                            onChange={updateBrandGroupName(groupIndex)}
                          />
                          <div className="brand-price-field">
                            <span className="muted">
                              Price ({currencyLabel})
                            </span>
                            <input
                              type="text"
                              placeholder={currencyPlaceholder}
                              value={group.price || ""}
                              onChange={updateBrandGroupPrice(groupIndex)}
                            />
                          </div>
                        </div>
                        <div className="brand-group-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => addBrandVariant(groupIndex)}
                          >
                            Add Variant
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => removeBrandGroup(groupIndex)}
                          >
                            Remove Brand
                          </button>
                        </div>
                      </div>
                      {group.variants?.length ? (
                        <div className="variant-list">
                          {group.variants.map((variant, variantIndex) => {
                            const variantQty = getVariantQtyValue(variant);
                            const hasColors =
                              Array.isArray(variant.colors) &&
                              variant.colors.length > 0;

                            return (
                              <div
                                className="variant-block"
                                key={variant.id || variantIndex}
                              >
                                <div className="variant-row">
                                  <input
                                    type="text"
                                    placeholder="Variation"
                                    value={variant.name}
                                    onChange={updateBrandVariant(
                                      groupIndex,
                                      variantIndex,
                                      "name",
                                    )}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Item ID"
                                    value={variant.sku}
                                    onChange={updateBrandVariant(
                                      groupIndex,
                                      variantIndex,
                                      "sku",
                                    )}
                                  />
                                  <select
                                    value={resolveVariantStatus(
                                      variant.status,
                                      formData.status,
                                    )}
                                    onChange={updateBrandVariant(
                                      groupIndex,
                                      variantIndex,
                                      "status",
                                    )}
                                  >
                                    {VARIANT_STATUS_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    placeholder={`Price (${currencyLabel})`}
                                    value={variant.price || ""}
                                    onChange={updateBrandVariant(
                                      groupIndex,
                                      variantIndex,
                                      "price",
                                    )}
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Qty"
                                    value={
                                      hasColors
                                        ? Number.isFinite(variantQty)
                                          ? variantQty
                                          : ""
                                        : variant.qtyValue
                                    }
                                    onChange={updateBrandVariant(
                                      groupIndex,
                                      variantIndex,
                                      "qtyValue",
                                    )}
                                    readOnly={hasColors}
                                  />
                                  <button
                                    type="button"
                                    className="action-button"
                                    onClick={() =>
                                      removeBrandVariant(
                                        groupIndex,
                                        variantIndex,
                                      )
                                    }
                                    aria-label="Remove variant"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                                <div className="variant-colors">
                                  <div className="variant-colors-header">
                                    <span className="muted">Colors/Kind</span>
                                    <button
                                      type="button"
                                      className="ghost-button"
                                      onClick={() =>
                                        addVariantColor(
                                          groupIndex,
                                          variantIndex,
                                        )
                                      }
                                    >
                                      Add Color/Kind
                                    </button>
                                  </div>
                                  {hasColors ? (
                                    <div className="variant-colors-list">
                                      {variant.colors.map(
                                        (color, colorIndex) => (
                                          <div
                                            className="variant-color-row"
                                            key={color.id || colorIndex}
                                          >
                                            <input
                                              type="text"
                                              placeholder="Color/Kind"
                                              value={color.name}
                                              onChange={updateVariantColor(
                                                groupIndex,
                                                variantIndex,
                                                colorIndex,
                                                "name",
                                              )}
                                            />
                                            <input
                                              type="number"
                                              min="0"
                                              placeholder="Qty"
                                              value={color.qtyValue}
                                              onChange={updateVariantColor(
                                                groupIndex,
                                                variantIndex,
                                                colorIndex,
                                                "qtyValue",
                                              )}
                                            />
                                            <button
                                              type="button"
                                              className="action-button"
                                              onClick={() =>
                                                removeVariantColor(
                                                  groupIndex,
                                                  variantIndex,
                                                  colorIndex,
                                                )
                                              }
                                              aria-label="Remove color"
                                            >
                                              <TrashIcon />
                                            </button>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  ) : (
                                    <span className="muted">
                                      No colors/kind added yet.
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="muted">No variants added yet.</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="muted">No brands added yet.</span>
              )}
            </div>
            <label className="modal-field">
              <span>Value ({currencyLabel})</span>
              <div
                className="tooltip-anchor tooltip-field"
                data-tooltip={
                  derivedValueLabel
                    ? formatCurrencyPair(derivedValueLabel, currency, rate)
                        .alternateValue
                    : undefined
                }
              >
                <input
                  type="text"
                  value={derivedValueLabel}
                  placeholder={currencyPlaceholder}
                  readOnly
                />
              </div>
            </label>
            <label className="modal-field">
              <span>Status</span>
              <select
                value={formData.status}
                onChange={updateField("status")}
              >
                <option>In Stock</option>
                <option>Low Stock</option>
                <option>Critical</option>
                <option>Oversupply</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Item Image</span>
              <input type="file" accept="image/*" onChange={handleImageSelected} />
            </label>
            <label className="modal-field">
              <span>Reorder</span>
              <input
                type="checkbox"
                checked={formData.reorder}
                onChange={updateField("reorder")}
              />
            </label>
          </div>
          {formData.image ? (
            <div className="upload-preview single">
              <div className="preview-item">
                <img src={formData.image} alt="Item preview" />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={clearImage}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
          <datalist id="inventory-category-options">
            {categoryOptions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <datalist id="inventory-records-warehouse-options">
            <option value="All Locations" />
            {sortedWarehouseOptions.map((warehouse) => (
              <option key={warehouse} value={warehouse} />
            ))}
          </datalist>
          {actionError ? <span className="modal-help">{actionError}</span> : null}
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(detailsRecord)}
        title="Inventory Details"
        subtitle={
          detailsRecord
            ? `${detailsRecord.item} · ${detailsRecord.sku}`
            : ""
        }
        primaryText="Close"
        onConfirm={closeDetailsModal}
        onClose={closeDetailsModal}
        hideFooter
        variant="center"
      >
        {detailsRecord ? (
          <div className="record-details">
            <div className="details-grid">
              <div className="detail-card">
                <span className="detail-label">Item</span>
                <span className="detail-value">{detailsRecord.item}</span>
                <span className="detail-sub">{detailsRecord.warehouse}</span>
              </div>
              <div className="detail-card">
                <span className="detail-label">Item ID</span>
                <span className="detail-value">{detailsRecord.sku}</span>
              </div>
              <div className="detail-card">
                <span className="detail-label">Shelf Location</span>
                <span className="detail-value">
                  {detailsRecord.shelfLocation || "-"}
                </span>
                <span className="detail-sub">
                  {detailsRecord.warehouse || "-"}
                </span>
              </div>
              <div className="detail-card">
                <span className="detail-label">Status</span>
                <span className="detail-value">{detailsRecord.status}</span>
                <span className="detail-sub">{detailQtyLabel}</span>
              </div>
              <div className="detail-card">
                <span className="detail-label">{detailPriceTitle}</span>
                <span className="detail-value">
                  <span
                    className="tooltip-anchor"
                    data-tooltip={detailPriceTooltip || undefined}
                  >
                    {detailPriceLabel || "-"}
                  </span>
                </span>
                <span className="detail-sub">
                  <span
                    className="tooltip-anchor"
                    data-tooltip={detailValueTooltip || undefined}
                  >
                    {formatCurrencyValue(detailsRecord.value, currency, rate)}
                  </span>{" "}
                  total
                </span>
              </div>
            </div>

            <div className="details-section">
              <div className="details-section-header">
                <div>
                  <h4>Brand Breakdown</h4>
                  <p className="muted">Variants organized by brand.</p>
                </div>
                <span className="detail-total">{detailQtyLabel}</span>
              </div>
              {detailGroups.length ? (
                <div className="brand-detail-list">
                  {detailGroups.map((group, groupIndex) => {
                    const groupTotal = getBrandGroupQty(
                      group,
                      detailsRecord?.qtyValue ?? null,
                      detailGroups.length,
                    );
                    const groupTotalLabel = Number.isFinite(groupTotal)
                      ? formatQtyLabel(groupTotal)
                      : "—";
                    const hasGroupPrice =
                      group.price || Number.isFinite(group.priceValue);
                    const groupPriceValue = hasGroupPrice
                      ? group.price || group.priceValue
                      : null;
                    const groupPriceLabel = hasGroupPrice
                      ? formatCurrencyValue(groupPriceValue, currency, rate)
                      : "";
                    const groupPriceTooltip = hasGroupPrice
                      ? formatCurrencyPair(groupPriceValue, currency, rate)
                          .alternateValue
                      : "";

                    return (
                      <div
                        className="brand-detail-card"
                        key={`${group.name}-${groupIndex}`}
                      >
                        <div className="brand-detail-header">
                          <div>
                            <strong>{group.name}</strong>
                            <span className="muted">
                              {group.variants.length
                                ? `${group.variants.length} variants`
                                : "No variants"}
                            </span>
                            <span className="muted">
                              {hasGroupPrice ? (
                                <>
                                  Price{" "}
                                  <span
                                    className="tooltip-anchor"
                                    data-tooltip={groupPriceTooltip || undefined}
                                  >
                                    {groupPriceLabel}
                                  </span>
                                </>
                              ) : (
                                "Price -"
                              )}
                            </span>
                          </div>
                          <span className="brand-total">
                            {groupTotalLabel}
                          </span>
                        </div>
                        {group.variants.length ? (
                          <div className="brand-variant-table">
                            <div className="brand-variant-row header">
                              <span>Variation</span>
                              <span>Colors/Kind</span>
                              <span>Item ID</span>
                              <span>Status</span>
                              <span>Price</span>
                              <span>Qty</span>
                            </div>
                            {group.variants.map((variant, variantIndex) => (
                              <div
                                className="brand-variant-row"
                                key={`${groupIndex}-${variantIndex}`}
                              >
                                {(() => {
                                  const variantPriceValue = Number.isFinite(
                                    variant.priceValue,
                                  )
                                    ? variant.priceValue
                                    : variant.price
                                      ? parsePriceValue(variant.price)
                                      : null;
                                  const resolvedVariantPrice =
                                    Number.isFinite(variantPriceValue)
                                      ? variantPriceValue
                                      : hasGroupPrice
                                        ? parsePriceValue(groupPriceValue)
                                        : null;
                                  const priceLabel = Number.isFinite(
                                    resolvedVariantPrice,
                                  )
                                    ? formatCurrencyValue(
                                        resolvedVariantPrice,
                                        currency,
                                        rate,
                                      )
                                    : "-";
                                  const priceTooltip = Number.isFinite(
                                    resolvedVariantPrice,
                                  )
                                    ? formatCurrencyPair(
                                        resolvedVariantPrice,
                                        currency,
                                        rate,
                                      ).alternateValue
                                    : "";
                                  return (
                                    <>
                                      <span>{variant.name || "-"}</span>
                                      <span>{formatVariantColors(variant)}</span>
                                      <span className="mono">
                                        {variant.sku || "-"}
                                      </span>
                                      <span
                                        className={`status-pill ${formatStatusTone(
                                          resolveVariantStatus(
                                            variant.status,
                                            detailsRecord.status,
                                          ),
                                        )}`}
                                      >
                                        {resolveVariantStatus(
                                          variant.status,
                                          detailsRecord.status,
                                        )}
                                      </span>
                                      <span
                                        className="tooltip-anchor"
                                        data-tooltip={priceTooltip || undefined}
                                      >
                                        {priceLabel}
                                      </span>
                                      <span>
                                        {variant.qtyLabel ||
                                          (Number.isFinite(
                                            getVariantQtyValue(variant),
                                          )
                                            ? formatQtyLabel(
                                                getVariantQtyValue(variant),
                                              )
                                            : "-")}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">
                            No variants tracked for this brand.
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="muted">No brands added yet.</span>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(shareRecord)}
        title="Share Inventory Record"
        subtitle="Preview the full item details before downloading."
        primaryText="Download PDF"
        secondaryText="Close"
        onConfirm={handlePrintShareReport}
        onClose={closeShareModal}
        variant="center"
      >
        {shareRecord ? (
          <div className="share-report" ref={shareReportRef}>
            <div className="share-report-header">
              <div>
                <span className="share-report-kicker">Inventory Record</span>
                <h3 className="share-report-title">{shareRecord.item}</h3>
                <span className="muted">Generated {shareGeneratedAt}</span>
              </div>
              <span
                className={`status-pill ${
                  formatStatusTone(shareRecord.status)
                }`}
              >
                {shareRecord.status}
              </span>
            </div>

            <div className="share-report-meta">
              <div className="share-report-card">
                <span>Item ID</span>
                <strong>{shareRecord.sku || "-"}</strong>
              </div>
              <div className="share-report-card">
                <span>Warehouse</span>
                <strong>{shareRecord.warehouse || "-"}</strong>
              </div>
              <div className="share-report-card">
                <span>Shelf Location</span>
                <strong>{shareRecord.shelfLocation || "-"}</strong>
              </div>
              <div className="share-report-card">
                <span>Category</span>
                <strong>{shareRecord.category || "-"}</strong>
              </div>
              <div className="share-report-card">
                <span>Quantity</span>
                <strong>{shareQtyLabel}</strong>
                <span className="muted">{shareRecord.qtyMeta || ""}</span>
              </div>
              <div className="share-report-card">
                <span>{sharePriceTitle}</span>
                <strong>{sharePriceLabel || "-"}</strong>
              </div>
              <div className="share-report-card">
                <span>Total Value</span>
                <strong>
                  {formatCurrencyValue(shareRecord.value, currency, rate) || "-"}
                </strong>
              </div>
            </div>

            {shareRecord.image ? (
              <div className="share-report-image">
                <img src={shareRecord.image} alt={shareRecord.item} />
              </div>
            ) : null}

            <div className="share-report-section">
              <div className="share-report-section-header">
                <h4>Brand Breakdown</h4>
                <span className="muted">{shareQtyLabel}</span>
              </div>
              {shareGroups.length ? (
                <div className="share-report-table">
                  <div className="share-report-row header">
                    <span>Brand</span>
                    <span>Variation</span>
                    <span>Colors/Kind</span>
                    <span>Item ID</span>
                    <span>Status</span>
                    <span>Price</span>
                    <span>Qty</span>
                  </div>
                  {shareGroups.map((group, groupIndex) => {
                    const hasGroupPrice =
                      group.price || Number.isFinite(group.priceValue);
                    const groupPriceValue = hasGroupPrice
                      ? group.price || group.priceValue
                      : null;

                    if (!group.variants.length) {
                      return (
                        <div
                          className="share-report-row"
                          key={`${group.name}-empty-${groupIndex}`}
                        >
                          <span>{group.name}</span>
                          <span className="muted">No variants</span>
                          <span>-</span>
                          <span className="mono">-</span>
                          <span
                            className={`status-pill ${formatStatusTone(
                              shareRecord.status,
                            )}`}
                          >
                            {shareRecord.status}
                          </span>
                          <span>
                            {hasGroupPrice
                              ? formatCurrencyValue(
                                  groupPriceValue,
                                  currency,
                                  rate,
                                )
                              : "-"}
                          </span>
                          <span>{shareQtyLabel}</span>
                        </div>
                      );
                    }

                    return group.variants.map((variant, variantIndex) => {
                      const variantPriceValue = Number.isFinite(
                        variant.priceValue,
                      )
                        ? variant.priceValue
                        : variant.price
                          ? parsePriceValue(variant.price)
                          : null;
                      const resolvedVariantPrice = Number.isFinite(
                        variantPriceValue,
                      )
                        ? variantPriceValue
                        : hasGroupPrice
                          ? parsePriceValue(groupPriceValue)
                          : null;
                      const variantQty = getVariantQtyValue(variant);
                      const variantQtyLabel =
                        variant.qtyLabel ||
                        (Number.isFinite(variantQty)
                          ? formatQtyLabel(variantQty)
                          : "-");
                      const variantStatus = resolveVariantStatus(
                        variant.status,
                        shareRecord.status,
                      );

                      return (
                        <div
                          className="share-report-row"
                          key={`${groupIndex}-${variantIndex}`}
                        >
                          <span>{group.name}</span>
                          <span>{variant.name || "-"}</span>
                          <span>{formatVariantColors(variant)}</span>
                          <span className="mono">{variant.sku || "-"}</span>
                          <span
                            className={`status-pill ${formatStatusTone(
                              variantStatus,
                            )}`}
                          >
                            {variantStatus}
                          </span>
                          <span>
                            {Number.isFinite(resolvedVariantPrice)
                              ? formatCurrencyValue(
                                  resolvedVariantPrice,
                                  currency,
                                  rate,
                                )
                              : "-"}
                          </span>
                          <span>{variantQtyLabel}</span>
                        </div>
                      );
                    });
                  })}
                </div>
              ) : (
                <span className="muted">No brands added yet.</span>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Inventory Record"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.item}? This cannot be undone.`
            : "Delete this inventory record?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
        variant="center"
      />
    </section>
  );
};

export default InventoryRecords;
