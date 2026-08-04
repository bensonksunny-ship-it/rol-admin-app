# Sec-Core Navigation Restructure — Design Spec

**Date:** 2026-08-04
**Status:** Approved

## Overview

Restructures Sec-Core's navigation so Director Board, Sunday Leader, and Planning each become dedicated, URL-addressable top-level tabs instead of being buried inside an internal tab strip (Director Board / Board Agenda / Sunday Leader) nested under a single generic "Summary" tab. Alongside this:

- Board Agenda is nested inside Director Board as a collapsible card, not its own tab.
- Sunday Leader is a monthly batch-editing grid (Prev/Next month, one row per Sunday, "Save Month Schedule") backed by a managed "Sunday Leaders Pool", with Leader **and** Co-Leader dropdowns per row, and bell-pipeline notifications to assigned leaders on save. See "Reconciliation" below for why this differs from this doc's earlier drafts.
- Sunday Leader gains a Psalm-per-Sunday assignment (dropdown, auto-suggested from the prior Sunday) and a JPEG schedule export (see §2).
- Operations (and its Team / Sub Department children) is removed entirely for Sec-Core; Planning is promoted out of Operations to stand alone.
- The `summary` tab is retained as Sec-Core's landing page, rendering the [Sec-Core Analytics Hub](2026-08-04-sec-core-analytics-hub-design.md) dashboard — already implemented in the baseline, unchanged by this spec.

This supersedes `SecCoreSummary.jsx`'s original single-file, internal-tab-strip structure.

## Reconciliation Note (read before §2)

While this doc was still being drafted, three other concurrent sessions were independently giving Sunday Leader instructions on the same repo. One of them built a complete, different implementation before this doc's original §2 (single-Sunday view, no Co-Leader, plain My Workspace banner) was finalized:

- **Month-grid batch view** instead of single-Sunday Prev/Next + history list.
- **Co-Leader kept** — dropdown + display on every row (this doc originally called for removing it; that decision is reversed).
- **Bell-pipeline notifications** (`sec_core_leader_assignment_notifications` collection, wired into `useActionNotifications.js`, deep-links to `/department/sec-core?tab=sundayLeader`) instead of a plain My Workspace banner (this doc originally called for the latter; that decision is reversed).
- Sunday Leaders Pool (`+` button → modal → `PersonPicker` from the People Directory) — matches what this doc originally specced, just named/shaped slightly differently (`setSecCoreSundayLeaderPool` instead of `setSundayLeaderPool`).

**Decision: keep the already-built month-grid/Co-Leader/bell-notification implementation as the real baseline.** This doc's job past this point is to document that reality accurately and specify only what's still missing on top of it: Psalm-per-Sunday and the JPEG export. Historical sections below that still describe the single-Sunday/no-Co-Leader/banner design have been rewritten to match; nothing in this file should be read as calling for Co-Leader removal or a banner-instead-of-bell notification anymore.

## Baseline: Already-Implemented (Uncommitted) Work

