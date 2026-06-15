// server.js — serves the kiosk + print/data API for the badge station
const http = require("http");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const render = require("./render");
const printer = require("./print");

function loadConfig() {
  const def = { port: 8088, printer: "_4BARCODE_4B_2054N", labelSize: "3x2",
    chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" };
  try { return { ...def, ...JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")) }; }
  catch (e) { return def; }
}
const cfg = loadConfig();
if (cfg.chromePath) process.env.CHROME_PATH = process.env.CHROME_PATH || cfg.chromePath;
const PORT = Number(process.env.PORT) || cfg.port;
const ROOT = path.join(__dirname, "..");          // serve the repo-root kiosk + icon

const MIME = { ".html": "text/html", ".png": "image/png" };
const STATIC = { "/": "index.html", "/index.html": "index.html", "/icon.png": "icon.png" };

function send(res, code, type, body) { res.writeHead(code, { "Content-Type": type }); res.end(body); }
function json(res, code, obj) { send(res, code, "application/json", JSON.stringify(obj)); }
function readBody(req) { return new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); }); }
function kindOf(rec) { return rec && rec.kind === "staff" ? "staff" : "student"; }

async function renderAndPrint(rec) {
  const label = rec.labelSize || cfg.labelSize;
  const b64 = Buffer.from(JSON.stringify(rec)).toString("base64");
  const url = `http://127.0.0.1:${PORT}/?render=${encodeURIComponent(b64)}&label=${label}`;
  const pdf = await render.renderToPdf(url);
  const opts = { printSpeed: cfg.printSpeed, darkness: cfg.darkness, mediaMethod: cfg.mediaMethod };
  try { await printer.print(cfg.printer, pdf, label, opts); }
  finally { try { fs.unlinkSync(pdf); } catch (e) {} }
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const p = u.pathname;

    if (req.method === "GET" && STATIC[p]) {
      const f = path.join(ROOT, STATIC[p]);
      return send(res, 200, MIME[path.extname(f)] || "application/octet-stream", fs.readFileSync(f));
    }
    if (req.method === "GET" && p === "/health") return json(res, 200, { ok: true });
    if (req.method === "GET" && p === "/api/config")
      return json(res, 200, { station: true, printer: cfg.printer, labelSize: cfg.labelSize });
    if (req.method === "GET" && p === "/api/leads") return json(res, 200, store.load("student"));
    if (req.method === "GET" && p === "/api/staff") return json(res, 200, store.load("staff"));
    if (req.method === "GET" && (p === "/export/leads.csv" || p === "/export/staff.csv")) {
      const kind = p.includes("staff") ? "staff" : "student";
      res.writeHead(200, { "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="advising-career-day-${kind}.csv"` });
      return res.end(store.csv(kind));
    }
    if (req.method === "POST" && p === "/print") {
      const rec = JSON.parse(await readBody(req));
      const saved = store.append(kindOf(rec), rec);     // SAVE FIRST — never lose a check-in
      if (rec.noPrint) return json(res, 200, { ok: true, id: saved.id });
      try { await renderAndPrint(saved); return json(res, 200, { ok: true, id: saved.id }); }
      catch (e) { return json(res, 200, { ok: false, id: saved.id, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && p === "/api/reprint") {
      const { kind, id } = JSON.parse(await readBody(req));
      const rec = store.getById(kind === "staff" ? "staff" : "student", id);
      if (!rec) return json(res, 404, { ok: false, error: "not found" });
      try { await renderAndPrint(rec); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); }
    }
    if (req.method === "POST" && p === "/api/clear") {
      const { kind } = JSON.parse(await readBody(req));
      store.clear(kind === "staff" ? "staff" : "student");
      return json(res, 200, { ok: true });
    }
    json(res, 404, { ok: false, error: "not found" });
  } catch (e) { json(res, 500, { ok: false, error: String(e.message || e) }); }
});

function start() { return new Promise((r) => server.listen(PORT, () => r(server))); }
if (require.main === module) start().then(() => console.log(`Badge station on http://localhost:${PORT}`));
module.exports = { start };
