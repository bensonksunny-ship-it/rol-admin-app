# File Manager — Auto-Print Face Sheet on New File — Design

## Context

The File Manager (`/files`, Founder-only) already has a complete project-file
registry with a printable cover/face sheet — see
`docs/superpowers/specs/2026-08-26-file-manager-design.md`. The existing pieces:

- `src/pages/FileManager.jsx` — the registry table, search/filter, New Entry,
  Excel import, row-click → face sheet overlay.
- `src/components/CreateFileModal.jsx` — the New Entry / Edit form.
- `src/components/ProjectFileTemplate.jsx` — the A4 face sheet overlay: blue
  header banner, ROLCC + red SL No block, split two-column activity ledger,
  blue footer bar, and a **Download as PDF** button (jsPDF `doc.html()`).

This spec covers the remaining gap: **when a new file is created, the Founder
needs to immediately print its face sheet** to place inside the physical file.
Currently, saving a new entry just closes the modal.

## Goals

1. Creating a new project file auto-opens its face sheet and auto-triggers the
   browser print dialog, so the Founder only picks a printer and prints.
2. The face sheet gains an explicit **Print Face Page** button (native print),
   alongside the existing Download PDF button.
3. Older files whose physical face sheet is lost or torn can be reprinted — this
   is already served by the existing row-click → face sheet overlay; no new
   affordance needed.
4. The header banner colour changes to `#2b5b84` (per the office's current
   letterhead), replacing `#1E4E8C`.

## Non-goals

- No changes to the activity ledger, the Add Activity flow, the Download-as-PDF
  path, the Excel import, or `firestore.rules`.
- No changes to the row-click behaviour or the `⋮` row-actions menu.
- No new "print" column, bulk print, or print-history tracking.

## Design

### 1. `src/components/ProjectFileTemplate.jsx`

**Colour.** Change the `HEADER_BLUE` constant from `#1E4E8C` to `#2b5b84`. It is
used for the header banner background and the footer accent bar. The SL-No red
(`SL_RED = '#E53E3E'`) is unchanged.

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

`window.print()` is synchronous and blocks script execution until the dialog is
dismissed — acceptable here because it is explicitly user-triggered. This is a
real browser print dialog, not a JS `alert`/`confirm`, so it does not wedge the
app.

**Auto-print on creation.** A new prop `autoPrint` (boolean, default `false`).

```jsx
const autoPrintedRef = useRef(false)
useEffect(() => {
  if (!autoPrint || autoPrintedRef.current) return
  autoPrintedRef.current = true
  const t = setTimeout(() => window.print(), 200)
  return () => clearTimeout(t)
}, [autoPrint])
```

- The `autoPrintedRef` guard ensures the dialog fires **exactly once** per mount,
  even though the component re-renders when an activity is added or the live
  subscription pushes an update.
- The ~200ms timeout lets the A4 layout and web fonts settle before the print
  snapshot is taken.

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
  grid, and red SL-No text to render — browsers otherwise strip backgrounds and
  lighten colours when printing.
- `@page { size: A4; margin: 0 }` — the sheet already carries its own internal
  padding, so the page margin is zeroed to avoid a double margin.

### 3. `src/pages/FileManager.jsx`

**New state:** `const [autoPrintId, setAutoPrintId] = useState(null)`.

**`handleSaveFile`** — the create branch captures the returned doc id and opens
the sheet in auto-print mode; the edit branch is unchanged:

```jsx
async function handleSaveFile(form) {
  if (form.id) {
    await updateProjectFile(form.id, form)
  } else {
    const newId = await createProjectFile(form, user?.uid || null)
    setSelectedFileId(newId)
    setAutoPrintId(newId)
  }
  setFileModal(null)
}
```

`createProjectFile` already returns `ref.id`. Firestore's local
latency-compensation puts the new document into the live `files` array
synchronously after the `await`, so the derived `selectedFile` resolves without
any optimistic local copy. If it is momentarily absent, the overlay simply
appears a beat later once the snapshot lands.

**Render** — pass the flag and clear it on close:

```jsx
{selectedFile && (
  <ProjectFileTemplate
    file={selectedFile}
    autoPrint={autoPrintId === selectedFile.id}
    onClose={() => { setSelectedFileId(null); setAutoPrintId(null) }}
  />
)}
```

`setAutoPrintId(null)` is also called wherever `setSelectedFileId(null)` already
runs (e.g. the delete handler), so the flag never lingers.

## Reprint path for older files

Unchanged and already working: clicking any row in the registry table opens the
same `ProjectFileTemplate` overlay with **Print Face Page** and **Download as
PDF**. That is the documented way to regenerate a lost or damaged physical face
sheet.

## Manual verification

1. Create a new entry ("ROL's School Of Music V2"). The face sheet opens and the
   browser print dialog appears automatically; the banner is `#2b5b84`, the SL
   No is red, the ledger grid prints with borders.
2. Cancel the print dialog — the face sheet stays open, no error, no repeat
   dialog.
3. Add an activity from within the sheet — no second print dialog fires.
4. Close and click an existing row — the sheet opens **without** auto-printing;
   the Print Face Page button works on demand.
5. Download as PDF still produces the same A4 PDF as before.
