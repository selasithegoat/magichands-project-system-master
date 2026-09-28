const mongoose = require("mongoose");
const Project = require("../models/Project");
const SampleMovement = require("../models/SampleMovement");
const {
  SAMPLE_DISPOSITIONS,
  SAMPLE_HANDOVER_METHODS,
  SAMPLE_MOVEMENT_STATUSES,
  SAMPLE_PRODUCTION_TREATMENTS,
  assertSampleMovementReadyForSubmission,
  getSampleMovementAttentionState,
  isTerminalSampleMovementStatus,
  resolvePostReleaseStatus,
} = require("../utils/sampleMovementLifecycle");
const {
  canAuthorizeSampleMovements,
  canOperateSampleMovements,
} = require("../utils/sampleMovementAccess");
const {
  allocateSampleMovementReference,
  appendCustodyEvent,
  getSampleMovementById,
  getUserDisplayName,
  populateSampleMovementQuery,
  transitionSampleMovement,
} = require("../services/sampleMovementService");

const MAX_ITEMS = 50;
const EDITABLE_STATUSES = new Set(["draft", "changes_requested"]);
const RETURNABLE_CUSTODY_STATUSES = new Set([
  "dispatched",
  "in_client_custody",
  "partially_returned",
]);

const toText = (value, maxLength = 2000) =>
  String(value === null || value === undefined ? "" : value)
    .trim()
    .slice(0, maxLength);

const toObjectIdOrNull = (value) => {
  const normalized = toText(value, 80);
  return mongoose.Types.ObjectId.isValid(normalized) ? normalized : null;
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toBoolean = (value) =>
  value === true || ["true", "1", "yes"].includes(toText(value, 10).toLowerCase());

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readClient = (source = {}, project = null) => ({
  name: toText(source.name || project?.details?.client, 200),
  contactPerson: toText(source.contactPerson, 200),
  contactRole: toText(source.contactRole, 120),
  email: toText(source.email || project?.details?.clientEmail, 254).toLowerCase(),
  phone: toText(source.phone || project?.details?.clientPhone, 80),
  address: toText(source.address, 500),
});

const readProjectSnapshot = (project) => ({
  orderId: toText(project?.orderId, 120),
  projectName: toText(
    project?.details?.projectNameRaw || project?.details?.projectName,
    300,
  ),
  projectVersionNumber: Math.max(1, Number(project?.versionNumber) || 1),
});

const readItems = (value, existingItems = []) => {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "At least one sample item is required." };
  }
  if (value.length > MAX_ITEMS) {
    return { error: `A sample movement can contain up to ${MAX_ITEMS} items.` };
  }

  const existingById = new Map(
    (Array.isArray(existingItems) ? existingItems : [])
      .map((item) => [String(item?._id || ""), item])
      .filter(([id]) => id),
  );
  const items = value.map((item) => {
    const productionTreatment = toText(item?.productionTreatment, 80);
    const itemId = toObjectIdOrNull(item?._id);
    const existingItem = itemId ? existingById.get(String(itemId)) : null;
    return {
      ...(itemId ? { _id: itemId } : {}),
      description: toText(item?.description, 500),
      quantity: Number(item?.quantity),
      unit: toText(item?.unit, 60) || "unit",
      identifyingMarks: toText(item?.identifyingMarks, 500),
      outboundCondition: toText(item?.outboundCondition, 120),
      outboundConditionNotes: toText(item?.outboundConditionNotes, 1000),
      projectItemId: toObjectIdOrNull(item?.projectItemId),
      productionTreatment: SAMPLE_PRODUCTION_TREATMENTS.includes(
        productionTreatment,
      )
        ? productionTreatment
        : "not_applicable",
      productionQuantityApplied: Math.max(
        0,
        Number(item?.productionQuantityApplied) || 0,
      ),
      ...(existingItem
        ? {
            photos: existingItem.photos || [],
            quantityReturned: Number(existingItem.quantityReturned) || 0,
            returnCondition: toText(existingItem.returnCondition, 120),
            returnConditionNotes: toText(
              existingItem.returnConditionNotes,
              1000,
            ),
            returnPhotos: existingItem.returnPhotos || [],
          }
        : {}),
    };
  });

  const invalidIndex = items.findIndex(
    (item) =>
      !item.description ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0,
  );
  if (invalidIndex >= 0) {
    return {
      error: `Sample item ${invalidIndex + 1} needs a description and a whole-number quantity of at least 1.`,
    };
  }

  const invalidProductionIndex = items.findIndex(
    (item) =>
      !Number.isInteger(item.productionQuantityApplied) ||
      item.productionQuantityApplied > item.quantity,
  );
  if (invalidProductionIndex >= 0) {
    return {
      error: `Sample item ${invalidProductionIndex + 1} needs a whole-number production quantity within its sample quantity.`,
    };
  }

  return { data: items };
};

