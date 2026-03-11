# Department Layout & Senior Pastor Hub — Recommendation & Design

This document is the **design and recommendation** for making department pages and the Senior Pastor hub the **primary layout** of the ROL Admin app. No code changes are made until you confirm this plan.

---

## Phase 1 — Current System Summary

### Architecture
- **Stack:** React (Vite), React Router, Firebase Auth + Firestore, Tailwind CSS.
- **Auth:** Firebase Auth; user profile (role, department, etc.) from Firestore `users/{uid}`.
- **Roles (from `constants/roles.js`):** Founder, Director, Admin, Finance Team, Ministry Leader, Office Secretary, Viewer. **No "Coordinator" or "Senior Pastor" role yet.**
- **Permissions:** Stored in `ROLE_PERMISSIONS` (e.g. `viewDepartmentInsights`, `editSundayPlanFull`, `manageDepartments`). Access is role-based; `userProfile.department` is used to show "my department" links (e.g. Worship, Sunday Ministry).

### Current department-related behaviour
- **Departments list:** `DEPARTMENTS` in `roles.js` (Worship, Cell Ministry, Caring Department, Sunday Ministry, Junior Church, Outreach, Media, Accounts, Human Resources, General Affairs, Thunderstorm Youth, ROL's School of Music, RFF, ROLF). Shown on `/departments`; each links to `/departments/:slug` (generic **DepartmentDetail** — tasks only).
- **Dedicated department pages (manage/edit):**
  - **Worship:** `/department/worship` — full page (team, assign, budget, Plan coming Sunday).
  - **Sunday Ministry:** `/department/sunday-ministry` — full page (planning, budget, team, report); **Sunday Ministry (Pastor):** `/sunday-ministry-pastor` — view + pastor remarks.
- **Sidebar:** Shows links by permission and `userProfile.department` (e.g. "Worship" only if department === 'Worship' or Founder; "Sunday Ministry (Director)" if department === 'Sunday Ministry' or Founder).
- **Firestore:** `departments`, `tasks`, `department_entries`, `worship_team_members`, `worship_schedule`, `worship_budget_items`, `sunday_plans`, `sunday_ministry_team_members`, `sunday_ministry_budget_items`, etc. Department-specific collections keyed by `department` string.

### Gaps vs your goal
- Only **Worship** and **Sunday Ministry** have dedicated “director” pages; other departments use the generic tasks-only **DepartmentDetail**.
- No **Senior Pastor** role or **single hub** where the pastor sees all departments’ planning/reports and can add remarks.
- No explicit **Director vs Coordinator** distinction in roles; no **per-department head** (director/coordinator) concept in the app.
- **Interdepartmental** viewing/sharing is only partial (e.g. Sunday Planning shares Worship data with Sunday Ministry).

---

## Your 16 Departments (from your list)

| Your list (short) | Suggested canonical name in app | Notes |
|-------------------|----------------------------------|-------|
| Worship           | Worship                          | Already has full department page. |
| Cell              | Cell Ministry                    | In DEPARTMENTS. |
| Caring            | Caring Department                | In DEPARTMENTS. |
| Sunday M          | Sunday Ministry                  | Already has full department page + Pastor page. |
| D Light           | D-Lite                           | In EXPENSE_CATEGORIES / Sunday plan sections. |
| Junior C          | Junior Church                    | In DEPARTMENTS. |
| Outreach          | Outreach                         | In DEPARTMENTS. |
| Build C           | Building                         | In EXPENSE_CATEGORIES; add as department if needed. |
| Event M           | Event Ministry / Events          | Add. |
| Mission           | Mission                          | Add. |
| Media             | Media                            | In DEPARTMENTS; in Sunday plan. |
| Accounts          | Accounts                         | In DEPARTMENTS. |
| Human Resourses   | Human Resources                  | In DEPARTMENTS. |
| Gen Affairs       | General Affairs                  | In DEPARTMENTS. |
| Thunderstorm      | Thunderstorm Youth               | In DEPARTMENTS. |
| SP Office         | SP Office / Senior Pastor Office | Add; can be “meta” for pastor’s own planning. |

Recommendation: **One canonical list** (e.g. in `constants/roles.js`) that matches this table and is used everywhere (sidebar, routes, Firestore `department` field). Some departments (e.g. D-Lite) may stay as “sections” in Sunday Planning but still be given a department page if they have a head.

---

## Recommended Role & Access Model

### 1. Department head (Director or Coordinator)
- **Director:** existing role “Director” can be scoped per department (e.g. `userProfile.department === 'Worship'` → sees Worship department page).
- **Coordinator:** add a **new role** `Coordinator` with permissions similar to Director but scoped to their `userProfile.department` only (no cross-department access).
- **Implementation:** Either:
  - **Option A:** Keep one “Director” role and add “Coordinator”; both have a `department` field; both get **edit** access only to their own department page.  
  - **Option B:** Add a single concept “department head” with type `Director | Coordinator` in user profile; permission “can manage this department” = (Founder OR Senior Pastor OR (department head of this department)).

Recommendation: **Option B** — add `departmentHeadType: 'Director' | 'Coordinator' | null` (or similar) and a **Senior Pastor** role; then “can manage department X” = Founder OR Senior Pastor OR (user’s department === X and departmentHeadType is set).

### 2. Senior Pastor
- **New role:** e.g. `Senior Pastor` in `ROLES` and `ROLE_PERMISSIONS`.
- **Access:**
  - **All department pages** — can **view** every department; optionally **edit** (to be decided: view-only vs edit).
  - **Senior Pastor hub (own page):** One place to see **planning and reports from all departments**, add remarks, and (if you want) do high-level planning/editing that doesn’t replace the department head’s data.
- **Reflection of director work:** Department heads’ planning and reports are stored in Firestore (e.g. `department_entries`, `sunday_plans`, department-specific collections). The Senior Pastor page **reads** the same data (no duplicate storage); it’s a **dashboard/hub** that aggregates and shows it by department.

### 3. Interdepartmental viewing/sharing
- **Define which data is shared:** e.g. Sunday Planning (Worship ↔ Sunday Ministry), or “Caring” can see “Cell” attendance summary. Implement by:
  - **Read-only shared views** on existing data (same collections, different permission/route).
  - Optional **shared collections** (e.g. `shared_reports`) only if needed.
- Recommendation: Start with **read-only aggregation** on existing data; add explicit “shared” collections only when a concrete use case appears.

---

## Primary Layout Design (Recommendation)

### 1. Sidebar (primary navigation)

- **Dashboard** (existing).
- **Departments** (existing) — list of all departments (for those who have access).
- **My department** (new or clarified):
  - One entry: **“[Department Name] (Director/Coordinator)”** — links to that user’s **department page** (manage/edit). Shown only if `userProfile.department` is set and user is department head (Director/Coordinator) for that department.
  - So each of the 16 departments has a **route** like `/department/:slug` (e.g. `/department/worship`, `/department/cell-ministry`). One **component per “type”** of department page (see below) or one **generic** department page that loads the right “sections” by department.
- **Senior Pastor hub** (new):
  - One link: **“Senior Pastor”** or **“All Departments (Pastor)”** → `/senior-pastor` (or `/pastor-hub`). Visible only to Founder or Senior Pastor role. This page shows:
    - Per-department cards/sections: planning summary, report summary, last updated, link “View full →” to that department’s page.
    - Pastor’s own **remarks/planning** per department or per period (stored e.g. in `pastor_remarks` or in existing structures).
    - Optional: filters by period, department.
- **Sunday Ministry** / **Sunday Planning** (existing) — keep as is; they are cross-cutting.
- **Tasks**, **Finance**, **Reports** (existing).

So the **primary layout** is: **Dashboard | Departments | [My Department] | Senior Pastor (if pastor) | Sunday Ministry / Sunday Planning | Tasks | Finance | Reports**.

### 2. Department pages (for each of the 16)

- **Goal:** Every department has a **single page** where its **Director or Coordinator** can manage and edit (and Senior Pastor can view, and optionally edit).
- **Content per department (flexible by department type):**
  - **Common blocks:** Summary (e.g. tasks count, last report), **Planning** (free-form or structured notes, date-bound if needed), **Reports** (e.g. from `department_entries`), **Team** (if applicable), **Budget** (if applicable). Not every department needs all blocks; some can be “Planning + Reports + Tasks” only.
- **Implementation options:**
  - **Option A — Generic department page:** One **DepartmentHub** (or enhanced **DepartmentDetail**) that loads “sections” by config (e.g. from `constants/departments.js`: which sections each department has). Reuse existing Worship/Sunday Ministry logic where it fits (e.g. Worship keeps its own page; others use the generic one with Planning + Reports + Tasks).
  - **Option B — One page per department:** 16 separate page components (e.g. DepartmentWorship, DepartmentCell, …). Maximum flexibility, more code.
  - **Option C — Hybrid:** Keep **Worship** and **Sunday Ministry** as they are (they have custom features). Add a **generic DepartmentHub** for the rest, with a config that defines which sections each department has (Planning, Reports, Team, Budget, Tasks). Later, promote a department to a custom page if needed.

Recommendation: **Option C** — keeps existing Worship and Sunday Ministry untouched; adds one **generic department page** for the other 14 (or 15) departments with configurable sections. **SP Office** can be a special “pastor’s own” department or only visible on the Senior Pastor hub.

### 3. Senior Pastor page (hub)

- **URL:** e.g. `/senior-pastor` or `/pastor-hub`.
- **Content:**
  - **Aggregated view** of all departments: for each department, show:
    - Last planning/report snippet or link.
    - Last updated time.
    - Link to full department page.
  - **Pastor’s remarks/planning** — one block per department (or one global), saved in Firestore (e.g. `pastor_department_remarks` collection: `{ department, period?, notes, updatedAt }`).
- **Permissions:** Only Founder or Senior Pastor. No change to department heads’ permissions.

### 4. Interdepartmental sharing

- **Where needed:** Define per use case (e.g. “Caring can see Cell summary”). Implement by:
  - **Read-only** routes or sections that query existing collections with a “shared” permission check, or
  - A small **shared_views** config (which department can see which other department’s summary).
- Start minimal; add as you add features.

---

## Data Model (minimal changes)

- **Users:** Add optional `departmentHeadType: 'Director' | 'Coordinator' | null`. Add role `Senior Pastor` and map it in `ROLE_PERMISSIONS` (e.g. same as Director but with `viewAllDepartments: true`, `pastorHub: true`).
- **Departments:** Ensure one canonical list (e.g. in code and optionally in Firestore `departments` collection) that includes all 16. Add **SP Office** and **Event Ministry**, **Mission**, **Building** if you want them as first-class departments.
- **Pastor remarks:** New collection e.g. `pastor_department_remarks` — `{ department, period?, notes, updatedBy, updatedAt }` (or similar). No change to existing department_entries or planning collections.
- **Department-specific collections:** Existing pattern (e.g. `where('department', '==', department)`) continues. New departments use the same pattern; only add new collections when a department needs something special (like Worship’s schedule and budget items).

---

## Implementation Plan (high level)

Only after **your confirmation** of this design, implementation would proceed in phases.

### Files to create
- `src/constants/departments.js` (or extend `roles.js`) — canonical list of 16 departments + optional section config (which sections each department page shows).
- `src/pages/DepartmentHub.jsx` — generic department page (Planning, Reports, Tasks, optional Team/Budget placeholders) driven by config and `department` from route.
- `src/pages/SeniorPastorHub.jsx` — Senior Pastor hub: list of departments with summary + pastor remarks.
- `src/components/DepartmentSummaryCard.jsx` (optional) — card used on Pastor hub for each department.
- Firestore helpers for pastor remarks (e.g. `getPastorRemarks`, `setPastorRemarks`).

### Files to modify
- `src/constants/roles.js` — add `Senior Pastor` (and optionally `Coordinator`), add `departmentHeadType`-based permission logic; add canonical department list matching your 16.
- `src/App.jsx` — add route `/department/:slug` (generic) and `/senior-pastor`; keep `/department/worship` and `/department/sunday-ministry` as overrides or keep as-is and map slug to the correct page.
- `src/components/Layout/Sidebar.jsx` — add “My department” link (Director/Coordinator) and “Senior Pastor” link; optionally “Departments” stays as list of all.
- `src/context/AuthContext.jsx` — expose `isSeniorPastor`, `isDepartmentHead`, `canAccessDepartment(slug)` if needed.
- Firestore rules (if any) — allow Senior Pastor to read all department data; allow department heads to read/write their own department.

### Database changes
- **Firestore:** New collection `pastor_department_remarks` (or similar). No migration of existing data required.
- **users:** Add optional fields `departmentHeadType`, and role `Senior Pastor` (and optionally `Coordinator`) in existing role field.

### Risks and mitigations
- **Risk:** Breaking existing Worship / Sunday Ministry flows. **Mitigation:** Do not change their routes or page components; only add new routes and generic DepartmentHub for other slugs.
- **Risk:** Permission confusion between Director and Coordinator. **Mitigation:** Define clearly in constants and in this doc; one permission “canManageDepartment(department)” for both, differentiated only by label (Director vs Coordinator) in UI.
- **Risk:** Senior Pastor seeing data they shouldn’t. **Mitigation:** Explicit permission checks in Firestore and in app; only aggregate data that department heads already submit (no new sensitive fields without product decision).

### What stays unchanged
- Dashboard, Tasks, Finance, Reports behaviour.
- Sunday Ministry and Sunday Planning flows.
- Worship department page (full functionality).
- Sunday Ministry Director and Sunday Ministry Pastor pages.
- Login and auth flow; only role list and optional user fields extended.

---

## What I need from you before coding

1. **Confirm the 16 departments list** — Use the “Suggested canonical name” column as-is, or specify changes (e.g. “D Light” = “D-Lite” only in Sunday Planning, or also a department page?).
2. **Director vs Coordinator** — Prefer Option B (department head type in profile) or keep only “Director” and add “Coordinator” as a separate role with same permissions but different label?
3. **Senior Pastor on department pages** — View only, or also edit (like a super-director)?
4. **SP Office** — A full department with its own page, or only the “Senior Pastor hub” page (no separate SP Office department)?
5. **Interdepartmental** — Any specific pairs (e.g. “Caring sees Cell”) to support in the first version, or leave for later?

Once you confirm these, the next step is to implement according to this plan and the Master Development Rules (no breaking changes, extend-only where possible).
