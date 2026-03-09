# Sunday Ministry Planning & Report – Recommendations

## What you have today
- A single **Excel “Sunday Ministry planning and report sheet”** filled by different people from different departments (Sunday Ministry Team, Worship, Media, D-Lite, River Kids, Announcements).
- Data is combined in one sheet for reports and insights.

## What you want
1. **Digital, convenient forms** – same information, but easier to fill.
2. **Combined “sheet”** – all department inputs in one place for reports and insights.
3. **Department-specific access** – e.g. D-Lite has their own area where they can plan and fill their part.

---

## Recommendation 1: One app, one login (no separate “D-Lite login page”)

**Idea:** Keep **one** River Of Life Admin App and **one** login page. After login, what each user sees depends on their **role** and **department**.

- **D-Lite member** → logs in with the same URL as everyone else → sees **only** the D-Lite section of the Sunday plan (and maybe the combined report as read-only).
- **Worship team** → sees only the Worship section.
- **Admin / Director** → sees the full combined sheet and all sections.

**Why:**  
- One place to maintain and deploy.  
- One place for users to remember (one URL, one password).  
- No need for separate “D-Lite login page” vs “Worship login page” – the **same** login page sends them to the right section based on their account.

So: **“Department needs different login”** is best implemented as **“different view after the same login”**, not different apps or different login URLs.

---

## Recommendation 2: One “plan” per Sunday, each department fills a section

**Idea:** For each Sunday you have **one** digital “sheet” (one record per date). Different departments fill **their section** of that same record.

- **Data model:** e.g. Firestore collection `sunday_plans`, one document per Sunday (e.g. document ID = date `2026-03-01`).
- **Document structure:** One object per section, e.g.:
  - `sundayMinistry` – team, preservice, program list, pastor cell, attendance.
  - `worship` – lead, choir, sound, totals.
  - `sundayLeader` – leader name, preaching.
  - `media` – video, stream, presentation, lights, cameras, total.
  - `announcements` – regular and special.
  - `dLite` – light bearers, cushions, others, total volunteers.
  - `riverKids` – front/back volunteers, totals, River Kids 1/2, Sunday school.
- **Summary:** Either stored in the same document (e.g. `summary`) or computed when generating the combined report (totals, attendance, etc.).

This way:
- **Filling:** Each department only edits their section (enforced by app permissions).
- **Combined sheet:** The app “combines” all sections into one view/export for reports and insights.

---

## Recommendation 3: Roles / departments that map to sections

**Option A – Section-based roles (recommended for clarity)**  
Add roles (or “sections”) such as:

- **Sunday Ministry** – can edit only `sundayMinistry` (and maybe view combined).
- **Worship** – can edit only `worship`.
- **Media** – can edit only `media`.
- **D-Lite** – can edit only `dLite`.
- **River Kids** – can edit only `riverKids`.
- **Announcements** – can edit only `announcements`.

Plus existing **Admin / Director / Founder** who can view and edit the full combined sheet.

**Option B – One “Ministry Leader” role + department field**  
Keep a single “Ministry Leaders” role but add a field like `department` or `sundaySections` (e.g. `["dLite"]` or `["worship", "media"]`). The app then shows only those sections in the Sunday Planning form.

**Recommendation:** Start with **Option A** (explicit section roles) so it’s clear who can edit which part. You can later add Option B if you need one person to edit multiple sections.

---

## Recommendation 4: “Combined sheet” = one screen + export

- **Combined view:** One page in the app: “Sunday Ministry Plan – [date]” with all sections (tabs or sections on one page). Read-only for section-only users; editable for Admin/Director/Founder.
- **Reports and insights:**  
  - Same data used for:  
    - Attendance trends (already in your app).  
    - Team size trends (worship, media, D-Lite, River Kids).  
    - Export to Excel/PDF of the full “sheet” for a given date or date range.

So “combined in a sheet” = one place in the app to view/export the full plan, not a separate Excel file everyone edits.

---

## Recommendation 5: Phased rollout

1. **Phase 1 – Data model and one section**  
   - Add `sunday_plans` (or similar) in Firestore with the structure above.  
   - Build one “Sunday Planning” page: pick date, see one combined view (read-only first).  
   - Let Admin create/edit one full plan for a date (all sections).  
   - Export that date to Excel/PDF as the “combined sheet”.

2. **Phase 2 – Section-based editing**  
   - Add section-based roles (or department/sections on the user).  
   - Show each department only their section for the selected date; they save and it updates the same document.  
   - Combined view and export stay as in Phase 1.

3. **Phase 3 – Reports and insights**  
   - Use stored plans for charts (e.g. attendance over time, team sizes, River Kids 1 vs 2).  
   - More export options (e.g. by month).

---

## Summary

| Your need | Recommendation |
|----------|-----------------|
| Similar to current sheet but more convenient | One “Sunday Planning” feature: one record per Sunday, one page per date with sections; forms for each section. |
| Combined sheet for reports/insights | One “combined” view + Excel/PDF export from the same data. |
| “Each department needs different login” | Same login for everyone; after login, show only that department’s section (and read-only combined view). No separate D-Lite login page. |
| D-Lite (and others) plan their works | Each department gets a form for “their” section of the Sunday plan; they see it after logging in with their normal account. |

---

## How to give a user “section-only” access (e.g. D-Lite only)

1. In **Firebase Console** → **Firestore** → **users** → open the user’s document (by their Auth UID).
2. Add a field: **`sundaySection`** (string).
3. Set the value to one of: `sundayMinistry`, `worship`, `sundayLeader`, `media`, `announcements`, `dLite`, `riverKids`.
4. That user will then see **Sunday Planning** → **My section only** and can edit only that section. Admins/Founders can still edit all sections.

---

## Permissions summary

- **Combined sheet** = view only for most users; **filling** = each department in their own section.
- **Senior pastor:** Use **Founder** role – edit and see everything.
- **Directors of departments:** View combined sheet; edit only their section (set `sundaySection` in Firestore).
- **Office secretary (pastor's office):** Recommended: **Viewer** role with **exportReports** enabled so they can view the combined Sunday Planning and export to PDF/Excel for the pastor. Optionally give `sundaySection: "announcements"` if they should edit only the Announcements section.
