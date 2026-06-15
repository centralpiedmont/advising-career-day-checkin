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
   loaded with 3 × 2 in badge labels) are on the same Wi-Fi.
4. In Settings → Display & Brightness, set **Auto-Lock to Never** for the event.

### ⚠️ Printing setup (important — do this once)

iPad's print dialog **defaults to "US Letter," which is wrong** — that makes the
badge print tiny on a big sheet. On the first print:

1. Tap **Printer** and choose your **label printer** (not a regular office printer).
2. Tap **Paper Size** and choose your label media (**3 × 2** or **4 × 2.5**).
3. Set **Scaling** to **100%** and leave **Orientation** on the landscape option.

iOS remembers these for the rest of the event. The badge is built to fill whatever
size you pick, so once the label media is selected it fills the label edge to edge.

**Pick the label size in the app too:** open the **⚙** admin panel and set
**Label size** to **3 × 2 in** or **4 × 2.5 in** to match your stock. This makes the
on-screen preview match the print and sets the page size correctly.

## During the event

Students tap **Check In**, enter name + email, tap program chips, and print.
Badges are monochrome (white label stock) with the student's name and top
program interests.

## Presenter / staff nametags

On the welcome screen, tap **★ Presenter / Staff nametag** (below the big Check-In
button). Enter a name, an optional organization, and pick a role — Presenter, Staff,
Volunteer, Employer, Faculty, or **Other** to type your own (e.g. "Keynote Speaker").
A live preview updates as you type; tap **Print Nametag**. These print on the same
3×2 labels and are logged separately from student leads.

## After the event (get the leads)

1. On the welcome screen, tap the small **⚙** in the bottom-right corner.
2. Use the **Students / Presenters & Staff** toggle to pick a list. Review the
   counts, then tap **Export CSV** — the file lands in **Files → Downloads**;
   AirDrop or email it to yourself. (Export each list separately.)
3. Optionally **Clear this list** once the CSV is safely off the iPad.

⚠️ Leads live in Safari's local storage for this site on this iPad. Don't clear
Safari website data before exporting, and export from **each** iPad if you run
several check-in stations.

## Editing

Everything is in `index.html` — the program chip list is the `TRACKS` array and the
staff roles are the `ROLES` array at the top of the `<script>` block. Design spec:
`docs/superpowers/specs/2026-06-12-checkin-badge-app-design.md`.
Companion signage system: `../AdvisingAndCareerDay/` (same track colors).
