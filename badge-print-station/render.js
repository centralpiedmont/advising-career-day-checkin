// render.js — render a URL to a print PDF via headless Chrome
const { execFile } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const CHROME = process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Extra Chromium flags, space-separated. In a container set
// CHROME_FLAGS="--no-sandbox --disable-dev-shm-usage".
const EXTRA = (process.env.CHROME_FLAGS || "").split(/\s+/).filter(Boolean);

function renderToPdf(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `badge-${process.hrtime.bigint()}.pdf`);
    const args = [
      "--headless", "--disable-gpu", "--no-pdf-header-footer", ...EXTRA,
      "--virtual-time-budget=4000", `--print-to-pdf=${out}`, url,
    ];
    execFile(CHROME, args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      if (!fs.existsSync(out)) return reject(new Error("Chrome produced no PDF"));
      resolve(out);
    });
  });
}
module.exports = { renderToPdf };
