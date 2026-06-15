// test/server.test.js
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bps-srv-"));
process.env.DRY_RUN = "1";       // don't actually hit lp
process.env.PORT = "8099";
const { start } = require("../server");
const { renderToPdf } = require("../render");
const base = "http://127.0.0.1:8099";
let srv;

test.before(async () => { srv = await start(); });
test.after(() => srv.close());

test("/health responds ok", async () => {
  const r = await fetch(base + "/health");
  assert.equal(r.status, 200);
});

test("/api/config reports station mode + printer", async () => {
  const j = await (await fetch(base + "/api/config")).json();
  assert.equal(j.station, true);
  assert.ok(j.printer);
});

test("POST /print saves the record and reports ok (dry print)", async () => {
  const rec = { name: "Maria Gomez", email: "m@x.com", programs: ["Cybersecurity"], labelSize: "3x2" };
  const j = await (await fetch(base + "/print", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) })).json();
  assert.equal(j.ok, true);
  assert.ok(j.id);
  const leads = await (await fetch(base + "/api/leads")).json();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, "Maria Gomez");
}, { timeout: 30000 });

test("noPrint records save without rendering", async () => {
  const rec = { name: "Skip Person", email: "s@x.com", programs: [], noPrint: true };
  const j = await (await fetch(base + "/print", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) })).json();
  assert.equal(j.ok, true);
});

test("/export/leads.csv has header + rows", async () => {
  const t = await (await fetch(base + "/export/leads.csv")).text();
  assert.match(t, /Timestamp,Name,Email,Programs/);
  assert.match(t, /Maria Gomez/);
});

test("/?render= produces an exact 216x144pt badge PDF (full chain)", async () => {
  const rec = { name: "Maria Gomez", email: "x", programs: ["Cybersecurity", "Data Analytics"], labelSize: "3x2" };
  const b64 = Buffer.from(JSON.stringify(rec)).toString("base64");
  const pdf = await renderToPdf(`${base}/?render=${encodeURIComponent(b64)}&label=3x2`);
  const info = execFileSync("pdfinfo", [pdf]).toString();
  assert.match(info, /216 x 144/);
}, { timeout: 30000 });

test("/api/clear empties a list", async () => {
  await fetch(base + "/api/clear", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "student" }) });
  const leads = await (await fetch(base + "/api/leads")).json();
  assert.equal(leads.length, 0);
});
