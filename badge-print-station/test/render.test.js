// test/render.test.js
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { renderToPdf } = require("../render");

test("renders a fixture to an exact 216x144pt (3x2in) PDF", async () => {
  const html =
    `<!doctype html><html><head><style>@page{size:3in 2in;margin:0}` +
    `html,body{margin:0}</style></head><body><div>x</div></body></html>`;
  const f = path.join(os.tmpdir(), "bps-fixture.html");
  fs.writeFileSync(f, html);
  const pdf = await renderToPdf("file://" + f);
  const info = execFileSync("pdfinfo", [pdf]).toString();
  assert.match(info, /216 x 144/);
}, { timeout: 30000 });
