# Cell Page Restructure Plan
*ROL Admin App — April 2026*

---

## 1. Goal

Reduce the Cell department from **9 tabs to 5**, eliminate dead/duplicated code, fix routing and permission bugs, and share data across tabs so pages load faster and stay consistent.

**Current (9):** Summary | Cell Groups | Cell Report | History | Shepherd | Mid-week | Team | Planning | Budget

**Target (5):**

| New tab | What it contains | Replaces |
|---|---|---|
| **Summary** | KPIs, member pending changes, quick links | summary |
| **Cell Groups** | All cell groups, attendance, members | cellGroups |
| **Reports** | Cell Report + History (internal sub-toggle) | cellReport + cellHistory |
| **Leader Entry** | Shepherd Care + Mid-week (internal sub-toggle) | shepherd + midweek |
| **Operations** | Team + Planning + Budget (internal sub-toggle) | team + planning + financial |

---

## 2. Role-based tab visibility

Tabs a role cannot use are **hidden, not disabled**.

| Role | Visible tabs |
|---|---|
| Founder / Cell Director | Summary, Cell Groups, Reports, Leader Entry, Operations (all 5) |
| Cell Leader | Summary, Reports, Leader Entry (3) |
| Other staff viewer | Summary, Cell Groups, Reports (read-only) (3) |
| No Cell role | Page not reachable |

Permission helpers already exist in `src/utils/cellReportPermissions.js` (`isCellDirectorInPositions`, `isCellLeaderInPositions`). All tab-visibility checks will route through these helpers. Inline role logic currently duplicated in `DepartmentHub.jsx`, `CellUserManagement.jsx`, and `ShepherdView.jsx` will be removed.

---

## 3. Files that change

| File | Change | Why |
|---|---|---|
| `src/constants/departmentTabs.js` | Edit | Replace 9-item `'cell'` array with `['summary','cellGroups','reports','leaderEntry','operations']`. |
| `src/components/DepartmentTabBar.jsx` | Edit | Add labels for `reports`, `leaderEntry`, `operations`. Remove dead Link branches for cellReport/cellHistory/shepherd/midweek. Accept a `userProfile` prop; filter tabs through a `visibleCellTabs(user)` helper. |
| `src/utils/cellTabVisibility.js` | **Create** | Single place for "which tabs can this user see on Cell". Calls into `cellReportPermissions.js`. Used by DepartmentTabBar and DepartmentHub. |
| `src/pages/DepartmentHub.jsx` | Edit | For `slug === 'cell'`, route activeTab to one of the new wrapper components. Guard `getCellMemberPendingChanges` behind `activeTab === 'summary'`. Drop inline role logic. |
| `src/pages/cell/CellReportsTab.jsx` | **Create** | Wraps existing `CellReport.jsx` + `CellHistory.jsx` with internal toggle (Current \| History). Shares single cellGroups load via context. |
| `src/pages/cell/CellLeaderEntryTab.jsx` | **Create** | Wraps `ShepherdView` + `MidweekMinistry` with internal toggle (Shepherd Care \| Mid-week). |
| `src/pages/cell/CellOperationsTab.jsx` | **Create** | Sub-toggle for Team \| Planning \| Budget. Reuses existing Hub sub-panels; no business logic duplicated. |
| `src/context/CellDataContext.jsx` | **Create** | Provides `cellGroups`, `members`, `pendingChanges` via a single `onSnapshot`. Eliminates 4+ redundant `getCellGroups()` calls. |
| `src/App.jsx` | Edit | Keep only the hub route `/department/cell`. Remove links to `/department/cell/cell-report`, `/cell-history`, `/shepherd`, `/midweek` — three of those four were already broken (not registered). |
| `CellReport.jsx`, `CellHistory.jsx`, `ShepherdView.jsx`, `MidweekMinistry.jsx` | Edit (light) | Stop fetching cellGroups/members locally. Read from `CellDataContext`. Export as sub-components instead of routed pages. |

---

## 4. Backend / logic cleanup

### 4.1 Fix broken routes (real bug today)

`DepartmentTabBar` links to `/department/cell/cell-history`, `/department/cell/shepherd`, and `/department/cell/midweek`. **None of those routes are registered in App.jsx.** Only `/department/cell/cell-report` is wired. Clicking the other three tabs falls through to the catch-all today. The restructure removes these dangling links entirely, so the bug disappears.

### 4.2 Remove dead code

