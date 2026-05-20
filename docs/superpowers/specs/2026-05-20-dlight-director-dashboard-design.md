# D Light Director Dashboard — Design Spec

**Date:** 2026-05-20
**Status:** Approved

## Overview

Replace the D Light summary tab placeholder with a rich director dashboard. Visible only to the D Light director, ministry leaders, and admins. Uses Recharts (already installed) for all charts. All data derives from existing Firestore collections — no new backend work needed.

## Access Control

Render the full dashboard only when `canEditDelightVisitors` is true (D Light director, ministry leader, admin). All other roles continue to see the existing placeholder message.

## Data Sources

| Data | Source | Already loaded on summary tab? |
|------|--------|-------------------------------|
| Visitors | `getDelightVisitors()` | No — currently only loaded on `visitorEntry` tab |
| Team members | `team` state (via `getDepartmentTeam`) | Yes (loaded when `wantsSubOrTeam`) |
| Sub-departments | `dlightSubDepts` state | Yes (loaded on `team`/`subDepartment` tabs) |
| Planning tasks | `tasks` state | Yes |

**Required change:** extend the `getDelightVisitors` effect trigger to also fire when `slug === 'd-light' && activeTab === 'summary' && canEditDelightVisitors`.

## Component

Extract into `src/components/DLightDirectorDashboard.jsx`. Props:

```
visitors        — full delightVisitors array (all years)
team            — team array
subDepartments  — dlightSubDepts array
tasks           — tasks array
loading         — boolean (visitors still loading)
currentYear     — VISITOR_CURRENT_YEAR constant
```

DepartmentHub renders `<DLightDirectorDashboard ... />` inside the `slug === 'd-light'` branch of the summary tab, guarded by `canEditDelightVisitors`.

## Layout (approved: Option A — Stats + Charts)

```
[ KPI tiles row: 4 tiles ]
[ Monthly trend bar chart (2/3 width) | Year-on-year comparison (1/3) ]
[ Visitor Source | Service Attended | Tasks + Team by Sub-dept ]
[ Recent Visitors table ]
```

## Sections

### 1. KPI Tiles (top row, 4 columns)

| Tile | Value | Sub-text |
|------|-------|----------|
| Visitors This Year | count where `year === currentYear` | ↑/↓ vs previous year |
| Team Members | active team count | "Across N sub-depts" |
| Open Tasks | pending + in-progress task count | "N completed" |
| This Month | visitors where month === current month | "Visitors in [Month Year]" |

### 2. Monthly Visitor Trend (Recharts BarChart)

- X axis: Jan–Dec labels
- Y axis: visitor count
- Data: visitors for `currentYear` grouped by month from `attendedDate` (fall back to `createdAt` year if no `attendedDate`)
- Future months shown as empty/grey bars

### 3. Year-on-Year Comparison (Recharts BarChart, grouped)

- Two bars per group: previous year total vs current year total (Jan–current month only, so comparison is fair)
- Legend: 2025 (faded indigo) vs 2026 (solid indigo)

### 4. Visitor Source Breakdown (horizontal legend-bar rows)

- Group visitors by `howKnown` / `source` field (they are the same field, stored as `source`)
- Normalise blank/null values to "Unknown"
- Show top 4 sources with percentage bars

### 5. Service Attended Breakdown (horizontal legend-bar rows)

- Group by `serviceAttended` field
- Show top 3–4 values with percentage bars

### 6. Planning Tasks (progress bars)

- Three rows: Completed / In Progress / Pending
- Count from `tasks` array using `status` field

### 7. Team by Sub-department (horizontal legend-bar rows)

- Group `team` members by `subDepartment` field (or `department` if `subDepartment` absent)
- Show top 4, rest as "Other"

### 8. Recent Visitors Table

- Last 8 visitors ordered by `createdAt` desc (already the default sort from Firestore)
- Columns: Name, Phone, Nativity, Service, How They Heard, Date
- Date formatted as DD MMM YYYY using `format()` from date-fns (already imported)

## Chart Library

All charts use **Recharts** (`recharts@^3.8.0`, already in `package.json`). Import only what is used: `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`.

No new dependencies.

## Styling

Matches the existing app design system:
- Card container: `bg-white rounded-xl border border-slate-200 shadow-sm`
- KPI values: `text-2xl font-bold`
- Positive delta: `text-emerald-600`, warning: `text-amber-500`
- Chart colours: indigo (`#6366f1`) for visitors, emerald (`#10b981`) for team, amber (`#f59e0b`) for tasks

## File Changes

| File | Change |
|------|--------|
| `src/components/DLightDirectorDashboard.jsx` | New component (all chart/stat logic) |
| `src/pages/DepartmentHub.jsx` | Replace D Light placeholder with `<DLightDirectorDashboard>`, extend visitor data load effect |
