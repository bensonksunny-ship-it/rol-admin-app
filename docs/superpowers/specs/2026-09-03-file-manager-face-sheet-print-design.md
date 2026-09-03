# File Manager — File Detail View + Auto-Print Face Sheet — Design

## Context

The File Manager (`/files`, Founder-only) already has a complete project-file
registry with a printable cover/face sheet — see
`docs/superpowers/specs/2026-08-26-file-manager-design.md`. The existing pieces:

- `src/pages/FileManager.jsx` — the registry table, search/filter, New Entry,
  Excel import, row-click → face sheet overlay, `⋮` row menu (Edit / Delete).
- `src/components/CreateFileModal.jsx` — the New Entry / Edit form.
- `src/components/ProjectFileTemplate.jsx` — the A4 face sheet overlay: blue
  header banner, ROLCC + red SL No block, split two-column activity ledger,
  blue footer bar, and a **Download as PDF** button (jsPDF `doc.html()`).
- `src/components/RowActionsMenu.jsx` — the shared `⋮` menu component used across
  the Accounts ledger pages and here.

This spec covers two related changes:

1. **New file → immediate face sheet + auto-print.** When a new project file is
   created, its face sheet opens and the browser print dialog fires
   automatically, so the Founder just picks a printer and prints the sheet to
   place inside the physical file.
2. **Row click now opens a file detail view** (days-since-started, status
   controls, activity summary) instead of jumping straight to the face sheet.
   The face sheet becomes an explicit action in the `⋮` row menu (and a button
   inside the detail view) — this is the reprint path for older files whose
   physical face sheet is lost or torn.

## Goals

1. Creating a new project file auto-opens its face sheet and auto-triggers the
   browser print dialog.
2. The face sheet gains an explicit **Print Face Page** button (native print),
   alongside the existing Download PDF button.
3. Clicking a registry row opens a **File Detail** modal showing:
   - file name, SL No, remarks pill, closing date;
   - **days since started** (and the start date);
   - a **status control** to mark the file Active / Project Completed / Project
     Withheld / Archived;
   - a short activity summary (count + latest activity);
   - a **Face Sheet** button that opens `ProjectFileTemplate`.
4. The `⋮` row menu gains a **Face Sheet** item (above Edit / Delete) that opens
   `ProjectFileTemplate` directly.
5. The header banner colour changes to `#2b5b84`, replacing `#1E4E8C`.
6. The New Entry form auto-fills the SL number in the office's format
   `D + MM + YYYY + NNN` (see §7), pre-filled but still editable.

## Non-goals

- No changes to the activity ledger rendering, the Add Activity flow, the
  Download-as-PDF path, the Excel import, or `firestore.rules`.
- No new "print history" tracking, bulk print, or print column.
- No changes to `CreateFileModal` (status is still editable there too).

## Design

### 1. `src/components/ProjectFileTemplate.jsx`

**Colour.** Change the `HEADER_BLUE` constant from `#1E4E8C` to `#2b5b84`
(header banner background + footer accent bar). `SL_RED = '#E53E3E'` is
unchanged.

**Print target id.** The A4 sheet `<div ref={pageRef} …>` also gets
`id="face-sheet-print"` so the global print stylesheet can isolate it.

**Print Face Page button.** A new toolbar button rendered immediately before the
existing Download-as-PDF button:

```jsx
<button type="button" onClick={() => window.print()}
  className="px-4 py-2 rounded-xl bg-white/95 text-slate-700 text-sm font-semibold hover:bg-white transition-colors shadow-sm">
  🖨 Print Face Page
</button>
```

`window.print()` is synchronous and blocks script until the dialog is dismissed
— acceptable because it is explicitly user-triggered. It is a real browser print
dialog, not a JS `alert`/`confirm`, so it does not wedge the app.

**Auto-print on creation.** A new prop `autoPrint` (boolean, default `false`):

```jsx
const autoPrintedRef = useRef(false)
useEffect(() => {
  if (!autoPrint || autoPrintedRef.current) return
  autoPrintedRef.current = true
  const t = setTimeout(() => window.print(), 200)
  return () => clearTimeout(t)
}, [autoPrint])
```

- The `autoPrintedRef` guard fires the dialog **exactly once** per mount, even
  though the component re-renders when an activity is added or the live
  subscription pushes an update.
