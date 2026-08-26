# File Manager (office file registry) — Design

## Purpose

Replace the church office's physical file-tracking log with a digital equivalent: a Founder-only registry of office project files, each with a printable cover sheet (matching the paper "SL No / activity ledger" format already in use) that can be downloaded as a PDF and printed to keep the hard copy inside the physical file.

This is **not** a generic document-upload/cloud-storage feature — no arbitrary file uploads, no folder tree, no storage quota. It's a tracked inventory of file *records* (metadata + activity history), not file *bytes*.

## Access

Founder-only, same tier as User Management / People Directory / Worklist Sheet:
- Sidebar: new `Folder` icon (lucide-react) in `IconRail` and `MobileDrawer`, gated on `isFounder`, positioned after Worklist Sheet.
- Route `/files` added to `App.jsx` alongside the other standalone Founder routes.
- `FileManager.jsx` also self-guards (`if (!isFounder) return <...>`), matching `WorklistSheet.jsx`'s pattern — defense in depth in case the route is hit directly.
- `firestore.rules`: new `project_files` collection, `allow read, write: if isFullAccess()`.

## Data model

One new Firestore collection, `project_files`:

```
project_files/{id}
  slNo: string              // e.g. "06032026138" — DDMMYYYY + daily sequence, editable
  fileName: string
  remarks: 'Active' | 'Project Completed' | 'Project Withheld' | 'Archived'
  closingDate: string | null   // ISO date, null until closed
  activities: [{ slNo: string, activity: string, date: string }]  // append-only ledger
  createdAt, createdBy, updatedAt
```

`activities` is stored as an array field on the document, not a subcollection — a church-office file's activity log will never approach Firestore's 1MB document cap, and keeping it as one document means the whole record (list row + detail sheet) is a single read/subscribe, with no extra service functions needed for a sub-list.

## Components

### 1. `src/pages/FileManager.jsx` — primary `/files` page

- Search/filter bar: filter by file name (text) and remarks status (dropdown).
- Table columns: `No.` (row position), `SL No`, `File Name`, `Remarks` (colored status pill), `Closing date`.
- "New Entry" button in the action bar, top of the table (replaces the Excel "insert row" affordance from the reference sheet).
- Row click opens `ProjectFileTemplate` as an overlay for that record.
- Subscribes to `project_files` live via a new `subscribeProjectFiles` function in `firestore.js`.

### 2. `src/components/CreateFileModal.jsx` — new entry modal

- Overlay modal (not a route), triggered by "New Entry".
- Fields: `SL No` (pre-filled as `DDMMYYYY` + a per-day sequence count of files already created that day, editable), `File Name` (required), `Remarks` (dropdown: Active / Project Completed / Project Withheld / Archived, defaults to Active), `Closing Date` (optional date picker).
- Submits via a new `createProjectFile` function in `firestore.js`. The live subscription updates the table automatically — no manual refresh or optimistic local state needed.
- Write failures surface as an inline/toast error, not a silent `catch {}` (see project history: swallowed catches have previously masked Firestore rules gaps).

### 3. `src/components/ProjectFileTemplate.jsx` — printable cover sheet

Opened as a full-screen overlay (same pattern as `SundayReportPrintView.jsx`), not a route.

- **Header banner** — solid `#1E4E8C` background:
  - Subtitle line: "RIVER OF LIFE CHRISTIAN CHURCH OFFICE PROJECT FILE REGULATED BY THE OFFICE OF THE SENIOR PASTOR"
  - Main title: the record's `fileName`, bound dynamically.
- **Sub-header card** (white): "ROLCC" org tag + `SL No: {slNo}` in `#E53E3E` red.
- **Two-column activity ledger**: the `activities` array rendered as one continuous list, split visually into two side-by-side tables (heavy black borders; columns `SL NO`, `Activity`, `Date`) — first half of entries in the left table, second half in the right, matching the density of a real paper ledger page.
  - Inline control to append a new activity row (writes directly to the doc's `activities` array via a new `addProjectFileActivity` function in `firestore.js`).
- **Footer**: solid blue accent bar spanning both columns.
- **Download PDF**: button using the existing `jspdf` pattern already established in `SundayReportPrintView.jsx` (`doc.html()` against a ref, A4 page size, `doc.save('<fileName>.pdf')`) — reuses the dependency already in `package.json`, no new library.

## Firestore rules addition

```
match /project_files/{id} {
  allow read, write: if isFullAccess();
}
```

## Out of scope (explicitly dropped)

- Generic file upload / arbitrary document storage.
- Folder tree navigation (Documents / Receipts / Media / Department Files).
- Storage quota indicator.
- Non-Founder access of any kind.

These were part of the original prompt but were superseded once the actual requirement (a physical-file tracking ledger, not a cloud drive) was clarified.
