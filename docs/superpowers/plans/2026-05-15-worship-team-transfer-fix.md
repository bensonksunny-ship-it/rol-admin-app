# Worship Team Transfer Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix worship team member transfer (active ↔ former) and save by replacing dual state with a single `allMembers` array and `useMemo` derived views.

**Architecture:** Remove `teamMembers` and `formerMembers` useState arrays. Replace with one `allMembers` array loaded by a single Firestore query. Derive `activeMembers` and `formerMembers` via `useMemo`. All four mutations (Save, Make Former, Make Active, Delete) update `allMembers` in-place — no `loadTeam()` re-fetch, no dual-state sync required.

**Tech Stack:** React 18 (useState, useMemo, useEffect), Firestore via `getWorshipTeamMembers` / `updateWorshipTeamMember` / `deleteWorshipTeamMember`

---

## Files Changed

- Modify: `src/pages/DepartmentWorship.jsx` — all state, loadTeam, mutations, renderers
- No changes to `src/services/firestore.js` — `getWorshipTeamMembers` already has `options = {}` default

---

### Task 1: Add `useMemo` import and move `dedupeByName` outside component

**Files:**
- Modify: `src/pages/DepartmentWorship.jsx:1` (import line)
- Modify: `src/pages/DepartmentWorship.jsx:260-268` (dedupeByName inside component)

This task has no behavior change — the app works identically after it. Safe to commit alone.

- [ ] **Step 1: Add `useMemo` to the React import**

At line 1, the current import is:
```js
import { useEffect, useState } from 'react'
```

Change it to:
```js
import { useEffect, useState, useMemo } from 'react'
```

- [ ] **Step 2: Move `dedupeByName` to module scope**

Find `dedupeByName` at lines 260–268 inside the component body:
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

Delete it from inside the component. Add it at module scope immediately above the component function declaration (the line that starts `export default function DepartmentWorship` or `function DepartmentWorship`):

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

- [ ] **Step 3: Verify the app still compiles**

Run: `npm run dev`
Expected: Dev server starts with no errors. Navigate to Worship → Operations → Team. Team members load as before.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DepartmentWorship.jsx
git commit -m "refactor: move dedupeByName to module scope, add useMemo import"
```

---

### Task 2: Replace dual state + update loadTeam + update renderers + update all mutations

**Files:**
- Modify: `src/pages/DepartmentWorship.jsx:205-206` (state declarations)
- Modify: `src/pages/DepartmentWorship.jsx:270-286` (loadTeam)
- Modify: `src/pages/DepartmentWorship.jsx:1163` (empty state check — add member form)
- Modify: `src/pages/DepartmentWorship.jsx:1174` (empty state check — active table)
- Modify: `src/pages/DepartmentWorship.jsx:1190-1192` (active team renderer)
- Modify: `src/pages/DepartmentWorship.jsx:1921-1936` (Save button handler)
- Modify: `src/pages/DepartmentWorship.jsx:1944-1954` (Make Active handler)
- Modify: `src/pages/DepartmentWorship.jsx:1963-1979` (Make Former handler)
- Modify: `src/pages/DepartmentWorship.jsx:1983-1993` (Delete handler)

**Important:** Complete ALL steps before committing. Removing `setTeamMembers`/`setFormerMembers` in step 1 will break the mutation handlers — they must all be updated in this same task before the commit.

- [ ] **Step 1: Replace dual state declarations (lines 205–206)**

Find:
```js
  const [teamMembers, setTeamMembers] = useState([])
  const [formerMembers, setFormerMembers] = useState([])
```

Replace with:
```js
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

Note: `formerMembers` is reused as the useMemo name — this replaces the removed useState. The former members renderer at line 1271 (`formerMembers.map(...)`) works unchanged.

- [ ] **Step 2: Replace `loadTeam` with single-query version (lines 270–286)**

Find:
```js
  async function loadTeam() {
    setLoadingTeam(true)
    setTeamError(null)
    try {
      const current = await getWorshipTeamMembers(DEPARTMENT, { former: false })
      const former = await getWorshipTeamMembers(DEPARTMENT, { former: true })
      setTeamMembers(dedupeByName(current))
      setFormerMembers(dedupeByName(former))
    } catch (e) {
      console.error('Worship team load failed:', e)
      setTeamError(e?.message || 'Could not load team. Check Firestore rules and indexes for worship_team_members.')
      setTeamMembers([])
      setFormerMembers([])
    } finally {
      setLoadingTeam(false)
    }
  }
```

Replace with:
```js
  async function loadTeam() {
    setLoadingTeam(true)
    setTeamError(null)
    try {
      const all = await getWorshipTeamMembers(DEPARTMENT)
      setAllMembers(dedupeByName(all))
    } catch (e) {
      console.error('Worship team load failed:', e)
      setTeamError(e?.message || 'Could not load team. Check Firestore rules and indexes for worship_team_members.')
      setAllMembers([])
    } finally {
      setLoadingTeam(false)
    }
  }
```

- [ ] **Step 3: Fix empty-state check in add member form (line 1163)**

Find:
```js
              {teamMembers.length === 0 && (
```

Replace with:
```js
              {activeMembers.length === 0 && (
```

- [ ] **Step 4: Fix empty-state check in active team table (line 1174)**

Find:
```js
            ) : teamMembers.length === 0 ? (
```

