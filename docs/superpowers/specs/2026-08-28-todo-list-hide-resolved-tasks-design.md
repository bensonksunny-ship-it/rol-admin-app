# To-Do List — Turned-Down & Completed Lines Disappear

**Date:** 2026-08-28
**Component:** `src/components/workspace/ToDoListCard.jsx` (the global To-Do List modal behind the floating "To-Do" capsule)

## Problem

When a To-Do line is actioned — ticked ✓ Completed or ✕ Turned Down — the card
keeps it visible, greyed out (`grayscale opacity-60`), mixed in below the active
items for 30 days (`THIRTY_DAYS_MS` retention window anchored by
`taskAnchorTime`). A summary counter row in the modal header shows
`N Completed` / `M Turned Down` for the same window.

Users want a clean action list: once a line is turned down (or completed), it
should just disappear from this view. The turn-down/completion is still recorded
on the task document for reporting — it is only hidden from the To-Do card.

## Goal

The To-Do List modal shows **only active items** (`status === 'Pending'` or
`'In Progress'`). Ticking a line complete or turning it down removes it from the
list immediately. There is no "Turned Down" tab, no "Completed" tab, and no
30-day greyed history.

## Scope

- **The header notification bell is not touched.** It renders a separate
  synthesized feed (`useActionNotifications` → `NotifPanel`), not tasks; it has
  no Completed/Turned-Down status and its items already vanish on "Ignore" or on
  "+ Add to To-Do".
- **`markTaskTurnedDown` / `markTaskCompleted` are unchanged** — they still write
  `status: 'Turned Down'` + `turnedDownAt` / `status: 'Completed'` + `completedAt`.
  The task doc is preserved so the admin Tasks page (`src/pages/Tasks.jsx`) and
  any reporting still see it.
- **`subscribeTasksForDepartments` is unchanged.** Filtering stays client-side —
  Firestore cannot combine the existing `where('department', 'in', …)` with a
  `where('status', 'not-in', …)` in one query. The Founder path
  (`collection(db, 'tasks')`, unfiltered) would also need its own index. Not
  worth it for a list that is already fully in memory.

## Changes — all in `ToDoListCard.jsx`

### 1. `myTasks` — active only, drop the retention window

Replace the current body:

```js
const myTasks = useMemo(() => {
  return scopedTasks
    .filter((t) => t.status === 'Pending' || t.status === 'In Progress')
    .sort((a, b) =>
      (a.deadline && b.deadline) ? new Date(a.deadline) - new Date(b.deadline) : 0
    )
}, [scopedTasks])
```

- Removes the `relevant` array containing `'Completed'` / `'Turned Down'`.
- Removes the `taskAnchorTime(t) >= cutoff` filter and the active-vs-resolved
  sort branch (there are no resolved items to sink to the bottom anymore).
- Delete the now-unused `THIRTY_DAYS_MS` constant.
- **Delete `taskAnchorTime`.** After this change its only remaining caller is the
  representative-pick inside `displayTasks`, which §3 switches to a `createdAt`
  comparison.

### 2. Optimistic removal on ✓ / ✕

Add a `hiddenIds` state set, applied in `displayTasks` (or one layer up) so a
line disappears on the same tick it is actioned rather than waiting for the
status write to round-trip through `onSnapshot`.

```js
const [hiddenIds, setHiddenIds] = useState(() => new Set())
```

In `completeTask` and `turnDownTask`, before awaiting the write, add every id in
`t.mergedTaskIds || [t.id]` to `hiddenIds`. On failure (the existing
`try/finally` gains a `catch`), remove them again and surface a toast
(`showToast('Failed to update. Please try again.', 'error')` — `showToast`
already exists). Keep the existing `completingIds` / `turningDownIds` sets for
the disabled-button state during the in-flight write.

Filter `hiddenIds` out when building the displayed list:

```js
const visibleTasks = myTasks.filter((t) => !hiddenIds.has(t.id))
```

Feed `visibleTasks` into the dedupe step. Once the Firestore write confirms and
`onSnapshot` drops the task from `scopedTasks`/`myTasks` naturally, the
`hiddenIds` entry is harmless dead weight; no cleanup needed (the set is tiny and
resets on unmount). Existing `AnimatePresence initial={false}` on the list gives
the row its exit animation.

### 3. `displayTasks` — uniform dedupe, no resolved carve-out

Every remaining task is active, so the "resolved items never merge — each keeps
its own row" special case goes away:

- `groupKey` is always `taskDedupeKey(t)` when present, else `__solo:${t.id}`.
  Drop the `&& isActive` condition and the `isActive` local.
- Representative pick: with `taskAnchorTime` deleted, choose the representative by
  `createdAt` (newest wins — "freshest title/notes/deadline"), falling back to
  keeping the first seen if `createdAt` is missing/equal. A small local helper:

  ```js
  const createdMs = (t) => {
    const d = t.createdAt instanceof Date ? t.createdAt : t.createdAt ? new Date(t.createdAt) : null
    return d && !isNaN(d) ? d.getTime() : 0
  }
  ```

- `occurrenceCount` / `mergedTaskIds` / the escalation badge are unchanged.

### 4. Collapse `activeTasks` and remove resolved counters

- `activeTasks` is now identical to `displayTasks` — replace all `activeTasks`
  references (badge count, "N need attention", empty check) with `displayTasks`,
  or keep the name as an alias `const activeTasks = displayTasks`. Prefer the
  alias to minimise diff.
- **Delete** `completedCount` and `turnedDownCount` `useMemo`s.
- **Delete** the summary-counter block in the modal header
  (`{(completedCount > 0 || turnedDownCount > 0) && ( … )}` — the two pills
  "N Completed" / "M Turned Down").

### 5. Row rendering — drop the resolved branch

In the `displayTasks.map` row:

- `const isResolved = …` and every use of it: the `grayscale opacity-60` class,
  and the `{!isResolved && ( … )}` guards around the ✓/✕ action buttons and the
  cell-assignment controls. Every rendered row is now actionable, so render those
  unconditionally.
- Status dot (`w-2 h-2 rounded-full`): only `'In Progress'` (`bg-[#6357c9]`) and
  the Pending default (`bg-amber-400`) can occur — simplify the ternary,
  dropping the Completed/Turned-Down colours.
- Status pill (`{t.status}` badge): keep, but its class ternary likewise reduces
  to In Progress vs Pending.

## Verification (manual, browser)

1. Open the To-Do List capsule with at least one Pending item. Tap ✕ (Turn Down)
   — the line animates out immediately and does not come back. Badge count drops
   by one.
2. Tap ✓ (Complete) on another line — same: disappears immediately.
3. Reopen the modal — turned-down / completed lines are absent. No
   "N Completed / M Turned Down" counter row in the header.
4. `src/pages/Tasks.jsx` (admin Tasks page) still lists the turned-down and
   completed tasks with their statuses — the docs were not deleted.
5. Turn down a line that had a "2nd Reminder" / "Urgent" escalation badge (2+
   merged duplicates) — all merged ids resolve, nothing lingers Pending.
6. Simulate a write failure (offline): tapping ✕ hides the row, then it
   reappears with an error toast when the write rejects.
7. With every task actioned, the capsule shows "All clear 🎉" and the modal shows
   the "All clear — no open tasks 🎉" empty state.
