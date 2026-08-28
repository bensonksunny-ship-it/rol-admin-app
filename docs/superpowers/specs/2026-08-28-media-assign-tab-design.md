# Media "Assign" tab — date-scoped, Worship-style

**Date:** 2026-08-28
**Page:** `/department/media?tab=assign` (`DepartmentHub.jsx`, `slug === 'media'`)

## Problem

Media assigns people through a small "Media Team Assignment" panel on the Hub:
each user-created sub-department maps to one member, stored as
`department_assignments/media.assignments`. There is no per-service planning, no
place to record what each role actually does, and no place for the technical
detail (camera/lens, stream key, output) a Media crew needs.

## Goal

A dedicated top-level **Assign** tab that mirrors Worship's assignment workflow —
pick a coming Sunday, assign the crew, save to a read-only "stamp" — with
Media-specific columns: **Role / Slot**, **Assigned To**, **Nature /
Description**, **Tech Spec / Notes**.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope model | Date-scoped per Sunday, like Worship |
| Existing Hub panel | Remove it entirely |
| Roles | Fixed list of 6 |
| Member picker | Extract Worship's `MemberPicker` into a shared component |

## Design

### A. Navigation

- `getDepartmentHubTabs('media')` → `['summary', 'upcomingSunday', 'team',
  'assign', 'finance', 'operations']`.
- `getTabLabel('assign')` → `'Assign'` and `getTabIcon('assign')` → `UserCheck`
  already exist (D-Light uses them). No change to `departmentSubpages.js`.
- New content block in `DepartmentHub.jsx`, sibling of the D-Light assign block:
  `slug === 'media' && activeTab === 'assign'`.

### B. Remove the old Hub panel

- Delete the "Media Team Assignment" card from the `slug === 'media'` summary
  branch. The "Sunday Program" card below it stays.
- Remove `mediaAssignments`, `setMediaAssignments`, `saveMediaAssign`,
  `savingMediaAssign`, and the `getDepartmentAssignments('media')` load effect.
- `department_assignments/media`'s `assignments` field is abandoned; the doc is
  left in place (other slugs share the collection). The Media Hub's "Media Team
  Assignment" empty-state link that pointed at The Team page goes away with the
  card.
- The `slug === 'media' && activeTab === 'summary'` branch of the
  sub-departments load effect (`DepartmentHub.jsx:1118`) is no longer needed and
  is removed from that condition.

### C. Shared `<MemberPicker>`

New `src/components/MemberPicker.jsx` — the portal dropdown lifted verbatim from
`DepartmentWorship.jsx` (avatars, secondary detail line, click-outside, scroll
re-anchoring, Esc-to-close, the baked-in green "Active" chip). It carries a
private `initialsOf` helper so nothing else has to move.

Props:

| Prop | Meaning | Default |
|---|---|---|
| `value` | selected member id | — |
| `members` | member list to choose from | — |
| `onChange(id, name)` | selection callback | — |
| `tint` | avatar background utility class | `'bg-slate-400'` |
| `getDetail(m)` | secondary line under the name | `() => ''` |
| `getBadges(m)` | `[{ label, className }]` pills after the name | `() => []` |
| `emptyLabel` | text for the unassigned state | `'Not assigned'` |

`DepartmentWorship.jsx`: delete the local `MemberPicker` function, add the
import, update its **two** call sites (desktop table row + `RoleAssignCard`
mobile) to pass:

```jsx
tint={roleGroupTheme(role).avatar}
getDetail={memberDetailLine}
getBadges={(m) => m.isWorshipDirector
  ? [{ label: 'Director', className: 'bg-amber-100 text-amber-700 ring-amber-200' }]
  : []}
```

`MemberAvatar`, `AssignedMember`, `UnassignedBadge`, `initialsOf`, `RolePill`
stay in `DepartmentWorship.jsx` untouched.

### D. Data — `media_schedule` collection

Mirrors `worship_schedule`. One doc per Sunday:

```
{ department: 'Media',
  date: '<yyyy-MM-dd Sunday>',
  assignments: [ { role, memberId, memberName, nature, techSpec } ],
  updatedBy, updatedAt }
```

`src/services/firestore.js`:

- `getMediaScheduleByDate(date)` — query `media_schedule` where
  `department == 'Media'`, find the doc whose `date` matches; return
  `{ id, ...data }` or `{ date, assignments: [] }`.
- `setMediaScheduleByDate(date, assignments, updatedBy)` — `normalizeToSunday`
  the date, find-or-add the doc, write `{ department, date, assignments,
  updatedBy, updatedAt }`. Same shape as `setWorshipScheduleByDate` (reuse the
  existing module-level `normalizeToSunday`).

