const crypto = require("node:crypto");
const path = require("node:path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const Project = require("../src/models/Project");
const ProjectUpdate = require("../src/models/ProjectUpdate");
const MaterialRequest = require("../src/models/MaterialRequest");

dotenv.config({
  path: path.resolve(__dirname, "../.env.staging"),
  override: true,
  quiet: true,
});

const MARKER = "STAGING LIVE UPDATES DEMO";
const TARGETS = [
  {
    orderId: "STG-260003",
    updates: [
      { hoursAgo: 9, category: "Design", content: "T-shirt and tote artwork is approved. The team is checking the final size breakdown before production starts." },
      { hoursAgo: 2, category: "Production", content: "The size breakdown is confirmed. Print files are ready, and the first sample is scheduled for review this afternoon." },
    ],
    request: {
      materialName: "Natural canvas tote bags",
      quantity: "300",
      unit: "pieces",
      status: "In Review",
      statusHoursAgo: 3,
      priority: "High",
      statusNote: "Stores is checking the available canvas stock before confirming the balance.",
      item: { fulfillmentStatus: "Pending", purchaseStatus: "Not Started" },
    },
  },
  {
    orderId: "STG-260006",
    updates: [
      { hoursAgo: 1, category: "Production", content: "Directional sign artwork is finalized. Large format printing is queued; cutting can begin as soon as the boards arrive." },
    ],
    request: {
      materialName: "Foam board sheets",
      quantity: "24",
      unit: "sheets",
      status: "Ordered",
      statusHoursAgo: 2,
      priority: "Urgent",
      statusNote: "Supplier confirmed the board order. Delivery is expected before the cutting slot.",
      item: { fulfillmentStatus: "Pending", purchaseStatus: "Ordered", quantityToOrder: 24, orderedQuantity: 24 },
    },
  },
  {
    orderId: "STG-260007",
    updates: [
      { hoursAgo: 18, category: "Production", content: "The first uniform batch entered print. Embroidery samples are being checked against the approved logo." },
      { hoursAgo: 4, category: "Production", content: "The first 60 polos are printed. Embroidery approval is complete; the remaining shirts are scheduled for the next production run." },
    ],
    request: {
      materialName: "Navy polo shirt blanks",
      quantity: "180",
      unit: "pieces",
      status: "Partially Fulfilled",
      statusHoursAgo: 5,
      priority: "Normal",
      statusNote: "60 blanks were issued to production. The balance is on order.",
      item: { fulfillmentStatus: "Partially Fulfilled", purchaseStatus: "Ordered", fulfilledQuantity: 60, remainingQuantity: 120, quantityToOrder: 120, orderedQuantity: 120 },
    },
  },
  {
    orderId: "STG-260009",
    updates: [
      { hoursAgo: 6, category: "Production", content: "Gift boxes are assembled. Quality control is checking each set before packing." },
    ],
    request: {
      materialName: "Rigid gift boxes",
      quantity: "45",
      unit: "boxes",
      status: "Fulfilled",
      statusHoursAgo: 8,
      priority: "Normal",
      statusNote: "All 45 boxes were supplied to the assembly team.",
      item: { fulfillmentStatus: "Fulfilled", purchaseStatus: "Received", fulfilledQuantity: 45, remainingQuantity: 0 },
    },
  },
  {
    orderId: "STG-260010",
    updates: [
      { hoursAgo: 3, category: "Production", content: "Backdrop printing is complete. The counter wrap is in finishing, and the installation team is confirming vehicle space." },
    ],
    request: {
      materialName: "Banner mounting hardware",
      quantity: "8",
      unit: "sets",
      status: "Pending",
      statusHoursAgo: 4,
      priority: "Urgent",
      statusNote: "Awaiting Stores review of the mounting kit request.",
      item: { fulfillmentStatus: "Pending", purchaseStatus: "Not Started" },
    },
  },
  {
    orderId: "STG-260011",
    updates: [
      { hoursAgo: 5, category: "General", content: "Branch signs and desk materials are packed. The delivery team is confirming the route and handover time with the client." },
    ],
    request: {
      materialName: "Protective packing wrap",
      quantity: "4",
      unit: "rolls",
      status: "Fulfilled",
      statusHoursAgo: 7,
      priority: "Normal",
      statusNote: "Packing materials were supplied for dispatch preparation.",
      item: { fulfillmentStatus: "Fulfilled", purchaseStatus: "Not Started", fulfilledQuantity: 4, remainingQuantity: 0 },
    },
  },
];

const demoId = (kind, projectId, key) =>
  new mongoose.Types.ObjectId(
    crypto.createHash("sha256")
      .update(`${MARKER}:${kind}:${projectId}:${key}`)
      .digest("hex")
      .slice(0, 24),
  );
const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);
const nameOf = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ");

