# Cell Director Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Cell Director's Summary tab with a cockpit layout (stat cards, approval cards with reason, unassigned visitor tracker with cell assignment, and integrated charts), and add a reason modal to the leader deactivation flow.

**Architecture:** New `CellDirectorCockpit.jsx` component owns all cockpit UI and data fetching for the summary tab; `DepartmentHub.jsx` replaces its cell pending-changes table block with a single `<CellDirectorCockpit>` render. `ShepherdView.jsx` gets a reason modal for non-director deactivations. One new Firestore function (`getRecentSundayReports`) feeds the unassigned visitors feature.

**Tech Stack:** React 19, Vite, Firebase Firestore, Tailwind CSS v4, Recharts

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/services/firestore.js` | Modify | Add `getRecentSundayReports(n)`, add `reason` to `addCellMemberPendingChange` payload and `getCellMemberPendingChanges` return shape |
| `src/components/DirectorDashboard.jsx` | Modify | Add `CellMemberGrowthChart` component, add `BarChart/Bar/Cell` to recharts imports |
| `src/pages/ShepherdView.jsx` | Modify | Replace `window.confirm` non-director deactivation path with a reason modal |
| `src/components/CellDirectorCockpit.jsx` | Create | Entire cockpit UI: stat cards, approval cards, unassigned drawer with assign dropdown |
| `src/pages/DepartmentHub.jsx` | Modify | Import `CellDirectorCockpit`, replace cell pending-changes block (lines 884–969) with component |

---

## Task 1: Firestore — `getRecentSundayReports` + `reason` field

**Files:**
- Modify: `src/services/firestore.js`

- [ ] **Step 1: Add `getRecentSundayReports` after `getSundayReport` (~line 2163)**

  Find the closing brace of `getSundayReport` and insert immediately after it:

  ```js
  export async function getRecentSundayReports(numWeeks = 8) {
    if (!db) return []
    const today = new Date()
    const lastSunday = new Date(today)
    lastSunday.setDate(today.getDate() - today.getDay())
    const dateStrings = Array.from({ length: numWeeks }, (_, i) => {
      const d = new Date(lastSunday)
      d.setDate(lastSunday.getDate() - i * 7)
      return d.toISOString().slice(0, 10)
    })
    const snaps = await Promise.all(
      dateStrings.map((dateStr) => getDoc(doc(db, SUNDAY_REPORTS_COLLECTION, dateStr)))
    )
    return snaps
      .filter((snap) => snap.exists())
      .map((snap) => {
        const data = snap.data()
        return {
          id: snap.id,
          date: snap.id,
          secondWeekAttendeesNames: Array.isArray(data.secondWeekAttendeesNames)
            ? data.secondWeekAttendeesNames.map((n) => String(n).trim()).filter(Boolean)
            : [],
        }
      })
  }
  ```

- [ ] **Step 2: Add `reason` to `addCellMemberPendingChange` payload (~line 1492)**

  Find the line `if (data.changeSummary != null) payload.changeSummary = data.changeSummary` inside `addCellMemberPendingChange`. Add the reason line directly after it:

  ```js
  if (data.changeSummary != null) payload.changeSummary = data.changeSummary
  if (data.reason != null) payload.reason = String(data.reason)
  ```

- [ ] **Step 3: Add `reason` to `getCellMemberPendingChanges` return shape (~line 1511)**

  Find the return object inside the `.map()` in `getCellMemberPendingChanges`. Add `reason` to the returned object:

  ```js
  return {
    id: d.id,
    changeType: data.changeType || '',
    changeSummary: data.changeSummary || '',
    reason: data.reason || '',          // ← add this line
    cellId: data.cellId || '',
    cellName: data.cellName || '',
    memberId: data.memberId || '',
    memberData: data.memberData || null,
    requestedBy: data.requestedBy || '',
    requestedAt: toDate(data.requestedAt),
    status: data.status || 'pending',
  }
  ```

- [ ] **Step 4: Verify in browser**

  Open the app, open DevTools → Console. No errors expected. No UI change yet.

- [ ] **Step 5: Commit**

  ```bash
  git add src/services/firestore.js
  git commit -m "feat: add getRecentSundayReports and reason field to pending changes"
  ```

---

## Task 2: `CellMemberGrowthChart` in `DirectorDashboard.jsx`

**Files:**
- Modify: `src/components/DirectorDashboard.jsx`

- [ ] **Step 1: Add `BarChart`, `Bar`, `Cell` to the recharts import at the top of the file**

  Current import (line 2–12):
  ```js
  import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
  } from 'recharts'
  ```

  Replace with:
  ```js
  import {
    LineChart,
    Line,
    BarChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
  } from 'recharts'
  ```

- [ ] **Step 2: Add `CellMemberGrowthChart` as a named export just before the `export default` line at the bottom of the file**

  Add this block before `export default DirectorDashboardCellWidgets`:

  ```jsx
  export function CellMemberGrowthChart({ cellMemberData }) {
    if (!cellMemberData?.length) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-1">Active members per cell</h2>
          <p className="text-sm text-slate-500">No cell data available.</p>
        </div>
      )
    }
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-1">Active members per cell</h2>
        <p className="text-sm text-slate-500 mb-4">
          Current active member count across all cells you oversee.
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={cellMemberData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="cellName" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="memberCount" radius={[4, 4, 0, 0]}>
              {cellMemberData.map((entry, i) => (
                <Cell key={i} fill={entry.memberCount >= 20 ? '#6366f1' : '#c7d2fe'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify in browser**

  No UI change yet (component not yet used). No console errors expected.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/DirectorDashboard.jsx
  git commit -m "feat: add CellMemberGrowthChart to DirectorDashboard"
  ```

---

## Task 3: Leader Deactivation Reason Modal in `ShepherdView.jsx`

**Files:**
- Modify: `src/pages/ShepherdView.jsx`

- [ ] **Step 1: Add three new state variables inside `MyFellowshipTab` (after the existing `const [toast, setToast]` line ~line 783)**

  ```js
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [deactivateReason, setDeactivateReason] = useState('')
  const [submittingDeactivate, setSubmittingDeactivate] = useState(false)
  ```

- [ ] **Step 2: Replace `handleDeactivate` (~line 879) with the new version**

  Remove the entire existing `handleDeactivate` async function and replace with:

  ```js
  const handleDeactivate = (member) => {
    if (!selectedCellId) return
    if (isDirector) {
      if (!window.confirm(`Deactivate ${member.name}? They will move to the Inactive list.`)) return
      updateCellGroupMember(selectedCellId, member.id, { status: 'inactive' })
        .then(() => { showToastMsg(`${member.name} moved to Inactive.`); refreshMembers(selectedCellId) })
        .catch(() => showToastMsg('Failed to deactivate.', 'error'))
    } else {
      setDeactivateTarget(member)
      setDeactivateReason('')
    }
  }

  const handleSubmitDeactivateRequest = async () => {
    if (!deactivateTarget || !selectedCellId || deactivateReason.trim().length < 10) return
    setSubmittingDeactivate(true)
    try {
      await addCellMemberPendingChange({
        changeType: 'deactivate',
        cellId: selectedCellId,
        memberId: deactivateTarget.id,
        memberData: {
          name: deactivateTarget.name,
          phone: deactivateTarget.phone || '',
          locality: deactivateTarget.locality || '',
        },
        requestedBy: userProfile?.name || userProfile?.email || 'Cell Leader',
        requestedByUid: userProfile?.id || '',
        reason: deactivateReason.trim(),
      })
      setPendingDeactivationIds((prev) => new Set([...prev, deactivateTarget.id]))
      showToastMsg(`Deactivation request submitted for ${deactivateTarget.name}. Awaiting Director approval.`)
      setDeactivateTarget(null)
      setDeactivateReason('')
    } catch {
      showToastMsg('Failed to submit request.', 'error')
    } finally {
      setSubmittingDeactivate(false)
    }
  }
  ```

- [ ] **Step 3: Add the deactivation reason modal to the JSX return of `MyFellowshipTab`**

  Find the closing `</div>` of the Transfer Modal block (the last modal, after the `{transferState && ...}` block). Add the new modal directly after it, before the final closing `</div>` of the component:

  ```jsx
  {deactivateTarget && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div>
          <h3 className="font-bold text-slate-900">Request Deactivation</h3>
          <p className="text-sm text-slate-600 mt-0.5">
            For <strong>{deactivateTarget.name}</strong> · A Director will review and approve this.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1.5">
            Reason for deactivation <span className="text-red-500">*</span>
          </label>
          <textarea
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
            placeholder="e.g. Relocated, backslidden, long absence…"
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            autoFocus
          />
          <p className="text-xs text-slate-400 mt-1">
            {deactivateReason.trim().length} / 10 characters minimum
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSubmitDeactivateRequest}
            disabled={submittingDeactivate || deactivateReason.trim().length < 10}
            className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {submittingDeactivate ? 'Submitting…' : 'Submit Request'}
          </button>
          <button
            type="button"
            onClick={() => setDeactivateTarget(null)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )}
  ```

- [ ] **Step 4: Verify in browser**

  Log in as a Cell Leader. Open Shepherd Dashboard → My Fellowship tab. Click "Deactivate" on any active member. The reason modal should appear. Entering fewer than 10 characters keeps the Submit button disabled. After entering a reason and submitting, the member badge shows "⏳ Pending Deactivation" and the modal closes.

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/ShepherdView.jsx
  git commit -m "feat: add reason modal to leader deactivation request flow"
  ```

---

## Task 4: Create `CellDirectorCockpit.jsx` — stat cards + approval cards

**Files:**
- Create: `src/components/CellDirectorCockpit.jsx`

- [ ] **Step 1: Create the file with imports, state, and data-loading logic**

  ```jsx
  import { useEffect, useState, useMemo, useCallback } from 'react'
  import {
    getCellGroupMembers,
    getRecentSundayReports,
    addCellGroupMember,
    updateCellGroupMember,
    deleteCellMemberPendingChange,
  } from '../services/firestore'
  import DirectorDashboardCellWidgets, { CellMemberGrowthChart } from './DirectorDashboard'

  function initials(name) {
    return String(name || '')
      .split(' ')
      .slice(0, 2)
      .map((w) => (w[0] || '').toUpperCase())
      .join('')
  }

  export function CellDirectorCockpit({
    userProfile,
    cellGroups,
    cellPendingChanges,
    loadingCellPending,
    onChangeResolved,
  }) {
    // ── Member data (feeds Total Members stat + growth chart + cross-reference) ──
    const [cellMemberData, setCellMemberData] = useState([])
    const [loadingMembers, setLoadingMembers] = useState(true)

    // ── Unassigned visitors ────────────────────────────────────────────────────
    const [unassignedVisitors, setUnassignedVisitors] = useState([])
    const [loadingUnassigned, setLoadingUnassigned] = useState(true)
    const [assignedNames, setAssignedNames] = useState(new Set())

    // ── Drawer / assign state ──────────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [assignOpenName, setAssignOpenName] = useState(null)
    const [assignSelectedCellId, setAssignSelectedCellId] = useState('')
    const [assigning, setAssigning] = useState(false)

    // ── Toast ──────────────────────────────────────────────────────────────────
    const [toast, setToast] = useState(null)
    const showToast = useCallback((msg, type = 'success') => {
      setToast({ msg, type })
      setTimeout(() => setToast(null), 3500)
    }, [])

    const activeCells = useMemo(
      () => cellGroups.filter((g) => g.status !== 'inactive'),
      [cellGroups]
    )

    // Load all active members for every cell (shared fetch)
    useEffect(() => {
      if (activeCells.length === 0) {
        setCellMemberData([])
        setLoadingMembers(false)
        return
      }
      setLoadingMembers(true)
      Promise.all(
        activeCells.map(async (g) => {
          const members = await getCellGroupMembers(g.id)
          const active = members.filter((m) => m.status !== 'inactive')
          const rawName = g.cellName || g.id
          return {
            cellId: g.id,
            cellName: rawName.length > 14 ? `${rawName.slice(0, 12)}…` : rawName,
            memberCount: active.length,
            names: active
              .map((m) => String(m.name || '').trim().toLowerCase())
              .filter(Boolean),
          }
        })
      )
        .then(setCellMemberData)
        .catch(() => setCellMemberData([]))
        .finally(() => setLoadingMembers(false))
    }, [activeCells])

    const totalMembers = useMemo(
      () => cellMemberData.reduce((s, c) => s + c.memberCount, 0),
      [cellMemberData]
    )
    const memberNamesSet = useMemo(
      () => new Set(cellMemberData.flatMap((c) => c.names)),
      [cellMemberData]
    )
    const growthData = useMemo(
      () => cellMemberData.map(({ cellName, memberCount }) => ({ cellName, memberCount })),
      [cellMemberData]
    )

    // Load unassigned visitors from last 8 Sunday reports, cross-check member names
    useEffect(() => {
      if (loadingMembers) return
      setLoadingUnassigned(true)
      getRecentSundayReports(8)
        .then((reports) => {
          const nameMap = new Map()
          for (const report of reports) {
            for (const raw of report.secondWeekAttendeesNames) {
              const key = raw.trim().toLowerCase()
              if (!key) continue
              if (!nameMap.has(key)) nameMap.set(key, { name: raw.trim(), weekCount: 0 })
              nameMap.get(key).weekCount++
            }
          }
          const unassigned = []
          for (const [key, entry] of nameMap) {
            if (!memberNamesSet.has(key)) unassigned.push(entry)
          }
          unassigned.sort((a, b) => b.weekCount - a.weekCount)
          setUnassignedVisitors(unassigned)
        })
        .catch(() => setUnassignedVisitors([]))
        .finally(() => setLoadingUnassigned(false))
    }, [loadingMembers, memberNamesSet])

    const visibleUnassigned = useMemo(
      () => unassignedVisitors.filter((v) => !assignedNames.has(v.name.toLowerCase())),
      [unassignedVisitors, assignedNames]
    )

    // Approve: apply the change in Firestore, then notify parent to remove from list
    const handleApprove = useCallback(
      async (change) => {
        try {
          if (change.changeType === 'add' && change.memberData) {
            await addCellGroupMember(change.cellId, change.memberData)
          } else if (change.changeType === 'edit' && change.memberId && change.memberData) {
            await updateCellGroupMember(change.cellId, change.memberId, { ...change.memberData })
          } else if (change.changeType === 'deactivate' && change.memberId) {
            await updateCellGroupMember(change.cellId, change.memberId, { status: 'inactive' })
          } else if (change.changeType === 'activate' && change.memberId) {
            await updateCellGroupMember(change.cellId, change.memberId, { status: 'active' })
          }
          await deleteCellMemberPendingChange(change.id)
          onChangeResolved(change.id)
          showToast(`${change.memberData?.name || 'Member'} — request approved.`)
        } catch {
          showToast('Approval failed. Please try again.', 'error')
        }
      },
      [onChangeResolved, showToast]
    )

    // Reject: just delete the pending change record
    const handleReject = useCallback(
      async (change) => {
        try {
          await deleteCellMemberPendingChange(change.id)
          onChangeResolved(change.id)
          showToast(`Request for ${change.memberData?.name || 'member'} rejected.`)
        } catch {
          showToast('Rejection failed. Please try again.', 'error')
        }
      },
      [onChangeResolved, showToast]
    )

    // Assign visitor to a cell
    const handleAssign = useCallback(async (visitorName) => {
      if (!assignSelectedCellId) return
      setAssigning(true)
      try {
        await addCellGroupMember(assignSelectedCellId, { name: visitorName, status: 'active' })
        setAssignedNames((prev) => new Set([...prev, visitorName.toLowerCase()]))
        const cellName =
          activeCells.find((c) => c.id === assignSelectedCellId)?.cellName || 'cell'
        showToast(`${visitorName} added to ${cellName}.`)
        setAssignOpenName(null)
        setAssignSelectedCellId('')
      } catch {
        showToast('Failed to assign. Please try again.', 'error')
      } finally {
        setAssigning(false)
      }
    }, [assignSelectedCellId, activeCells, showToast])
  ```

- [ ] **Step 2: Add the JSX return (continuation of same file)**

  ```jsx
    return (
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white shadow-lg text-sm font-medium ${
              toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* ── 4 Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-amber-900">
              {loadingCellPending ? '—' : cellPendingChanges.length}
            </div>
            <div className="text-xs font-semibold text-amber-700 mt-1">⏳ Pending Approvals</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-900">{activeCells.length}</div>
            <div className="text-xs font-semibold text-emerald-700 mt-1">🏘 Active Cells</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-blue-900">
              {loadingMembers ? '—' : totalMembers}
            </div>
            <div className="text-xs font-semibold text-blue-700 mt-1">👥 Total Members</div>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-center hover:bg-violet-100 transition-all"
          >
            <div className="text-2xl font-black text-violet-900">
              {loadingUnassigned ? '—' : visibleUnassigned.length}
            </div>
            <div className="text-xs font-semibold text-violet-700 mt-1">🔍 Unassigned</div>
            <div className="text-xs text-violet-400 mt-0.5">tap to view ↗</div>
          </button>
        </div>

        {/* ── Pending Member Changes ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              ⏳ Pending Member Changes
            </h3>
            {!loadingCellPending && cellPendingChanges.length > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {cellPendingChanges.length}
              </span>
            )}
          </div>
          {loadingCellPending ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : cellPendingChanges.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-400">
              No pending member changes.
            </div>
          ) : (
            <div className="space-y-3">
              {cellPendingChanges.map((change) => (
                <div
                  key={change.id}
                  className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900">
                        {change.memberData?.name || '—'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        👤 Leader: <strong>{change.requestedBy || '—'}</strong>
                        {' · '}🏘 {change.cellName || '—'}
                      </p>
                    </div>
                    <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex-shrink-0 uppercase">
                      {change.changeType}
                    </span>
                  </div>
                  {change.reason ? (
                    <div className="bg-amber-100/70 border-l-4 border-amber-400 rounded-r-lg px-3 py-2 text-xs text-amber-900 italic">
                      &ldquo;{change.reason}&rdquo;
                    </div>
                  ) : null}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleApprove(change)}
                      className="flex-1 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition"
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(change)}
                      className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition"
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Cell Growth Chart ── */}
        {!loadingMembers && growthData.length > 0 && (
          <CellMemberGrowthChart cellMemberData={growthData} />
        )}

        {/* ── Attendance trends + missing reports (existing widgets) ── */}
        <DirectorDashboardCellWidgets userProfile={userProfile} />
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify in browser**

  Log in as a Director. Navigate to the Cell department → Summary tab. You should see 4 stat cards, the approval cards section (empty state if no pending changes), the cell growth bar chart, and the attendance/missing-reports widgets. Check the browser console for no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/CellDirectorCockpit.jsx
  git commit -m "feat: CellDirectorCockpit — stat cards, approval cards, growth chart"
  ```

---

## Task 5: Add Unassigned Visitors Drawer to `CellDirectorCockpit.jsx`

**Files:**
- Modify: `src/components/CellDirectorCockpit.jsx`

- [ ] **Step 1: Add the drawer JSX as the last child inside the `<div className="space-y-6">` return, after the `<DirectorDashboardCellWidgets>` line**

  ```jsx
        {/* ── Unassigned Visitors Drawer ── */}
        {drawerOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDrawerOpen(false)
            }}
          >
            <div className="bg-white rounded-t-3xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900">
                    🔍 Unassigned Repeat Visitors
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Attended 2+ Sundays · Not yet in any cell · Sourced from Sunday Reports
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>

              {/* Drawer body */}
              <div className="overflow-y-auto p-4 space-y-3 flex-1">
                {loadingUnassigned ? (
                  <p className="text-sm text-slate-500 text-center py-10">Loading…</p>
                ) : visibleUnassigned.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-10">
                    No unassigned repeat visitors found.
                  </p>
                ) : (
                  visibleUnassigned.map((visitor) => (
                    <div key={visitor.name} className="relative">
                      <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                          {initials(visitor.name)}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-sm">{visitor.name}</p>
                          <p className="text-xs text-violet-600 font-semibold">
                            🗓 {visitor.weekCount} Sunday{visitor.weekCount !== 1 ? 's' : ''} attended
                          </p>
                        </div>
                        {/* Assign button */}
                        <button
                          type="button"
                          onClick={() => {
                            setAssignOpenName(
                              assignOpenName === visitor.name ? null : visitor.name
                            )
                            setAssignSelectedCellId('')
                          }}
                          className="px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 flex-shrink-0 transition"
                        >
                          Assign {assignOpenName === visitor.name ? '▲' : '▼'}
                        </button>
                      </div>

                      {/* Inline cell-selector dropdown */}
                      {assignOpenName === visitor.name && (
                        <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl z-10 overflow-hidden">
                          <p className="text-xs font-bold text-slate-400 uppercase px-3 py-2 border-b border-slate-100">
                            Choose a cell group
                          </p>
                          <div className="max-h-48 overflow-y-auto">
                            {activeCells.map((cell) => (
                              <button
                                key={cell.id}
                                type="button"
                                onClick={() => setAssignSelectedCellId(cell.id)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition ${
                                  assignSelectedCellId === cell.id
                                    ? 'bg-violet-50 text-violet-700 font-semibold'
                                    : 'text-slate-700 hover:bg-violet-50'
                                }`}
                              >
                                <span>{cell.cellName || cell.id}</span>
                                {assignSelectedCellId === cell.id && <span>✓</span>}
                              </button>
                            ))}
                          </div>
                          <div className="p-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleAssign(visitor.name)}
                              disabled={!assignSelectedCellId || assigning}
                              className="w-full py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 disabled:opacity-40 transition"
                            >
                              {assigning
                                ? 'Adding…'
                                : assignSelectedCellId
                                ? `✓ Add to ${
                                    activeCells.find((c) => c.id === assignSelectedCellId)
                                      ?.cellName || 'Cell'
                                  }`
                                : 'Select a cell first'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}

                <p className="text-xs text-slate-400 text-center pt-2">
                  Data from <code>sunday_reports → secondWeekAttendeesNames</code>.
                  Updates each Sunday when the Sunday Report is saved.
                </p>
              </div>
            </div>
          </div>
        )}
  ```

- [ ] **Step 2: Verify in browser as Director**

  - Click the purple "Unassigned" stat card → drawer slides up from bottom
  - If no Sunday reports have `secondWeekAttendeesNames`, the empty state shows
  - Click "Assign ▼" on a visitor → dropdown shows all active cells
  - Select a cell → button label updates to "✓ Add to [Cell Name]"
  - Click confirm → visitor card turns green "Assigned", count on stat card decrements
  - Click backdrop or ✕ button → drawer closes

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/CellDirectorCockpit.jsx
  git commit -m "feat: add unassigned visitors drawer with cell assign dropdown"
  ```

