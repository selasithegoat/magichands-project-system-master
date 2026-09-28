const SampleMovement = require("../models/SampleMovement");
const SampleMovementCounter = require("../models/SampleMovementCounter");
const {
  assertSampleMovementTransition,
  getSampleMovementAttentionState,
} = require("../utils/sampleMovementLifecycle");
const {
  formatSampleMovementReference,
  getSampleMovementCounterKey,
} = require("../utils/sampleMovementReference");

const getUserDisplayName = (user) => {
  const fullName = [user?.firstName, user?.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  return fullName || String(user?.name || user?.employeeId || "User").trim();
};

const allocateSampleMovementReference = async (date = new Date()) => {
  const year = date.getUTCFullYear();
  const counterKey = getSampleMovementCounterKey(year);
  const counter = await SampleMovementCounter.findOneAndUpdate(
    { counterKey },
    {
      $inc: { lastNumber: 1 },
      $setOnInsert: { year },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    reference: formatSampleMovementReference({
      year,
      sequence: counter.lastNumber,
    }),
    referenceYear: year,
    referenceNumber: counter.lastNumber,
  };
};

const appendCustodyEvent = (
  movement,
  { type, actor, fromStatus = null, toStatus = null, note = "", details = null },
) => {
  movement.custodyEvents.push({
    type,
    actor: actor?._id || actor?.id || actor || null,
    actorName: getUserDisplayName(actor),
    fromStatus,
    toStatus,
    note: String(note || "").trim(),
    details,
    occurredAt: new Date(),
  });
};

const transitionSampleMovement = (
  movement,
  nextStatus,
  { type, actor, note = "", details = null },
) => {
  const fromStatus = movement.status;
  assertSampleMovementTransition(fromStatus, nextStatus);
  movement.status = nextStatus;
  movement.updatedBy = actor?._id || actor?.id || actor;
  appendCustodyEvent(movement, {
    type,
    actor,
    fromStatus,
    toStatus: nextStatus,
    note,
    details,
  });
};

const populateSampleMovementQuery = (query) =>
  query
    .populate("project", "orderId versionNumber status details.projectName details.projectNameRaw details.client")
    .populate("frontDeskOwner", "firstName lastName employeeId department")
    .populate("createdBy", "firstName lastName employeeId")
    .populate("updatedBy", "firstName lastName employeeId")
    .populate("authorization.submittedBy", "firstName lastName employeeId")
    .populate("authorization.decidedBy", "firstName lastName employeeId")
    .populate("ownershipTransfer.requestedBy", "firstName lastName employeeId")
    .populate("ownershipTransfer.decidedBy", "firstName lastName employeeId");

const getSampleMovementById = async (id) => {
  const movement = await populateSampleMovementQuery(
    SampleMovement.findById(id),
  ).lean();
  return movement
    ? {
        ...movement,
        attentionState: getSampleMovementAttentionState(movement),
      }
    : null;
};

module.exports = {
  allocateSampleMovementReference,
  appendCustodyEvent,
  getSampleMovementById,
  getUserDisplayName,
  populateSampleMovementQuery,
  transitionSampleMovement,
};
