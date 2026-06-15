# Badge Print Station Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small Node app on the Mac that serves the existing kiosk to the iPad, receives each check-in, and prints the badge silently to the off-brand `_4BARCODE_4B_2054N` label printer via CUPS.

**Architecture:** One codebase, two modes. The Mac serves the *same* `index.html`; on load the page fetches `/api/config` and, if present, enters "station mode" (Print → `POST /print`, data via server API) instead of standalone mode (`window.print` + localStorage). The server saves each record to flat JSON, renders the badge to an exact-size PDF by pointing headless Chrome at its own `/?render=…` URL (so the printed badge is byte-identical to the on-screen one), then prints via `lp`.

**Tech Stack:** Node.js (stdlib only — `http`, `fs`, `child_process`, `crypto`), Google Chrome headless (`--print-to-pdf`), CUPS `lp`, `node:test` for tests, `pdfinfo` for size assertions. Optional: `cloudflared` (public tunnel), `qrencode` (terminal QR).

---

## Distribution

The station ships **inside the existing repo** (`centralpiedmont/advising-career-day-checkin`). Because `server.js` serves the repo's own root `index.html`, a single `git clone` gives someone the kiosk *and* the station with no file duplication or drift. To run it on any Mac:

```bash
git clone https://github.com/centralpiedmont/advising-career-day-checkin.git
cd advising-career-day-checkin/badge-print-station
npm start            # or double-click start.command
```

## File Structure

All new files live in `badge-print-station/` inside the existing CheckIn repo. The kiosk `index.html` and `icon.png` stay at the repo root and are served by the station (`ROOT = path.join(__dirname, "..")`).

| File | Responsibility |
|---|---|
| `badge-print-station/config.json` | `{ port, printer, labelSize, chromePath }` defaults. |
| `badge-print-station/store.js` | Flat-file record storage (atomic writes) + CSV. |
| `badge-print-station/print.js` | `lp` argv builder + silent print (honors `DRY_RUN`). |
| `badge-print-station/render.js` | Render a URL to an exact-size PDF via headless Chrome. |
| `badge-print-station/server.js` | HTTP server tying it together; serves the kiosk + API. |
| `badge-print-station/start.command` | Double-click launcher: server + LAN URL + optional QR/tunnel. |
| `badge-print-station/README.md` | Setup + run instructions for the event laptop. |
| `badge-print-station/test/*.test.js` | `node:test` unit + integration tests. |
| `index.html` (repo root) | Add station-mode detection, server print path, retry queue, `/?render=` mode. Standalone behavior unchanged. |

`data/` (record JSON) and `*.pdf`/`*.tmp` temp files are git-ignored.

---

### Task 1: Scaffold the station folder

**Files:**
- Create: `badge-print-station/config.json`
- Create: `badge-print-station/package.json`
- Create: `badge-print-station/.gitignore`

- [ ] **Step 1: Create `config.json`**

```json
{
  "port": 8088,
  "printer": "_4BARCODE_4B_2054N",
  "labelSize": "3x2",
  "chromePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
}
```

- [ ] **Step 2: Create `package.json`** (CommonJS, no dependencies)

```json
{
  "name": "badge-print-station",
  "version": "1.0.0",
  "private": true,
  "description": "Mac print server for the Advising & Career Day badge kiosk",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
data/
*.pdf
*.tmp
```

- [ ] **Step 4: Commit**

```bash
git add badge-print-station/config.json badge-print-station/package.json badge-print-station/.gitignore
git commit -m "scaffold badge-print-station"
```

---

### Task 2: Record store (`store.js`)

**Files:**
- Create: `badge-print-station/store.js`
- Test: `badge-print-station/test/store.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd badge-print-station && node --test test/store.test.js`
Expected: FAIL — `Cannot find module '../store'`.

- [ ] **Step 3: Write `store.js`**

