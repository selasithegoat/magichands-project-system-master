const test = require("node:test");
const assert = require("node:assert/strict");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { createNotification } = require("./notificationService");

test("an unresolved production check is reused for the same recipient and project", async () => {
  const originalFindById = User.findById;
  const originalFindOne = Notification.findOne;
  const originalCreate = Notification.create;
  const existing = { _id: "active-check", isRead: false };
  let activeFilter;
  let createCount = 0;
  User.findById = async () => ({ notificationSettings: {} });
  Notification.findOne = (filter) => {
    activeFilter = filter;
    return {
      sort() { return this; },
      lean() { return Promise.resolve(existing); },
    };
  };
  Notification.create = async () => {
    createCount += 1;
  };
  try {
    const notification = await createNotification(
      "lead-1",
      "owner-1",
      "project-1",
      "REMINDER",
      "Production completion check",
      "Please confirm Production is done.",
      {
        source: "production_lead_follow_up:completion_due",
        dedupeKey: "new-plan-key",
        email: false,
        push: false,
      },
    );
    assert.equal(notification, existing);
    assert.deepEqual(activeFilter, {
      recipient: "lead-1",
      project: "project-1",
      source: "production_lead_follow_up:completion_due",
      isRead: false,
    });
    assert.equal(createCount, 0);
  } finally {
    User.findById = originalFindById;
    Notification.findOne = originalFindOne;
    Notification.create = originalCreate;
  }
});

test("a new production action starts its first reminder on a working-hour deadline", async () => {
  const originalFindById = User.findById;
  const originalFindOne = Notification.findOne;
  const originalCreate = Notification.create;
  let created;
  User.findById = async () => ({ notificationSettings: {} });
  Notification.findOne = () => ({
    sort() { return this; },
    lean() { return Promise.resolve(null); },
  });
  Notification.create = async (document) => {
    created = document;
    return { _id: "new-check", ...document };
  };
  try {
    await createNotification(
      "lead-1",
      "owner-1",
      "project-1",
      "REMINDER",
      "Production completion check",
      "Please confirm Production is done.",
      {
        source: "production_lead_follow_up:completion_due",
        dedupeKey: "first-plan-key",
        email: false,
        push: false,
      },
    );
    assert.equal(created.requiresAction, true);
    assert.ok(created.followUpStartedAt instanceof Date);
    assert.ok(created.nextReminderAt > created.followUpStartedAt);
    assert.equal(created.reminderSentAt, undefined);
  } finally {
    User.findById = originalFindById;
    Notification.findOne = originalFindOne;
    Notification.create = originalCreate;
  }
});
