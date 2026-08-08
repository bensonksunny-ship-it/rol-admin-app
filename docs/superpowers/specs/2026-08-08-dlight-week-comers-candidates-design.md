# D-Light Follow-Up: Week Comers — Candidate Recommendation Overhaul

**Date:** 2026-08-08
**Status:** Approved

## Overview

The "Follow-Up: Week Comers" panel (`/department/d-light?tab=visitorEntry`, inside `DepartmentHub.jsx`) lets D-Light mark returning visitors as Second/Third/Fourth Week comers directly onto a `sunday_reports` doc. Candidates for Third and Fourth Week are currently sourced from a fragile chain: whoever Sunday Ministry confirmed in the bucket one step down *last week*. If a leader forgets to mark someone, that person silently drops out of the chain and never resurfaces.

This spec replaces that chain for Third and Fourth Week with a direct, self-healing attendance-count filter, and adds a manual search-and-add escape hatch to all three cards for people the automatic filters miss entirely.

## Part 1 — Attendance-count candidate filter (Third & Fourth Week)

### Data layer (`src/services/firestore.js`)

Add `getSundayAttendanceCountsByNameInRange(startDateStr, endDateStr)`:
- Queries `sunday_reports` where `date >= startDateStr` and `date <= endDateStr` (every write path already sets `date` to the doc's own Sunday-date ID, so this is a reliable range key).
- Aggregates name occurrences per doc using the same fields as the existing all-time `getSundayAttendanceCountsByName`: `nonCell`, `others`, `newComers`, `secondWeekAttendeesNames`, `thirdWeekAttendeesNames`, `fourthWeekAttendeesNames`, and each array inside `sundayCellAttendance`.
- Refactor the per-doc aggregation into a shared local helper so both the all-time and ranged functions use identical counting logic (no duplicated field lists).
- Returns `Map<lowercasedName, count>`, same shape as the existing function.

### Candidate computation (`src/pages/DepartmentHub.jsx`)

In the week-comer candidate effect (currently ~line 1378), replace the Third and Fourth Week computations with a shared helper:

```
computeAttendanceCandidates(days, requiredCount, alreadyMarkedSet)
  windowStart    = weekComerDate − days
  countRangeEnd  = weekComerDate − 1 day   // attendances *before* the Sunday being decided
  candidates     = delightVisitors
                      .filter(v => v.attendedDate is in [windowStart, weekComerDate])
                      .filter(v => countsInRange.get(name) === requiredCount)
                      dedupe by lowercased name
                      minus alreadyMarkedSet
```

Applied as:
- `thirdCandidates  = computeAttendanceCandidates(90, 2, alreadyThird)`
- `fourthCandidates = computeAttendanceCandidates(120, 3, alreadyFourth)`

Both ranged-count queries run inside the existing `Promise.all` alongside `getSundayReport(weekComerDate)`. The `getSundayReport(lastWeekStr)` fetch is removed — it was only ever used to seed the old Third/Fourth Week chains, and nothing else in this effect needs it once those chains are gone.

**Unchanged:** Second Week logic (D-Light visitors whose `attendedDate` falls in last week's 7-day window) stays exactly as-is — it's a different signal (first-visit timing, not attendance count) and wasn't part of this request.

**Unchanged:** the "already marked" exclusion (skip names already present in the target Sunday's `secondWeekAttendeesNames` / `thirdWeekAttendeesNames` / `fourthWeekAttendeesNames`).

## Part 2 — Manual search & add (Second, Third, Fourth Week cards)

### Purpose

The automatic filters (join-date + exact attendance-count windows) will always miss some real cases — e.g. a visitor who came back after a longer gap than the window covers. Manual add is a deliberate override with **no validation** against the card's own filter: any D-Light visitor can be added to any card. Attendance counts stay accurate regardless of how a name reached the report, because marking someone present writes into the same `secondWeekAttendeesNames`/`thirdWeekAttendeesNames`/`fourthWeekAttendeesNames` arrays that `getSundayAttendanceCountsByName(...)` already reads — auto-recommended and manually-added chips are indistinguishable once marked.

### UI

- A `+ Add` button in each card's header (Second/Third/Fourth Week), next to the bucket label.
- Clicking it opens an inline name-prefix search input inside that card (same visual/interaction pattern as the panel's existing "Search visitors across all years" bar).
- Filters `delightVisitors` by name-prefix match (same logic as the existing `visitorSearchResults` filter: `name.startsWith(q) || name.split(' ').some(word => word.startsWith(q))`), capped to a handful of results.
- Selecting a result appends the name to `weekComerCandidates[bucket]` if not already present (case-insensitive dedupe against the current list). No Firestore write happens at this point.
- The search box closes and resets after a selection.

### New state

- `weekComerAddOpenBucket: 'second' | 'third' | 'fourth' | null` — which card's inline add-search is open.
- `weekComerAddQuery: string` — the open card's search text.

### Reused, unchanged

- Chip rendering: the existing `weekComerCandidates[bucket].map(...)` loop already renders whatever is in the array — manually-added names need no new rendering path and are visually identical to auto-recommended chips.
- Tap-to-mark: `markWeekComer(bucket, name)` already handles writing the name into the Sunday report and removing it from the local candidate list — no changes needed here either.

## File Changes

| File | Change |
|------|--------|
| `src/services/firestore.js` | Add `getSundayAttendanceCountsByNameInRange`; extract shared per-doc aggregation helper from `getSundayAttendanceCountsByName` |
| `src/pages/DepartmentHub.jsx` | Replace Third/Fourth Week candidate computation with `computeAttendanceCandidates`; drop the now-unused `lastWeekReport` fetch; add manual search-and-add UI + state to all three Week Comer cards |

## Out of scope

- The Sec Core "View full board agenda" link removal (separate, unrelated request — tracked outside this spec).
