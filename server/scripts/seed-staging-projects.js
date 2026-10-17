const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const Project = require("../src/models/Project");

const envFile = process.env.DOTENV_FILE || ".env.staging";
dotenv.config({
  path: path.isAbsolute(envFile)
    ? envFile
    : path.resolve(__dirname, "..", envFile),
  quiet: true,
});

const APPLY_FLAG = "--apply";
const SHARED_PASSWORD = "Staging123!";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR_MS);
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

const userFixtures = [
  {
    employeeId: "STG-ADMIN",
    firstName: "Avery",
    lastName: "Admin",
    email: "stage.admin@magichands.dev",
    role: "admin",
    department: ["Administration"],
    position: "Leader",
  },
  {
    employeeId: "STG-FD-001",
    firstName: "Nana",
    lastName: "Mensah",
    email: "stage.frontdesk@magichands.dev",
    role: "user",
    department: ["Front Desk"],
    position: "Member",
  },
  {
    employeeId: "STG-LEAD-001",
    firstName: "Ama",
    lastName: "Owusu",
    email: "stage.lead.one@magichands.dev",
    role: "user",
    department: ["Administration"],
    position: "Leader",
  },
  {
    employeeId: "STG-LEAD-002",
    firstName: "Kojo",
    lastName: "Asante",
    email: "stage.lead.two@magichands.dev",
    role: "user",
    department: ["Administration"],
    position: "Member",
  },
  {
    employeeId: "STG-GFX-001",
    firstName: "Efua",
    lastName: "Boateng",
    email: "stage.graphics@magichands.dev",
    role: "user",
    department: ["Graphics/Design"],
    position: "Leader",
  },
  {
    employeeId: "STG-PROD-001",
    firstName: "Kwame",
    lastName: "Addo",
    email: "stage.production.one@magichands.dev",
    role: "user",
    department: ["Production", "dtf", "screen-printing"],
    position: "Leader",
  },
  {
    employeeId: "STG-PROD-002",
    firstName: "Akosua",
    lastName: "Bediako",
    email: "stage.production.two@magichands.dev",
    role: "user",
    department: ["Production", "large-format", "digital-press"],
    position: "Member",
  },
  {
    employeeId: "STG-STORE-001",
    firstName: "Yaw",
    lastName: "Ofori",
    email: "stage.stores@magichands.dev",
    role: "user",
    department: ["Stores"],
    position: "Leader",
  },
  {
    employeeId: "STG-PHOTO-001",
    firstName: "Adwoa",
    lastName: "Kusi",
    email: "stage.photography@magichands.dev",
    role: "user",
    department: ["Photography"],
    position: "Member",
  },
];

