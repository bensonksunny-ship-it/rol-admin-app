# Founder Worklist Sheet

## Problem

The Founder keeps a handwritten "Worklist Sheet" — pages of a `No | Date | Work | RMRK` table, used to track personal follow-up tasks outside the department system. There's no digital equivalent. This adds a Founder-exclusive page for it, with nav access restricted to `isFounder` accounts only. (The original paper layout split each page into 4 colored blocks of 10 rows; the digital version has since consolidated to one continuous 30-row table per page — see Revision History.)

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
  order: 1,              // integer, controls tab ordering and fill sequence
  label: "Sheet 1",       // display name, auto-generated on create ("Sheet " + order)
  rows: [                 // fixed length WORKLIST_ROWS_PER_SHEET (30)
    { no: 1, date: '', work: '', doneDate: '' },
    /* ... x30 */
  ],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}
```

- `no` is fixed 1–30 at creation time and never edited by the user.
- `date` and `doneDate` are `yyyy-MM-dd` strings (native `<input type="date">` values); `work` is free text.
- Data is **shared across all Founder accounts** (not per-user) — same pattern as `AdminUserManagement`'s user list and `PeopleDirectory`'s roster. Any Founder sees and edits the same set of sheets.
- Single-cell edits are a read-modify-write on the whole `rows` array (see Revision History bug-fix entry below for why — Firestore dotted-path updates can't index into arrays): the caller passes the current `rows` array (already in hand from the live subscription) and the write replaces the whole field with one row changed.

## Firestore Rules

New match block in `firestore.rules`, alongside the other top-level collections:

```
match /worklist_sheets/{sheetId} {
  allow read, write: if isFullAccess();
}
```

`isFullAccess()` already resolves to Founder (custom claim, with legacy `role == 'Founder'` fallback) — no department scoping needed since this isn't department data.

## New `firestore.js` Functions

- `WORKLIST_ROWS_PER_SHEET` — exported constant, `30`.
- `subscribeWorklistSheets(onChange)` — `onSnapshot` on `query(collection(db, 'worklist_sheets'), orderBy('order'))`, returns unsubscribe. Matches the existing `subscribeTasksByDepartment` pattern.
- `createWorklistSheet(order, label)` — builds the 30-row skeleton described above and `addDoc`s it.
- `updateWorklistCell(sheetId, rows, rowIndex, field, value)` — read-modify-write on the whole `rows` array for one cell (`field` is `'date' | 'work' | 'doneDate'`).
- `updateWorklistWork(sheetId, rows, rowIndex, work, hadDate)` — same mechanism for the `Work` cell specifically; also auto-stamps `date` with today if the row didn't already have one (see below).
- `clearWorklistRow(sheetId, rows, rowIndex)` — same mechanism, blanks `date`/`work`/`doneDate` for one row without removing the row slot.
- `deleteWorklistSheet(sheetId)` — `deleteDoc`, used by the tab's delete (×) control.
- `resetWorklistSheetRows(sheetId)` — overwrites `rows` with a fresh empty skeleton; recovery path for a sheet corrupted by the array dot-path bug (or still carrying the old pre-flatten `blocks` shape).

## Component: `src/pages/WorklistSheet.jsx`

- **Sheet tabs** at the top: one tab per sheet ordered by `order`. No manual "add sheet" control — see Automatic Paging below. Each tab has a small `×` that requires a second confirming click (arms on first click, deletes on second, matching common "click again to confirm" destructive-action patterns) before calling `deleteWorklistSheet`.
- **Single full-width table** below the tabs: the active sheet's `rows` array renders directly as one continuous table, columns `No | Date | Work | RMRK`, `No` shown from the stored `row.no` (1–30). No color blocks or borders.
- **Inline editing**: clicking a `Work` cell turns it into a text `<input>`; clicking `Date`/`RMRK` turns it into `<input type="date">`. Saves on blur via `updateWorklistCell`/`updateWorklistWork`. `No` cells are always static text, never editable.
- **Row clear**: a small `×` per row calls `clearWorklistRow`.
- Live-synced via `subscribeWorklistSheets` in a `useEffect`, consistent with the rest of the app's realtime-subscription pattern — edits from another Founder session appear without a refresh.

### Automatic Paging

No manual "add sheet" step. A second `useEffect`, keyed off the live `sheets` list, handles both bootstrapping and overflow:

- **First-ever load** (`sheets.length === 0` once the subscription has resolved): auto-creates `Sheet 1` and switches to it.
- **Current last sheet fills up**: a sheet counts as "full" when every one of its 30 rows has a non-empty `work` value (Date/RMRK don't count — Work is the entry that matters). When the highest-`order` sheet becomes full, the effect auto-creates the next sheet (`order + 1`) and switches the active tab to it, so the Founder's next keystroke lands on a fresh page without any explicit action.
- An `autoCreatingRef` guard (`useRef`) prevents the effect from firing a second create while the first is still in flight — otherwise an unrelated Firestore update elsewhere in the same sheet (which also re-triggers the `sheets` dependency) could double-create a page during the async window before the new sheet appears in the subscription.
- Deleting the last remaining sheet re-triggers the `sheets.length === 0` branch, so the page is never left in a true empty state — a fresh Sheet 1 appears automatically.

## Revision History

- **2026-08-21**: Display layout changed from a 2×2 grid of 4 separately-bordered color blocks to a single full-width table per sheet (all 40 rows, continuous numbering, no color borders). Requested as a follow-up UI refactor; data model (`blocks[4].rows[10]`) and all Firestore functions are unchanged.
- **2026-08-21**: `Date` auto-populates with today (`new Date().toISOString().slice(0,10)`, matching the codebase's existing date-string convention) the first time `Work` is typed into a still-blank row. New `updateWorklistWork(sheetId, blockIndex, rowIndex, work, hadDate)` function bundles the `work` write with a conditional `date` write in one `updateDoc` call; `hadDate` (derived from the row's current `date` in the UI) prevents overwriting a manually-entered or already-auto-set Date on subsequent edits.
- **2026-08-21 (bug fix)**: The original `updateWorklistCell`/`updateWorklistWork`/`clearWorklistRow` used Firestore dotted-path updates (`blocks.${i}.rows.${j}.field`) to target one cell. Firestore's dotted-path updates only descend through nested **maps** — they can't index into an **array** element. Since `blocks` is an array, the first cell edit on any sheet silently turned `blocks` from an array into a map (a literal field key `"2"` written onto it), which then crashed every reader expecting `blocks.forEach` to exist ("sheet.blocks.forEach is not a function"). Fixed by switching all three functions to a read-modify-write on the whole `blocks` array. Superseded by the next entry, which also removes the `blocks` wrapper entirely.
- **2026-08-21 (row cap + auto paging)**: Requirement changed to a flat 30-row cap per sheet with automatic new-page creation instead of a manual "Add Sheet" button. Since the 4-color-block visual grouping had already been dropped in the single-full-width-table revision above, the `blocks[4].rows[10]` wrapper was retired entirely in favor of a flat `rows[30]` array (see Data Model) — this also resolves the awkward mismatch between the old 40-slot block structure and a 30-row cap that isn't divisible by 4. `resetWorklistSheetRows(sheetId)` replaces `resetWorklistSheetBlocks`; opening a sheet still carrying the old `blocks` shape (from before this change) hits the same "corrupted, reset" fallback UI, which is an acceptable one-time migration path given this is early-stage, low-volume Founder-only data. New automatic-paging `useEffect` described under Automatic Paging above.
- **2026-08-21 (visual polish + manual "+ New Sheet" restored)**: Follow-up styling pass: (1) `src/components/Layout/MainLayout.jsx` gained a `WIDE_LAYOUT_ROUTES` exception (currently just `/worklist`) that widens its shared content wrapper from `max-w-5xl` to `max-w-[1400px]` for that one route, instead of every page's content being capped identically — the page was reading as a narrow centered card because that wrapper (not anything in `WorklistSheet.jsx`) was the actual width constraint. (2) `SheetTab` restyled as a browser/spreadsheet-style tab: the active tab merges into the table panel below it (`-mb-px`, matching background, no bottom border) while inactive tabs sit recessed in a muted strip. (3) A manual **"+ New Sheet"** button sits after the tabs again — reinstated alongside (not instead of) the automatic-paging effect from the previous revision, so the Founder can start a fresh page on demand as well as having one appear automatically when the current page fills. (4) Table row height, cell padding, and font size increased (`min-h-[40px]`, `px-3 py-2.5`, `text-sm`); added zebra striping (`odd`/`even` row background), vertical grid-line borders between columns, and a row hover highlight, so empty cells read as an interactive spreadsheet grid rather than a plain list.
- **2026-08-21 (Add Work shortcut)**: A small toolbar strip above the table (`{filled} / {total} tasks` counter plus an **"+ Add Work"** button) jumps the Founder straight to the next empty row instead of requiring them to scroll and hunt for one. `EditableCell` gained `autoEdit`/`onAutoEditHandled` props — an external trigger can drop a specific cell into edit mode (with `scrollIntoView`) without the cell needing to know why; used here to auto-focus the Work field of the first row where `work` is still blank. Button disables itself when the sheet has no empty row left (the auto-paging effect will shortly create the next sheet in that case).
- **2026-08-21 (Completed + Duration columns)**: The `doneDate` column header changed from "RMRK" to **"Completed"** — it was already a date-of-completion field (see the 2026-08-21 Automatic Date entry above), just ambiguously labeled. Added a new read-only **"Duration"** column showing a compact elapsed-time label since that completion date (`formatDurationSince`: "Today", "1 day", "Nd", "Nw", "Nmo", "Ny"), blank (`—`) when `doneDate` isn't set. Computed at render time from the client's current time — not stored, not live-updating while the page stays open, refreshes on next reload/edit.
- **2026-08-21 (Completed field defaults to today)**: `EditableCell` gained an `autoFillToday` prop, applied only to the Completed (`doneDate`) cell. Entering edit mode (`startEditing`, fired by both `onClick` and `onFocus` now, not just click) on an *empty* Completed cell seeds the draft with today (`new Date().toISOString().slice(0,10)`) instead of leaving the date picker blank — the value is still just a draft at that point, so the Founder can change it before it saves on blur, and an already-filled cell is left untouched. `onFocus` was added to the cell's display-mode button alongside the existing `onClick`, so keyboard-tabbing into a cell also opens it for editing, matching "clicking on or focusing" from the request — this applies to every column, not just Completed, but the today-default behavior itself only fires where `autoFillToday` is set.
- **2026-08-21 (Duration redefined as entry→completion span)**: `formatDurationSince(doneDate)` ("time since completion, relative to now") replaced with `formatDuration(date, doneDate)` — the Duration column now shows how long the task took from its entry `Date` to its `Completed` date, not how long ago it was completed. Needs both dates set or shows `—`; a same-day or (malformed) negative span shows "Same day" rather than the old "Today" wording, since the column is now a duration/span, not a countdown-from-now.
- **2026-08-21 (Completed shown in green)**: `EditableCell` gained a `success` prop — when set and the cell has a value, its displayed text renders emerald (`text-emerald-600`/`dark:text-emerald-400`, bold) instead of the default slate. Applied only to the Completed (`doneDate`) cell, so a filled-in completion date reads as a clear "done" signal; the column header text is emerald too, for the same at-a-glance association. Empty Completed cells are unaffected (still the muted placeholder dash).
- **2026-08-21 (Department column)**: Added a `department` field to each row (`makeWorklistRows` in `firestore.js`; blanked along with the other fields by `clearWorklistRow`) and a new **Department** column between Work and Completed, rendered as a native `<select>` (`DepartmentCell` in `WorklistSheet.jsx`) rather than the click-to-edit `EditableCell` pattern — a dropdown doesn't need a separate edit-mode toggle, `onChange` commits immediately. Options are `DEPARTMENT_LIST` from `src/constants/departments.js` (the same canonical department list used by `Departments.jsx`/`AdminUserManagement.jsx`), labeled via the existing `displayDeptName` helper, so the list never drifts out of sync with the rest of the app as departments are added or renamed there.
- **2026-08-21 (column width rebalance)**: The table switched from the browser's default auto layout to `table-fixed` with an explicit width on every column, including Work (previously the only column with no width — under auto layout it silently absorbed all left-over space, which is what squeezed Department down to ellipsis-truncated text for longer names like "Event Management"). New widths: No 48px, Date 128px, Work 256px (down from unconstrained), Department 192px (up from 144px — fits "Event Management"/"Sunday Ministry" without truncating), Completed 128px, Duration 80px, clear-button gutter 40px; table `min-w` raised to 900px to match. Under `table-fixed`, cell content that's still too long to fit truncates via the existing `truncate` class on `EditableCell` rather than resizing the column.

## Out of Scope

- No per-user worklists — single shared dataset for all Founder accounts.
- No row count beyond 30 per sheet, and no manual control to add rows or pages — full pages hand off to a new page automatically (see Automatic Paging).
- No color-coded grouping — retired along with the `blocks` wrapper; sheets are a single continuous table.
- No search/filter across sheets — this is a small, low-volume personal tracker, not a searchable archive.
