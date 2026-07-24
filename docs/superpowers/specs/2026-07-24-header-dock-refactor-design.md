# Amazon-Style Header + Apple-Folder Bottom Dock — Design Spec

**Date:** 2026-07-24
**Status:** Approved

## Overview

Two related visual/navigation refactors:

1. Strip the global header (logo + top action icons) down to a transparent, compact "Amazon Business"-style bar — no background fill, border, or shadow behind it.
2. Remove all per-page sub-navigation tab bars (`DepartmentTabBar.jsx`, used on ~14 pages) and relocate subpage navigation into the floating bottom dock, which gains Apple-Dock-style "folder" popovers: tapping a department icon shows its subpages (Leader Entry, Reports, etc.) in a floating panel instead of navigating immediately.

No new Firestore collections or backend work. Pure frontend layout/navigation restructuring.

## Part 1 — Global Header

Applies to three existing header surfaces in `src/components/Layout/Sidebar.jsx`:

| Surface | Where it renders | Change |
|---|---|---|
| `MobileHeader` | Fixed full-width top bar, `lg:hidden` | Remove `background`, `backdropFilter`, `borderBottom`, `boxShadow` — fully transparent |
| `BrandHeader` | Top of the desktop slide-out sidebar | Remove `border-b` |
| `IconRail` | Desktop icon-only left rail (My Workspace route) | Minor consistency pass only; already compact |

Logo:
- Swap `object-cover` → `object-contain` (current logo can be cropped).
- Shrink: mobile `w-8 h-8` → `w-6 h-6`; desktop brand mark `w-9 h-9` → `w-7 h-7`.

Wordmark ("River Of Life"):
- Mobile 16px → 12px; desktop 18px → 13px. "ADMIN PORTAL" subtitle shrinks proportionally (not removed).

Top-right action icon row (compact horizontal row, unchanged spacing pattern already used):
- Notifications (existing)
- Messages (existing)
- Sunday Plan (existing, `SundayPlanBubble`)
- **New: Board** — "Director Board" = the existing Board Meeting Points feature (`BoardPointsModal` + `getBoardPoints(departmentName)`, currently embedded per-department inside `DepartmentTabBar`).
  - Board data is inherently department-scoped, unlike Notifications/Messages which are global. The icon renders **only when the current route is `/department/:slug`**.
  - New small hook, e.g. `useBoardPoints(slug)` in Sidebar.jsx, independently calls `getBoardPoints(slug)` and owns its own `BoardPointsModal` open/close state. `DepartmentHub.jsx` keeps its existing internal board-points state/button removal (see Part 2) — this is a deliberate, small duplication of a lightweight read rather than threading state across sibling components; noted as a candidate for future dedup, not addressed now.

## Part 2 — Bottom Dock with Apple-Folder Subpages

### Shared subpage helper

Extract from `DepartmentTabBar.jsx` into a plain function (new file, e.g. `src/utils/departmentSubpages.js`):

```
getDepartmentSubpages(slug, userProfile) → [{ key, label, to }]
```

Ports:
- `getTabLabel(tab)` label map
- The special-case route table (accounts entry → `ACCOUNTS_ENTRY_BASE_PATH`, sunday-ministry sub-routes, cell leaderEntry/reports, etc.)
- `visibleCellTabs(userProfile)` filtering for the `cell` slug

This is the single source of truth both dock surfaces below use. `DepartmentTabBar.jsx` is deleted once no page imports it anymore.

### Desktop — `DepartmentDock.jsx`

- Becomes global: rendered from `MainLayout.jsx` (not just `MyWorkspace.jsx`).
- Tapping a department tile no longer navigates directly — it toggles a popover anchored above that tile:
  - Small rounded panel, blurred/translucent background (matching existing dock's glass style), pointer/tail toward the tile.
  - Header: department name.
  - List of subpages from `getDepartmentSubpages(slug, userProfile)`; first item is the hub/summary. Tapping a row navigates and closes the popover.
  - Closes on outside click, Escape, or selecting a row.
- Active department/subpage highlighted by reading the current route (`useLocation`).

### Mobile — `BottomTabBar`

- For tiles whose `to` resolves to a known department path, tapping opens the same subpage list as a **bottom sheet** (rises just above the dock, near-full-width, rounded top) rather than an anchored popover — more usable on a narrow screen than a tiny popover.
- Tiles that are not departments (My Workspace, Departments grid, admin-only links) keep today's direct-navigate behavior — unchanged.
- Add a small helper (e.g. `isDepartmentPath(to)` in the same new util file) so `BottomTabBar` can tell which tiles get sheet behavior without touching its existing item-list construction logic in Sidebar.jsx.

### Rollout — removing `DepartmentTabBar`

Remove `<DepartmentTabBar .../>` from all current call sites:

`DepartmentHub.jsx`, `ShepherdView.jsx`, `CellHistory.jsx`, `CellReport.jsx`, `DLightMembers.jsx`, `DepartmentWorship.jsx`, `MidweekMinistry.jsx`, `Sunday.jsx`, `SundayCrew.jsx`, `SundayReport.jsx`, `SundayReportsHistory.jsx`, `SundayProgram.jsx`, `DepartmentDetail.jsx`.

For `DepartmentHub.jsx` specifically: also remove the `boardPointCount`/`onBoardPointsClick` wiring into the (now-deleted) tab bar; its own `BoardPointsModal` trigger button can be dropped since the header now owns that entry point (the modal/fetch logic in DepartmentHub itself can stay dormant/removed depending on whether anything else in that file still references `boardPoints` state — checked during implementation).

Each removed page is checked during implementation for whether `DepartmentTabBar` was its only page-title context (e.g. `CellHistory.jsx`); where so, a minimal `<h1>`-style heading is kept so the page doesn't lose all context. This is a per-page judgment call, not spec'd file-by-file here.

### Wiring

`MainLayout.jsx` renders both dock surfaces unconditionally (desktop `DepartmentDock`, mobile `BottomTabBar` — the latter is already global via `Sidebar.jsx`). `MyWorkspace.jsx` stops special-casing `DepartmentDock` itself.

## Out of scope

- Deduplicating the two independent Board Meeting Points reads (header vs. DepartmentHub) into one shared source.
- Changing what departments/subpages a user can see (permission logic is unchanged — only *where* the same links render).
- Any change to `IconRail`'s department item list construction.
