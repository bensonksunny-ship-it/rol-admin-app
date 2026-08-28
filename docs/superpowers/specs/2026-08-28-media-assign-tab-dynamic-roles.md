# Media "Assign" tab — dynamic Role / Slot rows from Sub-Departments

**Date:** 2026-08-28
**Page:** `/department/media?tab=assign` (`DepartmentHub.jsx`, `slug === 'media'`)
**Supersedes:** the "Roles → Fixed list of 6" decision and the `MEDIA_ASSIGN_ROLES`
section of `2026-08-28-media-assign-tab-design.md`. Everything else in that spec
(date-scoping, the stamp, the `media_schedule` collection, the shared
`<MemberPicker>`, removal of the old Hub panel) still stands.

## Problem

The Assign tab's `ROLE / SLOT` column is driven by a hardcoded
`MEDIA_ASSIGN_ROLES` constant of 6 fixed slots (Video Director, Camera 1, …).
Media already maintains its real crew roles as **Sub-Departments** on "The Team"
page (`department_sub_departments`, filtered by `department == 'Media'`). The two
lists drift: a sub-department added or renamed in The Team has no effect on the
Assign schedule.

## Goal

Generate one Assign table row per configured Media sub-department. Adding,
renaming, or removing a sub-department on The Team page is reflected in the
Assign view on the next visit to the tab. New rows start with empty
Nature / Description and Tech Spec / Notes.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Row → saved-entry binding | By sub-department **doc id** (`subDeptId`), rename-safe |
| Empty state for Nature / Tech Spec | Generic placeholder only — no per-role example text |
| Migration of old fixed roles | None. `media_schedule` has no production data yet; drop `MEDIA_ASSIGN_ROLES` cleanly, no back-compat mapping from the 6 old role names |
| Live-sync mechanism | Re-fetch the sub-department list on Assign-tab entry (no realtime subscription — matches the rest of the app) |

## Design

### A. Data model — `media_schedule` assignment entries

Each entry in the doc's `assignments` array gains a stable key:

```
{ subDeptId, role, memberId, memberName, nature, techSpec }
```

- `subDeptId` — the `department_sub_departments` doc id. The one true binding
  key between a saved assignment and its row.
- `role` — the sub-department **name**, snapshotted at save time. Used only as a
  display fallback in the read-only stamp when a sub-department has since been
  deleted (its row no longer renders in edit mode, but its saved name still
  shows in the collapsed stamp). Not used for matching.
- `memberId`, `memberName`, `nature`, `techSpec` — unchanged.

`src/services/firestore.js`:

- `setMediaScheduleByDate(date, assignments, updatedBy)` — **no signature or
  body change.** It already writes the `assignments` array through verbatim
  (`stripUndefinedDeep` + `updateDoc`/`addDoc`, `firestore.js:1116`). The extra
  `subDeptId` field passes through automatically.
- `getMediaScheduleByDate` — unchanged.
- Update the `media_schedule` shape comment (`firestore.js:1103-1107`) to list
  `subDeptId` in the entry shape.

`firestore.rules` — unchanged (the `media_schedule` block from the original spec
already covers this).

### B. Rows derived from sub-departments (`DepartmentHub.jsx`)

**Remove:**

- The `MEDIA_ASSIGN_ROLES` module constant and all its `naturePlaceholder` /
  `techSpecPlaceholder` text (`DepartmentHub.jsx:297-306`).
- `roleMeta` / `meta.naturePlaceholder` / `meta.techSpecPlaceholder` usage in
  the Assign tab render block.

**Sub-department loading:**

- Extend the trigger condition of the existing generic sub-department
  `useEffect` (`DepartmentHub.jsx:1173-1189`) so `wantsSubOrTeam` is also true
  for `slug === 'media' && activeTab === 'assign'`. This reuses the already-
  present `subDepartments` state, `getDepartmentSubDepartments`, `subDeptLoading`
  and `subDeptError` — no new state or fetch function.

**Row derivation:**

- `mediaAssignRows` initial `useState` value → `[]` (was seeded from the
  constant, `DepartmentHub.jsx:904-906`).
- The Assign-tab load effect (`DepartmentHub.jsx:1654-1683`) builds rows by
  mapping the loaded `subDepartments` list (already name-sorted by
  `getDepartmentSubDepartments`) and merging any saved entry matched by
  `subDeptId`:

  ```js
  const saved = Array.isArray(doc?.assignments) ? doc.assignments : []
  const bySubDeptId = Object.fromEntries(saved.map((a) => [a.subDeptId, a]))
  const rows = subDepartments.map((sd) => {
    const a = bySubDeptId[sd.id] || {}
    return {
      subDeptId: sd.id,
      role: sd.name,
      memberId: a.memberId || '',
      memberName: a.memberName || '',
      nature: a.nature || '',
      techSpec: a.techSpec || '',
    }
  })
  ```

- Add `subDepartments` to the load effect's dependency array so rows rebuild
  once the sub-department fetch resolves (and whenever the list changes on a
  later tab re-entry).