```js
// store.js — flat-file record storage with atomic writes + CSV
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILES = { student: "leads.json", staff: "staff.json" };

function fileFor(kind) {
  if (!FILES[kind]) throw new Error(`unknown kind: ${kind}`);
  return path.join(DATA_DIR, FILES[kind]);
}
function load(kind) {
  try { return JSON.parse(fs.readFileSync(fileFor(kind), "utf8")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function append(kind, rec) {
  const list = load(kind);
  const full = { id: crypto.randomUUID(), ts: new Date().toISOString(), ...rec };
  list.push(full);
  writeAtomic(fileFor(kind), list);
  return full;
}
function getById(kind, id) { return load(kind).find((r) => r.id === id) || null; }
function clear(kind) { writeAtomic(fileFor(kind), []); }

function csv(kind) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const list = load(kind);
  if (kind === "staff") {
    return "Timestamp,Name,Role,Organization\n" +
      list.map((r) => [q(r.ts), q(r.name), q(r.role), q(r.org)].join(",")).join("\n");
  }
  return "Timestamp,Name,Email,Programs\n" +
    list.map((r) => [q(r.ts), q(r.name), q(r.email), q((r.programs || []).join("; "))].join(",")).join("\n");
}
module.exports = { load, append, getById, clear, csv, fileFor };
```

