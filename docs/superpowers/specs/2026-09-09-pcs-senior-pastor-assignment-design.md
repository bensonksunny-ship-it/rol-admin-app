# PCS Senior Pastor Assignment — Design

## Problem

"Senior Pastor" is currently a hardcoded name (`SENIOR_PASTOR_NAME = 'Benson K Sunny'` in
`src/utils/seniorPastor.js`). That constant already drives real behavior across the app —
a gold badge in People Directory, a highlighted PCS card in Caring, a tagged row in Sunday
Report attendance — via name-string matching (`isSeniorPastorName`). Separately,
`ROLES.SENIOR_PASTOR` is a real login/permissions role on a `users/{uid}` account, set
manually today via Admin User Management, that happens to already point at the same person.

Changing who holds this position currently requires editing source code and redeploying.
This spec makes it an in-app action: a Founder marks one PCS entry as Senior Pastor, which
becomes the new single source of truth for both the name-badge highlight and (when the
person has a login) their `ROLES.SENIOR_PASTOR` permissions — replacing whoever held it
before.

## Data model

New singleton document, same collection/pattern as the existing `settings/pastoral_roster`:

```
settings/senior_pastor
{
  pcsEntryId: string,       // caring_pcs doc id
  visitorId: string | null, // matches caring_pcs entry's visitorId, if any
  name: string,
  email: string,            // from the PCS entry, used for the account-linking lookup
  linkedUid: string | null, // users/{uid} whose role was synced, if a match was found
  updatedAt: Timestamp,
  updatedBy: string,        // display name of the Founder who made the change
}
```

`firestore.rules` already covers `settings/{docId}` (read: any signed-in user; write:
`isFullAccess()`, i.e. Founder) — no rules changes needed.

**No-doc fallback:** if `settings/senior_pastor` doesn't exist yet, the app behaves exactly
as it does today — every consumer falls back to the hardcoded `SENIOR_PASTOR_NAME`. The
first time a Founder uses the new "Set as Senior Pastor" action (even re-confirming the
same person), that becomes the real data going forward. No separate migration step.

## Assignment flow

New `assignSeniorPastor(pcsEntry, actor)` in `src/services/firestore.js`:

1. Query `users` for one doc where `email == pcsEntry.email` (skip if the entry has no
   email) → `incomingUid`, or `null`.
2. Read the current `settings/senior_pastor` doc → `outgoingUid` (its `linkedUid`), or
   `null` if unset (first-ever assignment).
3. If `outgoingUid` exists and differs from `incomingUid`: fetch that user's `positions`
   and set their `role` to `deriveRoleFromPositions(positions)` — the same "derive from
   real department positions" logic new users get, not a hardcoded fallback like Viewer.
4. If `incomingUid` exists: set that user's `role` to `ROLES.SENIOR_PASTOR`.
5. Write the new `settings/senior_pastor` doc (`pcsEntryId`, `visitorId`, `name`, `email`,
   `linkedUid: incomingUid`, `updatedAt`, `updatedBy`).

Steps 3–5 run as one `writeBatch` after the two reads (email lookup + outgoing user's
positions), so the role changes and the singleton doc update land atomically.

If no `users` account matches the incoming person's email, steps 1–5 still complete —
the badge/highlight applies everywhere immediately, login permissions simply have nothing
to sync to. If that person gets an app account later, a Founder re-running "Set as Senior
Pastor" on them (even though they're already the holder) will pick up the new match.

## UI

`DepartmentHub.jsx`, Caring → PCS tab, the `Chip` component's existing "⋮ More options"
dropdown (currently just "Remove from PCS") gets one more item:

- **"Set as Senior Pastor"** — visible only when `isFounder` is true and this entry isn't
  already the current holder (`!isPastor`). Confirms via `window.confirm()` (the same
pattern the adjacent "Remove from PCS" action already uses in this file):
  *"Make {entry.name} the Senior Pastor, replacing {current holder's name}? This also
  updates their app login permissions if they have an account."* (first-ever assignment
  drops the "replacing" clause). On confirm, calls `assignSeniorPastor`.
