# Board Agenda — Dual-Screen Presentation View

**Date:** 2026-08-08
**Status:** Approved

## Overview

Board meetings currently run entirely off the Board Agenda modal/table (`BoardAgendaTab` in `src/pages/seccore/SecCoreSummary.jsx`, `/department/sec-core?tab=directorBoard`). This spec adds a "keynote-style" presentation mode: the laptop running the app extends its display to a conference-room TV, a full-screen view on that extended display shows whichever agenda item is currently being discussed with a live countdown, and a small set of controls in the admin table drives what's shown.

Confirmed setup: same laptop, same logged-in browser session, OS-level extended display (not a second device) — but the sync mechanism is still built on Firestore (not `BroadcastChannel`) so it also survives a reload/crash of the presentation window and isn't tied to staying on one machine if that ever changes.

## Data Model

No new collection. Add a `live` object to the existing per-meeting doc (`sec_core_board_meetings/{meetingId}`):

```
live: {
  activePointId: string | null,
  status: 'idle' | 'running' | 'paused',
  startedAt: Timestamp | null,       // when the current run segment began
  pausedElapsedSeconds: number,      // accumulated seconds from prior run segments
}
```

Remaining countdown seconds for the active point:
```
durationMinutes * 60 − pausedElapsedSeconds − (status === 'running' ? (now − startedAt) : 0)
```
Computed client-side, ticking every second, independently on the controller and the presentation view. Both read the same three fields and tick locally — no server-driven clock, so brief network hiccups don't desync the visible countdown (it'll just catch up on the next snapshot).

Only points that have gone through **Accept Point** (`slNo && allottedTime`, i.e. `durationMinutes` is set) are selectable as the active point — unaccepted points have no duration to count down from.

### New `firestore.js` functions

Alongside the existing `sec_core_board_meetings` helpers (`createBoardMeeting`, `updateBoardMeeting`, etc.):

- `subscribeToBoardMeetingLive(meetingId, onChange)` — real-time listener on the meeting doc, passes `data.live` (or a default idle shape if unset) to `onChange`.
- `selectLivePoint(meetingId, pointId)` — sets `activePointId: pointId`, `status: 'idle'`, `startedAt: null`, `pausedElapsedSeconds: 0`. Used by "Select Next Point."
- `setLiveStatus(meetingId, status)` — `'running'`: sets `startedAt: serverTimestamp()`, `status: 'running'`. `'paused'`: reads current state, adds the just-elapsed segment into `pausedElapsedSeconds`, sets `startedAt: null`, `status: 'paused'`.

## Controller UI (`BoardAgendaTab`, `canEdit` only)

- **Present** button added to the existing per-meeting header bar (next to the "X/Y fixed" badge and the meeting's ⋮ menu), desktop-only (hidden below `sm` breakpoint). Calls `window.open('/board-present/' + activeMeeting.id, '_blank')`.
- **Live Controls** bar rendered just below that header, only when `fixedPoints.length > 0`:
  - Current live point's department name (or "Nothing selected yet").
  - Start/Pause toggle — calls `setLiveStatus(activeMeeting.id, 'running' | 'paused')`, reflecting the synced `status`.
  - **Next Point** button — calls `selectLivePoint` with the entry in `fixedPoints` immediately after the current `activePointId` (wraps to the first point if the current one is last, or selects the first point if none is selected yet). Selecting does **not** auto-start — matches Start being a separate explicit action.
  - A small local countdown mirror (same computation as the presentation view) so the controller can see timing without switching windows.

## Presentation Route (`/board-present/:meetingId`)

- New top-level route in `src/App.jsx`: `<Route path="/board-present/:meetingId" element={<ProtectedRoute><BoardPresentView /></ProtectedRoute>} />`, declared as a sibling to the `/login` route and the main `MainLayout`-wrapped block — **not** nested inside `MainLayout`. This is the first route in the app that requires auth but renders no sidebar/nav chrome, which a full-screen presentation view needs.
- New component `src/pages/BoardPresentView.jsx`:
  - Reads `:meetingId` from the URL, subscribes to the meeting doc (title/date) and its `live` field via `subscribeToBoardMeetingLive`.
  - Subscribes to that meeting's board points (existing `subscribeToBoardPoints`, filtered client-side by `meetingId`/`meetingDate` the same way `BoardAgendaTab` already does) to resolve `activePointId` into the full point record (department, point text, `durationMinutes`).
  - **Active state:** full-screen dark background, large centered typography — Department Name and Director Name near the top, Discussion Point text large and centered as the visual focus, and a big countdown timer below it. Countdown turns red/"OVERTIME" styling once it passes zero — no auto-advance, matches the manual-control decision.
  - **Idle state** (`status: 'idle'` with no `activePointId`, or the meeting has no accepted points yet): centered "Waiting for the next point…" message with the meeting title/date, same dark high-contrast styling.
  - Director Name resolution reuses the same `activeDirectorByDept` approach already built in `BoardAgendaTab` (needs the board `members` roster — fetched here via `subscribeToDirectorBoard`, same as `DirectorBoardPage` already does for the controller side).

## Out of Scope

- Auto-advancing to the next point when the countdown hits zero — manual control only, per your answer.
- `BroadcastChannel`/same-device-only fallback sync — Firestore sync already covers the confirmed extended-display setup and is strictly more capable.
- Any change to the existing "Time Allotted" theoretical schedule column (Start Time + cumulative `durationMinutes`) — the live countdown is a separate, independent clock driven by actual Start/Pause presses, not the precomputed schedule.

## File Changes

| File | Change |
|------|--------|
| `src/services/firestore.js` | Add `subscribeToBoardMeetingLive`, `selectLivePoint`, `setLiveStatus` |
| `src/pages/seccore/SecCoreSummary.jsx` | Add Present button + Live Controls bar to `BoardAgendaTab` |
| `src/pages/BoardPresentView.jsx` | New file — full-screen presentation view |
| `src/App.jsx` | New `/board-present/:meetingId` route (ProtectedRoute only, no MainLayout) |
