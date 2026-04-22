# Cell Director Dashboard — Design Spec

**Date:** 2026-04-22  
**Status:** Approved for implementation

---

## Summary

Upgrade the Cell Director's experience across three surfaces:

1. **Director Summary tab** (`DepartmentHub.jsx`, cell slug) — full cockpit-first layout with stat cards, pending approvals, unassigned visitor tracker, and integrated charts.
2. **Leader deactivation flow** (`ShepherdView.jsx`) — add a required reason text box before submitting a deactivation request.
3. **Firestore** (`firestore.js`) — one new query function for recent Sunday reports.

---

## 1. Director Summary Tab — Cockpit-First Layout

### 1.1 Stat Cards Row (4 cards)

| Card | Colour | Value | Source |
|------|--------|-------|--------|
| Pending Approvals | Amber | Count of `cell_member_pending_changes` docs with `status === 'pending'` | `getCellMemberPendingChanges()` |
| Active Cells | Green | Count of active cell groups in scope | `getCellGroups('Cell')` filtered |
| Total Members | Blue | Sum of active member counts across all cells | Derived from the shared member fetch (see note below) |
| Unassigned | Purple, clickable | Repeat visitors not yet in any cell | Derived from the shared member fetch (see note below) |

The **Unassigned** card has a "tap to view list ↗" sub-label and opens the Unassigned drawer on click.

**Shared member fetch:** "Total Members" and "Unassigned" both require all cell members. Load them once: for each active cell call `getCellGroupMembers(cellId)`, filter to `status !== 'inactive'`, build (a) a total count and (b) a lowercase name Set. These two cards show a skeleton/spinner until that fetch resolves. Pending Approvals and Active Cells load independently and resolve first.

### 1.2 Pending Member Changes Section

Section heading: "⏳ Pending Member Changes" with a live badge showing the count.

Each pending change renders as a card (amber tint, `#fffbeb` background, amber border):

- **Member name** (bold)
- **Leader name** and **Cell name** on the same line (e.g. "Leader: Priya Samuel · Grace Cell")
- **Change type tag** — pill showing "DEACTIVATE" (or "EDIT" for other types)
- **Reason block** — italic, amber left-border, showing `pendingChange.reason` (new field)
- **Two full-width buttons:**
  - **Approve (green):** calls `updateCellGroupMember(cellId, memberId, { status: 'inactive' })` then `deleteCellMemberPendingChange(id)` — removes the card immediately via optimistic local state update.
  - **Reject (red):** calls `deleteCellMemberPendingChange(id)` only — member stays active, card removed.

Empty state: "No pending member changes." in a dashed card.

Data loads when the Director opens the Summary tab (`slug === 'cell' && activeTab === 'summary'`), same as the existing pattern in `DepartmentHub.jsx`.

### 1.3 Unassigned Visitors Drawer

Opens as a bottom-sheet drawer when the Unassigned stat card is clicked.

**Data derivation (client-side, no new collection needed):**

1. Fetch last 8 Sunday report documents via new `getRecentSundayReports(8)` function.
2. Build a map: `name (lowercase) → [date strings]`.
3. Fetch all cell group members across all active cells; build a Set of lowercase names.
4. Filter the map to names **not** in the cell member Set.
5. Sort by descending week count.

**Each item in the list shows:**
- Avatar initials circle (purple)
- Full name
- "🗓 N Sundays attended" (count of appearances in the 8-report window)
- **Assign button** (purple)

**Assign interaction:**

1. Clicking "Assign ▼" opens an inline dropdown beneath that card.
2. Dropdown lists all active cell groups with their current member count (e.g. "Grace Cell — 22 members").
3. Director selects a cell; the confirm button label updates to "✓ Confirm — Add to [Cell Name]".
4. On confirm: calls `addCellGroupMember(cellId, { name, status: 'active' })`.
5. The card immediately updates to green "✓ Added to [Cell Name]" state in local UI.
6. On next data refresh the person is excluded from the unassigned list (name now exists in cell members).

Only one dropdown can be open at a time; opening a new one closes the previous.

**Auto-refresh:** No cron needed. Each Sunday when the Sunday Ministry team saves the Sunday Report (which writes `secondWeekAttendeesNames`), the data is live in Firestore. The Director's drawer fetches fresh data every time it's opened.

### 1.4 Cell Growth Chart (new)

A vertical bar chart (using existing `recharts` `BarChart`) showing active member count per cell.

