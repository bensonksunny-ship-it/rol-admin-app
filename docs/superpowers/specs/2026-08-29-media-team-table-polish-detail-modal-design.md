# Media team table polish + member detail modal

**Date:** 2026-08-29
**Page:** `/department/media?tab=team` — generic team-table branch in `DepartmentHub.jsx`

## Problem

The Media team roster is a plain table (SL / Name / Sub-Department text / Status
/ Member since / Actions). Sub-departments render as comma text or a bare `—`,
there are no avatars, and a row shows nothing on click. There's no quick way to
see a member's contact details, serving areas, or recent crew history without
opening the Edit form.

## Goal

For **Media only**: polish the table (avatars, pill sub-department badges, a
clear row-hover, clickable rows) and open a detail modal on row click. Reuse the
existing `detailMember` modal (today used by Cell member rows) rather than
building a new one.

## Scope

- Gated to `slug === 'media'`. The other five departments' team tables are
  unchanged, as is the Cell usage of `openMemberDetail` / the `detailMember`
  modal.
- D-Light's team card/list view is a separate layout — untouched.
- No change to the Edit form (still reached via the three-dots menu → Edit).
- One file: `src/pages/DepartmentHub.jsx`.

## Design

### 1. Table polish (generic team-table branch, `slug === 'media'`)

- **Row** — add `cursor-pointer transition-colors hover:bg-slate-50/80` and
  `onClick={() => openMemberDetail(m, null, { mediaTeam: true })}`. The Actions
  `<td>` gets `onClick={(e) => e.stopPropagation()}` so the three-dots control
  never also opens the modal (its own handlers already `stopPropagation`; this
  is belt-and-braces).
- **Name cell** — a single-initial avatar circle
  (`w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold`,
  matching the D-Light team cards) before the name, then the name, then the
  existing Founder-only Linked/Unlinked badge, plus a `[River Kids]` amber pill
  when `m.childId`.
- **Sub-Department cell** — render the member's sub-departments
  (`m.subDepartments`, falling back to `[m.subDepartment]`) as soft pill badges
  (`bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-2 py-0.5
  text-[11px] font-medium`); a muted `Unassigned` pill
  (`bg-slate-100 text-slate-400`) when there are none. Never a bare `—`.
  `formatTeamSubDepartmentCell` stays for the non-Media path.
- **Table chrome** — wrap the `overflow-x-auto` container in
  `rounded-xl border border-slate-200`, keep `divide-y divide-slate-100` on
  `<tbody>`.

### 2. Detail modal — extend the existing `detailMember` portal

**`openMemberDetail(m, cellId, context = {})`** — new optional 3rd argument.
When `context.mediaTeam` is set, the existing `Promise.all` also runs
`getMediaSchedules()`. Cell call sites (`openMemberDetail(m, cell.id)`) pass no
context and are unaffected.

New state: `detailMemberContext` (the `context` object) and
`detailMemberMediaAssignments` (raw schedule docs). Both reset at the top of
`openMemberDetail` alongside the other `detailMember*` resets.

**Header** (`DepartmentHub.jsx:10055`):
- avatar circle + name on one line, followed by the Linked / `River Kids` badge
- phone: `detailMemberVisitor?.phone || detailMember.phone`
- email line when `detailMemberProfile?.email || detailMemberVisitor?.email`

**New "Media Team" card** — rendered only when `detailMemberContext?.mediaTeam`,
placed just after the header block / "not linked" notice:
- **Serving areas** — `detailMember.subDepartments` as pills, or "None assigned".
- **On the team since** — `formatDMY(detailMember.memberSince)` when present.
- **Active status** — a toggle switch, `canEdit`-gated. On change:
  `await updateDepartmentTeamMember(detailMember.id, { status: next })`, then
  `setTeam(prev => prev.map(x => x.id === detailMember.id ? { ...x, status: next } : x))`
  and `setDetailMember(d => ({ ...d, status: next }))`. Disabled while writing.
- **Recent Media crew assignments** — from `detailMemberMediaAssignments`: take
  the last 8 schedules by date, collect this member's assignments (match
  `a.memberId === detailMember.id`, fallback `a.memberName === detailMember.name`),
  tally by `role` → "Camera 1 — 3×, Sound — 1×", and list the 3 most recent
  service dates. "Not rostered in the last 8 services." when none.

**Empty state** (`DepartmentHub.jsx:10175`) — the
`No additional details on file` condition also returns false when
`detailMemberContext?.mediaTeam` (the Media Team card always renders something).

## Files touched

| File | Change |
|---|---|
| `src/pages/DepartmentHub.jsx` | `openMemberDetail` 3rd arg + 2 new state vars + `getMediaSchedules` fetch; Media team-table row: avatar, pill badges, hover, click; modal header avatar/email; new Media Team card |

## Verification (manual)

1. Media → The Team: rows show an avatar and pill sub-department badges; hovering
   highlights the row; the cursor is a pointer.
2. Click a row (not the three-dots) → the detail modal opens with the avatar,
   name, linked/River-Kids badge, phone/email, serving-area pills, "on the team
   since", an active toggle, and a recent-crew-assignments summary.
3. Toggle Active in the modal → the table's Status cell updates; reopening the
   modal shows the new state.
4. Click the three-dots → the menu opens, the modal does not.
5. A River Kids child member: modal shows the `River Kids` badge and the
   "not linked" limited-details notice; the Media Team card still renders.
6. Cell member rows elsewhere: their detail modal is unchanged (no Media Team
   card, no extra fetch).
7. Sunday Ministry / River Kids / Administration / Accounts / Caring team
   tables: unchanged (plain rows, no avatars).
