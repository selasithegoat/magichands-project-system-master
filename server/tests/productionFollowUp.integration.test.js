const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const mongoose = require("mongoose");
const Project = require("../src/models/Project");
const User = require("../src/models/User");
const Notification = require("../src/models/Notification");
const W = require("../src/utils/productionFollowUp");
const service = require("../src/services/productionFollowUpService");

const binary =
  process.env.MONGOD_TEST_BINARY ||
  (process.platform === "win32"
    ? "C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe"
    : "/usr/bin/mongod");
test(
  "production follow-up with an isolated MongoDB instance",
  {
    skip:
      !fs.existsSync(binary) &&
      "Set MONGOD_TEST_BINARY to run the isolated database integration tests.",
    timeout: 90000,
  },
  async (t) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "mh-production-test-"),
    );
    const socket = net.createServer();
    socket.listen(0, "127.0.0.1");
    await once(socket, "listening");
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    const mongo = spawn(
      binary,
      [
        "--dbpath",
        directory,
        "--port",
        String(port),
        "--bind_ip",
        "127.0.0.1",
        "--noauth",
        "--quiet",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    mongo.stdout.on("data", (d) => (output = (output + d).slice(-2000)));
    mongo.stderr.on("data", (d) => (output = (output + d).slice(-2000)));
    t.after(async () => {
      await mongoose.disconnect();
      if (mongo.exitCode === null) {
        const closed = once(mongo, "exit");
        mongo.kill();
        await closed;
      }
      const resolved = path.resolve(directory);
      if (
        path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolved).startsWith("mh-production-test-")
      )
        throw new Error("Refusing to clean an unexpected temporary path.");
      fs.rmSync(resolved, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    });
    try {
      await mongoose.connect(
        `mongodb://127.0.0.1:${port}/production_follow_up_test`,
        { serverSelectionTimeoutMS: 20000 },
      );
    } catch (error) {
      throw new Error(`${error.message}\n${output}`);
    }
    const [lead, otherLead, frontDesk, admin, owner, outsider, trainee] =
      await User.insertMany(
        [
          {
            employeeId: "test-lead",
            firstName: "Lead",
            department: [],
            role: "user",
          },
          {
            employeeId: "test-other-lead",
            firstName: "Other Lead",
            department: [],
            role: "user",
          },
          {
            employeeId: "test-frontdesk",
            firstName: "Front",
            department: ["Front Desk"],
            role: "user",
          },
          {
            employeeId: "test-admin",
            firstName: "Admin",
            department: ["Administration"],
            role: "admin",
          },
          {
            employeeId: "test-owner",
            firstName: "Owner",
            department: ["dtf"],
            role: "user",
          },
          {
            employeeId: "test-outsider",
            firstName: "Outsider",
            department: ["embroidery"],
            role: "user",
          },
          {
            employeeId: "test-trainee",
            firstName: "Trainee",
            department: ["dtf"],
            role: "user",
            productionAccess: "Production Trainee",
          },
        ].map((u) => ({
          ...u,
          password: "test-only-no-login",
          notificationSettings: { email: false, push: false },
        })),
      );
    let sequence = 0;
    const fixture = async (extra = {}) =>
      (
        await Project.create({
          orderId: `TEST-${++sequence}`,
          projectType: "Standard",
          status: "Pending Production",
          projectLeadId: lead._id,
          createdBy: frontDesk._id,
          departments: ["dtf"],
          acknowledgements: [{ department: "dtf", user: owner._id }],
          details: {
            projectName: "Production follow-up test",
            deliveryDate: "2026-01-01",
            deliveryTime: "17:00",
          },
          ...extra,
        })
      ).toObject();
    const read = (p) =>
      Project.findById(p._id).select("+productionFollowUp").lean();
    const act = async (p, user, action, input = {}) => {
      const latest = await read(p);
      return service.act(p._id, user, action, {
        revision: latest.productionFollowUp?.revision || 0,
        ...input,
      });
    };
    const future = (hours = 48) => {
      const d = new Date(Date.now() + hours * W.HOUR);
      d.setUTCSeconds(0, 0);
      return d.toISOString();
    };
    const request = (p) =>
      act(p, lead, "request", {
        reason: "Production is delayed",
        remainingHours: 4,
        proposedAt: future(),
      });
    const contact = (p) =>
      act(p, frontDesk, "contact", {
        confirmed: true,
        contactName: "Client Representative",
        channel: "phone",
        contactedAt: new Date().toISOString(),
        outcome: "accepted",
        summary: "Client was reached and the exact revised date was discussed.",
      });

    await t.test(
      "scopes the Client portal to primary Lead projects and engaged production departments",
      async () => {
        const leadProject = await fixture({
          details: {
            projectName: "Primary Lead DTF",
            deliveryDate: "2026-12-01",
            deliveryTime: "17:00",
          },
        });
        const otherLeadProject = await fixture({
          projectLeadId: otherLead._id,
          details: {
            projectName: "Other Lead DTF",
            deliveryDate: "2026-12-02",
            deliveryTime: "17:00",
          },
        });
        const embroideryProject = await fixture({
          departments: ["embroidery"],
          acknowledgements: [{ department: "embroidery", user: outsider._id }],
          details: {
            projectName: "Embroidery only",
            deliveryDate: "2026-12-03",
            deliveryTime: "17:00",
          },
        });
        const genericProductionProject = await fixture({
          departments: ["Production"],
          acknowledgements: [],
          details: {
            projectName: "Unscoped production",
            deliveryDate: "2026-12-04",
            deliveryTime: "17:00",
          },
        });

        const leadView = await service.listForUser(lead, { source: "client" });
        const leadIds = new Set(leadView.map((project) => project.id));
        assert.equal(leadIds.has(W.id(leadProject)), true);
        assert.equal(leadIds.has(W.id(otherLeadProject)), false);
        assert.deepEqual(
          leadView.find((project) => project.id === W.id(leadProject))
            .categories,
          ["lead"],
        );

        const productionView = await service.listForUser(owner, {
          source: "client",
        });
        const productionIds = new Set(
          productionView.map((project) => project.id),
        );
        assert.equal(productionIds.has(W.id(leadProject)), true);
        assert.equal(productionIds.has(W.id(otherLeadProject)), true);
        assert.equal(productionIds.has(W.id(embroideryProject)), false);
        assert.equal(productionIds.has(W.id(genericProductionProject)), false);
        assert.deepEqual(
          productionView.find((project) => project.id === W.id(leadProject))
            .categories,
          ["production"],
        );

        const spoofedAdminIds = new Set(
          (await service.listForUser(owner, { source: "admin" })).map(
            (project) => project.id,
          ),
        );
        assert.equal(spoofedAdminIds.has(W.id(embroideryProject)), false);
        assert.equal(
          spoofedAdminIds.has(W.id(genericProductionProject)),
          false,
        );

        const adminView = await service.listForUser(admin, { source: "admin" });
        const adminIds = new Set(adminView.map((project) => project.id));
        assert.equal(adminIds.has(W.id(otherLeadProject)), true);
        assert.equal(adminIds.has(W.id(genericProductionProject)), true);
        assert.deepEqual(
          adminView.find((project) => project.id === W.id(otherLeadProject))
            .categories,
          ["production"],
        );
      },
    );

    await t.test(
      "persists one missed-deadline request across repeated scheduler sweeps",
      async () => {
        const p = await fixture();
        await service.sweep(new Date("2026-09-07T10:00:00Z"));
        let saved = await read(p);
        assert.equal(saved.productionFollowUp.request.number, 1);
        const first = saved.productionFollowUp.request.createdAt;
        await service.sweep(new Date("2026-09-07T10:01:00Z"));
        saved = await read(p);
        assert.equal(saved.productionFollowUp.request.createdAt, first);
        const regular = await Project.findById(p._id).lean();
        assert.equal(
          regular.productionFollowUp,
          undefined,
          "Client communication is excluded from normal project responses",
        );
      },
    );
    await t.test(
      "routes requests only to Front Desk/Admin and prevents Lead approval",
      async () => {
        const p = await fixture();
        await request(p);
        const notifications = await Notification.find({
          project: p._id,
        }).lean();
        assert.deepEqual(
          new Set(notifications.map((n) => W.id(n.recipient))),
          new Set([W.id(frontDesk), W.id(admin)]),
        );
        await assert.rejects(act(p, lead, "apply"), { status: 403 });
        await assert.rejects(act(p, owner, "claim"), { status: 403 });
        const ownerView = (await service.listForUser(owner)).find(
          (v) => v.id === W.id(p),
        );
        assert.equal(ownerView.request, null);
        assert.deepEqual(ownerView.history, []);
        const frontDeskView = (
          await service.listForUser(frontDesk, { source: "client" })
        ).find((project) => project.id === W.id(p));
        assert.deepEqual(frontDeskView.categories, ["frontDesk"]);
      },
    );
    await t.test(
      "requires successful contact, invalidates it when the proposal changes, then applies atomically",
      async () => {
        const p = await fixture();
        await request(p);
        await act(p, frontDesk, "claim");
        await assert.rejects(
          act(p, frontDesk, "apply"),
          /client communication/,
        );
        await assert.rejects(
          act(p, frontDesk, "contact", {
            confirmed: true,
            contactedAt: new Date().toISOString(),
            channel: "phone",
            outcome: "unreachable",
            contactName: "Client",
            summary: "No answer",
          }),
          /unsuccessful/,
        );
        await contact(p);
        await act(p, frontDesk, "proposal", { proposedAt: future(72) });
        assert.equal(
          (await read(p)).productionFollowUp.request.communication,
          null,
        );
        await assert.rejects(
          act(p, frontDesk, "apply"),
          /client communication/,
        );
        await contact(p);
        await act(p, frontDesk, "apply");
        const saved = await read(p);
        assert.equal(saved.productionFollowUp.request, null);
        assert.equal(saved.productionFollowUp.history.length, 1);
        assert.equal(
          saved.productionFollowUp.history[0].communication.deadlineAt,
          saved.productionFollowUp.history[0].proposedAt,
        );
        assert.equal(
          require("../src/utils/projectDeadline")
            .parseProjectDeliveryDeadline(saved)
            .toISOString(),
          saved.productionFollowUp.history[0].proposedAt,
        );
        const later = new Date(saved.productionFollowUp.history[0].proposedAt);
        later.setUTCDate(later.getUTCDate() + 2);
        await service.sweep(later);
        assert.equal((await read(p)).productionFollowUp.request.number, 2);
      },
    );
    await t.test(
      "rejects competing applications of the same communication and records one history entry",
      async () => {
        const p = await fixture();
        await request(p);
        await act(p, frontDesk, "claim");
        await contact(p);
        const current = await read(p);
        const version = current.productionFollowUp.revision;
        const results = await Promise.allSettled([
          service.act(p._id, frontDesk, "apply", { revision: version }),
          service.act(p._id, frontDesk, "apply", { revision: version }),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal((await read(p)).productionFollowUp.history.length, 1);
      },
    );
    await t.test(
      "blocks normal editor, query, and stage shortcuts",
      async () => {
        const p = await fixture();
        const document = await Project.findById(p._id);
        document.details.deliveryTime = "18:00";
        await assert.rejects(document.save(), /client communication/);
        const cleared = await Project.findById(p._id);
        cleared.details.deliveryDate = null;
        await assert.rejects(cleared.save(), /client communication/);
        await assert.rejects(
          Project.updateOne(
            { _id: p._id },
            { $set: { "details.deliveryDate": new Date(future()) } },
          ),
          /client communication/,
        );
        await assert.rejects(
          Project.findOneAndUpdate(
            { _id: p._id },
            { $set: { status: "Pending Quality Control" } },
          ),
          /individual assignments/,
        );
        await assert.rejects(
          Project.findOneAndUpdate(
            { _id: p._id },
            { status: "Pending Quality Control" },
          ),
          /individual assignments/,
        );
        const partial = await Project.findById(p._id).select(
          "status projectType",
        );
        partial.status = "Pending Quality Control";
        await assert.rejects(partial.save(), /individual assignments/);
      },
    );
    await t.test(
      "production owners can report blockers, but outsiders and trainees cannot complete their work",
      async () => {
        const p = await fixture();
        await assert.rejects(
          act(p, outsider, "complete", {
            department: "dtf",
            confirmed: true,
            reason: "Finished work",
          }),
          { status: 403 },
        );
        await assert.rejects(
          act(p, trainee, "complete", {
            department: "dtf",
            confirmed: true,
            reason: "Finished work",
          }),
          { status: 403 },
        );
        await act(p, owner, "blocked", {
          department: "dtf",
          reason: "Waiting for material",
        });
        assert.equal(
          (await read(p)).productionFollowUp.tasks[0].status,
          "blocked",
        );
        await act(p, owner, "working", {
          department: "dtf",
          reason: "Material received",
          estimateAt: future(1),
        });
        assert.equal(
          (await read(p)).productionFollowUp.tasks[0].status,
          "working",
        );
      },
    );
    await t.test(
      "final owner confirmation advances to quality control and preserves the completion audit",
      async () => {
        const p = await fixture();
        await act(p, owner, "complete", {
          department: "dtf",
          confirmed: true,
          reason: "Checked all finished prints",
        });
        const saved = await read(p);
        assert.equal(saved.status, "Pending Quality Control");
        assert.equal(
          saved.productionFollowUp.tasks[0].completedBy,
          W.id(owner),
        );
        assert.ok(
          saved.statusHistory.some(
            (s) => s.toStatus === "Pending Quality Control",
          ),
        );
      },
    );
    await t.test(
      "Lead verification preserves the original owner and respects sample approval",
      async () => {
        const p = await fixture({ sampleRequirement: { isRequired: true } });
        await act(p, lead, "verify", {
          department: "dtf",
          confirmed: true,
          reason: "Inspected the finished prints in person",
        });
        const saved = await read(p);
        assert.equal(saved.productionFollowUp.tasks[0].owner, W.id(owner));
        assert.equal(saved.productionFollowUp.tasks[0].completedBy, W.id(lead));
        assert.equal(saved.status, "Pending Production");
        assert.match(
          saved.productionFollowUp.stageBlockMessage,
          /sample approval/,
        );
      },
    );
    await t.test(
      "all engaged department confirmations are required before advancement",
      async () => {
        const p = await fixture({
          departments: ["dtf", "embroidery"],
          acknowledgements: [
            { department: "dtf", user: owner._id },
            { department: "embroidery", user: outsider._id },
          ],
        });
        await act(p, owner, "complete", {
          department: "dtf",
          confirmed: true,
          reason: "Printing finished",
        });
        assert.equal((await read(p)).status, "Pending Production");
        await act(p, outsider, "complete", {
          department: "embroidery",
          confirmed: true,
          reason: "Embroidery finished",
        });
        assert.equal((await read(p)).status, "Pending Quality Control");
      },
    );
    await t.test(
      "a revision cannot apply after the project has been concurrently cancelled",
      async () => {
        const p = await fixture();
        const stale = await read(p);
        const state = W.prepareWorkflow(stale);
        await Project.updateOne(
          { _id: p._id },
          { $set: { "cancellation.isCancelled": true } },
        );
        await assert.rejects(service.commit(stale, state), { status: 409 });
      },
    );
    await t.test(
      "snoozing is persistent and never changes production or the delivery date",
      async () => {
        const p = await fixture();
        await act(p, lead, "snooze");
        const saved = await read(p);
        assert.equal(saved.productionFollowUp.request.status, "required");
        assert.equal(saved.status, "Pending Production");
        assert.equal(saved.details.deliveryTime, "17:00");
        assert.ok(
          new Date(saved.productionFollowUp.request.nextLeadPromptAt) >
            new Date(),
        );
      },
    );
  },
);