- `SecCoreAnalyticsHub` — fully implemented in `SecCoreSummary.jsx`, matches the Analytics Hub spec exactly (KPI tiles, 3 charts, 4 insight cards). Wired into `DepartmentHub.jsx`'s `summary` tab branch for `sec-core`.
- `DirectorBoardPage` — wraps the roster (`DirectorBoardTab`, `+` floating-button-and-modal "Add Person" flow) and `BoardAgendaTab`, switched via an internal two-tab strip ("Board Overview & Leadership" / "Board Agenda"). Wired into `DepartmentHub.jsx` as `activeTab === 'directorBoard'`.
- `SundayLeaderTab` — full month-grid implementation (see Reconciliation Note): `SundayLeaderRow` per Sunday (Leader `<select>`, Co-Leader `<select>`, notes `<input>`), `SundayLeaderPoolModal` for pool management, `handleSaveMonth` batch-writes the month via `setSecCoreSundayLeaderMonth` and fires `createSundayLeaderAssignmentNotification` for each resolvable leader/co-leader. Wired into `DepartmentHub.jsx` as `activeTab === 'sundayLeader'`.
- `firestore.js` — `getSecCoreSundayLeaderPool`, `subscribeToSundayLeaderPool`, `setSecCoreSundayLeaderPool`, `setSecCoreSundayLeaderMonth`, `getUserByName`, `createSundayLeaderAssignmentNotification`, `subscribeSundayLeaderAssignmentNotifications` all implemented, plus the pre-existing `getSecCoreSundayLeaderEntry`/`getSecCoreSundayLeaderEntries`/`setSecCoreSundayLeaderEntry`/`deleteSecCoreSundayLeaderEntry`.
- `firestore.rules` — `sec_core_leader_assignment_notifications/{docId}` rule added (readable by the notified `uid` or Sec-Core access, writable by Sec-Core access).
- `useActionNotifications.js` — subscribes to `subscribeSundayLeaderAssignmentNotifications`, folds results into the bell dropdown, deep-links to `/department/sec-core?tab=sundayLeader`.
- `departmentTabs.js` — `sec-core` case added, but as `['summary', 'directorBoard', 'sundayLeader', 'finance', 'operations']` (still includes `operations`, no `planning`).
- `departmentSubpages.js` — labels/icons for `directorBoard`/`sundayLeader` already added.
- Everything Sec-Core-specific lives as named exports inside the single `SecCoreSummary.jsx` file — it was **not** split into separate files, and per the file-split decision below, won't be.
- Unrelated, separate in-progress work is mixed into the same uncommitted diff (`FinanceTabBar`, expense/budget approval-status fields, rewrites of `AdvancePayoutTab.jsx`/`DeptExpenseTab.jsx`/`BudgetPage.jsx`) — out of scope for this spec; left untouched by it.

**What this spec still needs to add on top of that baseline:**
1. Change `DirectorBoardPage`'s Board Agenda from a clickable sub-tab to a collapsed-by-default collapsible card (see §1).
2. Psalm-per-Sunday assignment (dropdown, auto-suggested) and JPEG schedule export, added into the existing month-grid `SundayLeaderTab` (see §2).
3. Remove `operations` from `sec-core`'s tab list; promote `planning` to top-level (see §3).

## Tabs

`getDepartmentHubTabs('sec-core')`:

| Before | After |
|---|---|
| `['summary', 'finance', 'operations']` | `['summary', 'directorBoard', 'sundayLeader', 'planning', 'finance']` |

- `summary` keeps its existing label ("Hub") and default-landing behavior — no special-casing needed in `DepartmentHub`'s tab-resolution effect, since every other department already defaults to `summary` when `?tab=` is absent or invalid.
- `directorBoard` → label "Director Board"; `sundayLeader` → label "Sunday Leader" (new cases in `getTabLabel`/`getTabIcon`, `src/utils/departmentSubpages.js` — already added).
- `planning` and `finance` already have generic labels/icons/render blocks (`activeTab === 'planning'` / `'finance'` have no slug restriction) — no new code needed for them beyond the tab-list change.
- No `operations` or `boardAgenda` keys exist for `sec-core`.

## Component File Layout

**Stays one file.** `src/pages/seccore/SecCoreSummary.jsx` remains the single home for `SecCoreAnalyticsHub`, `DirectorBoardPage` (roster + nested Board Agenda), and `SundayLeaderTab` (+ shared helpers `PersonPicker`, `dur`, `POSITION_STYLES`, `monthSundays`), all as named exports. No new files, no file deletion.

## 1. Director Board tab (`directorBoard`)

- Roster UI (`DirectorBoardTab`, already updated in the baseline to the `+` floating-button/modal "Add Person" flow) stays as-is: three columns (Secretaries / Directors / Coordinators), add/edit/remove via `MemberForm` + `PersonPicker`, backed by `subscribeToDirectorBoard` / `setSecCoreDirectorBoard`.
- **Change from baseline:** `DirectorBoardPage`'s current two-tab strip ("Board Overview & Leadership" / "Board Agenda", `subTab` state) is replaced with a collapsible card, **collapsed by default**:
  - Renders `DirectorBoardTab` directly (no sub-tab switch needed to see the roster).
  - Below it, a `▸ Board Agenda` header row (chevron rotates on expand), local `useState` toggle — no URL/query-param state.
  - Expanded content is the existing `BoardAgendaTab` component, rendered unchanged (Sunday date chips, unscheduled-points inbox, A5 agenda sheet, fix/unfix slot editing) — same `subscribeToBoardPoints` / `updateBoardPoint` calls, no logic changes to it.
