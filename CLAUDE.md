# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Vite dev server (hot reload)
npm run build        # production build → dist/ (also copies index.html → 404.html for SPA routing)
npm run lint         # ESLint
npm run preview      # preview prod build locally
npm run deploy       # build + deploy Firestore rules, hosting, and Cloud Functions
```

No test suite exists. Verification is manual in the browser.

## Environment

Copy `.env.example` → `.env` and fill in Firebase project credentials. All env vars are `VITE_FIREBASE_*` and are injected at build time via Vite's `import.meta.env`.

## Architecture Overview

### Stack
React 19 + Vite + Tailwind CSS v4 + Firebase (Auth, Firestore, Storage, Cloud Functions). Deployed as a PWA to Firebase Hosting.

### Routing & Page Model
`src/App.jsx` defines all routes inside a single `ProtectedRoute → MainLayout` shell. Most department pages resolve to `/department/:slug` → `DepartmentHub.jsx`. Exceptions are worship (custom page), cell (has `ShepherdView`), and a few standalone pages (Sunday, Finance, etc.).

### The Two Giant Files
- **`src/pages/DepartmentHub.jsx`** (~8000+ lines): Generic hub used by almost every department. A single `slug` param (from the URL) controls which tabs render, which Firestore collections are read, and which panels appear. Tab sets per slug are defined in `src/constants/departmentTabs.js`. All feature code for every department lives inline here.
- **`src/services/firestore.js`**: Single module exporting every Firestore read/write/subscribe function used by the whole app. No per-collection service files.

### Auth & Roles
`src/context/AuthContext.jsx` reads the Firebase user's Firestore profile (`users/{uid}`) and enriches it with:
- `positions[]` – array of `{department, role|position}` objects (new schema uses `role: 'DIRECTOR'|'LEADER'`, legacy uses `position: 'Director'|'Cell Leader'`)
- `departments[]` – derived from positions, synced back to Firestore automatically
- `globalRole: 'FOUNDER'` – from Firebase custom claims; bypasses all access checks

Access helpers live in `src/utils/access.js` (`hasAccess`, `getDepartmentRole`, `isFounder`) and `src/utils/cellReportPermissions.js` (`isCellDirectorInPositions`, `isCellLeaderInPositions`, `canEditCellReport`).

Role hierarchy (highest → lowest): `Founder (FOUNDER globalRole) → Director → Coordinator/Cell Leader → Viewer`.

### Cell Department
The Cell department is more complex than others:
- `/department/cell` loads `DepartmentHub.jsx` for tabs: `summary | cellGroups | reports | leaderEntry | operations`
- **`ShepherdView.jsx`** is rendered inside `DepartmentHub` as the `leaderEntry` tab content. It contains `ShepherdCareTab` (director view) and `MyFellowshipTab` (cell leader view).
- Cell leader identity: `isCellLeaderInPositions(userProfile)` + `userProfile.cellId` / `userProfile.cellGroupId` linking to a cell group doc
- Cell director identity: `isCellDirectorInPositions(userProfile)`

### PCS (Personal Caring System)
Lives in the `caring` slug of `DepartmentHub`. Key collections:
- `caring_pcs` – PCS entries; soft-deleted via `status: 'inactive'`
- `pcs_fill_invitations` – Caring Director → Cell Leader profile-fill requests
- `pcs_add_notifications` – Cell Leader → Caring "add this person to PCS" requests
- `pcs_lookup` – denormalized name/phone lookup for fast search

### Key Firestore Collections
| Collection | Purpose |
|---|---|
| `users` | User profiles + roles |
| `cell_groups` | Cell group definitions |
| `cell_members` | Members per cell group |
| `cell_reports` | Weekly cell meeting reports |
| `sunday_reports` | Sunday service reports; `sundayCellAttendance[cellId]` holds member name arrays |
| `sunday_service_attendance` | Sunday attendance by member doc ID |
| `caring_pcs` | PCS care entries |
| `tasks` | Cross-department tasks |
| `department_assignments` | Per-slug assignment data (Worship, D Light, etc.) |
| `dismissed_notifications` | Per-user "Ignore" state for My Workspace's notification bell; doc id `{uid}_{notificationId}` |
| `notification_todo_additions` | Per-user "already added to To-Do" flag for the bell (separate from dismissal); doc id `{uid}_{notificationId}` |

### Sunday Attendance Pattern
Name-based matching is preferred over doc-ID matching. `sunday_reports.sundayCellAttendance[cellId]` stores lowercased member names; use `getRecentSundayAttendanceNamesByCell(cellId)` and compare against `String(member.name).trim().toLowerCase()`.

### Tailwind CSS v4
Uses the new `@tailwindcss/vite` plugin. No `tailwind.config.js` — configuration is done in CSS via `@theme`. Utility classes work the same but the config system is different from v3.

### Firestore Security Rules
`firestore.rules` uses helper functions `isSignedIn()`, `isFullAccess()`, `canAccessDept(deptName)`. When adding a new collection, add a matching `match` block following the existing pattern — `canAccessDept('Cell')` for cell-scoped writes, `canAccessDept('Caring')` for caring-scoped writes, etc.
