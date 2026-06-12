# Check-In & Badge Kiosk — Business & Technology Advising and Career Day

iPad kiosk that checks students in, captures lead info (name, email, programs of
interest), and prints a **3 × 2 in name badge** over AirPrint. Single HTML file,
no server — leads stay on the iPad until you export them.

**Live app:** https://centralpiedmont.github.io/advising-career-day-checkin/

## iPad setup (before the event)

1. Open the link above in **Safari** on the iPad.
2. Tap **Share → Add to Home Screen → Add**. Launch it from the home-screen icon —
   it runs full-screen like an app and keeps working if Wi-Fi drops.
3. Make sure the iPad and the **AirPrint label printer** (Brother QL or similar,
   loaded with 2 × 3 in badge labels) are on the same Wi-Fi. Print one test badge
   and pick the printer + label size in the print dialog — iOS remembers it.
4. In Settings → Display & Brightness, set **Auto-Lock to Never** for the event.

## During the event

Students tap **Check In**, enter name + email, tap program chips, and print.
Badges are monochrome (white label stock) with the student's name and top
program interests.

## After the event (get the leads)

1. On the welcome screen, tap the small **⚙** in the bottom-right corner.
2. Review check-ins and per-program counts, then tap **Export CSV** —
   the file lands in **Files → Downloads**; AirDrop or email it to yourself.
3. Optionally **Clear all data** once the CSV is safely off the iPad.

⚠️ Leads live in Safari's local storage for this site on this iPad. Don't clear
Safari website data before exporting, and export from **each** iPad if you run
several check-in stations.

## Editing

Everything is in `index.html` — the program chip list is the `TRACKS` array at the
top of the `<script>` block. Design spec:
`docs/superpowers/specs/2026-06-12-checkin-badge-app-design.md`.
Companion signage system: `../AdvisingAndCareerDay/` (same track colors).