- No standalone `boardAgenda` route or nav tile exists anywhere in the app.

## 2. Sunday Leader tab (`sundayLeader`)

Kept as the already-built month-grid page: `monthCursor` state, Prev/Next month nav, one `SundayLeaderRow` per Sunday in the displayed month, `+` button opening `SundayLeaderPoolModal` (pool management via `PersonPicker`), "Save Month Schedule" batch-writing the whole month via `setSecCoreSundayLeaderMonth` and firing `createSundayLeaderAssignmentNotification` for each leader/co-leader that resolves to a real app account. Leader and Co-Leader both remain `<select>`s populated from the pool. Notifications continue to flow through the bell pipeline (`useActionNotifications.js` → bell dropdown → deep-link to `/department/sec-core?tab=sundayLeader`) — no separate My Workspace banner is added.

### Psalm-per-Sunday (new)

New `psalm` field (string, "1"–"150") on the same `sec_core_sunday_leader/{dateStr}` doc, alongside `leader`/`coLeader`/`notes`:

- `EMPTY_LEADER_FORM` gains `psalm: ''`.
- `SundayLeaderRow` gains a third `<select>` ("Psalm 1" … "Psalm 150") next to Leader/Co-Leader in edit mode, and a "Psalm {n}" line in the read-only (non-`canEdit`) view alongside Leader/Co-Leader/Notes.
- `isDirty(date)` compares `psalm` too, in both the "has a saved entry" and "no saved entry yet" branches.
- `handleSaveMonth`'s `payload` includes `psalm` per date; `setSecCoreSundayLeaderMonth` persists it in the same batch write as `leader`/`coLeader`/`notes`.

**Auto-suggested default:** the month-load effect (`Promise.all(sundaysInMonth.map(date => getSecCoreSundayLeaderEntry(date)))`) is extended to also fetch the entry for exactly 7 days before the month's first Sunday (`format(subWeeks(new Date(sundaysInMonth[0]), 1), 'yyyy-MM-dd')`), so the very first row in the grid has a prior-Sunday reference even when it falls in the previous month. Walking the month's Sundays in date order, whenever a row's loaded `psalm` is empty, it's pre-filled with the previous Sunday's `psalm + 1` (wrapping `150 → 1`), chaining forward through consecutive blank rows so a fully-empty month still suggests a smooth increasing sequence. This is a starting suggestion only:
- It never overwrites an already-saved `psalm` on a loaded entry.
- The admin can freely pick any other Psalm before saving.
- If there's no prior-Sunday `psalm` to chain from (first-ever entry), the dropdown starts unselected.

### Export Schedule (JPEG) (new)

"Export Schedule" button in the page header (next to the `+` pool button), visible when `canEdit`. On click:
1. Fetches **every** `sec_core_sunday_leader` entry on record via a new unbounded `getAllSecCoreSundayLeaderEntries()` (the existing `getSecCoreSundayLeaderEntries(count)` caps at a limit — wrong shape for "however many Sundays are assigned, that many," not a fixed monthly/count window), sorted chronologically ascending.
2. Builds an off-screen styled DOM node (ROL Church header band, one row per entry: date, Leader (+ Co-Leader if set), Psalm) appended to `document.body` positioned off-screen (`position: fixed; left: -9999px`), and snapshots it with **html2canvas** (new dependency, added to `package.json`) → canvas → `toBlob('image/jpeg', 0.92)`. The node is removed immediately after capture.
3. Triggers a download via a temporary `<a download>` link + `URL.createObjectURL`, the same download mechanic `WorshipWorkspaceWidget.generateAndSharePlan` already uses (`src/components/workspace/WorshipWorkspaceWidget.jsx:380-388`), though that function hand-draws on `<canvas>` directly rather than using html2canvas.

## 3. Operations removed, Planning promoted

