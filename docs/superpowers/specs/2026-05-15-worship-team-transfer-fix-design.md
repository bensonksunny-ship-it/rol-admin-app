# Worship Team Transfer Fix Design

## Goal

Fix worship team member transfer (active ↔ former) and save so state stays consistent after every mutation.

## Problem

`DepartmentWorship.jsx` maintains two separate state arrays — `teamMembers` and `formerMembers` — loaded by two Firestore queries. Any mutation that should move a member between the two arrays must update both arrays in sync. When it fails to do so (e.g., `loadTeam()` re-fetches stale data, or an optimistic update only touches one array), the member appears in both lists or neither.

Root causes identified:
1. **Dual state** — two arrays that must be manually kept in sync
2. **`loadTeam()` after Save** — re-fetches Firestore before the write has propagated; can restore a former member to active
3. **`dedupeByName` defined inside component** — closure capture risk in async state updater callbacks
4. **Empty-state check on raw state** — `teamMembers.length === 0` doesn't account for filtered-out former members

## Architecture

Replace the two state arrays with a single `allMembers` array. Derive `activeMembers` and `formerMembers` via `useMemo`. All mutations update `allMembers` in-place with no Firestore re-fetch. The UI always reflects the correct state immediately after any action.

## Components

### `dedupeByName` (moved outside component)

Pure function — no closure risk when referenced inside async state updater callbacks.

```js
function dedupeByName(members) {
  const seen = new Set()
  return members.filter(m => {
    const key = (m.name || '').trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
```

### State declarations

```js
// Remove:
const [teamMembers, setTeamMembers] = useState([])
const [formerMembers, setFormerMembers] = useState([])

// Add:
const [allMembers, setAllMembers] = useState([])

const activeMembers = useMemo(
  () => allMembers
    .filter(m => m.isFormer !== true)
    .sort((a, b) => (b.isWorshipDirector === true) - (a.isWorshipDirector === true)),
  [allMembers]
)

const formerMembers = useMemo(
  () => allMembers
    .filter(m => m.isFormer === true)
    .sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || '')),
  [allMembers]
)
```

### `loadTeam`

Single Firestore query — no filter. Sets `allMembers` once.

```js
async function loadTeam() {
  setLoadingTeam(true)
  setTeamError(null)
  try {
    const all = await getWorshipTeamMembers(DEPARTMENT)
    setAllMembers(dedupeByName(all))
  } catch (e) {
    setTeamError('Failed to load team')
  } finally {
    setLoadingTeam(false)
  }
}
```

### Mutations — all use `setAllMembers`, no `loadTeam()` re-fetch

**Save:**
```js
const patch = {
  name: editMember.name,
  memberSince: editMember.memberSince,
  isWorshipDirector: !!editMember.isWorshipDirector,
  positions: editMember.positions || [],
  ...(editMember.isFormer && { formerSince: editMember.formerSince || '' }),
}
await updateWorshipTeamMember(editMember.id, patch)
setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, ...patch } : m))
setEditMember(null)
```

**Make Former:**
```js
const formerSince = new Date().toISOString().slice(0, 10)
await updateWorshipTeamMember(editMember.id, { isFormer: true, formerSince })
setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: true, formerSince } : m))
setEditMember(null)
```

**Make Active:**
```js
await updateWorshipTeamMember(editMember.id, { isFormer: false, formerSince: '' })
setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: false, formerSince: '' } : m))
setEditMember(null)
```

**Delete:**
```js
await deleteWorshipTeamMember(editMember.id)
setAllMembers(prev => prev.filter(m => m.id !== editMember.id))
setEditMember(null)
```

### Renderer references

- Active table: replace `teamMembers.filter(...)` with `activeMembers` (sorting already in useMemo)
- Former table: replace `formerMembers` state with `formerMembers` useMemo (same name, different source)
- Empty-state guard: `activeMembers.length === 0` (was `teamMembers.length === 0`)

### `getWorshipTeamMembers` in `firestore.js`

Make `options` parameter default to `{}` so calling without arguments returns all members:

```js
export async function getWorshipTeamMembers(department, options = {}) {
  // existing body unchanged
}
```

## Files Changed

- `src/pages/DepartmentWorship.jsx` — primary change (state, loadTeam, mutations, renderers)
- `src/services/firestore.js` — defensive default for options parameter

## Testing

After implementation, verify manually:
1. Mark active member as Former → disappears from active list, appears in former list immediately
2. Mark former member as Active → disappears from former list, appears in active list immediately
3. Edit name/positions → change visible immediately, persists after page refresh
4. Edit formerSince date → change visible immediately
5. Delete member → removed from both lists immediately
6. Reload page → all changes still correct