- The ~200ms timeout lets the A4 layout and web fonts settle first.

### 2. `src/index.css`

One `@media print` block appended to the stylesheet (there is currently no
print CSS anywhere in the app):

```css
/* ─── Print: File Manager face sheet ─────────────────────────────────────── */
@media print {
  body * { visibility: hidden; }
  #face-sheet-print, #face-sheet-print * { visibility: visible; }
  #face-sheet-print {
    position: absolute;
    inset: 0;
    margin: 0;
    width: 210mm;
    box-shadow: none;
  }
  #face-sheet-print * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4; margin: 0; }
}
```

- `visibility: hidden` on `body *` then `visible` on the sheet subtree is the
  standard technique to print one on-screen element and drop the app chrome and
  the dark overlay backdrop.
- `print-color-adjust: exact` forces the blue banner, blue footer bar, ledger
  grid, and red SL-No text to render.
- `@page { size: A4; margin: 0 }` — the sheet already carries its own internal
  padding.

### 3. `src/components/RowActionsMenu.jsx` (shared component — backward-compatible)

Add one optional prop, `extraItems` (default `[]`), an array of
`{ label, icon, onClick, tone }` (`tone` ∈ `'default' | 'danger'`, default
`'default'`). When present, these render as buttons **above** Edit, each closing
the menu then calling `onClick`. Existing consumers pass nothing and are
unaffected.

File Manager passes:

```jsx
extraItems={[{ label: 'Face Sheet', icon: '🖨', onClick: () => openFaceSheet(f) }]}
```

### 4. `src/components/ProjectFileDetail.jsx` — new component

A portal modal (same pattern as `CreateFileModal.jsx`), opened by a row click.
Props: `file`, `onClose`, `onOpenFaceSheet`.

**Layout**

- Header: `file.fileName` (title), `SL No: {slNo}` (mono), remarks pill (reuses
  `REMARKS_STYLES` — lift the map to a shared spot or duplicate the small
  object; duplication is fine, it is 4 lines).
