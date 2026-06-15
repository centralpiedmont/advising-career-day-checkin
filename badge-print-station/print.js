// print.js — silent CUPS printing of an exact-size badge PDF
const { execFile } = require("child_process");

function mediaFor(label) {
  return label === "4x2.5" ? "Custom.4x2.5in" : "Custom.3x2in";
}
function buildLpArgs(printer, pdfPath, label) {
  return ["-d", printer, "-o", `media=${mediaFor(label)}`, pdfPath];
}
function print(printer, pdfPath, label) {
  return new Promise((resolve, reject) => {
    const args = buildLpArgs(printer, pdfPath, label);
    if (process.env.DRY_RUN === "1") return resolve({ dryRun: true, args });
    execFile("lp", args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve({ stdout: String(stdout) });
    });
  });
}
module.exports = { mediaFor, buildLpArgs, print };
