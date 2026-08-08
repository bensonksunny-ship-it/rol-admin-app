# Board Meeting Workspace Banner — Design Spec

## Goal

Restyle `BoardMeetingWorkspaceWidget` (rendered on `/workspace`, directly under `ToDoListCard` and `WorshipWorkspaceWidget`) so it matches the visual language of the worship assignment banner: a single full-width purple gradient pill, not an expandable multi-meeting card. Clicking its action button opens the meeting's point-submission modal directly, with no intermediate expand step.

## Current State

`src/components/workspace/BoardMeetingWorkspaceWidget.jsx`:
- Amber/orange gradient header (`from-amber-500 to-orange-500`, `border-amber-300`)
- Text: `Hello {name}, a Board Meeting is scheduled — {title} on {date}`
- `More ▾` toggle expands the card in place into a list of every upcoming meeting (up to 5), each with its own "Submit Point" button opening `BoardPointsModal`

## Change

Same file, no new components, no service/Firestore changes.

- **Drop the expand/list behavior.** Remove `expanded` state and the `upcomingMeetings.map(...)` block. The widget becomes a single static banner row — no expand/collapse.
- **Scope to one meeting.** Use only `nextMeeting = upcomingMeetings[0]` (already computed). Visibility gate is unchanged: hidden unless `isRosterMember && upcomingMeetings.length > 0`.
- **Restyle to match Worship's banner**: `bg-gradient-to-r from-violet-600 to-indigo-600` / `border-violet-300`, replacing the amber/orange treatment — same color weight as `WorshipWorkspaceWidget`'s `isScheduledThisSunday` header state.
- **New copy**: `Hello {myFirstName}, you are invited to the Director Board Meeting on {formatted date}` — date formatted the same way the widget already formats `nextMeeting.date` today.
- **New action**: right side shows `More` with a right-chevron (`ChevronRight` from lucide, replacing the `▾`/rotate treatment, since it's a navigation action now, not a toggle). `onClick` calls `setPointsMeetingId(nextMeeting.id)` directly — same state variable and same `BoardPointsModal` render already at the bottom of this component, just invoked immediately instead of after an expand step.

## Out of Scope

- No change to `BoardPointsModal` itself.
- No change to how multiple upcoming meetings are surfaced elsewhere (e.g. `DirectorBoardTab`'s own Scheduled Meetings list on the Sec-Core page keeps showing up to 6).
- Sec-Core Director Board Edit/Delete Meeting feature (separate, still-pending design) — unrelated to this file.