const projectFixtures = [
  {
    orderId: "STG-260001",
    name: "New Employee Welcome Kits",
    client: "Northstar Consulting",
    status: "Order Created",
    type: "Standard",
    departments: ["Graphics/Design", "Production", "Stores"],
    items: [
      { description: "Branded welcome kit", breakdown: "Notebook, mug, tote bag", qty: 80 },
    ],
    ageHours: 4,
    deliveryOffsetDays: 18,
  },
  {
    orderId: "STG-260002",
    name: "Retail Launch Campaign Assets",
    client: "Vela Retail Ghana",
    status: "Pending Departmental Engagement",
    type: "Corporate Job",
    departments: ["Graphics/Design", "Production", "Photography"],
    items: [
      { description: "Launch campaign asset pack", breakdown: "Posters, shelf talkers, social cards", qty: 240 },
    ],
    ageHours: 30,
    deliveryOffsetDays: 12,
  },
  {
    orderId: "STG-260003",
    name: "Fintech Conference Merchandise",
    client: "CedarPay Africa",
    status: "Pending Mockup",
    type: "Standard",
    departments: ["Graphics/Design", "dtf", "Stores"],
    items: [
      { description: "Conference T-shirts", breakdown: "Black, S-XXL", qty: 300 },
      { description: "Branded tote bags", breakdown: "Natural canvas", qty: 300 },
    ],
    ageHours: 55,
    deliveryOffsetDays: 9,
  },
  {
    orderId: "STG-260004",
    name: "University Alumni Rebrand Pack",
    client: "Atlantic University Alumni",
    status: "Mockup Completed",
    type: "Standard",
    departments: ["Graphics/Design", "digital-press"],
    items: [
      { description: "Alumni stationery pack", breakdown: "Folders, letterheads, ID cards", qty: 500 },
    ],
    ageHours: 9,
    deliveryOffsetDays: 14,
    mockupApproved: true,
  },
  {
    orderId: "STG-260005",
    name: "Annual Report Print Run",
    client: "Greenline Foundation",
    status: "Pending Master Approval",
    type: "Corporate Job",
    departments: ["Graphics/Design", "digital-press"],
    items: [
      { description: "Annual report", breakdown: "A4, 64 pages, perfect bound", qty: 350 },
    ],
    ageHours: 13,
    deliveryOffsetDays: 7,
    mockupApproved: true,
  },
  {
    orderId: "STG-260006",
    name: "Emergency Event Directional Signs",
    client: "Summit Events",
    status: "Pending Production",
    type: "Emergency",
    priority: "Urgent",
    departments: ["large-format", "digital-cutting"],
    items: [
      { description: "Directional signs", breakdown: "Foam board with vinyl print", qty: 24 },
    ],
    ageHours: 10,
    deliveryOffsetDays: 2,
    paid: true,
  },
  {
    orderId: "STG-260007",
    name: "Field Team Uniform Rollout",
    client: "Apex Distribution",
    status: "Production In Progress",
    type: "Corporate Job",
    departments: ["dtf", "embroidery"],
    items: [
      { description: "Polo shirts", breakdown: "Navy with embroidered chest logo", qty: 180 },
      { description: "Safety vests", breakdown: "Reflective, printed back logo", qty: 60 },
    ],
    ageHours: 36,
    deliveryOffsetDays: 5,
    paid: true,
    productionState: "in_progress",
  },
  {
    orderId: "STG-260008",
    name: "Product Label Restock",
    client: "Blue Orchard Foods",
    status: "Production Completed",
    type: "Standard",
    departments: ["digital-press", "digital-cutting"],
    items: [
      { description: "Waterproof product labels", breakdown: "Three SKUs, gloss laminate", qty: 2400 },
    ],
    ageHours: 5,
    deliveryOffsetDays: 3,
    paid: true,
    productionState: "completed",
  },
  {
    orderId: "STG-260009",
    name: "Executive Gift Box Set",
    client: "Helix Capital",
    status: "Pending Quality Control",
    type: "Standard",
    departments: ["uv-printing", "engraving", "Stores"],
    items: [
      { description: "Executive gift boxes", breakdown: "Tumbler, pen, notebook", qty: 45 },
    ],
    ageHours: 18,
    deliveryOffsetDays: 2,
    paid: true,
    productionState: "completed",
  },
  {
    orderId: "STG-260010",
    name: "Trade Show Booth Graphics",
    client: "Nova Mobility",
    status: "Pending Packaging",
    type: "Emergency",
    priority: "Urgent",
    departments: ["large-format", "Stores"],
    items: [
      { description: "Booth graphics kit", breakdown: "Backdrop, counter wrap, pull-up banners", qty: 8 },
    ],
    ageHours: 28,
    deliveryOffsetDays: 1,
    paid: true,
    productionState: "completed",
  },
  {
    orderId: "STG-260011",
    name: "Branch Opening Brand Pack",
    client: "Unity Microfinance",
    status: "Pending Delivery/Pickup",
    type: "Corporate Job",
    departments: ["large-format", "digital-press", "Stores"],
    items: [
      { description: "Branch branding pack", breakdown: "Exterior signs, posters, desk materials", qty: 65 },
    ],
    ageHours: 14,
    deliveryOffsetDays: 1,
    paid: true,
    productionState: "completed",
  },
  {
    orderId: "STG-260012",
    name: "Client Appreciation Hampers",
    client: "Meridian Insurance",
    status: "Delivered",
    type: "Standard",
    departments: ["uv-printing", "Stores"],
    items: [
      { description: "Client hampers", breakdown: "Custom box with branded accessories", qty: 100 },
    ],
    ageHours: 20,
    deliveryOffsetDays: -1,
    paid: true,
    productionState: "completed",
  },
  {
    orderId: "STG-260013",
    name: "Regional Store Signage Quote",
    client: "Marula Home",
    status: "Quote Created",
    type: "Quote",
    departments: ["Graphics/Design", "large-format", "installation"],
    items: [
      { description: "Store signage package", breakdown: "12 locations", qty: 12 },
    ],
    ageHours: 3,
    deliveryOffsetDays: 30,
  },
  {
    orderId: "STG-260014",
    name: "Public Health Outreach Materials",
    client: "Community Health Network",
    status: "Pending Quote Requirements",
    type: "Quote",
    departments: ["Graphics/Design", "digital-press", "screen-printing"],
    items: [
      { description: "Outreach materials", breakdown: "Flyers, T-shirts, banners", qty: 1800 },
    ],
    ageHours: 27,
    deliveryOffsetDays: 24,
  },
  {
    orderId: "STG-260015",
    name: "National Dealer Uniform Quote",
    client: "Orbit Auto Ghana",
    status: "Pending Client Decision",
    type: "Quote",
    departments: ["Graphics/Design", "embroidery", "dtf"],
    items: [
      { description: "Dealer uniforms", breakdown: "Polos, jackets, caps", qty: 650 },
    ],
    ageHours: 90,
    deliveryOffsetDays: 35,
  },
  {
    orderId: "STG-260016",
    name: "Completed Corporate Stationery",
    client: "Kite Legal Partners",
    status: "Finished",
    type: "Standard",
    departments: ["Graphics/Design", "digital-press"],
    items: [
      { description: "Corporate stationery", breakdown: "Business cards, letterheads, envelopes", qty: 1200 },
    ],
    ageHours: 120,
    deliveryOffsetDays: -5,
    paid: true,
    productionState: "completed",
  },
];

