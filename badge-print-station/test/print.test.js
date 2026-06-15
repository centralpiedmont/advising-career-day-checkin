// test/print.test.js
const test = require("node:test");
const assert = require("node:assert");
const { mediaFor, buildLpArgs, print } = require("../print");

test("mediaFor maps the two label sizes", () => {
  assert.equal(mediaFor("3x2"), "Custom.3x2in");
  assert.equal(mediaFor("4x2.5"), "Custom.4x2.5in");
  assert.equal(mediaFor(undefined), "Custom.3x2in"); // default
});

test("buildLpArgs builds the lp argv", () => {
  assert.deepEqual(
    buildLpArgs("PRN", "/tmp/a.pdf", "3x2"),
    ["-d", "PRN", "-o", "media=Custom.3x2in", "/tmp/a.pdf"]
  );
});

test("print honors DRY_RUN (no lp invoked)", async () => {
  process.env.DRY_RUN = "1";
  const r = await print("PRN", "/tmp/a.pdf", "4x2.5");
  assert.ok(r.dryRun);
  assert.deepEqual(r.args, ["-d", "PRN", "-o", "media=Custom.4x2.5in", "/tmp/a.pdf"]);
  delete process.env.DRY_RUN;
});