| Location | Type | Action |
|---|---|---|
| `ShepherdView.jsx` ~L190–227 (`MinistryContentTab`) | Dead function | Delete. Defined but never rendered. |
| `CellReport.jsx` ~L186 (`leaderAttendanceOpen`) | Unused state | Delete the `useState` and any setter references. |
| `CellReport.jsx` `latestCellReports` | Partially unused | Keep only what feeds `cellReportsByWeek`; drop the unused render path. |
| `CellUserManagement.jsx` L21–26 | Duplicated role logic | Replace with `isCellLeaderInPositions` / `isCellDirectorInPositions` from `cellReportPermissions.js`. |
| `DepartmentHub.jsx` L116–121 | Inline role computation for `slug === 'cell'` | Replace with helpers; remove local positions-array scan. |

### 4.3 Fix logical bugs

| Bug | Fix |
|---|---|
| `CellReport.jsx` `effectiveCellId` is `null` for non-leader/non-director viewers — silent fail, blank report. | Short-circuit: if no cell id resolves, render explicit "Not assigned to a cell" empty state. |
| `DepartmentHub.jsx` `getCellMemberPendingChanges` runs on every Cell render regardless of active tab. | Guard inside a `useEffect` with `activeTab === 'summary'`. |
| `CellReport.jsx` `cellReportsByWeek` may use stale `latestCellReports` when `weekStartISO` is manually changed. | Re-fetch (or re-filter) when `weekStartISO` changes; add it to the effect's dependency list. |
| `ShepherdView.jsx` `getCellGroups('Cell')` called twice in the same mount lifecycle. | Removed once `CellDataContext` lands — reads groups from context. |
| `MidweekMinistry.jsx` race between `cellGroups` load and members/prayer load on fast networks. | Chain: kick off member/prayer fetch only after `selectedCellId` is derived from loaded groups. |
| `CellHistory.jsx` redundant `alive` flag inside a `useEffect` that already has a cleanup. | Remove the flag; rely on cleanup to cancel stale `setState`. |

### 4.4 Performance

- **Lazy-load heavy tabs.** `React.lazy(() => import('./cell/CellReportsTab'))` for Reports / Leader Entry / Operations. Only Summary + Cell Groups load on first paint.
- **Share data via `CellDataContext`.** Single `onSnapshot(cell_groups)` feeds every Cell view.
- **Memoize derived lists** (`useMemo`) for `cellReportsByWeek`, leader-visible group list, and pending-change counts.
- **Virtualize** long member tables in Cell Groups (`react-window`) if any group exceeds ~200 members.

---

## 5. Suggested order of work

1. **Step 1 — Shared data layer.** Add `CellDataContext`; switch existing pages to consume it. Ship and verify no regression. (Pure refactor, no UI change.)
2. **Step 2 — Tab structure.** Update `departmentTabs.js` + `DepartmentTabBar` + `App.jsx` to the 5-tab layout with role-visibility helper.
3. **Step 3 — Wrapper tabs.** Introduce `CellReportsTab`, `CellLeaderEntryTab`, `CellOperationsTab` with internal toggles.
4. **Step 4 — Dead-code removal** (section 4.2).
5. **Step 5 — Logic-bug fixes** (section 4.3).
6. **Step 6 — Lazy-load + memoization.**

---

## 6. Risks and what to verify

- **Bookmarked deep links** (e.g. `/department/cell/shepherd`) will break once collapsed. Mitigation: a redirect route in App.jsx forwarding old URLs to `/department/cell?tab=leaderEntry` etc.
- **External references** in email templates or dashboards pointing at old Cell sub-routes must be updated or redirected.
- **Provider ordering:** `CellDataContext` must live **below** the auth/user-profile provider so its queries see the right user. Confirm provider nesting in `App.jsx`.
- **Role-check regression:** the previous inline logic and the helper logic diverge slightly on the lowercase string `"cell leader"`. Must be tested with a real Cell Leader account.
- **Lazy-load flash:** Suspense fallback needs to look intentional, not broken.

---

## 7. Open questions before I write code

1. Inside the new **Reports** tab, do you want Current and History as two pill buttons, a segmented toggle, or "Latest" by default with a "View history" link?
2. Inside **Leader Entry**, should **Mid-week** or **Shepherd Care** open by default for a Cell Leader?
3. For **Operations**, is the order Team → Planning → Budget correct, or do you use Budget most often and want it first?
4. Should old deep-link URLs (`/department/cell/shepherd` etc.) be **redirected**, or is it fine to let them 404 since three of the four were already broken?
5. Do you want me to execute the plan **step-by-step with a review at each checkpoint**, or do all six steps in one pass?