- `operations` is dropped from `getDepartmentHubTabs('sec-core')` entirely. Its former children (Team, Sub Department) were only ever reachable via `?tab=operations&opsSub=team|subDepartment`; with `operations` gone, they become unreachable for Sec-Core with no further code changes — `getDepartmentSubpages` only generates children for tabs present in the department's tab list.
- `planning` moves from an Operations child (`opsSub=planning`) to a real top-level tab key. Its render block in `DepartmentHub.jsx` (`activeTab === 'planning' || (activeTab === 'operations' && opsSubTab === 'planning')`, ~line 3873) already has no slug restriction, so it renders correctly the moment `planning` is a real tab — no new Planning UI code needed.
- **Stale links:** any old `?tab=operations` (or `&opsSub=...`) link for Sec-Core no longer matches `nextTabs`, so `DepartmentHub`'s existing fallback (`else { setActiveTab('summary') }`) lands the user on the Analytics Hub instead of erroring or blanking — no explicit redirect route needed.

## Data Model

| Doc/Collection | Path | Shape | Status |
|---|---|---|---|
| Sunday Leaders Pool | `sec_core/sunday_leader_pool` | `{ members: [{ personId, name }], updatedBy, updatedAt }` | Already implemented |
| Sunday Leader entry | `sec_core_sunday_leader/{dateStr}` | `{ date, leader, coLeader, notes, psalm, updatedBy, updatedAt }` | `psalm` is new; rest already implemented |
| Leader assignment notifications | `sec_core_leader_assignment_notifications/{uid}_{date}_{role}` | `{ uid, date, role, name, createdBy, createdAt }` | Already implemented |

No `firestore.rules` changes needed for `psalm` (additive field on an already-covered doc) or for the export feature (read-only, same collection/rule as everything else in `sec_core_sunday_leader`).

New `src/services/firestore.js` function:
- `getAllSecCoreSundayLeaderEntries()` — unbounded read of every `sec_core_sunday_leader` doc (no `limit()`), for the JPEG export. Same collection/schema as `getSecCoreSundayLeaderEntries`, just no count cap.

### New Dependency

`html2canvas` — added to `package.json` for the Export Schedule feature (§2). No other dependency changes.

## File Changes

Relative to the current uncommitted working-tree state (not relative to `HEAD`) — i.e. these are the remaining changes needed on top of the baseline described above.

| File | Change |
|---|---|
| `package.json` | Add `html2canvas` dependency |
| `src/constants/departmentTabs.js` | `sec-core` case: drop `operations`, add `planning` → `['summary', 'directorBoard', 'sundayLeader', 'planning', 'finance']` |
| `src/services/firestore.js` | Add `getAllSecCoreSundayLeaderEntries`; add `psalm` to `setSecCoreSundayLeaderMonth`'s per-entry write |
| `src/pages/seccore/SecCoreSummary.jsx` | `DirectorBoardPage`: replace the `subTab`/sub-tab-strip implementation with `DirectorBoardTab` + collapsible Board Agenda card. `SundayLeaderTab`/`SundayLeaderRow`: add `psalm` field (state, select, read view, dirty-check, prior-Sunday auto-suggest), add Export Schedule button (html2canvas) |
| `src/pages/DepartmentHub.jsx` | No changes needed — `directorBoard`/`sundayLeader`/`summary`(`SecCoreAnalyticsHub`) render blocks already wired in the baseline; `planning`/`finance` already generic, work automatically once `planning` is in `sec-core`'s tab list |

## Out of Scope / Non-Goals

- No `firestore.rules` changes.
- Co-Leader stays — not removed (reversed from this doc's earlier drafts; see Reconciliation Note).
- No bell/dismiss/deep-link changes — the existing `sec_core_leader_assignment_notifications` pipeline is kept as-is, not replaced with a banner (reversed from this doc's earlier drafts; see Reconciliation Note).
- No assigned "Psalm reader" role — Psalm is a reference/content field only, not a separate person assignment.
- No change to historical Director Board or Board Agenda data or behavior.
- No change to Analytics Hub's data sources, KPI logic, chart design, or file location (see its own spec) — it's already implemented in the baseline and this spec doesn't touch it.
