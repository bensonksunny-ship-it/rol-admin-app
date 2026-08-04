# Sec-Core Navigation Restructure — Design Spec

**Date:** 2026-08-04
**Status:** Approved

## Overview

Restructures Sec-Core's navigation so Director Board, Sunday Leader, and Planning each become dedicated, URL-addressable top-level tabs instead of being buried inside an internal tab strip (Director Board / Board Agenda / Sunday Leader) nested under a single generic "Summary" tab. Alongside this:

- Board Agenda is nested inside Director Board as a collapsible card, not its own tab.
- Sunday Leader gains a managed "Sunday Leaders Pool" with dropdown-based assignment instead of free-text name entry.
- Operations (and its Team / Sub Department children) is removed entirely for Sec-Core; Planning is promoted out of Operations to stand alone.
- The `summary` tab is retained as Sec-Core's landing page, rendering the [Sec-Core Analytics Hub](2026-08-04-sec-core-analytics-hub-design.md) dashboard — already implemented in the baseline, unchanged by this spec.

This supersedes `SecCoreSummary.jsx`'s original single-file, internal-tab-strip structure.

## Baseline: Already-Implemented (Uncommitted) Work

Before this spec, the working tree already contained substantial uncommitted progress toward it, discovered mid-design:

- `SecCoreAnalyticsHub` — fully implemented in `SecCoreSummary.jsx`, matches the Analytics Hub spec exactly (KPI tiles, 3 charts, 4 insight cards). Already wired into `DepartmentHub.jsx`'s `summary` tab branch for `sec-core`.
- `DirectorBoardPage` — wraps the roster (`DirectorBoardTab`, converted to a `+` floating-button-and-modal "Add Person" flow) and `BoardAgendaTab`, switched via an internal two-tab strip ("Board Overview & Leadership" / "Board Agenda"). Already wired into `DepartmentHub.jsx` as `activeTab === 'directorBoard'`.
- `SundayLeaderTab` — exported but functionally unchanged from the original (no pool/dropdowns yet). Already wired into `DepartmentHub.jsx` as `activeTab === 'sundayLeader'`.
- `departmentTabs.js` — `sec-core` case added, but as `['summary', 'directorBoard', 'sundayLeader', 'finance', 'operations']` (still includes `operations`, no `planning`).
- `departmentSubpages.js` — labels/icons for `directorBoard`/`sundayLeader` already added.
- Everything above lives as named exports inside the single `SecCoreSummary.jsx` file — it was **not** split into separate files, and per the file-split decision below, won't be.
- Unrelated, separate in-progress work is mixed into the same uncommitted diff (`FinanceTabBar`, expense/budget approval-status fields, rewrites of `AdvancePayoutTab.jsx`/`DeptExpenseTab.jsx`/`BudgetPage.jsx`) — out of scope for this spec; left untouched by it.

**What this spec still needs to add on top of that baseline:**
1. Change `DirectorBoardPage`'s Board Agenda from a clickable sub-tab to a collapsed-by-default collapsible card (see §1).
2. Sunday Leaders Pool: `+` button, modal, Firestore doc/functions, dropdown conversion, stale-entry handling (see §2).
3. Remove `operations` from `sec-core`'s tab list; promote `planning` to top-level (see §3).

## Tabs

`getDepartmentHubTabs('sec-core')`:

| Before | After |
|---|---|
| `['summary', 'finance', 'operations']` | `['summary', 'directorBoard', 'sundayLeader', 'planning', 'finance']` |

- `summary` keeps its existing label ("Hub") and default-landing behavior — no special-casing needed in `DepartmentHub`'s tab-resolution effect, since every other department already defaults to `summary` when `?tab=` is absent or invalid.
- `directorBoard` → label "Director Board"; `sundayLeader` → label "Sunday Leader" (new cases in `getTabLabel`/`getTabIcon`, `src/utils/departmentSubpages.js`).
- `planning` and `finance` already have generic labels/icons/render blocks (`activeTab === 'planning'` / `'finance'` have no slug restriction) — no new code needed for them beyond the tab-list change.
- No `operations` or `boardAgenda` keys exist for `sec-core`.

## Component File Layout

**Stays one file.** `src/pages/seccore/SecCoreSummary.jsx` remains the single home for `SecCoreAnalyticsHub`, `DirectorBoardPage` (roster + nested Board Agenda), and `SundayLeaderTab` (+ shared helpers `PersonPicker`, `dur`, `POSITION_STYLES`), all as named exports — matching how the existing uncommitted work is already organized. No new files, no file deletion.

## 1. Director Board tab (`directorBoard`)

- Roster UI (`DirectorBoardTab`, already updated in the baseline to the `+` floating-button/modal "Add Person" flow) stays as-is: three columns (Secretaries / Directors / Coordinators), add/edit/remove via `MemberForm` + `PersonPicker`, backed by `subscribeToDirectorBoard` / `setSecCoreDirectorBoard`.
- **Change from baseline:** `DirectorBoardPage`'s current two-tab strip ("Board Overview & Leadership" / "Board Agenda", `subTab` state) is replaced with a collapsible card, **collapsed by default**:
  - Renders `DirectorBoardTab` directly (no sub-tab switch needed to see the roster).
  - Below it, a `▸ Board Agenda` header row (chevron rotates on expand), local `useState` toggle — no URL/query-param state.
  - Expanded content is the existing `BoardAgendaTab` component, rendered unchanged (Sunday date chips, unscheduled-points inbox, A5 agenda sheet, fix/unfix slot editing) — same `subscribeToBoardPoints` / `updateBoardPoint` calls, no logic changes to it.
