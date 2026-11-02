const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Project = require("../models/Project");
const ProjectUpdate = require("../models/ProjectUpdate");
const MaterialRequest = require("../models/MaterialRequest");
const User = require("../models/User");
const { getLeadProjects } = require("./liveUpdatesController");

test("lead projects are grouped only by main lead and show assistant and source statuses", async () => {
  const mainId = new mongoose.Types.ObjectId();
  const assistantId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const authorId = new mongoose.Types.ObjectId();
  const original = {
    projectFind: Project.find,
    updateAggregate: ProjectUpdate.aggregate,
    requestFind: MaterialRequest.find,
    userFindById: User.findById,
    userFind: User.find,
  };
  let queriedProjectFilter;

  try {
    User.findById = () => ({ select: () => ({ lean: async () => ({
      _id: mainId, firstName: "Ama", lastName: "Mensah", employeeId: "MH1",
    }) }) });
    User.find = () => ({ select: () => ({ lean: async () => [{
      _id: authorId, firstName: "Ama", lastName: "Mensah",
    }] }) });
    Project.find = (filter) => {
      queriedProjectFilter = filter;
      return { select: () => ({ populate: () => ({ lean: async () => [{
        _id: projectId,
        orderId: "MH-42",
        details: { projectName: "Shop signs" },
        status: "Production In Progress",
        statusChangedAt: new Date("2026-10-01T10:00:00Z"),
        assistantLeadId: { _id: assistantId, firstName: "Kojo", lastName: "Owusu" },
      }] }) }) };
    };
    ProjectUpdate.aggregate = async () => [{
      _id: new mongoose.Types.ObjectId(),
      project: projectId,
      author: authorId,
      content: "Design approved and sent to production",
      createdAt: new Date("2026-10-02T11:00:00Z"),
    }];
    MaterialRequest.find = () => ({ select: () => ({ lean: async () => [{
      _id: new mongoose.Types.ObjectId(),
      project: projectId,
      materialName: "Vinyl",
      status: "Ordered",
      statusUpdatedAt: new Date("2026-10-03T12:00:00Z"),
      createdAt: new Date("2026-10-01T12:00:00Z"),
      items: [],
    }] }) });

    let response;
    const res = { json: (body) => { response = body; } };
    await getLeadProjects({ params: { leadId: String(mainId) } }, res);

    assert.equal(String(queriedProjectFilter.projectLeadId), String(mainId));
    assert.equal(response.projects.length, 1);
    assert.equal(response.projects[0].assistantLead.name, "Kojo Owusu");
    assert.equal(response.projects[0].status, "Production In Progress");
    assert.equal(response.projects[0].latestUpdate.content, "Design approved and sent to production");
    assert.equal(response.projects[0].requests[0].status, "Ordered");
    assert.equal(response.projects[0].lastActivityAt, "2026-10-03T12:00:00.000Z");
  } finally {
    Project.find = original.projectFind;
    ProjectUpdate.aggregate = original.updateAggregate;
    MaterialRequest.find = original.requestFind;
    User.findById = original.userFindById;
    User.find = original.userFind;
  }
});
