const BREADCRUMB_MAP = {
  dashboard: { section: "System", page: "Dashboard" },
  "inventory-types": { section: "Inventory", page: "Inventory Categories" },
  "inventory-records": { section: "Inventory", page: "Inventory Records" },
  "price-list": { section: "Catalog", page: "Price List" },
  "stock-transactions": { section: "Inventory", page: "Stock Transactions" },
  "client-items": { section: "Service Desk", page: "Client Items" },
  suppliers: { section: "Purchasing", page: "Suppliers" },
  "purchase-orders": { section: "Purchasing", page: "Purchase Orders" },
  reports: { section: "System", page: "Reports" },
  settings: { section: "System", page: "Settings" },
};

export const getBreadcrumbText = (pageKey, fallback = "") => {
  const key = String(pageKey || "").trim();
  const entry = BREADCRUMB_MAP[key];
  if (!entry) return fallback;
  return `${entry.section} / ${entry.page}`;
};

export const getBreadcrumbParts = (pageKey) => {
  const key = String(pageKey || "").trim();
  const entry = BREADCRUMB_MAP[key];
  if (!entry) return { section: "", page: "" };
  return entry;
};

export default BREADCRUMB_MAP;
