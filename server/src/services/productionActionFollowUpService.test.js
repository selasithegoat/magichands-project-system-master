const test = require("node:test");
const assert = require("node:assert/strict");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  isCurrentProductionAction,
  processProductionActionFollowUp,
} = require("./productionActionFollowUpService");

const buildAction = (overrides = {}) => ({
  _id: "check-1",
  recipient: "lead-1",
  source: "production_lead_follow_up:completion_due",
  title: "Production completion check",
  message: "Please confirm Production is done.",
  followUpStartedAt: new Date("2026-09-21T10:00:00Z"),
  reminderSentAt: null,
  escalatedAt: null,
  project: {
    _id: "project-1",
    status: "Production In Progress",
    productionTracking: {
      completionReview: {
        status: "awaiting_lead",
        leadNotificationId: "check-1",
      },
    },
  },
  ...overrides,
});

test("only the project's current prompt can receive follow-ups", () => {
  assert.equal(isCurrentProductionAction(buildAction()), true);
  assert.equal(
    isCurrentProductionAction(buildAction({ _id: "stale-check" })),
    false,
  );
  assert.equal(
    isCurrentProductionAction(
      buildAction({
        source: "production_completion_request:ready",
        project: {
          _id: "project-1",
          status: "Pending Production",
          productionTracking: {
            completionReview: {
              status: "awaiting_owner",
              ownerNotificationId: "check-1",
            },
          },
        },
      }),
    ),
    true,
  );
});

test("first reminder updates the existing prompt and schedules escalation", async () => {
  const originalFindOneAndUpdate = Notification.findOneAndUpdate;
  const originalExists = Notification.exists;
  const originalFindById = User.findById;
  let claim;
  Notification.findOneAndUpdate = async (filter, update) => {
    claim = { filter, update };
    return { _id: "check-1" };
  };
  Notification.exists = async () => true;
  User.findById = () => ({
    select: async () => ({ notificationSettings: { email: false } }),
  });
  try {
    const outcome = await processProductionActionFollowUp(
      buildAction(),
      new Date("2026-09-21T12:00:00Z"),
    );
    assert.equal(outcome, "reminded");
    assert.equal(claim.filter._id, "check-1");
    assert.equal(claim.filter.reminderSentAt, null);
    assert.equal(
      claim.update.$set.nextReminderAt.toISOString(),
      "2026-09-22T09:00:00.000Z",
    );
  } finally {
    Notification.findOneAndUpdate = originalFindOneAndUpdate;
    Notification.exists = originalExists;
    User.findById = originalFindById;
  }
});
