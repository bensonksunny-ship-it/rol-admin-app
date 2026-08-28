# Media team table — three-dots Actions menu with Founder-gated Link/Relink

**Date:** 2026-08-28
**Page:** `/department/media?tab=team` — the generic team table in `DepartmentHub.jsx`

## Problem

The generic team table's Actions cell shows three inline text links — **Edit**
(blue), **Link/Relink** (indigo), **Delete** (red). On Media it reads as cluttered,
and **Link/Relink** (which rebinds a team member to a People's Directory /
D-Light record) is an advanced operation that regular department directors
should not be reaching for.

## Goal

For **Media only**, replace the inline links with a single `MoreVertical`
three-dots button that opens a popover menu (**Edit**, **Link / Relink**,
**Delete** in red). Show **Link / Relink** only to Founder / Super Admin
(`isFounder`); everyone else sees just **Edit** and **Delete**.

## Scope

- The generic team table is shared by Media, Sunday Ministry, River Kids,
  Administration, Accounts, and Caring. This change is gated to `slug === 'media'`
  — the other five keep the inline links. (Same Media-only gating already used for
  the roster's Sub-Department column and the Sub-Departments panel.)
- D-Light's team card/list view is a separate layout with only Edit + Remove and
  no Link/Relink — untouched.
- No change to the Edit form, the Link modal (`teamMemberLinking`), or the
  delete confirmation.

## Design

### Menu contents

| Item | Visible to | Action (unchanged from today) |
|---|---|---|
| **Edit** | anyone with `canEdit` | `setEditingMember(m)` + populate `memberForm` |
| **Link** / **Relink** | `isFounder` only | `setTeamMemberLinking(m)` — label "Relink" when `m.visitorId`, else "Link" |
| **Delete** (red) | anyone with `canEdit` | `window.confirm('Remove this member from team?')` → `deleteDepartmentTeamMember(m.id)` → drop from `team` |

A non-Founder Media director sees **Edit** and **Delete** only.

### Implementation (`DepartmentHub.jsx`)

- New state: `const [teamActionMenuId, setTeamActionMenuId] = useState(null)` —
  holds the open row's `m.id`, or `null`.
- Mirror the existing PCS three-dots menu pattern already in this file
  (`pcsMenuOpenId`, ~line 5433): a `fixed inset-0 z-10` transparent click-catcher
  `<div>` that closes the menu on any outside click, plus the menu itself
  positioned `absolute right-0 top-full mt-1 z-20` — white, `rounded-xl`,
  `border`, `shadow-lg`, `min-w-[160px]`, one `<button>` per item with a small
  leading icon (Edit → pencil, Link → link glyph, Delete → trash, red text).
- The Actions `<td>` (currently `{canEdit && (<td>…three buttons…</td>)}`)
  becomes:
  - `canEdit && slug === 'media'`: `<td>` → `<div className="relative inline-block">`
    → dots button (`MoreVertical` from `lucide-react`) + `{teamActionMenuId === m.id && (…click-catcher + menu…)}`.
  - `canEdit && slug !== 'media'`: the existing three inline `<button>`s, verbatim.
- Every menu item's `onClick` runs its handler **and** `setTeamActionMenuId(null)`;
  clicks call `e.stopPropagation()` (matches the PCS pattern). The dots button
  toggles: `setTeamActionMenuId(open ? null : m.id)`.
- The three existing `onClick` handler bodies move verbatim into the menu items —
  relocation only, no logic change.

### Not doing

- No shared `<ActionMenu>` component — single call site, mirrors an existing
  in-file pattern; extracting now is premature.
- The mobile view of the generic table: the table is already inside
  `overflow-x-auto` and has no separate mobile card layout for non-D-Light
  departments, so the menu works as-is there.

## Files touched

| File | Change |
|---|---|
| `src/pages/DepartmentHub.jsx` | `teamActionMenuId` state; Media branch of the Actions `<td>` → three-dots button + popover menu; `MoreVertical` import |

## Verification (manual, in browser)

1. Media → The Team: each row's Actions cell shows a single three-dots button.
2. Founder: menu shows Edit · Link/Relink · Delete. "Relink" label on linked
   rows, "Link" on unlinked.
3. Non-Founder Media director: menu shows Edit · Delete only.
4. Edit / Link / Delete each behave exactly as before; menu closes after the
   click and on any outside click.
5. Sunday Ministry / River Kids / Administration / Accounts / Caring team tables:
   still show the three inline text links.
