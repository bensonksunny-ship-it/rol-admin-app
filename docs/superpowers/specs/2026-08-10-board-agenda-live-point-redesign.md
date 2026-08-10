# Board Agenda — Live Presentation State Redesign

## Goal

Replace the cross-document `live.activePointId` reference model (meeting doc → points collection) with per-point presentation state, eliminating the class of bug where the meeting doc's reference and the points collection's actual contents could disagree (a stale/dangling id that "looked occupied" to write guards while simultaneously resolving to nothing for display — the root cause chased across several prior patches).

Confirmed behavior change: Accept Point (and Present/Next Point) always makes the target point the active one unconditionally — no "only if nothing is currently live" guard. Simpler, more predictable, and removes the conditional that kept going wrong.

## Data Model

`board_meeting_points/{id}` gains four fields (unset/false-equivalent until a point is ever staged):

```
isActive: boolean
presentStatus: 'idle' | 'running' | 'paused'
presentStartedAt: Timestamp | null
presentPausedElapsedSeconds: number
```

`sec_core_board_meetings/{id}`'s `live` sub-object (`activePointId`, `status`, `startedAt`, `pausedElapsedSeconds`) is no longer read or written by any code path after this change. Existing docs keep the stale field — no migration/cleanup script; it's inert.

## `src/services/firestore.js`

Remove: `subscribeToBoardMeetingLive`, `selectLivePoint`, `setLiveStatus`.

Add:

**`stagePoint(pointId, { extraPatch = {}, previousActiveIds = [] } = {})`**
- One atomic `writeBatch`:
  - For every id in `previousActiveIds` other than `pointId`: `update` that point doc with `{ isActive: false, presentStatus: 'idle', presentStartedAt: null, presentPausedElapsedSeconds: 0 }`.
  - `update` the target point doc with `{ isActive: true, presentStatus: 'idle', presentStartedAt: null, presentPausedElapsedSeconds: 0, ...extraPatch }`.
- Callers pass their already-loaded `fixedPoints.filter(p => p.isActive).map(p => p.id)` as `previousActiveIds` — normally 0 or 1 entries. Passing it as a list means any accidental multi-active state (shouldn't happen given atomic batches, but costs nothing to defend against) self-heals on the next stage call.
- Accept Point passes `extraPatch` = `{ slNo, allottedTime, durationMinutes, status: 'approved', approvedBy }` — folding "accept" and "stage" into the same atomic write. Present-row and Next Point pass `extraPatch: {}`.

**`setPresentStatus(pointId, status, currentPoint)`**
- `status === 'running'`: `updateDoc` the point with `{ presentStatus: 'running', presentStartedAt: serverTimestamp() }`.
- `status === 'paused'`: computes elapsed running seconds from `currentPoint.presentStartedAt`/`presentStatus` (passed in from the caller's already-subscribed state — no extra `getDoc` read needed, unlike today's `setLiveStatus`), then `updateDoc`s `{ presentStatus: 'paused', presentStartedAt: null, presentPausedElapsedSeconds: <accumulated> }`.

## `src/pages/seccore/SecCoreSummary.jsx` (`BoardAgendaTab`)

- Remove `liveState` state and the `subscribeToBoardMeetingLive` effect entirely.
- `livePoint = fixedPoints.find(p => p.isActive) || null` — derived from the points list the component already subscribes to (`subscribeToBoardPoints`); no separate listener, no cross-document resolution.
- `liveRemainingSeconds` computed from `livePoint.presentStatus/presentStartedAt/presentPausedElapsedSeconds` instead of a separate `liveState` object.
- `handleAcceptPoint`: after validating duration, calls `stagePoint(bp.id, { extraPatch: acceptPatch, previousActiveIds: fixedPoints.filter(p => p.isActive).map(p => p.id) })` as the single write (replacing the current two-step `updateBoardPoint` + conditional `selectLivePoint`).
- `handleUnfix`: the existing reset patch (`slNo: '', allottedTime: '', status: 'pending', approvedBy: '', durationMinutes: null`) unconditionally also includes `isActive: false, presentStatus: 'idle', presentStartedAt: null, presentPausedElapsedSeconds: 0` — no "was this the live one?" branch.
- `handleRestartMeeting`: one batch (via repeated `updateBoardPoint`-equivalent patches, or reuse `stagePoint`'s batch pattern) resetting every fixed point's accept fields *and* active/timer fields together — no separate "also clear the live doc" step.
- Per-row "Present" button and the Live Controls bar's "Next Point" button both call `stagePoint` the same way (empty `extraPatch`, `previousActiveIds` from currently-active fixed points).
- Start/Pause button calls `setPresentStatus(livePoint.id, nextStatus, livePoint)`.
- `liveError` banner pattern stays, now with simpler catch sites (one write per action instead of two sequential ones that could partially fail).

## `src/pages/BoardPresentView.jsx`

- Remove the `subscribeToBoardMeetingLive` subscription and `meeting.live` read.
- `activePoint = fixedPoints.find(p => p.isActive) || null`.
- Countdown computed from `activePoint.presentStatus/presentStartedAt/presentPausedElapsedSeconds` directly, same formula as before, just reading from the point instead of the meeting's `live` object.
- One fewer Firestore listener than the current implementation.

## Error Handling

Every user action (Accept Point, Present, Next Point, Unfix, Restart Meeting) is now exactly one atomic Firestore batch — it either fully succeeds or fully fails. This structurally removes the "point got accepted but staging silently failed, leaving two derived values disagreeing" failure mode that caused the original bug. Failures still surface via the existing `liveError` banner.

## Out of Scope

- Cleaning up/deleting the orphaned `live` field from existing `sec_core_board_meetings` docs.
- Any change to the Start Time / Time Allotted theoretical-schedule column (separate, unrelated concern).
- Multi-meeting-concurrently-active protections beyond what already exists (`fixedPoints` is already scoped to the selected meeting's date).
