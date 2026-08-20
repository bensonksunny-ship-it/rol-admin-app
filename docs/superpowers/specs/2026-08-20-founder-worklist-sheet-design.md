# Founder Worklist Sheet

## Problem

The Founder keeps a handwritten "Worklist Sheet" — pages divided into 4 colored blocks (Green, Yellow/Orange, Red/Brown, Blue), each a 10-row table of `No | Date | Work | RMRK`, used to track personal follow-up tasks outside the department system. There's no digital equivalent. This adds a Founder-exclusive page that mirrors that paper layout, with nav access restricted to `isFounder` accounts only.

## Access Gating

Two layers, matching the existing `AdminUserManagement.jsx` pattern (the app's other strictly Founder-only page):

1. **Nav visibility** — `src/components/Layout/Sidebar.jsx` adds a new `isFounder &&` gated `NavLink` to `/worklist`, placed directly after the existing People Directory item, in both `IconRail` (desktop) and `MobileDrawer` (mobile). Icon: `ClipboardList` from `lucide-react`. Label/tooltip: "Worklist Sheet".
2. **Route guard** — `src/App.jsx` adds `<Route path="worklist" element={<WorklistSheet />} />` inside the existing `ProtectedRoute → MainLayout` shell (same nesting as `people` and `admin/users`). The route itself has no separate guard; instead `WorklistSheet.jsx` early-returns for non-Founders:
   ```jsx
   if (!isFounder) {
     return <div className="p-6 text-slate-600">
       <p className="font-semibold text-slate-800 mb-2">Worklist Sheet</p>
       <p>Only Founder can access this page.</p>
     </div>
   }
   ```
   This is a direct copy of the guard already in `AdminUserManagement.jsx:105-112`, so a guessed URL is blocked even without a router-level check.

## Data Model

New top-level collection `worklist_sheets`. One document per sheet ("page"):

```js
{
  order: 1,              // integer, controls tab ordering
  label: "Sheet 1",       // display name, auto-generated on create ("Sheet " + order)
  blocks: [               // fixed length 4, index is the color slot
    { color: 'green',  rows: [ { no: 1, date: '', work: '', doneDate: '' }, /* ... x10 */ ] },
    { color: 'yellow', rows: [ /* ... x10 */ ] },
    { color: 'red',    rows: [ /* ... x10 */ ] },
    { color: 'blue',   rows: [ /* ... x10 */ ] },
  ],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}
```

- `no` is fixed 1–10 per block at creation time and never edited by the user.
- `date` and `doneDate` are `yyyy-MM-dd` strings (native `<input type="date">` values); `work` is free text.
- The 4 blocks carry no semantic meaning beyond color — they're 4 identical 10-row tables per sheet, matching the paper layout exactly (no per-block labels).
- Data is **shared across all Founder accounts** (not per-user) — same pattern as `AdminUserManagement`'s user list and `PeopleDirectory`'s roster. Any Founder sees and edits the same set of sheets.
- Nested field paths make single-cell edits cheap: `updateDoc(ref, { 'blocks.2.rows.5.work': value, updatedAt: serverTimestamp() })` — no read-modify-write race, no full-doc rewrite per keystroke-blur.

## Firestore Rules

New match block in `firestore.rules`, alongside the other top-level collections:

```
match /worklist_sheets/{sheetId} {
  allow read, write: if isFullAccess();
}
```

`isFullAccess()` already resolves to Founder (custom claim, with legacy `role == 'Founder'` fallback) — no department scoping needed since this isn't department data.

## New `firestore.js` Functions

- `subscribeWorklistSheets(onChange)` — `onSnapshot` on `query(collection(db, 'worklist_sheets'), orderBy('order'))`, returns unsubscribe. Matches the existing `subscribeTasksByDepartment` pattern.
- `createWorklistSheet(order, label)` — builds the 4-block/40-row skeleton described above and `addDoc`s it.
- `updateWorklistCell(sheetId, blockIndex, rowIndex, field, value)` — single nested `updateDoc` call for one cell (`field` is `'date' | 'work' | 'doneDate'`).
- `clearWorklistRow(sheetId, blockIndex, rowIndex)` — same mechanism, blanks `date`/`work`/`doneDate` for one row without removing the row slot.
- `deleteWorklistSheet(sheetId)` — `deleteDoc`, used by the tab's delete (×) control.

## Component: `src/pages/WorklistSheet.jsx`

- **Sheet tabs** at the top: one tab per sheet ordered by `order`, plus a trailing `+ Add Sheet` button that calls `createWorklistSheet(nextOrder, "Sheet " + nextOrder)` and switches to it. Each tab has a small `×` that requires a second confirming click (arms on first click, deletes on second, matching common "click again to confirm" destructive-action patterns) before calling `deleteWorklistSheet`.
- **2×2 grid** below the tabs, one `WorklistBlock` sub-component per color (`emerald` green, `amber` yellow/orange, `rose`/`orange-800` red/brown, `blue`), each a bordered card containing a 10-row table: columns `No | Date | Work | RMRK`.
- **Inline editing**: clicking a `Work` cell turns it into a text `<input>`; clicking `Date`/`RMRK` turns it into `<input type="date">`. Saves on blur via `updateWorklistCell`. `No` cells are always static text, never editable.
- **Row clear**: a small `×` per row calls `clearWorklistRow`.
- Live-synced via `subscribeWorklistSheets` in a `useEffect`, consistent with the rest of the app's realtime-subscription pattern — edits from another Founder session appear without a refresh.
- Empty state: if no sheets exist yet (first-ever load), show a single "Create your first sheet" call-to-action that calls `createWorklistSheet(1, "Sheet 1")`.

## Out of Scope

- No per-user worklists — single shared dataset for all Founder accounts.
- No row count beyond 10 per block — matches the physical sheet exactly, no expand control.
- No block relabeling — colors are fixed, purely visual grouping.
- No search/filter across sheets — this is a small, low-volume personal tracker, not a searchable archive.
