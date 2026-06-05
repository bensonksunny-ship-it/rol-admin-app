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

const CHANGE_TYPE_STYLES = {
  add:        'bg-emerald-100 text-emerald-700',
  deactivate: 'bg-red-100 text-red-700',
  activate:   'bg-blue-100 text-blue-700',
  edit:       'bg-slate-100 text-slate-600',
}

export function CellDirectorCockpit({
  userProfile,
  cellGroups,
  cellPendingChanges,
  loadingCellPending,
  onChangeResolved,
}) {
  const [cellMemberData, setCellMemberData] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(true)

  const [unassignedVisitors, setUnassignedVisitors] = useState([])
  const [loadingUnassigned, setLoadingUnassigned] = useState(true)
  const [assignedNames, setAssignedNames] = useState(new Set())

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [assignOpenName, setAssignOpenName] = useState(null)
  const [assignSelectedCellId, setAssignSelectedCellId] = useState('')
  const [assigning, setAssigning] = useState(false)

  const [toast, setToast] = useState(null)
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const activeCells = useMemo(
    () => (cellGroups || []).filter((g) => g.status !== 'inactive'),
    [cellGroups]
  )

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

  const handleApprove = useCallback(
    async (change) => {
      try {
        if (change.changeType === 'deactivate' && change.memberId) {
          await updateCellGroupMember(change.cellId, change.memberId, { status: 'inactive' })
        } else if (change.changeType === 'activate' && change.memberId) {
          await updateCellGroupMember(change.cellId, change.memberId, { status: 'active' })
        } else if (change.changeType === 'edit' && change.memberId && change.memberData) {
          await updateCellGroupMember(change.cellId, change.memberId, { ...change.memberData })
        } else if (change.changeType === 'add' && change.memberData) {
          await addCellGroupMember(change.cellId, change.memberData)
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

  const handleAssign = useCallback(
    async (visitorName) => {
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
    },
    [assignSelectedCellId, activeCells, showToast]
  )

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-white shadow-xl text-sm font-semibold ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-base mb-3">⏳</div>
          <p className="text-2xl font-black text-slate-800">{loadingCellPending ? '—' : cellPendingChanges.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Pending Approvals</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-base mb-3">🏘</div>
          <p className="text-2xl font-black text-slate-800">{activeCells.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Active Cells</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-base mb-3">👥</div>
          <p className="text-2xl font-black text-slate-800">{loadingMembers ? '—' : totalMembers}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Total Members</p>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left hover:border-violet-200 hover:shadow-md transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-base mb-3 group-hover:bg-violet-200 transition-colors">🔍</div>
          <p className="text-2xl font-black text-slate-800">{loadingUnassigned ? '—' : visibleUnassigned.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Unassigned</p>
          <p className="text-xs text-violet-500 font-semibold mt-1">Tap to view →</p>
        </button>
      </div>

      {/* ── Pending Member Changes ── */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <p className="text-sm font-bold text-slate-800">Pending Member Changes</p>
          {!loadingCellPending && cellPendingChanges.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {cellPendingChanges.length}
            </span>
          )}
        </div>

        {loadingCellPending ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">Loading…</div>
        ) : cellPendingChanges.length === 0 ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">
            All caught up — no pending changes.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {cellPendingChanges.map((change) => (
              <div key={change.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {(change.memberData?.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{change.memberData?.name || '—'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {change.requestedBy || '—'} · {change.cellName || '—'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 uppercase tracking-wide ${CHANGE_TYPE_STYLES[change.changeType] || 'bg-slate-100 text-slate-600'}`}>
                    {change.changeType}
                  </span>
                </div>

                {change.reason && (
                  <div className="bg-amber-50 border-l-4 border-amber-300 rounded-r-lg px-3 py-2 text-xs text-amber-800 italic">
                    "{change.reason}"
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(change)}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(change)}
                    className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cell Member Growth Chart ── */}
      {!loadingMembers && growthData.length > 0 && (
        <CellMemberGrowthChart cellMemberData={growthData} />
      )}

      {/* ── Attendance trends + missing reports ── */}
      <DirectorDashboardCellWidgets userProfile={userProfile} />

      {/* ── Unassigned Visitors Drawer ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false) }}
        >
          <div className="bg-white rounded-t-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">Unassigned Repeat Visitors</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Attended 2+ Sundays · Not yet in any cell · From Sunday Reports
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* Drawer body */}
            <div className="overflow-y-auto p-4 space-y-2 flex-1">
              {loadingUnassigned ? (
                <p className="text-sm text-slate-500 text-center py-10">Loading…</p>
              ) : visibleUnassigned.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  No unassigned repeat visitors found.
                </p>
              ) : (
                visibleUnassigned.map((visitor) => (
                  <div key={visitor.name} className="relative">
                    <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
                      <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                        {initials(visitor.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{visitor.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {visitor.weekCount} Sunday{visitor.weekCount !== 1 ? 's' : ''} attended
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignOpenName(assignOpenName === visitor.name ? null : visitor.name)
                          setAssignSelectedCellId('')
                        }}
                        className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-xl hover:bg-violet-700 flex-shrink-0 transition-colors"
                      >
                        Assign {assignOpenName === visitor.name ? '▲' : '▼'}
                      </button>
                    </div>

                    {assignOpenName === visitor.name && (
                      <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl z-10 overflow-hidden">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-3 py-2 border-b border-slate-100">
                          Choose a cell group
                        </p>
                        <div className="max-h-48 overflow-y-auto">
                          {activeCells.map((cell) => (
                            <button
                              key={cell.id}
                              type="button"
                              onClick={() => setAssignSelectedCellId(cell.id)}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                                assignSelectedCellId === cell.id
                                  ? 'bg-violet-50 text-violet-700 font-semibold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{cell.cellName || cell.id}</span>
                              {assignSelectedCellId === cell.id && <span className="text-violet-600">✓</span>}
                            </button>
                          ))}
                        </div>
                        <div className="p-3 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleAssign(visitor.name)}
                            disabled={!assignSelectedCellId || assigning}
                            className="w-full py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors"
                          >
                            {assigning
                              ? 'Adding…'
                              : assignSelectedCellId
                              ? `Add to ${activeCells.find((c) => c.id === assignSelectedCellId)?.cellName || 'Cell'}`
                              : 'Select a cell first'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              <p className="text-xs text-slate-400 text-center pt-2">
                Updated each Sunday when the Sunday Report is saved.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
