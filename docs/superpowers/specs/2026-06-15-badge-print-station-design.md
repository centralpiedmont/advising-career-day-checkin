# Badge Print Station — Mac print server for the Advising & Career Day kiosk

**Date:** 2026-06-15 · **Status:** Approved by Frazier 2026-06-15

## Problem

The event's label printer is an off-brand "4D Barcode" thermal unit with **no AirPrint**,
so the iPad can't print to it directly. The iPad must keep capturing check-ins, but the
**Mac** (which has the printer's driver and full custom-label-size control) must do the
printing. We also want centralized data instead of per-iPad localStorage.

## Decisions (from brainstorming)

- **Mac runs a small local print server** that *serves the same kiosk* to the iPad and
  prints badges silently.
- **Connection:** iPad reaches the Mac over the **LAN** (travel router / Mac hotspot /
  printer network) **or** a **Cloudflare tunnel** public HTTPS URL when device-to-device
  LAN is blocked (campus Wi-Fi). The kiosk opens whichever URL is reachable.
- **Printing:** **silent** via CUPS `lp` — render badge to an exact-size PDF, send to the
  printer, no dialog.
- **Data:** **centralized on the Mac** — one combined store, one CSV export.
- **iPad app:** the **Mac serves the kiosk** (same `index.html`); no GitHub Pages needed
  at the event.
- **`start.command`** auto-prints a LAN URL + QR and auto-starts a Cloudflare tunnel if
  `cloudflared` is installed.
- **Local-retry queue** is included in v1 (resilience).

## Architecture

**One codebase, two modes.** The Mac serves the *same* `index.html` we already ship.
On load the page fetches `GET /api/config`; if it responds `200 {station:true, …}` the
kiosk enters **station mode**, otherwise it stays in **standalone mode**.
- **Station mode** (served by the Mac): Print → `POST /print`; data read/written via the
  server API.
- **Standalone mode** (loaded from GitHub Pages — the `/api/config` fetch fails or 404s):
  current behavior — `window.print` + localStorage. Unchanged.

This keeps a single source of truth for the badge HTML/CSS and the fluid/exact rendering.

### Components — `badge-print-station/` (new folder in the repo)

| File | Responsibility |
|---|---|
| `server.js` | HTTP server (Node stdlib `http`, no framework). Routes below. |
| `render.js` | Write badge HTML to a temp file; call `chrome --headless --print-to-pdf` at the exact label page size; return the PDF path. Reuses the proven headless-Chrome pipeline. |
| `print.js` | `lp -d <printer> -o media=<size> <pdf>` silent print. Printer + media from config. |
| `store.js` | Append each record to a JSON file (atomic write); derive CSV. |
| `config.json` | `{ port, printer, labelSize, chromePath }`. |
| `public/index.html` | The kiosk (the existing file; mode detected at runtime). |
| `start.command` | Double-click launcher: start server, print LAN URL + QR, start Cloudflare tunnel if available. |
| `README.md` | Setup: install Node, register the custom label size in the printer's macOS/CUPS driver, run `start.command`, open the URL on the iPad. |

### Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Serve the kiosk |
| GET | `/api/config` | `{station, printer, labelSize}` |
| POST | `/print` | Body `{kind, name, email?, programs?, role?, org?, labelSize}` → save record, render PDF, `lp` print → `{ok}` or `{ok:false, error}` |
| GET | `/api/leads`, `/api/staff` | JSON lists for admin |
| GET | `/export/leads.csv`, `/export/staff.csv` | CSV download |
| POST | `/api/clear` | Body `{kind}` → clear that list |
| POST | `/api/reprint` | Body `{kind, id}` → re-render + print an existing record |
| GET | `/health` | Liveness |

## Data flow

1. iPad (page served by the Mac) — fill form, pick programs/role.
2. Tap **Print** → `POST /print` with the record + selected label size.
3. Server **saves the record first** (so it's never lost), then renders an exact-size PDF
   and prints via `lp`.
4. Returns `{ok}` → iPad shows "Checked in!" and resets.
5. Admin (any device) reads combined data from the Mac and exports **one CSV** per list.

## Data model (server store)

```jsonc
// data/leads.json
[{ "id": "<uuid>", "ts": "2026-06-15T10:42:00Z", "name": "...", "email": "...",
   "programs": ["Cybersecurity"] }]
// data/staff.json
[{ "id": "<uuid>", "ts": "...", "kind": "staff", "name": "...", "role": "Faculty",
   "org": "Central Piedmont" }]
```
CSV columns unchanged from the standalone app (Students: `Timestamp,Name,Email,Programs`;
Staff: `Timestamp,Name,Role,Organization`).

## Printing details

- Silent via CUPS `lp`. `printer` (CUPS queue name) and `media` come from `config.json`
  and the label-size selector (3×2 → exact `3in×2in` PDF + matching media; 4×2.5 → `4in×2.5in`).
- **Print quality (203-dpi printer, added 2026-06-15):** the 4B-2054N is fixed at 203 dpi,
  so resolution can't be raised — but `config.json` exposes `printSpeed` (default `"2"`,
  slower = crisper) and `darkness` (default `"10"`, range 0–15) which `print.js` passes as
  `-o PrintSpeed=… -o Darkness=…`. An optional `mediaMethod` (`Direct`/`Transfer`) is passed
  only if set. These are tunable per printer in `config.json`.
- The off-brand printer must be installed in macOS with the custom label size registered
  in its CUPS driver; `config.json.printer` names that queue. Documented in the README.
- PDF generated by the same `chrome --headless --print-to-pdf` flow already validated.

## Error handling / resilience

- **Record saved before printing** → a printer jam never loses a check-in.
- `lp` failure → `POST /print` returns `{ok:false, error}`; the iPad shows
  "Saved — reprint from admin" and the record persists; admin **Reprint** re-POSTs.
- **iPad ↔ Mac connection drop** → the kiosk shows a "can't reach print station" banner and
  **queues the record locally (localStorage), retrying** until it reaches the Mac, so no
  check-in is lost during a Wi-Fi blip.
- Atomic file writes in `store.js` (write temp + rename) to avoid corruption.

## Dependencies / prerequisites

- **Node.js LTS** on the Mac.
- **Google Chrome** (already installed; path in `config.json`, default the standard macOS
  location).
- **Optional `cloudflared`** for the public tunnel.
- Printer installed in macOS/CUPS with the custom label size registered.
- No npm packages required (Node stdlib only) — keeps install trivial for an event laptop.

## Badge legibility at 203 dpi (added 2026-06-15)

Because the label printer is 203 dpi (≈8 dots/mm), the badge (in `index.html`, shared by
both the standalone and station paths) is tuned for legibility: the header **logo is
enlarged** (and the band height grows to fit it), and the **smallest text floors are
raised** (`b-ev`, `b-hello`, `b-int`, `b-int b`, and the auto-fit minimums) so nothing
prints below ~6–7 pt. No vector logo exists in the project (PNG only), so the logo's
fine "COMMUNITY COLLEGE" microtext remains the hard limit of what 203 dpi can resolve;
enlarging the logo is the best available mitigation. Verified via 4× PNG render.

## Scope / non-goals

- The existing GitHub Pages single-file app is **untouched** and remains the standalone
  AirPrint fallback. This adds the Mac station as a parallel, more reliable path.
- No auth on the local server (event LAN; tunnel URL is unguessable and short-lived).
  Acceptable for a one-day event; noted as a known limitation.
- No multi-day database; flat JSON files are sufficient and easy to export/clear.

## Testing / verification

- `render.js`: assert generated PDF page size is exactly 216×144 pt (3×2) / 288×180 pt
  (4×2.5) via `pdfinfo`, and visually inspect a rendered PNG (same loop used all session).
- `/print` happy path returns `{ok}` and appends exactly one record; printer-offline path
  returns `{ok:false}` and still appends the record.
- CSV endpoints return correct headers/rows incl. the zero-row case.
- Station-mode detection: with the server, the kiosk posts to `/print`; loaded as a bare
  file it falls back to `window.print` + localStorage.
- `start.command` prints a reachable LAN URL; with `cloudflared` present, a working tunnel
  URL.
