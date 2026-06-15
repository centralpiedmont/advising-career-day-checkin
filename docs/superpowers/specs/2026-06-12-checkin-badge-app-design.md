# Check-In & Badge App — Business & Technology Advising and Career Day

**Date:** 2026-06-12 · **Status:** Approved by Frazier 2026-06-12

## Purpose

iPad kiosk web app for the 2026 Central Piedmont Business & Technology Advising and
Career Day. Captures lead info (name, email, programs of interest) and prints a 3×2 in
name badge via AirPrint to a label printer. Companion to the signage system in
`../AdvisingAndCareerDay/` — reuses its wayfinding track colors.

## Decisions (from brainstorming)

- **Platform:** Single self-contained HTML file (`index.html`). No build step, no
  dependencies, works offline once loaded. Apple standalone web-app meta tags so
  "Add to Home Screen" runs full-screen.
- **Printer:** AirPrint label printer (Brother QL class). Print CSS uses
  `@page { size: 3in 2in; margin: 0 }`; only the badge renders in print media.
- **Lead storage:** localStorage on-device. Admin panel exports CSV via download/share
  sheet. No server.
- **Programs:** Fixed list from the event's `signs.json`, grouped by wayfinding track.

## Program chips (grouped by track)

| Track | Color | Programs |
|---|---|---|
| Technology | Blue `#005D83` | Software Engineering · Data Analytics · IT Project Management · Artificial Intelligence · Cloud & Networking · Cybersecurity · IT Support · Simulation & Game Development |
| Business | Gold `#B4A269` | Business Administration · Medical Office Administration · Paralegal Technologies · Supply Chain Management |
| Accounting | Gray `#54565A` | Accounting · Forensic Accounting |
| Other | Gray | University Transfer |

## Screens / flow

1. **Welcome** — full-screen brand panel, event title, "Conquer Possibility" tagline,
   big "Tap to Check In" CTA. Tapping anywhere advances.
2. **Form** — Name (required), Email (required, validated), program chips
   (multi-select, at least 1). Continue → preview.
3. **Preview & Print** — live 3×2 badge preview, **Print Badge** button triggers
   `window.print()`, lead is saved on print (or via a "Save without printing" link).
   After printing, auto-return to Welcome (with a short "Checked in!" confirmation).
4. **Presenter / Staff nametag** (added 2026-06-15) — reached via a secondary
   "★ Presenter / Staff nametag" button on Welcome. Single screen: Name (required),
   Organization (optional), Role (single-select chips — Presenter, Staff, Volunteer,
   Employer, Faculty — plus "Other" revealing a free-text custom role), with a live
   badge preview beside the form. Print Nametag saves to a separate store and prints.
5. **Admin** (gear icon on Welcome, small/discreet) — two stat cards (student
   check-ins, presenters & staff) and a **Students / Presenters & Staff** tab toggle.
   Students view: per-program counts + leads table. Staff view: nametag table
   (time, name, role, organization). Each view has a contextual Export CSV, per-row
   reprint/delete, and a "Clear this list" (confirm step) scoped to the active view.

## Badge (3 × 2 in landscape)

- **Monochrome** — badges print on white thermal label stock, so the layout is
  ink-only (revised 2026-06-12: track-color band dropped per Frazier).
  Dark header band with "Central Piedmont" + event name.
- Large auto-sizing first name; full name beneath; **all** selected interests in a
  wrapping line that auto-shrinks until everything fits (revised 2026-06-12);
  2pt dark rule above the interests line.
- Official horizontal logo (reversed white, inlined as a data URI) in the header
  band, since blank label stock carries no branding (revised 2026-06-12).
  Font stack: "Franklin Gothic", Arial, Roboto, sans-serif per brand.
- **Staff/presenter variant** (added 2026-06-15): same band; main area shows a bold
  uppercase **role** line, the large name, then the **organization** as the footer
  line (footer omitted when no org). Same width/height auto-fitting as student badges.

## Data model

```js
// localStorage key: "acd-leads-2026"  (students)
[{ ts: "2026-06-12T10:42:00", name, email, programs: ["Cybersecurity", ...] }]

// localStorage key: "acd-staff-2026"  (presenters/staff; kept separate)
[{ kind: "staff", ts, name, role: "Faculty", org: "Central Piedmont" }]
```

CSV columns — Students: `Timestamp,Name,Email,Programs` (programs joined `; `).
Staff: `Timestamp,Name,Role,Organization`.

## Error handling

- Email validated with a permissive pattern; inline error messages, no alerts
  (alerts break kiosk flow).
- localStorage writes wrapped in try/catch; on failure show a banner advising staff
  to export.
- Empty-state admin table; CSV export of zero leads still produces a header row.

## Testing / verification

- Headless Chrome print-to-PDF at 3×2 to verify exact badge geometry, rendered to PNG
  and inspected (same QA loop as the signage project).
- Screen UI verified via headless browser screenshots at iPad viewport (1180×820).

## Deployment

Open `index.html` from any host (GitHub Pages or `python3 -m http.server` on the
event Wi-Fi), then Share → Add to Home Screen on the iPad. Works offline afterward.