---

## Task 6: Wire `CellDirectorCockpit` into `DepartmentHub.jsx`

**Files:**
- Modify: `src/pages/DepartmentHub.jsx`

- [ ] **Step 1: Add import at the top of `DepartmentHub.jsx` (after the existing component imports around line 74–76)**

  ```js
  import { CellDirectorCockpit } from '../components/CellDirectorCockpit'
  ```

- [ ] **Step 2: Add `onChangeResolved` callback near where `cellPendingChanges` state is used**

  Find where `cellPendingChanges` and `setCellPendingChanges` are declared (~line 185). Directly after the state declaration, add:

  ```js
  const handleCellChangeResolved = useCallback(
    (id) => setCellPendingChanges((prev) => prev.filter((x) => x.id !== id)),
    []
  )
  ```

  Note: `useCallback` is already imported in `DepartmentHub.jsx` (it uses React hooks throughout).

- [ ] **Step 3: Replace the cell pending-changes block (lines 884–969)**

  Find this exact block in the summary tab (it starts immediately after the Work Cockpit header card closing `</div>` at line 883):

  ```jsx
              {slug === 'cell' ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-800 mb-3">Pending For Review</h2>
                  ...long table block...
                </div>
              ) : slug === 'd-light' ? (
  ```

  Replace only the `slug === 'cell'` branch (the opening `(` through the closing `</div>` before `) : slug === 'd-light'`):

  **Before (lines 884–969):**
  ```jsx
              {slug === 'cell' ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-slate-800 mb-3">Pending For Review</h2>
                  <p className="text-sm text-slate-600 mb-4">Member change requests from Cell Leaders. Approve or deny each request.</p>
                  {loadingCellPending ? (
                    <p className="text-sm text-slate-500">Loading…</p>
                  ) : cellPendingChanges.length === 0 ? (
                    <p className="text-sm text-slate-500">No pending member changes.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        ...entire table...
                      </table>
                    </div>
                  )}
                </div>
  ```

  **After:**
  ```jsx
              {slug === 'cell' ? (
                <CellDirectorCockpit
                  userProfile={userProfile}
                  cellGroups={cellGroups}
                  cellPendingChanges={cellPendingChanges}
                  loadingCellPending={loadingCellPending}
                  onChangeResolved={handleCellChangeResolved}
                />
  ```

  Everything from `) : slug === 'd-light' ? (` onwards stays unchanged.

