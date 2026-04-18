# ROL Admin App — plan, SSOT & history

This file is the **single source of truth (Option A)** for tech stack, architecture, features at responsibility level, and Firestore/backend touchpoints—plus **change history** (updated via `/savehistory`). It does **not** define field-by-field document schemas.

## Active focus

- Department hub (`DepartmentHub`) and tab model (`departmentTabs.js`, `DepartmentTabBar`).
- Cell ministry: `CellReport`, `CellHistory`, permissions (`cellReportPermissions.js`), pending member changes.
- Accounts: department-scoped **Entry** routes (`department/accounts/entry/*`) — Tally, Income, Expense, Weekly Entry (`accountsEntryAccess.js`).
- Sunday ministry: planning, Sunday report/program, pastor views.
- Firebase: Firestore rules/indexes, Cloud Functions (callable + scheduled).
- Auth and access: `AuthContext`, `roles.js`, `access.js`, `dlightAccess.js`, `accountsEntryAccess.js`.

---

## Single source of truth (Option A)

### Tech stack

| Layer | Items |
|--------|--------|
| **UI** | React 19, Vite 7, React Router DOM 7, Tailwind CSS 4 (`@tailwindcss/vite`) |
| **Backend (BaaS)** | Firebase: Auth, Firestore, Storage, Callable Functions (region `us-central1` in `src/lib/firebase.js`) |
| **Charts** | Recharts |
| **Exports** | SheetJS (`xlsx`), jsPDF + jspdf-autotable |
| **Other** | date-fns, react-rnd (planning board), Firebase JS SDK 12 |
| **Cloud Functions runtime** | Node 22 (`firebase.json` / `functions/package.json`) |

### Configuration

- **Env (Vite):** `VITE_FIREBASE_*` — see `src/main.jsx` / `src/lib/firebase.js`. App shows setup message if not configured.
- **Deploy:** `npm run deploy` → build + Firebase deploy (hosting, Firestore, functions).

### Architecture (high level)

- **Entry:** `src/main.jsx` → `App.jsx` (router only).
- **Auth:** `AuthProvider` wraps routes; `ProtectedRoute` requires Firebase user + Firestore `users/{uid}` profile.
- **Layout:** `MainLayout` → `Sidebar` + `<Outlet />` for child routes.
- **Data access:** Primary API is `src/services/firestore.js` (Firestore reads/writes). Some flows use **callable** Cloud Functions (`httpsCallable` from `firebase/functions`).
- **Audit:** `src/utils/auditLog.js` → `audit_logs` collection (best-effort, non-blocking).

### Auth & RBAC

- **Profile:** Firestore `users` — `role`, `globalRole` (`FOUNDER`), `department` / `departments`, `positions[]`, `cellGroup` / `cellId`, etc.
- **Custom claims:** `globalRole: FOUNDER` in ID token; UI treats Founder as full override where implemented (`AuthContext.hasPermission`).
- **Menu permissions:** `ROLE_PERMISSIONS` in `src/constants/roles.js` (keys like `dashboard`, `attendance`, `finance`, `manageUsers`, `pastorHub`, `editSundayPlanFull`, `exportReports`, …).
- **Department access:** `src/utils/access.js` — `getDepartmentRole`, `hasAccess(user, departmentName, requiredRole?)` using `positions[]` (legacy `position` labels + new `role` tokens).
- **D Light:** `src/utils/dlightAccess.js` — `isRestrictedDLightDirector` currently returns `false` (no redirect; backward compatibility).
- **Accounts Entry:** `src/utils/accountsEntryAccess.js` — Founder, `enterFinance`, or Accounts department Director/Coordinator.
- **Cell report editing:** `src/utils/cellReportPermissions.js` — e.g. `canEditCellReport` (Founder; Cell Leader linked to cell group; Cell Director-only does not edit report).

### Application routes (`src/App.jsx`)

