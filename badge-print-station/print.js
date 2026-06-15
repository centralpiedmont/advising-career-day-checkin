// print.js — silent CUPS printing of an exact-size badge PDF
const { execFile } = require("child_process");

function mediaFor(label) {
  return label === "4x2.5" ? "Custom.4x2.5in" : "Custom.3x2in";
}
// opts (all optional): { printSpeed, darkness, mediaMethod } — quality tuning for the
// 203-dpi thermal printer. Slower speed + tuned darkness print crisper.
function buildLpArgs(printer, pdfPath, label, opts = {}) {
  const args = ["-d", printer, "-o", `media=${mediaFor(label)}`];
  if (opts.printSpeed) args.push("-o", `PrintSpeed=${opts.printSpeed}`);
  if (opts.darkness != null && opts.darkness !== "") args.push("-o", `Darkness=${opts.darkness}`);
  if (opts.mediaMethod) args.push("-o", `MediaMethod=${opts.mediaMethod}`);
  args.push(pdfPath);
  return args;
}
function print(printer, pdfPath, label, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = buildLpArgs(printer, pdfPath, label, opts);
    if (process.env.DRY_RUN === "1") return resolve({ dryRun: true, args });
    execFile("lp", args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve({ stdout: String(stdout) });
    });
  });
}
module.exports = { mediaFor, buildLpArgs, print };
