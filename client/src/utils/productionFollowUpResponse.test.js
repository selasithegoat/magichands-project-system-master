import test from "node:test";
import assert from "node:assert/strict";
import { readProductionFollowUpResponse } from "./productionFollowUpResponse.js";

test("HTML 404 gives a backend availability message instead of a JSON parser error", async () => {
  await assert.rejects(readProductionFollowUpResponse(new Response("<!DOCTYPE html>Cannot GET", { status: 404 }), "Failed"), /backend needs to be updated or restarted/);
});
test("HTML gateway failures give a retry message", async () => {
  await assert.rejects(readProductionFollowUpResponse(new Response("<html>Bad gateway</html>", { status: 502 }), "Failed"), /temporarily unavailable/);
});
test("JSON permission failures preserve the server explanation", async () => {
  await assert.rejects(readProductionFollowUpResponse(Response.json({ message: "Not authorized" }, { status: 401 }), "Failed"), /Not authorized/);
});
test("successful responses preserve the projects", async () => {
  assert.deepEqual(await readProductionFollowUpResponse(Response.json({ projects: [] }), "Failed"), { projects: [] });
});
