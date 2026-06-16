# Kiosk on a Raspberry Pi 400 via Balena

Run the whole check-in kiosk as a self-contained appliance: a Pi 400 with a
**touchscreen** boots straight into the kiosk full-screen, and badges print to a
USB label printer. Updates are pushed over-the-air with balenaCloud.

This is an alternative to the Mac/iPad setup in the top-level README — same
`index.html` kiosk and same Node server, just containerized.

## Architecture (3 containers, see `../docker-compose.yml`)

| Container | Job |
|---|---|
| `kiosk-server` | Node `server.js` — serves the kiosk on `:8088`, saves each check-in to the `badge-data` volume, renders the badge with headless Chromium, prints via `lp`. |
| `browser` | balenablocks/browser — Chromium full-screen on the attached touchscreen, pointed at `http://localhost:8088`. Replaces the iPad. |
| `cups` | CUPS print server with USB access to the label printer. |

Leads survive OTA updates because they live on the **`badge-data`** named volume
(`DATA_DIR=/data`), not in a container layer.

## One-time setup

1. **Create a fleet** in balenaCloud for device type **Raspberry Pi 4 (using 64-bit OS)** — the Pi 400 uses this type.
2. **Add a device**: download the balenaOS image, flash it (balenaEtcher), boot the Pi. It appears in the dashboard.
3. **Deploy**: from this repo root, `balena push <fleet-name>` (or connect the GitHub repo). balenaCloud builds the ARM64 images.
4. **Set up the printer** (the one manual step — see below).

## Printer driver

There is no vendor ARM64 binary driver, and you don't need one: on Linux a CUPS
driver is a PPD + filters (architecture-independent). The 4Barcode 4B-2054N is a
ZPL printer (also sold as Arkscan 2054A / Offnova), so use a **Zebra ZPL** driver.

Either auto-create the queue with service variables on the `cups` service:

- `PRINTER_URI` — find it by opening a terminal on the `cups` container (balena
  dashboard → Terminal) and running `lpinfo -v` (e.g. `usb://4BARCODE/4B-2054N?serial=...`).
- `PRINTER_MODEL` — pick one from `lpinfo -m | grep -i zebra`, **or** mount a
  `.ppd` file and set `PRINTER_PPD` instead.

…or do it once by hand at the CUPS web UI: `http://<device-ip>:631` →
Administration → Add Printer. Then **register the custom media size**
(`Custom.3x2in` / `Custom.4x2.5in`) — `print.js` passes that exact name to `lp`.

Keep the `cups` queue name in sync with `config.json` `"printer"` and the
`PRINTER_NAME` variable.

> Note: the `PrintSpeed` / `Darkness` / `MediaMethod` options in `config.json`
> were named for the macOS driver. Confirm the Zebra driver exposes the same
> option names with `lpoptions -p <queue> -l`; drop any it doesn't.

## Touchscreen

The `browser` container runs privileged with host networking, so it picks up the
touchscreen as an input device automatically. Some panels need calibration —
configure that in the browser block (see balenablocks/browser docs).

## Getting the data off

Same as the Mac station: in the kiosk's ⚙ admin panel, **Export CSV**. The raw
records are in the `badge-data` volume at `/data/leads.json` and `/data/staff.json`.

## Performance note

The Pi 400 runs a full-screen Chromium *and* cold-starts a second headless
Chromium per badge to render the PDF. That's heavy for a 4 GB Pi; if printing
feels slow under a busy check-in line, switch `render.js` to a persistent
Chromium/Puppeteer instance instead of spawning one per badge.