const loadProject = async (projectId) => {
  const normalized = toObjectIdOrNull(projectId);
  if (!normalized) return null;
  return Project.findById(normalized)
    .select(
      "orderId versionNumber status cancellation.isCancelled details.projectName details.projectNameRaw details.client details.clientEmail details.clientPhone",
    )
    .lean();
};

const readMovementPayload = async (body = {}, existing = null) => {
  const projectId = body.project || body.projectId || existing?.project;
  const project = await loadProject(projectId);
  if (!project) return { error: "Linked project was not found.", statusCode: 404 };
  if (project?.cancellation?.isCancelled) {
    return { error: "Samples cannot be registered against a cancelled project." };
  }

  const items = readItems(body.items ?? existing?.items, existing?.items);
  if (items.error) return items;

  const handoverMethod = toText(
    body.handoverMethod ?? existing?.handoverMethod,
    80,
  ).toLowerCase();
  const disposition = toText(
    body.disposition ?? existing?.disposition,
    80,
  ).toLowerCase();
  if (!SAMPLE_HANDOVER_METHODS.includes(handoverMethod)) {
    return { error: "Select a valid handover method." };
  }
  if (!SAMPLE_DISPOSITIONS.includes(disposition)) {
    return { error: "Select a valid sample disposition." };
  }

  const rawReturnDate = body.expectedReturnAt ?? existing?.expectedReturnAt;
  const expectedReturnAt = toDateOrNull(rawReturnDate);
  if (rawReturnDate && !expectedReturnAt) {
    return { error: "Expected return date is invalid." };
  }

  const existingProjectId = String(existing?.project?._id || existing?.project || "");
  const projectChanged = Boolean(
    existingProjectId && existingProjectId !== String(project._id),
  );

  return {
    data: {
      project: project._id,
      projectSnapshot: readProjectSnapshot(project),
      client: readClient(
        {
          ...(projectChanged ? {} : existing?.client || {}),
          ...(body.client || {}),
        },
        project,
      ),
      purpose: toText(body.purpose ?? existing?.purpose, 2000),
      handoverMethod,
      disposition,
      expectedReturnAt,
      items: items.data,
    },
  };
};

const sendControllerError = (res, error, fallbackMessage) => {
  if (error?.code === "INVALID_SAMPLE_MOVEMENT_TRANSITION") {
    return res.status(409).json({ message: error.message, code: error.code });
  }
  if (error?.code === "SAMPLE_MOVEMENT_VALIDATION_FAILED") {
    return res.status(422).json({
      message: error.message,
      code: error.code,
      errors: error.errors,
    });
  }
  if (error?.name === "ValidationError") {
    return res.status(422).json({
      message: "Sample movement validation failed.",
      errors: Object.values(error.errors || {}).map((entry) => ({
        field: entry.path,
        message: entry.message,
      })),
    });
  }
  if (error?.name === "VersionError") {
    return res.status(409).json({
      message: "This record was changed by another user. Refresh and try again.",
    });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ message: "Sample movement reference already exists." });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage });
};

