# Department Directors & Pastor Insights – Recommendation

## What you want

- **Each department** (e.g. Worship) has a **director/coordinator** who:
  - Plans the team (assignments, who’s leading)
  - Manages budget and money spent
  - Records participation (number of people, volunteers)
- **You as pastor**:
  - **Monitor** all departments
  - See **insights** from director data: activity, participation, budget vs spent
  - Optionally **make plans for them** (e.g. set a plan on your Worship page that directors see)
- **Data link**: Whatever the director enters is **your data** to analyze – one shared source, two views (director = data entry, pastor = insights).

---

## Recommendation: One data store, two views

### 1. Single data store (Firestore)

- **Collection:** `department_entries` (or per-department like `worship_entries`).
- **Each record:** department (e.g. `Worship`), period (e.g. `2026-03`), type (`team` | `budget` | `participation`), data (flexible object), enteredBy (userId), createdAt.
- **Director** writes here; **pastor** reads the same data for analytics. No duplicate data.

### 2. Department director page (e.g. Worship)

- **Who:** Users whose profile has `department: "Worship"` (Worship Director) or a role like “Worship Director”.
- **What they see:**
  - **Team planning:** Assign roles (e.g. lead, keys, drums), names, dates.
  - **Budget:** Planned amount, amount spent (e.g. per month or per event).
  - **Participation:** Number of people (team size, volunteers, participants).
  - Optional: simple activity log (what was done, when).
- **Behaviour:** Form submits → save to Firestore with `department: "Worship"`. Director can see their own recent entries. Same data is used for pastor insights.

### 3. Pastor insights page (e.g. Worship)

- **Who:** Pastor (Founder) or roles with “view department insights” (e.g. Director, Admin).
- **What you see:**
  - **Analytics:** Participation over time (chart), budget vs spent (chart), team size trends.
  - **Activity:** Table of entries from the Worship director (who entered, when, what).
  - **Totals:** e.g. total participants this month/quarter, total spent vs budget.
- **Optional – “Make plans for them”:** A section where you can add a **plan or note** for Worship (e.g. “Focus on youth participation in March”). Stored in the same system (e.g. `type: 'pastor_plan'`) and shown on the director’s Worship page so they see your guidance.

### 4. Linking director ↔ pastor

- **Director** uses: **Worship** (or “My department”) → form + list of their entries.
- **Pastor** uses: **Worship** (or “Department insights” → Worship) → insights + table of all director entries (+ optional pastor plans).
- **Same Firestore data**; different UI and permissions. No separate “pastor database” – you analyze what they enter.

### 5. Roles / permissions

| Role              | Department page (e.g. Worship)     | Pastor insights (Worship)   |
|-------------------|------------------------------------|-----------------------------|
| Founder / Pastor  | Can view + optional “plan for them”| Full insights, charts, data |
| Director (general)| View only or per-department        | View insights               |
| Worship Director  | Full: enter team, budget, participation | No (or view-only)      |
| Admin             | Manage departments                 | View insights               |

- **Worship Director:** In Firestore `users/{uid}` set `department: "Worship"` (and optionally role e.g. “Worship Director”). They get the **Worship** page as **data entry**.
- **Pastor:** Role Founder (or Admin) with permission **viewDepartmentInsights**. You get the **Worship** page as **insights/monitor** (and optional plans).

### 6. Repeating for other departments

- Same pattern: **Cell Ministry**, **Caring**, **Sunday Ministry**, **Junior Church**, **Outreach**, **Media**, etc.
- Each has a **director page** (form + entries) and a **pastor insights page** (analytics + table), using the same `department_entries` (or department-specific collection) filtered by `department`.

---

## Summary

- **One data store** for each department (e.g. Worship): director entries + optional pastor plans.
- **Director page:** Team, budget, participation (and activity) entry; linked to you because it’s the same data.
- **Your (pastor) page:** Insights (charts, participation, budget vs spent), activity table, optional “make plans for them.”
- **Director = data entry; Pastor = analyze and monitor.** You can extend this pattern to all departments later.