Replace with:
```js
            ) : activeMembers.length === 0 ? (
```

- [ ] **Step 5: Fix active team renderer (lines 1190–1192)**

Find:
```js
                      {[...teamMembers]
                        .filter(m => m.isFormer !== true)
                        .sort((a, b) => (b.isWorshipDirector === true) - (a.isWorshipDirector === true))
                        .map((m, i) => (
```

Replace with:
```js
                      {activeMembers.map((m, i) => (
```

- [ ] **Step 6: Replace Save button handler (lines 1921–1936)**

Find:
```js
                onClick={async () => {
                  try {
                    await updateWorshipTeamMember(editMember.id, {
                      name: editMember.name,
                      memberSince: editMember.memberSince,
                      isWorshipDirector: !!editMember.isWorshipDirector,
                      positions: editMember.positions || [],
                      ...(editMember.isFormer && { formerSince: editMember.formerSince || '' }),
                    })
                    setEditMember(null)
                    await loadTeam()
                  } catch (e) {
                    console.error(e)
                    alert('Failed to update')
                  }
                }}
```

Replace with:
```js
                onClick={async () => {
                  const patch = {
                    name: editMember.name,
                    memberSince: editMember.memberSince,
                    isWorshipDirector: !!editMember.isWorshipDirector,
                    positions: editMember.positions || [],
                    ...(editMember.isFormer && { formerSince: editMember.formerSince || '' }),
                  }
                  try {
                    await updateWorshipTeamMember(editMember.id, patch)
                    setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, ...patch } : m))
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to update')
                  }
                }}
```

- [ ] **Step 7: Replace Make Active handler (lines 1944–1954)**

Find:
```js
                  onClick={async () => {
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: false, formerSince: '' })
                      const updated = { ...editMember, isFormer: false, formerSince: '' }
                      setFormerMembers(prev => prev.filter(m => m.id !== editMember.id))
                      setTeamMembers(prev => dedupeByName([...prev, updated].sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))))
                      setEditMember(null)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to update')
                    }
                  }}
```

Replace with:
```js
                  onClick={async () => {
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: false, formerSince: '' })
                      setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: false, formerSince: '' } : m))
                      setEditMember(null)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to update')
                    }
                  }}
```

- [ ] **Step 8: Replace Make Former handler (lines 1963–1979)**

Find:
```js
                  onClick={async () => {
                    const formerSince = new Date().toISOString().slice(0, 10)
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: true, formerSince })
                      const updated = { ...editMember, isFormer: true, formerSince }
                      setTeamMembers(prev => prev.filter(m => m.id !== editMember.id))
                      setFormerMembers(prev => dedupeByName([...prev, updated].sort((a, b) => (a.memberSince || '').localeCompare(b.memberSince || ''))))
                      setEditMember(null)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to update')
                    }
                  }}
```

Replace with:
```js
                  onClick={async () => {
                    const formerSince = new Date().toISOString().slice(0, 10)
                    try {
                      await updateWorshipTeamMember(editMember.id, { isFormer: true, formerSince })
                      setAllMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, isFormer: true, formerSince } : m))
                      setEditMember(null)
                    } catch (e) {
                      console.error(e)
                      alert('Failed to update')
                    }
                  }}
```

- [ ] **Step 9: Replace Delete handler (lines 1983–1993)**

Find:
```js
                onClick={async () => {
                  if (!confirm('Delete this member permanently?')) return
                  try {
                    await deleteWorshipTeamMember(editMember.id)
                    setTeamMembers(prev => prev.filter(m => m.id !== editMember.id))
                    setFormerMembers(prev => prev.filter(m => m.id !== editMember.id))
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to delete')
                  }
                }}
```

Replace with:
```js
                onClick={async () => {
                  if (!confirm('Delete this member permanently?')) return
                  try {
                    await deleteWorshipTeamMember(editMember.id)
                    setAllMembers(prev => prev.filter(m => m.id !== editMember.id))
                    setEditMember(null)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to delete')
                  }
                }}
```

- [ ] **Step 10: Verify the app compiles with no errors**

Run: `npm run dev`
Expected: Dev server starts with no errors. Navigate to Worship → Operations → Team. Active team members load. Former members load. No console errors.

- [ ] **Step 11: Manual verification — run through all 6 scenarios**

Open the app in the browser. Navigate to Worship → Operations → Team.

1. **Make active member Former:** Click Edit on an active member → click "Make former". Expected: member disappears from active list immediately, appears in former members list immediately.

2. **Make former member Active:** Click Edit on a former member → click "Make active". Expected: member disappears from former list immediately, appears in active list immediately.

3. **Edit name/positions:** Click Edit on any member → change the name or toggle a position → click Save. Expected: change visible in the table immediately. Reload the page — change persists.

4. **Edit formerSince date:** Click Edit on a former member → change "Former since" date → click Save. Expected: new date shown in "Till" column immediately. Reload — persists.

5. **Delete member:** Click Edit → Delete → confirm. Expected: member removed from whichever list immediately.

6. **Reload test:** After any of the above, reload the page. All changes still correct — no member appearing in both lists.

- [ ] **Step 12: Commit**

```bash
git add src/pages/DepartmentWorship.jsx
git commit -m "fix: replace dual state with allMembers in-place mutations — fixes transfer and save"
```