Note: `load` returns `[]` only for a missing file; a corrupt/unreadable file re-throws so problems are loud, and the "unknown kind throws" test passes (via `fileFor`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd badge-print-station && node --test test/store.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add badge-print-station/store.js badge-print-station/test/store.test.js
git commit -m "feat(station): record store with atomic writes + CSV"
```

---

### Task 3: Print command (`print.js`)

**Files:**
- Create: `badge-print-station/print.js`
- Test: `badge-print-station/test/print.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd badge-print-station && node --test test/print.test.js`
Expected: FAIL — `Cannot find module '../print'`.

- [ ] **Step 3: Write `print.js`**

```js
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
```

Note: the PDF is generated at the exact media size (Task 4), so we pass `media=` without `fit-to-page` to print 1:1. If a future printer clips edges, add `-o fit-to-page`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd badge-print-station && node --test test/print.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add badge-print-station/print.js badge-print-station/test/print.test.js
git commit -m "feat(station): lp print command builder"
```

---

### Task 4: PDF renderer (`render.js`)

**Files:**
- Create: `badge-print-station/render.js`
- Test: `badge-print-station/test/render.test.js`

- [ ] **Step 1: Write the failing test** (renders a fixture HTML, asserts exact 3×2 page)

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd badge-print-station && node --test test/render.test.js`
Expected: FAIL — `Cannot find module '../render'`.

- [ ] **Step 3: Write `render.js`**

```js
// render.js — render a URL to a print PDF via headless Chrome
const { execFile } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const CHROME = process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function renderToPdf(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `badge-${process.hrtime.bigint()}.pdf`);
    const args = [
      "--headless", "--disable-gpu", "--no-pdf-header-footer",
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd badge-print-station && node --test test/render.test.js`
Expected: PASS (1 test). Requires Chrome + `pdfinfo` (both present).

- [ ] **Step 5: Commit**

```bash
git add badge-print-station/render.js badge-print-station/test/render.test.js
git commit -m "feat(station): headless-Chrome PDF renderer"
```

---

### Task 5: Station mode in `index.html`

The kiosk gains: config detection, a server print path, a `/?render=` mode (so the Mac renders the real badge), an offline retry queue, and server-backed admin. Standalone (GitHub Pages) behavior is preserved because every server call is guarded by `STATION`.

**Files:**
- Modify: `index.html` (repo root)

- [ ] **Step 1: Add the offline banner element**

Find:

```html
<div class="toast" id="toast"></div>
```

Replace with:

```html
<div class="toast" id="toast"></div>
<div class="toast" id="offline" style="background:#8A2432">⚠️ Can’t reach the print station — check-ins are saved and will print when reconnected.</div>
```

Add this CSS — find:

```css
.toast.show{transform:translateX(-50%) translateY(0)}
```

Replace with:

```css
.toast.show{transform:translateX(-50%) translateY(0)}
#offline{bottom:90px}
#offline.show{transform:translateX(-50%) translateY(0)}
```

- [ ] **Step 2: Add station state**

Find:

```js
let adminView = "students";
```

Replace with:

```js
let adminView = "students";
let STATION = null;            // server config object when served by the Mac station
const QUEUE_KEY = "acd-queue-2026";
```

- [ ] **Step 3: Add server + queue helpers**

Find:

```js
function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
```

Replace with:

```js
function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---- station mode: send records to the Mac instead of window.print/localStorage ---- */
async function postPrint(rec){
  const r = await fetch("/print", { method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ ...rec, labelSize: curLabel() }) });
  if(!r.ok) throw new Error("server " + r.status);
  const j = await r.json();
  if(!j.ok && j.error) throw new Error(j.error);   // record was still saved server-side
  return j;
}
function enqueue(rec){
  let q; try{ q = JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }catch(e){ q = []; }
  q.push({ ...rec, labelSize: curLabel() });
  try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }catch(e){}
}
async function flushQueue(){
  if(!STATION) return;
  let q; try{ q = JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }catch(e){ q = []; }
  if(!q.length) return;
  const left = [];
  for(const rec of q){ try{ await postPrint(rec); }catch(e){ left.push(rec); } }
  try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(left)); }catch(e){}
  $("#offline").classList.toggle("show", left.length > 0);
}
```

- [ ] **Step 4: Branch the student Print and Skip handlers**

Find:

```js
$("#printBtn").addEventListener("click", () => {
  renderBadge($("#badgePrint"), pendingLead);
  commitLead(pendingLead);
  window.print();          // AirPrint dialog; lead already saved
  finishCheckin();
});
$("#skipPrint").addEventListener("click", () => { commitLead(pendingLead); finishCheckin(); });
```

Replace with:

```js
$("#printBtn").addEventListener("click", async () => {
  if(STATION){
    try{ await postPrint(pendingLead); $("#offline").classList.remove("show"); }
    catch(e){ enqueue(pendingLead); $("#offline").classList.add("show"); }
    finishCheckin();
  } else {
    renderBadge($("#badgePrint"), pendingLead);
    commitLead(pendingLead);
    window.print();          // AirPrint dialog; lead already saved
    finishCheckin();
  }
});
$("#skipPrint").addEventListener("click", async () => {
  if(STATION){
    const rec = { ...pendingLead, noPrint:true };
    try{ await postPrint(rec); }catch(e){ enqueue(rec); }
    finishCheckin();
  } else { commitLead(pendingLead); finishCheckin(); }
});
```

- [ ] **Step 5: Branch the staff Print handler**

Find:

```js
$("#staffPrint").addEventListener("click", () => {
  const name = $("#sName").value.trim();
  const role = staffRole.trim();
  let ok = true;
  $("#errSName").textContent = name ? "" : "Please enter a name."; ok = ok && !!name;
  $("#errSRole").textContent = role ? "" : "Pick or type a role."; ok = ok && !!role;
  if(!ok) return;
  pendingStaff = { kind:"staff", ts:new Date().toISOString(), name, role, org:$("#sOrg").value.trim() };
  renderStaffBadge($("#badgePrint"), pendingStaff);
  const list = loadStaff(); list.push(pendingStaff); saveStaff(list);
  window.print();
  $("#doneName").textContent = `Nametag printed for ${name.split(/\s+/)[0]}!`;
  $("#done").classList.add("show");
  setTimeout(() => { $("#done").classList.remove("show"); resetStaff(); show("#welcome"); }, 3000);
});
```

Replace with:

```js
$("#staffPrint").addEventListener("click", async () => {
  const name = $("#sName").value.trim();
  const role = staffRole.trim();
  let ok = true;
  $("#errSName").textContent = name ? "" : "Please enter a name."; ok = ok && !!name;
  $("#errSRole").textContent = role ? "" : "Pick or type a role."; ok = ok && !!role;
  if(!ok) return;
  pendingStaff = { kind:"staff", ts:new Date().toISOString(), name, role, org:$("#sOrg").value.trim() };
  if(STATION){
    try{ await postPrint(pendingStaff); $("#offline").classList.remove("show"); }
    catch(e){ enqueue(pendingStaff); $("#offline").classList.add("show"); }
  } else {
    renderStaffBadge($("#badgePrint"), pendingStaff);
    const list = loadStaff(); list.push(pendingStaff); saveStaff(list);
    window.print();
  }
  $("#doneName").textContent = `Nametag printed for ${name.split(/\s+/)[0]}!`;
  $("#done").classList.add("show");
  setTimeout(() => { $("#done").classList.remove("show"); resetStaff(); show("#welcome"); }, 3000);
});
```

- [ ] **Step 6: Make admin data-source aware**

Find:

```js
function renderAdmin(view){
  if(view) adminView = view;
  const leads = loadLeads();
  const staff = loadStaff();
```

Replace with:

```js
async function renderAdmin(view){
  if(view) adminView = view;
  const leads = STATION ? await fetch("/api/leads").then(r=>r.json()).catch(()=>[]) : loadLeads();
  const staff = STATION ? await fetch("/api/staff").then(r=>r.json()).catch(()=>[]) : loadStaff();
```

- [ ] **Step 7: Route admin reprint/delete, export, and clear to the server**

Find (student row buttons):

```js
  $("#leadTable").querySelectorAll(".rowbtn").forEach(b => b.addEventListener("click", () => {
    const leads = loadLeads(); const i = +b.dataset.i;
    if(b.dataset.act === "reprint"){ paintBadge($("#badgePrint"), leads[i]); window.print(); }
    else { leads.splice(i,1); saveLeads(leads); renderAdmin(); }
  }));
```

Replace with:

```js
  $("#leadTable").querySelectorAll(".rowbtn").forEach(b => b.addEventListener("click", async () => {
    if(STATION){
      const list = await fetch("/api/leads").then(r=>r.json()).catch(()=>[]); const rec = list[+b.dataset.i];
      if(!rec) return;
      if(b.dataset.act === "reprint"){ await fetch("/api/reprint",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"student",id:rec.id})}); }
      else { /* delete not supported server-side in v1 */ toast("Delete a single record on the Mac; use Clear to reset."); }
      return;
    }
    const leads = loadLeads(); const i = +b.dataset.i;
    if(b.dataset.act === "reprint"){ paintBadge($("#badgePrint"), leads[i]); window.print(); }
    else { leads.splice(i,1); saveLeads(leads); renderAdmin(); }
  }));
