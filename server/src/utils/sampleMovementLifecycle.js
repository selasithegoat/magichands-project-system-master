const SAMPLE_MOVEMENT_STATUSES = Object.freeze([
  "draft",
  "awaiting_authorization",
  "changes_requested",
  "authorization_rejected",
  "authorized",
  "dispatched",
  "in_client_custody",
  "partially_returned",
  "ownership_transfer_pending",
  "returned",
  "client_owned",
  "lost_unrecoverable",
  "cancelled",
]);

const SAMPLE_HANDOVER_METHODS = Object.freeze(["pickup", "dispatch"]);
const SAMPLE_DISPOSITIONS = Object.freeze([
  "returnable",
  "client_owned",
  "decision_pending",
]);
const SAMPLE_PRODUCTION_TREATMENTS = Object.freeze([
  "not_applicable",
  "counts_toward_order",
  "additional_paid",
  "complimentary",
  "pending",
]);
const SAMPLE_MOVEMENT_ATTENTION_STATES = Object.freeze([
  "none",
  "due_soon",
  "overdue",
]);

const TERMINAL_STATUSES = new Set([
  "authorization_rejected",
  "returned",
  "client_owned",
  "lost_unrecoverable",
  "cancelled",
]);

const CUSTODY_STATUSES = new Set([
  "dispatched",
  "in_client_custody",
  "partially_returned",
  "ownership_transfer_pending",
]);

const TRANSITIONS = Object.freeze({
  draft: Object.freeze(["awaiting_authorization", "cancelled"]),
  awaiting_authorization: Object.freeze([
    "changes_requested",
    "authorization_rejected",
    "authorized",
    "cancelled",
  ]),
  changes_requested: Object.freeze([
    "awaiting_authorization",
    "cancelled",
  ]),
  authorization_rejected: Object.freeze([]),
  authorized: Object.freeze([
    "dispatched",
    "in_client_custody",
    "client_owned",
    "cancelled",
  ]),
  dispatched: Object.freeze([
    "in_client_custody",
    "ownership_transfer_pending",
    "client_owned",
    "lost_unrecoverable",
  ]),
  in_client_custody: Object.freeze([
    "partially_returned",
    "ownership_transfer_pending",
    "returned",
    "lost_unrecoverable",
  ]),
  partially_returned: Object.freeze([
    "ownership_transfer_pending",
    "returned",
    "lost_unrecoverable",
  ]),
  ownership_transfer_pending: Object.freeze([
    "in_client_custody",
    "partially_returned",
    "client_owned",
    "lost_unrecoverable",
  ]),
  returned: Object.freeze([]),
  client_owned: Object.freeze([]),
  lost_unrecoverable: Object.freeze([]),
  cancelled: Object.freeze([]),
});