- **Started / days open row:**
  - Start date = `file.createdAt?.toDate?.()` if present, else parsed from the
    `slNo` prefix (`ddMMyyyy`, the office's own numbering) if that yields a valid
    date, else `null`.
  - Show `"Started 06 Mar 2026 · 181 days open"`. If the file has a
    `closingDate`, show `"Open 06 Mar 2026 → 04 Sep 2026 · 182 days"` instead
    (days between start and closing). If no start date is derivable, show
    `"Start date unknown"`.
  - Day count helper: `Math.max(0, Math.round((end - start) / 86400000))`.
- **Status control:** a segmented control of the four `REMARKS_OPTIONS`
  (`Active`, `Project Completed`, `Project Withheld`, `Archived`). Clicking a
  segment writes immediately via `setProjectFileRemarks` (below). The live
  subscription re-renders the row and this modal. On failure, an inline error is
  shown (no silent `catch {}`).
  - When the new status is `Project Completed` **and** `closingDate` is empty,
    the same write also sets `closingDate` to today. Changing away from
    `Project Completed` does **not** clear it (the Founder can still edit it via
    Edit).
- **Activity summary:** `"{n} activities · last: {activity text} ({date})"`, or
  `"No activities logged yet"`.
- Footer: **🖨 Face Sheet** button → `onOpenFaceSheet(file)` (closes this modal,
  opens `ProjectFileTemplate`), and a **Close** button.

### 5. `src/services/firestore.js`

New function:

```js
export async function setProjectFileRemarks(id, remarks, extra = {}) {
  await updateDoc(doc(db, PROJECT_FILES, id), {
    remarks,
    ...extra,               // e.g. { closingDate: '2026-09-04' }
    updatedAt: serverTimestamp(),
  })
}
```

Partial update — unlike `updateProjectFile`, it does not rewrite `slNo` /
`fileName` / `closingDate` unless told to.

### 6. `src/pages/FileManager.jsx`

**State:**

```jsx
const [detailFileId, setDetailFileId] = useState(null)   // File Detail modal
const [faceSheetFileId, setFaceSheetFileId] = useState(null) // face sheet overlay
const [autoPrintId, setAutoPrintId] = useState(null)     // auto-fire print once
```

`selectedFileId` is renamed to `detailFileId` (row click → detail, not face
sheet). The derived `selectedFile` becomes `detailFile` / `faceSheetFile`
lookups against `files`.

**Row click:** `onClick={() => setDetailFileId(f.id)}`.

**`⋮` menu:** `extraItems` opens the face sheet:
`() => setFaceSheetFileId(f.id)`.

**`handleSaveFile`** — create branch opens the face sheet in auto-print mode;
edit branch unchanged:

```jsx
async function handleSaveFile(form) {
  if (form.id) {
    await updateProjectFile(form.id, form)
  } else {
    const newId = await createProjectFile(form, user?.uid || null)
    setFaceSheetFileId(newId)
    setAutoPrintId(newId)
  }
  setFileModal(null)
}
```

`createProjectFile` returns `ref.id`. Firestore latency-compensation puts the
new doc into the live `files` array right after the `await`; if it is
momentarily absent the overlay just appears a beat later.

**Render:**

```jsx
{detailFile && (
  <ProjectFileDetail
    file={detailFile}
    onClose={() => setDetailFileId(null)}
    onOpenFaceSheet={(f) => { setDetailFileId(null); setFaceSheetFileId(f.id) }}
  />
)}
{faceSheetFile && (
  <ProjectFileTemplate
    file={faceSheetFile}
    autoPrint={autoPrintId === faceSheetFile.id}
    onClose={() => { setFaceSheetFileId(null); setAutoPrintId(null) }}
  />
)}
```

`setAutoPrintId(null)` also runs anywhere the face sheet id is cleared, and in
`handleDelete` alongside the existing `setSelectedFileId(null)` cleanup.

### 7. `src/pages/FileManager.jsx` — SL number generation

The existing `nextSlNo(files)` helper is replaced. New format, matching the
office's paper ledger:

```
<D><MM><YYYY><NNN>
```

- `D` — day of month, **no leading zero** (`1`–`31`).
- `MM` — month, zero-padded (`01`–`12`).
- `YYYY` — 4-digit year.
- `NNN` — the office's **lifetime running file number**, zero-padded to 3
  digits: `String(files.length + 1).padStart(3, '0')`.

Example: the 138th file ever, created 6 Mar 2026 → `6` + `03` + `2026` + `138`
= `6032026138`. The 9th file on 15 Mar 2026 → `1503202609`.

```js
function nextSlNo(files) {
  const datePart = format(new Date(), 'dMMyyyy')     // date-fns: `d` = un-padded day
  const running = String(files.length + 1).padStart(3, '0')
  return `${datePart}${running}`
}
```

`openCreate()` already seeds the form with `slNo: nextSlNo(files)`, and
`CreateFileModal`'s SL No input stays editable — so the Founder can still
override it (e.g. after an Excel import where the running count is not yet
migrated). No change to `CreateFileModal.jsx`.

Note: `files.length` counts every registry row including Excel-imported ones, so
once the paper ledger is fully imported the running number lines up. Until then
the Founder edits the field as needed — hence it stays editable.

## Manual verification

1. Create a new entry ("ROL's School Of Music V2"). The **face sheet** opens and
   the print dialog fires automatically; banner is `#2b5b84`, SL No red, ledger
   grid prints with borders.
2. Cancel the print dialog — face sheet stays open, no repeat dialog. Add an
   activity — no second dialog.
3. Close everything. Click an existing row → **File Detail** opens (not the face
   sheet). It shows start date + days open, status segments, activity summary.
4. In File Detail, click **Project Completed** → row pill updates live, closing
   date fills to today (was empty). Click **Active** again → status reverts,
   closing date stays.
5. In File Detail, click **🖨 Face Sheet** → detail closes, face sheet opens
   **without** auto-printing; Print Face Page button works on demand.
6. `⋮` menu → **Face Sheet** opens the same overlay directly.
7. Download as PDF still produces the same A4 PDF.
8. Open an Accounts ledger page (e.g. ExpensePage) — its `⋮` menu still shows
   only Edit / Delete (no regression from the `extraItems` prop).
9. Click New Entry — the SL No field is pre-filled like `6032026NNN` (today's
   un-padded day, month, year, 3-digit running number) and can be typed over.