- The `catch` branch of the load effect resets `mediaAssignRows` to
  `subDepartments.map((sd) => ({ subDeptId: sd.id, role: sd.name, memberId: '',
  memberName: '', nature: '', techSpec: '' }))` (was `MEDIA_ASSIGN_ROLES.map(...)`).

**Keying:** every place that currently keys on `r.role` switches to
`r.subDeptId`:

- `setRow(role, patch)` → `setRow(subDeptId, patch)`, matching on
  `r.subDeptId === subDeptId`.
- React `key={r.role}` → `key={r.subDeptId}` in the mobile card map, the desktop
  table-row map, and the stamp list map.
- The pill still displays `r.role` (the name) as its label.

### C. Live sync from "The Team"

No realtime subscription. The generic sub-department effect re-runs its fetch
each time the Assign tab is entered (its deps include `activeTab`), so a
sub-department added, renamed, or deleted on The Team page is picked up on the
next visit to Assign. Renames are non-destructive because saved assignments bind
by `subDeptId`: the row keeps its crew and notes and simply shows the new name.

### D. Empty states

- **No sub-departments configured** (`subDepartments.length === 0`, not
  loading): the table / card body is replaced with a centered message —
  *"No sub-departments yet — add them on The Team page."* This sits alongside
  the existing `activeMembers.length === 0` check (`DepartmentHub.jsx:4812`);
  order: loading → no members → no sub-departments → the grid/table.
- **Nature / Description and Tech Spec / Notes fields:**
  - Edit mode: `placeholder="Add description"` and
    `placeholder="Add tech spec / notes"` (faint, native input placeholder).
  - View mode (not editing): keep the existing read-only `<input>` with
    `value={r.nature}` / `value={r.techSpec}` and the current `read-only:`
    styling. An empty field renders blank — no `—` substitution in the input.
    Do not change the read-only markup.
  - Stamp collapsed list: unchanged — it only lists rows with `memberId` and
    shows `role → memberName`; Nature / Tech Spec are not shown there.

### E. Save (`saveMediaAssignPlan`, `DepartmentHub.jsx:2130-2160`)

- Build `assignments` from `mediaAssignRows`, keeping the existing drop rule
  (`r.memberId || r.nature.trim() || r.techSpec.trim()`), and emit:

  ```js
  { subDeptId: r.subDeptId, role: r.role, memberId: r.memberId || '',
    memberName: r.memberName || '', nature: r.nature.trim(),
    techSpec: r.techSpec.trim() }
  ```

- The stamp built on save (`setMediaAssignStamp`) stores `rows` as-is (now
  carrying `subDeptId`); no change beyond the row shape.
- Cancel-edit reset (`DepartmentHub.jsx:4777-4784`): rebuild from
  `mediaAssignStamp?.rows` when present, else from
  `subDepartments.map((sd) => ({ subDeptId: sd.id, role: sd.name, memberId: '',
  memberName: '', nature: '', techSpec: '' }))` (was `MEDIA_ASSIGN_ROLES.map`).

### Out of scope

- No realtime (`onSnapshot`) subscription for sub-departments.
- No reordering UI — rows follow the sub-department name sort.
- No per-sub-department default text for Nature / Tech Spec (e.g. seeding from
  `servingArea`). Fields start empty.
- No migration of any existing `media_schedule` doc written under the old fixed
  role names. If such a doc exists, its entries (lacking `subDeptId`) simply
  won't match any row and are effectively dropped on the next save.
- No change to Worship, the shared `<MemberPicker>`, or any other department.

## Files touched

| File | Change |
|---|---|
| `src/pages/DepartmentHub.jsx` | remove `MEDIA_ASSIGN_ROLES` + placeholders; derive `mediaAssignRows` from `subDepartments`; extend the generic sub-dept load-effect trigger to the Media Assign tab; add `subDepartments` to the Assign load-effect deps; re-key load / save / cancel / render on `subDeptId`; add the "no sub-departments" empty state; generic field placeholders |
| `src/services/firestore.js` | comment-only — add `subDeptId` to the `media_schedule` entry-shape comment (`:1103-1107`) |

## Verification (manual, in browser)

1. Media → The Team → Sub-Departments panel: note the configured list (e.g.
   `Camera`, `Sound`, `Streaming`).
2. Media → Assign: the Role / Slot column shows exactly those sub-departments,
   name-sorted, one row each. No "Video Director / Camera 1 / …" fixed slots.
3. Edit Plan → assign members, type Nature / Tech Spec on two rows → Save plan →
   collapses to the stamp → reload the tab → assignments persist.
4. The Team → rename a sub-department that has a saved assignment → back to
   Assign: the row shows the new name and still carries its crew and notes.
5. The Team → add a new sub-department → back to Assign: a new row appears with
   empty Nature / Tech Spec and "Not assigned".
6. The Team → delete a sub-department → back to Assign: its edit-mode row is
   gone; if it had been saved with a member, the collapsed stamp still lists the
   snapshotted `role → memberName`.
7. A Media department with zero sub-departments: Assign tab shows
   "No sub-departments yet — add them on The Team page."
8. Switch between two Sundays: assignments stay independent per date.