`firestore.rules` — new block. `worship_schedule` itself is `allow read, write:
if isSignedIn()`, but the collection this feature replaces (`department_assignments`)
is department-scoped, so `media_schedule` follows that stricter pattern:

```
match /media_schedule/{docId} {
  allow read, write: if isSignedIn() && (isFullAccess() || canAccessDept('Media'));
}
```

### E. Media Assign tab UI (`DepartmentHub.jsx`)

`MEDIA_ASSIGN_ROLES` module constant — the fixed six, each with placeholder text:

| Role / Slot | `naturePlaceholder` | `techSpecPlaceholder` |
|---|---|---|
| Video Director | Live Mix & Switching | ATEM Mini / vMix |
| Camera 1 | Wide & Stage Shots | Camera A – 85mm Prime |
| Camera 2 | Close-ups & Congregation | Camera B – 24-70mm |
| Lower Thirds / Slides | Lyrics & Announcement Cue | ProPresenter Main Output |
| Stream Operator | Stream Health & Chat | OBS Stream Key 1 |
| Lighting Tech | Stage & Ambient Lighting | Lighting Console |

- **Header card:** "Coming Sundays" chip row (next 5 Sundays from a local
  `mediaUpcomingSundays()` helper) + a custom date input snapped to Sunday.
  **Edit Plan** ↔ **Cancel** / **Save plan** toggle.
- **After save / on load with data:** collapsed read-only stamp (formatted date
  + list of assigned `role → memberName`), an "Edit plan" affordance to reopen —
  mirroring `WorshipStamp`.
- **Desktop table** (`md:` and up): **Role / Slot** (pill) · **Assigned To**
  (`<MemberPicker>` in edit mode; avatar + name / "Not assigned" read-only) ·
  **Nature / Description** (text input) · **Tech Spec / Notes** (text input).
- **Mobile** (`< md`): one stacked card per role — pill, MemberPicker, Nature
  input, Tech Spec input.
- `activeMembers = team.filter(m => !m.isFormer && m.status !== 'former')` (the
  already-loaded `team` array). MemberPicker props: `tint="bg-indigo-500"`,
  `getDetail={m => (m.subDepartments || []).join(' · ') || m.role || ''}`,
  `getBadges={() => []}`.
- Local state: `mediaAssignDate` (defaults to the forthcoming Sunday),
  `mediaSchedule`, `mediaLocalRows` (array aligned to `MEDIA_ASSIGN_ROLES`),
  `mediaAssignEditing`, `mediaAssignSaving`, `mediaAssignStamp`,
  `mediaStampOpen`.
- Load effect: on `slug === 'media' && activeTab === 'assign'` and whenever
  `mediaAssignDate` changes, call `getMediaScheduleByDate`; seed
  `mediaLocalRows` from the doc (merging saved entries onto the fixed six by
  `role`), set the stamp if the doc has any assigned member, reset editing to
  false.
- Save: build `assignments` from `mediaLocalRows` (drop rows with no member AND
  no nature AND no techSpec), call `setMediaScheduleByDate`, set the stamp,
  leave edit mode.

### Out of scope

No song fields, no add/remove rows, no "arrived" tracking, no analytics, no
push-to-Sunday-Plan. No department other than Media is affected beyond the
two-call-site `MemberPicker` refactor in Worship.

## Files touched

| File | Change |
|---|---|
| `src/constants/departmentTabs.js` | add `'assign'` to Media's tab list |
| `src/components/MemberPicker.jsx` | **new** — shared picker extracted from Worship |
| `src/pages/DepartmentWorship.jsx` | drop local `MemberPicker`, import shared, update 2 call sites |
| `src/services/firestore.js` | `getMediaScheduleByDate`, `setMediaScheduleByDate` |
| `src/pages/DepartmentHub.jsx` | remove old Hub panel + its state/effect; add the Assign tab block, `MEDIA_ASSIGN_ROLES`, date helper, load/save |
| `firestore.rules` | `media_schedule` match block |

## Verification (manual, in browser)

1. Media navbar shows: Hub · Upcoming Sunday · The Team · **Assign** · Finance ·
   Operations.
2. Media Hub no longer shows the "Media Team Assignment" card; "Sunday Program"
   still renders.
3. Assign tab: pick a coming Sunday → Edit Plan → assign members via the picker
   (avatars, sub-dept detail line), fill Nature / Tech Spec → Save plan →
   collapses to the stamp; reload the tab → the stamp reflects the saved data.
4. Switch to a different Sunday → independent set of assignments.
5. Worship Assign tab still works: member picker opens, assigns, saves; Director
   badge still shows.
6. A non-Media user cannot read/write `media_schedule` (rules).