| Path | Page / behavior |
|------|------------------|
| `/login` | Login |
| `/` | Dashboard |
| `/departments` | Departments grid |
| `/departments/:slug` | Department detail (tasks summary) |
| `/tasks` | Task management |
| `/sunday-ministry` | Sunday attendance (English/Tamil/Jr/Combined) |
| `/sunday-planning` | Sunday plan by section |
| `/finance` | Church finance |
| `/department/accounts/entry/*` | Accounts Entry (nested: tally, income, expense, weekly) |
| `/reports` | Export attendance/finance/tasks |
| `/admin/users` | Admin user management (Founder) |
| `/cell/users` | Cell-scoped user management |
| `/department/worship` | Worship department (custom) |
| `/department/sunday-ministry/sunday-report` | Sunday report |
| `/department/sunday-ministry/sunday-program` | Default Sunday program list |
| `/department/cell/cell-report` | Cell report |
| `/department/cell/cell-history` | Cell weekly history (read-only archive) |
| `/department/junior-c` | Redirect → `/department/river-kids` |
| `/department/build-c` | Redirect → `/department/building-care` |
| `/department/:slug` | Department hub |
| `/department/:slug/pastor` | Pastor view per department |
| `/department/:slug/pastor/updates` | Pastor updates (rating/notes) |
| `/sunday-ministry-pastor` | Sunday Ministry pastor remarks |
| `/senior-pastor` | Senior Pastor hub |
| `*` | Navigate to `/` |

### Department hub tabs (`src/constants/departmentTabs.js`)

Tabs drive `DepartmentHub` + `DepartmentTabBar` (`?tab=` for deep links when not using in-page `setActiveTab`).

| Slug | Tab keys |
|------|----------|
| `cell` | summary, cellGroups, cellReport, cellHistory, team, planning, financial |
| `caring` | summary, members, subDepartment, team, planning, financial |
| `sunday-ministry` | summary, sundayReport, sundayProgram, subDepartment, team, planning, financial |
| `d-light` | summary, visitorEntry, assign, subDepartment, team, planning, financial |
| `event-m` | summary, events, liveControl, subDepartment, team, planning, financial |
| `river-kids` | summary, subDepartment, attendance, team, planning, financial |
| **default** | summary, subDepartment, team, planning, financial |

- **Sub-departments:** `usesGenericSubDepartmentCollection(slug)` — generic `department_sub_departments` except `d-light` and `cell` (D Light uses `dlight_sub_departments`).
- **Legacy department name merges:** `LEGACY_DEPARTMENT_NAMES` (e.g. River Kids ↔ Junior C).

### Major feature areas (responsibility level)

- **Dashboard:** KPIs from tasks, attendance, finance (permission-gated).
- **Sunday Planning:** `sunday_plans` by date; sections per ministry; Worship summary pulls `worship_schedule`.
- **Sunday Ministry page:** `attendance` collection CRUD.
- **Finance page:** `finance_income`, `finance_expense`, `finance_budget`.
- **Reports:** Excel/PDF export via lazy-loaded `xlsx` / `jspdf`.
- **Worship (`DepartmentWorship`):** team, schedule, budget items, director entries, insights.
- **Cell (`CellReport` / `CellHistory`):** `cell_groups`, `cell_reports` + `attendees` subcollection, `cell_program_log`, `cell_report_history`, pending changes, Back to Bible, program timer flows.
- **Pastor:** `SeniorPastorHub`, `DepartmentPastorView`, `DepartmentPastorUpdates`, `pastor_department_remarks`, `pastor_department_updates`.
- **Admin:** `AdminUserManagement` (Founder; creates via `adminCreateUser` callable), `CellUserManagement` (scoped).
- **Accounts Entry:** `EntryPage` sub-routes — access via `accountsEntryAccess.js`; implementation in `pages/accounts/*`.

### Firestore collections (primary)

`users`, `departments`, `tasks`, `department_entries`, `department_assignments`, `worship_budget_items`, `worship_team_members`, `worship_schedule`, `sunday_ministry_team_members`, `sunday_ministry_budget_items`, `department_team_members`, `department_sub_departments`, `department_children`, `department_child_attendance`, `department_events`, `attendance`, `sunday_plans`, `finance_income`, `finance_expense`, `finance_budget`, `event_spending`, `pastor_department_updates`, `department_updates`, `department_planning_notes`, `cell_groups` (+ `members`, `program_items` subcollections), `cell_program_log`, `cell_member_pending_changes`, `cell_back_to_bible`, `cell_reports` (+ `attendees`), `cell_report_history`, `cell_attendance`, `caring_members`, `delight_visitors`, `dlight_sub_departments`, `sunday_program`, `sunday_program_log`, `pastor_department_remarks`, `sunday_reports`, `audit_logs`.

