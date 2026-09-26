const test = require("node:test");
const assert = require("node:assert/strict");
const Notification = require("../models/Notification");
const {
  getNotifications,
  markAsRead,
  markAsSeen,
  markAllAsRead,
  clearNotifications,
} = require("./notificationController");

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

test("opening a production action records seen without resolving it", async () => {
  const originalFindOne = Notification.findOne;
  const action = {
    source: "production_completion_request:ready",
    isRead: false,
    seenAt: null,
    saveCount: 0,
    async save() {
      this.saveCount += 1;
    },
  };
  Notification.findOne = async () => action;
  try {
    const request = { params: { id: "action" }, user: { _id: "owner" } };
    const seenResponse = makeResponse();
    await markAsSeen(request, seenResponse);
    assert.equal(seenResponse.statusCode, 200);
    assert.ok(action.seenAt instanceof Date);
    assert.equal(action.isRead, false);
    assert.equal(action.saveCount, 1);

    const readResponse = makeResponse();
    await markAsRead(request, readResponse);
    assert.equal(readResponse.statusCode, 409);
    assert.equal(action.isRead, false);
  } finally {
    Notification.findOne = originalFindOne;
  }
});

test("bulk read and clear exclude unresolved actions", async () => {
  const originalUpdateMany = Notification.updateMany;
  const originalDeleteMany = Notification.deleteMany;
  let readFilter;
  let clearFilter;
  Notification.updateMany = async (filter) => {
    readFilter = filter;
    return { modifiedCount: 0 };
  };
  Notification.deleteMany = async (filter) => {
    clearFilter = filter;
    return { deletedCount: 0 };
  };
  try {
    const request = { user: { _id: "owner" }, query: {} };
    await markAllAsRead(request, makeResponse());
    await clearNotifications(request, makeResponse());
    assert.equal(readFilter.recipient, "owner");
    assert.equal(readFilter.isRead, false);
    assert.deepEqual(readFilter.$nor, clearFilter.$nor);
    assert.deepEqual(readFilter.$nor[0].$or[0], {
      requiresAction: true,
      isRead: false,
    });
    assert.ok(
      readFilter.$nor[0].$or[1].source.$in.includes(
        "production_completion_request:ready",
      ),
    );
  } finally {
    Notification.updateMany = originalUpdateMany;
    Notification.deleteMany = originalDeleteMany;
  }
});

test("pending action feed includes old production prompts", async () => {
  const originalFind = Notification.find;
  let receivedFilter;
  let receivedLimit;
  Notification.find = (filter) => {
    receivedFilter = filter;
    return {
      populate() { return this; },
      sort() { return this; },
      limit(limit) {
        receivedLimit = limit;
        return Promise.resolve([]);
      },
    };
  };
  try {
    const response = makeResponse();
    await getNotifications(
      { user: { _id: "owner" }, query: { pendingActions: "true" } },
      response,
    );
    assert.equal(response.statusCode, 200);
    assert.equal(receivedFilter.isRead, false);
    assert.equal(receivedLimit, 200);
    assert.ok(
      receivedFilter.$or[1].source.$in.includes(
        "production_lead_follow_up:completion_due",
      ),
    );
  } finally {
    Notification.find = originalFind;
  }
});

test("only the current completion check is shown for a project", async () => {
  const originalFind = Notification.find;
  const project = {
    _id: "project-1",
    productionTracking: {
      completionReview: { leadNotificationId: "current-check" },
    },
  };
  Notification.find = () => ({
    populate() { return this; },
    sort() { return this; },
    limit() {
      return Promise.resolve([
        {
          _id: "stale-check",
          project,
          source: "production_lead_follow_up:completion_due",
          isRead: false,
        },
        {
          _id: "current-check",
          project,
          source: "production_lead_follow_up:completion_due",
          isRead: false,
        },
        {
          _id: "other-project",
          project: { _id: "project-2" },
          source: "production_lead_follow_up:completion_due",
          isRead: false,
        },
      ]);
    },
  });
  try {
    const response = makeResponse();
    await getNotifications(
      { user: { _id: "lead" }, query: { pendingActions: "true" } },
      response,
    );
    assert.deepEqual(
      response.body.map((notification) => notification._id),
      ["current-check", "other-project"],
    );
  } finally {
    Notification.find = originalFind;
  }
});