```

Find (staff row buttons):

```js
  $("#leadTable").querySelectorAll(".rowbtn").forEach(b => b.addEventListener("click", () => {
    const staff = loadStaff(); const i = +b.dataset.i;
    if(b.dataset.act === "reprint"){ paintBadge($("#badgePrint"), staff[i]); window.print(); }
    else { staff.splice(i,1); saveStaff(staff); renderAdmin(); }
  }));
```

Replace with:

```js
  $("#leadTable").querySelectorAll(".rowbtn").forEach(b => b.addEventListener("click", async () => {
    if(STATION){
      const list = await fetch("/api/staff").then(r=>r.json()).catch(()=>[]); const rec = list[+b.dataset.i];
      if(!rec) return;
      if(b.dataset.act === "reprint"){ await fetch("/api/reprint",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"staff",id:rec.id})}); }
      else { toast("Delete a single record on the Mac; use Clear to reset."); }
      return;
    }
    const staff = loadStaff(); const i = +b.dataset.i;
    if(b.dataset.act === "reprint"){ paintBadge($("#badgePrint"), staff[i]); window.print(); }
    else { staff.splice(i,1); saveStaff(staff); renderAdmin(); }
  }));
```

Find (export handler body start):

```js
$("#exportCsv").addEventListener("click", () => {
  const q = v => `"${String(v).replace(/"/g,'""')}"`;
```

Replace with:

```js
$("#exportCsv").addEventListener("click", () => {
  if(STATION){ location.href = adminView === "staff" ? "/export/staff.csv" : "/export/leads.csv"; return; }
  const q = v => `"${String(v).replace(/"/g,'""')}"`;
```

Find (clear confirm handler):

```js
$("#clearYes").addEventListener("click", () => {
  localStorage.removeItem(adminView === "staff" ? STAFF_KEY : STORE_KEY);
  $("#confirmClear").classList.remove("show");
  renderAdmin();
  toast(adminView === "staff" ? "All staff nametags cleared." : "All student leads cleared.");
});
```

Replace with:

```js
$("#clearYes").addEventListener("click", async () => {
  if(STATION){ await fetch("/api/clear",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind: adminView === "staff" ? "staff" : "student"})}); }
  else { localStorage.removeItem(adminView === "staff" ? STAFF_KEY : STORE_KEY); }
  $("#confirmClear").classList.remove("show");
  renderAdmin();
  toast(adminView === "staff" ? "All staff nametags cleared." : "All student leads cleared.");
});
```

- [ ] **Step 8: Add init + render mode at the end of the script**

Find:

```js
/* apply the saved label size on load (sets preview aspect, @page size, hints) */
applyLabel(curLabel());
</script>
```

Replace with:

```js
/* apply the saved label size on load (sets preview aspect, @page size, hints) */
applyLabel(curLabel());

/* station mode: detect the Mac server, retry the offline queue periodically */
async function initStation(){
  try{
    const r = await fetch("/api/config", { cache:"no-store" });
    if(r.ok){
      STATION = await r.json();
      if(STATION.labelSize) applyLabel(STATION.labelSize);
      flushQueue(); setInterval(flushQueue, 15000);
      window.addEventListener("online", flushQueue);
    }
  }catch(e){ STATION = null; }   // standalone (GitHub Pages) — keep window.print + localStorage
}

/* render mode: the Mac points headless Chrome at /?render=<base64 record>&label=.. */
const _rp = new URLSearchParams(location.search);
if(_rp.has("render")){
  try{
    const rec = JSON.parse(decodeURIComponent(escape(atob(_rp.get("render")))));
    if(_rp.get("label")) applyLabel(_rp.get("label"));
    paintBadge($("#badgePrint"), rec);
  }catch(e){ /* leave page blank on bad input */ }
} else {
  initStation();
}
</script>
```

- [ ] **Step 9: Sanity-check standalone mode still works**

Run: `cd /Users/frazier/Documents/Administrative/CheckIn && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --window-size=1180,820 --screenshot=qa-standalone.png --virtual-time-budget=5000 "file://$PWD/index.html"`
Expected: a normal welcome screenshot (the `/api/config` fetch fails on a `file://` load, so `STATION` stays null). Open `qa-standalone.png` to confirm, then `rm qa-standalone.png`.

- [ ] **Step 10: Commit**

```bash
git add index.html
git commit -m "feat: station mode in kiosk (server print, retry queue, render mode)"
```

---

### Task 6: HTTP server (`server.js`)

**Files:**
- Create: `badge-print-station/server.js`
- Test: `badge-print-station/test/server.test.js`

- [ ] **Step 1: Write the failing integration test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd badge-print-station && node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../server'`.

- [ ] **Step 3: Write `server.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd badge-print-station && node --test test/server.test.js`
Expected: PASS (7 tests). Runs Chrome for the render tests (~4s each).

- [ ] **Step 5: Run the whole suite**

Run: `cd badge-print-station && node --test`
Expected: all tests across store/print/render/server PASS.

- [ ] **Step 6: Commit**

```bash
git add badge-print-station/server.js badge-print-station/test/server.test.js
git commit -m "feat(station): HTTP server (kiosk + print/data API)"
```

---

### Task 7: Launcher + README

**Files:**
- Create: `badge-print-station/start.command`
- Create: `badge-print-station/README.md`

- [ ] **Step 1: Write `start.command`**

```bash
#!/bin/bash
# Double-click to launch the Badge Print Station.
cd "$(dirname "$0")" || exit 1

PORT=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync("config.json")).port||8088))}catch(e){process.stdout.write("8088")}')
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)
URL="http://$IP:$PORT"

echo "Starting Badge Print Station…"
node server.js &
SRV=$!
sleep 1

echo ""
echo "  Open this on the iPad (same Wi-Fi):"
echo "      $URL"
echo ""
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$URL"
else
  echo "  (Optional: 'brew install qrencode' to show a scannable QR code here.)"
fi
echo ""

if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting Cloudflare tunnel (public HTTPS URL — use this if the iPad can't reach the LAN URL):"
  cloudflared tunnel --url "http://localhost:$PORT"
else
  echo "  (Optional: 'brew install cloudflared' to expose a public HTTPS URL when device-to-device Wi-Fi is blocked.)"
  echo ""
  echo "Press Ctrl-C to stop the station."
  wait $SRV
fi
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x badge-print-station/start.command`

- [ ] **Step 3: Write `README.md`**

```markdown
# Badge Print Station (Mac)

Serves the Advising & Career Day kiosk to the iPad and prints badges silently to the
label printer — for printers that don't support AirPrint (e.g. the 4Barcode 4B-2054N).

## Get it
```bash
git clone https://github.com/centralpiedmont/advising-career-day-checkin.git
cd advising-career-day-checkin/badge-print-station
```

## One-time setup
1. Install **Node.js** (LTS) and **Google Chrome**.
2. Install the label printer's driver and **register your custom label size** in its
   macOS/CUPS settings. Confirm the queue name with `lpstat -p` and put it in
   `config.json` as `"printer"` (default `_4BARCODE_4B_2054N`).
3. Set `"labelSize"` in `config.json` to `"3x2"` or `"4x2.5"`.
4. (Optional) `brew install qrencode` for a scannable QR, and/or
   `brew install cloudflared` to expose a public HTTPS URL.

## Run it
Double-click **`start.command`** (or `npm start`). It prints the URL to open on the iPad
(and a QR / tunnel URL if those tools are installed). On the iPad, open that URL in Safari.

## How it works
- The Mac serves the same kiosk; the iPad just opens the URL. Each check-in is **POSTed**
  to the Mac, **saved to `data/`**, rendered to an exact-size PDF, and printed via `lp`.
- Records are saved **before** printing, so a printer jam never loses a check-in.
- If the iPad briefly loses the connection, check-ins queue on the iPad and retry.

## Get the data
In the kiosk's ⚙ admin panel, **Export CSV** downloads the combined list straight from the
Mac (one file for all iPads). `data/leads.json` and `data/staff.json` hold the raw records.

## Tests
`npm test` (needs Chrome + `pdfinfo`).
```

- [ ] **Step 4: Commit**

```bash
git add badge-print-station/start.command badge-print-station/README.md
git commit -m "feat(station): launcher + README"
```

---

### Task 8: End-to-end verification (real hardware)

**Files:** none (manual checklist).

- [ ] **Step 1: Start the station**

Run: `cd badge-print-station && npm start`
Expected: `Badge station on http://localhost:8088`.

- [ ] **Step 2: Confirm the kiosk + config from another device/browser**

Run: `curl -s http://localhost:8088/api/config`
Expected: `{"station":true,"printer":"_4BARCODE_4B_2054N","labelSize":"3x2"}`.

- [ ] **Step 3: Print a real badge end-to-end**

Open `http://<mac-ip>:8088` on the iPad (or a browser), check in a test student, tap Print.
Expected: a label prints on the 4B-2054N at the configured size; `data/leads.json` gains the record; the admin panel shows it and **Export CSV** downloads it.

- [ ] **Step 4: Verify resilience**

Stop the server, check someone in on the iPad → the offline banner shows and the record
queues. Restart the server → within ~15s the queued badge prints and the banner clears.

- [ ] **Step 5: Commit any config tweaks discovered during the live test**

```bash
git add badge-print-station/config.json
git commit -m "chore(station): event printer/label config"
```

---

### Task 9: Package & distribute via the GitHub repo

**Files:**
- Modify: `README.md` (repo root)

- [ ] **Step 1: Add a pointer from the main README**

Find (in the repo-root `README.md`, the Editing section near the end):

```markdown
Companion signage system: `../AdvisingAndCareerDay/` (same track colors).
```

Replace with:

```markdown
Companion signage system: `../AdvisingAndCareerDay/` (same track colors).

## Printing on a non-AirPrint label printer (Mac station)
For printers without AirPrint (e.g. the 4Barcode 4B-2054N), run the **Badge Print
Station** in [`badge-print-station/`](badge-print-station/): the Mac serves this same
kiosk to the iPad and prints badges silently over USB. Clone this repo, then
`cd badge-print-station && npm start`. See its README for setup.
```

- [ ] **Step 2: Commit the pointer**

```bash
git add README.md
git commit -m "docs: link the Mac print station from the main README"
```

- [ ] **Step 3: Push everything to GitHub**

Run: `git push`
Expected: all station commits land on `centralpiedmont/advising-career-day-checkin`.

- [ ] **Step 4: Fresh-clone smoke test (proves it distributes cleanly)**

```bash
cd /tmp && rm -rf acd-clonetest && git clone https://github.com/centralpiedmont/advising-career-day-checkin.git acd-clonetest
cd acd-clonetest/badge-print-station && npm test
```
Expected: the clone succeeds and `npm test` passes against the freshly cloned tree (no reliance on uncommitted local files). Then `rm -rf /tmp/acd-clonetest`.

- [ ] **Step 5: Tag a release (optional, for easy download)**

```bash
git tag -a station-v1.0 -m "Badge print station v1.0"
git push origin station-v1.0
```

---

## Self-Review

**Spec coverage:**
- Mac serves the kiosk → Task 6 (`/`, static) + Task 5 (`/api/config` detection). ✓
- Silent CUPS printing → Task 3 + Task 6 `renderAndPrint`. ✓
- Centralized data + one CSV → Task 2 + Task 6 (`/api/leads|staff`, `/export/*`). ✓
- LAN + Cloudflare tunnel → Task 7 `start.command`. ✓
- Render fidelity (same HTML) → Task 5 `/?render=` + Task 4/6 chain; verified by the 216×144 test. ✓
- Record-saved-before-print, lp-failure handling, offline retry queue, atomic writes → Tasks 2/5/6. ✓
- One codebase / standalone unchanged → Task 5 `STATION` guards + Step 9 sanity check. ✓
- Prereqs / setup doc → Task 7 README. ✓
- Easy distribution → ships in the existing GitHub repo; clone-and-run docs + fresh-clone smoke test → Task 9. ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `store.append/load/getById/clear/csv`, `print.{mediaFor,buildLpArgs,print}`, `render.renderToPdf`, `server.start`, and the kiosk's `postPrint/enqueue/flushQueue/STATION/curLabel/paintBadge/applyLabel` are used consistently across tasks. Record shapes (`{id,ts,name,email,programs}` / `{id,ts,kind,name,role,org}`) match between store, server, CSV, and the badge renderers.

**Known limitations (documented, in scope):** single-record delete from the iPad isn't supported in station mode (use Clear); fully offline rendering falls back from Libre Franklin to a system sans for display weights (URW covers body text); no auth on the local server / tunnel (one-day event).
