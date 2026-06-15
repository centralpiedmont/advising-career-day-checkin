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
4. Tune print quality in `config.json` if needed: `"printSpeed"` (slower = crisper,
   default `"2"`), `"darkness"` (0–15, default `"10"`), and optional `"mediaMethod"`
   (`"Direct"` or `"Transfer"`; leave `""` to use the printer default).
5. (Optional) `brew install qrencode` for a scannable QR, and/or
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
