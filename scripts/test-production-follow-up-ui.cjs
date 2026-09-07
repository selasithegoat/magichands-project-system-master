// Browser smoke test using installed Chrome/Edge; no live server or account is used.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const assert = require("node:assert/strict");
const esbuild = require("../client/node_modules/esbuild");

async function main() {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "client/node_modules/.cache/production-follow-up-smoke");
  fs.mkdirSync(output, { recursive: true });
  const browserBinary = process.env.BROWSER_TEST_BINARY || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (!fs.existsSync(browserBinary)) throw new Error("Set BROWSER_TEST_BINARY to an installed Chromium browser.");
  const project = {
    id: "507f1f77bcf86cd799439011", orderId: "MH-1042", name: "Launch event shirts", status: "Pending Production",
    deliveryAt: "2026-09-07T10:00:00Z", targetAt: "2026-09-04T10:00:00Z", revision: 1,
    plan: { startHour: 8, endHour: 17, workingDays: [1, 2, 3, 4, 5], holidays: [], qualityHours: 2, photographyHours: 1, packagingHours: 2, transportHours: 2, bufferHours: 2 },
    manager: true, reviewer: false, lead: true, leadName: "Project Lead", productionIncomplete: true, promptDue: true,
    tasks: [{ department: "dtf", scope: "100 event shirts: front and back prints", owner: "owner", ownerName: "Daniel", status: "pending", dueAt: "2026-09-04T10:00:00Z", overdue: true, escalated: true, downstreamHours: 0, candidates: [{ id: "owner", name: "Daniel" }] }],
    request: { number: 1, status: "required", deadlineAt: "2026-09-07T10:00:00Z" }, history: [], events: [],
  };
  const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {QueryClient, QueryClientProvider} from '@tanstack/react-query'; import ProductionFollowUp from './src/components/features/ProductionFollowUp.jsx';
    const role = new URLSearchParams(location.search).get('role') || 'lead';
    const project = ${JSON.stringify(project)};
    if(role === 'reviewer') { project.lead=false; project.reviewer=true; project.ownsReview=true; project.promptDue=true; project.request={number:1,status:'reviewing',reviewer:'reviewer',reviewerName:'Front Desk',reason:'Production delayed',remainingHours:4,proposedAt:'2026-09-12T17:00:00Z'}; }
    if(role === 'owner') { project.manager=false; project.lead=false; project.promptDue=false; project.request=null; project.tasks[0].canAct=true; }
    if(role === 'adminClient') { project.categories=['lead']; project.promptDue=false; }
    const visibleProjects = () => Array.from({length:role==='lead'?58:1}, (_,index) => ({...structuredClone(project), id:String(index+1).padStart(24,'0'), orderId:'MH-'+String(1042+index), name:index?('Production queue project '+(index+1)):project.name, promptDue:index<2?project.promptDue:false}));
    window.uiBackendUnavailable = role === 'unavailable';
    window.fetch = async (url, options={}) => { if(window.uiBackendUnavailable) return new Response('<!DOCTYPE html>Cannot GET', {status:404}); if(options.method==='POST') { window.lastAction={url,body:JSON.parse(options.body)}; if(url.includes('/snooze'))project.promptDue=false; if(url.includes('/request')){project.promptDue=false; project.request.status='submitted';} return {ok:true,json:async()=>({message:'Saved'})}; } return {ok:true,json:async()=>({projects:visibleProjects()})}; };
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><ProductionFollowUp user={{_id:role,role:role==='adminClient'?'admin':'user'}} requestSource={role==='reviewer'?'admin':'client'} /></QueryClientProvider>);`;
  await esbuild.build({ stdin: { contents: entry, resolveDir: path.join(root, "client"), loader: "jsx" }, bundle: true, outfile: path.join(output, "app.js"), define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/app.")) {
      const file = req.url.split("?")[0]; res.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : "text/javascript"); res.end(fs.readFileSync(path.join(output, path.basename(file))));
    } else { res.setHeader("Content-Type", "text/html"); res.end('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{font-family:Arial;margin:0;background:#f1f5f9}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const browser = spawn(browserBinary, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${path.join(output, `profile-${process.pid}`)}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "", websocket;
  try {
    const debuggerUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Browser startup timed out: ${stderr}`)), 20000);
      browser.on("error", reject);
      browser.stderr.on("data", (data) => { stderr += data; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    const address = new URL(debuggerUrl);
    const tabs = await (await fetch(`http://${address.host}/json/list`)).json();
    websocket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
    await once(websocket, "open");
    const pending = new Map(); let sequence = 0;
    websocket.addEventListener("message", (event) => { const payload = JSON.parse(event.data); if (pending.has(payload.id)) { const {resolve, reject} = pending.get(payload.id); pending.delete(payload.id); payload.error ? reject(new Error(payload.error.message)) : resolve(payload.result); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, {resolve,reject}); websocket.send(JSON.stringify({id,method,params})); });
    const evaluate = async (expression) => { const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw new Error(value.exceptionDetails.text); return value.result.value; };
    const waitFor = async (expression) => { for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error(`UI condition timed out: ${expression}`); };
    const navigate = async (role) => { await send("Page.navigate", {url:`http://127.0.0.1:${server.address().port}/?role=${role}`}); await waitFor("document.querySelector('.pf-banner button') !== null"); };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {width:1366,height:900,deviceScaleFactor:1,mobile:false});
    await navigate("lead"); await waitFor("document.querySelector('dialog').open");
    assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('Delivery deadline missed')"), true);
    assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('Suggested delivery date')"), false);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Apply communicated'))"), false);
    assert.equal(await evaluate("document.querySelector('.pf-main').scrollHeight > document.querySelector('.pf-main').clientHeight"), true);
    assert.equal(await evaluate("document.querySelector('.pf-queue nav').scrollHeight > document.querySelector('.pf-queue nav').clientHeight"), true);
    await send("Input.dispatchMouseEvent", {type:"mouseWheel", x:1000, y:650, deltaX:0, deltaY:520});
    await waitFor("document.querySelector('.pf-main').scrollTop > 0");
    await send("Input.dispatchMouseEvent", {type:"mouseWheel", x:180, y:650, deltaX:0, deltaY:520});
    await waitFor("document.querySelector('.pf-queue nav').scrollTop > 0");
    fs.writeFileSync(path.join(output, "lead-desktop.png"), Buffer.from((await send("Page.captureScreenshot", {format:"png"})).data,"base64"));
    assert.equal(await evaluate("[...document.querySelectorAll('.pf-header button')].some(b=>b.textContent==='Close')"), true);
    await evaluate("[...document.querySelectorAll('.pf-header button')].find(b=>b.textContent==='Close').click()"); await waitFor("!document.querySelector('dialog').open");
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(await evaluate("document.querySelector('dialog').open"), false);
    assert.equal(await evaluate("window.lastAction === undefined"), true);
    await evaluate("document.querySelector('.pf-banner button').click()"); await waitFor("document.querySelector('dialog').open");
    await evaluate("[...document.querySelectorAll('.pf-header button')].find(b=>b.textContent.includes('Remind me')).click()"); await waitFor("!document.querySelector('dialog').open");
    assert.match(await evaluate("window.lastAction.url"), /snooze/);
    await navigate("reviewer"); await evaluate("document.querySelector('.pf-banner button').click()"); await waitFor("document.querySelector('dialog').open");
    assert.equal(await evaluate("document.querySelectorAll('.pf-category-tabs [role=tab]').length"), 3);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Apply communicated')).disabled"), true);
    fs.writeFileSync(path.join(output, "reviewer-admin.png"), Buffer.from((await send("Page.captureScreenshot", {format:"png"})).data,"base64"));
    assert.equal(await evaluate("document.querySelector('.pf-close').textContent"), "Close");
    await evaluate("document.querySelector('.pf-close').click()"); await waitFor("!document.querySelector('dialog').open");
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(await evaluate("document.querySelector('dialog').open"), false);
    await navigate("adminClient"); await evaluate("document.querySelector('.pf-banner button').click()"); await waitFor("document.querySelector('dialog').open");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.pf-category-tabs [role=tab]')].map(tab=>tab.textContent.replace(/\\d+$/, ''))"), ["LLead", "FFront Desk"]);
    assert.equal(await evaluate("[...document.querySelectorAll('.pf-category-tabs [role=tab]')].some(tab=>tab.textContent.includes('Production'))"), false);
    await navigate("owner"); await evaluate("document.querySelector('.pf-banner button').click()"); await waitFor("document.querySelector('dialog').open");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Complete my work')"), true);
    assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('Record client communication')"), false);
    await send("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate("document.querySelector('dialog').getBoundingClientRect().width <= 390"), true);
    fs.writeFileSync(path.join(output, "owner-mobile.png"), Buffer.from((await send("Page.captureScreenshot", {format:"png"})).data,"base64"));
    await navigate("unavailable");
    await waitFor("document.querySelector('.pf-banner').textContent.includes('backend needs to be updated or restarted')");
    assert.equal(await evaluate("document.body.textContent.includes('Unexpected token')"), false);
    await evaluate("window.uiBackendUnavailable=false; document.querySelector('.pf-banner button').click()");
    await waitFor("document.querySelector('.pf-banner [role=status]') === null && document.querySelector('dialog').open");
    console.log(`Browser smoke passed: Lead request ownership, unconditional Admin close, Client-portal Admin Lead/Front Desk views, independent queue/workspace wheel scrolling, recurring dialog, reviewer gate, owner controls, mobile layout, HTML 404 handling and recovery. Screenshots: ${output}`);
  } finally {
    websocket?.close();
    if (browser.exitCode === null) { const exit = once(browser,"exit"); browser.kill(); await exit; }
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode=1; });
