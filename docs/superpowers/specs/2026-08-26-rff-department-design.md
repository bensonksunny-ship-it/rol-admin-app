# RFF department page — design

## Purpose

RFF is a church-sponsored school program. The Founder needs to track its
students (name, program, fee, guardian contact) the same way any other
department's data is tracked in this app — but RFF must **not** appear in the
regular department roster that other church staff see. It's sponsored by the
church but run separately, with its own manager who will do the actual data
entry.

Longer term, RFF is expected to become its own standalone app. Today's
implementation should keep RFF's data cleanly separated from every other
department's, so that connecting the two apps later (automatic data transfer)
is a contained integration task rather than an untangling job.

## Decisions (confirmed with the user)

1. **Visibility: a real department entry, not a fully hidden route.** RFF is
   added to `DEPARTMENT_LIST` like any other department. Because dock/nav
   visibility for non-Founder users is derived entirely from each user's own
   `positions[]` (never by iterating the full department list), nobody sees an
   RFF tile unless they personally hold a position in it. The Founder sees
   every `DEPARTMENT_LIST` entry unconditionally (existing behavior), so RFF
   shows up in the Founder's dock automatically. No new filtering logic is
   needed — this behavior falls out of how `myDepartmentNames`/`hasAccess`
   already work.
2. **Manager access: a normal position, not a bespoke role.** The manager is
   assigned `{ department: 'RFF', role: 'DIRECTOR' }` through the existing
   Add People / position-assignment flow used for every other department.
   `hasAccess`/`getDepartmentRole` require no changes — they already resolve
   access purely from `positions[]` by department name.
3. **Own route, not the generic `DepartmentHub`.** RFF gets `customPage: 'rff'`
   in `DEPARTMENT_LIST` (same mechanism Worship already uses) and its own
   route/page (`/rff` → `RFFPage.jsx`), instead of adding tabs to the
   8000-line `DepartmentHub.jsx`. This keeps RFF's code fully isolated —
   important both for maintainability and for the future standalone-app
   extraction.
4. **Programs: an editable list, not hardcoded.** "Departmental programs"
   under RFF (e.g. specific classes/sponsorship tracks) are managed from
   within the RFF page itself — add/rename/delete — not hardcoded into the
   app. New programs can be added as the school grows with no code change.
5. **Fee: a single snapshot per student, not a ledger.** Each student has one
   fee amount and a Paid/Pending marker — not a running list of payments like
   the Expense/Savings pages. This is a deliberate v1 simplification: if a
   student pays again next term, the manager updates that one record rather
   than the app tracking payment history. If per-term/per-year fee history
   turns out to be needed, that's a follow-up, not part of this design.
6. **Student fields, beyond name/program/fee:** guardian name, guardian phone,
   age/class (free text, not a fixed grade list), and admission date.
7. **UI shape: a roster page, not a ledger/paste-table.** Students aren't
   transactions the way Income/Expense/Savings rows are, so the page uses a
   simple table + "Add Student" form/modal with per-row edit/delete — not the
   paste-friendly spreadsheet-style grid used elsewhere in Accounts.

## Data model

Two new, self-contained Firestore collections — deliberately not shared with,
or derived from, any other department's collections:

```
rff_programs/{docId}
  name:      string
  createdAt: serverTimestamp

rff_students/{docId}
  name:          string
  programId:     string          // references rff_programs/{docId}
  ageOrClass:    string          // free text, e.g. "Grade 4" or "Age 9"
  guardianName:  string
  guardianPhone: string
  admissionDate: Timestamp
  feeAmount:     number
  feePaid:       boolean
  feePaidDate:   Timestamp | null
  createdAt:     serverTimestamp
  updatedAt:     serverTimestamp
```

Deleting a program does not cascade-delete its students; a student whose
`programId` no longer resolves to a live program shows as "Unassigned" in the
UI (the manager can reassign it) rather than silently disappearing.

`src/services/firestore.js` gets a small set of new functions following the
file's existing naming conventions: `getRFFPrograms`, `createRFFProgram`,
`updateRFFProgram`, `deleteRFFProgram`, `listenRFFStudents`,
`createRFFStudent`, `updateRFFStudent`, `deleteRFFStudent`.

`firestore.rules` gets matching `match` blocks for both collections, gated the
same way other department-scoped writes are (`canAccessDept('RFF')`) — per
CLAUDE.md's existing pattern for adding a new collection.

## Routing & access

- `src/constants/departments.js`: add
  `{ name: 'RFF', slug: 'rff', customPage: 'rff' }` to `DEPARTMENT_LIST`, and
  a case in `getDepartmentPath` returning `/rff` for `customPage === 'rff'`
  (mirroring the existing `customPage === 'worship'` case).
- `src/pages/DepartmentHub.jsx`: one redirect line for
  `department.customPage === 'rff'` → `<Navigate to="/rff" replace />`,
  mirroring the existing Worship redirect, so `/department/rff` (reached via
  any generic department link) bounces to the real page.
- `src/App.jsx`: new top-level route `/rff` → `RFFPage.jsx`, inside the same
  `MainLayout`/`ProtectedRoute` wrapper every other page uses.
- `src/pages/RFFPage.jsx` (new file): gates its content with the same
  `hasAccess(userProfile, 'RFF')` / `isFounder` checks any other department
  page uses — no bespoke access logic.

## Page layout (`RFFPage.jsx`)

- Summary strip: total students, total fees collected, total fees pending.
- Programs section: list of current programs with add/rename/delete.
- Students table, filterable by program: Name, Program, Age/Class, Guardian
  (name + phone), Fee Amount, Paid status. "Add Student" opens a small
  form/modal (fields per the data model above); each row has the standard
  edit/delete affordance used elsewhere in the app (`RowActionsMenu`).

## Note: existing "RFF" name in Finance

`src/constants/roles.js` already lists `RFF` in its `DEPARTMENTS` and
`INCOME_TYPES` arrays — that's the existing finance category used when income
is designated for the RFF program (e.g. a donation earmarked for it). This is
the same real-world program and the shared name is intentional, not a
collision: that finance category is unrelated code (dropdown options for
`finance_income` entries) and needs no changes here.

## Out of scope (for this design)

- No sync/export mechanism to a future standalone RFF app — only keeping the
  data model and code cleanly isolated so that work is contained later.
- No per-term/per-year fee history — see decision 5.
- No bespoke "Manager" role in `src/constants/roles.js` — the manager uses the
  existing `DIRECTOR` position tier, scoped to the `RFF` department name.
