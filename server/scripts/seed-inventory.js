const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const ClientInventoryItem = require("../src/models/ClientInventoryItem");
const PurchasingOrder = require("../src/models/PurchasingOrder");
const Supplier = require("../src/models/Supplier");
const InventoryCategory = require("../src/models/InventoryCategory");
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

const parseCurrencyNumber = (value) => {
  if (!value) return null;
  const cleaned = String(value).replace(/[^0-9.,-]/g, "");
  const numeric = Number.parseFloat(cleaned.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const CATEGORY_TONES = ["blue", "indigo", "slate", "amber"];
const STATUS_TONES = ["blue", "green", "amber", "rose", "indigo", "slate"];

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

const buildVariant = ({ name, color, sku, qtyValue }) => ({
  name,
  color,
  sku,
  qtyValue,
  qtyLabel: formatVariantQtyLabel(qtyValue),
});

const buildQtyLabelFromVariants = (variants) => {
  const values = variants
    .map((variant) => variant.qtyValue)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return "";
  const total = values.reduce((sum, value) => sum + value, 0);
  return formatVariantQtyLabel(total);
};

const sumVariantQty = (variants) => {
  const values = variants
    .map((variant) => variant.qtyValue)
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
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
    category: "Electronics",
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
    category: "Accessories",
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
    category: "Accessories",
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
    category: "Office",
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
    category: "Electronics",
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

const inventoryCategories = [
  {
    name: "Electronics",
    description: "Core electronics and device components.",
  },
  {
    name: "Peripherals",
    description: "Input, output, and accessory devices.",
  },
  {
    name: "Accessories",
    description: "Add-ons, adapters, and supporting gear.",
  },
  {
    name: "Office",
    description: "Workspace and office-related items.",
  },
];

const mouseVariants = [
  buildVariant({
    name: "Wireless",
    color: "Black",
    sku: "MS-G903-BK-BK",
    qtyValue: 300,
  }),
  buildVariant({
    name: "Wireless",
    color: "Graphite",
    sku: "MS-G903-BK-GR",
    qtyValue: 158,
  }),
];

const keyboardVariants = [
  buildVariant({
    name: "Tenkeyless",
    color: "Slate",
    sku: "KB-TK780-SL",
    qtyValue: 8,
  }),
  buildVariant({
    name: "Tenkeyless",
    color: "Silver",
    sku: "KB-TK780-SV",
    qtyValue: 4,
  }),
];

const hubVariants = [
  buildVariant({
    name: "10-Port",
    color: "Gray",
    sku: "HB-UC10-GR",
    qtyValue: 702,
  }),
  buildVariant({
    name: "USB-C",
    color: "Midnight",
    sku: "HB-UC10-MD",
    qtyValue: 400,
  }),
];

const standVariants = [
  buildVariant({
    name: "Dual Arm",
    color: "Black",
    sku: "ST-DU100-ST",
    qtyValue: 54,
  }),
  buildVariant({
    name: "Dual Arm",
    color: "Matte Black",
    sku: "ST-DU100-MB",
    qtyValue: 30,
  }),
];

const inventoryRecords = [
  {
    item: "Pro-G Wireless Mouse",
    warehouse: "Warehouse A",
    subtext: "Warehouse A",
    sku: "MS-G903-BK",
    brand: "Logitech",
    category: "Electronics",
    categoryTone: pickRandomTone(CATEGORY_TONES),
    qtyLabel: buildQtyLabelFromVariants(mouseVariants),
    qtyValue: sumVariantQty(mouseVariants),
    maxQty: 600,
    qtyMeta: computeQtyMetaFromCapacity(
      sumVariantQty(mouseVariants),
      600,
    ),
    variations: "Wireless, Ergonomic",
    colors: "Black, Graphite",
    variants: mouseVariants,
    price: "$89.99",
    value: "$41,215",
    priceValue: parseCurrencyNumber("$89.99"),
    valueValue: parseCurrencyNumber("$41,215"),
    location: "A-04-12",
    status: "In Stock",
    statusTone: pickRandomTone(STATUS_TONES),
    reorder: false,
    image:
      "https://images.unsplash.com/photo-1527814050087-3793815479db?q=80&w=200&auto=format&fit=crop",
  },
  {
    item: "Kinesis TKL Mechanical",
    warehouse: "Warehouse B",
    subtext: "Warehouse B",
    sku: "KB-TK780-SL",
    brand: "Kinesis",
    category: "Peripherals",
    categoryTone: pickRandomTone(CATEGORY_TONES),
    qtyLabel: buildQtyLabelFromVariants(keyboardVariants),
    qtyValue: sumVariantQty(keyboardVariants),
    maxQty: 40,
    qtyMeta: computeQtyMetaFromCapacity(
      sumVariantQty(keyboardVariants),
      40,
    ),
    variations: "Tenkeyless",
    colors: "Slate",
    variants: keyboardVariants,
    price: "$149.50",
    value: "$1,794",
    priceValue: parseCurrencyNumber("$149.50"),
    valueValue: parseCurrencyNumber("$1,794"),
    location: "B-12-04",
    status: "Critical",
    statusTone: pickRandomTone(STATUS_TONES),
    reorder: true,
    image:
      "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=200&auto=format&fit=crop",
  },
  {
    item: "UltraConnect Hub",
    warehouse: "Warehouse A",
    subtext: "Warehouse A",
    sku: "HB-UC10-GR",
    brand: "Anker",
    category: "Accessories",
    categoryTone: pickRandomTone(CATEGORY_TONES),
    qtyLabel: buildQtyLabelFromVariants(hubVariants),
    qtyValue: sumVariantQty(hubVariants),
    maxQty: 1500,
    qtyMeta: computeQtyMetaFromCapacity(sumVariantQty(hubVariants), 1500),
    variations: "10-Port, USB-C",
    colors: "Gray",
    variants: hubVariants,
    price: "$45.00",
    value: "$49,590",
    priceValue: parseCurrencyNumber("$45.00"),
    valueValue: parseCurrencyNumber("$49,590"),
    location: "A-01-02",
    status: "Oversupply",
    statusTone: pickRandomTone(STATUS_TONES),
    reorder: false,
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=200&auto=format&fit=crop",
  },
  {
    item: "Dual Monitor Stand",
    warehouse: "Warehouse C",
    subtext: "Warehouse C",
    sku: "ST-DU100-ST",
    brand: "Mount-It",
    category: "Office",
    categoryTone: pickRandomTone(CATEGORY_TONES),
    qtyLabel: buildQtyLabelFromVariants(standVariants),
    qtyValue: sumVariantQty(standVariants),
    maxQty: 150,
    qtyMeta: computeQtyMetaFromCapacity(sumVariantQty(standVariants), 150),
    variations: "Dual Arm",
    colors: "Black",
    variants: standVariants,
    price: "$120.00",
    value: "$10,080",
    priceValue: parseCurrencyNumber("$120.00"),
    valueValue: parseCurrencyNumber("$10,080"),
    location: "C-02-09",
    status: "Low Stock",
    statusTone: pickRandomTone(STATUS_TONES),
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
      InventoryCategory.deleteMany({}),
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
    InventoryCategory,
    inventoryCategories.map((category) => ({ ...category, ...auditFields })),
    ["name"],
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