- [ ] **Step 4: Verify `useCallback` import is present**

  Search for `useCallback` in the import from 'react' at the top of `DepartmentHub.jsx`. If it's missing, add it to the destructured import.

- [ ] **Step 5: Verify in browser as Director**

  Navigate to Cell department → Summary tab. Confirm:
  - 4 stat cards render (Pending Approvals, Active Cells, Total Members, Unassigned)
  - Approval cards show with reason if any exist (use the Leader flow from Task 3 to create one)
  - Approve/Reject buttons work and remove the card immediately
  - Cell Growth bar chart renders
  - Weekly attendance line chart and missing reports table render below
  - Unassigned drawer opens on click and assign flow works

- [ ] **Step 6: Verify no regressions**

  - Other departments' summary tab (non-cell slugs) still shows the generic Summary/Tasks view
  - d-light slug still shows its summary
  - Cell Report tab, Shepherd tab, Back to Bible tab all work normally
  - Accounts department unaffected

- [ ] **Step 7: Commit**

  ```bash
  git add src/pages/DepartmentHub.jsx
  git commit -m "feat: wire CellDirectorCockpit into DepartmentHub summary tab"
  ```

---

## Self-Review

**Spec coverage check:**
- [x] §1.1 — 4 stat cards including Unassigned: Task 4 Step 2
- [x] §1.2 — Approval cards with reason, Approve/Reject: Task 4 Steps 1–2
- [x] §1.3 — Unassigned drawer with assign dropdown: Task 5
- [x] §1.4 — CellMemberGrowthChart: Task 2
- [x] §1.5 — DirectorDashboardCellWidgets integrated: Task 4 Step 2
- [x] §2 — Leader reason modal: Task 3
- [x] §3 — `getRecentSundayReports`: Task 1
- [x] Shared member fetch (one batch, not two): Task 4 Step 1 uses one `Promise.all`
- [x] Only `activeTab === 'summary'` Work Cockpit block touched: Task 6 Step 3

**No placeholders found.** All steps have complete code.

**Type consistency:** `CellMemberGrowthChart` receives `cellMemberData` (array of `{ cellName, memberCount }`) — defined in Task 2 Step 2 and supplied in Task 4 Step 2. `onChangeResolved(id: string)` — defined in Task 6 Step 2 and called in Task 4 Steps 1–2 via `handleApprove`/`handleReject`. All match.
