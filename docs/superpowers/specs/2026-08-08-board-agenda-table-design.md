# Board Agenda Modal — Structured Table Refactor

**Date:** 2026-08-08
**Status:** Approved

## Overview

The Board Agenda modal (`BoardAgendaDrawer` + `BoardAgendaTab` in `src/pages/seccore/SecCoreSummary.jsx`, opened from `/department/sec-core?tab=directorBoard` via the "View full board agenda" link or a scheduled meeting row) currently renders submitted discussion points as a stack of cards inside a narrow (`max-w-xl` drawer, 480px inner sheet) "A5 agenda sheet." Departments that haven't submitted a point for the selected Sunday don't appear at all.

This spec widens the modal and replaces the card stack with a structured table that always lists every department — submitted or not — with an explicit empty state for the latter.

## Modal Width

- `BoardAgendaDrawer`: `max-w-xl` → `max-w-4xl`.
- `BoardAgendaTab`'s agenda sheet container: remove the `style={{ maxWidth: 480 }}` cap, let it fill the wider drawer (`w-full`).
- Unchanged: the "no date assigned" (unscheduled inbox) and "no meeting scheduled" empty-state cards keep their existing narrow width — they're unrelated to the table.

## Director Name Resolution

- New one-time fetch on `BoardAgendaTab` mount: `getAllUsers()` (existing function, `src/services/firestore.js`).
- For each department, resolve its director by scanning the fetched users with the existing `getDepartmentRole(user, departmentName)` helper (`src/utils/access.js`), taking the first user for whom it returns `'DIRECTOR'`.
- No match → render `—`.

## Department Rows

- Source: `DEPARTMENT_LIST` (`src/constants/departments.js`), **excluding Sec-Core** (17 departments) — Sec-Core runs the meeting rather than submitting a point to its own agenda.
- Rendered in `DEPARTMENT_LIST` order (not alphabetical, not sorted by submission status) — stable, predictable meeting to meeting.

## Table Structure

Replaces the existing `sortedPoints.map(...)` card-list block. Only rendered when `hasScheduledMeeting` is true (same gate as today — the "no meeting scheduled" and "no date" empty states are unchanged).

Columns: **Department | Director Name | Discussion Point | Requested Time | Time Allotted | Actions**

Row source per department: that department's points for `selectedDate` (existing `datePoints` filter, same sort as today — fixed points by `slNo` first, then unfixed).

- **Department with ≥1 point:** one row per point. Department and Director Name cells repeat on each consecutive row for that department (no rowSpan merging).
  - Discussion Point: `bp.point`
  - Requested Time: `bp.timeNeeded || '—'`
  - Time Allotted: once fixed (`bp.slNo && bp.allottedTime`), shows `#{slNo} · {time window}` — the order number folded in here since the table has no separate order column. `{time window}` uses the existing live-computed `fixedPointTimes` value, falling back to `bp.allottedTime` exactly as today. Blank while unfixed.
  - Actions: the existing per-point controls, relocated into this cell:
    - Unfixed + `canEdit`: the duration-input + "Accept Point" flow (`editId`/`editVals` state, `handleAcceptPoint`) — unchanged logic, moved from below the point text into the Actions cell.
    - Unfixed + `!canEdit`: the existing "Awaiting schedule" badge.
    - Fixed + `canEdit`: the existing "unlock" button (`handleUnfix`).
- **Department with 0 points:** exactly one row.
  - Discussion Point: *"No discussion points to discuss"* (muted/italic text)
  - Requested Time: `—`
  - Time Allotted: `—`
  - Actions: empty

## Unchanged

- Data model: `boardPoints` documents, `handleAcceptPoint`, `handleUnfix`, `handleAssignToDate`, the Start Time picker, the Sunday date chips, the unscheduled-points inbox panel, the "no meeting scheduled" empty state, and the footer summary (`{fixed} fixed · {unfixed} pending`, "Agenda complete" badge).
- `BoardPointsModal` (the per-department point-submission modal) — a separate component, not touched by this spec.

## File Changes

| File | Change |
|------|--------|
| `src/pages/seccore/SecCoreSummary.jsx` | Widen `BoardAgendaDrawer`; replace `BoardAgendaTab`'s card-list rendering with the department table; add `getAllUsers()` fetch + director resolution |

## Out of scope

- The Sec-Core "View full board agenda" header-link removal (separate request, on hold per user — tracked outside this spec).
- The D-Light Week Comers candidate overhaul (separate spec: `2026-08-08-dlight-week-comers-candidates-design.md`).