const syncLatestUpdateSnapshot = async (projectId) => {
  const latest = await ProjectUpdate.findOne({ project: projectId })
    .sort({ createdAt: -1, _id: -1 })
    .select("content createdAt author")
    .lean();
  await Project.updateOne(
    { _id: projectId },
    { $set: {
      endOfDayUpdate: latest?.content || "",
      endOfDayUpdateDate: latest?.createdAt || null,
      endOfDayUpdateBy: latest?.author || null,
    } },
  );
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");
  if (apply && undo) throw new Error("Choose either --apply or --undo.");
  if (!process.env.MONGO_URI) throw new Error("Staging MONGO_URI is missing.");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const databaseName = mongoose.connection.name || "";
  if (!databaseName.toLowerCase().includes("staging")) {
    throw new Error(`Refusing to change database ${databaseName}: staging database required.`);
  }

  const [projects, storesUser] = await Promise.all([
    Project.find({ orderId: { $in: TARGETS.map((target) => target.orderId) } })
      .select("_id orderId projectLeadId assistantLeadId items details status")
      .lean(),
    User.findOne({ employeeId: "STG-STORE-001" }).select("_id firstName lastName").lean(),
  ]);
  const projectByOrderId = new Map(projects.map((project) => [project.orderId, project]));
  const leadIds = projects.map((project) => project.projectLeadId).filter(Boolean);
  const leads = await User.find({ _id: { $in: leadIds } })
    .select("_id firstName lastName")
    .lean();
  const leadById = new Map(leads.map((lead) => [String(lead._id), lead]));
  const missing = TARGETS.filter((target) => !projectByOrderId.has(target.orderId)).map((target) => target.orderId);
  if (missing.length || !storesUser || projects.some((project) => !leadById.has(String(project.projectLeadId)))) {
    throw new Error(`Staging fixtures are incomplete. Missing projects: ${missing.join(", ") || "none"}. Run seed-staging-projects.js --apply first.`);
  }

  const changes = { updatesCreated: 0, requestsCreated: 0, updatesRemoved: 0, requestsRemoved: 0 };
  const allUpdateIds = [];
  const allRequestIds = [];
  for (const target of TARGETS) {
    const project = projectByOrderId.get(target.orderId);
    const lead = leadById.get(String(project.projectLeadId));
    const firstProjectItem = project.items?.[0];
    const updateIds = target.updates.map((_, index) => demoId("update", project._id, index));
    const requestId = demoId("request", project._id, "main");
    allUpdateIds.push(...updateIds);
    allRequestIds.push(requestId);

    if (apply) {
      for (const [index, update] of target.updates.entries()) {
        const result = await ProjectUpdate.updateOne(
          { _id: updateIds[index] },
          { $setOnInsert: {
            project: project._id,
            author: lead._id,
            category: update.category,
            content: `[${MARKER}] ${update.content}`,
            createdAt: hoursAgo(update.hoursAgo),
          } },
          { upsert: true },
        );
        changes.updatesCreated += Number(result.upsertedCount || 0);
      }
      const request = target.request;
      const result = await MaterialRequest.updateOne(
        { _id: requestId },
        { $setOnInsert: {
          materialName: request.materialName,
          quantity: request.quantity,
          unit: request.unit,
          items: [{
            materialName: request.materialName,
            quantity: request.quantity,
            unit: request.unit,
            projectItemId: firstProjectItem?._id || null,
            projectItemBreakdown: firstProjectItem?.breakdown || "",
            projectItemQuantity: firstProjectItem?.qty || null,
            ...request.item,
          }],
          department: "Production",
          departmentKey: "production",
          priority: request.priority,
          notes: `[${MARKER}] Synthetic request for the Live Updates preview. No stock transaction was created.`,
          requestedBy: lead._id,
          requestedByName: nameOf(lead),
          status: request.status,
          statusNote: request.statusNote,
          statusUpdatedBy: storesUser._id,
          statusUpdatedAt: hoursAgo(request.statusHoursAgo),
          requestType: "project",
          project: project._id,
          projectOrderId: project.orderId,
          projectName: project.details?.projectNameRaw || project.details?.projectName || project.orderId,
          projectClientName: project.details?.client || "",
          projectLeadName: nameOf(lead),
          projectItemId: firstProjectItem?._id || null,
          projectItemDescription: firstProjectItem?.description || "",
          createdAt: hoursAgo(request.statusHoursAgo + 2),
        } },
        { upsert: true },
      );
      changes.requestsCreated += Number(result.upsertedCount || 0);
      await syncLatestUpdateSnapshot(project._id);
    } else if (undo) {
      const updateResult = await ProjectUpdate.deleteMany({ _id: { $in: updateIds }, project: project._id });
      const requestResult = await MaterialRequest.deleteOne({ _id: requestId, project: project._id });
      changes.updatesRemoved += updateResult.deletedCount || 0;
      changes.requestsRemoved += requestResult.deletedCount || 0;
      await syncLatestUpdateSnapshot(project._id);
    }
  }

  const [storedUpdates, storedRequests] = await Promise.all([
    ProjectUpdate.countDocuments({ _id: { $in: allUpdateIds } }),
    MaterialRequest.countDocuments({ _id: { $in: allRequestIds } }),
  ]);

  console.log(JSON.stringify({
    database: databaseName,
    mode: apply ? "applied" : undo ? "removed" : "preview",
    projects: TARGETS.map(({ orderId, updates, request }) => ({ orderId, updates: updates.length, requestStatus: request.status })),
    changes,
    stored: { updates: storedUpdates, requests: storedRequests },
    next: !apply && !undo ? "Run node scripts/seed-staging-live-updates.js --apply to add these records." : undefined,
  }, null, 2));
};

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