const requireOperator = (req, res) => {
  if (canOperateSampleMovements(req.user)) return true;
  res.status(403).json({ message: "Only Front Desk can perform this sample custody action." });
  return false;
};

const requireAuthorizer = (req, res) => {
  if (canAuthorizeSampleMovements(req.user)) return true;
  res.status(403).json({ message: "Only an Administration admin can perform this authorization action." });
  return false;
};

const findMovement = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ message: "Invalid sample movement ID." });
    return null;
  }
  const movement = await SampleMovement.findById(req.params.id);
  if (!movement) {
    res.status(404).json({ message: "Sample movement not found." });
    return null;
  }
  return movement;
};

const respondWithMovement = async (res, id, statusCode = 200) =>
  res.status(statusCode).json(await getSampleMovementById(id));

const createSampleMovement = async (req, res) => {
  if (!requireOperator(req, res)) return;
  try {
    const payload = await readMovementPayload(req.body);
    if (payload.error) {
      return res.status(payload.statusCode || 400).json({ message: payload.error });
    }
    const reference = await allocateSampleMovementReference();
    const movement = new SampleMovement({
      ...reference,
      ...payload.data,
      frontDeskOwner: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    appendCustodyEvent(movement, {
      type: "created",
      actor: req.user,
      toStatus: "draft",
      note: "Sample custody draft created.",
    });
    await movement.save();
    return respondWithMovement(res, movement._id, 201);
  } catch (error) {
    return sendControllerError(res, error, "Failed to create sample movement.");
  }
};

const getSampleMovementSummary = async (now = new Date()) => {
  const dueSoonAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const custodyFilter = {
    status: { $in: Array.from(RETURNABLE_CUSTODY_STATUSES) },
    disposition: { $in: ["returnable", "decision_pending"] },
  };
  const [
    awaitingAuthorization,
    readyForRelease,
    withClients,
    dueSoon,
    overdue,
    ownershipTransferPending,
    returnedThisMonth,
  ] = await Promise.all([
    SampleMovement.countDocuments({ status: "awaiting_authorization" }),
    SampleMovement.countDocuments({ status: "authorized" }),
    SampleMovement.countDocuments({
      status: {
        $in: [
          "dispatched",
          "in_client_custody",
          "partially_returned",
          "ownership_transfer_pending",
        ],
      },
    }),
    SampleMovement.countDocuments({
      ...custodyFilter,
      expectedReturnAt: { $gte: now, $lte: dueSoonAt },
    }),
    SampleMovement.countDocuments({
      ...custodyFilter,
      expectedReturnAt: { $lt: now },
    }),
    SampleMovement.countDocuments({ status: "ownership_transfer_pending" }),
    SampleMovement.countDocuments({
      status: "returned",
      "returnSummary.completedAt": { $gte: monthStart },
    }),
  ]);

  return {
    awaitingAuthorization,
    readyForRelease,
    withClients,
    dueSoon,
    overdue,
    ownershipTransferPending,
    returnedThisMonth,
  };
};

const getSampleMovements = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const filter = {};
    const status = toText(req.query.status, 80).toLowerCase();
    const disposition = toText(req.query.disposition, 80).toLowerCase();
    const handoverMethod = toText(req.query.handoverMethod, 80).toLowerCase();
    const attention = toText(req.query.attention, 80).toLowerCase();
    const scope = toText(req.query.scope, 80).toLowerCase();
    const search = toText(req.query.search, 120);
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    if (SAMPLE_MOVEMENT_STATUSES.includes(status)) filter.status = status;
    if (SAMPLE_DISPOSITIONS.includes(disposition)) filter.disposition = disposition;
    if (SAMPLE_HANDOVER_METHODS.includes(handoverMethod)) {
      filter.handoverMethod = handoverMethod;
    }
    if (scope === "with_clients") {
      filter.status = {
        $in: [
          "dispatched",
          "in_client_custody",
          "partially_returned",
          "ownership_transfer_pending",
        ],
      };
    } else if (scope === "active") {
      filter.status = {
        $in: [
          "awaiting_authorization",
          "changes_requested",
          "authorized",
          "dispatched",
          "in_client_custody",
          "partially_returned",
          "ownership_transfer_pending",
        ],
      };
    } else if (scope === "closed") {
      filter.status = {
        $in: [
          "authorization_rejected",
          "returned",
          "client_owned",
          "lost_unrecoverable",
          "cancelled",
        ],
      };
    } else if (scope === "returned_this_month") {
      filter.status = "returned";
      filter["returnSummary.completedAt"] = { $gte: monthStart };
    }
    if (attention === "overdue") {
      filter.status = { $in: Array.from(RETURNABLE_CUSTODY_STATUSES) };
      filter.disposition = { $in: ["returnable", "decision_pending"] };
      filter.expectedReturnAt = { $lt: now };
    } else if (attention === "due_soon") {
      const dueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      filter.status = { $in: Array.from(RETURNABLE_CUSTODY_STATUSES) };
      filter.disposition = { $in: ["returnable", "decision_pending"] };
      filter.expectedReturnAt = { $gte: now, $lte: dueAt };
    }
    if (search) {
      const matcher = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { reference: matcher },
        { "client.name": matcher },
        { "client.contactPerson": matcher },
        { "projectSnapshot.orderId": matcher },
        { "projectSnapshot.projectName": matcher },
        { "items.description": matcher },
      ];
    }

    const [movements, total, summary] = await Promise.all([
      populateSampleMovementQuery(
        SampleMovement.find(filter)
          .select("-custodyEvents -documents -items.photos -items.returnPhotos")
          .sort({ updatedAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
      ).lean(),
      SampleMovement.countDocuments(filter),
      getSampleMovementSummary(now),
    ]);

    return res.json({
      movements: movements.map((movement) => ({
        ...movement,
        attentionState: getSampleMovementAttentionState(movement),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      summary,
    });
  } catch (error) {
    return sendControllerError(res, error, "Failed to load sample movements.");
  }
};

const getSampleMovement = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid sample movement ID." });
    }
    const movement = await getSampleMovementById(req.params.id);
    if (!movement) return res.status(404).json({ message: "Sample movement not found." });
    return res.json(movement);
  } catch (error) {
    return sendControllerError(res, error, "Failed to load sample movement.");
  }
};

const updateSampleMovement = async (req, res) => {
  if (!requireOperator(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    if (!EDITABLE_STATUSES.has(movement.status)) {
      return res.status(409).json({ message: "Only draft records or records returned for changes can be edited." });
    }
    const payload = await readMovementPayload(req.body, movement.toObject());
    if (payload.error) {
      return res.status(payload.statusCode || 400).json({ message: payload.error });
    }
    Object.assign(movement, payload.data, { updatedBy: req.user._id });
    appendCustodyEvent(movement, {
      type: "updated",
      actor: req.user,
      fromStatus: movement.status,
      toStatus: movement.status,
      note: toText(req.body.changeNote, 500) || "Sample custody draft updated.",
    });
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to update sample movement.");
  }
};

const submitSampleMovement = async (req, res) => {
  if (!requireOperator(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    assertSampleMovementReadyForSubmission(movement.toObject());
    transitionSampleMovement(movement, "awaiting_authorization", {
      type: "submitted",
      actor: req.user,
      note: toText(req.body.note, 1000) || "Submitted for Admin authorization.",
    });
    movement.authorization.status = "pending";
    movement.authorization.submittedAt = new Date();
    movement.authorization.submittedBy = req.user._id;
    movement.authorization.decidedAt = null;
    movement.authorization.decidedBy = null;
    movement.authorization.decisionNote = "";
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to submit sample movement.");
  }
};

const decideAuthorization = (decision) => async (req, res) => {
  if (!requireAuthorizer(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    const submittedBy = String(movement.authorization?.submittedBy || "");
    if (submittedBy && submittedBy === String(req.user._id)) {
      return res.status(403).json({ message: "You cannot authorize a sample movement you submitted." });
    }
    const note = toText(req.body.note || req.body.decisionNote, 2000);
    if (decision !== "authorized" && !note) {
      return res.status(400).json({ message: "A decision reason is required." });
    }
    const statusByDecision = {
      authorized: "authorized",
      changes_requested: "changes_requested",
      rejected: "authorization_rejected",
    };
    const eventByDecision = {
      authorized: "authorized",
      changes_requested: "changes_requested",
      rejected: "authorization_rejected",
    };
    transitionSampleMovement(movement, statusByDecision[decision], {
      type: eventByDecision[decision],
      actor: req.user,
      note,
    });
    movement.authorization.status = decision;
    movement.authorization.decidedAt = new Date();
    movement.authorization.decidedBy = req.user._id;
    movement.authorization.decisionNote = note;
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to record authorization decision.");
  }
};

const releaseSampleMovement = async (req, res) => {
  if (!requireOperator(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    const recipientName = toText(req.body.recipientName, 200);
    if (movement.handoverMethod === "pickup" && !recipientName) {
      return res.status(400).json({ message: "Recipient name is required for client pick-up." });
    }
    const nextStatus = resolvePostReleaseStatus({
      disposition: movement.disposition,
      handoverMethod: movement.handoverMethod,
      recipientConfirmed: toBoolean(req.body.recipientConfirmed),
    });
    const releaseAt = toDateOrNull(req.body.releasedAt) || new Date();
    movement.release.releasedAt = releaseAt;
    movement.release.releasedBy = req.user._id;
    movement.release.recipientName = recipientName;
    movement.release.recipientRole = toText(req.body.recipientRole, 120);
    movement.release.courierName = toText(req.body.courierName, 200);
    movement.release.trackingReference = toText(req.body.trackingReference, 200);
    if (nextStatus === "in_client_custody" || nextStatus === "client_owned") {
      movement.release.clientReceiptConfirmedAt =
        toDateOrNull(req.body.receivedAt) || releaseAt;
    }
    transitionSampleMovement(movement, nextStatus, {
      type: movement.handoverMethod === "dispatch" ? "dispatched" : "released",
      actor: req.user,
      note: toText(req.body.note, 1000),
      details: { recipientName, handoverMethod: movement.handoverMethod },
    });
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to release sample movement.");
  }
};

const confirmSampleReceipt = async (req, res) => {
  if (!requireOperator(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    const recipientName = toText(req.body.recipientName, 200) || movement.release.recipientName;
    if (!recipientName) return res.status(400).json({ message: "Recipient name is required." });
    movement.release.recipientName = recipientName;
    movement.release.recipientRole = toText(req.body.recipientRole, 120) || movement.release.recipientRole;
    movement.release.clientReceiptConfirmedAt = toDateOrNull(req.body.receivedAt) || new Date();
    transitionSampleMovement(movement, "in_client_custody", {
      type: "client_receipt_confirmed",
      actor: req.user,
      note: toText(req.body.note, 1000),
      details: { recipientName },
    });
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to confirm client receipt.");
  }
};

const recordSampleReturn = async (req, res) => {
  if (!requireOperator(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    if (!RETURNABLE_CUSTODY_STATUSES.has(movement.status)) {
      return res.status(409).json({ message: "Returns can only be recorded while samples are in client custody." });
    }
    const returns = Array.isArray(req.body.items) ? req.body.items : [];
    if (!returns.length) return res.status(400).json({ message: "Add at least one returned item." });

    for (const returnedItem of returns) {
      const item = movement.items.id(toObjectIdOrNull(returnedItem.itemId || returnedItem._id));
      const quantity = Number(returnedItem.quantityReturned ?? returnedItem.quantity);
      if (!item || !Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "Each returned item needs a valid item ID and a whole-number quantity." });
      }
      if (Number(item.quantityReturned || 0) + quantity > Number(item.quantity)) {
        return res.status(400).json({ message: `Returned quantity exceeds the released quantity for ${item.description}.` });
      }
      item.quantityReturned = Number(item.quantityReturned || 0) + quantity;
      item.returnCondition = toText(returnedItem.returnCondition, 120);
      item.returnConditionNotes = toText(returnedItem.returnConditionNotes, 1000);
    }

    const allReturned = movement.items.every(
      (item) => Number(item.quantityReturned || 0) >= Number(item.quantity),
    );
    const nextStatus = allReturned ? "returned" : "partially_returned";
    const note = toText(req.body.note, 2000);
    if (movement.status === nextStatus) {
      movement.updatedBy = req.user._id;
      appendCustodyEvent(movement, {
        type: "partial_return_recorded",
        actor: req.user,
        fromStatus: movement.status,
        toStatus: movement.status,
        note,
      });
    } else {
      transitionSampleMovement(movement, nextStatus, {
        type: allReturned ? "return_recorded" : "partial_return_recorded",
        actor: req.user,
        note,
      });
    }
    movement.returnSummary.recordedBy = req.user._id;
    movement.returnSummary.note = note;
    movement.returnSummary.hasDamage = toBoolean(req.body.hasDamage);
    movement.returnSummary.hasMissingQuantity = !allReturned;
    if (allReturned) movement.returnSummary.completedAt = toDateOrNull(req.body.returnedAt) || new Date();
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to record sample return.");
  }
};

const requestOwnershipTransfer = async (req, res) => {
  if (!requireOperator(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    const reason = toText(req.body.reason || req.body.requestReason, 2000);
    if (!reason) return res.status(400).json({ message: "Ownership-transfer reason is required." });
    if (!toBoolean(req.body.clientConfirmed)) {
      return res.status(400).json({ message: "Client confirmation is required before requesting ownership transfer." });
    }

    const treatments = Array.isArray(req.body.itemTreatments) ? req.body.itemTreatments : [];
    for (const treatment of treatments) {
      const item = movement.items.id(toObjectIdOrNull(treatment.itemId));
      const productionTreatment = toText(treatment.productionTreatment, 80);
      const quantityApplied = Math.max(0, Number(treatment.productionQuantityApplied) || 0);
      if (!item || !SAMPLE_PRODUCTION_TREATMENTS.includes(productionTreatment)) {
        return res.status(400).json({ message: "Ownership request contains an invalid item treatment." });
      }
      if (!Number.isInteger(quantityApplied)) {
        return res.status(400).json({ message: "Production quantities must be whole numbers." });
      }
      const outstanding = Number(item.quantity) - Number(item.quantityReturned || 0);
      if (quantityApplied > outstanding) {
        return res.status(400).json({ message: `Production quantity exceeds the outstanding quantity for ${item.description}.` });
      }
      item.productionTreatment = productionTreatment;
      item.productionQuantityApplied = quantityApplied;
    }

    const previousStatus = movement.status;
    transitionSampleMovement(movement, "ownership_transfer_pending", {
      type: "ownership_transfer_requested",
      actor: req.user,
      note: reason,
    });
    movement.ownershipTransfer.requestedAt = new Date();
    movement.ownershipTransfer.requestedBy = req.user._id;
    movement.ownershipTransfer.requestReason = reason;
    movement.ownershipTransfer.previousStatus = previousStatus;
    movement.ownershipTransfer.clientConfirmed = true;
    movement.ownershipTransfer.clientConfirmationNote = toText(req.body.clientConfirmationNote, 2000);
    movement.ownershipTransfer.linkedBillingDocument = toObjectIdOrNull(req.body.linkedBillingDocument);
    movement.ownershipTransfer.billingReference = toText(req.body.billingReference, 120);
    movement.ownershipTransfer.paymentReference = toText(req.body.paymentReference, 120);
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to request ownership transfer.");
  }
};

const decideOwnershipTransfer = (approved) => async (req, res) => {
  if (!requireAuthorizer(req, res)) return;
  try {
    const movement = await findMovement(req, res);
    if (!movement) return;
    const requestedBy = String(movement.ownershipTransfer?.requestedBy || "");
    if (requestedBy && requestedBy === String(req.user._id)) {
      return res.status(403).json({
        message: "You cannot decide an ownership transfer you requested.",
      });
    }
    const note = toText(req.body.note || req.body.decisionNote, 2000);
    if (!note) return res.status(400).json({ message: "An ownership decision note is required." });
    if (approved && !movement.ownershipTransfer.clientConfirmed) {
      return res.status(400).json({ message: "Client confirmation is required before ownership transfer approval." });
    }
    const nextStatus = approved
      ? "client_owned"
      : movement.ownershipTransfer.previousStatus || "in_client_custody";
    if (approved) movement.disposition = "client_owned";
    transitionSampleMovement(movement, nextStatus, {
      type: approved ? "ownership_transfer_approved" : "ownership_transfer_rejected",
      actor: req.user,
      note,
    });
    movement.ownershipTransfer.decidedAt = new Date();
    movement.ownershipTransfer.decidedBy = req.user._id;
    movement.ownershipTransfer.decisionNote = note;
    movement.ownershipTransfer.effectiveAt = approved
      ? toDateOrNull(req.body.effectiveAt) || new Date()
      : null;
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to record ownership-transfer decision.");
  }
};

const cancelSampleMovement = async (req, res) => {
  try {
    const operator = canOperateSampleMovements(req.user);
    const authorizer = canAuthorizeSampleMovements(req.user);
    if (!operator && !authorizer) return res.status(403).json({ message: "You cannot cancel sample movements." });
    const movement = await findMovement(req, res);
    if (!movement) return;
    if (isTerminalSampleMovementStatus(movement.status)) {
      return res.status(409).json({ message: "This sample movement is already closed." });
    }
    const cancellableStatuses = [
      "draft",
      "changes_requested",
      "awaiting_authorization",
      "authorized",
    ];
    if (!cancellableStatuses.includes(movement.status)) {
      return res.status(409).json({
        message: "Released samples cannot be cancelled; record their return, ownership transfer, or loss instead.",
      });
    }
    if (operator && !authorizer && movement.status === "authorized") {
      return res.status(403).json({ message: "Front Desk can only cancel a sample movement before authorization." });
    }
    const reason = toText(req.body.reason || req.body.note, 2000);
    if (!reason) return res.status(400).json({ message: "Cancellation reason is required." });
    transitionSampleMovement(movement, "cancelled", {
      type: "cancelled",
      actor: req.user,
      note: reason,
    });
    await movement.save();
    return respondWithMovement(res, movement._id);
  } catch (error) {
    return sendControllerError(res, error, "Failed to cancel sample movement.");
  }
};

module.exports = {
  authorizeSampleMovement: decideAuthorization("authorized"),
  approveOwnershipTransfer: decideOwnershipTransfer(true),
  cancelSampleMovement,
  confirmSampleReceipt,
  createSampleMovement,
  getSampleMovement,
  getSampleMovements,
  recordSampleReturn,
  rejectOwnershipTransfer: decideOwnershipTransfer(false),
  rejectSampleMovement: decideAuthorization("rejected"),
  releaseSampleMovement,
  requestOwnershipTransfer,
  requestSampleMovementChanges: decideAuthorization("changes_requested"),
  submitSampleMovement,
  updateSampleMovement,
};