### `src/services/firestore.js` — exported functions (by domain)

- **Users / admin:** `getUser`, `updateUser`, `getAllUsers`, `createUserByAdmin`, `updateUserByAdmin`, `setUserStatus`, `getUsersByDepartment`
- **Assignments:** `getDepartmentAssignments`, `setDepartmentAssignments`
- **Departments (metadata):** `getDepartments`, `getDepartment`, `createDepartment`, `updateDepartment`
- **Tasks:** `getTasks`, `createTask`, `updateTask`, `deleteTask`
- **Department entries:** `getDepartmentEntries`, `addDepartmentEntry`
- **Worship / Sunday Ministry teams & budget:** `getWorshipBudgetItems`, `addWorshipBudgetItem`, `updateWorshipBudgetItem`, `deleteWorshipBudgetItem`, `getSundayMinistryTeamMembers`, `addSundayMinistryTeamMember`, `updateSundayMinistryTeamMember`, `deleteSundayMinistryTeamMember`, `getSundayMinistryBudgetItems`, `addSundayMinistryBudgetItem`, `updateSundayMinistryBudgetItem`, `deleteSundayMinistryBudgetItem`, `getWorshipTeamMembers`, `addWorshipTeamMember`, `updateWorshipTeamMember`, `deleteWorshipTeamMember`, `getWorshipScheduleByDate`, `setWorshipScheduleByDate`
- **Generic department team / sub-depts / children / events:** `getDepartmentTeamMembers`, `addDepartmentTeamMember`, `updateDepartmentTeamMember`, `deleteDepartmentTeamMember`, `getDepartmentSubDepartments`, `addDepartmentSubDepartment`, `updateDepartmentSubDepartment`, `deleteDepartmentSubDepartment`, `getDepartmentChildren`, `addDepartmentChild`, `updateDepartmentChild`, `getDepartmentChildAttendance`, `setDepartmentChildAttendance`, `getDepartmentEvents`, `addDepartmentEvent`, `updateDepartmentEvent`, `deleteDepartmentEvent`
- **Attendance / Sunday:** `getAttendance`, `createAttendance`, `updateAttendance`, `getSundayPlan`, `setSundayPlanSection`, `setSundayPlanFull`, `getSundayPlansForYear`
- **Finance / events spending:** `getFinanceIncome`, `createFinanceIncome`, `getFinanceExpense`, `createFinanceExpense`, `getFinanceBudgetItems`, `getFinanceBudgetItemsByDepartment`, `addFinanceBudgetItem`, `updateFinanceBudgetItem`, `deleteFinanceBudgetItem`, `getEventSpendingItemsByDepartment`, `addEventSpendingItem`, `updateEventSpendingItem`, `deleteEventSpendingItem`
- **Pastor / updates / planning notes:** `getDepartmentPastorUpdates`, `addDepartmentPastorUpdate`, `updateDepartmentPastorUpdate`, `deleteDepartmentPastorUpdate`, `getDepartmentUpdates`, `addDepartmentUpdate`, `updateDepartmentUpdate`, `deleteDepartmentUpdate`, `getDepartmentPlanningNotes`, `addDepartmentPlanningNote`, `updateDepartmentPlanningNote`, `deleteDepartmentPlanningNote`
- **Cell:** `getCellGroup`, `getCellGroups`, `addCellGroup`, `updateCellGroup`, `getCellGroupMembers`, `addCellGroupMember`, `updateCellGroupMember`, `deleteCellGroupMember`, `getCellProgramItems`, `addCellProgramItem`, `updateCellProgramItem`, `deleteCellProgramItem`, `addProgramLog`, `getProgramLogsByCellAndDate`, `getLatestProgramLogs`, `addCellMemberPendingChange`, `getCellMemberPendingChanges`, `deleteCellMemberPendingChange`, `addBackToBible`, `getBackToBibleList`, `getActiveBackToBibleForDate`, `getCellReportByCellAndDate`, `getCellReportsByCell`, `getLatestCellReports`, `getCellReportHistory`, `createCellReport`, `updateCellReport`, `getCellReportAttendees`, `addCellReportAttendee`, `updateCellReportAttendee`, `deleteCellReportAttendee`, `getLatestCellAttendance`, `addCellAttendance`
- **Caring / Delight:** `getCaringMembers`, `addCaringMember`, `updateCaringMember`, `deleteCaringMember`, `getDelightVisitors`, `addDelightVisitor`, `updateDelightVisitor`, `deleteDelightVisitor`, `getDlightSubDepartments`, `addDlightSubDepartment`, `deleteDlightSubDepartment`
- **Sunday program / report:** `getSundayProgramDefault`, `setSundayProgramDefault`, `addSundayProgramLog`, `getSundayProgramLogsByDate`, `getPastorRemarks`, `setPastorRemarks`, `getSundayReport`, `setSundayReport`

