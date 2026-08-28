# Media — "The Team" as a top-level tab, with exclusive sub-department management

**Date:** 2026-08-28
**Scope:** Media department only (`/department/media`)

## Problem

On the Media department, team-member management and sub-department management both
live as sub-tabs *inside* the Operations tab (`getOperationsChildren('media')` →
`['subDepartment', 'team', 'planning']`). This buries team organisation two levels
deep, and sub-departments can be added/edited from a standalone view that is
separate from where the team roster is managed.

## Goals

1. Promote **The Team** to a top-level tab on Media's navbar, alongside Hub,
   Upcoming Sunday, Finance, and Operations. URL: `?tab=team`.
2. Make add/edit/delete of sub-departments **exclusive to the The Team page** — a
   collapsible "Sub-Departments" panel inside the Team page layout, with a
   `+ Add Sub-Department` action. Remove the standalone Sub Department view for
   Media.
3. Let team members be organised under sub-departments directly from the Team
   page (member add/edit form gains a sub-department multi-select; roster shows a
   Sub-Department column).

## Non-goals

- The other five departments that share this Operations/Team/Sub-Department
  structure (Sunday Ministry, River Kids, Administration, Accounts, Caring) keep
  their current layout unchanged.
- No change to the People's-Directory-based member picker or the `visitorId`
  requirement in the shared team-member form.
- No Firestore rules change — `department_sub_departments` and the team-member
  collections already have working rules.

## Design

### Approach

Reuse the existing `team` tab key. The Team content block in `DepartmentHub.jsx`
already keys on `activeTab === 'team'`, and `getTabIcon('team')` already returns
the `Users` icon. The sub-department modal, its form state, and the Firestore
handlers already exist — they gain a second render site inside the Team page and
lose their standalone render site for Media.

### 1. Navigation

**`src/constants/departmentTabs.js`**

```js
case 'media':
  return ['summary', 'upcomingSunday', 'team', 'finance', 'operations']
```

`getDepartmentSubpages` feeds both `DesktopDepartmentNav` (desktop tab row) and
`DepartmentDock` (mobile folder grid), so both surfaces pick this up
automatically.

**`src/utils/departmentSubpages.js`**

- `getTabLabel('team')` returns `'The Team'` (was `'Team'`). Media is the only
  department with `team` as a top-level tab, so no other surface changes. The
  Operations sub-tab labelled "Team" comes from `getOperationsChildren`'s own
  hard-coded label, not `getTabLabel`, so it is unaffected.
- `getOperationsChildren('media')` returns `[{ key: 'planning', label:
  'Planning', Icon: CalendarDays }]` only. Operations remains a top-level tab
  with Planning as its sole sub-view.

### 2. `DepartmentHub.jsx` — Team page composition

- **opsSub fallback:** `setOpsSubTab(opsSubFromUrl || (slug === 'media' ?
  'planning' : 'team'))` so Media → Operations lands on Planning.
- **Standalone Sub Department view** (`usesGenericSubDepartmentCollection(slug) &&
  (activeTab === 'subDepartment' || ...)`): add `&& slug !== 'media'` so it never
  renders for Media outside the Team page.
- **New "Sub-Departments" collapsible panel** inside the Team block, rendered for
  `slug === 'media'` directly under the "The Team / + Add member" header:
  - Header row: `▾ Sub-Departments (N)` toggle + `+ Add Sub-Department` button
    (both gated on `canEdit`).
  - Body: `subDepartments` list with Edit / Delete per row, calling the existing
    `setEditingSubDept` / `setSubDeptForm` / `deleteDepartmentSubDepartment`
    handlers.
  - `+ Add` and `Edit` open the existing `genericSubDeptModalOpen` modal, which
    is already rendered independently of the standalone view and needs no change.
  - Collapsible state: new `mediaSubDeptPanelOpen`, initialised open when there
    are no sub-departments, collapsed otherwise.
  - Empty state text: "No sub-departments yet. Add one to organize your team."
- **Operations `opsSubTab === 'team'` branch:** guard with `slug !== 'media'`
  (hygiene against a stale URL).

### 3. Member ↔ sub-department wiring

- **Member form sub-department multi-select:** change the render condition from
  `slug === 'd-light'` to `slug === 'd-light' || slug === 'media'`. Reuses
  D-Light's chip multi-select bound to `subDeptOptionList`, which already
  resolves to `subDepartments` for Media. Empty-state text generalised to
  reference the Sub-Departments panel. The submit handler passes `memberForm`
  wholesale to `addDepartmentTeamMember` / `updateDepartmentTeamMember`, so
  `subDepartments` / `subDepartment` already persist for any slug — no handler
  change.
- **Roster table** (non-D-Light branch): add a **Sub-Department** column for
  Media using the existing `formatTeamSubDepartmentCell(m)` helper. The two
  member-edit `setMemberForm` call sites in that branch already populate
  `subDepartments` from the member doc.

### 4. Loose ends

- **Media Hub "Media Team Assignment" empty state:** the "Add them in Operations
  → Sub Department" link changes to navigate to `?tab=team` with text pointing at
  the The Team page.
- The sub-department data-loading effect already fires on `activeTab === 'team'`
  — no change needed.

## Files touched

| File | Change |
|---|---|
| `src/constants/departmentTabs.js` | Add `team` to Media's tab list |
| `src/utils/departmentSubpages.js` | `getTabLabel('team')` → "The Team"; `getOperationsChildren('media')` → Planning only |
| `src/pages/DepartmentHub.jsx` | opsSub fallback; exclude Media from standalone Sub Department view; Sub-Departments collapsible panel in Team block; member-form multi-select for Media; roster Sub-Department column; Hub empty-state link |

## Verification (manual, in browser)

1. Media navbar shows: Hub · Upcoming Sunday · The Team · Finance · Operations.
2. `?tab=team` opens the Team page with the Sub-Departments panel + roster.
3. `+ Add Sub-Department` opens the modal; save adds a row; Edit / Delete work.
4. Media → Operations opens Planning (no Team / Sub Department sub-tabs).
5. Add/edit a team member: sub-department chips appear and persist; roster shows
   the Sub-Department column.
6. Media Hub "Media Team Assignment" panel: empty-state link navigates to The
   Team page.
7. Other departments (Sunday Ministry, River Kids, Administration, Accounts,
   Caring): Operations still shows Sub Department / Team / Planning as before.
