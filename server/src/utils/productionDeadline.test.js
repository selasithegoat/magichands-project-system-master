const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateProductionTracking,
  estimateProductionWork,
  getPackagingMinutes,
  getPostProductionAllowance,
} = require("./productionDeadline");

test("packaging time follows the agreed quantity bands", () => {
  assert.equal(getPackagingMinutes(1), 30);
  assert.equal(getPackagingMinutes(20), 30);
  assert.equal(getPackagingMinutes(21), 45);
  assert.equal(getPackagingMinutes(100), 45);
  assert.equal(getPackagingMinutes(101), 60);
});

test("post-production allowance includes photography only when engaged", () => {
  assert.deepEqual(getPostProductionAllowance({ departments: [] }, 50), {
    totalMinutes: 105,
    qualityControlMinutes: 30,
    photographyMinutes: 0,
    packagingMinutes: 45,
    deliveryPreparationMinutes: 30,
  });
  assert.equal(
    getPostProductionAllowance({ departments: ["Photography"] }, 50)
      .totalMinutes,
    135,
  );
});

test("production work uses the longest parallel workstream", () => {
  const result = estimateProductionWork({
    items: [
      {
        qty: 40,
        productionAssignments: [{ department: "dtf" }],
      },
      {
        qty: 12,
        productionAssignments: [{ department: "embroidery" }],
      },
    ],
  });

  assert.equal(result.totalQuantity, 52);
  assert.equal(result.itemLineCount, 2);
  assert.equal(result.estimatedProductionMinutes, 105);
});

test("production deadline is derived from delivery and remaining stages", () => {
  const result = calculateProductionTracking(
    {
      status: "Pending Production",
      statusChangedAt: "2026-09-19T08:00:00.000Z",
      productionOwnerId: "owner-1",
      departments: ["Photography"],
      details: {
        deliveryDate: "2026-09-19T00:00:00.000Z",
        deliveryTime: "4:00 PM",
      },
      items: [
        {
          qty: 50,
          productionAssignments: [{ department: "dtf" }],
        },
      ],
    },
    { now: "2026-09-19T08:00:00.000Z" },
  );

  assert.equal(result.postProductionBufferMinutes, 135);
  assert.equal(result.productionDueAt.toISOString(), "2026-09-19T13:45:00.000Z");
  assert.equal(result.predictedCompletionAt.toISOString(), "2026-09-19T09:45:00.000Z");
  assert.equal(result.riskLevel, "on_track");
});

test("missing delivery deadline and overdue work receive explicit risk states", () => {
  const missingDeadline = calculateProductionTracking(
    { productionOwnerId: "owner-1", items: [{ qty: 10 }] },
    { now: "2026-09-19T08:00:00.000Z" },
  );
  assert.equal(missingDeadline.riskLevel, "deadline_required");

  const overdue = calculateProductionTracking(
    {
      productionOwnerId: "owner-1",
      details: {
        deliveryDate: "2026-09-19T00:00:00.000Z",
        deliveryTime: "9:00 AM",
      },
      items: [{ qty: 10 }],
    },
    { now: "2026-09-19T08:00:00.000Z" },
  );
  assert.equal(overdue.riskLevel, "overdue");
});

test("in-progress predictions use the actual work start and live elapsed time", () => {
  const result = calculateProductionTracking(
    {
      productionOwnerId: "owner-1",
      productionTracking: {
        executionState: "in_progress",
        workStartedAt: "2026-09-19T08:00:00.000Z",
      },
      details: {
        deliveryDate: "2026-09-19T00:00:00.000Z",
        deliveryTime: "1:00 PM",
      },
      items: [
        {
          qty: 40,
          productionAssignments: [{ department: "dtf" }],
        },
      ],
    },
    { now: "2026-09-19T08:30:00.000Z" },
  );

  assert.equal(result.executionState, "in_progress");
  assert.equal(result.predictedStartAt.toISOString(), "2026-09-19T08:00:00.000Z");
  assert.equal(result.predictedCompletionAt.toISOString(), "2026-09-19T09:30:00.000Z");
  assert.equal(result.elapsedProductionMinutes, 30);
  assert.equal(result.remainingProductionMinutes, 60);
});
