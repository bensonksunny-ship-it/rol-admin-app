# Sec-Core — Chairman of the Board

**Date:** 2026-09-09
**Area:** Sec-Core / Director Board (Leadership View) — `src/pages/seccore/SecCoreSummary.jsx`
**Status:** Approved for planning

## Problem

The Director Board / Leadership View lists Secretaries, Directors, and
Coordinators, but there is no way to record who chairs the board. Sec-Core needs
to name a single Chairman of the Board, show it on the Leadership View, and
surface it on the Board Agenda so a meeting reads as "Chaired by <name>".

## Scope

In scope:

- A single Chairman of the Board designation (exactly one person, or none).
- Display on the Director Board / Leadership View.
- Display on the Board Agenda drawer's meeting header.
- Link the Chairman to a signed-in account (`userId` / `email`), reusing the
  existing member account-resolution and Link Account flow.

Out of scope:

- Tenure history (no `from` / `to` dates; setting a new Chairman overwrites).
- Any permission / access-control behaviour tied to being Chairman.
- Board Present view, Analytics Hub, workspace banner, `firestore.rules`.

## Data model

A new `chairman` field on the existing `sec_core/director_board` Firestore doc,
stored alongside `members[]`.

```js
chairman: {
  personId: '',   // from People Directory (PersonPicker); optional
  name: '',       // display name — the only required field
  userId: '',     // resolved signed-in account id (via resolveAccount)
  email: '',      // resolved signed-in account email (lowercased)
} | null           // null / field absent = no Chairman set
```

- `setSecCoreDirectorBoard(data, updatedBy)` already writes with `{ merge: true }`,
  so writing `{ chairman }` leaves `members[]` untouched.
- Security rules already cover this doc:
  `match /sec_core/director_board` — read for any signed-in user, write for
  `isFullAccess() || canAccessDept('Sec-Core')`. **No rules change or deploy.**
- Reads: `subscribeToDirectorBoard` / `getSecCoreDirectorBoard` already return the
  whole doc; consumers read `d.chairman` from the same snapshot they read
  `d.members` from. No new firestore.js functions.

## Behaviour

### Setting / editing (canEdit only)

- `DirectorBoardTab` gains `chairman` state, populated from the same
  `subscribeToDirectorBoard` snapshot that populates `members`.
- Save path: build the `chairman` object, resolve the account with the existing
  `resolveAccount(name)` helper (only re-resolve when the name changed, mirroring
  `applyEdit`), then `save({ members, chairman })` through the existing
  `setSecCoreDirectorBoard`.
  - `save()` currently takes `nextMembers` and calls
    `setSecCoreDirectorBoard({ members: nextMembers }, ...)`. Generalise it to
    take a partial doc patch (`save({ members })` / `save({ chairman })`), or add
    a sibling `saveChairman(next)` — implementation plan decides. Either way the
    merge write must never drop `members`.
- Editing uses a small inline form: `PersonPicker` (People Directory) plus a
  free-text name fallback for someone not in the directory.
- Removing sets `chairman: null` (write `null`, not a field delete, so the
  snapshot listeners see the change cleanly).
- Account-link correction reuses the existing `LinkAccountModal` +
  `applyAccountLink`-style path, targeting `chairman` instead of `members[idx]`.

### Director Board / Leadership View card

New **Chairman of the Board** card, pinned at the top of `DirectorBoardTab`'s
content, above the "Scheduled Meetings" card.

- **Unset + canEdit:** slim dashed-border card with a "Set Chairman" button.
- **Unset + viewer:** card hidden entirely.
- **Set:** highlighted card with an amber/gold accent (distinct from the
  indigo / violet / emerald position sections). Shows avatar initial, name, the
  label "Chairman of the Board", and — when `canEdit` — the same linked-account
  status line the member rows show:
  - `m.userId` present → `Linked: <email or —>`
  - else → `⚠ Account not linked`
- **canEdit actions:** a `⋮` button opening the portal-anchored menu (same
  pattern as the member-row action menu: `getBoundingClientRect` + `createPortal`
  to `document.body`, `position: fixed`, `z-[60]/[61]`, closes on scroll/resize)
  with **Edit** and **Remove**. A **Link Account…** entry (or a control inside the
  edit form) opens `LinkAccountModal`.

### Board Agenda drawer

- `DirectorBoardPage` already subscribes to `subscribeToDirectorBoard`; it reads
  `chairman` from the same snapshot and passes it to `BoardAgendaTab` (which
  already receives a `members` prop) and to `DirectorBoardTab`.
- In `BoardAgendaTab`, the indigo meeting header (the `ROL Board Meeting` /
  date block, shown when `selectedDate && hasScheduledMeeting`) gains one line
  under the date, only when a Chairman is set:

  > `Chaired by <chairman.name>`

  Styled like the existing `text-xs text-indigo-300` sub-line.

## Components touched

| File | Change |
|---|---|
| `src/pages/seccore/SecCoreSummary.jsx` | `DirectorBoardTab`: `chairman` state, save path, Chairman card, edit form, action menu. `DirectorBoardPage`: read `chairman`, pass to children. `BoardAgendaTab`: accept `chairman` prop, render "Chaired by" line. |

No changes to `firestore.js`, `firestore.rules`, or any other file.

## Testing (manual, in browser)

1. As a Sec-Core editor on `/department/sec-core?tab=directorboard`:
   - Card shows "Set Chairman" when none set.
   - Set a Chairman from the directory → card shows name + linked-account status.
   - Edit → change to a free-text name not in the directory → saves, shows
     `⚠ Account not linked`.
   - Use Link Account… → pick an account → status flips to `Linked: <email>`.
   - Remove → card returns to the "Set Chairman" state.
   - Action menu opens fully visible (not clipped) even on a narrow window.
2. As a viewer (no edit access): card is hidden when unset; read-only when set.
3. Open the Board Agenda drawer on a date with a scheduled meeting → header shows
   `Chaired by <name>`. Unset the Chairman → line disappears.
4. Confirm `members[]` (the three roster sections) is unaffected by every
   Chairman write.