### Cloud Functions (`functions/index.js`)

| Name | Type | Purpose |
|------|------|---------|
| `whoAmI` | Callable | Debug: returns auth uid |
| `adminCreateUser` | Callable | Founder: create Auth user + Firestore `users/{uid}`; password = membership number; audit log |
| `setGlobalRole` | Callable | Founder (or break-glass Admin if no Founder): set `globalRole` + custom claims |
| `migrateUserDepartmentsAndPositions` | Callable | Founder: legacy migration for `positions` / `departments` |
| `archiveCurrentWeekCellReportsToHistory` | Scheduled | Weekly archive to `cell_report_history` |
| `resetCurrentWeekCellReports` | Scheduled | Ensure empty `cell_reports` for new week |

---

## Update history

### 2026-03-22 — `/savehistory`: Option A SSOT merged into `plan.md`

- **Document:** Added full **Single source of truth (Option A)** sections: tech stack, architecture, RBAC pointers, route table (including `department/accounts/entry/*`), department tab matrix, Firestore collections summary, `firestore.js` export grouping, Cloud Functions inventory.
- **Routes:** Aligns with current `src/App.jsx` (Accounts `EntryPage`, nested `accounts/*` pages, no `ErrorBoundary` wrapper in router vs older snapshots).
- **Note:** `DirectorDashboard.jsx` referenced in older snapshots is **not** present in current `App.jsx`; hub remains `DepartmentHub` + tabs.

### 2026-03-21 — working tree snapshot (uncommitted)

**Routing & shell**

- `App.jsx`: accounts entry route under `department/accounts/entry/*`; cell history route; related wiring.
- `main.jsx`: bootstrap updates aligned with routing/providers.
- `Sidebar.jsx`, `DepartmentTabBar.jsx`, `departmentTabs.js`: navigation and department tab behavior.

**Pages**

- `DepartmentHub.jsx`: large expansion (department hub UX and logic).
- `CellReport.jsx`: substantial updates (cell reporting flows).
- `SundayReport.jsx`: reporting updates.
- `Dashboard.jsx`, `Departments.jsx`: incremental changes.
- **New:** `CellHistory.jsx`, `pages/accounts/*` (Entry, Expense, Income, Tally, Weekly entry).

**Auth, roles, data**

- `AuthContext.jsx`, `roles.js`, `AdminUserManagement.jsx`.
- `firestore.js` service layer extensions.
- **New utils:** `accountsEntryAccess.js`, `cellWeek.js` (if present).
- Updates: `access.js`, `dlightAccess.js`, `cellReportPermissions.js`.

**Backend / infra**

- `firestore.rules`, `firestore.indexes.json`.
- `functions/index.js`: Cloud Functions additions/changes.
- `.firebase/hosting.*.cache`: build cache (usually not committed intentionally).

**Tooling**

- `.cursor/commands/` (e.g. `savehistory`), optional rules under `.cursor/rules/`.

---

*Next `/savehistory`: append a new dated subsection under **Update history** with a short bullet list of changes; adjust **Active focus** if priorities shift.*