- No standalone `boardAgenda` route or nav tile exists anywhere in the app.

## 2. Sunday Leader tab (`sundayLeader`)

**Header:** "Sunday Leader" title, with a `+` icon button top-right, visible only when `canEdit` (`canManageDepartment('Sec-Core')`). Opens the **Leaders Pool modal**:
- Lists current pool members (name + Remove button).
- `PersonPicker` (same directory search-by-name/phone component `DirectorBoardTab`'s `MemberForm` uses) to add a person from the People Directory into the pool.
- Changes save immediately via `setSundayLeaderPool` (optimistic list update, matching the existing Director Board save pattern).

**Body — two columns:**

| Left | Right |
|---|---|
| Prev/Next Sunday date nav | "Recent Assignments" history list (unchanged from today) |
| Leader `<select>` | Click a row → jumps `selectedDate` to that entry, same as today |
| Co-Leader `<select>` (includes blank "— none —" option — stays optional) | |
| Notes `<textarea>` (unchanged) | |
| Delete / Save buttons (unchanged logic) | |

**Dropdown population:** pool members, sorted alphabetically by name, as `<option>`s in both selects.

**Stale entries:** when the entry being edited has a `leader` or `coLeader` name not present in the current pool (person since removed), that name is injected into the relevant dropdown's option list as an extra, visually distinguished option (e.g. dimmed, suffixed "(not in pool)") — computed client-side per render, not persisted. Ensures opening any past Sunday never shows a blank field. Saving without changing the selection keeps the same stored name; removing someone from the pool has no effect on already-saved entries.

Read/write of the per-Sunday entry itself (`sec_core_sunday_leader/{dateStr}` docs) is unchanged — same `getSecCoreSundayLeaderEntry` / `setSecCoreSundayLeaderEntry` / `deleteSecCoreSundayLeaderEntry` / `getSecCoreSundayLeaderEntries` functions, same schema, just sourced from selects instead of text inputs.

## 3. Operations removed, Planning promoted

- `operations` is dropped from `getDepartmentHubTabs('sec-core')` entirely. Its former children (Team, Sub Department) were only ever reachable via `?tab=operations&opsSub=team|subDepartment`; with `operations` gone, they become unreachable for Sec-Core with no further code changes — `getDepartmentSubpages` only generates children for tabs present in the department's tab list.
- `planning` moves from an Operations child (`opsSub=planning`) to a real top-level tab key. Its render block in `DepartmentHub.jsx` (`activeTab === 'planning' || (activeTab === 'operations' && opsSubTab === 'planning')`, ~line 3873) already has no slug restriction, so it renders correctly the moment `planning` is a real tab — no new Planning UI code needed.
- **Stale links:** any old `?tab=operations` (or `&opsSub=...`) link for Sec-Core no longer matches `nextTabs`, so `DepartmentHub`'s existing fallback (`else { setActiveTab('summary') }`) lands the user on the Analytics Hub instead of erroring or blanking — no explicit redirect route needed.

## Data Model — New Firestore

| Doc | Path | Shape |
|---|---|---|
| Sunday Leaders Pool | `sec_core/sunday_leader_pool` | `{ members: [{ personId, name }], updatedBy, updatedAt }` |

Single-doc pattern, mirroring the existing `sec_core/director_board` doc. Already covered by the existing `sec_core/{docId}` security rule (`allow read, write: if isSignedIn() && (isFullAccess() || canAccessDept('Sec-Core'))`) — **no `firestore.rules` changes needed**.

New `src/services/firestore.js` functions (mirroring `getSecCoreDirectorBoard` / `subscribeToDirectorBoard` / `setSecCoreDirectorBoard`):
- `getSundayLeaderPool()`
- `subscribeToSundayLeaderPool(onChange, onError)`
- `setSundayLeaderPool(data, updatedBy)`

## File Changes

Relative to the current uncommitted working-tree state (not relative to `HEAD`) — i.e. these are the remaining changes needed on top of the baseline described above.

| File | Change |
|---|---|
| `src/constants/departmentTabs.js` | `sec-core` case: drop `operations`, add `planning` → `['summary', 'directorBoard', 'sundayLeader', 'planning', 'finance']` |
| `src/utils/departmentSubpages.js` | No change needed — `directorBoard`/`sundayLeader` labels/icons already added; `planning`/`finance` already generic |
| `src/services/firestore.js` | Add `getSundayLeaderPool`, `subscribeToSundayLeaderPool`, `setSundayLeaderPool` |
| `src/pages/seccore/SecCoreSummary.jsx` | `DirectorBoardPage`: replace the `subTab`/sub-tab-strip implementation with `DirectorBoardTab` + collapsible Board Agenda card. `SundayLeaderTab`: add pool state/subscription, `+` button, Leaders Pool modal, convert Leader/Co-Leader inputs to `<select>`, stale-entry handling |
| `src/pages/DepartmentHub.jsx` | No new imports/branches needed — `directorBoard`/`sundayLeader`/`summary`(`SecCoreAnalyticsHub`) render blocks already wired in the baseline; `planning`/`finance` already generic, work automatically once `planning` is in `sec-core`'s tab list |

## Out of Scope / Non-Goals

- No `firestore.rules` changes.
- No schema change to the existing `sec_core_sunday_leader` per-date entry docs.
- No change to historical Director Board or Board Agenda data or behavior.
- No change to Analytics Hub's data sources, KPI logic, chart design, or file location (see its own spec) — it's already implemented in the baseline and this spec doesn't touch it.
