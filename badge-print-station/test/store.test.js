// test/store.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bps-store-"));
const store = require("../store");

test("append assigns id + ts and persists", () => {
  const r = store.append("student", { name: "Maria", email: "m@x.com", programs: ["Cybersecurity"] });
  assert.ok(r.id); assert.ok(r.ts);
  const all = store.load("student");
  assert.equal(all.length, 1);
  assert.equal(all[0].name, "Maria");
});

test("getById returns the record", () => {
  const r = store.append("student", { name: "X", email: "x", programs: [] });
  assert.equal(store.getById("student", r.id).name, "X");
});

test("staff csv has header + row", () => {
  store.clear("staff");
  store.append("staff", { kind: "staff", name: "Fra", role: "Faculty", org: "CP" });
  const c = store.csv("staff");
  assert.match(c, /Timestamp,Name,Role,Organization/);
  assert.match(c, /Faculty/);
});

test("clear empties a list", () => {
  store.clear("student");
  assert.equal(store.load("student").length, 0);
});

test("unknown kind throws", () => {
  assert.throws(() => store.load("nope"));
});
