const assert = require("node:assert/strict");
const {
  getBusinessDayBounds,
  getProjectDeadlineFlags,
  isActiveDeadlineProject,
  parseProjectDeliveryDeadline,
  toBusinessDateKey,
} = require("./projectDeadline");

const dateOnlyProject = {
  status: "Pending Production",
  details: { deliveryDate: "2026-08-20T00:00:00.000Z" },
};
assert.equal(
  parseProjectDeliveryDeadline(dateOnlyProject).toISOString(),
  "2026-08-20T23:59:59.999Z",
);

const timedQuote = {
  projectType: "Quote",
  status: "Quote Created",
  details: {
    deliveryDate: "2026-08-20T00:00:00.000Z",
    deliveryTime: "2:30 PM",
  },
};
assert.equal(
  parseProjectDeliveryDeadline(timedQuote).toISOString(),
  "2026-08-20T14:30:00.000Z",
);
assert.equal(isActiveDeadlineProject(timedQuote), true, "quotes stay in scope");

const flags = getProjectDeadlineFlags(
  timedQuote,
  new Date("2026-08-20T13:30:00.000Z"),
);
assert.equal(flags.isToday, true);
assert.equal(flags.isUrgent, true);
assert.equal(flags.isOverdue, false);
assert.equal(flags.hoursUntilDue, 1);

assert.equal(
  getProjectDeadlineFlags(
    timedQuote,
    new Date("2026-08-20T15:00:00.000Z"),
  ).isOverdue,
  true,
);
assert.equal(
  isActiveDeadlineProject({
    ...timedQuote,
    status: "Completed",
  }),
  false,
);
assert.equal(
  isActiveDeadlineProject({
    ...timedQuote,
    cancellation: { isCancelled: true },
  }),
  false,
);

const bounds = getBusinessDayBounds("2026-08-20");
assert.equal(bounds.start.toISOString(), "2026-08-20T00:00:00.000Z");
assert.equal(bounds.end.toISOString(), "2026-08-20T23:59:59.999Z");
assert.equal(toBusinessDateKey(bounds.start), "2026-08-20");

console.log("projectDeadline tests passed");
