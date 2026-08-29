# Media "Archives" tab — past Sunday crew-assignment log

**Date:** 2026-08-29
**Page:** `/department/media?tab=archives` (`DepartmentHub.jsx`, `slug === 'media'`)
**Related:** builds on `2026-08-28-media-assign-tab-dynamic-roles.md` (the
`media_schedule` collection and the Assign tab that writes it).

## Problem

The Media Assign tab shows the crew plan for one selected Sunday. Once a
different Sunday is picked, past plans are only reachable by manually stepping the
date input back one week at a time. There is no way to review serving history or
to see how often a given person has been on the crew.

## Goal

A read-only **Archives** tab listing past Sunday service dates, each expandable to
its full crew roster (Role / Slot → Assigned Person). Filterable by month and by
exact Sunday, and searchable by team-member name to surface that person's serving
history.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Nature / Description + Tech Spec / Notes columns | **Not shown.** Those fields were removed from `media_schedule` on 2026-08-28 (commit 82b1168). Archived rows are Role / Slot → Assigned Person only. |
| Filtering | Month selector + exact-Sunday date picker + member-name search, all optional and AND-combined. |
| Which Sundays appear | Past only — `date <= today` with at least one assigned member. |
| Editing from Archives | None. Read-only; edits stay on the Assign tab. |
| Component location | New self-contained component file, not inline in `DepartmentHub.jsx`. |

## Design

### A. Navigation

- `getDepartmentHubTabs('media')` (`src/constants/departmentTabs.js:15`) gains
  `'archives'`:
  `['summary', 'assign', 'team', 'upcomingSunday', 'archives', 'finance', 'operations']`.
- `getTabLabel('archives')` → `'Archives'` and `getTabIcon('archives')` →
  `Archive` already exist (`src/utils/departmentSubpages.js:76`, `:123`) — Worship
  uses them. No change to `departmentSubpages.js`.
- `DepartmentHub.jsx` gains one mount point, a sibling of the Assign block:

  ```jsx
  {slug === 'media' && activeTab === 'archives' && <MediaArchivesTab />}
  ```

  Import at the top of `DepartmentHub.jsx`. No other `DepartmentHub.jsx` change.

### B. Data — `getAllMediaSchedules()` in `src/services/firestore.js`

Mirrors `getAllWorshipSchedules` (`firestore.js:1008-1013`), placed next to the
existing Media schedule functions:

```js
export async function getAllMediaSchedules() {
  if (!db) return []
  const q = query(collection(db, 'media_schedule'), where('department', '==', 'Media'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
```

`firestore.rules` — unchanged. `media_schedule` already allows read for
`isFullAccess() || canAccessDept('Media')`.

### C. Component — `src/components/media/MediaArchivesTab.jsx`

A single default-exported component, no props. Self-contained so `DepartmentHub.jsx`
does not grow (it is ~10k lines and concurrently edited).

**State**

| State | Purpose |
|---|---|
| `rows` | loaded + filtered-to-past schedule docs, newest-first |
| `loading` | fetch in flight |
| `openIds` | `{ [docId]: true }` — which cards are expanded |
| `month` | `'yyyy-MM'` from `<input type="month">`, `''` = all |
| `date` | `'yyyy-MM-dd'` from `<input type="date">`, `''` = all; snapped to Sunday on change |
| `search` | member-name query, trimmed-lowercased for matching |

**Load effect** (runs once on mount):

```js
getAllMediaSchedules()
  .then((all) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    setRows(
      all
        .filter((s) => s.date && s.date <= today && (s.assignments || []).some((a) => a.memberId))
        .sort((a, b) => b.date.localeCompare(a.date))
    )
  })
  .catch((err) => { console.error('Failed to load Media archives', err); setRows([]) })
  .finally(() => setLoading(false))
```

**Derived filtered list** (`useMemo` on `rows, month, date, search`):

- `month` → keep `s.date.startsWith(month)`.
- `date` → keep `s.date === date`.
- `search` → keep schedules with any `a.memberId && a.memberName` whose
  lowercased name `.includes(q)`.
- All three AND together; each is a no-op when empty.

**Render**

1. **Filter bar** — month input, date input (label "Jump to Sunday"), name search
   input. A "Clear filters" text button shows only when `month || date || search`.
   When `search` is non-empty, a line above the list: `"{Name} served {n}
   Sunday(s)"` using the count of filtered rows (`n`), where `{Name}` echoes the
   raw search text.
2. **Expand / Collapse all** — toggles every filtered card's `openIds` entry;
   label flips based on whether all filtered rows are currently open. Hidden when
   the filtered list is empty.
3. **Cards** — one per filtered schedule, newest-first:
   - Header button (toggles `openIds[s.id]`): a check icon, the date formatted
     `format(new Date(s.date + 'T12:00:00'), 'EEE d MMM yyyy')` (raw string on
     parse failure), a chevron that rotates when open.
   - Body (when open): for each `s.assignments` entry with a `memberId`, a row —
     Role / Slot pill (indigo, `a.role`) on the left, `a.memberName` on the
     right. Rows keyed by `a.subDeptId || a.role`. If `search` matches this
     person, the row gets a highlight ring. Below the rows, faint `Saved by
     {s.updatedBy}` when present. If somehow no assigned rows: "No crew recorded
     for this date."
4. **States**:
   - `loading` → "Loading archives…"
   - not loading, `rows.length === 0` → "No past Sundays archived yet."
   - not loading, `rows.length > 0` but filtered list empty → "No Sundays match
     these filters."

Visual language matches the Assign tab's stamp (indigo Role pills, slate card
chrome, `rounded-2xl border border-slate-200 shadow-sm`). The expand/collapse is
a plain conditional render (`{openIds[s.id] && (…)}`), the same as the Assign
stamp's `{mediaStampOpen && (…)}` — no Framer Motion, no transition.

### Out of scope

- No Nature / Tech Spec fields or their re-introduction.
- No editing, deleting, or re-opening a past plan from Archives.
- No upcoming/scheduled Sundays.
- No CSV/PDF export.
- No per-person aggregate analytics beyond the "served n Sundays" count.
- No realtime subscription — the list loads once per tab visit.

## Files touched

| File | Change |
|---|---|
| `src/constants/departmentTabs.js` | add `'archives'` to Media's tab list |
| `src/services/firestore.js` | add `getAllMediaSchedules()` |
| `src/components/media/MediaArchivesTab.jsx` | **new** — the whole feature |
| `src/pages/DepartmentHub.jsx` | import + one-line mount for `slug === 'media' && activeTab === 'archives'` |

## Verification (manual, in browser)

1. Media navbar shows: Hub · Assign · The Team · Upcoming Sunday · **Archives** ·
   Finance · Operations.
2. On the Assign tab, save crew for two past Sundays and one future Sunday.
3. Archives lists the two past Sundays, newest first; the future one does not
   appear. Each card expands to Role / Slot → Person rows.
4. Month selector set to a month with one of those Sundays → only that card shows;
   clearing it restores both.
5. "Jump to Sunday" date picker set to one saved Sunday → only that card; a
   non-Sunday pick snaps forward to the nearest Sunday.
6. Type a crew member's first name → list narrows to Sundays they served,
   "{name} served N Sunday(s)" shows, and their row is highlighted inside each
   card.
7. "Expand all" opens every visible card; "Collapse all" closes them.
8. A Media department with no saved past schedules → "No past Sundays archived
   yet."
9. A non-Media user cannot read `media_schedule` (rules unchanged, still enforced).