- No "remove" action — per the singleton-always-occupied model, the only way to change the
  holder is to assign a different person from their own PCS entry.
- The current holder's entry keeps its existing gold badge/star treatment (`isPastor`)
  exactly as today; the menu simply omits the action there since re-assigning them to
  themselves is a no-op already covered by "first-ever assignment".

Only Founder sees this menu item — a Caring Director without Founder can still see and use
everything else in PCS, this one action is gated because it can silently change someone's
app-wide login permissions, not just a department-scoped setting.

## Making the badge dynamic

`src/utils/seniorPastor.js` keeps `SENIOR_PASTOR_NAME` (now purely a fallback default) but
its exports become backed by live data via a new hook:

```
src/hooks/useSeniorPastor.js
useSeniorPastor() → { name, title: 'Senior Pastor', fullTitle, isSeniorPastorName(candidateName) }
```

Subscribes to `settings/senior_pastor` with `onSnapshot` (mirroring
`subscribeToPastoralRoster`'s existing pattern in `firestore.js`); falls back to the
hardcoded constant when the doc is absent or has no `name`.

Three call sites switch from the static import to the hook, same local variable names so
the diff is small:
- `src/pages/PeopleDirectory.jsx` — the People Directory gold badge
- `src/pages/DepartmentHub.jsx` — the PCS `Chip`'s gold card/star/badge, and the
  "Exempt from cell group assignment" line
- `src/pages/SundayReport.jsx` — attendance roster gold tags (both spots)

No changes needed to `SeniorPastorHub.jsx`, `DepartmentPastorView.jsx`,
`DepartmentPastorUpdates.jsx`, `SundayMinistryPastor.jsx`, `utils/access.js`, or
`utils/cellTabVisibility.js` — those already key off `userProfile.role === 'Senior Pastor'`,
which stays correct automatically once the assignment flow syncs that field.

## Edge cases

- **PCS entry has no email:** the account-linking lookup is skipped; assignment still
  updates the badge/highlight everywhere, just without a login-role sync. Matches the
  "auto-match by email, else badge-only" decision.
- **Two `users` docs share the same email:** treated as "no match" (skip role sync) rather
  than guessing — an ambiguous match is worse than no match here since it would silently
  grant permissions to the wrong account. (In practice this shouldn't happen — `email` is
  the Firebase Auth identifier, so it's already unique per account.)
- **Outgoing holder has no login account (`linkedUid` is null):** step 3 is skipped, only
  the incoming person's role (if matched) is set.
- **Founder re-assigns the same person who already holds it:** `!isPastor` hides the menu
  item on their own entry, so this can't be triggered from the UI; not specifically guarded
  server-side since it's a harmless no-op if it ever happened.
- **PWA/offline:** `assignSeniorPastor`'s writes go through the normal Firestore SDK, so
  they queue and sync like any other write if the Founder is briefly offline — no special
  handling needed.

## Testing

No test suite exists in this repo (per `CLAUDE.md`) — verification is manual in the
browser:
1. As Founder, open a non-holder PCS entry's "⋮" menu → confirm "Set as Senior Pastor"
   appears; confirm it's absent for non-Founder accounts and for the current holder's own
   entry.
2. Assign a PCS entry (with a matching `users` email) as Senior Pastor → confirm their gold
   badge appears in PCS, People Directory, and Sunday Report; confirm their account's role
   becomes `Senior Pastor` in Admin User Management.
3. Re-assign to a different PCS entry → confirm the previous holder's badge disappears
   everywhere and their role reverts to `deriveRoleFromPositions` of their actual positions;
   confirm the new holder's badge/role appear.
4. Assign a PCS entry with no matching `users` email → confirm the badge appears everywhere
   with no error, and no `users` doc is touched.
5. Before ever using the feature (no `settings/senior_pastor` doc): confirm behavior is
   identical to today (hardcoded `Benson K Sunny` still highlighted everywhere).