- X-axis: cell short names
- Y-axis: member count
- Bars: indigo (`#6366f1`) for cells with 20+ members, lighter indigo (`#c7d2fe`) for under 20
- Title: "Active Members per Cell"
- Sub: "Current active member count across all cells you oversee"

Data: loaded together with the cells data already fetched for the Summary tab.

### 1.5 Weekly Attendance Trends Chart (existing, now integrated)

Render the existing `DirectorDashboardCellWidgets` default export from `DirectorDashboard.jsx` in the Summary tab below the Cell Growth chart. This parent component already handles its own data fetching (cell groups, latest reports) and conditionally renders the alert panel, missing-reports table, and weekly trends chart.

**Currently `DirectorDashboard.jsx` is not imported anywhere** — this is the first use of those components. Do not decompose it; just render `<DirectorDashboardCellWidgets userProfile={userProfile} />`.

---

## 2. Leader Deactivation — Reason Field

**File:** `src/pages/ShepherdView.jsx`, `MyFellowshipTab`, `handleDeactivate`

**Change:** Replace the `window.confirm()` for non-Director deactivation with a modal that includes:
- Member name in the header
- Required textarea: "Reason for deactivation *" (placeholder: "e.g. Relocated, backslidden, long absence…")
- Submit button disabled until at least 10 characters are entered
- Cancel button

On submit: calls `addCellMemberPendingChange({ ..., reason: reasonText })`.

The `reason` field is added to the `addCellMemberPendingChange` payload in `firestore.js` — stored as `payload.reason = data.reason || ''`.

**Directors** keep the direct deactivation path (no approval needed, no reason required) — `window.confirm` is acceptable there or can be a simple confirm modal without the reason field.

---

## 3. Firestore — New Function

**File:** `src/services/firestore.js`

```js
// Returns last N Sunday report documents ordered by date desc
export async function getRecentSundayReports(numWeeks = 8)
```

- Queries `sunday_reports` collection ordered by document ID descending (IDs are `yyyy-MM-dd` strings, so lexicographic sort = chronological sort).
- Limits to `numWeeks` documents.
- Returns array of `{ id, date, secondWeekAttendeesNames: string[] }` (only the fields needed for the Unassigned feature).

---

## 4. Files Changed

| File | Change |
|------|--------|
| `src/services/firestore.js` | Add `getRecentSundayReports(numWeeks)`. Add `reason` field to `addCellMemberPendingChange` payload and return shape of `getCellMemberPendingChanges`. |
| `src/components/DirectorDashboard.jsx` | Add `CellMemberGrowthChart` component (bar chart). No changes to existing exports — they stay as-is. |
| `src/pages/ShepherdView.jsx` | Replace non-Director `window.confirm` deactivation with a reason modal. Pass `reason` to `addCellMemberPendingChange`. |
| `src/pages/DepartmentHub.jsx` | Target only the `slug === 'cell' && activeTab === 'summary'` branch (~line 887 in the current file, inside the "Work Cockpit" block). Replace the existing plain `<table>` pending-changes UI in that block with the new card layout (§1.2). Add the stat cards row (§1.1), Unassigned drawer (§1.3), and `CellMemberGrowthChart` + `<DirectorDashboardCellWidgets>` below the approvals. The separate "Pending Actions" block at ~line 3712 (inside the cell detail expansion) is **not changed**. |

---

## 5. What Is Not Changing

- The existing `getCellMemberPendingChanges()` query logic — still fetches all global pending changes; Director sees all.
- The Director's direct deactivation path (no approval needed for Directors/Founders).
- The `CellReport.jsx` pending-change submission for member edits — not affected; reason field is optional in payload, so existing submissions that omit it still work.
- All other Shepherd Dashboard tabs, Cell Report tabs, and non-cell departments.

---

## 6. Open Questions / Decisions Made

| Question | Decision |
|----------|----------|
| Layout | Option A — Cockpit-First (approvals at top, charts below) |
| Unassigned data source | `sunday_reports → secondWeekAttendeesNames` |
| Week count method | Scan last 8 Sunday reports, count name appearances |
| Cross-reference method | Name-based (lowercase match) against all global cell members |
| Assign action | `addCellGroupMember` — adds as a real cell member |
| Reason field required? | Yes, minimum 10 chars, for non-Director deactivations only |
| Auto-refresh cadence | On-demand (drawer fetches fresh on open); Sunday reports updated by Sunday Ministry team naturally |
