const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const ClientInventoryItem = require("../src/models/ClientInventoryItem");
const PurchasingOrder = require("../src/models/PurchasingOrder");
const Supplier = require("../src/models/Supplier");
const InventoryRecord = require("../src/models/InventoryRecord");
const StockTransaction = require("../src/models/StockTransaction");
const InventoryReport = require("../src/models/InventoryReport");
const InventorySettings = require("../src/models/InventorySettings");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const parseDate = (value) => {
  if (!value) return null;
  const normalized = String(value).replace("•", "").replace(/\s+/g, " ").trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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

const upsertMany = async (Model, docs, keyFields) => {
  for (const doc of docs) {
    const filter = keyFields.reduce((acc, key) => {
      if (doc[key] !== undefined && doc[key] !== null && doc[key] !== "") {
        acc[key] = doc[key];
      }
      return acc;
    }, {});

    if (!Object.keys(filter).length) {
      continue;
    }

    await Model.findOneAndUpdate(filter, doc, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  }
};

const clientItems = [
  {
    clientName: "Global Tech Solutions",
    clientPhone: "+1 (555) 012-4455",
    itemName: "Enterprise Rack Server",
    serialNumber: "RS-98234-X",
    receivedAt: parseDate("Oct 24, 2023"),
    warehouse: "WH-B4",
    status: "Received",
  },
  {
    clientName: "Sarah Jenkins",
    clientPhone: "+1 (555) 987-1234",
    itemName: "MacBook Pro 16",
    serialNumber: "C02F5HMD",
    receivedAt: parseDate("Oct 26, 2023"),
    warehouse: "WH-SEC-02",
    status: "Inspection",
  },
  {
    clientName: "David Miller",
    clientPhone: "+1 (555) 443-2111",
    itemName: "HP LaserJet Pro",
    serialNumber: "HP-P450-112",
    receivedAt: parseDate("Oct 27, 2023"),
    warehouse: "WH-NA1",
    status: "Received",
  },
  {
    clientName: "Quantum Logistics",
    clientPhone: "+1 (555) 776-0099",
    itemName: "Industrial Tablet",
    serialNumber: "ZB-4498-R1",
    receivedAt: parseDate("Oct 20, 2023"),
    warehouse: "WH-OUT-A4",
    status: "In Progress",
  },
  {
    clientName: "Marcus Sterling",
    clientPhone: "+1 (555) 321-6547",
    itemName: "Workstation PC",
    serialNumber: "DELL-WS-0891",
    receivedAt: parseDate("Oct 23, 2023"),
    warehouse: "WH-INS-02",
    status: "Awaiting Parts",
  },
  {
    clientName: "Horizon Health",
    clientPhone: "+1 (555) 690-8804",
    itemName: "Ultrasound Console",
    serialNumber: "USS-1102-K",
    receivedAt: parseDate("Oct 21, 2023"),
    warehouse: "WH-CLN-07",
    status: "Completed",
  },
];

const purchaseOrders = [
  {
    poNumber: "PO-2023-0891",
    supplierName: "Global Dynamics Ltd.",
    supplierInitials: "GD",
    supplierTone: "blue",
    items: [
      {
        name: "Server Chassis",
        image:
          "https://images.unsplash.com/photo-1527814050087-3793815479db?q=80&w=200&auto=format&fit=crop",
      },
      {
        name: "Rack Switch",
        image:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=200&auto=format&fit=crop",
      },
      {
        name: "Spare Parts",
        image:
          "https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?q=80&w=200&auto=format&fit=crop",
      },
    ],
    itemsCount: 12,
    total: "$12,450.00",
    status: "Ordered",
    dateRequestPlaced: parseDate("Oct 24, 2023"),
  },
  {
    poNumber: "PO-2023-0890",
    supplierName: "Stark Components",
    supplierInitials: "SC",
    supplierTone: "amber",
    items: [
      {
        name: "Controller Unit",
        image:
          "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=200&auto=format&fit=crop",
      },
      {
        name: "Circuit Bundle",
        image:
          "https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?q=80&w=200&auto=format&fit=crop",
      },
    ],
    itemsCount: 4,
    total: "$3,120.50",
    status: "Pending",
    dateRequestPlaced: parseDate("Oct 23, 2023"),
  },
  {
    poNumber: "PO-2023-0889",
    supplierName: "Eco Logistics",
    supplierInitials: "EL",
    supplierTone: "green",
    items: [
      {
        name: "Inventory Kits",
        image:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=200&auto=format&fit=crop",
      },
      {
        name: "Packing Supplies",
        image:
          "https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?q=80&w=200&auto=format&fit=crop",
      },
      {
        name: "Docking Gear",
        image:
          "https://images.unsplash.com/photo-1527814050087-3793815479db?q=80&w=200&auto=format&fit=crop",
      },
    ],
    itemsCount: 28,
    total: "$45,900.00",
    status: "Received",
    dateRequestPlaced: parseDate("Oct 20, 2023"),
  },
  {
    poNumber: "PO-2023-0885",
    supplierName: "North Chemicals",
    supplierInitials: "NC",
    supplierTone: "slate",
    items: [
      {
        name: "Lab Reagent",
        image:
          "https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?q=80&w=200&auto=format&fit=crop",
      },
    ],
    itemsCount: 1,
    total: "$1,450.00",
    status: "Cancelled",
    dateRequestPlaced: parseDate("Oct 18, 2023"),
  },
  {
    poNumber: "PO-2023-0881",
    supplierName: "Global Dynamics Ltd.",
    supplierInitials: "GD",
    supplierTone: "blue",
    items: [
      {
        name: "Workstation Add-ons",
        image:
          "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=200&auto=format&fit=crop",
      },
    ],
    itemsCount: 5,
    total: "$8,900.00",
    status: "Received",
    dateRequestPlaced: parseDate("Oct 15, 2023"),
  },
];

const suppliers = [
  {
    code: "SUP-2041",
    name: "Global Tech Solutions",
    contactPerson: "Michael Chen",
    role: "Account Lead",
    phone: "+1 (555) 012-3456",
    email: "m.chen@globaltech.com",
    products: [
      { label: "Semiconductors", tone: "blue" },
      { label: "PCB Boards", tone: "indigo" },
    ],
    openPO: { label: "12 Pending", status: "pending" },
    tone: "blue",
  },
  {
    code: "SUP-1879",
    name: "Apex Logistics Intl.",
    contactPerson: "Sarah Jenkins",
    role: "Operations Manager",
    phone: "+44 20 7123 4567",
    email: "s.jenkins@apexlog.uk",
    products: [
      { label: "Freight", tone: "green" },
      { label: "Warehousing", tone: "slate" },
    ],
    openPO: { label: "0 Open", status: "open" },
    tone: "indigo",
  },
  {
    code: "SUP-1620",
    name: "Precision Parts Inc.",
    contactPerson: "David Miller",
    role: "Procurement Lead",
    phone: "+1 (555) 987-6543",
    email: "d.miller@precision.io",
    products: [
      { label: "CNC Machining", tone: "violet" },
      { label: "Fasteners", tone: "slate" },
    ],
    openPO: { label: "3 Processing", status: "processing" },
    tone: "amber",
  },
  {
    code: "SUP-1403",
    name: "EcoPack Co.",
    contactPerson: "Elena Rodriguez",
    role: "Sustainability",
    phone: "+34 91 555 12 34",
    email: "e.ro@ecopack.es",
    products: [{ label: "Sustainable Boxes", tone: "green" }],
    openPO: { label: "1 Active", status: "active" },
    tone: "green",
  },
];

const inventoryRecords = [
  {
    item: "Pro-G Wireless Mouse",
    subtext: "Warehouse A, R4",
    sku: "MS-G903-BK",
    category: "Electronics",
    categoryTone: "blue",
    qtyLabel: "458 Units",
    qtyMeta: "82%",
    qtyState: "good",
    qtyFill: "p82",
    price: "$89.99",
    value: "$41,215",
    location: "A-04-12",
    status: "In Stock",
    statusTone: "in-stock",
    reorder: false,
    image:
      "https://images.unsplash.com/photo-1527814050087-3793815479db?q=80&w=200&auto=format&fit=crop",
  },
  {
    item: "Kinesis TKL Mechanical",
    subtext: "Warehouse B, L12",
    sku: "KB-TK780-SL",
    category: "Peripherals",
    categoryTone: "slate",
    qtyLabel: "12 Units",
    qtyMeta: "Low",
    qtyState: "critical",
    qtyFill: "p12",
    price: "$149.50",
    value: "$1,794",
    location: "B-12-04",
    status: "Critical",
    statusTone: "critical",
    reorder: true,
    image:
      "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=200&auto=format&fit=crop",
  },
  {
    item: "UltraConnect Hub",
    subtext: "Warehouse A, R1",
    sku: "HB-UC10-GR",
    category: "Accessories",
    categoryTone: "indigo",
    qtyLabel: "1,102 Units",
    qtyMeta: "Full",
    qtyState: "full",
    qtyFill: "p100",
    price: "$45.00",
    value: "$49,590",
    location: "A-01-02",
    status: "Oversupply",
    statusTone: "oversupply",
    reorder: false,
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=200&auto=format&fit=crop",
  },
  {
    item: "Dual Monitor Stand",
    subtext: "Warehouse C, Shelf 2",
    sku: "ST-DU100-ST",
    category: "Office",
    categoryTone: "amber",
    qtyLabel: "84 Units",
    qtyMeta: "35%",
    qtyState: "low",
    qtyFill: "p35",
    price: "$120.00",
    value: "$10,080",
    location: "C-02-09",
    status: "Low Stock",
    statusTone: "low-stock",
    reorder: false,
    image:
      "https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?q=80&w=200&auto=format&fit=crop",
  },
];

const stockTransactions = [
  {
    txid: "TR-8942",
    item: "Logitech MX Master 3S",
    sku: "MCE-001",
    type: "Stock In",
    qty: 45,
    source: "Supplier: Logitech HK",
    destination: "Central Warehouse",
    date: parseDate("Oct 24, 2023"),
    staff: "S. Miller",
    notes: "Monthly restock",
  },
  {
    txid: "TR-8941",
    item: "Keychron Q1 Pro",
    sku: "KEY-012",
    type: "Stock Out",
    qty: -12,
    source: "Central Warehouse",
    destination: "Client: TechCorp Inc.",
    date: parseDate("Oct 23, 2023"),
    staff: "J. Doe",
    notes: "Order #5521",
  },
  {
    txid: "TR-8940",
    item: "Dell UltraSharp 27",
    sku: "MON-270",
    type: "Transfer",
    qty: 5,
    source: "Main Hub",
    destination: "East Branch",
    date: parseDate("Oct 23, 2023"),
    staff: "A. Johnson",
    notes: "Internal reallocation",
  },
  {
    txid: "TR-8939",
    item: "USB-C Hub Gen 2",
    sku: "ACC-091",
    type: "Adjustment",
    qty: -2,
    source: "Central Warehouse",
    destination: "-",
    date: parseDate("Oct 22, 2023"),
    staff: "M. Kross",
    notes: "Damaged stock",
  },
  {
    txid: "TR-8938",
    item: "Smart LED Bulb B22",
    sku: "IOT-005",
    type: "Stock In",
    qty: 100,
    source: "Supplier: BrightBeam",
    destination: "Main Hub",
    date: parseDate("Oct 21, 2023"),
    staff: "S. Miller",
    notes: "New product onboarding",
  },
];

const reports = [
  {
    name: "Annual Inventory Summary 2023",
    createdAtOverride: parseDate("Oct 24, 2023 14:32"),
    generatedBy: "John Doe",
    status: "Ready",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
  {
    name: "Warehouse Q3 Movement Data",
    createdAtOverride: parseDate("Oct 20, 2023 09:15"),
    generatedBy: "System Admin",
    status: "Ready",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
  {
    name: "Supplier Audit Trail Report",
    createdAtOverride: parseDate("Oct 18, 2023 17:45"),
    generatedBy: "Jane Smith",
    status: "Expired",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
  {
    name: "Quarterly Valuation Export",
    createdAtOverride: parseDate("Oct 15, 2023 11:20"),
    generatedBy: "John Doe",
    status: "Ready",
    downloads: ["PDF", "CSV", "EXCEL"],
  },
];

const seedInventory = async () => {
  const shouldReset = process.argv.includes("--reset");

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const seedUser = await ensureSeedUser();
  const auditFields = seedUser
    ? { createdBy: seedUser._id, updatedBy: seedUser._id }
    : {};

  if (shouldReset) {
    await Promise.all([
      ClientInventoryItem.deleteMany({}),
      PurchasingOrder.deleteMany({}),
      Supplier.deleteMany({}),
      InventoryRecord.deleteMany({}),
      StockTransaction.deleteMany({}),
      InventoryReport.deleteMany({}),
      InventorySettings.deleteMany({}),
    ]);
  }

  await upsertMany(
    ClientInventoryItem,
    clientItems.map((item) => ({ ...item, ...auditFields })),
    ["clientName", "itemName", "serialNumber"],
  );
  await upsertMany(
    PurchasingOrder,
    purchaseOrders.map((order) => ({
      ...order,
      requestStatus: order.status,
      ...auditFields,
    })),
    ["poNumber"],
  );
  await upsertMany(
    Supplier,
    suppliers.map((supplier) => ({ ...supplier, ...auditFields })),
    ["code", "name"],
  );
  await upsertMany(
    InventoryRecord,
    inventoryRecords.map((record) => ({ ...record, ...auditFields })),
    ["sku"],
  );
  await upsertMany(
    StockTransaction,
    stockTransactions.map((tx) => ({ ...tx, ...auditFields })),
    ["txid"],
  );
  await upsertMany(
    InventoryReport,
    reports.map((report) => ({ ...report, createdBy: seedUser?._id })),
    ["name"],
  );

  await upsertMany(
    InventorySettings,
    [
      {
        organizationName: "MagicHands Logistics",
        primaryContactEmail: "ops@magichands.io",
        currency: "GHS",
        currencyRate: 1,
        timezone: "Africa/Accra",
        dateFormat: "DD MMM, YYYY",
        numberFormat: "1,234.56",
        notifyLowStock: true,
        notifyPurchaseOrders: true,
        notifyWeeklySummary: false,
        defaultWarehouse: "Central Warehouse",
        lowStockThreshold: 18,
        unitOfMeasure: "Pieces",
        autoReorder: false,
        theme: "System",
        tableDensity: "Comfortable",
        defaultExportFormat: "CSV",
        posErpConnection: "Not connected",
        dataRetention: "24 months",
        auditLogAccess: "Admins only",
        ...auditFields,
      },
    ],
    ["organizationName"],
  );

  console.log("Inventory seed complete.");
  await mongoose.disconnect();
};

seedInventory().catch((error) => {
  console.error("Inventory seed failed:", error);
  mongoose.disconnect();
  process.exit(1);
});