const workflowPaths = {
  standard: [
    "Order Created",
    "Pending Departmental Engagement",
    "Departmental Engagement Completed",
    "Pending Mockup",
    "Mockup Completed",
    "Pending Master Approval",
    "Master Approval Completed",
    "Pending Production",
    "Production In Progress",
    "Production Completed",
    "Pending Quality Control",
    "Quality Control Completed",
    "Pending Photography",
    "Photography Completed",
    "Pending Packaging",
    "Packaging Completed",
    "Pending Delivery/Pickup",
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Finished",
  ],
  quote: [
    "Quote Created",
    "Pending Scope Approval",
    "Scope Approval Completed",
    "Pending Quote Requirements",
    "Pending Cost Verification",
    "Cost Verification Completed",
    "Pending Quote Submission",
    "Quote Submission Completed",
    "Pending Client Decision",
  ],
};

const buildStatusHistory = (fixture, actorId, createdAt, statusChangedAt) => {
  const pathValues = fixture.type === "Quote" ? workflowPaths.quote : workflowPaths.standard;
  const targetIndex = pathValues.indexOf(fixture.status);
  const statuses = targetIndex >= 0 ? pathValues.slice(0, targetIndex + 1) : [fixture.status];
  const availableMs = Math.max(HOUR_MS, statusChangedAt.getTime() - createdAt.getTime());
  const stepMs = availableMs / Math.max(1, statuses.length);

  return statuses.map((status, index) => ({
    fromStatus: index === 0 ? "" : statuses[index - 1],
    toStatus: status,
    changedAt:
      index === statuses.length - 1
        ? statusChangedAt
        : new Date(createdAt.getTime() + stepMs * (index + 1)),
    changedBy: actorId,
  }));
};

