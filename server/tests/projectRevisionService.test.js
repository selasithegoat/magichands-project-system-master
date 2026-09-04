const test = require("node:test");
const assert = require("node:assert/strict");
const Project = require("../src/models/Project");
const ProjectRevision = require("../src/models/ProjectRevision");
const {
  buildProjectRevisionChanges,
  captureProjectRevisionState,
  recordProjectRevision,
} = require("../src/services/projectRevisionService");

const buildProject = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439011",
  versionNumber: 1,
  orderId: "MH-100",
  projectType: "Standard",
  priority: "Normal",
  orderDate: new Date("2026-08-01T00:00:00.000Z"),
  receivedTime: "09:30",
  details: {
    projectName: "Launch Shirts",
    client: "Acme",
    clientEmail: "hello@acme.test",
    clientPhone: "1234",
    briefOverview: "Produce 100 shirts",
    deliveryDate: new Date("2026-08-20T00:00:00.000Z"),
    deliveryTime: "16:00",
    deliveryLocation: "Accra",
    contactType: "MH",
    supplySource: ["in-house"],
    packagingType: "Carton",
    attachments: [],
    ...overrides.details,
  },
  departments: ["Production"],
  items: [
    {
      _id: "507f1f77bcf86cd799439012",
      description: "Polo Shirt",
      breakdown: "Blue, XL",
      qty: 100,
      productionAssignments: [],
    },
  ],
  referenceProjects: [],
  uncontrollableFactors: [],
  productionRisks: [],
  challenges: [],
  mockup: { versions: [] },
  ...overrides,
});

test("does not create changes when tracked content is unchanged", () => {
  const project = buildProject();
  const changes = buildProjectRevisionChanges(project, project);
  assert.deepEqual(changes, []);
});

test("does not record project creation as revision one", async () => {
  const revision = await recordProjectRevision({
    before: null,
    after: buildProject(),
    actor: "507f1f77bcf86cd799439099",
    source: "project_creation",
  });

  assert.equal(revision, null);
});

test("records the first post-creation change as revision one", async () => {
  const originalFindByIdAndUpdate = Project.findByIdAndUpdate;
  const originalCreate = ProjectRevision.create;
  let updateOptions;

  try {
    Project.findByIdAndUpdate = (_projectId, _pipeline, options) => {
      updateOptions = options;
      return {
        select: async () => ({
          revisionTracking: { currentRevision: 1 },
          versionNumber: 1,
        }),
      };
    };
    ProjectRevision.create = async (revision) => revision;

    const before = buildProject();
    const after = buildProject({
      details: { ...before.details, projectName: "Revised Launch Shirts" },
    });
    const revision = await recordProjectRevision({
      projectId: before._id,
      before,
      after,
      actor: {
        _id: "507f1f77bcf86cd799439099",
        firstName: "Test",
        lastName: "Editor",
      },
    });

    assert.equal(revision.revisionNumber, 1);
    assert.equal(revision.changes.length, 1);
    assert.equal(updateOptions.updatePipeline, true);
  } finally {
    Project.findByIdAndUpdate = originalFindByIdAndUpdate;
    ProjectRevision.create = originalCreate;
  }
});

test("groups scalar changes into their correct sections", () => {
  const before = buildProject();
  const after = buildProject({
    details: {
      ...before.details,
      briefOverview: "Produce 150 shirts",
      deliveryLocation: "Tema",
    },
  });

  const changes = buildProjectRevisionChanges(before, after);
  assert.deepEqual(
    changes.map(({ section, field, before: previous, after: next }) => ({
      section,
      field,
      previous,
      next,
    })),
    [
      {
        section: "overview",
        field: "details.briefOverview",
        previous: "Produce 100 shirts",
        next: "Produce 150 shirts",
      },
      {
        section: "project_details",
        field: "details.deliveryLocation",
        previous: "Accra",
        next: "Tema",
      },
    ],
  );
});

test("records item field edits and additions separately", () => {
  const before = buildProject();
  const after = buildProject({
    items: [
      { ...before.items[0], qty: 150 },
      {
        _id: "507f1f77bcf86cd799439013",
        description: "Round Neck Shirt",
        breakdown: "White, L",
        qty: 25,
        productionAssignments: [],
      },
    ],
  });

  const changes = buildProjectRevisionChanges(before, after);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].section, "items");
  assert.equal(changes[0].field, "items.0.qty");
  assert.equal(changes[0].before, 100);
  assert.equal(changes[0].after, 150);
  assert.equal(changes[1].changeType, "added");
  assert.equal(changes[1].after.description, "Round Neck Shirt");
});

test("captured state is stable after the original object mutates", () => {
  const project = buildProject();
  const captured = captureProjectRevisionState(project);
  project.details.client = "Changed Later";

  assert.equal(captured.values["details.client"], "Acme");
});
