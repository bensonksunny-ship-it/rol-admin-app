# River Kids children in the team-member search

**Date:** 2026-08-28
**Scope:** The generic "Add / Edit Team Member" picker in `DepartmentHub.jsx`
(used by every department except Worship).

## Problem

The team-member picker searches `teamVisitors`, built from
`getMergedPeopleDirectory()` — `people`, cell members, PCS, dept/worship teams,
D-Light visitors, Sunday attendance. It does **not** include River Kids children
(`department_children`, department `'River Kids'`). A department that recruits a
River Kids child as a helper has no way to select that child; they'd have to
re-type the name as free text.

Separately, `addDepartmentTeamMember()` never persists `visitorId` (only
`updateDepartmentTeamMember` does), so a member added straight from the directory
search saves with no link reference and shows the **"Unlinked"** badge until
someone edits and re-saves. This spec closes that gap as a side effect.

## Goals

1. River Kids children appear in the team-member search dropdown alongside adult
   directory records, tagged with a `[River Kids]` badge.
2. Selecting a child persists `source: 'river_kids'` and a `childId` reference on
   the team-member record, surviving edits.
3. A member added from the search — child **or** adult — saves with its link
   reference and renders as linked immediately (fixes the "Unlinked" bug).

## Non-goals

- Worship's "Add New Team Member" picker stays screening-gated and untouched (it
  is a `<select>` of screened applicants, not a directory search).
- No badge outside the search dropdown — the selected chip and roster table are
  unchanged.
- Full child records (`department_children`: DOB, parent names) stay restricted
  to River Kids / Sunday Ministry / Cell roles.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Which pickers | DepartmentHub generic picker only |
| Child reference storage | New `childId` + `source` fields; `visitorId` left empty for children |
| Which children | Active River Kids roster only |
| Badge placement | Search dropdown only |
| Cross-department read access | New name-only `river_kids_lookup` collection |

## Design

### 1. Data source — `river_kids_lookup` collection

Denormalized, name-only index mirroring the existing `pcs_lookup` pattern.

**`src/services/firestore.js`**

- `RIVER_KIDS_LOOKUP_COLLECTION = 'river_kids_lookup'`. Doc id **equals** the
  `department_children` doc id. Shape: `{ name: string }`. A doc exists **iff**
  the child is active in River Kids.
- `getRiverKidsLookup()` → `[{ id, name }]`.
- `syncAllRiverKidsToLookup(children)` — batch reconciler: `set` docs for active
  children missing from the lookup, `delete` docs for children no longer active.
  Mirrors `syncAllPCSToLookup`. Called from the River Kids register/attendance
  load effect (`DepartmentHub.jsx:1197`) where `getDepartmentChildren` already
  runs, so an existing roster backfills the first time a River Kids director
  opens that tab.
- `addDepartmentChild(department, …)` — when `department === 'River Kids'`,
  fire-and-forget `setDoc(river_kids_lookup/{id}, { name })`.
- `updateDepartmentChild(id, data, department)` — new optional 3rd arg. When
  `department === 'River Kids'`: upsert the lookup doc on name change / when
  `data.active !== false`; delete it when `data.active === false`. The sole call
  site (`DepartmentHub.jsx:7903`, River Kids register edit) passes
  `department.name`. Other callers omit the arg → no lookup writes.
- `deleteDepartmentChild(id)` (soft-delete → `active:false`) — also
  fire-and-forget `deleteDoc(river_kids_lookup/{id})`. No-op if absent.

**`firestore.rules`** — new block after `department_child_attendance`:

```
match /river_kids_lookup/{docId} {
  allow read: if isSignedIn();
  allow write: if isSignedIn() && (isFullAccess() || canAccessDept('River Kids'));
}
```

### 2. Search merge in the picker

**`src/pages/DepartmentHub.jsx`**, the `teamVisitors` effect (`:1559`):

- Add `getRiverKidsLookup().catch(() => [])` to the parallel load.
- Map each lookup row to the option shape:
  `{ id: 'rk-' + row.id, childId: row.id, name: row.name, phone: '', source: 'river_kids' }`.
- Concatenate after the adult options; keep the existing `localeCompare` name
  sort over the combined list.
- Adult entries have no `source` — treated as People's Directory.

Dropdown row (`:7437`): when `v.source === 'river_kids'`, render a small
`[River Kids]` amber pill after the name. Dropdown only.

### 3. Selection & persistence

Team-member records gain `source` (`'' | 'river_kids'`) and `childId`
(`department_children` doc id). `visitorId` stays empty for a child.

- **Select handler** (`:7441`):
  - River Kids row → `name`, `childId: v.childId`, `source: 'river_kids'`,
    `visitorId: ''`.
  - Adult row → `visitorId: v.id`, `source: ''`, `childId: ''` (explicit, so a
    re-pick can't leave a stale child ref).
- **Clear (×) buttons** (`:7405`, `:7566`) — also clear `source` / `childId`.
- **Submit guard** (`:7323`) —
  `if (!editingMember && !memberForm.visitorId && !memberForm.childId)`; error
  text extended to mention River Kids.
- **`memberForm` initial (`:377`) + resets** — add `source: ''`, `childId: ''`.
- **Edit-populate `setMemberForm` calls** (`:7147`, `:7204`, `:7281`) — carry
  `source: m.source || ''`, `childId: m.childId || ''`.

**`src/services/firestore.js`:**

- `addDepartmentTeamMember` — persist `visitorId` (currently dropped), `source`,
  and `childId`.
- `updateDepartmentTeamMember` — add `source` / `childId` with the existing
  `!== undefined` guard style.
- `getDepartmentTeamMembers`, `subscribeDepartmentTeamMembers` — return
  `source: data.source || ''`, `childId: data.childId || ''`.
- `getAllDepartmentTeamMembers` already spreads `...d.data()` — no change.

## Files touched

| File | Change |
|---|---|
| `src/services/firestore.js` | `river_kids_lookup` helpers + sync; child add/update/delete lookup upkeep; persist `visitorId`/`source`/`childId` on team-member add; read/update `source`/`childId` |
| `src/pages/DepartmentHub.jsx` | merge River Kids lookup into `teamVisitors`; `[River Kids]` badge; select/clear handlers; submit guard; `memberForm` fields; edit-populate; call `syncAllRiverKidsToLookup` + pass `department` to `updateDepartmentChild` |
| `firestore.rules` | `river_kids_lookup` match block |

## Verification (manual, in browser)

1. As River Kids director, open the register/attendance tab → `river_kids_lookup`
   backfills. Add a child → lookup doc appears. Deactivate a child → its lookup
   doc is removed.
2. As a Media director, open The Team → type a child's name → the row appears
   with a `[River Kids]` badge.
3. Select the child and add as a member → `department_team_members` doc has
   `source: 'river_kids'`, `childId: <id>`, empty `visitorId`.
4. Add an **adult** from the search → the row shows "Linked" immediately (no
   edit-and-resave needed).
5. Edit a child member, change status, save → `source` / `childId` still intact.
6. As a director with no River Kids / Sunday Ministry / Cell access → child
   search still works via the lookup; full child records still denied.