const seedUsers = async () => {
  const usersByEmployeeId = new Map();
  let created = 0;
  let updated = 0;

  for (const fixture of userFixtures) {
    let user = await User.findOne({ employeeId: fixture.employeeId });
    if (!user) {
      user = new User({
        ...fixture,
        password: SHARED_PASSWORD,
        employeeType: "Staff",
        productionAccess: "Departmental Production",
        notificationSettings: { email: false, push: true, sound: false },
        themePreference: "system",
      });
      created += 1;
    } else {
      user.set({
        ...fixture,
        employeeType: "Staff",
        productionAccess: "Departmental Production",
      });
      updated += 1;
    }

    await user.save();
    usersByEmployeeId.set(user.employeeId, user);
  }

  return { usersByEmployeeId, created, updated };
};

const seedProjects = async (usersByEmployeeId) => {
  const admin = usersByEmployeeId.get("STG-ADMIN");
  const leadOne = usersByEmployeeId.get("STG-LEAD-001");
  const leadTwo = usersByEmployeeId.get("STG-LEAD-002");
  const productionOne = usersByEmployeeId.get("STG-PROD-001");
  const productionTwo = usersByEmployeeId.get("STG-PROD-002");
  let created = 0;
  let updated = 0;

  for (const [index, fixture] of projectFixtures.entries()) {
    const createdAt = daysAgo(20 + index * 2);
    const statusChangedAt = hoursAgo(fixture.ageHours);
    const lead = index % 2 === 0 ? leadOne : leadTwo;
    const assistant = index % 2 === 0 ? leadTwo : leadOne;
    const productionOwner = index % 2 === 0 ? productionOne : productionTwo;
    const productionStartedAt = daysAgo(Math.max(1, Math.ceil(fixture.ageHours / 24) + 1));
    const isProductionActive = fixture.productionState === "in_progress";
    const isProductionComplete = fixture.productionState === "completed";
    const statusHistory = buildStatusHistory(
      fixture,
      admin._id,
      createdAt,
      statusChangedAt,
    );
    const commonItemAssignments = fixture.departments.map((department) => ({
      department,
      scope: "Staging workflow test assignment",
    }));

    const payload = {
      orderId: fixture.orderId,
      orderDate: createdAt,
      receivedTime: "09:00",
      details: {
        lead: `${lead.firstName} ${lead.lastName}`,
        client: fixture.client,
        clientEmail: `testing+${fixture.orderId.toLowerCase()}@example.com`,
        clientPhone: "+233 20 000 0000",
        projectName: fixture.name,
        projectNameRaw: fixture.name,
        projectIndicator: "STAGING MOCK",
        briefOverview: `Staging fixture for testing ${fixture.status} workflows.`,
        deliveryDate: daysFromNow(fixture.deliveryOffsetDays),
        deliveryTime: "15:00",
        deliveryLocation: "MagicHands staging test location",
        contactType: "None",
        supplySource: ["in-house"],
        packagingType: "Standard branded packaging",
      },
      departments: fixture.departments,
      items: fixture.items.map((item) => ({
        ...item,
        productionAssignments: commonItemAssignments,
      })),
      status: fixture.status,
      statusChangedAt,
      statusHistory,
      currentStep: 5,
      createdBy: admin._id,
      projectLeadId: lead._id,
      assistantLeadId: assistant._id,
      productionOwnerId:
        fixture.productionState || fixture.status.includes("Production")
          ? productionOwner._id
          : null,
      projectType: fixture.type,
      priority: fixture.priority || "Normal",
      lineageId: null,
      parentProjectId: null,
      versionNumber: 1,
      isLatestVersion: true,
      versionState: "active",
      meetingOverride: {
        skipped: true,
        skippedAt: createdAt,
        skippedBy: admin._id,
      },
      productionTracking: {
        startedAt:
          isProductionActive || isProductionComplete ? productionStartedAt : null,
        queuedAt:
          fixture.productionState || fixture.status === "Pending Production"
            ? productionStartedAt
            : null,
        workStartedAt:
          isProductionActive || isProductionComplete ? productionStartedAt : null,
        startedBy:
          isProductionActive || isProductionComplete ? productionOwner._id : null,
        productionDueAt: daysFromNow(Math.max(1, fixture.deliveryOffsetDays - 1)),
        predictedCompletionAt: daysFromNow(Math.max(1, fixture.deliveryOffsetDays - 2)),
        completedAt: isProductionComplete ? statusChangedAt : null,
        completedBy: isProductionComplete ? productionOwner._id : null,
        executionState: fixture.productionState || "queued",
        estimatedProductionMinutes: fixture.items.reduce(
          (total, item) => total + Math.max(60, item.qty * 2),
          0,
        ),
        totalQuantity: fixture.items.reduce((total, item) => total + item.qty, 0),
        itemLineCount: fixture.items.length,
        riskLevel: isProductionComplete
          ? "completed"
          : isProductionActive
            ? "on_track"
            : "not_started",
      },
      mockup: fixture.mockupApproved
        ? {
            fileName: `${fixture.orderId.toLowerCase()}-approved-mockup.pdf`,
            fileType: "application/pdf",
            note: "Approved staging mockup metadata; no production file attached.",
            uploadedBy: usersByEmployeeId.get("STG-GFX-001")._id,
            uploadedAt: daysAgo(2),
            source: "graphics",
            graphicsReview: {
              status: "validated",
              reviewedAt: daysAgo(1),
              reviewedBy: usersByEmployeeId.get("STG-GFX-001")._id,
              note: "Validated for staging workflow tests.",
            },
            clientApproval: {
              status: "approved",
              isApproved: true,
              approvedAt: daysAgo(1),
              approvedBy: admin._id,
              note: "Approved staging fixture.",
            },
          }
        : undefined,
      paymentVerifications: fixture.paid
        ? [
            {
              type: "full_payment",
              verifiedAt: daysAgo(2),
              verifiedBy: admin._id,
            },
          ]
        : [],
      quoteDetails:
        fixture.type === "Quote"
          ? {
              quoteNumber: `Q-${fixture.orderId}`,
              quoteDate: createdAt,
              scopeApproved: fixture.status !== "Quote Created",
              checklist: {
                cost: true,
                mockup: true,
                previousSamples: false,
                sampleProduction: false,
                bidSubmission: false,
              },
              decision: {
                status: "pending",
                note: "Staging fixture awaiting a client decision.",
                convertedToType: "Quote",
              },
            }
          : undefined,
      updates: [
        {
          date: statusChangedAt,
          event: "Staging fixture seeded",
          status: fixture.status,
          note: "Synthetic record for workflow and UI testing.",
        },
      ],
    };

    let project = await Project.findOne({ orderId: fixture.orderId });
    if (!project) {
      project = new Project(payload);
      created += 1;
    } else {
      project.set(payload);
      updated += 1;
    }

    await project.save();

    // Keep fixture timestamps deterministic even if a pre-save hook observed a
    // stage reset on a previous test run.
    await Project.collection.updateOne(
      { _id: project._id },
      {
        $set: {
          createdAt,
          orderDate: createdAt,
          statusChangedAt,
          statusHistory,
        },
      },
    );
  }

  return { created, updated };
};

const main = async () => {
  if (!process.argv.includes(APPLY_FLAG)) {
    throw new Error(
      `Refusing to modify staging without ${APPLY_FLAG}. This script targets ${envFile}.`,
    );
  }
  if (!process.env.MONGO_URI) {
    throw new Error(`MONGO_URI is not set in ${envFile}.`);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const databaseName = mongoose.connection.name || "";
  if (!databaseName.toLowerCase().includes("staging")) {
    throw new Error(
      `Safety check failed: connected database "${databaseName}" is not a staging database.`,
    );
  }

  const userResult = await seedUsers();
  const projectResult = await seedProjects(userResult.usersByEmployeeId);

  const statusCounts = await Project.aggregate([
    { $match: { orderId: { $regex: /^STG-/ } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log(
    JSON.stringify(
      {
        database: databaseName,
        users: { created: userResult.created, updated: userResult.updated },
        projects: projectResult,
        statusCounts: Object.fromEntries(
          statusCounts.map((entry) => [entry._id, entry.count]),
        ),
        login: {
          employeeIds: userFixtures.map((fixture) => fixture.employeeId),
          sharedPassword: SHARED_PASSWORD,
        },
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error("Staging project seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
