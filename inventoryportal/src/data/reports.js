export const reportCards = [
  {
    id: "inventory-summary",
    title: "Inventory Summary",
    description:
      "Overview of current stock levels and categories across all warehouses.",
    icon: "summary",
    tone: "blue",
  },
  {
    id: "low-stock",
    title: "Low Stock Report",
    description: "Detailed list of items below minimum threshold requiring restock.",
    icon: "lowStock",
    tone: "amber",
  },
  {
    id: "inventory-movement",
    title: "Inventory Movement",
    description: "Tracking stock-ins and stock-outs over a specific time period.",
    icon: "movement",
    tone: "green",
  },
  {
    id: "valuation",
    title: "Valuation",
    description: "Total asset value of current inventory based on cost price.",
    icon: "valuation",
    tone: "violet",
  },
  {
    id: "supplier-history",
    title: "Supplier History",
    description: "Performance and delivery history of all active suppliers.",
    icon: "supplier",
    tone: "indigo",
  },
];

export const recentReports = [
  {
    id: "RPT-2023-001",
    name: "Annual Inventory Summary 2023",
    created: "Oct 24, 2023 • 14:32",
    generatedBy: "John Doe",
    status: "Ready",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
  {
    id: "RPT-2023-002",
    name: "Warehouse Q3 Movement Data",
    created: "Oct 20, 2023 • 09:15",
    generatedBy: "System Admin",
    status: "Ready",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
  {
    id: "RPT-2023-003",
    name: "Supplier Audit Trail Report",
    created: "Oct 18, 2023 • 17:45",
    generatedBy: "Jane Smith",
    status: "Expired",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
  {
    id: "RPT-2023-004",
    name: "Quarterly Valuation Export",
    created: "Oct 15, 2023 • 11:20",
    generatedBy: "John Doe",
    status: "Ready",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
];