class SampleMovementTransitionError extends Error {
  constructor(fromStatus, toStatus) {
    super(
      `Sample movement cannot transition from "${fromStatus}" to "${toStatus}".`,
    );
    this.name = "SampleMovementTransitionError";
    this.code = "INVALID_SAMPLE_MOVEMENT_TRANSITION";
    this.statusCode = 409;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

class SampleMovementValidationError extends Error {
  constructor(errors) {
    super("Sample movement is not ready for submission.");
    this.name = "SampleMovementValidationError";
    this.code = "SAMPLE_MOVEMENT_VALIDATION_FAILED";
    this.statusCode = 422;
    this.errors = errors;
  }
}

const toStatus = (value) => String(value || "").trim().toLowerCase();
const toText = (value) => String(value || "").trim();

const getAllowedSampleMovementTransitions = (status) => [
  ...(TRANSITIONS[toStatus(status)] || []),
];

const canTransitionSampleMovement = (fromStatus, toStatusValue) =>
  getAllowedSampleMovementTransitions(fromStatus).includes(
    toStatus(toStatusValue),
  );

const assertSampleMovementTransition = (fromStatus, toStatusValue) => {
  const normalizedFrom = toStatus(fromStatus);
  const normalizedTo = toStatus(toStatusValue);
  if (!canTransitionSampleMovement(normalizedFrom, normalizedTo)) {
    throw new SampleMovementTransitionError(normalizedFrom, normalizedTo);
  }
  return normalizedTo;
};

const isTerminalSampleMovementStatus = (status) =>
  TERMINAL_STATUSES.has(toStatus(status));

const requiresSampleReturn = (disposition) =>
  ["returnable", "decision_pending"].includes(toStatus(disposition));

const resolvePostReleaseStatus = ({
  disposition,
  handoverMethod,
  recipientConfirmed = false,
} = {}) => {
  const normalizedDisposition = toStatus(disposition);
  const normalizedMethod = toStatus(handoverMethod);

  if (!SAMPLE_DISPOSITIONS.includes(normalizedDisposition)) {
    throw new TypeError(`Unsupported sample disposition: ${disposition}`);
  }
  if (!SAMPLE_HANDOVER_METHODS.includes(normalizedMethod)) {
    throw new TypeError(`Unsupported sample handover method: ${handoverMethod}`);
  }
  if (normalizedDisposition === "client_owned") return "client_owned";
  if (normalizedMethod === "dispatch" && !recipientConfirmed) {
    return "dispatched";
  }
  return "in_client_custody";
};

const getSampleMovementAttentionState = (
  movement,
  { now = new Date(), dueSoonDays = 7 } = {},
) => {
  const status = toStatus(movement?.status);
  if (
    !CUSTODY_STATUSES.has(status) ||
    !requiresSampleReturn(movement?.disposition)
  ) {
    return "none";
  }

  const expectedReturnAt = new Date(movement?.expectedReturnAt || "");
  const currentTime = new Date(now).getTime();
  const dueTime = expectedReturnAt.getTime();
  if (!Number.isFinite(currentTime) || !Number.isFinite(dueTime)) return "none";

  const remainingMs = dueTime - currentTime;
  if (remainingMs < 0) return "overdue";

  const normalizedDueSoonDays = Math.max(0, Number(dueSoonDays) || 0);
  return remainingMs <= normalizedDueSoonDays * 24 * 60 * 60 * 1000
    ? "due_soon"
    : "none";
};

const getSampleMovementSubmissionErrors = (movement, { now = new Date() } = {}) => {
  const errors = [];
  const addError = (field, message) => errors.push({ field, message });
  const items = Array.isArray(movement?.items) ? movement.items : [];

  if (!movement?.project) addError("project", "A linked project is required.");
  if (!toText(movement?.client?.name)) {
    addError("client.name", "Client name is required.");
  }
  if (!toText(movement?.purpose)) {
    addError("purpose", "The purpose of the sample assessment is required.");
  }
  if (!SAMPLE_HANDOVER_METHODS.includes(toStatus(movement?.handoverMethod))) {
    addError("handoverMethod", "Select pick-up or dispatch.");
  }
  if (!SAMPLE_DISPOSITIONS.includes(toStatus(movement?.disposition))) {
    addError("disposition", "Select a valid sample disposition.");
  }
  if (items.length === 0) {
    addError("items", "At least one sample item is required.");
  }

  items.forEach((item, index) => {
    if (!toText(item?.description)) {
      addError(`items.${index}.description`, "Sample description is required.");
    }
    if (!(Number(item?.quantity) > 0)) {
      addError(`items.${index}.quantity`, "Sample quantity must be greater than zero.");
    }
  });

  if (requiresSampleReturn(movement?.disposition)) {
    const returnTime = new Date(movement?.expectedReturnAt || "").getTime();
    const currentTime = new Date(now).getTime();
    if (!Number.isFinite(returnTime)) {
      addError(
        "expectedReturnAt",
        "An expected return date is required for returnable samples.",
      );
    } else if (Number.isFinite(currentTime) && returnTime <= currentTime) {
      addError("expectedReturnAt", "Expected return date must be in the future.");
    }
  }

  return errors;
};

const assertSampleMovementReadyForSubmission = (movement, options) => {
  const errors = getSampleMovementSubmissionErrors(movement, options);
  if (errors.length > 0) throw new SampleMovementValidationError(errors);
  return true;
};

module.exports = {
  SAMPLE_DISPOSITIONS,
  SAMPLE_HANDOVER_METHODS,
  SAMPLE_MOVEMENT_ATTENTION_STATES,
  SAMPLE_MOVEMENT_STATUSES,
  SAMPLE_PRODUCTION_TREATMENTS,
  SampleMovementTransitionError,
  SampleMovementValidationError,
  assertSampleMovementReadyForSubmission,
  assertSampleMovementTransition,
  canTransitionSampleMovement,
  getAllowedSampleMovementTransitions,
  getSampleMovementAttentionState,
  getSampleMovementSubmissionErrors,
  isTerminalSampleMovementStatus,
  requiresSampleReturn,
  resolvePostReleaseStatus,
};
